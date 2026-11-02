/**
 * ==============================================================================
 * 2CE COFFEE ROASTERY · SHIFT CONTROLLER
 * ==============================================================================
 */
const shiftService = require('../services/shift.service');
const { runAutoSchedulingAlgorithm } = require('../services/aiScheduling.service');

async function handleGetShifts(req, res, next) {
  try {
    const shifts = await shiftService.getAllShifts();
    return res.status(200).json({
      success: true,
      data: shifts
    });
  } catch (error) {
    next(error);
  }
}

async function handleRegisterShifts(req, res, next) {
  try {
    const userId = req.user.id;
    const { shift_ids } = req.body;

    const result = await shiftService.registerShifts(userId, shift_ids);
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
}

async function handleGetRegistrationProgress(req, res, next) {
  try {
    const progress = await shiftService.getRegistrationProgress();
    return res.status(200).json({
      success: true,
      data: progress
    });
  } catch (error) {
    next(error);
  }
}

async function handleGetMonthlyTimesheet(req, res, next) {
  try {
    const { year = 2026, month = 10 } = req.query;
    const timesheet = await shiftService.getMonthlyTimesheet(year, month);
    return res.status(200).json({
      success: true,
      data: timesheet
    });
  } catch (error) {
    next(error);
  }
}

async function handleRunAutoSchedule(req, res, next) {
  try {
    const result = await runAutoSchedulingAlgorithm();
    return res.status(200).json({
      success: true,
      data: result,
      message: 'Chạy thuật toán AI xếp ca thành công.'
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  handleGetShifts,
  handleRegisterShifts,
  handleGetRegistrationProgress,
  handleGetMonthlyTimesheet,
  handleRunAutoSchedule
};

