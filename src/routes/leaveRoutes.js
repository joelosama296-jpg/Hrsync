const express = require('express');
const router  = express.Router();
const { submitLeave, getMyLeave, getAllLeave, getPendingLeave, reviewLeave, getMyBalance } = require('../controllers/leaveController');
const { verifyToken, authorizeHR, authorizeEmployee } = require('../middleware/auth');

router.post('/submit',       verifyToken, authorizeEmployee, submitLeave);
router.get('/my',            verifyToken, authorizeEmployee, getMyLeave);
router.get('/balance',       verifyToken, authorizeEmployee, getMyBalance);
router.get('/all',           verifyToken, authorizeHR,       getAllLeave);
router.get('/pending',       verifyToken, authorizeHR,       getPendingLeave);
router.put('/review/:id',    verifyToken, authorizeHR,       reviewLeave);

module.exports = router;
