/**
 * ==============================================================================
 * 2CE COFFEE ROASTERY · SYSTEM ROUTES
 * ==============================================================================
 */
const express = require('express');
const router = express.Router();
const systemController = require('../controllers/system.controller');
const { verifyToken } = require('../middlewares/auth');

// GET /api/system/state - Trả về trạng thái vận hành hiện tại (phase) và countdown
router.get('/state', verifyToken, systemController.handleGetSystemState);

module.exports = router;

