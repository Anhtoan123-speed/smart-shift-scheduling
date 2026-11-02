/**
 * ==============================================================================
 * 2CE COFFEE ROASTERY · AUTH CONTROLLER
 * ==============================================================================
 */
const authService = require('../services/auth.service');

async function handleLogin(req, res, next) {
  try {
    const { email, password } = req.body;
    const result = await authService.loginUser({ email, password });

    return res.status(200).json({
      success: true,
      message: 'Đăng nhập thành công.',
      data: result
    });
  } catch (error) {
    next(error);
  }
}

async function handleGetProfile(req, res, next) {
  try {
    return res.status(200).json({
      success: true,
      data: req.user
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  handleLogin,
  handleGetProfile
};

