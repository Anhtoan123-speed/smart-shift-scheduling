/**
 * ==============================================================================
 * 2CE COFFEE ROASTERY · SYSTEM CONTROLLER
 * ==============================================================================
 */
const systemService = require('../services/system.service');

async function handleGetSystemState(req, res, next) {
  try {
    const state = await systemService.getSystemState();
    return res.status(200).json({
      success: true,
      data: state
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  handleGetSystemState
};

