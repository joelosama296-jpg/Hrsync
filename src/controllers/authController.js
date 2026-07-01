const db     = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const genId  = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 6);

exports.login = async (req, res) => {
    try {
        const { work_id, password } = req.body;
        if (!work_id || !password) return res.status(400).json({ message: 'Work ID and password are required.' });

        const { rows } = await db.query('SELECT * FROM users WHERE work_id = $1', [work_id.toUpperCase()]);
        const user = rows[0];
        if (!user) return res.status(404).json({ message: 'Work ID not found.' });
        if (user.status !== 'ACTIVE') return res.status(403).json({ message: 'Account is suspended or terminated.' });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(400).json({ message: 'Incorrect password.' });

        const token = jwt.sign(
            { id: user.id, role: user.role, work_id: user.work_id },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        await db.query(
            'INSERT INTO audit_log (id, actor_id, action, details, created_at) VALUES ($1,$2,$3,$4,now())',
            [genId(), user.id, 'LOGIN', `${user.work_id} (${user.role})`]
        );

        res.json({ token, role: user.role, name: user.full_name, work_id: user.work_id });
    } catch (err) { console.error('login:', err.message); res.status(500).json({ error: err.message }); }
};

exports.createUser = async (req, res) => {
    try {
        const { work_id, full_name, email, password, role } = req.body;
        if (!work_id || !full_name || !password) return res.status(400).json({ message: 'Work ID, name and password required.' });
        const wid = work_id.toUpperCase();

        const exists = await db.query('SELECT id FROM users WHERE work_id = $1', [wid]);
        if (exists.rows.length) return res.status(409).json({ message: 'Work ID already exists.' });

        const hashed = await bcrypt.hash(password, 10);
        const id = genId();
        const created_at = new Date().toISOString();
        const finalRole = role || 'EMPLOYEE';

        await db.query(
            `INSERT INTO users (id, work_id, full_name, email, password, role, status, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,'ACTIVE',$7)`,
            [id, wid, full_name, email || '', hashed, finalRole, created_at]
        );

        await db.query(
            'INSERT INTO audit_log (id, actor_id, action, details, created_at) VALUES ($1,$2,$3,$4,now())',
            [genId(), req.user.id, 'USER_CREATED', `${wid} (${finalRole})`]
        );

        res.status(201).json({
            message: 'User created.',
            user: { id, work_id: wid, full_name, email: email || '', role: finalRole, status: 'ACTIVE', created_at }
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.changePassword = async (req, res) => {
    try {
        const { old_password, new_password } = req.body;
        const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
        const user = rows[0];
        if (!user) return res.status(404).json({ message: 'User not found.' });
        if (!(await bcrypt.compare(old_password, user.password))) return res.status(400).json({ message: 'Current password is incorrect.' });
        if (new_password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters.' });

        const hashed = await bcrypt.hash(new_password, 10);
        await db.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, req.user.id]);
        res.json({ message: 'Password updated.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.resetPassword = async (req, res) => {
    try {
        const { work_id, new_password } = req.body;
        if (!work_id || !new_password) return res.status(400).json({ message: 'Work ID and new password required.' });
        const wid = work_id.toUpperCase();

        const { rows } = await db.query('SELECT * FROM users WHERE work_id = $1', [wid]);
        const user = rows[0];
        if (!user) return res.status(404).json({ message: 'User not found.' });

        const hashed = await bcrypt.hash(new_password, 10);
        await db.query('UPDATE users SET password = $1 WHERE work_id = $2', [hashed, wid]);
        await db.query(
            'INSERT INTO audit_log (id, actor_id, action, details, created_at) VALUES ($1,$2,$3,$4,now())',
            [genId(), req.user.id, 'PASSWORD_RESET', wid]
        );

        res.json({ message: `Password reset for ${wid}.` });
    } catch (err) { res.status(500).json({ error: err.message }); }
};
