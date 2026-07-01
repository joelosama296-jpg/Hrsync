const express = require('express');
const router  = express.Router();
const { createKey, getKeys, deactivateKey, validateKey, submitApplication, getApplications, approveApplication, rejectApplication, floorRegister } = require('../controllers/recruitmentController');
const { verifyToken, authorizeHR } = require('../middleware/auth');

router.post('/create-key',         verifyToken, authorizeHR, createKey);
router.get('/keys',                verifyToken, authorizeHR, getKeys);
router.put('/keys/:id/deactivate', verifyToken, authorizeHR, deactivateKey);
router.get('/applications',        verifyToken, authorizeHR, getApplications);
router.put('/approve/:id',         verifyToken, authorizeHR, approveApplication);
router.put('/reject/:id',          verifyToken, authorizeHR, rejectApplication);
// Public — no token needed
router.post('/validate-key',  validateKey);
router.post('/apply',         submitApplication);
router.post('/floor-register', floorRegister);

module.exports = router;
