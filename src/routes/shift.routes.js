/**
 * ==============================================================================
 * 2CE COFFEE ROASTERY · SHIFT ROUTES
 * ==============================================================================
 */
const express = require('express');
const router = express.Router();
const shiftController = require('../controllers/shift.controller');
const { verifyToken } = require('../middlewares/auth');

// GET /api/shifts - Lấy danh sách 21 ca và trạng thái phân bổ
router.get('/', verifyToken, shiftController.handleGetShifts);

// GET /api/shifts/registration-progress - Xem tiến độ nộp lịch của 18 nhân viên
router.get('/registration-progress', verifyToken, shiftController.handleGetRegistrationProgress);

// GET /api/shifts/timesheet - Bảng Timesheet Tháng (Nhân viên x Tuần)
router.get('/timesheet', verifyToken, shiftController.handleGetMonthlyTimesheet);

// POST /api/shifts/auto-schedule - Chạy thuật toán xếp ca AI
router.post('/auto-schedule', verifyToken, shiftController.handleRunAutoSchedule);

// POST /api/shifts/register - Nộp đơn đăng ký ca làm việc (có Server Rule Validation)
router.post('/register', verifyToken, shiftController.handleRegisterShifts);

module.exports = router;

