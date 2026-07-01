const express = require('express');
const router  = express.Router();

// ✅ FIX: Ensure these names exactly match the "exports.name" in authController.js
const { login, createUser, changePassword, resetPassword } = require('../controllers/authController');
const { verifyToken, authorizeHR } = require('../middleware/auth');

// ✅ FIX: If any of these are undefined, this is where the error happens
router.post('/login',           login);
router.post('/create-user',     verifyToken, authorizeHR, createUser);
router.put('/change-password',  verifyToken, changePassword);
router.put('/reset-password',   verifyToken, authorizeHR, resetPassword);

module.exports = router;
