/**
 * migrate.js — applies schema.sql to your Supabase/Postgres database.
 * Run once (and any time schema.sql changes): node migrate.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function migrate() {
    if (!process.env.DATABASE_URL) {
        console.error('❌ DATABASE_URL is not set in your .env file.');
        console.error('   Copy .env.example to .env and fill in your Supabase connection string.');
        process.exit(1);
    }

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    const schemaPath = path.join(__dirname, 'src', 'config', 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    console.log('\n🚀 Running HRSync schema migration...\n');
    try {
        await pool.query(sql);
        console.log('✅ Schema applied successfully — all tables and indexes are ready.\n');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

migrate();
