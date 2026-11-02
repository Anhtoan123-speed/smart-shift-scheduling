/**
 * ==============================================================================
 * 2CE COFFEE ROASTERY · AUTHENTICATION & RBAC AUTHORIZATION MIDDLEWARE
 * ==============================================================================
 */
const jwt = require('jsonwebtoken');
const { supabaseAdmin, isSupabaseConfigured } = require('../config/supabase');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_2ce_coffee_roastery_2026';

// Middleware kiểm tra và giải mã Token JWT
async function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Yêu cầu không hợp lệ. Vui lòng cung cấp mã xác thực Bearer Token.'
      });
    }

    const token = authHeader.split(' ')[1];

    let decodedUserId = null;
    let decodedEmail = null;

    try {
      // 1. Thử xác thực qua JWT cục bộ
      const decoded = jwt.verify(token, JWT_SECRET);
      decodedUserId = decoded.id;
      decodedEmail = decoded.email;
    } catch (jwtErr) {
      // 2. Thử xác thực trực tiếp qua Supabase Auth nếu token phát hành từ Supabase
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
      if (error || !user) {
        return res.status(401).json({
          success: false,
          message: 'Token xác thực đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.'
        });
      }
      decodedUserId = user.id;
      decodedEmail = user.email;
    }

    // Truy xuất thông tin người dùng từ bảng public.users hoặc SEED_USERS
    let userProfile = null;
    if (isSupabaseConfigured) {
      try {
        const { data, error: dbErr } = await supabaseAdmin
          .from('users')
          .select('id, email, full_name, department, role, avatar_text')
          .or(`id.eq.${decodedUserId},email.eq.${decodedEmail}`)
          .single();
        if (!dbErr && data) userProfile = data;
      } catch (e) {
        // Supabase offline
      }
    }

    if (!userProfile) {
      const { SEED_USERS } = require('../services/auth.service');
      userProfile = SEED_USERS.find(u => u.id === decodedUserId || u.email.toLowerCase() === (decodedEmail || '').toLowerCase());
    }

    if (!userProfile) {
      return res.status(401).json({
        success: false,
        message: 'Tài khoản người dùng không tồn tại trong hệ thống.'
      });
    }

    req.user = userProfile;
    next();
  } catch (error) {
    console.error('❌ [AUTH ERROR] Lỗi xác thực token:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Đã xảy ra lỗi trong quá trình xác thực người dùng.'
    });
  }
}

// Middleware Phân Quyền RBAC (Role-Based Access Control)
function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Bạn chưa đăng nhập vào hệ thống.'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      console.warn(`⛔ [RBAC FORBIDDEN] User ${req.user.email} (Role: ${req.user.role}) cố tình truy cập tài nguyên yêu cầu: [${allowedRoles.join(', ')}]`);
      return res.status(403).json({
        success: false,
        message: 'Truy cập bị từ chối. Tài khoản của bạn không có quyền thực hiện thao tác quản trị này.'
      });
    }

    next();
  };
}

module.exports = {
  verifyToken,
  requireRole
};

