/**
 * ==============================================================================
 * 2CE COFFEE ROASTERY · LEAVE ROUTES (RBAC PROTECTED)
 * ==============================================================================
 */
const express = require('express');
const router = express.Router();
const leaveController = require('../controllers/leave.controller');
const { verifyToken, requireRole } = require('../middlewares/auth');

// GET /api/leave/requests - Lấy danh sách đơn xin nghỉ
router.get('/requests', verifyToken, leaveController.handleGetLeaveRequests);

// POST /api/leave/request - Nhân viên nộp đơn xin nghỉ (Tự động gửi email đến Quản lý)
router.post('/request', verifyToken, leaveController.handleCreateLeaveRequest);

// PUT /api/leave/approve/:id - Quản lý duyệt đơn (Role: Manager, Admin)
// Kèm AI tự động tìm người thế chỗ có tổng giờ làm thấp nhất & gửi email
router.put('/approve/:id', verifyToken, requireRole(['Manager', 'Admin']), leaveController.handleApproveLeaveRequest);

// PUT /api/leave/reject/:id - Quản lý từ chối đơn (Role: Manager, Admin)
router.put('/reject/:id', verifyToken, requireRole(['Manager', 'Admin']), leaveController.handleRejectLeaveRequest);

module.exports = router;

