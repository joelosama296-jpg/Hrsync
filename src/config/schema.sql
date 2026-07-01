-- HRSync — Postgres Schema (Supabase)
-- Run once via: node migrate.js
-- Safe to re-run — every statement uses IF NOT EXISTS

CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    work_id     TEXT UNIQUE NOT NULL,
    full_name   TEXT NOT NULL,
    email       TEXT DEFAULT '',
    password    TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'EMPLOYEE',
    status      TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS departments (
    id          TEXT PRIMARY KEY,
    name        TEXT UNIQUE NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employees (
    id                  TEXT PRIMARY KEY,
    user_id             TEXT REFERENCES users(id) ON DELETE SET NULL,
    work_id             TEXT UNIQUE NOT NULL,
    nin                 TEXT DEFAULT '',
    full_name           TEXT NOT NULL,
    email               TEXT DEFAULT '',
    phone               TEXT DEFAULT '',
    department          TEXT DEFAULT '',
    job_title           TEXT DEFAULT '',
    employment_type     TEXT DEFAULT 'FULL_TIME',
    date_of_birth       TEXT DEFAULT '',
    gender              TEXT DEFAULT '',
    address             TEXT DEFAULT '',
    salary              NUMERIC DEFAULT 0,
    bank_name           TEXT DEFAULT '',
    bank_account        TEXT DEFAULT '',
    blood_type          TEXT DEFAULT '',
    medical_notes       TEXT DEFAULT '',
    nok_name            TEXT DEFAULT '',
    nok_relationship    TEXT DEFAULT '',
    nok_phone           TEXT DEFAULT '',
    status              TEXT NOT NULL DEFAULT 'ACTIVE',
    pending_hr_review   BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS leave_balances (
    id              TEXT PRIMARY KEY,
    employee_id     TEXT UNIQUE NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    work_id         TEXT,
    annual_balance  INT NOT NULL DEFAULT 21,
    sick_balance    INT NOT NULL DEFAULT 10,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leave_requests (
    id              TEXT PRIMARY KEY,
    employee_id     TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    employee_name   TEXT,
    work_id         TEXT,
    leave_type      TEXT NOT NULL,
    start_date      TEXT NOT NULL,
    end_date        TEXT NOT NULL,
    reason          TEXT DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'PENDING',
    reviewed_by     TEXT,
    reviewed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payroll (
    id              TEXT PRIMARY KEY,
    employee_id     TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    work_id         TEXT,
    employee_name   TEXT,
    gross_salary    NUMERIC,
    paye            NUMERIC,
    nssf_employee   NUMERIC,
    nssf_employer   NUMERIC,
    lst             NUMERIC,
    net_salary      NUMERIC,
    month           TEXT,
    year            TEXT,
    status          TEXT NOT NULL DEFAULT 'DRAFT',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(employee_id, month, year)
);

CREATE TABLE IF NOT EXISTS disciplinary (
    id              TEXT PRIMARY KEY,
    employee_id     TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    employee_name   TEXT,
    work_id         TEXT,
    warning_type    TEXT NOT NULL,
    reason          TEXT NOT NULL,
    details         TEXT DEFAULT '',
    issued_by       TEXT,
    acknowledged    BOOLEAN NOT NULL DEFAULT false,
    acknowledged_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recruitment_keys (
    id              TEXT PRIMARY KEY,
    key_code        TEXT UNIQUE NOT NULL,
    vacancy_title   TEXT NOT NULL,
    department      TEXT NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_by      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recruitment_applications (
    id              TEXT PRIMARY KEY,
    key_id          TEXT,
    key_code        TEXT,
    full_name       TEXT NOT NULL,
    email           TEXT DEFAULT '',
    phone           TEXT DEFAULT '',
    nin             TEXT UNIQUE NOT NULL,
    date_of_birth   TEXT DEFAULT '',
    gender          TEXT DEFAULT '',
    address         TEXT DEFAULT '',
    vacancy_title   TEXT,
    department      TEXT,
    password        TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'PENDING',
    work_id         TEXT,
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    approved_by     TEXT,
    approved_at     TIMESTAMPTZ,
    rejected_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS policies (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    content     TEXT NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_by  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS documents (
    id          TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    work_id     TEXT,
    doc_type    TEXT DEFAULT 'OTHER',
    doc_label   TEXT,
    file_name   TEXT NOT NULL,
    file_size   INT,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
    id                  TEXT PRIMARY KEY,
    type                TEXT,
    to_employee_id      TEXT,
    from_employee_id    TEXT,
    from_hr             BOOLEAN NOT NULL DEFAULT false,
    from_name           TEXT,
    work_id             TEXT,
    message             TEXT NOT NULL,
    leave_id            TEXT,
    read                BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No FK on actor_id — some entries store literal role strings (e.g. 'HR_ADMIN')
-- instead of a real user id, matching original lowdb behaviour.
CREATE TABLE IF NOT EXISTS audit_log (
    id          TEXT PRIMARY KEY,
    actor_id    TEXT,
    action      TEXT NOT NULL,
    details     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Single-row flexible settings blob — mirrors the original object-shaped
-- lowdb 'settings' key (subscription token, branding, etc.)
CREATE TABLE IF NOT EXISTS settings (
    id      INT PRIMARY KEY DEFAULT 1,
    data    JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT settings_singleton CHECK (id = 1)
);
INSERT INTO settings (id, data) VALUES (1, '{}'::jsonb) ON CONFLICT (id) DO NOTHING;

-- Helpful indexes for the lookups the app does most often
CREATE INDEX IF NOT EXISTS idx_employees_work_id        ON employees(work_id);
CREATE INDEX IF NOT EXISTS idx_employees_user_id         ON employees(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_employee   ON leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status     ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_notifications_to_employee ON notifications(to_employee_id);
CREATE INDEX IF NOT EXISTS idx_documents_employee        ON documents(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_employee           ON payroll(employee_id);
CREATE INDEX IF NOT EXISTS idx_disciplinary_employee      ON disciplinary(employee_id);
