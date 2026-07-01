const jwt = require('jsonwebtoken');

exports.verifyToken = (req, res, next) => {
    const token = req.header('x-auth-token');
    if (!token) return res.status(401).json({ message: 'No token. Authorization denied.' });
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ message: 'Token invalid or expired. Please login again.' });
    }
};

// SUPER_ADMIN only
exports.authorizeSuperAdmin = (req, res, next) => {
    if (req.user.role !== 'SUPER_ADMIN')
        return res.status(403).json({ message: 'Access Denied: Super Admin only.' });
    next();
};

// HR_ADMIN + SUPER_ADMIN
exports.authorizeHR = (req, res, next) => {
    if (!['SUPER_ADMIN', 'HR_ADMIN'].includes(req.user.role))
        return res.status(403).json({ message: 'Access Denied: HR Admin required.' });
    next();
};

// MANAGER + above
exports.authorizeManager = (req, res, next) => {
    if (!['SUPER_ADMIN', 'HR_ADMIN', 'MANAGER'].includes(req.user.role))
        return res.status(403).json({ message: 'Access Denied: Manager access required.' });
    next();
};

// ALL authenticated users — EMPLOYEE, MANAGER, HR_ADMIN, SUPER_ADMIN
exports.authorizeEmployee = (req, res, next) => {
    if (!['SUPER_ADMIN', 'HR_ADMIN', 'MANAGER', 'EMPLOYEE'].includes(req.user.role))
        return res.status(403).json({ message: 'Access Denied.' });
    next();
};
