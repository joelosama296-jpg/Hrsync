const db    = require('../config/db');
const genId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 6);

// Helper — find employee profile from JWT user id
const findEmp = async (userId) => {
    const u = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = u.rows[0];

    let e = await db.query('SELECT * FROM employees WHERE user_id = $1', [userId]);
    let emp = e.rows[0];

    if (!emp && user) {
        e = await db.query('SELECT * FROM employees WHERE work_id = $1', [user.work_id]);
        emp = e.rows[0];
    }
    return emp;
};

// ─── STATS (single endpoint for dashboard counters) ─────────────────────────
exports.getStats = async (req, res) => {
    try {
        const [emp, active, leave, keys, cands, notifs, warn] = await Promise.all([
            db.query('SELECT COUNT(*) FROM employees'),
            db.query(`SELECT COUNT(*) FROM employees WHERE status = 'ACTIVE'`),
            db.query(`SELECT COUNT(*) FROM leave_requests WHERE status = 'PENDING'`),
            db.query(`SELECT COUNT(*) FROM recruitment_keys WHERE is_active = true`),
            db.query(`SELECT COUNT(*) FROM recruitment_applications WHERE status = 'PENDING'`),
            db.query(`SELECT COUNT(*) FROM notifications WHERE NOT read AND NOT from_hr`),
            db.query('SELECT COUNT(*) FROM disciplinary'),
        ]);
        res.json({
            employees:          parseInt(emp.rows[0].count, 10),
            active_employees:   parseInt(active.rows[0].count, 10),
            pending_leave:      parseInt(leave.rows[0].count, 10),
            active_keys:        parseInt(keys.rows[0].count, 10),
            pending_candidates: parseInt(cands.rows[0].count, 10),
            unread_notifs:      parseInt(notifs.rows[0].count, 10),
            warnings:           parseInt(warn.rows[0].count, 10),
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── EMPLOYEES ───────────────────────────────────────────────────────────────
exports.getAllEmployees = async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM employees ORDER BY created_at ASC');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getEmployee = async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM employees WHERE id = $1', [req.params.id]);
        if (!rows[0]) return res.status(404).json({ message: 'Employee not found.' });
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.createEmployee = async (req, res) => {
    try {
        const { work_id, full_name, nin, email, phone, department, job_title, employment_type, date_of_birth, gender, address, salary } = req.body;
        if (!work_id || !full_name) return res.status(400).json({ message: 'Work ID and full name required.' });
        const wid = work_id.toUpperCase();

        const exists = await db.query('SELECT id FROM employees WHERE work_id = $1', [wid]);
        if (exists.rows.length) return res.status(409).json({ message: 'Work ID already exists.' });

        const id = genId();
        const created_at = new Date().toISOString();
        const salaryNum = salary ? Number(salary) || 0 : 0;

        await db.query(
            `INSERT INTO employees
             (id, user_id, work_id, full_name, nin, email, phone, department, job_title, employment_type,
              date_of_birth, gender, address, salary, status, pending_hr_review, created_at)
             VALUES ($1,NULL,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'ACTIVE',false,$14)`,
            [id, wid, full_name, nin || '', email || '', phone || '', department || '', job_title || '',
             employment_type || 'FULL_TIME', date_of_birth || '', gender || '', address || '', salaryNum, created_at]
        );

        await db.query(
            `INSERT INTO leave_balances (id, employee_id, work_id, annual_balance, sick_balance, updated_at)
             VALUES ($1,$2,$3,21,10,now())`,
            [genId(), id, wid]
        );

        await db.query(
            'INSERT INTO audit_log (id, actor_id, action, details, created_at) VALUES ($1,$2,$3,$4,now())',
            [genId(), req.user.id, 'EMPLOYEE_CREATED', `${full_name} (${wid})`]
        );

        const { rows } = await db.query('SELECT * FROM employees WHERE id = $1', [id]);
        res.status(201).json({ message: 'Employee created.', employee: rows[0] });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getMyProfile = async (req, res) => {
    try {
        const emp = await findEmp(req.user.id);
        if (!emp) return res.status(404).json({ message: 'Profile not found. Contact HR.' });
        res.json(emp);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.updateMyProfile = async (req, res) => {
    try {
        const emp = await findEmp(req.user.id);
        if (!emp) return res.status(404).json({ message: 'Profile not found.' });

        const allowed = ['phone', 'address', 'email', 'nok_name', 'nok_relationship', 'nok_phone', 'bank_name', 'bank_account', 'blood_type', 'medical_notes'];
        const fields = [];
        const values = [];
        let i = 1;
        allowed.forEach(f => {
            if (req.body[f] !== undefined) { fields.push(`${f} = $${i++}`); values.push(req.body[f]); }
        });
        fields.push(`pending_hr_review = true`);
        fields.push(`updated_at = now()`);

        if (values.length) {
            await db.query(`UPDATE employees SET ${fields.join(', ')} WHERE id = $${i}`, [...values, emp.id]);
        } else {
            await db.query(`UPDATE employees SET pending_hr_review = true, updated_at = now() WHERE id = $1`, [emp.id]);
        }

        await db.query(
            `INSERT INTO notifications (id, type, from_employee_id, from_name, work_id, message, read, created_at)
             VALUES ($1,'PROFILE_UPDATE',$2,$3,$4,$5,false,now())`,
            [genId(), emp.id, emp.full_name, emp.work_id, `${emp.full_name} (${emp.work_id}) updated their profile`]
        );

        res.json({ message: 'Profile updated. HR has been notified.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.updateEmployeeByHR = async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM employees WHERE id = $1', [req.params.id]);
        if (!rows[0]) return res.status(404).json({ message: 'Not found.' });

        const safe = { ...req.body };
        delete safe.id; delete safe.user_id;

        const fields = [];
        const values = [];
        let i = 1;
        Object.keys(safe).forEach(key => { fields.push(`${key} = $${i++}`); values.push(safe[key]); });
        fields.push(`pending_hr_review = false`);
        fields.push(`updated_at = now()`);

        if (values.length) {
            await db.query(`UPDATE employees SET ${fields.join(', ')} WHERE id = $${i}`, [...values, req.params.id]);
        } else {
            await db.query(`UPDATE employees SET pending_hr_review = false, updated_at = now() WHERE id = $1`, [req.params.id]);
        }

        res.json({ message: 'Employee updated.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.toggleStatus = async (req, res) => {
    try {
        const { status } = req.body;
        if (!['ACTIVE', 'SUSPENDED', 'TERMINATED'].includes(status)) return res.status(400).json({ message: 'Invalid status.' });

        const { rows } = await db.query('SELECT * FROM employees WHERE id = $1', [req.params.id]);
        const emp = rows[0];
        if (!emp) return res.status(404).json({ message: 'Not found.' });

        await db.query('UPDATE employees SET status = $1 WHERE id = $2', [status, req.params.id]);
        await db.query('UPDATE users SET status = $1 WHERE work_id = $2', [status, emp.work_id]);
        await db.query(
            'INSERT INTO audit_log (id, actor_id, action, details, created_at) VALUES ($1,$2,$3,$4,now())',
            [genId(), req.user.id, `EMPLOYEE_${status}`, emp.work_id]
        );

        res.json({ message: `Employee ${status.toLowerCase()}.` });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── NOTIFICATIONS / MESSAGES ────────────────────────────────────────────────
exports.getHRNotifications = async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 60');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.markNotifRead = async (req, res) => {
    try {
        await db.query('UPDATE notifications SET read = true WHERE id = $1', [req.params.id]);
        res.json({ message: 'Read.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.sendMessage = async (req, res) => {
    try {
        const { employee_id, message, type } = req.body;
        if (!employee_id || !message) return res.status(400).json({ message: 'Employee and message required.' });

        const { rows } = await db.query('SELECT * FROM employees WHERE id = $1', [employee_id]);
        const emp = rows[0];
        if (!emp) return res.status(404).json({ message: 'Employee not found.' });

        await db.query(
            `INSERT INTO notifications (id, type, to_employee_id, work_id, from_hr, from_name, message, read, created_at)
             VALUES ($1,$2,$3,$4,true,'HR Department',$5,false,now())`,
            [genId(), type || 'HR_MESSAGE', employee_id, emp.work_id, message]
        );

        res.json({ message: `Message sent to ${emp.full_name}.` });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getMyMessages = async (req, res) => {
    try {
        const emp = await findEmp(req.user.id);
        if (!emp) return res.json([]);
        const { rows } = await db.query(
            `SELECT * FROM notifications WHERE to_employee_id = $1 AND from_hr = true ORDER BY created_at DESC`,
            [emp.id]
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.markMessageRead = async (req, res) => {
    try {
        await db.query('UPDATE notifications SET read = true WHERE id = $1', [req.params.id]);
        res.json({ message: 'Read.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── WARNINGS ────────────────────────────────────────────────────────────────
exports.issueWarning = async (req, res) => {
    try {
        const { employee_id, warning_type, reason, details } = req.body;
        if (!employee_id || !warning_type || !reason) return res.status(400).json({ message: 'Employee, type and reason required.' });

        const { rows } = await db.query('SELECT * FROM employees WHERE id = $1', [employee_id]);
        const emp = rows[0];
        if (!emp) return res.status(404).json({ message: 'Employee not found.' });

        const id = genId();
        const created_at = new Date().toISOString();
        await db.query(
            `INSERT INTO disciplinary (id, employee_id, employee_name, work_id, warning_type, reason, details, issued_by, acknowledged, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false,$9)`,
            [id, employee_id, emp.full_name, emp.work_id, warning_type, reason, details || '', req.user.id, created_at]
        );

        await db.query(
            `INSERT INTO notifications (id, type, to_employee_id, from_hr, from_name, message, read, created_at)
             VALUES ($1,'WARNING_ISSUED',$2,true,'HR Department',$3,false,now())`,
            [genId(), employee_id, `You have received a ${warning_type} warning: ${reason}`]
        );

        await db.query(
            'INSERT INTO audit_log (id, actor_id, action, details, created_at) VALUES ($1,$2,$3,$4,now())',
            [genId(), req.user.id, 'WARNING_ISSUED', `${emp.work_id}: ${warning_type}`]
        );

        res.status(201).json({
            message: `${warning_type} warning issued to ${emp.full_name}.`,
            warning: { id, employee_id, employee_name: emp.full_name, work_id: emp.work_id, warning_type, reason, details: details || '', issued_by: req.user.id, acknowledged: false, created_at }
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getMyWarnings = async (req, res) => {
    try {
        const emp = await findEmp(req.user.id);
        if (!emp) return res.json([]);
        const { rows } = await db.query('SELECT * FROM disciplinary WHERE employee_id = $1 ORDER BY created_at DESC', [emp.id]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getAllWarnings = async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM disciplinary ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.acknowledgeWarning = async (req, res) => {
    try {
        await db.query('UPDATE disciplinary SET acknowledged = true, acknowledged_at = now() WHERE id = $1', [req.params.id]);
        res.json({ message: 'Acknowledged.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── PAYSLIPS ────────────────────────────────────────────────────────────────
exports.getMyPayslips = async (req, res) => {
    try {
        const emp = await findEmp(req.user.id);
        if (!emp) return res.json([]);
        const { rows } = await db.query('SELECT * FROM payroll WHERE employee_id = $1 ORDER BY created_at DESC', [emp.id]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getAllPayslips = async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM payroll ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.savePayslip = async (req, res) => {
    try {
        const { work_id, gross_salary, month, year, paye, nssf_employee, nssf_employer, lst, net_salary } = req.body;
        if (!work_id || !gross_salary) return res.status(400).json({ message: 'Work ID and salary required.' });

        const { rows } = await db.query('SELECT * FROM employees WHERE work_id = $1', [work_id.toUpperCase()]);
        const emp = rows[0];
        if (!emp) return res.status(404).json({ message: `No employee with Work ID: ${work_id.toUpperCase()}` });

        const existing = await db.query('SELECT id FROM payroll WHERE employee_id = $1 AND month = $2 AND year = $3', [emp.id, month, year]);
        if (existing.rows.length) {
            await db.query(
                `UPDATE payroll SET gross_salary=$1, paye=$2, nssf_employee=$3, nssf_employer=$4, lst=$5, net_salary=$6
                 WHERE employee_id = $7 AND month = $8 AND year = $9`,
                [gross_salary, paye, nssf_employee, nssf_employer, lst, net_salary, emp.id, month, year]
            );
        } else {
            await db.query(
                `INSERT INTO payroll (id, employee_id, work_id, employee_name, gross_salary, paye, nssf_employee, nssf_employer, lst, net_salary, month, year, status, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'DRAFT',now())`,
                [genId(), emp.id, emp.work_id, emp.full_name, gross_salary, paye, nssf_employee, nssf_employer, lst, net_salary, month, year]
            );
        }

        await db.query(
            `INSERT INTO notifications (id, type, to_employee_id, from_hr, from_name, message, read, created_at)
             VALUES ($1,'PAYSLIP_READY',$2,true,'HR Department',$3,false,now())`,
            [genId(), emp.id, `Your payslip for ${month}/${year} is ready.`]
        );

        res.json({ message: `Payslip saved for ${emp.full_name}.` });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── POLICIES ────────────────────────────────────────────────────────────────
exports.getPolicies = async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM policies ORDER BY created_at ASC');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.savePolicy = async (req, res) => {
    try {
        const { id, title, content, is_active } = req.body;
        if (!title || !content) return res.status(400).json({ message: 'Title and content required.' });

        if (id) {
            await db.query(
                'UPDATE policies SET title = $1, content = $2, is_active = $3, updated_at = now() WHERE id = $4',
                [title, content, is_active !== false, id]
            );
            res.json({ message: 'Policy updated.' });
        } else {
            const newId = genId();
            const created_at = new Date().toISOString();
            await db.query(
                `INSERT INTO policies (id, title, content, is_active, created_by, created_at) VALUES ($1,$2,$3,true,$4,$5)`,
                [newId, title, content, req.user.id, created_at]
            );
            res.status(201).json({ message: 'Policy created.', policy: { id: newId, title, content, is_active: true, created_by: req.user.id, created_at } });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── DOCUMENTS ───────────────────────────────────────────────────────────────
exports.uploadDocument = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'No file uploaded.' });
        const emp = await findEmp(req.user.id);
        if (!emp) return res.status(404).json({ message: 'Employee not found.' });

        const id = genId();
        const uploaded_at = new Date().toISOString();
        const doc_label = req.body.doc_label || req.file.originalname;
        const doc_type = req.body.doc_type || 'OTHER';

        await db.query(
            `INSERT INTO documents (id, employee_id, work_id, doc_type, doc_label, file_name, file_size, uploaded_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [id, emp.id, emp.work_id, doc_type, doc_label, req.file.filename, req.file.size, uploaded_at]
        );

        await db.query(
            `INSERT INTO notifications (id, type, from_employee_id, from_name, work_id, message, read, created_at)
             VALUES ($1,'DOCUMENT_UPLOADED',$2,$3,$4,$5,false,now())`,
            [genId(), emp.id, emp.full_name, emp.work_id, `${emp.full_name} uploaded: ${doc_label}`]
        );

        res.status(201).json({
            message: 'Document uploaded.',
            document: { id, employee_id: emp.id, work_id: emp.work_id, doc_type, doc_label, file_name: req.file.filename, file_size: req.file.size, uploaded_at }
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getMyDocuments = async (req, res) => {
    try {
        const emp = await findEmp(req.user.id);
        if (!emp) return res.json([]);
        const { rows } = await db.query('SELECT * FROM documents WHERE employee_id = $1 ORDER BY uploaded_at DESC', [emp.id]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── SETTINGS / BRANDING / TOKEN ────────────────────────────────────────────
exports.getSettings = async (req, res) => {
    try {
        const { rows } = await db.query('SELECT data FROM settings WHERE id = 1');
        res.json(rows[0]?.data || {});
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.saveSettings = async (req, res) => {
    try {
        const payload = { ...req.body, updated_at: new Date().toISOString() };
        await db.query(
            `UPDATE settings SET data = data || $1::jsonb WHERE id = 1`,
            [JSON.stringify(payload)]
        );
        res.json({ message: 'Settings saved.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── AUDIT + USERS ───────────────────────────────────────────────────────────
exports.getAuditLog = async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 100');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getAllUsers = async (req, res) => {
    try {
        const { rows } = await db.query('SELECT id, work_id, full_name, email, role, status, created_at FROM users ORDER BY created_at ASC');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
};
