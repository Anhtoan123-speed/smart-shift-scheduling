/**
 * ==============================================================================
 * 2CE COFFEE ROASTERY · LEAVE REQUEST & AI AUTO-REPLACEMENT SERVICE
 * ==============================================================================
 */
const fs = require('fs');
const path = require('path');
const { supabaseAdmin, isSupabaseConfigured } = require('../config/supabase');
const emailService = require('./email.service');
const { SEED_USERS } = require('./auth.service');
const { SEED_SHIFTS } = require('./shift.service');

const LEAVE_REQUESTS_FILE = path.join(__dirname, '../../data/localLeaveRequests.json');

function loadLocalLeaveRequests() {
  try {
    if (fs.existsSync(LEAVE_REQUESTS_FILE)) {
      const content = fs.readFileSync(LEAVE_REQUESTS_FILE, 'utf8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.error('Lỗi khi đọc file localLeaveRequests.json:', e.message);
  }
  return [];
}

function saveLocalLeaveRequests(data) {
  try {
    const dir = path.dirname(LEAVE_REQUESTS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LEAVE_REQUESTS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Lỗi khi lưu file localLeaveRequests.json:', e.message);
  }
}

// Danh sách đơn xin nghỉ cục bộ: Đọc từ ổ đĩa
let localLeaveRequests = loadLocalLeaveRequests();

// 1. Tạo đơn xin nghỉ đột xuất
async function createLeaveRequest(userId, { shift_id, reason }) {
  if (!shift_id || !reason || !reason.trim()) {
    const error = new Error('Vui lòng chọn ca xin nghỉ và nhập lý do đột xuất.');
    error.statusCode = 400;
    throw error;
  }

  const shiftNum = parseInt(shift_id, 10);
  const user = SEED_USERS.find(u => u.id === userId || u.email === userId) || { id: userId, full_name: 'Nhân viên', email: 'nv@domain.com', department: 'Bếp' };
  const shift = SEED_SHIFTS.find(s => s.id === shiftNum) || { id: shiftNum, name: 'Ca làm', start_time: '13:00:00', end_time: '17:00:00', shift_key: 'chieu_1' };

  if (isSupabaseConfigured) {
    try {
      const { data: reg, error: regErr } = await supabaseAdmin
        .from('registrations')
        .select('id, is_assigned')
        .eq('user_id', userId)
        .eq('shift_id', shiftNum)
        .eq('is_assigned', true)
        .single();

      if (regErr || !reg) {
        const error = new Error('Bạn không được xếp lịch làm việc ở ca này nên không thể tạo đơn xin nghỉ.');
        error.statusCode = 400;
        throw error;
      }
    } catch (e) {
      if (e.statusCode) throw e;
    }
  }

  const newRequest = {
    id: `req-${Date.now()}`,
    user_id: user.id,
    shift_id: shiftNum,
    reason: reason.trim(),
    status: 'PENDING',
    replacement_user_id: null,
    created_at: new Date().toISOString(),
    user: user,
    shift: shift
  };

  localLeaveRequests.unshift(newRequest);
  saveLocalLeaveRequests(localLeaveRequests);

  if (isSupabaseConfigured) {
    try {
      await supabaseAdmin.from('leave_requests').insert({
        user_id: user.id,
        shift_id: shiftNum,
        reason: reason.trim(),
        status: 'PENDING',
        created_at: new Date().toISOString()
      });
    } catch (e) {}
  }

  // Trigger gửi Email tự động cho Quản lý
  const manager = SEED_USERS.find(u => u.role === 'Manager') || { email: 'tranthimyco28@gmail.com' };
  emailService.sendLeaveRequestCreatedEmail(manager.email, {
    employeeName: user.full_name,
    employeeEmail: user.email,
    department: user.department,
    shiftName: shift.name,
    shiftTime: `${shift.start_time.slice(0, 5)} - ${shift.end_time.slice(0, 5)}`,
    reason: reason.trim()
  }).catch(e => console.error('Lỗi gửi email cho quản lý:', e.message));

  return newRequest;
}

// 2. Phê duyệt đơn xin nghỉ & Kích hoạt AI Tìm nhân sự thế chỗ tự động
async function approveLeaveRequest(requestId, managerUser) {
  const request = localLeaveRequests.find(r => r.id === requestId);
  if (!request) {
    const error = new Error('Không tìm thấy đơn xin nghỉ.');
    error.statusCode = 404;
    throw error;
  }

  if (request.status !== 'PENDING') {
    const error = new Error(`Đơn xin nghỉ này đã được xử lý trước đó với trạng thái: ${request.status}.`);
    error.statusCode = 400;
    throw error;
  }

  const applicant = request.user;
  const shift = request.shift;

  // AI Tìm nhân sự cùng bộ phận thế chỗ
  const candidates = SEED_USERS.filter(
    u => u.department === applicant.department && u.role === 'Employee' && u.id !== applicant.id
  );

  let chosenReplacement = candidates.length > 0 ? candidates[0] : null;

  request.status = 'APPROVED';
  request.replacement_user_id = chosenReplacement ? chosenReplacement.id : null;
  request.replacement = chosenReplacement;
  request.resolved_at = new Date().toISOString();
  saveLocalLeaveRequests(localLeaveRequests);

  // Gửi email
  if (applicant && shift) {
    const shiftTimeStr = `${shift.start_time.slice(0, 5)} - ${shift.end_time.slice(0, 5)}`;
    emailService.sendLeaveApprovalEmails({
      applicantEmail: applicant.email,
      applicantName: applicant.full_name,
      replacementEmail: chosenReplacement ? chosenReplacement.email : null,
      replacementName: chosenReplacement ? chosenReplacement.full_name : null,
      shiftName: shift.name,
      shiftTime: shiftTimeStr
    }).catch(e => console.error('Lỗi gửi email duyệt đơn:', e.message));
  }

  return {
    success: true,
    message: chosenReplacement
      ? `Đã duyệt đơn xin nghỉ của ${applicant.full_name}. Hệ thống AI đã tự động phân bổ ${chosenReplacement.full_name} thế chỗ.`
      : `Đã duyệt đơn xin nghỉ của ${applicant.full_name}.`,
    request,
    replacement: chosenReplacement
  };
}

// 3. Từ chối đơn xin nghỉ
async function rejectLeaveRequest(requestId, managerUser, note = '') {
  const request = localLeaveRequests.find(r => r.id === requestId);
  if (!request) {
    const error = new Error('Không tìm thấy đơn xin nghỉ.');
    error.statusCode = 404;
    throw error;
  }

  if (request.status !== 'PENDING') {
    const error = new Error(`Đơn xin nghỉ này đã được xử lý trước đó với trạng thái: ${request.status}.`);
    error.statusCode = 400;
    throw error;
  }

  request.status = 'REJECTED';
  request.note = note ? note.trim() : null;
  request.resolved_at = new Date().toISOString();
  saveLocalLeaveRequests(localLeaveRequests);

  emailService.sendLeaveRejectedEmail(
    request.user?.email || 'user@domain.com',
    request.user?.full_name || 'Nhân viên',
    request.shift?.name || 'Ca làm',
    note
  ).catch(e => console.error('Lỗi gửi email từ chối:', e.message));

  return {
    success: true,
    message: `Đã từ chối đơn xin nghỉ của ${request.user?.full_name || 'nhân viên'}.`,
    request
  };
}

// 4. Lấy tất cả đơn xin nghỉ
async function getAllLeaveRequests() {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabaseAdmin
        .from('leave_requests')
        .select(`
          id,
          user_id,
          shift_id,
          reason,
          status,
          replacement_user_id,
          note,
          created_at,
          resolved_at,
          user:user_id (id, full_name, email, department),
          shift:shift_id (id, name, shift_key, duration, start_time, end_time),
          replacement:replacement_user_id (id, full_name, email, department)
        `)
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) return data;
    } catch (e) {}
  }

  return localLeaveRequests;
}

module.exports = {
  createLeaveRequest,
  approveLeaveRequest,
  rejectLeaveRequest,
  getAllLeaveRequests
};
