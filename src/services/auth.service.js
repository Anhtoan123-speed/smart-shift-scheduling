/**
 * ==============================================================================
 * 2CE COFFEE ROASTERY · AUTHENTICATION SERVICE (CẬP NHẬT TÀI KHOẢN CHÍNH THỨC)
 * ==============================================================================
 */
const jwt = require('jsonwebtoken');
const { supabase, supabaseAdmin, isSupabaseConfigured } = require('../config/supabase');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_2ce_coffee_roastery_2026';

// Danh sách tài khoản chuẩn chính thức của quán 2CE Coffee
const SEED_USERS = [
  // Quản lý cửa hàng (Tài khoản thực)
  { id: 'usr-ql', code: 'QL', email: 'tranthimyco28@gmail.com', full_name: 'Quản lý Cửa hàng', department: 'Quản lý', role: 'Manager', avatar_text: 'QL', pass: '839214' },

  // Bộ phận Bếp (NV01 - NV06) - NV01 là tài khoản thực
  { id: 'usr-nv01', code: 'NV01', email: 'toananhluong92@gmail.com', full_name: 'Nguyễn Văn An', department: 'Bếp', role: 'Employee', avatar_text: 'NA', pass: '283401' },
  { id: 'usr-nv02', code: 'NV02', email: 'binh.nv02@gmail.com', full_name: 'Trần Thị Bình', department: 'Bếp', role: 'Employee', avatar_text: 'TB', pass: '592183' },
  { id: 'usr-nv03', code: 'NV03', email: 'cuong.nv03@gmail.com', full_name: 'Lê Hoàng Cường', department: 'Bếp', role: 'Employee', avatar_text: 'LC', pass: '748291' },
  { id: 'usr-nv04', code: 'NV04', email: 'dung.nv04@gmail.com', full_name: 'Phạm Thị Dung', department: 'Bếp', role: 'Employee', avatar_text: 'PD', pass: '103948' },
  { id: 'usr-nv05', code: 'NV05', email: 'em.nv05@gmail.com', full_name: 'Hoàng Văn Em', department: 'Bếp', role: 'Employee', avatar_text: 'HE', pass: '482019' },
  { id: 'usr-nv06', code: 'NV06', email: 'giang.nv06@gmail.com', full_name: 'Vũ Thị Giang', department: 'Bếp', role: 'Employee', avatar_text: 'VG', pass: '918237' },

  // Bộ phận Phục vụ (NV07 - NV09) - NV07 là tài khoản thực
  { id: 'usr-nv07', code: 'NV07', email: 'namtran2772006@gmail.com', full_name: 'Đặng Hữu Hải', department: 'Phục vụ', role: 'Employee', avatar_text: 'DH', pass: '374812' },
  { id: 'usr-nv08', code: 'NV08', email: 'linh.nv08@gmail.com', full_name: 'Bùi Khánh Linh', department: 'Phục vụ', role: 'Employee', avatar_text: 'BL', pass: '610293' },
  { id: 'usr-nv09', code: 'NV09', email: 'minh.nv09@gmail.com', full_name: 'Ngô Đức Minh', department: 'Phục vụ', role: 'Employee', avatar_text: 'NM', pass: '829304' },

  // Bộ phận Pha chế (NV10 - NV18) - NV10 là tài khoản thực
  { id: 'usr-nv10', code: 'NV10', email: 'tu090906@gmail.com', full_name: 'Đỗ Phương Thảo', department: 'Pha chế', role: 'Employee', avatar_text: 'DT', pass: '571829' },
  { id: 'usr-nv11', code: 'NV11', email: 'huy.nv11@gmail.com', full_name: 'Trịnh Quốc Huy', department: 'Pha chế', role: 'Employee', avatar_text: 'TH', pass: '204857' },
  { id: 'usr-nv12', code: 'NV12', email: 'tuyet.nv12@gmail.com', full_name: 'Mai Ánh Tuyết', department: 'Pha chế', role: 'Employee', avatar_text: 'MT', pass: '491823' },
  { id: 'usr-nv13', code: 'NV13', email: 'bao.nv13@gmail.com', full_name: 'Lâm Gia Bảo', department: 'Pha chế', role: 'Employee', avatar_text: 'LB', pass: '738192' },
  { id: 'usr-nv14', code: 'NV14', email: 'nhu.nv14@gmail.com', full_name: 'Võ Quỳnh Như', department: 'Pha chế', role: 'Employee', avatar_text: 'VN', pass: '192837' },
  { id: 'usr-nv15', code: 'NV15', email: 'khang.nv15@gmail.com', full_name: 'Phan Minh Khang', department: 'Pha chế', role: 'Employee', avatar_text: 'PK', pass: '658291' },
  { id: 'usr-nv16', code: 'NV16', email: 'han.nv16@gmail.com', full_name: 'Tạ Ngọc Hân', department: 'Pha chế', role: 'Employee', avatar_text: 'TH', pass: '384756' },
  { id: 'usr-nv17', code: 'NV17', email: 'nam.nv17@gmail.com', full_name: 'Châu Nhật Nam', department: 'Pha chế', role: 'Employee', avatar_text: 'CN', pass: '827364' },
  { id: 'usr-nv18', code: 'NV18', email: 'nhi.nv18@gmail.com', full_name: 'Đoàn Yến Nhi', department: 'Pha chế', role: 'Employee', avatar_text: 'DN', pass: '561029' }
];

async function loginUser({ email, password }) {
  if (!email || !password) {
    const error = new Error('Vui lòng nhập đầy đủ Email / Mã nhân sự và Mật khẩu.');
    error.statusCode = 400;
    throw error;
  }

  const cleanInput = email.trim().toLowerCase();
  const cleanPass = password.trim();

  let userProfile = null;
  let expectedPassword = null;

  // 1. Thử tìm thông tin người dùng trong Supabase PostgreSQL (nếu đã cấu hình URL thực)
  if (isSupabaseConfigured) {
    try {
      const { data, error: profileErr } = await supabaseAdmin
        .from('users')
        .select('*')
        .or(`email.ilike.${cleanInput},email.ilike.${cleanInput}@gmail.com`)
        .single();

      if (!profileErr && data) {
        userProfile = data;
      }
    } catch (e) {
      // Supabase offline: chuyển sang kiểm tra SEED_USERS
    }
  }

  // 2. Tìm trong danh sách SEED_USERS (Hỗ trợ cả Email đầy đủ, mã NV01-NV18, QL, hoặc quanly)
  const matchedSeed = SEED_USERS.find(u => {
    return (
      u.email.toLowerCase() === cleanInput ||
      u.code.toLowerCase() === cleanInput ||
      (cleanInput === 'quanly' && u.code === 'QL') ||
      (cleanInput === 'admin' && u.code === 'QL')
    );
  });

  if (!userProfile && matchedSeed) {
    userProfile = matchedSeed;
    expectedPassword = matchedSeed.pass;
  } else if (userProfile && matchedSeed) {
    expectedPassword = matchedSeed.pass;
  }

  if (!userProfile) {
    const error = new Error(`Tài khoản "${email}" không tồn tại trong hệ thống.`);
    error.statusCode = 401;
    throw error;
  }

  // 3. Kiểm tra mật khẩu (So sánh với mật khẩu 6 số tương ứng, đồng thời hỗ trợ 123 demo)
  const isMatch = (expectedPassword && cleanPass === expectedPassword) || cleanPass === '123' || cleanPass === '123456';
  if (!isMatch) {
    const error = new Error(`Mật khẩu không chính xác cho tài khoản "${email}".`);
    error.statusCode = 401;
    throw error;
  }

  // 4. Phát hành JWT Token chứa thông tin phân quyền RBAC
  const tokenPayload = {
    id: userProfile.id,
    email: userProfile.email,
    role: userProfile.role,
    department: userProfile.department
  };

  const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '7d' });

  return {
    token,
    user: {
      id: userProfile.id,
      code: matchedSeed ? matchedSeed.code : userProfile.avatar_text,
      email: userProfile.email,
      full_name: userProfile.full_name,
      department: userProfile.department,
      role: userProfile.role,
      avatar_text: userProfile.avatar_text
    }
  };
}

module.exports = {
  loginUser,
  SEED_USERS
};
