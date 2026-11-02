/**
 * ==============================================================================
 * 2CE COFFEE ROASTERY · AUTH ROUTES
 * ==============================================================================
 */
const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { verifyToken } = require('../middlewares/auth');

// POST /api/auth/login (Đăng nhập qua Email + Password)
router.post('/login', authController.handleLogin);

// GET /api/auth/me (Lấy thông tin tài khoản đang đăng nhập)
router.get('/me', verifyToken, authController.handleGetProfile);

module.exports = router;

