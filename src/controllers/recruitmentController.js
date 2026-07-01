const db     = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const genId  = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 6);

exports.createKey = async (req, res) => {
    try {
        const { vacancy_title, department, expires_in_days } = req.body;
        if (!vacancy_title || !department) return res.status(400).json({ message: 'Vacancy title and department required.' });

        const year     = new Date().getFullYear();
        const rand     = Math.random().toString(36).substr(2, 4).toUpperCase();
        const key_code = `RCT-${year}-${department.substr(0, 3).toUpperCase()}-${rand}`;
        const exp      = new Date(); exp.setDate(exp.getDate() + (parseInt(expires_in_days) || 7));

        const id = genId();
        const created_at = new Date().toISOString();
        await db.query(
            `INSERT INTO recruitment_keys (id, key_code, vacancy_title, department, expires_at, is_active, created_by, created_at)
             VALUES ($1,$2,$3,$4,$5,true,$6,$7)`,
            [id, key_code, vacancy_title, department, exp.toISOString(), req.user.id, created_at]
        );

        await db.query(
            'INSERT INTO audit_log (id, actor_id, action, details, created_at) VALUES ($1,$2,$3,$4,now())',
            [genId(), req.user.id, 'KEY_CREATED', `${key_code}: ${vacancy_title}`]
        );

        res.status(201).json({
            message: 'Key created.',
            key: { id, key_code, vacancy_title, department, expires_at: exp.toISOString(), is_active: true, created_by: req.user.id, created_at }
        });
    } catch (err) { console.error('createKey:', err.message); res.status(500).json({ error: err.message }); }
};

exports.getKeys = async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM recruitment_keys ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.deactivateKey = async (req, res) => {
    try {
        await db.query('UPDATE recruitment_keys SET is_active = false WHERE id = $1', [req.params.id]);
        res.json({ message: 'Key deactivated.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.validateKey = async (req, res) => {
    try {
        const { key_code } = req.body;
        if (!key_code) return res.status(400).json({ message: 'Key code required.' });

        const { rows } = await db.query(
            `SELECT * FROM recruitment_keys WHERE key_code = $1 AND is_active = true`,
            [key_code.toUpperCase()]
        );
        const key = rows[0];
        if (!key) return res.status(404).json({ message: 'Invalid or inactive recruitment key.' });
        if (new Date() > new Date(key.expires_at)) return res.status(400).json({ message: 'This key has expired. Please contact HR.' });

        res.json({
            message: 'Key valid.',
            key: { key_code: key.key_code, vacancy_title: key.vacancy_title, department: key.department, expires_at: key.expires_at }
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.submitApplication = async (req, res) => {
    try {
        const { key_code, full_name, email, phone, nin, date_of_birth, gender, address, password } = req.body;
        if (!key_code || !full_name || !nin || !password)
            return res.status(400).json({ message: 'Key code, full name, NIN and password are required.' });

        const keyRes = await db.query(
            `SELECT * FROM recruitment_keys WHERE key_code = $1 AND is_active = true`,
            [key_code.toUpperCase()]
        );
        const key = keyRes.rows[0];
        if (!key) return res.status(404).json({ message: 'Invalid recruitment key.' });
        if (new Date() > new Date(key.expires_at)) return res.status(400).json({ message: 'This key has expired.' });

        const ninExists = await db.query('SELECT id FROM recruitment_applications WHERE nin = $1', [nin.toUpperCase()]);
        if (ninExists.rows.length) return res.status(409).json({ message: 'An application with this NIN already exists.' });

        const hashed = await bcrypt.hash(password, 10);
        const id = genId();
        await db.query(
            `INSERT INTO recruitment_applications
             (id, key_id, key_code, full_name, email, phone, nin, date_of_birth, gender, address, vacancy_title, department, password, status, work_id, submitted_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'PENDING',NULL,now())`,
            [id, key.id, key_code.toUpperCase(), full_name, email || '', phone || '', nin.toUpperCase(), date_of_birth || '', gender || '', address || '', key.vacancy_title, key.department, hashed]
        );

        await db.query(
            `INSERT INTO notifications (id, type, message, read, created_at) VALUES ($1,'NEW_APPLICATION',$2,false,now())`,
            [genId(), `New application: ${full_name} for ${key.vacancy_title}`]
        );

        res.status(201).json({ message: 'Application submitted! HR will review and assign your Work ID. You can then login.', status: 'PENDING' });
    } catch (err) { console.error('submitApplication:', err.message); res.status(500).json({ error: err.message }); }
};

exports.getApplications = async (req, res) => {
    try {
        const { rows } = await db.query(
            `SELECT id, key_id, key_code, full_name, email, phone, nin, date_of_birth, gender, address,
                    vacancy_title, department, status, work_id, submitted_at, approved_by, approved_at, rejected_at
             FROM recruitment_applications ORDER BY submitted_at DESC`
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.approveApplication = async (req, res) => {
    try {
        const { work_id } = req.body;
        if (!work_id) return res.status(400).json({ message: 'Work ID required.' });

        const appRes = await db.query('SELECT * FROM recruitment_applications WHERE id = $1', [req.params.id]);
        const app = appRes.rows[0];
        if (!app) return res.status(404).json({ message: 'Application not found.' });
        if (app.status === 'HIRED') return res.status(400).json({ message: 'Already approved.' });

        const wid = work_id.toUpperCase();
        const userExists = await db.query('SELECT id FROM users WHERE work_id = $1', [wid]);
        if (userExists.rows.length) return res.status(409).json({ message: 'Work ID already in use. Choose another.' });

        const created_at = new Date().toISOString();

        // Create user login
        const userId = genId();
        await db.query(
            `INSERT INTO users (id, work_id, full_name, email, password, role, status, created_at)
             VALUES ($1,$2,$3,$4,$5,'EMPLOYEE','ACTIVE',$6)`,
            [userId, wid, app.full_name, app.email, app.password, created_at]
        );

        // Create employee profile
        const empId = genId();
        await db.query(
            `INSERT INTO employees
             (id, user_id, work_id, nin, full_name, phone, email, date_of_birth, gender, address, job_title, department, employment_type, status, pending_hr_review, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'TRAINEE','ACTIVE',false,$13)`,
            [empId, userId, wid, app.nin, app.full_name, app.phone, app.email, app.date_of_birth, app.gender, app.address, app.vacancy_title, app.department, created_at]
        );

        await db.query(
            `INSERT INTO leave_balances (id, employee_id, work_id, annual_balance, sick_balance, updated_at)
             VALUES ($1,$2,$3,21,10,now())`,
            [genId(), empId, wid]
        );

        await db.query(
            `UPDATE recruitment_applications SET status = 'HIRED', work_id = $1, approved_by = $2, approved_at = now() WHERE id = $3`,
            [wid, req.user.id, req.params.id]
        );

        await db.query(
            'INSERT INTO audit_log (id, actor_id, action, details, created_at) VALUES ($1,$2,$3,$4,now())',
            [genId(), req.user.id, 'APPLICATION_APPROVED', `${app.full_name} → ${wid}`]
        );

        res.json({ message: `${app.full_name} approved. Work ID: ${wid}. They can now login.` });
    } catch (err) { console.error('approveApplication:', err.message); res.status(500).json({ error: err.message }); }
};

exports.rejectApplication = async (req, res) => {
    try {
        await db.query(`UPDATE recruitment_applications SET status = 'REJECTED', rejected_at = now() WHERE id = $1`, [req.params.id]);
        res.json({ message: 'Application rejected.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.floorRegister = async (req, res) => {
    try {
        const { work_id, nin, password } = req.body;
        if (!work_id || !nin || !password) return res.status(400).json({ message: 'Work ID, NIN and password required.' });
        const wid = work_id.toUpperCase();

        const empRes = await db.query('SELECT * FROM employees WHERE work_id = $1', [wid]);
        const emp = empRes.rows[0];
        if (!emp) return res.status(404).json({ message: 'Work ID not found. Contact HR.' });
        if ((emp.nin || '').toUpperCase() !== nin.toUpperCase()) return res.status(400).json({ message: 'NIN does not match our records.' });

        const userExists = await db.query('SELECT id FROM users WHERE work_id = $1', [wid]);
        if (userExists.rows.length) return res.status(409).json({ message: 'Account already exists. Please login.' });

        const hashed = await bcrypt.hash(password, 10);
        const userId = genId();
        const created_at = new Date().toISOString();
        await db.query(
            `INSERT INTO users (id, work_id, full_name, email, password, role, status, created_at)
             VALUES ($1,$2,$3,$4,$5,'EMPLOYEE','ACTIVE',$6)`,
            [userId, wid, emp.full_name, emp.email, hashed, created_at]
        );
        await db.query('UPDATE employees SET user_id = $1 WHERE work_id = $2', [userId, wid]);

        const token = jwt.sign({ id: userId, role: 'EMPLOYEE', work_id: wid }, process.env.JWT_SECRET, { expiresIn: '8h' });
        res.status(201).json({ message: 'Account created! You can now login.', token, work_id: wid, name: emp.full_name, role: 'EMPLOYEE' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};
