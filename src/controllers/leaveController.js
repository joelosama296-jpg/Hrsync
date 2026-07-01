const db    = require('../config/db');
const genId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 6);

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

exports.submitLeave = async (req, res) => {
    try {
        const { leave_type, start_date, end_date, reason } = req.body;
        if (!leave_type || !start_date || !end_date)
            return res.status(400).json({ message: 'Leave type, start and end date are required.' });

        const emp = await findEmp(req.user.id);
        if (!emp) return res.status(404).json({ message: 'Employee profile not found. Contact HR to complete your registration.' });

        // Check / create balance
        let balRes = await db.query('SELECT * FROM leave_balances WHERE employee_id = $1', [emp.id]);
        let bal = balRes.rows[0];
        if (!bal) {
            const id = genId();
            await db.query(
                `INSERT INTO leave_balances (id, employee_id, work_id, annual_balance, sick_balance, updated_at)
                 VALUES ($1,$2,$3,21,10,now())`,
                [id, emp.id, emp.work_id]
            );
            bal = { id, employee_id: emp.id, work_id: emp.work_id, annual_balance: 21, sick_balance: 10 };
        }

        if (leave_type === 'ANNUAL' && bal.annual_balance <= 0) return res.status(400).json({ message: 'Annual leave balance exhausted.' });
        if (leave_type === 'SICK'   && bal.sick_balance   <= 0) return res.status(400).json({ message: 'Sick leave balance exhausted.' });

        const leaveId = genId();
        const created_at = new Date().toISOString();
        await db.query(
            `INSERT INTO leave_requests (id, employee_id, employee_name, work_id, leave_type, start_date, end_date, reason, status, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PENDING',$9)`,
            [leaveId, emp.id, emp.full_name, emp.work_id, leave_type, start_date, end_date, reason || '', created_at]
        );

        await db.query(
            `INSERT INTO notifications (id, type, from_employee_id, from_name, work_id, message, leave_id, read, created_at)
             VALUES ($1,'LEAVE_REQUEST',$2,$3,$4,$5,$6,false,now())`,
            [genId(), emp.id, emp.full_name, emp.work_id, `${emp.full_name} submitted ${leave_type} leave (${start_date} → ${end_date})`, leaveId]
        );

        await db.query(
            'INSERT INTO audit_log (id, actor_id, action, details, created_at) VALUES ($1,$2,$3,$4,now())',
            [genId(), req.user.id, 'LEAVE_SUBMITTED', `${leave_type}: ${start_date}→${end_date}`]
        );

        res.status(201).json({
            message: 'Leave request submitted. HR will review shortly.',
            leave: { id: leaveId, employee_id: emp.id, employee_name: emp.full_name, work_id: emp.work_id, leave_type, start_date, end_date, reason: reason || '', status: 'PENDING', created_at }
        });
    } catch (err) { console.error('submitLeave:', err.message); res.status(500).json({ error: err.message }); }
};

exports.getMyLeave = async (req, res) => {
    try {
        const emp = await findEmp(req.user.id);
        if (!emp) return res.json([]);
        const { rows } = await db.query(
            'SELECT * FROM leave_requests WHERE employee_id = $1 ORDER BY created_at DESC',
            [emp.id]
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getAllLeave = async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM leave_requests ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getPendingLeave = async (req, res) => {
    try {
        const { rows } = await db.query(`SELECT * FROM leave_requests WHERE status = 'PENDING' ORDER BY created_at ASC`);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.reviewLeave = async (req, res) => {
    try {
        const { status } = req.body;
        if (!['APPROVED', 'REJECTED'].includes(status)) return res.status(400).json({ message: 'Invalid status.' });

        const { rows } = await db.query('SELECT * FROM leave_requests WHERE id = $1', [req.params.id]);
        const leave = rows[0];
        if (!leave) return res.status(404).json({ message: 'Leave not found.' });

        await db.query(
            'UPDATE leave_requests SET status = $1, reviewed_by = $2, reviewed_at = now() WHERE id = $3',
            [status, req.user.id, req.params.id]
        );

        // Deduct balance if approved
        if (status === 'APPROVED') {
            const days = Math.ceil((new Date(leave.end_date) - new Date(leave.start_date)) / 86400000) + 1;
            const balRes = await db.query('SELECT * FROM leave_balances WHERE employee_id = $1', [leave.employee_id]);
            const bal = balRes.rows[0];
            if (bal) {
                if (leave.leave_type === 'ANNUAL') {
                    await db.query('UPDATE leave_balances SET annual_balance = $1, updated_at = now() WHERE employee_id = $2',
                        [Math.max(0, bal.annual_balance - days), leave.employee_id]);
                }
                if (leave.leave_type === 'SICK') {
                    await db.query('UPDATE leave_balances SET sick_balance = $1, updated_at = now() WHERE employee_id = $2',
                        [Math.max(0, bal.sick_balance - days), leave.employee_id]);
                }
            }
        }

        await db.query(
            `INSERT INTO notifications (id, type, to_employee_id, from_hr, from_name, message, read, created_at)
             VALUES ($1,'LEAVE_REVIEWED',$2,true,'HR Department',$3,false,now())`,
            [genId(), leave.employee_id, `Your ${leave.leave_type} leave (${leave.start_date} → ${leave.end_date}) has been ${status}.`]
        );

        await db.query(
            'INSERT INTO audit_log (id, actor_id, action, details, created_at) VALUES ($1,$2,$3,$4,now())',
            [genId(), req.user.id, `LEAVE_${status}`, leave.employee_name]
        );

        res.json({ message: `Leave ${status.toLowerCase()}.` });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getMyBalance = async (req, res) => {
    try {
        const emp = await findEmp(req.user.id);
        if (!emp) return res.json({ annual_balance: 21, sick_balance: 10 });

        let balRes = await db.query('SELECT * FROM leave_balances WHERE employee_id = $1', [emp.id]);
        let bal = balRes.rows[0];
        if (!bal) {
            const id = genId();
            await db.query(
                `INSERT INTO leave_balances (id, employee_id, work_id, annual_balance, sick_balance, updated_at)
                 VALUES ($1,$2,$3,21,10,now())`,
                [id, emp.id, emp.work_id]
            );
            bal = { id, employee_id: emp.id, work_id: emp.work_id, annual_balance: 21, sick_balance: 10 };
        }
        res.json(bal);
    } catch (err) { res.status(500).json({ error: err.message }); }
};
