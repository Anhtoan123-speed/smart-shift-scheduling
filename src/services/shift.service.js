/**
 * ==============================================================================
 * 2CE COFFEE ROASTERY · SHIFT SERVICE & BUSINESS RULE ENGINE
 * ==============================================================================
 */
const fs = require('fs');
const path = require('path');
const { supabaseAdmin, isSupabaseConfigured } = require('../config/supabase');
const { isShiftQuotaMet, getShiftMissingDetails } = require('./aiScheduling.service');
const { SEED_USERS } = require('./auth.service');
const systemService = require('./system.service');

// Đường dẫn file lưu trữ dữ liệu cục bộ khi chạy offline/local
const REGISTRATIONS_FILE = path.join(__dirname, '../../data/localRegistrations.json');

function loadLocalRegistrations() {
  try {
    if (fs.existsSync(REGISTRATIONS_FILE)) {
      const content = fs.readFileSync(REGISTRATIONS_FILE, 'utf8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.error('Lỗi khi đọc file localRegistrations.json:', e.message);
  }
  return [];
}

function saveLocalRegistrations(data) {
  try {
    const dir = path.dirname(REGISTRATIONS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(REGISTRATIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Lỗi khi lưu file localRegistrations.json:', e.message);
  }
}

// 21 ca làm việc chuẩn của quán
const SEED_SHIFTS = [];
let shiftIdCounter = 1;

for (let d = 1; d <= 7; d++) {
  // Sáng
  SEED_SHIFTS.push({
    id: shiftIdCounter++,
    day_key: d,
    shift_key: `sang_${d}`,
    name: 'Ca Sáng',
    start_time: '09:00:00',
    end_time: '13:00:00',
    duration: 4,
    quotas: { phache: { min: 1, max: 1 }, bep: { min: 0, max: 0 }, phucvu: { min: 0, max: 0 } },
    allowed_departments: ['Pha chế']
  });
}
for (let d = 1; d <= 7; d++) {
  // Chiều
  SEED_SHIFTS.push({
    id: shiftIdCounter++,
    day_key: d,
    shift_key: `chieu_${d}`,
    name: 'Ca Chiều',
    start_time: '13:00:00',
    end_time: '17:00:00',
    duration: 4,
    quotas: { bep: { min: 1, max: 1 }, phache: { min: 1, max: 2 }, phucvu: { min: 0, max: 0 } },
    allowed_departments: ['Bếp', 'Pha chế']
  });
}
for (let d = 1; d <= 7; d++) {
  // Tối
  SEED_SHIFTS.push({
    id: shiftIdCounter++,
    day_key: d,
    shift_key: `toi_${d}`,
    name: 'Ca Tối',
    start_time: '17:00:00',
    end_time: '23:00:00',
    duration: 6,
    quotas: { bep: { min: 2, max: 2 }, phucvu: { min: 2, max: 2 }, phache: { min: 2, max: 3 } },
    allowed_departments: ['Bếp', 'Phục vụ', 'Pha chế']
  });
}

// Bảng lưu trữ registrations cục bộ: Đọc từ ổ đĩa để duy trì dữ liệu qua các lần bật tắt máy
let localRegistrations = loadLocalRegistrations();

// 1. Lấy danh sách 21 ca làm việc kèm thông tin nhân sự đã đăng ký và phân công
async function getAllShifts() {
  let shifts = SEED_SHIFTS;
  let registrations = localRegistrations;

  if (isSupabaseConfigured) {
    try {
      const { data: dbShifts, error: shiftErr } = await supabaseAdmin
        .from('shifts')
        .select('*')
        .order('day_key', { ascending: true })
        .order('start_time', { ascending: true });

      const { data: dbRegs, error: regErr } = await supabaseAdmin
        .from('registrations')
        .select(`
          id,
          shift_id,
          user_id,
          is_assigned,
          users:user_id (id, full_name, email, department, role, avatar_text)
        `);

      if (!shiftErr && dbShifts && dbShifts.length > 0) {
        shifts = dbShifts;
      }
      if (!regErr && dbRegs) {
        registrations = dbRegs;
      }
    } catch (e) {
      // Supabase offline: fallback local
    }
  }

  // Nhóm registrations và assignments theo từng shift_id
  const enrichedShifts = shifts.map(shift => {
    const shiftRegs = registrations.filter(r => r.shift_id === shift.id);
    
    // Tìm thông tin nhân viên tương ứng
    const registeredEmployees = shiftRegs.map(r => {
      if (r.users) return r.users;
      return SEED_USERS.find(u => u.id === r.user_id);
    }).filter(Boolean);

    const assignedEmployees = shiftRegs.filter(r => r.is_assigned).map(r => {
      if (r.users) return r.users;
      return SEED_USERS.find(u => u.id === r.user_id);
    }).filter(Boolean);

    const missingInfo = getShiftMissingDetails(shift.shift_key, assignedEmployees);

    return {
      ...shift,
      registrations: registeredEmployees,
      assignments: assignedEmployees,
      is_full: missingInfo.is_full,
      missing_details: missingInfo.missing_details,
      missing_text: missingInfo.missing_text
    };
  });

  return enrichedShifts;
}

// 2. Nộp đơn đăng ký ca làm việc với kiểm tra RULE VALIDATION nghiêm ngặt
async function registerShifts(userId, shiftIds = []) {
  if (!Array.isArray(shiftIds)) {
    const error = new Error('Danh sách ca làm việc đăng ký không hợp lệ.');
    error.statusCode = 400;
    throw error;
  }

  // Tìm thông tin nhân viên hoặc quản lý
  let employee = SEED_USERS.find(u => u.id === userId || u.email === userId);
  if (isSupabaseConfigured) {
    try {
      const { data } = await supabaseAdmin.from('users').select('*').eq('id', userId).single();
      if (data) employee = data;
    } catch (e) {}
  }

  if (!employee) {
    const error = new Error('Không tìm thấy thông tin nhân viên.');
    error.statusCode = 404;
    throw error;
  }

  const isManager = employee.role === 'Manager' || employee.department === 'Quản lý' || employee.code === 'QL' || employee.id === 'usr-ql';
  const systemState = await systemService.getSystemState();

  // Nhân viên không được phép đăng ký ở Giai đoạn 2 (Hệ thống đang khóa tự động). Quản lý/Chủ quán thì luôn được phép vào làm ca thiếu.
  if (!isManager && systemState.current_phase === 2) {
    const error = new Error('Cổng đăng ký đang bị khóa tự động để hệ thống AI chạy thuật toán xếp ca (Giai đoạn 2).');
    error.statusCode = 400;
    throw error;
  }

  // Lấy chi tiết các ca theo shiftIds
  const selectedShifts = SEED_SHIFTS.filter(s => shiftIds.includes(s.id));
  if (selectedShifts.length !== shiftIds.length) {
    const error = new Error('Một số ca làm việc đăng ký không hợp lệ.');
    error.statusCode = 400;
    throw error;
  }

  // NHÂN VIÊN THƯỜNG: Bắt buộc tuân thủ phân quyền bộ phận và luật tối thiểu (>= 20h và >= 2 ca tối)
  if (!isManager) {
    if (selectedShifts.length === 0) {
      const error = new Error('Danh sách ca làm việc đăng ký không được để trống.');
      error.statusCode = 400;
      throw error;
    }

    // [RULE VALIDATION 1]: Phân quyền bộ phận đăng ký ca
    for (const shift of selectedShifts) {
      const allowedDepts = shift.allowed_departments || [];
      if (!allowedDepts.includes(employee.department)) {
        const error = new Error(
          `Bộ phận "${employee.department}" không được phép đăng ký "${shift.name}" (${shift.shift_key}).`
        );
        error.statusCode = 400;
        throw error;
      }
    }

    // [RULE VALIDATION 2]: Kiểm tra luật tối thiểu (Tổng giờ >= 20h VÀ Số ca tối >= 2)
    let totalHours = 0;
    let nightShiftsCount = 0;

    selectedShifts.forEach(shift => {
      totalHours += shift.duration;
      if (shift.shift_key.startsWith('toi')) {
        nightShiftsCount++;
      }
    });

    if (systemState.current_phase === 1) {
      if (totalHours < 20 || nightShiftsCount < 2) {
        const error = new Error(
          `Đơn đăng ký vi phạm quy định tối thiểu: Hiện tại bạn mới chọn ${totalHours}h (yêu cầu >= 20h) và ${nightShiftsCount} ca tối (yêu cầu >= 2 ca tối).`
        );
        error.statusCode = 400;
        throw error;
      }
    }
  }

  // 3. XỬ LÝ LƯU ĐĂNG KÝ VÀ PHÂN BỔ CA
  if (isManager) {
    // [QUẢN LÝ / CHỦ QUÁN]: Toàn quyền nhận ca hoặc rút khỏi ca thiếu bất kỳ lúc nào
    localRegistrations = localRegistrations.filter(r => r.user_id !== employee.id && r.user_id !== employee.email);
    selectedShifts.forEach(s => {
      localRegistrations.push({
        user_id: employee.id,
        shift_id: s.id,
        is_assigned: true,
        created_at: new Date().toISOString()
      });
    });
    saveLocalRegistrations(localRegistrations);

    if (isSupabaseConfigured) {
      try {
        await supabaseAdmin.from('registrations').delete().eq('user_id', employee.id);
        if (selectedShifts.length > 0) {
          const newRows = selectedShifts.map(s => ({
            user_id: employee.id,
            shift_id: s.id,
            is_assigned: true,
            created_at: new Date().toISOString()
          }));
          await supabaseAdmin.from('registrations').upsert(newRows, { onConflict: 'user_id, shift_id' });
        }
      } catch (e) {}
    }
  } else if (systemState.current_phase === 3) {
    // [GIAI ĐOẠN 3: ĐĂNG KÝ BỔ SUNG CA THIẾU]
    // QUY TẮC CỐT LÕI: GIỮ NGUYÊN LỊCH CŨ (is_assigned: true) VÀ CHẤP NHẬN ĐƠN ĐĂNG KÝ THÊM CỦA NHÂN VIÊN
    
    // 1. Tìm các ca nhân viên đã được phân công chính thức trước đó (Bảo toàn 100%, không bao giờ bị xóa/rút)
    const previousAssignedRegs = localRegistrations.filter(
      r => (r.user_id === employee.id || r.user_id === employee.email) && r.is_assigned
    );
    const previousAssignedIds = new Set(previousAssignedRegs.map(r => r.shift_id));

    // 2. Dọn các bản ghi nguyện vọng cũ chưa được xếp (is_assigned: false) của nhân viên này
    localRegistrations = localRegistrations.filter(
      r => !( (r.user_id === employee.id || r.user_id === employee.email) && !r.is_assigned )
    );

    // 3. Chấp nhận các ca mới đăng ký thêm và phân công trực tiếp vào ca làm việc chính thức (is_assigned: true)
    selectedShifts.forEach(s => {
      const alreadyAssigned = localRegistrations.some(
        r => (r.user_id === employee.id || r.user_id === employee.email) && r.shift_id === s.id && r.is_assigned
      );
      if (!alreadyAssigned) {
        localRegistrations.push({
          user_id: employee.id,
          shift_id: s.id,
          is_assigned: true, // Chấp nhận đơn đăng ký thêm và phân bổ ngay vào ca thiếu
          created_at: new Date().toISOString()
        });
      }
    });

    saveLocalRegistrations(localRegistrations);

    if (isSupabaseConfigured) {
      try {
        const allUserShiftIds = new Set([
          ...previousAssignedIds,
          ...selectedShifts.map(s => s.id)
        ]);
        const newRows = Array.from(allUserShiftIds).map(id => ({
          user_id: employee.id,
          shift_id: id,
          is_assigned: true,
          created_at: new Date().toISOString()
        }));
        await supabaseAdmin.from('registrations').upsert(newRows, { onConflict: 'user_id, shift_id' });
      } catch (e) {}
    }
  } else {
    // [GIAI ĐOẠN 1: ĐĂNG KÝ BAN ĐẦU]
    localRegistrations = localRegistrations.filter(r => r.user_id !== employee.id && r.user_id !== employee.email);
    selectedShifts.forEach(s => {
      localRegistrations.push({
        user_id: employee.id,
        shift_id: s.id,
        is_assigned: false,
        created_at: new Date().toISOString()
      });
    });
    saveLocalRegistrations(localRegistrations);

    if (isSupabaseConfigured) {
      try {
        await supabaseAdmin.from('registrations').delete().eq('user_id', employee.id);
        if (selectedShifts.length > 0) {
          const newRows = selectedShifts.map(s => ({
            user_id: employee.id,
            shift_id: s.id,
            is_assigned: false,
            created_at: new Date().toISOString()
          }));
          await supabaseAdmin.from('registrations').upsert(newRows, { onConflict: 'user_id, shift_id' });
        }
      } catch (e) {}
    }
  }

  // Tự động kiểm tra nếu toàn bộ 21 ca đã được lấp đầy nhân sự sau khi đăng ký bổ sung
  try {
    const allShiftsEnriched = await getAllShifts();
    const allFull = allShiftsEnriched.every(s => s.is_full);
    if (allFull) {
      console.log('🎉 [BPMN UPDATE] Toàn bộ 21 ca đã đủ định biên nhân sự sau khi đăng ký bổ sung!');
      await systemService.updateSystemPhase(systemState.current_phase, systemState.countdown_end_time, 100);
    }
  } catch (e) {}

  // Tính tổng giờ và số ca tối thực tế trong lịch làm của nhân viên
  const myCurrentAssigned = localRegistrations.filter(
    r => (r.user_id === employee.id || r.user_id === employee.email) && (systemState.current_phase === 1 ? true : r.is_assigned)
  );

  let totalHours = 0;
  let nightShiftsCount = 0;
  myCurrentAssigned.forEach(r => {
    const shift = SEED_SHIFTS.find(s => s.id === r.shift_id);
    if (shift) {
      totalHours += shift.duration;
      if (shift.shift_key.startsWith('toi')) nightShiftsCount++;
    }
  });

  return {
    success: true,
    totalHours,
    nightShiftsCount,
    registeredShiftsCount: myCurrentAssigned.length,
    message: isManager 
      ? 'Đã cập nhật ca làm việc của Quản lý. Các ca thiếu đã được bổ sung nhân sự thành công!'
      : (systemState.current_phase === 3
          ? 'Nộp đơn đăng ký bổ sung thành công! Ca mới đã được ghi nhận vào lịch làm việc và toàn bộ lịch cũ của bạn được giữ nguyên.'
          : 'Nộp đơn đăng ký ca làm việc thành công.')
  };
}

// 3. Tiến độ nộp đăng ký lịch của toàn bộ 18 nhân viên
async function getRegistrationProgress() {
  const allEmployees = SEED_USERS.filter(u => u.role === 'Employee');
  let registrations = localRegistrations;

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabaseAdmin.from('registrations').select('*');
      if (!error && data) registrations = data;
    } catch (e) {}
  }

  const shiftsMap = {};
  SEED_SHIFTS.forEach(s => {
    shiftsMap[s.id] = s;
  });

  let submittedCount = 0;
  let validCount = 0;

  const employeeProgress = allEmployees.map(emp => {
    const userRegs = registrations.filter(r => r.user_id === emp.id || r.user_id === emp.email);
    const hasSubmitted = userRegs.length > 0;
    
    let totalHours = 0;
    let nightShiftsCount = 0;
    const registeredShifts = [];

    userRegs.forEach(r => {
      const s = shiftsMap[r.shift_id];
      if (s) {
        totalHours += s.duration;
        if (s.shift_key.startsWith('toi')) {
          nightShiftsCount++;
        }
        registeredShifts.push({
          id: s.id,
          day_key: s.day_key,
          shift_key: s.shift_key,
          name: s.name,
          start_time: s.start_time,
          end_time: s.end_time,
          duration: s.duration,
          is_assigned: !!r.is_assigned
        });
      }
    });

    const isValid = totalHours >= 20 && nightShiftsCount >= 2;

    if (hasSubmitted) submittedCount++;
    if (isValid) validCount++;

    return {
      id: emp.id,
      code: emp.code,
      full_name: emp.full_name,
      email: emp.email,
      department: emp.department,
      role: emp.role,
      has_submitted: hasSubmitted,
      total_hours: totalHours,
      night_shifts_count: nightShiftsCount,
      is_valid: isValid,
      registered_shifts: registeredShifts
    };
  });

  return {
    total_staff: allEmployees.length,
    submitted_count: submittedCount,
    not_submitted_count: allEmployees.length - submittedCount,
    valid_count: validCount,
    employees: employeeProgress
  };
}

// 4. Bảng Timesheet Tháng (Nhân viên x Tuần trong tháng)
function getWeeksOfMonth(year, month) {
  const weeks = [];
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);

  let currentStart = new Date(firstDay);
  let weekNum = 1;

  while (currentStart <= lastDay) {
    const dayOfWeek = currentStart.getDay();
    const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;

    let currentEnd = new Date(currentStart);
    currentEnd.setDate(currentStart.getDate() + daysUntilSunday);
    if (currentEnd > lastDay) {
      currentEnd = new Date(lastDay);
    }

    const pad = n => String(n).padStart(2, '0');
    const startStr = pad(currentStart.getDate()) + '/' + pad(currentStart.getMonth() + 1);
    const endStr = pad(currentEnd.getDate()) + '/' + pad(currentEnd.getMonth() + 1);

    weeks.push({
      week_number: weekNum++,
      start_date: startStr,
      end_date: endStr,
      start_full: new Date(currentStart),
      end_full: new Date(currentEnd),
      label: `Tuần ${weekNum - 1} (${startStr} - ${endStr})`
    });

    currentStart = new Date(currentEnd);
    currentStart.setDate(currentEnd.getDate() + 1);
  }
  return weeks;
}

// Tạo danh sách ca mẫu thực tế và hợp lệ cho nhân viên theo từng tuần
function generateRealisticWeekShifts(emp, weekInfo) {
  const dayLabels = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];
  const shifts = [];
  const seed = (emp.code.charCodeAt(2) * 13 + emp.code.charCodeAt(3) * 7 + weekInfo.week_number * 17) % 100;

  if (emp.department === 'Bếp') {
    // 4-5 ca: gồm Ca Chiều (4h) và Ca Tối (6h), tổng ~20-24h, >=2 ca tối
    const days = [1, 3, 4, 6, 7];
    shifts.push({ day_name: dayLabels[0], date_str: weekInfo.start_date, shift_name: 'Ca Chiều', time: '13:00 - 17:00', hours: 4, department: 'Bếp' });
    shifts.push({ day_name: dayLabels[2], date_str: weekInfo.start_date, shift_name: 'Ca Tối', time: '17:00 - 23:00', hours: 6, department: 'Bếp' });
    shifts.push({ day_name: dayLabels[3], date_str: weekInfo.end_date, shift_name: 'Ca Chiều', time: '13:00 - 17:00', hours: 4, department: 'Bếp' });
    shifts.push({ day_name: dayLabels[5], date_str: weekInfo.end_date, shift_name: 'Ca Tối', time: '17:00 - 23:00', hours: 6, department: 'Bếp' });
    if (seed % 2 === 0) {
      shifts.push({ day_name: dayLabels[6], date_str: weekInfo.end_date, shift_name: 'Ca Chiều', time: '13:00 - 17:00', hours: 4, department: 'Bếp' });
    }
  } else if (emp.department === 'Phục vụ') {
    // 4 ca tối: tổng 24h, 4 ca tối
    shifts.push({ day_name: dayLabels[1], date_str: weekInfo.start_date, shift_name: 'Ca Tối', time: '17:00 - 23:00', hours: 6, department: 'Phục vụ' });
    shifts.push({ day_name: dayLabels[2], date_str: weekInfo.start_date, shift_name: 'Ca Tối', time: '17:00 - 23:00', hours: 6, department: 'Phục vụ' });
    shifts.push({ day_name: dayLabels[4], date_str: weekInfo.end_date, shift_name: 'Ca Tối', time: '17:00 - 23:00', hours: 6, department: 'Phục vụ' });
    shifts.push({ day_name: dayLabels[5], date_str: weekInfo.end_date, shift_name: 'Ca Tối', time: '17:00 - 23:00', hours: 6, department: 'Phục vụ' });
  } else {
    // Pha chế: 4-5 ca: sáng (4h), chiều (4h), tối (6h), tổng ~20-24h, >=2 ca tối
    shifts.push({ day_name: dayLabels[0], date_str: weekInfo.start_date, shift_name: 'Ca Sáng', time: '09:00 - 13:00', hours: 4, department: 'Pha chế' });
    shifts.push({ day_name: dayLabels[1], date_str: weekInfo.start_date, shift_name: 'Ca Chiều', time: '13:00 - 17:00', hours: 4, department: 'Pha chế' });
    shifts.push({ day_name: dayLabels[3], date_str: weekInfo.end_date, shift_name: 'Ca Tối', time: '17:00 - 23:00', hours: 6, department: 'Pha chế' });
    shifts.push({ day_name: dayLabels[5], date_str: weekInfo.end_date, shift_name: 'Ca Tối', time: '17:00 - 23:00', hours: 6, department: 'Pha chế' });
    if (seed % 3 === 0) {
      shifts.push({ day_name: dayLabels[6], date_str: weekInfo.end_date, shift_name: 'Ca Sáng', time: '09:00 - 13:00', hours: 4, department: 'Pha chế' });
    }
  }

  const totalHours = shifts.reduce((s, cur) => s + cur.hours, 0);
  const nightCount = shifts.filter(s => s.shift_name === 'Ca Tối').length;

  return {
    shift_count: shifts.length,
    total_hours: totalHours,
    night_shifts_count: nightCount,
    shifts_detail: shifts
  };
}

async function getMonthlyTimesheet(year = 2026, month = 10) {
  const weeks = getWeeksOfMonth(parseInt(year, 10), parseInt(month, 10));
  const allEmployees = SEED_USERS.filter(u => u.role === 'Employee');

  // Lấy danh sách ca phân công hiện tại từ hệ thống
  const currentShifts = await getAllShifts();
  const dayLabels = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];

  // Nhóm nhân viên theo 3 bộ phận
  const departmentOrder = ['Bếp', 'Phục vụ', 'Pha chế'];
  
  const employeesData = allEmployees.map(emp => {
    // Tìm các ca phân công thực tế của nhân viên này trong tuần hiện tại
    const realAssignedShifts = [];
    currentShifts.forEach(s => {
      const isAssigned = (s.assignments || []).some(a => a.id === emp.id || a.email === emp.email);
      if (isAssigned) {
        realAssignedShifts.push({
          day_name: dayLabels[s.day_key - 1],
          date_str: '',
          shift_name: s.name,
          time: `${s.start_time.slice(0, 5)} - ${s.end_time.slice(0, 5)}`,
          hours: s.duration,
          department: emp.department
        });
      }
    });

    const realHours = realAssignedShifts.reduce((acc, s) => acc + s.hours, 0);
    const realNightCount = realAssignedShifts.filter(s => s.shift_name === 'Ca Tối').length;

    let monthlyTotalShifts = 0;
    let monthlyTotalHours = 0;
    let monthlyTotalNight = 0;

    const weeksData = weeks.map((w, index) => {
      // Tuần cuối cùng của tháng là tuần hiện tại đang chạy lịch
      const isCurrentActiveWeek = (index === weeks.length - 1);
      
      let weekResult;
      if (isCurrentActiveWeek && realAssignedShifts.length > 0) {
        weekResult = {
          week_number: w.week_number,
          label: w.label,
          start_date: w.start_date,
          end_date: w.end_date,
          shift_count: realAssignedShifts.length,
          total_hours: realHours,
          night_shifts_count: realNightCount,
          shifts_detail: realAssignedShifts.map(s => ({ ...s, date_str: w.start_date }))
        };
      } else {
        const generated = generateRealisticWeekShifts(emp, w);
        weekResult = {
          week_number: w.week_number,
          label: w.label,
          start_date: w.start_date,
          end_date: w.end_date,
          ...generated
        };
      }

      monthlyTotalShifts += weekResult.shift_count;
      monthlyTotalHours += weekResult.total_hours;
      monthlyTotalNight += weekResult.night_shifts_count;

      return weekResult;
    });

    return {
      id: emp.id,
      code: emp.code,
      full_name: emp.full_name,
      department: emp.department,
      role: emp.role,
      weeks: weeksData,
      monthly_total: {
        shift_count: monthlyTotalShifts,
        total_hours: monthlyTotalHours,
        night_shifts_count: monthlyTotalNight
      }
    };
  });

  // Gom theo bộ phận
  const groupedDepartments = [
    {
      department: 'Bếp',
      code_range: 'NV01 - NV06',
      count: 6,
      employees: employeesData.filter(e => e.department === 'Bếp')
    },
    {
      department: 'Phục vụ',
      code_range: 'NV07 - NV09',
      count: 3,
      employees: employeesData.filter(e => e.department === 'Phục vụ')
    },
    {
      department: 'Pha chế',
      code_range: 'NV10 - NV18',
      count: 9,
      employees: employeesData.filter(e => e.department === 'Pha chế')
    }
  ];

  return {
    year: parseInt(year, 10),
    month: parseInt(month, 10),
    weeks_meta: weeks.map(w => ({ week_number: w.week_number, label: w.label, start_date: w.start_date, end_date: w.end_date })),
    total_staff: allEmployees.length,
    departments: groupedDepartments
  };
}

function getLocalRegistrations() {
  return localRegistrations;
}

function assignShiftsLocal(assignedPairs) {
  // Tìm các ca mà Quản lý (Chủ quán) đã đăng ký làm để bảo toàn, không bị AI xóa
  const managerUser = SEED_USERS.find(u => u.role === 'Manager') || { id: 'usr-ql' };
  const managerRegs = localRegistrations.filter(r => r.user_id === managerUser.id || r.user_id === managerUser.email);

  // Đặt lại toàn bộ is_assigned = false cho nhân viên thường
  localRegistrations.forEach(r => {
    const isMgr = managerRegs.some(m => m.shift_id === r.shift_id && m.user_id === r.user_id);
    if (!isMgr) {
      r.is_assigned = false;
    } else {
      r.is_assigned = true;
    }
  });

  // Đánh dấu is_assigned = true cho các cặp (user_id, shift_id) được AI chọn
  assignedPairs.forEach(pair => {
    const reg = localRegistrations.find(r => r.shift_id === pair.shift_id && r.user_id === pair.user_id);
    if (reg) {
      reg.is_assigned = true;
    } else {
      localRegistrations.push({
        shift_id: pair.shift_id,
        user_id: pair.user_id,
        is_assigned: true,
        created_at: new Date().toISOString()
      });
    }
  });
  saveLocalRegistrations(localRegistrations);
}

module.exports = {
  getAllShifts,
  registerShifts,
  getRegistrationProgress,
  getMonthlyTimesheet,
  getLocalRegistrations,
  assignShiftsLocal,
  SEED_SHIFTS,
  localRegistrations
};
