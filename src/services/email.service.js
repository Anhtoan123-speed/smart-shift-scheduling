/**
 * ==============================================================================
 * 2CE COFFEE ROASTERY · EMAIL SERVICE (NODEMAILER TEMPLATES & SENDING)
 * ==============================================================================
 */
const transporter = require('../config/email');
require('dotenv').config();

const EMAIL_FROM = process.env.EMAIL_FROM || '"2CE Coffee Scheduling" <noreply@2cecoffee.vn>';

// Helper gửi mail bọc try/catch không làm gián đoạn API
async function safeSendMail(options) {
  try {
    const info = await transporter.sendMail({
      from: EMAIL_FROM,
      ...options
    });
    console.log(`📧 [EMAIL SENT] Subject: "${options.subject}" -> To: ${options.to}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ [EMAIL ERROR] Không thể gửi email đến ${options.to}:`, error.message);
    // Log nội dung email ra console để quản trị viên có thể theo dõi khi SMTP offline
    console.log(`📝 [EMAIL LOG DUMP]\nTo: ${options.to}\nSubject: ${options.subject}\nText:\n${options.text || options.html}`);
    return { success: false, error: error.message };
  }
}

// 1. Giai đoạn 1: Mở cổng đăng ký ca làm tuần mới
async function sendRegistrationOpenEmail(recipients) {
  if (!recipients || recipients.length === 0) return;
  const emails = recipients.map(u => u.email).filter(Boolean);

  const subject = '[2CE Coffee] Thông Báo: Mở Cổng Đăng Ký Ca Làm Việc Tuần Mới';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #D8C8B0; border-radius: 12px; background-color: #F7F3EB;">
      <h2 style="color: #654734; border-bottom: 2px solid #D8C8B0; padding-bottom: 10px;">☕ 2CE COFFEE ROASTERY</h2>
      <p style="font-size: 15px; color: #333;">Chào bạn,</p>
      <p style="font-size: 14px; color: #555; line-height: 1.6;">
        Hệ thống tự động đã <strong>MỞ CỔNG ĐĂNG KÝ CA LÀM VIỆC</strong> cho tuần mới (Giai đoạn 1).
      </p>
      <div style="background-color: #EFE8DC; padding: 14px; border-radius: 8px; margin: 15px 0;">
        <p style="margin: 0; font-weight: bold; color: #654734;">Lưu ý quy định đăng ký tối thiểu:</p>
        <ul style="margin: 8px 0 0 20px; color: #444; font-size: 13.5px;">
          <li>Tổng thời gian đăng ký phải đạt tối thiểu <strong>>= 20 giờ/tuần</strong>.</li>
          <li>Phải đăng ký ít nhất <strong>>= 2 Ca Tối</strong> (17:00 - 23:00).</li>
          <li>Thời hạn chốt đơn: <strong>Trước 07:00 sáng Chủ Nhật</strong>.</li>
        </ul>
      </div>
      <p style="font-size: 13px; color: #777;">Vui lòng truy cập hệ thống để hoàn tất đăng ký ca trước thời hạn tự động đóng cổng.</p>
      <hr style="border: none; border-top: 1px solid #D8C8B0; margin: 20px 0;">
      <small style="color: #999;">Hệ thống Quản lý và Xếp lịch Ca làm việc 2CE Coffee · BPMN Automation Engine</small>
    </div>
  `;

  return safeSendMail({
    to: emails.join(', '),
    subject,
    html
  });
}

// 2. Giai đoạn 3: Thông báo khẩn mở đăng ký bổ sung ca thiếu (Đếm ngược 5 giờ)
async function sendEmergencySupplementaryEmail(recipients, missingShiftsCount = 0) {
  if (!recipients || recipients.length === 0) return;
  const emails = recipients.map(u => u.email).filter(Boolean);

  const subject = '[2CE Coffee - Khẩn Cấp] Mở Cổng Đăng Ký Bổ Sung Ca Thiếu (Đếm Ngược 5 Tiếng)';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #D8C8B0; border-radius: 12px; background-color: #F7F3EB;">
      <h2 style="color: #93370D; border-bottom: 2px solid #D8C8B0; padding-bottom: 10px;">⚠️ THÔNG BÁO BỔ SUNG CA KHẨN CẤP</h2>
      <p style="font-size: 15px; color: #333;">Chào các bạn nhân sự 2CE Coffee,</p>
      <p style="font-size: 14px; color: #555; line-height: 1.6;">
        Thuật toán phân bổ tự động phát hiện hiện tại đang có <strong>${missingShiftsCount} ca</strong> chưa đạt đủ định biên nhân sự. Hệ thống đã kích hoạt <strong>Giai đoạn 3: Đăng ký bổ sung</strong>.
      </p>
      <div style="background-color: #FEF3C7; border: 1px solid #FCD34D; padding: 14px; border-radius: 8px; margin: 15px 0;">
        <p style="margin: 0; font-weight: bold; color: #92400E;">Đồng hồ đếm ngược tự động: 5 GIỜ</p>
        <p style="margin: 5px 0 0; font-size: 13.5px; color: #78350F;">
          Sau đúng 5 tiếng, hệ thống sẽ tự động chốt danh sách để chạy xếp ca chính thức. Hãy truy cập hệ thống ngay để nhận thêm ca bổ sung!
        </p>
      </div>
      <p style="font-size: 13px; color: #777;">Các ca còn trống tương ứng với bộ phận của bạn đã được mở trên ứng dụng.</p>
      <hr style="border: none; border-top: 1px solid #D8C8B0; margin: 20px 0;">
      <small style="color: #999;">2CE Coffee Roastery · Smart Shift Scheduling</small>
    </div>
  `;

  return safeSendMail({
    to: emails.join(', '),
    subject,
    html
  });
}

// 3. Giai đoạn 4: Ban hành lịch làm việc chính thức cho tuần mới
async function sendOfficialScheduleEmail(recipients, confidenceScore = 100) {
  if (!recipients || recipients.length === 0) return;
  const emails = recipients.map(u => u.email).filter(Boolean);

  const subject = '[2CE Coffee] Công Bố Lịch Làm Việc Chính Thức Tuần Mới';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #D8C8B0; border-radius: 12px; background-color: #F7F3EB;">
      <h2 style="color: #2D5A27; border-bottom: 2px solid #D8C8B0; padding-bottom: 10px;">📋 LỊCH LÀM VIỆC CHÍNH THỨC</h2>
      <p style="font-size: 15px; color: #333;">Chào các bạn nhân viên,</p>
      <p style="font-size: 14px; color: #555; line-height: 1.6;">
        Thuật toán phân bổ nhân sự tự động đã hoàn thành với <strong>Độ tin cậy: ${confidenceScore}%</strong>.
        Toàn bộ 21 ca làm việc trong tuần đã được ban hành chính thức (Giai đoạn 4).
      </p>
      <div style="background-color: #EFE8DC; padding: 14px; border-radius: 8px; margin: 15px 0;">
        <p style="margin: 0; font-weight: bold; color: #654734;">Hướng dẫn theo dõi lịch:</p>
        <p style="margin: 5px 0 0; font-size: 13.5px; color: #444;">
          Vui lòng đăng nhập hệ thống để kiểm tra các ca làm việc của bạn trong tuần. Nếu có việc bận đột xuất, bạn có thể tạo đơn "Xin nghỉ / Đổi ca" để Quản lý xét duyệt.
        </p>
      </div>
      <hr style="border: none; border-top: 1px solid #D8C8B0; margin: 20px 0;">
      <small style="color: #999;">2CE Coffee Roastery · Smart Shift Scheduling</small>
    </div>
  `;

  return safeSendMail({
    to: emails.join(', '),
    subject,
    html
  });
}

// 4. Thông báo cho Quản lý khi có đơn xin nghỉ mới
async function sendLeaveRequestCreatedEmail(managerEmail, details) {
  const subject = `[2CE Coffee] Đơn Xin Nghỉ Mới Từ ${details.employeeName} (${details.department})`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #D8C8B0; border-radius: 12px; background-color: #F7F3EB;">
      <h3 style="color: #654734; border-bottom: 2px solid #D8C8B0; padding-bottom: 8px;">🔔 ĐƠN XIN NGHỈ ĐỘT XUẤT CẦN DUYỆT</h3>
      <p style="font-size: 14px; color: #333;">Quản lý nhận được yêu cầu xin nghỉ từ nhân viên:</p>
      <div style="background-color: #FFFFFF; padding: 12px 16px; border-radius: 8px; border: 1px solid #D8C8B0; font-size: 13.5px;">
        <p>• <strong>Nhân viên:</strong> ${details.employeeName} (${details.employeeEmail})</p>
        <p>• <strong>Bộ phận:</strong> ${details.department}</p>
        <p>• <strong>Ca xin nghỉ:</strong> ${details.shiftName} (${details.shiftTime})</p>
        <p>• <strong>Lý do:</strong> ${details.reason}</p>
      </div>
      <p style="font-size: 13px; color: #666; margin-top: 15px;">
        Vui lòng đăng nhập hệ thống quản lý để xem xét và duyệt. Hệ thống AI sẽ tự động tìm nhân sự thay thế phù hợp nhất khi đơn được phê duyệt.
      </p>
    </div>
  `;

  return safeSendMail({
    to: managerEmail,
    subject,
    html
  });
}

// 5. Thông báo khi đơn xin nghỉ được phê duyệt (Gửi người xin nghỉ & người được thế chỗ)
async function sendLeaveApprovalEmails({ applicantEmail, applicantName, replacementEmail, replacementName, shiftName, shiftTime }) {
  // Gửi cho người xin nghỉ
  const applicantSubject = '[2CE Coffee] Đơn Xin Nghỉ Của Bạn Đã Được Phê Duyệt';
  const applicantHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #D8C8B0; border-radius: 12px; background-color: #F7F3EB;">
      <h3 style="color: #2D5A27;">✅ ĐƠN XIN NGHỈ ĐÃ ĐƯỢC DUYỆT</h3>
      <p>Chào <strong>${applicantName}</strong>,</p>
      <p>Yêu cầu xin nghỉ của bạn cho ca <strong>${shiftName} (${shiftTime})</strong> đã được Quản lý phê duyệt.</p>
      <p>Hệ thống đã tự động điều phối nhân sự thay thế cho ca này. Chúc bạn có thời gian nghỉ ngơi thoải mái!</p>
    </div>
  `;
  await safeSendMail({ to: applicantEmail, subject: applicantSubject, html: applicantHtml });

  // Gửi cho người được AI điều động thế chỗ
  if (replacementEmail) {
    const replacementSubject = '[2CE Coffee] Thông Báo Điều Động Ca Làm Việc Mới (Thế Chỗ)';
    const replacementHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #D8C8B0; border-radius: 12px; background-color: #F7F3EB;">
        <h3 style="color: #654734;">📋 ĐIỀU ĐỘNG CA LÀM VIỆC MỚI</h3>
        <p>Chào <strong>${replacementName}</strong>,</p>
        <p>Hệ thống AI vừa tự động lựa chọn bạn để hỗ trợ thế chỗ cho ca làm việc:</p>
        <div style="background-color: #EFE8DC; padding: 12px; border-radius: 8px; font-size: 14px;">
          <p style="margin: 0;">• <strong>Ca làm việc:</strong> ${shiftName}</p>
          <p style="margin: 5px 0 0;">• <strong>Khung giờ:</strong> ${shiftTime}</p>
        </div>
        <p style="font-size: 13px; color: #555; margin-top: 10px;">
          Bạn được chọn vì đang có lịch rảnh và có tổng số giờ làm việc trong tuần tối ưu nhất để cân bằng định biên.
        </p>
      </div>
    `;
    await safeSendMail({ to: replacementEmail, subject: replacementSubject, html: replacementHtml });
  }
}

// 6. Thông báo khi đơn xin nghỉ bị từ chối
async function sendLeaveRejectedEmail(applicantEmail, applicantName, shiftName, note) {
  const subject = '[2CE Coffee] Phản Hồi Về Đơn Xin Nghỉ Của Bạn';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #D8C8B0; border-radius: 12px; background-color: #F7F3EB;">
      <h3 style="color: #93370D;">❌ ĐƠN XIN NGHỈ KHÔNG ĐƯỢC CHẤP THUẬN</h3>
      <p>Chào <strong>${applicantName}</strong>,</p>
      <p>Rất tiếc, đơn xin nghỉ của bạn cho ca <strong>${shiftName}</strong> chưa thể phê duyệt vào thời điểm này.</p>
      ${note ? `<p><strong>Ghi chú từ quản lý:</strong> ${note}</p>` : ''}
      <p style="font-size: 13px; color: #555;">Vui lòng liên hệ trực tiếp Quản lý chi nhánh nếu bạn cần hỗ trợ thêm.</p>
    </div>
  `;
  return safeSendMail({ to: applicantEmail, subject, html });
}

module.exports = {
  sendRegistrationOpenEmail,
  sendEmergencySupplementaryEmail,
  sendOfficialScheduleEmail,
  sendLeaveRequestCreatedEmail,
  sendLeaveApprovalEmails,
  sendLeaveRejectedEmail
};

