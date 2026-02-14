const express = require('express');
const authController = require('../controllers/authController');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

// Public routes
router.post('/register', authController.register.bind(authController));
router.post('/login', authController.login.bind(authController));
router.post('/refresh', authController.refreshToken.bind(authController));

// Protected routes
router.post('/logout', authenticateToken, authController.logout.bind(authController));

module.exports = router;
