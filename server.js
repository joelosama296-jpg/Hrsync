const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
const path    = require('path');
require('dotenv').config();

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files and frontend
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use(express.static(path.join(__dirname, 'frontend')));

// ── SUBSCRIPTION GATE ───────────────────────────────────────────
// Must come BEFORE all other API routes
const gate = require('./src/middleware/subscriptionGate');
app.get('/api/subscription/status',   gate.getStatus);
app.post('/api/subscription/activate', gate.activateToken);
app.use(gate.checkSubscription);
// ───────────────────────────────────────────────────────────────

// ── API ROUTES
app.use('/api/auth',        require('./src/routes/authRoutes'));
app.use('/api/recruitment', require('./src/routes/recruitmentRoutes'));
app.use('/api/leave',       require('./src/routes/leaveRoutes'));
app.use('/api/employees',   require('./src/routes/employeeRoutes'));

// Health check
app.get('/api/health', (req, res) => res.json({
    system: 'HRSync',
    status: '✅ Running',
    version: '1.0.0',
    by: 'Sovereign Civic Tech — Uganda'
}));

// Block catch-all from swallowing missing upload files
app.get('/uploads/*', (req, res) => {
    res.status(404).json({ message: 'File not found.' });
});

// Catch-all — serve frontend (SPA routing)
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'frontend/index.html')));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════╗');
    console.log('║   HRSync — Sovereign Civic Tech       ║');
    console.log('╠══════════════════════════════════════╣');
    console.log(`║   Running : http://localhost:${PORT}     ║`);
    console.log('║   HR-001  : admin123                  ║');
    console.log('║   EMP-001 : emp123                    ║');
    console.log('╚══════════════════════════════════════╝');
    console.log('');
});
