/**
 * ==============================================================================
 * 2CE COFFEE ROASTERY · AI OPTIMIZATION & SCHEDULING ENGINE
 * ==============================================================================
 * Thuật toán tối ưu hóa phân bổ 21 ca làm việc dựa trên:
 * 1. Định biên nhân sự bắt buộc từng ca (Quota constraints)
 * 2. Cân bằng tổng số giờ làm việc giữa các nhân sự trong cùng bộ phận (Fairness)
 * 3. Tính toán Điểm Tin Cậy (AI Confidence Score) để ra quyết định phân nhánh BPMN
 */
const { supabaseAdmin, isSupabaseConfigured } = require('../config/supabase');
const { SEED_USERS } = require('./auth.service');
const systemService = require('./system.service');

// Chi tiết định biên thiếu nhân sự theo từng bộ phận (Quản lý/Chủ quán có thể thế chỗ lấp đầy bất kỳ ca thiếu nào)
function getShiftMissingDetails(shiftKey, assignedEmployees) {
  const bepCount = assignedEmployees.filter(e => e.department === 'Bếp').length;
  const phucvuCount = assignedEmployees.filter(e => e.department === 'Phục vụ').length;
  const phacheCount = assignedEmployees.filter(e => e.department === 'Pha chế').length;
  const managerCount = assignedEmployees.filter(e => e.role === 'Manager' || e.department === 'Quản lý' || e.code === 'QL' || e.id === 'usr-ql').length;

  let neededBep = 0;
  let neededPhucvu = 0;
  let neededPhache = 0;
  let remManager = managerCount;

  if (shiftKey.startsWith('sang')) {
    neededPhache = Math.max(0, 1 - phacheCount);
    if (remManager >= neededPhache) {
      remManager -= neededPhache;
      neededPhache = 0;
    }
  } else if (shiftKey.startsWith('chieu')) {
    neededBep = Math.max(0, 1 - bepCount);
    neededPhache = Math.max(0, 1 - phacheCount);
    if (remManager >= neededBep) {
      remManager -= neededBep;
      neededBep = 0;
    }
    if (remManager >= neededPhache) {
      remManager -= neededPhache;
      neededPhache = 0;
    }
  } else if (shiftKey.startsWith('toi')) {
    neededBep = Math.max(0, 2 - bepCount);
    neededPhucvu = Math.max(0, 2 - phucvuCount);
    neededPhache = Math.max(0, 2 - phacheCount);

    const useMgr = (need) => {
      const take = Math.min(remManager, need);
      remManager -= take;
      return need - take;
    };
    neededBep = useMgr(neededBep);
    neededPhucvu = useMgr(neededPhucvu);
    neededPhache = useMgr(neededPhache);
  }

  const missingList = [];
  if (neededBep > 0) missingList.push(`${neededBep} Bếp`);
  if (neededPhucvu > 0) missingList.push(`${neededPhucvu} Phục vụ`);
  if (neededPhache > 0) missingList.push(`${neededPhache} Pha chế`);

  const isFull = missingList.length === 0;

  return {
    is_full: isFull,
    needed_bep: neededBep,
    needed_phucvu: neededPhucvu,
    needed_phache: neededPhache,
    missing_details: missingList,
    missing_text: isFull ? 'Đủ nhân sự' : `Thiếu ${missingList.join(', ')}`
  };
}

// Kiểm tra ca có đạt định biên chuẩn hay không
function isShiftQuotaMet(shiftKey, assignedEmployees) {
  return getShiftMissingDetails(shiftKey, assignedEmployees).is_full;
}

// Tính toán AI Confidence Score
function calculateConfidenceScore(shifts, scheduleMap, allEmployees) {
  let filledShiftsCount = 0;

  shifts.forEach(shift => {
    const assigned = scheduleMap[shift.shift_key] || [];
    if (isShiftQuotaMet(shift.shift_key, assigned)) {
      filledShiftsCount++;
    }
  });

  const quotaFillRate = (filledShiftsCount / shifts.length) * 100;

  // Tính tổng số giờ làm việc của từng nhân viên để đo lường độ cân bằng (Balance)
  const employeeHours = {};
  allEmployees.forEach(emp => {
    employeeHours[emp.id] = 0;
  });

  shifts.forEach(shift => {
    const assigned = scheduleMap[shift.shift_key] || [];
    assigned.forEach(emp => {
      employeeHours[emp.id] = (employeeHours[emp.id] || 0) + shift.duration;
    });
  });

  const hoursValues = Object.values(employeeHours);
  const n = hoursValues.length;
  if (n === 0) return { score: 0, filledShiftsCount, quotaFillRate: 0, balanceRate: 0 };

  const mean = hoursValues.reduce((sum, val) => sum + val, 0) / n;
  const variance = hoursValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);

  // Hệ số biến thiên (Coefficient of Variation: stdDev / mean)
  let balanceRate = 100;
  if (mean > 0) {
    const cv = stdDev / mean;
    balanceRate = Math.max(0, Math.min(100, Math.round((1 - cv) * 100)));
  }

  // Công thức: (Tỷ lệ lấp đầy định biên * 0.6) + (Độ cân bằng giờ làm * 0.4)
  const confidenceScore = Math.round((quotaFillRate * 0.6) + (balanceRate * 0.4));

  return {
    score: confidenceScore,
    filledShiftsCount,
    quotaFillRate: Math.round(quotaFillRate),
    balanceRate: Math.round(balanceRate)
  };
}

/**
 * THUẬT TOÁN TỰ ĐỘNG XẾP CA (AI SCHEDULER)
 * Lấy dữ liệu từ Supabase: shifts, users, registrations
 * Chạy thuật toán tối ưu xếp ca
 * Cập nhật lại cột is_assigned trong bảng registrations và cập nhật system_state
 */
async function runAutoSchedulingAlgorithm() {
  console.log('🤖 [AI SCHEDULER] Bắt đầu chạy thuật toán tối ưu phân bổ ca...');
  const shiftService = require('./shift.service');

  let shifts = [];
  let employees = [];
  let registrations = [];

  if (isSupabaseConfigured) {
    try {
      // 1. Tải danh sách 21 ca làm việc
      const { data: dbShifts } = await supabaseAdmin
        .from('shifts')
        .select('*')
        .order('day_key', { ascending: true })
        .order('start_time', { ascending: true });
      if (dbShifts && dbShifts.length > 0) shifts = dbShifts;

      // 2. Tải danh sách nhân viên
      const { data: dbEmployees } = await supabaseAdmin
        .from('users')
        .select('id, full_name, email, department, role')
        .eq('role', 'Employee');
      if (dbEmployees && dbEmployees.length > 0) employees = dbEmployees;

      // 3. Tải danh sách các đơn đăng ký ca
      const { data: dbRegistrations } = await supabaseAdmin
        .from('registrations')
        .select('id, user_id, shift_id');
      if (dbRegistrations) registrations = dbRegistrations;
    } catch (e) {
      console.log('⚠️ [AI SCHEDULER] Supabase offline, sử dụng dữ liệu cục bộ.');
    }
  }

  // Fallback nếu Supabase chưa cấu hình hoặc không có dữ liệu
  if (!shifts || shifts.length === 0) {
    shifts = shiftService.SEED_SHIFTS;
  }
  if (!employees || employees.length === 0) {
    employees = SEED_USERS.filter(u => u.role === 'Employee');
  }
  if (!registrations || registrations.length === 0) {
    registrations = shiftService.getLocalRegistrations();
  }

  // Map shift_id sang shift_key
  const shiftMapById = {};
  const shiftMapByKey = {};
  shifts.forEach(s => {
    shiftMapById[s.id] = s;
    shiftMapByKey[s.shift_key] = s;
  });

  // Gom các nhân viên đã đăng ký theo từng shift_key
  const candidatesPerShift = {};
  shifts.forEach(s => {
    candidatesPerShift[s.shift_key] = [];
  });

  (registrations || []).forEach(r => {
    const shift = shiftMapById[r.shift_id];
    const emp = employees.find(e => e.id === r.user_id);
    if (shift && emp) {
      candidatesPerShift[shift.shift_key].push(emp);
    }
  });

  // Thuật toán gán ca tối ưu (Greedy with Hour Balancing)
  const employeeHours = {};
  employees.forEach(e => {
    employeeHours[e.id] = 0;
  });

  const finalSchedule = {};
  const assignedRegIds = new Set();

  shifts.forEach(s => {
    finalSchedule[s.shift_key] = [];
  });

  // Xử lý lần lượt từng ca
  shifts.forEach(shift => {
    const key = shift.shift_key;
    const candidates = candidatesPerShift[key] || [];

    // Tách ứng viên theo bộ phận
    const bepCandidates = candidates
      .filter(c => c.department === 'Bếp')
      .sort((a, b) => employeeHours[a.id] - employeeHours[b.id]); // Ưu tiên người ít giờ làm nhất

    const phucvuCandidates = candidates
      .filter(c => c.department === 'Phục vụ')
      .sort((a, b) => employeeHours[a.id] - employeeHours[b.id]);

    const phacheCandidates = candidates
      .filter(c => c.department === 'Pha chế')
      .sort((a, b) => employeeHours[a.id] - employeeHours[b.id]);

    if (key.startsWith('sang')) {
      // Đúng 1 Pha chế
      if (phacheCandidates.length >= 1) {
        const chosen = phacheCandidates[0];
        finalSchedule[key].push(chosen);
        employeeHours[chosen.id] += shift.duration;
      }
    } else if (key.startsWith('chieu')) {
      // Đúng 1 Bếp & 1-2 Pha chế
      if (bepCandidates.length >= 1) {
        const chosenBep = bepCandidates[0];
        finalSchedule[key].push(chosenBep);
        employeeHours[chosenBep.id] += shift.duration;
      }
      const phacheSlots = Math.min(2, phacheCandidates.length);
      for (let i = 0; i < phacheSlots; i++) {
        const chosen = phacheCandidates[i];
        finalSchedule[key].push(chosen);
        employeeHours[chosen.id] += shift.duration;
      }
    } else if (key.startsWith('toi')) {
      // Đúng 2 Bếp, 2 Phục vụ, 2-3 Pha chế
      const bepSlots = Math.min(2, bepCandidates.length);
      for (let i = 0; i < bepSlots; i++) {
        finalSchedule[key].push(bepCandidates[i]);
        employeeHours[bepCandidates[i].id] += shift.duration;
      }

      const phucvuSlots = Math.min(2, phucvuCandidates.length);
      for (let i = 0; i < phucvuSlots; i++) {
        finalSchedule[key].push(phucvuCandidates[i]);
        employeeHours[phucvuCandidates[i].id] += shift.duration;
      }

      const phacheSlots = Math.min(3, phacheCandidates.length);
      for (let i = 0; i < phacheSlots; i++) {
        finalSchedule[key].push(phacheCandidates[i]);
        employeeHours[phacheCandidates[i].id] += shift.duration;
      }
    }
  });

  // Tích hợp các ca mà Quản lý (Chủ quán) đã đăng ký hoặc bổ sung vào làm
  const managerUser = SEED_USERS.find(u => u.role === 'Manager') || { id: 'usr-ql', full_name: 'Quản lý Cửa Hàng', department: 'Quản lý', role: 'Manager' };
  const managerRegs = (registrations || []).filter(r => r.user_id === managerUser.id || r.user_id === managerUser.email);
  managerRegs.forEach(mr => {
    const s = shiftMapById[mr.shift_id];
    if (s && finalSchedule[s.shift_key]) {
      if (!finalSchedule[s.shift_key].some(u => u.id === managerUser.id)) {
        finalSchedule[s.shift_key].push(managerUser);
      }
    }
  });

  // 4. Tính toán Điểm Tin Cậy AI
  const confidence = calculateConfidenceScore(shifts, finalSchedule, employees);
  console.log(`📊 [AI CONFIDENCE SCORE] Score: ${confidence.score}% (Lấp đầy: ${confidence.filledShiftsCount}/21 ca, Độ cân bằng: ${confidence.balanceRate}%)`);

  // 5. Cập nhật kết quả vào bảng registrations
  const assignedPairs = [];
  shifts.forEach(shift => {
    const list = finalSchedule[shift.shift_key] || [];
    list.forEach(emp => {
      assignedPairs.push({ shift_id: shift.id, user_id: emp.id });
    });
  });

  // Cập nhật local
  shiftService.assignShiftsLocal(assignedPairs);

  if (isSupabaseConfigured) {
    try {
      // Reset toàn bộ is_assigned = false trước
      await supabaseAdmin
        .from('registrations')
        .update({ is_assigned: false })
        .neq('id', '00000000-0000-0000-0000-000000000000');

      for (const pair of assignedPairs) {
        await supabaseAdmin
          .from('registrations')
          .update({ is_assigned: true, updated_at: new Date().toISOString() })
          .match({ shift_id: pair.shift_id, user_id: pair.user_id });
      }
    } catch (e) {
      console.log('⚠️ [AI SCHEDULER] Lỗi cập nhật phân công lên Supabase:', e.message);
    }
  }

  // 6. Quyết định phân nhánh BPMN State Machine
  const isAllFilled = confidence.filledShiftsCount === 21;
  const isHighConfidence = confidence.score >= 80;

  let nextPhase = 4;
  let countdownEndTime = null;

  if (isAllFilled && isHighConfidence) {
    // ĐỦ CA & ĐIỂM CAO -> CHUYỂN THẲNG SANG GIAI ĐOẠN 4
    nextPhase = 4;
    countdownEndTime = null;
    console.log('✅ [BPMN GATEWAY] Đủ 21 ca và Confidence >= 80%. Tự động ban hành Lịch chính thức (Giai đoạn 4).');
  } else {
    // THIẾU CA HOẶC CONFIDENCE THẤP -> CHUYỂN SANG GIAI ĐOẠN 3 (ĐẾM NGƯỢC 5 TIẾNG)
    nextPhase = 3;
    const hours = parseInt(process.env.COUNTDOWN_HOURS || '5', 10);
    const countdownDate = new Date(Date.now() + hours * 60 * 60 * 1000);
    countdownEndTime = countdownDate.toISOString();
    console.log(`⚠️ [BPMN GATEWAY] Thiếu ca hoặc Confidence < 80%. Kích hoạt Giai đoạn 3 (Đăng ký bổ sung) với đếm ngược 5h đến: ${countdownEndTime}`);
  }

  // Cập nhật trạng thái system_state
  await systemService.updateSystemPhase(nextPhase, countdownEndTime, confidence.score);

  return {
    nextPhase,
    countdownEndTime,
    confidence,
    schedule: finalSchedule,
    missingShiftsCount: 21 - confidence.filledShiftsCount
  };
}

module.exports = {
  isShiftQuotaMet,
  getShiftMissingDetails,
  calculateConfidenceScore,
  runAutoSchedulingAlgorithm
};

