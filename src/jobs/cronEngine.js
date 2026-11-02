/**
 * ==============================================================================
 * 2CE COFFEE ROASTERY · AUTOMATION CRON ENGINE (NODE-CRON & STATE MACHINE)
 * ==============================================================================
 * Vận hành toàn bộ 4 giai đoạn BPMN tự động ngầm trên Server:
 * 1. Thứ 7 (07:00): Tự động Mở cổng đăng ký ca tuần mới (Giai đoạn 1) & Gửi Email
 * 2. Chủ Nhật (07:00): Tự động Khóa cổng & Chạy AI Xếp ca (Giai đoạn 2)
 *    - Phân nhánh: Đủ ca & Score >= 80% -> Ban hành lịch (GĐ 4)
 *    - Thiếu ca / Score < 80% -> Kích hoạt Bổ sung 5 tiếng (GĐ 3) & Gửi Email khẩn
 * 3. Hết 5 tiếng ở Giai đoạn 3: Tự động chạy lại AI và chốt lịch chính thức (GĐ 4)
 */
const cron = require('node-cron');
const { supabaseAdmin, isSupabaseConfigured } = require('../config/supabase');
const { runAutoSchedulingAlgorithm } = require('../services/aiScheduling.service');
const emailService = require('../services/email.service');
const systemService = require('../services/system.service');
const { SEED_USERS } = require('../services/auth.service');

// Lấy danh sách nhân viên nhận email (hỗ trợ cả Supabase và SEED_USERS)
async function getEmployeeRecipients() {
  if (isSupabaseConfigured) {
    try {
      const { data } = await supabaseAdmin
        .from('users')
        .select('email, full_name')
        .eq('role', 'Employee');
      if (data && data.length > 0) return data;
    } catch (e) {}
  }
  return SEED_USERS.filter(u => u.role === 'Employee');
}

async function checkStartupCatchup() {
  try {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0: Chủ Nhật, 6: Thứ 7
    const hour = now.getHours();
    const state = await systemService.getSystemState();

    // Nếu mở máy vào Chủ Nhật sau 07:00 sáng mà hệ thống vẫn ở Giai đoạn 1: Tự động chạy xếp ca
    if (dayOfWeek === 0 && hour >= 7 && state.current_phase === 1) {
      console.log('⚡ [AUTO CATCHUP] Phát hiện đã sang Chủ Nhật sau 07:00 sáng! Tự động đóng cổng & chạy AI xếp ca...');
      await systemService.updateSystemPhase(2, null);
      const result = await runAutoSchedulingAlgorithm();
      console.log(`✅ [AUTO CATCHUP] AI xếp ca hoàn tất (Điểm tin cậy: ${result.confidence?.score}%). Chuyển sang Giai đoạn ${result.nextPhase}.`);
    } else if (state.current_phase === 3 && state.countdown_end_time) {
      const endTime = new Date(state.countdown_end_time);
      if (now >= endTime) {
        console.log('⚡ [AUTO CATCHUP] Phát hiện đã hết 5 tiếng bổ sung ở Giai đoạn 3! Chốt lịch chính thức sang Giai đoạn 4...');
        const result = await runAutoSchedulingAlgorithm();
        await systemService.updateSystemPhase(4, null, result.confidence?.score);
      }
    }
  } catch (err) {
    console.error('❌ [AUTO CATCHUP ERROR]:', err.message);
  }
}

function initCronJobs() {
  console.log('⏰ [AUTOMATION ENGINE] Khởi chạy các Cron Job tự động hóa BPMN...');

  // Tự động kiểm tra trạng thái ngay khi khởi động máy chủ
  checkStartupCatchup();

  // ----------------------------------------------------------------------------
  // CRON 1: KÍCH HOẠT GIAI ĐOẠN 1 - MỞ CỔNG ĐĂNG KÝ (07:00 SÁNG THỨ 7 HÀNG TUẦN)
  // Cú pháp: 0 phút, 7 giờ, ngày *, tháng *, Thứ 7 (6)
  // ----------------------------------------------------------------------------
  cron.schedule('0 7 * * 6', async () => {
    console.log('🔔 [CRON EVENT - 07:00 THỨ 7] Tự động kích hoạt Giai đoạn 1: Mở cổng đăng ký ca tuần mới.');
    try {
      await systemService.updateSystemPhase(1, null);

      // Lấy danh sách nhân viên để gửi Email thông báo
      const employees = await getEmployeeRecipients();
      if (employees && employees.length > 0) {
        await emailService.sendRegistrationOpenEmail(employees);
      }
    } catch (error) {
      console.error('❌ [CRON ERROR - GIAI ĐOẠN 1]:', error.message);
    }
  });

  // ----------------------------------------------------------------------------
  // CRON 2: KÍCH HOẠT GIAI ĐOẠN 2 - TỰ ĐỘNG ĐÓNG CỔNG & CHẠY AI XẾP CA (07:00 SÁNG CHỦ NHẬT)
  // Cú pháp: 0 phút, 7 giờ, ngày *, tháng *, Chủ Nhật (0)
  // ----------------------------------------------------------------------------
  cron.schedule('0 7 * * 0', async () => {
    console.log('🔔 [CRON EVENT - 07:00 CHỦ NHẬT] Tự động kích hoạt Giai đoạn 2: Khóa cổng đăng ký & Chạy thuật toán AI.');
    try {
      // 1. Tạm thời khóa cổng (Giai đoạn 2)
      await systemService.updateSystemPhase(2, null);

      // 2. Chạy thuật toán tối ưu xếp ca AI
      const result = await runAutoSchedulingAlgorithm();

      // 3. Lấy danh sách nhân viên để gửi email
      const employees = await getEmployeeRecipients();

      if (result.nextPhase === 4) {
        // ĐỦ CA & ĐIỂM TIN CẬY CAO -> GỬI EMAIL CÔNG BỐ LỊCH CHÍNH THỨC
        console.log('🎉 [BPMN RESULT] Thuật toán hoàn tất xuất sắc. Tự động chuyển sang Giai đoạn 4.');
        if (employees && employees.length > 0) {
          await emailService.sendOfficialScheduleEmail(employees, result.confidence.score);
        }
      } else {
        // THIẾU CA HOẶC CONFIDENCE THẤP -> GỬI EMAIL KHẨN CẤP BỔ SUNG CA THIẾU
        console.log(`⚠️ [BPMN RESULT] Phát hiện ${result.missingShiftsCount} ca thiếu. Tự động kích hoạt Giai đoạn 3 (5 giờ).`);
        if (employees && employees.length > 0) {
          await emailService.sendEmergencySupplementaryEmail(employees, result.missingShiftsCount);
        }
      }
    } catch (error) {
      console.error('❌ [CRON ERROR - GIAI ĐOẠN 2]:', error.message);
    }
  });

  // ----------------------------------------------------------------------------
  // CRON 3: KIỂM TRA HẾT HẠN ĐẾM NGƯỢC 5 TIẾNG (GIAI ĐOẠN 3 -> GIAI ĐOẠN 4)
  // Quét mỗi phút 1 lần (* * * * *) kiểm tra countdown_end_time
  // ----------------------------------------------------------------------------
  cron.schedule('* * * * *', async () => {
    try {
      const state = await systemService.getSystemState();

      if (state.current_phase === 3 && state.countdown_end_time) {
        const now = new Date();
        const endTime = new Date(state.countdown_end_time);

        if (now >= endTime) {
          console.log('⏰ [COUNTDOWN TIMEOUT] Đã hết 5 tiếng đăng ký bổ sung ở Giai đoạn 3. Tự động chốt danh sách & chuyển sang Giai đoạn 4.');

          // Chạy lại thuật toán xếp ca tổng hợp
          const result = await runAutoSchedulingAlgorithm();

          // Chốt cứng chuyển sang Giai đoạn 4
          await systemService.updateSystemPhase(4, null, result.confidence.score);

          // Gửi Email thông báo lịch chính thức
          const employees = await getEmployeeRecipients();
          if (employees && employees.length > 0) {
            await emailService.sendOfficialScheduleEmail(employees, result.confidence.score);
          }
        }
      }
    } catch (error) {
      console.error('❌ [CRON ERROR - COUNTDOWN CHECKER]:', error.message);
    }
  });

  console.log('✅ [AUTOMATION ENGINE] Tất cả các Cron Jobs đã sẵn sàng hoạt động.');
}

module.exports = {
  initCronJobs
};

