const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const {
    getAllEmployees, getEmployee, createEmployee, getMyProfile, updateMyProfile,
    updateEmployeeByHR, toggleStatus, getStats,
    getHRNotifications, markNotifRead, sendMessage, getMyMessages, markMessageRead,
    issueWarning, getMyWarnings, getAllWarnings, acknowledgeWarning,
    getMyPayslips, getAllPayslips, savePayslip,
    getPolicies, savePolicy,
    uploadDocument, getMyDocuments,
    getSettings, saveSettings,
    getAuditLog, getAllUsers
} = require('../controllers/employeeController');

const { verifyToken, authorizeHR, authorizeEmployee } = require('../middleware/auth');

// Multer — file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const p = path.join(__dirname, '../../../uploads');
        fs.mkdirSync(p, { recursive: true });
        cb(null, p);
    },
    filename: (req, file, cb) => {
        const safe = file.originalname.replace(/\s/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
        cb(null, Date.now() + '-' + safe);
    }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// Stats
router.get('/stats',             verifyToken, authorizeHR, getStats);

// Employees
router.get('/',                  verifyToken, authorizeHR,       getAllEmployees);
router.post('/',                 verifyToken, authorizeHR,       createEmployee);
router.get('/me',                verifyToken, authorizeEmployee, getMyProfile);
router.put('/me',                verifyToken, authorizeEmployee, updateMyProfile);
router.get('/users',             verifyToken, authorizeHR,       getAllUsers);
router.get('/audit',             verifyToken, authorizeHR,       getAuditLog);

// Settings — GET is public (for branding on login page), POST is HR only.
// Must stay ABOVE '/:id' below — otherwise Express matches "settings" as an :id.
router.get('/settings',               getSettings);
router.post('/settings',              verifyToken, authorizeHR, saveSettings);

router.get('/:id',               verifyToken, authorizeHR,       getEmployee);
router.put('/:id',               verifyToken, authorizeHR,       updateEmployeeByHR);
router.put('/:id/status',        verifyToken, authorizeHR,       toggleStatus);

// Notifications
router.get('/notifications/all',       verifyToken, authorizeHR,       getHRNotifications);
router.put('/notifications/:id/read',  verifyToken, authorizeHR,       markNotifRead);

// Messages
router.post('/messages/send',         verifyToken, authorizeHR,       sendMessage);
router.get('/messages/my',            verifyToken, authorizeEmployee, getMyMessages);
router.put('/messages/:id/read',      verifyToken, authorizeEmployee, markMessageRead);

// Warnings
router.post('/warnings',              verifyToken, authorizeHR,       issueWarning);
router.get('/warnings/my',            verifyToken, authorizeEmployee, getMyWarnings);
router.get('/warnings/all',           verifyToken, authorizeHR,       getAllWarnings);
router.put('/warnings/:id/acknowledge', verifyToken, authorizeEmployee, acknowledgeWarning);

// Payslips
router.get('/payslips/my',            verifyToken, authorizeEmployee, getMyPayslips);
router.get('/payslips/all',           verifyToken, authorizeHR,       getAllPayslips);
router.post('/payslips/save',         verifyToken, authorizeHR,       savePayslip);

// Policies
router.get('/policies',               verifyToken, authorizeEmployee, getPolicies);
router.post('/policies',              verifyToken, authorizeHR,       savePolicy);

// Documents
router.post('/documents/upload',      verifyToken, authorizeEmployee, upload.single('file'), uploadDocument);
router.get('/documents/my',           verifyToken, authorizeEmployee, getMyDocuments);

module.exports = router;
