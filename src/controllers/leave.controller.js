/**
 * ==============================================================================
 * 2CE COFFEE ROASTERY · LEAVE CONTROLLER
 * ==============================================================================
 */
const leaveService = require('../services/leave.service');

// Nhân viên nộp đơn xin nghỉ
async function handleCreateLeaveRequest(req, res, next) {
  try {
    const userId = req.user.id;
    const { shift_id, reason } = req.body;

    const newRequest = await leaveService.createLeaveRequest(userId, { shift_id, reason });
    return res.status(201).json({
      success: true,
      message: 'Nộp đơn xin nghỉ thành công. Hệ thống đã gửi thông báo đến Quản lý.',
      data: newRequest
    });
  } catch (error) {
    next(error);
  }
}

// Quản lý duyệt đơn xin nghỉ (Kèm AI tìm người thế chỗ tự động)
async function handleApproveLeaveRequest(req, res, next) {
  try {
    const { id } = req.params;
    const result = await leaveService.approveLeaveRequest(id, req.user);

    return res.status(200).json({
      success: true,
      message: result.message,
      data: result
    });
  } catch (error) {
    next(error);
  }
}

// Quản lý từ chối đơn xin nghỉ
async function handleRejectLeaveRequest(req, res, next) {
  try {
    const { id } = req.params;
    const { note } = req.body;

    const result = await leaveService.rejectLeaveRequest(id, req.user, note);
    return res.status(200).json({
      success: true,
      message: result.message,
      data: result
    });
  } catch (error) {
    next(error);
  }
}

// Lấy danh sách toàn bộ đơn xin nghỉ
async function handleGetLeaveRequests(req, res, next) {
  try {
    const list = await leaveService.getAllLeaveRequests();
    return res.status(200).json({
      success: true,
      data: list
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  handleCreateLeaveRequest,
  handleApproveLeaveRequest,
  handleRejectLeaveRequest,
  handleGetLeaveRequests
};

