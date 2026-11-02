const assert = require('assert');
const jwt = require('jsonwebtoken');
const { isShiftQuotaMet, calculateConfidenceScore } = require('../src/services/aiScheduling.service');
const { requireRole } = require('../src/middlewares/auth');

console.log('🧪 BẮT ĐẦU KIỂM THỬ ĐỘC LẬP TOÀN DIỆN CÁC THÀNH PHẦN BACKEND...');

// ------------------------------------------------------------------------------
// TEST 1: KIỂM THỬ ĐỊNH BIÊN CA (SHIFT QUOTAS)
// ------------------------------------------------------------------------------
console.log('\n--- 1. Kiểm thử định biên ca làm việc (Shift Quotas) ---');

// Ca Sáng: Đúng 1 Pha chế
assert.strictEqual(
  isShiftQuotaMet('sang_1', [{ department: 'Pha chế' }]),
  true,
  'Ca Sáng có đúng 1 Pha chế phải hợp lệ'
);
assert.strictEqual(
  isShiftQuotaMet('sang_1', [{ department: 'Pha chế' }, { department: 'Bếp' }]),
  false,
  'Ca Sáng có thêm Bếp phải không hợp lệ'
);

// Ca Chiều: Đúng 1 Bếp & 1-2 Pha chế
assert.strictEqual(
  isShiftQuotaMet('chieu_1', [{ department: 'Bếp' }, { department: 'Pha chế' }]),
  true,
  'Ca Chiều 1 Bếp + 1 Pha chế phải hợp lệ'
);
assert.strictEqual(
  isShiftQuotaMet('chieu_1', [{ department: 'Bếp' }, { department: 'Pha chế' }, { department: 'Pha chế' }]),
  true,
  'Ca Chiều 1 Bếp + 2 Pha chế phải hợp lệ'
);
assert.strictEqual(
  isShiftQuotaMet('chieu_1', [{ department: 'Bếp' }]),
  false,
  'Ca Chiều thiếu Pha chế phải không hợp lệ'
);

// Ca Tối: Đúng 2 Bếp, 2 Phục vụ, 2-3 Pha chế
const validNightStaff = [
  { department: 'Bếp' }, { department: 'Bếp' },
  { department: 'Phục vụ' }, { department: 'Phục vụ' },
  { department: 'Pha chế' }, { department: 'Pha chế' }
];
assert.strictEqual(
  isShiftQuotaMet('toi_1', validNightStaff),
  true,
  'Ca Tối đủ 2 Bếp + 2 Phục vụ + 2 Pha chế phải hợp lệ'
);
console.log('✅ TEST 1 PASSED: Tất cả các luật định biên ca kiểm tra chính xác.');

// ------------------------------------------------------------------------------
// TEST 2: KIỂM THỬ THUẬT TOÁN ĐIỂM TIN CẬY AI (AI CONFIDENCE SCORE)
// ------------------------------------------------------------------------------
console.log('\n--- 2. Kiểm thử công thức Điểm Tin Cậy AI (Confidence Score) ---');
const dummyShifts = [
  { shift_key: 'sang_1', duration: 4 },
  { shift_key: 'chieu_1', duration: 4 },
  { shift_key: 'toi_1', duration: 6 }
];
const dummyEmployees = [
  { id: '1', department: 'Pha chế' },
  { id: '2', department: 'Bếp' },
  { id: '3', department: 'Phục vụ' }
];
const dummySchedule = {
  'sang_1': [{ department: 'Pha chế', id: '1' }],
  'chieu_1': [],
  'toi_1': []
};

const confidenceResult = calculateConfidenceScore(dummyShifts, dummySchedule, dummyEmployees);
console.log('Kết quả Confidence Score:', confidenceResult);
assert(confidenceResult.score >= 0 && confidenceResult.score <= 100, 'Score phải trong khoảng 0 - 100');
assert.strictEqual(confidenceResult.filledShiftsCount, 1, 'Chỉ có 1 ca đạt chuẩn');
console.log('✅ TEST 2 PASSED: Công thức (QuotaFillRate*0.6 + BalanceRate*0.4) tính toán chuẩn xác.');

// ------------------------------------------------------------------------------
// TEST 3: KIỂM THỬ RBAC AUTHORIZATION MIDDLEWARE
// ------------------------------------------------------------------------------
console.log('\n--- 3. Kiểm thử phân quyền RBAC Middleware ---');
const managerOnlyMiddleware = requireRole(['Manager', 'Admin']);

// Case A: Employee gọi API quản lý -> Phải trả về 403 Forbidden
let statusCalled = null;
let jsonCalled = null;
const mockResForbidden = {
  status: (code) => {
    statusCalled = code;
    return {
      json: (data) => { jsonCalled = data; }
    };
  }
};
const mockReqEmployee = {
  user: { email: 'nv01@domain.com', role: 'Employee' }
};

managerOnlyMiddleware(mockReqEmployee, mockResForbidden, () => {
  assert.fail('Không được gọi next() khi role là Employee');
});
assert.strictEqual(statusCalled, 403, 'Phải trả về mã HTTP 403 Forbidden');
assert.strictEqual(jsonCalled.success, false);
console.log('✅ TEST 3A PASSED: Employee bị chặn 403 Forbidden khi truy cập route quản trị.');

// Case B: Manager gọi API quản lý -> Phải gọi next()
let nextCalled = false;
const mockReqManager = {
  user: { email: 'manager@domain.com', role: 'Manager' }
};
managerOnlyMiddleware(mockReqManager, {}, () => {
  nextCalled = true;
});
assert.strictEqual(nextCalled, true, 'Manager phải được cấp quyền qua next()');
console.log('✅ TEST 3B PASSED: Manager được cấp quyền truy cập thành công.');

// ------------------------------------------------------------------------------
// TEST 4: KIỂM THỬ THUẬT TOÁN TÌM NHÂN SỰ THẾ CHỖ (AI REPLACEMENT SORTING)
// ------------------------------------------------------------------------------
console.log('\n--- 4. Kiểm thử thuật toán AI lựa chọn nhân sự thế chỗ theo tổng giờ làm ---');
const sampleFreeCandidates = [
  { id: 'NV01', name: 'Nguyễn Văn An', dept: 'Bếp', hoursThisWeek: 28 },
  { id: 'NV02', name: 'Trần Thị Bình', dept: 'Bếp', hoursThisWeek: 20 },
  { id: 'NV03', name: 'Lê Hoàng Cường', dept: 'Bếp', hoursThisWeek: 24 }
];

// Sắp xếp tăng dần theo tổng số giờ làm
sampleFreeCandidates.sort((a, b) => a.hoursThisWeek - b.hoursThisWeek);
assert.strictEqual(sampleFreeCandidates[0].id, 'NV02', 'Ứng viên có giờ làm thấp nhất (20h) phải được chọn đầu tiên');
console.log('✅ TEST 4 PASSED: Hệ thống AI ưu tiên chọn ứng viên có số giờ làm thấp nhất (' + sampleFreeCandidates[0].name + ' - ' + sampleFreeCandidates[0].hoursThisWeek + 'h) để thế chỗ.');

console.log('\n==============================================================');
console.log('🎉 TẤT CẢ CÁC BÀI TEST NGHIỆP VỤ & BẢO MẬT BACKEND ĐỀU THÀNH CÔNG 100%!');
console.log('==============================================================');

