/**
 * HRSync Setup — seeds demo data into Postgres.
 * Run AFTER migrate.js: node setup.js
 * Safe to re-run — every insert checks for existing data first.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const genId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 6);

async function setup() {
    console.log('\n🚀 HRSync Setup (Postgres / Supabase)\n');

    // DEPARTMENTS
    const deptCount = await pool.query('SELECT COUNT(*) FROM departments');
    if (parseInt(deptCount.rows[0].count, 10) === 0) {
        const names = ['Operations', 'Customer Experience', 'Quality Assurance', 'Human Resources', 'Finance', 'IT & Systems'];
        for (const name of names) {
            await pool.query('INSERT INTO departments (id, name, created_at) VALUES ($1,$2,now())', [genId(), name]);
        }
        console.log('✅ Departments created');
    } else console.log('ℹ️  Departments exist');

    // HR ADMIN
    const hrExists = await pool.query(`SELECT id FROM users WHERE work_id = 'HR-001'`);
    if (!hrExists.rows.length) {
        const h = await bcrypt.hash('admin123', 10);
        await pool.query(
            `INSERT INTO users (id, work_id, full_name, email, password, role, status, created_at)
             VALUES ('hru001','HR-001','HR Administrator','hr@company.com',$1,'HR_ADMIN','ACTIVE',now())`,
            [h]
        );
        await pool.query(
            `INSERT INTO employees (id, user_id, work_id, nin, full_name, email, phone, department, job_title, employment_type, status, pending_hr_review, created_at)
             VALUES ('hre001','hru001','HR-001','','HR Administrator','hr@company.com','','Human Resources','HR Manager','FULL_TIME','ACTIVE',false,now())`
        );
        console.log('✅ HR Admin         — HR-001 / admin123');
    } else console.log('ℹ️  HR Admin exists  — HR-001');

    // DEMO EMPLOYEE
    const empExists = await pool.query(`SELECT id FROM users WHERE work_id = 'EMP-001'`);
    if (!empExists.rows.length) {
        const h = await bcrypt.hash('emp123', 10);
        await pool.query(
            `INSERT INTO users (id, work_id, full_name, email, password, role, status, created_at)
             VALUES ('empu001','EMP-001','Sarah Nakato','sarah@company.com',$1,'EMPLOYEE','ACTIVE',now())`,
            [h]
        );
        await pool.query(
            `INSERT INTO employees
             (id, user_id, work_id, nin, full_name, email, phone, department, job_title, employment_type, status,
              gender, date_of_birth, address, nok_name, nok_relationship, nok_phone, bank_name, bank_account, blood_type, pending_hr_review, created_at)
             VALUES
             ('empe001','empu001','EMP-001','CM900123456789','Sarah Nakato','sarah@company.com','0789000001','Operations','Customer Care Executive','FULL_TIME','ACTIVE',
              'FEMALE','1998-04-12','Ntinda, Kampala','Mary Nakato','Mother','0770000001','Stanbic Bank','9030012345678','O+',false,now())`
        );
        await pool.query(
            `INSERT INTO leave_balances (id, employee_id, work_id, annual_balance, sick_balance, updated_at)
             VALUES ($1,'empe001','EMP-001',21,10,now())`,
            [genId()]
        );
        console.log('✅ Demo employee    — EMP-001 / emp123 (Sarah Nakato)');
    } else console.log('ℹ️  Demo emp exists  — EMP-001');

    // DEMO RECRUITMENT KEY
    const keyCount = await pool.query('SELECT COUNT(*) FROM recruitment_keys');
    if (parseInt(keyCount.rows[0].count, 10) === 0) {
        const exp = new Date(); exp.setDate(exp.getDate() + 30);
        await pool.query(
            `INSERT INTO recruitment_keys (id, key_code, vacancy_title, department, expires_at, is_active, created_by, created_at)
             VALUES ($1,'RCT-2026-OPS-DEMO','Customer Care Executive','Operations',$2,true,'hru001',now())`,
            [genId(), exp.toISOString()]
        );
        console.log('✅ Demo key        — RCT-2026-OPS-DEMO');
    }

    // POLICIES
    const policyCount = await pool.query('SELECT COUNT(*) FROM policies');
    if (parseInt(policyCount.rows[0].count, 10) === 0) {
        await pool.query(
            `INSERT INTO policies (id, title, content, is_active, created_by, created_at) VALUES ($1,$2,$3,true,'hru001',now())`,
            [genId(), 'Zero Tolerance Policy', 'ZERO TOLERANCE — IMMEDIATE TERMINATION FOR:\n\n1. Sharing passwords or user IDs\n2. Disconnecting customers without reason\n3. Misuse of company property or customer accounts\n4. Revealing customer data to unauthorised persons\n5. Breach of confidentiality agreement\n6. Harassment or discrimination of colleagues\n7. Three warning letters for the same offence within 24 months\n8. Rude or unprofessional conduct towards customers']
        );
        await pool.query(
            `INSERT INTO policies (id, title, content, is_active, created_by, created_at) VALUES ($1,$2,$3,true,'hru001',now())`,
            [genId(), 'Leave Policy', 'ANNUAL LEAVE\n• 21 working days per year\n• Apply minimum 2 weeks in advance\n• Cannot carry forward beyond March of following year\n\nSICK LEAVE\n• 10 days per year\n• Medical certificate required for absences over 2 consecutive days\n\nMATERNITY LEAVE\n• 60 working days with full pay\n\nPATERNITY LEAVE\n• 4 working days']
        );
        console.log('✅ Default policies created');
    }

    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║         HRSync Setup Complete!           ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log('║  HR Admin   : HR-001   /  admin123       ║');
    console.log('║  Employee   : EMP-001  /  emp123         ║');
    console.log('║  Demo Key   : RCT-2026-OPS-DEMO          ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log('║  Now run:   node server.js               ║');
    console.log('║  Open:      http://localhost:5000        ║');
    console.log('╚══════════════════════════════════════════╝\n');
}

setup()
    .catch(err => { console.error('\n❌ Setup failed:', err.message); process.exitCode = 1; })
    .finally(() => pool.end());
