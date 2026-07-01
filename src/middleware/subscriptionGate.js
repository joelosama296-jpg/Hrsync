/**
 * subscriptionGate.js
 * Blocks all API routes when subscription is locked or expired.
 * Frontend checks /api/subscription/status on every page load
 * and shows the activation modal automatically.
 */
const db    = require('../config/db');
const genId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 6);

const getSettingsData = async () => {
    const { rows } = await db.query('SELECT data FROM settings WHERE id = 1');
    return rows[0]?.data || {};
};

// GET /api/subscription/status — called by every page on load
exports.getStatus = async (req, res) => {
    try {
        const s = await getSettingsData();
        const now      = new Date();
        const expires  = s.subscription_expires ? new Date(s.subscription_expires) : null;
        const daysLeft = expires ? Math.ceil((expires - now) / 86400000) : null;
        const isExpired = expires && expires < now;
        const isLocked  = s.subscription_locked === true;
        const hasToken  = !!s.subscription_token;

        let status = 'ACTIVE', message = null;
        if (!hasToken)        { status = 'NO_TOKEN';       message = 'Enter your activation token to get started.'; }
        else if (isLocked)    { status = 'LOCKED';         message = 'Your subscription has been suspended. Contact Sovereign Civic Tech to renew.'; }
        else if (isExpired)   { status = 'EXPIRED';        message = `Subscription expired on ${expires.toLocaleDateString('en-UG',{year:'numeric',month:'long',day:'numeric'})}. Enter a new token to continue.`; }
        else if (daysLeft !== null && daysLeft <= 7) { status = 'EXPIRING_SOON'; message = `⚠️ Subscription expires in ${daysLeft} day(s). Renew soon to avoid interruption.`; }

        res.json({ status, message, has_token: hasToken, locked: isLocked, expired: isExpired, days_left: daysLeft, expires_at: s.subscription_expires || null, company_name: s.company_name || null, primary_color: s.primary_color || '#00c896', tagline: s.tagline || '' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /api/subscription/activate — HR Admin enters token in modal
exports.activateToken = async (req, res) => {
    try {
        const { token, company_name, primary_color, tagline, expires_at } = req.body;
        if (!token) return res.status(400).json({ valid: false, message: 'Token is required.' });
        if (!token.startsWith('SCT-')) return res.status(400).json({ valid: false, message: 'Invalid token format. Tokens start with SCT-' });

        const current = await getSettingsData();
        const updated = {
            ...current,
            subscription_token:  token,
            subscription_locked: false,
            company_name:  company_name  || current.company_name  || 'My Company',
            primary_color: primary_color || current.primary_color || '#00c896',
            tagline:       tagline       || current.tagline       || '',
            token_activated_at: new Date().toISOString(),
            updated_at:         new Date().toISOString()
        };
        if (expires_at) updated.subscription_expires = new Date(expires_at).toISOString();

        await db.query('UPDATE settings SET data = $1::jsonb WHERE id = 1', [JSON.stringify(updated)]);
        await db.query(
            'INSERT INTO audit_log (id, actor_id, action, details, created_at) VALUES ($1,$2,$3,$4,now())',
            [genId(), 'HR_ADMIN', 'TOKEN_ACTIVATED', token]
        );

        const exp = updated.subscription_expires ? new Date(updated.subscription_expires) : null;
        const daysLeft = exp ? Math.ceil((exp - new Date()) / 86400000) : null;

        res.json({ valid: true, message: '✅ Subscription activated. System unlocked.', company_name: updated.company_name, primary_color: updated.primary_color, days_left: daysLeft, expires_at: updated.subscription_expires || null });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// Middleware — blocks API calls when locked/expired
exports.checkSubscription = async (req, res, next) => {
    try {
        const bypass = ['/api/subscription', '/api/auth/login', '/api/health', '/api/recruitment/validate-key', '/api/recruitment/apply', '/api/recruitment/floor-register'];
        if (bypass.some(p => req.path.startsWith(p))) return next();
        if (!req.path.startsWith('/api/')) return next();

        const s = await getSettingsData();
        if (!s.subscription_token) return next(); // setup mode
        if (s.subscription_locked) return res.status(402).json({ locked: true, message: 'Subscription suspended. Contact Sovereign Civic Tech.' });
        if (s.subscription_expires && new Date(s.subscription_expires) < new Date()) return res.status(402).json({ locked: true, expired: true, message: 'Subscription expired. Enter your renewal token.' });
        next();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
