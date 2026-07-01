/**
 * src/config/db.js
 * Postgres connection (Supabase) — replaces the old lowdb file-based store.
 *
 * Every controller calls db.query(sql, params) and gets back the standard
 * node-postgres result object: { rows: [...] }.
 */
require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is not set. Add it to your .env file — see .env.example.');
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // required by Supabase
});

pool.on('error', (err) => {
    console.error('Unexpected Postgres pool error:', err.message);
});

// Quick connectivity check at boot — does not crash the app, just warns.
(async () => {
    try {
        await pool.query('SELECT 1');
        console.log('✅ HRSync DB connected (Postgres / Supabase)');
    } catch (err) {
        console.error('❌ HRSync DB connection failed:', err.message);
        console.error('   Check DATABASE_URL in your .env file.');
    }
})();

module.exports = {
    query: (text, params) => pool.query(text, params),
    pool
};
