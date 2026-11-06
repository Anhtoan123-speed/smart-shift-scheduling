/**
 * ==============================================================================
 * 2CE COFFEE ROASTERY · FRONTEND CLIENT APPLICATION (CLEAN RESTFUL INTEGRATION)
 * ==============================================================================
 * - Kết nối trực tiếp 100% với Backend API qua fetch() & JWT Token.
 * - KHÔNG sử dụng mock data, KHÔNG dùng localStorage (sử dụng sessionStorage).
 * - Cấu trúc appState khởi tạo hoàn toàn rỗng và cập nhật từ API Server.
 * - Quản lý 4 giai đoạn BPMN tự động dựa theo trạng thái Server.
 * - Giao diện Theo dõi nhân sự (Timesheet tháng) cho Quản lý.
 * - Chế độ xem Lịch cá nhân ("Lịch của tôi") cho Nhân viên.
 * - Tiến độ nộp lịch của 18 nhân viên & Nút "Thay đổi lịch" khi đã nộp.
 * - Tuân thủ thiết kế Warm Coffee, tuyệt đối không sử dụng icon.
 */

// URL gốc của Backend RESTful API
const API_BASE_URL = (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin.startsWith('http'))
  ? `${window.location.origin}/api`
  : 'http://localhost:5000/api';

// Cấu hình nhãn ngày và khung ca làm việc
const daysOfWeek = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ Nhật"];
const shiftsInfo = [
  { id: "sang", name: "Ca Sáng", time: "09:00 - 13:00", hours: 4 },
  { id: "chieu", name: "Ca Chiều", time: "13:00 - 17:00", hours: 4 },
  { id: "toi", name: "Ca Tối", time: "17:00 - 23:00", hours: 6 }
];

// Cấu trúc trạng thái ứng dụng ban đầu hoàn toàn rỗng (Empty State)
const appState = {
  authToken: null,
  currentUser: null,
  systemState: {
    current_phase: 1,
    countdown_end_time: null,
    ai_confidence_score: 0
  },
  shifts: [],                  // Danh sách 21 ca làm việc nạp từ GET /api/shifts
  requests: [],                // Danh sách đơn xin nghỉ nạp từ GET /api/leave/requests
  registrationProgress: null,  // Tiến độ đăng ký 18 NV nạp từ GET /api/shifts/registration-progress
  timesheetData: null,         // Dữ liệu bảng timesheet tháng nạp từ GET /api/shifts/timesheet
  selectedShiftIds: new Set(), // Set chứa ID các ca mà nhân viên đang tích chọn đăng ký
  myAssignedShiftIds: new Set(),// Set chứa ID các ca mà nhân viên đã được phân công chính thức (Bảo toàn trong Giai đoạn 3)
  hasUserSubmittedReg: false,  // Nhân viên hiện tại đã nộp đơn đăng ký hay chưa
  isEditingRegistration: false,// Nhân viên có đang ở chế độ bấm "Thay đổi lịch" hay không
  scheduleViewMode: 'personal',// 'personal' (Lịch của tôi) hoặc 'matrix' (Lịch toàn quán)
  currentWeekOffset: 0,
  timesheetYear: 2026,
  timesheetMonth: 10,
  timesheetDeptFilter: 'all'
};

// ==============================================================================
// 1. TIỆN ÍCH HEADER VÀ GỌI API (FETCH HELPERS)
// ==============================================================================
function getAuthHeaders() {
  const headers = { "Content-Type": "application/json" };
  const token = appState.authToken || sessionStorage.getItem("2ce_token");
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

// ==============================================================================
// 2. XÁC THỰC NGƯỜI DÙNG (AUTHENTICATION)
// ==============================================================================
async function handleLogin(event) {
  event.preventDefault();
  const usernameInput = document.getElementById("username").value.trim();
  const passwordInput = document.getElementById("password").value.trim();
  const errorEl = document.getElementById("login-error-msg");

  errorEl.style.display = "none";

  try {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: usernameInput, password: passwordInput })
    });

    const result = await res.json();

    if (!res.ok || !result.success) {
      throw new Error(result.message || "Tài khoản hoặc mật khẩu không chính xác.");
    }

    // Lưu token vào sessionStorage (không dùng localStorage)
    const { token, user } = result.data;
    sessionStorage.setItem("2ce_token", token);
    appState.authToken = token;
    appState.currentUser = {
      id: user.id,
      code: user.code || user.avatar_text,
      name: user.full_name,
      email: user.email,
      dept: user.department,
      role: user.role.toLowerCase()
    };

    enterApp();
    await loadInitialData();
    showToast(`Đăng nhập thành công! Xin chào ${appState.currentUser.name}.`, "success");
    checkAndShowLoginNotifications();
  } catch (error) {
    errorEl.innerText = error.message;
    errorEl.style.display = "block";
    showToast(error.message, "warn");
  }
}

// Alias cho tên hàm yêu cầu
const handleLoginSubmit = handleLogin;

function enterApp() {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("main-app").classList.remove("hidden");

  // Cập nhật thông tin Header & Sidebar
  document.getElementById("display-username").innerText = appState.currentUser.name;
  document.getElementById("display-department").innerText = `Bộ phận: ${appState.currentUser.dept}`;

  const roleBadge = document.getElementById("user-role-badge");
  const avatarEl = document.getElementById("sidebar-user-avatar");
  const mgrPanel = document.getElementById("manager-control-panel");
  const empRequestForm = document.getElementById("employee-request-form");
  const menuTimesheet = document.getElementById("menu-btn-timesheet");
  const mobTimesheet = document.getElementById("mob-tab-timesheet");
  const viewToggle = document.getElementById("schedule-view-mode-toggle");

  const isManager = appState.currentUser.role === "manager" || appState.currentUser.role === "admin";

  const topbarUserBadge = document.getElementById("topbar-user-badge");
  if (topbarUserBadge) {
    if (isManager) {
      topbarUserBadge.innerText = "Quản lý";
    } else {
      topbarUserBadge.innerText = `${appState.currentUser.code || 'NV'} • ${appState.currentUser.dept}`;
    }
  }

  if (isManager) {
    roleBadge.innerText = "Quản Lý Cửa Hàng";
    avatarEl.innerText = "QL";
    if (mgrPanel) mgrPanel.classList.remove("hidden");
    if (empRequestForm) empRequestForm.classList.add("hidden");
    if (menuTimesheet) menuTimesheet.classList.remove("hidden");
    if (mobTimesheet) mobTimesheet.classList.remove("hidden");
    if (viewToggle) viewToggle.classList.remove("hidden");
    setScheduleViewMode("matrix");
  } else {
    roleBadge.innerText = `Nhân viên • ${appState.currentUser.dept}`;
    avatarEl.innerText = appState.currentUser.code || "NV";
    if (mgrPanel) mgrPanel.classList.add("hidden");
    if (empRequestForm) empRequestForm.classList.remove("hidden");
    if (menuTimesheet) menuTimesheet.classList.add("hidden");
    if (mobTimesheet) mobTimesheet.classList.add("hidden");
    if (viewToggle) viewToggle.classList.remove("hidden");
    setScheduleViewMode("personal");
  }

  updateWeekHeaders();
  switchTab("schedule");
}

function handleLogout() {
  sessionStorage.removeItem("2ce_token");
  appState.authToken = null;
  appState.currentUser = null;
  appState.shifts = [];
  appState.requests = [];
  appState.registrationProgress = null;
  appState.timesheetData = null;
  appState.selectedShiftIds.clear();
  appState.hasUserSubmittedReg = false;
  appState.isEditingRegistration = false;

  document.getElementById("main-app").classList.add("hidden");
  document.getElementById("login-screen").classList.remove("hidden");
  document.getElementById("username").value = "";
  document.getElementById("password").value = "";
  document.getElementById("login-error-msg").style.display = "none";
  showToast("Đã đăng xuất khỏi hệ thống an toàn.");
}

// ==============================================================================
// 3. TẢI DỮ LIỆU TỪ BACKEND API (DATA FETCHING)
// ==============================================================================
async function loadInitialData() {
  try {
    const headers = getAuthHeaders();

    // 1. Tải trạng thái vận hành hệ thống (BPMN Phase)
    const stateRes = await fetch(`${API_BASE_URL}/system/state`, { headers });
    if (stateRes.ok) {
      const stateJson = await stateRes.json();
      if (stateJson.success && stateJson.data) {
        appState.systemState = stateJson.data;
      }
    }

    // 2. Tải danh sách 21 ca làm việc
    const shiftsRes = await fetch(`${API_BASE_URL}/shifts`, { headers });
    if (shiftsRes.ok) {
      const shiftsJson = await shiftsRes.json();
      if (shiftsJson.success && shiftsJson.data) {
        appState.shifts = shiftsJson.data;
      }
    }

    // 3. Tải danh sách đơn xin nghỉ
    const leaveRes = await fetch(`${API_BASE_URL}/leave/requests`, { headers });
    if (leaveRes.ok) {
      const leaveJson = await leaveRes.json();
      if (leaveJson.success && leaveJson.data) {
        appState.requests = leaveJson.data;
      }
    }

    // 4. Tải tiến độ đăng ký của 18 nhân viên
    try {
      const progressRes = await fetch(`${API_BASE_URL}/shifts/registration-progress`, { headers });
      if (progressRes.ok) {
        const progressJson = await progressRes.json();
        if (progressJson.success && progressJson.data) {
          appState.registrationProgress = progressJson.data;
        }
      }
    } catch (e) {}

    // Kiểm tra nhân viên hoặc quản lý hiện tại đã nộp đơn đăng ký hay chưa
    appState.selectedShiftIds.clear();
    appState.myAssignedShiftIds.clear();
    appState.hasUserSubmittedReg = false;

    if (appState.currentUser) {
      const isMgr = appState.currentUser.role === 'manager' || appState.currentUser.role === 'admin' || appState.currentUser.dept === 'Quản lý';
      const currentPhase = appState.systemState?.current_phase || 1;

      // Nạp danh sách các ca mà tài khoản này ĐÃ ĐƯỢC PHÂN CÔNG CHÍNH THỨC (assignments)
      if (Array.isArray(appState.shifts)) {
        appState.shifts.forEach(shift => {
          const isAssigned = (shift.assignments || []).some(
            u => u.id === appState.currentUser.id || u.email === appState.currentUser.email
          );
          if (isAssigned) {
            appState.myAssignedShiftIds.add(shift.id);
          }
        });
      }

      if (isMgr) {
        // Quản lý: Lấy danh sách các ca mà Quản lý đã đăng ký hoặc được xếp vào làm
        if (Array.isArray(appState.shifts)) {
          appState.shifts.forEach(shift => {
            const inRegs = (shift.registrations || []).some(
              u => u.id === appState.currentUser.id || u.email === appState.currentUser.email
            );
            const inAssigned = (shift.assignments || []).some(
              u => u.id === appState.currentUser.id || u.email === appState.currentUser.email
            );
            if (inRegs || inAssigned) {
              appState.selectedShiftIds.add(shift.id);
              appState.hasUserSubmittedReg = true;
            }
          });
        }
      } else if (currentPhase === 3) {
        // Giai đoạn 3 (Đăng ký bổ sung ca thiếu):
        // BẢO TOÀN LỊCH CŨ: Khởi tạo selectedShiftIds bằng chính toàn bộ các ca đã được xếp chính thức
        appState.selectedShiftIds = new Set(appState.myAssignedShiftIds);
        appState.hasUserSubmittedReg = appState.myAssignedShiftIds.size > 0;
      } else {
        if (appState.registrationProgress && Array.isArray(appState.registrationProgress.employees)) {
          const myInfo = appState.registrationProgress.employees.find(
            e => e.id === appState.currentUser.id || e.email === appState.currentUser.email
          );
          if (myInfo && myInfo.has_submitted) {
            appState.hasUserSubmittedReg = true;
            (myInfo.registered_shifts || []).forEach(s => appState.selectedShiftIds.add(s.id));
          }
        }

        // Fallback kiểm tra từ shifts nếu registrationProgress chưa có
        if (!appState.hasUserSubmittedReg && Array.isArray(appState.shifts)) {
          appState.shifts.forEach(shift => {
            const isUserRegistered = (shift.registrations || []).some(
              u => u.id === appState.currentUser.id || u.email === appState.currentUser.email
            ) || (shift.assignments || []).some(
              u => u.id === appState.currentUser.id || u.email === appState.currentUser.email
            );
            if (isUserRegistered) {
              appState.selectedShiftIds.add(shift.id);
              appState.hasUserSubmittedReg = true;
            }
          });
        }
      }
    }

    // Tải dữ liệu timesheet nếu là quản lý
    if (appState.currentUser && (appState.currentUser.role === 'manager' || appState.currentUser.role === 'admin')) {
      await loadTimesheetData(appState.timesheetYear, appState.timesheetMonth);
    }

    renderAll();
  } catch (error) {
    console.error("Lỗi khi tải dữ liệu từ Backend:", error);
    showToast("Không thể đồng bộ dữ liệu với máy chủ. Vui lòng thử lại.", "warn");
  }
}

function renderAll() {
  updateSystemPhaseUI();
  renderScheduleView();
  renderRegistrationProgress();
  renderRegisterTable();
  renderLeaveRequestOptions();
  renderRequestsTable();
  renderTimesheetTable();
}

// ==============================================================================
// 4. HIỂN THỊ TRẠNG THÁI LUỒNG CÔNG VIỆC BPMN (SYSTEM STATE UI)
// ==============================================================================
function updateSystemPhaseUI() {
  const badgeEl = document.getElementById("system-phase-badge");
  const timeDisplayEl = document.getElementById("current-time-display");
  const phase = appState.systemState?.current_phase || 1;

  if (badgeEl) {
    if (phase === 1) {
      badgeEl.innerText = "Giai đoạn 1: Đang mở đăng ký ca";
      badgeEl.className = "phase-badge";
    } else if (phase === 2) {
      badgeEl.innerText = "Giai đoạn 2: Tự động khóa & AI xếp ca";
      badgeEl.className = "phase-badge warning";
    } else if (phase === 3) {
      badgeEl.innerText = "Giai đoạn 3: Đăng ký bổ sung ca thiếu (Đếm ngược 5h)";
      badgeEl.className = "phase-badge danger";
    } else if (phase === 4) {
      badgeEl.innerText = "Giai đoạn 4: Lịch chính thức đã ban hành";
      badgeEl.className = "phase-badge valid";
    }
  }

  if (timeDisplayEl) {
    if (phase === 3 && appState.systemState?.countdown_end_time) {
      const endTime = new Date(appState.systemState.countdown_end_time);
      const diffMs = endTime - new Date();
      if (diffMs > 0) {
        const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        timeDisplayEl.innerText = `Bổ sung ca (Còn ${diffHrs}h ${diffMins}m)`;
      } else {
        timeDisplayEl.innerText = "Đã hết thời hạn bổ sung (Chờ xếp ca)";
      }
    } else if (phase === 1) {
      timeDisplayEl.innerText = "Thứ 7: Mở cổng đăng ký";
    } else if (phase === 2) {
      timeDisplayEl.innerText = "Chủ Nhật: AI đang xếp ca";
    } else {
      timeDisplayEl.innerText = "Lịch tuần chính thức";
    }
  }
}

// ==============================================================================
// 5. ĐIỀU KHIỂN CHẾ ĐỘ XEM LỊCH & LỊCH CÁ NHÂN ("LỊCH CỦA TÔI")
// ==============================================================================
function setScheduleViewMode(mode) {
  appState.scheduleViewMode = mode;
  const btnPersonal = document.getElementById("btn-view-personal");
  const btnMatrix = document.getElementById("btn-view-matrix");
  const viewPersonal = document.getElementById("personal-schedule-view");
  const viewMatrix = document.getElementById("matrix-schedule-view");

  if (mode === "personal") {
    btnPersonal?.classList.add("active");
    btnMatrix?.classList.remove("active");
    viewPersonal?.classList.remove("hidden");
    viewMatrix?.classList.add("hidden");
    renderPersonalSchedule();
  } else {
    btnMatrix?.classList.add("active");
    btnPersonal?.classList.remove("active");
    viewMatrix?.classList.remove("hidden");
    viewPersonal?.classList.add("hidden");
    renderScheduleMatrix();
  }
}

function renderScheduleView() {
  if (appState.scheduleViewMode === "personal") {
    renderPersonalSchedule();
  } else {
    renderScheduleMatrix();
  }
}

function renderPersonalSchedule() {
  const container = document.getElementById("personal-schedule-view");
  if (!container) return;

  const user = appState.currentUser;
  if (!user) {
    container.innerHTML = `<p style="padding: 20px; color: var(--color-sub);">Vui lòng đăng nhập để xem lịch cá nhân.</p>`;
    return;
  }

  const dates = getWeekDates(appState.currentWeekOffset);
  const weekStartStr = formatDateDDMM(dates[0]);
  const weekEndStr = formatDateDDMM(dates[6]);
  const yearStr = dates[0].getFullYear();

  // Tìm các ca được phân công (assignments) cho nhân viên này trong tuần
  const myAssignedShifts = [];
  if (Array.isArray(appState.shifts)) {
    appState.shifts.forEach(shift => {
      const isAssigned = (shift.assignments || []).some(
        u => u.id === user.id || u.email === user.email
      );
      if (isAssigned) {
        myAssignedShifts.push(shift);
      }
    });
  }

  const totalHours = myAssignedShifts.reduce((sum, s) => sum + s.duration, 0);
  const nightCount = myAssignedShifts.filter(s => s.shift_key && s.shift_key.startsWith("toi")).length;

  const isMgr = user.role === 'manager' || user.dept === 'Quản lý';
  const hoursStatus = isMgr ? '<small style="color: var(--primary-color); font-weight:700;">(Chủ quán)</small>' : (totalHours >= 20 ? '<small style="color: var(--valid-text); font-weight:700;">(Đạt)</small>' : '<small style="color: var(--invalid-text); font-weight:700;">(Chưa đủ 20h)</small>');
  const nightStatus = isMgr ? '<small style="color: var(--primary-color); font-weight:700;">(Tự do)</small>' : (nightCount >= 2 ? '<small style="color: var(--valid-text); font-weight:700;">(Đạt)</small>' : '<small style="color: var(--invalid-text); font-weight:700;">(Chưa đủ 2)</small>');

  // Banner thống kê cá nhân
  let bannerHtml = `
    <div class="personal-summary-banner">
      <div class="personal-summary-meta">
        <h4>Lịch Làm Việc Cá Nhân: ${user.name} (${user.code || 'NV'})</h4>
        <p>Bộ phận: <strong>${user.dept}</strong> • Tuần từ <strong>${weekStartStr}</strong> đến <strong>${weekEndStr}</strong> (${yearStr})</p>
      </div>
      <div class="personal-summary-stats">
        <div class="personal-stat-chip">
          <span>Tổng số ca:</span> <strong>${myAssignedShifts.length} ca</strong>
        </div>
        <div class="personal-stat-chip">
          <span>Tổng giờ làm:</span> <strong>${totalHours}h</strong> ${hoursStatus}
        </div>
        <div class="personal-stat-chip">
          <span>Ca tối:</span> <strong>${nightCount} ca</strong> ${nightStatus}
        </div>
      </div>
    </div>
  `;

  // Danh sách 7 ngày trong tuần
  let daysHtml = "";
  for (let d = 1; d <= 7; d++) {
    const dayDate = dates[d - 1];
    const dateStr = formatDateDDMM(dayDate);
    const dayLabel = `${daysOfWeek[d - 1]} (${dateStr})`;

    // Tìm ca của nhân viên trong ngày này
    const shiftsOnDay = myAssignedShifts.filter(s => s.day_key === d);

    if (shiftsOnDay.length > 0) {
      const shiftCards = shiftsOnDay.map(shift => {
        // Đồng nghiệp cùng ca
        const colleagues = (shift.assignments || [])
          .filter(u => u.id !== user.id && u.email !== user.email)
          .map(u => `${u.full_name} (${u.department})`)
          .join(", ");

        const colleaguesText = colleagues
          ? `Đồng nghiệp cùng ca: <strong>${colleagues}</strong>`
          : `Ca làm việc độc lập`;

        return `
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; flex-wrap: wrap;">
            <div>
              <span class="personal-shift-badge">${shift.name}</span>
              <span class="personal-shift-time" style="margin-left: 8px;">${shift.start_time.slice(0, 5)} - ${shift.end_time.slice(0, 5)} (${shift.duration}h)</span>
            </div>
            <button class="btn-personal-leave" onclick="quickRequestLeave(${shift.id})">
              Xin Nghỉ Ca Này
            </button>
          </div>
          <div class="personal-colleagues">
            ${colleaguesText}
          </div>
        `;
      }).join("<hr style='border: none; border-top: 1px dashed var(--border-color); margin: 6px 0;'>");

      daysHtml += `
        <div class="personal-day-card has-shift">
          <div class="personal-day-header">
            <span>${dayLabel}</span>
            <span class="shift-status valid">Có ca làm</span>
          </div>
          ${shiftCards}
        </div>
      `;
    } else {
      daysHtml += `
        <div class="personal-day-card no-shift">
          <div class="personal-day-header">
            <span>${dayLabel}</span>
            <span style="font-size: 11.5px; color: var(--color-sub); font-weight: 500;">Nghỉ ngơi</span>
          </div>
          <p style="font-size: 12px; color: var(--color-sub); margin: 6px 0;">Không có ca làm việc được phân công trong ngày này.</p>
        </div>
      `;
    }
  }

  let emptyNoticeHtml = "";
  if (myAssignedShifts.length === 0) {
    const phase = appState.systemState?.current_phase || 1;
    let phaseMsg = "Hệ thống đang ở Giai đoạn đăng ký ca (Phase 1).";
    if (phase === 2) phaseMsg = "Hệ thống đang tự động xếp ca (Phase 2).";
    if (phase === 3) phaseMsg = "Hệ thống đang mở đăng ký bổ sung ca thiếu (Phase 3).";

    emptyNoticeHtml = `
      <div class="alert-note" style="background: var(--warning-bg); color: var(--warning-text); border: 1px solid var(--warning-border); margin-bottom: 16px;">
        <strong>Chưa có ca làm việc chính thức:</strong> Bạn chưa có ca được xếp trong tuần này (${phaseMsg}). Vui lòng vào mục "Đăng Ký Lịch Làm" để nộp lịch ca mong muốn.
        <div style="margin-top: 10px;">
          <button class="btn-primary" style="font-size: 12px; padding: 6px 14px;" onclick="switchTab('register')">
            Đến Mục Đăng Ký Lịch Làm
          </button>
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    ${bannerHtml}
    ${emptyNoticeHtml}
    <div class="personal-days-grid" style="margin-top: 16px;">
      ${daysHtml}
    </div>
  `;
}

function quickRequestLeave(shiftId) {
  switchTab("requests");
  const selectEl = document.getElementById("req-shift-select");
  if (selectEl) {
    selectEl.value = shiftId;
  }
  const reasonEl = document.getElementById("req-reason");
  if (reasonEl) {
    reasonEl.focus();
  }
  showToast("Đã chọn sẵn ca làm việc. Vui lòng nhập lý do và bấm gửi đơn.", "info");
}

// ==============================================================================
// 6. HIỂN THỊ MA TRẬN 21 CA LÀM VIỆC (LỊCH TOÀN QUÁN)
// ==============================================================================
function renderScheduleMatrix() {
  const tbody = document.getElementById("schedule-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!appState.shifts || appState.shifts.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="8" style="text-align: center; color: var(--color-sub); padding: 30px;">Đang tải dữ liệu lịch làm việc từ máy chủ...</td>`;
    tbody.appendChild(tr);
    return;
  }

  // 3 Hàng ca: Sáng, Chiều, Tối
  shiftsInfo.forEach(shiftInfo => {
    const tr = document.createElement("tr");

    // Cột 1: Tên ca & Khung giờ
    const tdShiftName = document.createElement("td");
    tdShiftName.style.background = "var(--coffee-soft)";
    tdShiftName.style.verticalAlign = "middle";
    tdShiftName.innerHTML = `
      <div style="font-weight: 800; color: var(--primary-color); font-size: 13.5px;">
        ${shiftInfo.name}
      </div>
      <div style="font-size: 11.5px; color: var(--color-sub); font-family: var(--font-mono); margin-top: 3px;">
        ${shiftInfo.time} (${shiftInfo.hours}h)
      </div>
    `;
    tr.appendChild(tdShiftName);

    // 7 Cột tiếp theo: Thứ 2 -> Chủ Nhật
    for (let d = 1; d <= 7; d++) {
      const td = document.createElement("td");
      td.className = "shift-cell";

      const shiftKey = `${shiftInfo.id}_${d}`;
      const shiftData = appState.shifts.find(s => s.shift_key === shiftKey || (s.day_key === d && s.name === shiftInfo.name));
      const assigned = shiftData ? (shiftData.assignments || []) : [];
      const isFull = shiftData ? shiftData.is_full : false;

      const missingText = shiftData ? (shiftData.missing_text || "Thiếu người") : "Thiếu người";
      const statusHtml = isFull
        ? `<span class="shift-status valid">Đủ nhân sự</span>`
        : `<span class="shift-status invalid" title="${missingText}">${missingText}</span>`;

      let staffListHtml = "";
      if (assigned.length > 0) {
        staffListHtml = assigned
          .map(emp => {
            let deptClass = "dept-bep";
            if (emp.department === "Phục vụ") deptClass = "dept-phucvu";
            if (emp.department === "Pha chế") deptClass = "dept-phache";
            if (emp.department === "Quản lý" || emp.role === "manager" || emp.role === "Manager") deptClass = "dept-quanly";
            return `<span class="assigned-item">• <strong>${emp.full_name}</strong> <small class="${deptClass}">(${emp.department || 'Quản lý'})</small></span>`;
          })
          .join("");
      } else {
        staffListHtml = `<span style="color: var(--color-sub); font-size: 11.5px; font-style: italic;">Chưa xếp nhân sự</span>`;
      }

      const isManager = appState.currentUser && (appState.currentUser.role === 'manager' || appState.currentUser.role === 'admin' || appState.currentUser.dept === 'Quản lý');
      const isManagerInThisShift = isManager && shiftData && assigned.some(u => u.id === appState.currentUser.id || u.email === appState.currentUser.email);

      let managerActionHtml = "";
      if (isManager && shiftData) {
        if (!isFull && !isManagerInThisShift) {
          managerActionHtml = `<div style="margin-top: 6px;"><button class="btn-quick-mgr join" onclick="managerToggleShift(${shiftData.id}, true)" title="Chủ quán nhận ca làm này để bù đủ nhân sự">+ Nhận ca</button></div>`;
        } else if (isManagerInThisShift) {
          managerActionHtml = `<div style="margin-top: 6px;"><button class="btn-quick-mgr leave" onclick="managerToggleShift(${shiftData.id}, false)" title="Chủ quán rút khỏi ca làm này">- Rút khỏi ca</button></div>`;
        }
      }

      td.innerHTML = `
        <div class="shift-cell-header">
          <span class="day-label">${daysOfWeek[d - 1]}</span>
          ${statusHtml}
        </div>
        <div class="assigned-list">
          ${staffListHtml}
        </div>
        ${managerActionHtml}
      `;

      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  });
}

// Hàm thao tác nhanh cho Quản lý nhận hoặc rút khỏi ca làm việc còn thiếu
async function managerToggleShift(shiftId, isJoin) {
  if (isJoin) {
    appState.selectedShiftIds.add(shiftId);
  } else {
    appState.selectedShiftIds.delete(shiftId);
  }

  try {
    const shiftIdsArray = Array.from(appState.selectedShiftIds);
    const res = await fetch(`${API_BASE_URL}/shifts/register`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ shift_ids: shiftIdsArray })
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.message || "Không thể cập nhật ca làm việc của Quản lý.");
    }

    showToast(isJoin 
      ? "Quản lý (Chủ quán) đã nhận ca làm này thành công để bù đủ nhân sự!" 
      : "Quản lý đã rút khỏi ca làm này.", "success");
    await loadInitialData();
  } catch (err) {
    showToast(err.message, "warn");
  }
}

// ==============================================================================
// 7. TIẾN ĐỘ ĐĂNG KÝ CỦA 18 NHÂN VIÊN (DÀNH CHO QUẢN LÝ)
// ==============================================================================
function renderRegistrationProgress() {
  const container = document.getElementById("reg-progress-list-container");
  const kpiProgress = document.getElementById("kpi-reg-progress");
  const badgeSubmitted = document.getElementById("stat-submitted-badge");
  const badgeUnsubmitted = document.getElementById("stat-unsubmitted-badge");

  if (!appState.registrationProgress) return;
  const { total_staff, submitted_count, not_submitted_count, valid_count, employees } = appState.registrationProgress;

  if (kpiProgress) kpiProgress.innerText = `${submitted_count} / ${total_staff}`;
  if (badgeSubmitted) badgeSubmitted.innerText = `Đã gửi lịch: ${submitted_count} / ${total_staff}`;
  if (badgeUnsubmitted) badgeUnsubmitted.innerText = `Chưa gửi: ${not_submitted_count} / ${total_staff}`;

  if (!container) return;

  const bepStaff = employees.filter(e => e.department === "Bếp");
  const phucvuStaff = employees.filter(e => e.department === "Phục vụ");
  const phacheStaff = employees.filter(e => e.department === "Pha chế");

  function renderStaffGroup(title, staffList) {
    const itemsHtml = staffList.map(emp => {
      let statusBadge = "";
      if (emp.has_submitted) {
        statusBadge = `
          <div style="text-align: right;">
            <span class="badge-submitted">Đã nộp (${emp.total_hours}h • ${emp.night_shifts_count} tối)</span>
            ${emp.is_valid ? '<small style="display:block; color: var(--valid-text); font-weight:700; font-size:10.5px; margin-top:2px;">Đạt chuẩn</small>' : '<small style="display:block; color: var(--invalid-text); font-weight:700; font-size:10.5px; margin-top:2px;">Chưa đạt chuẩn</small>'}
          </div>
        `;
      } else {
        statusBadge = `
          <div style="text-align: right;">
            <span class="badge-unsubmitted">Chưa gửi lịch</span>
          </div>
        `;
      }

      return `
        <div class="progress-staff-item ${emp.has_submitted ? 'submitted' : ''}">
          <div class="progress-staff-meta">
            <strong>${emp.full_name} <small style="color: var(--color-sub);">(${emp.code})</small></strong>
            <small>${emp.department} • ${emp.email}</small>
          </div>
          ${statusBadge}
        </div>
      `;
    }).join("");

    return `
      <div class="progress-dept-group">
        <div class="progress-dept-title">${title} (${staffList.length} nhân sự)</div>
        <div class="progress-staff-grid">
          ${itemsHtml}
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    ${renderStaffGroup("BỘ PHẬN BẾP (NV01 - NV06)", bepStaff)}
    ${renderStaffGroup("BỘ PHẬN PHỤC VỤ (NV07 - NV09)", phucvuStaff)}
    ${renderStaffGroup("BỘ PHẬN PHA CHẾ (NV10 - NV18)", phacheStaff)}
  `;
}

// ==============================================================================
// 8. ĐĂNG KÝ CA LÀM VIỆC & NÚT "THAY ĐỔI LỊCH" (TAB 2: ĐĂNG KÝ)
// ==============================================================================
function toggleEditRegistration() {
  const currentPhase = appState.systemState?.current_phase || 1;
  if (currentPhase === 2 || currentPhase === 4) {
    showToast("Cổng đăng ký đang đóng do hệ thống ở Giai đoạn " + currentPhase + ".", "warn");
    return;
  }

  appState.isEditingRegistration = !appState.isEditingRegistration;
  if (appState.isEditingRegistration) {
    showToast("Đã mở khóa form. Bạn có thể chọn lại các ca làm việc mong muốn.", "info");
  } else {
    showToast("Đã hủy chế độ sửa lịch và giữ lại các ca đã gửi trước đó.", "info");
  }
  renderRegisterTable();
}

function renderRegisterTable() {
  const tbody = document.getElementById("register-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  const isManager = appState.currentUser && (appState.currentUser.role === 'manager' || appState.currentUser.role === 'admin' || appState.currentUser.dept === 'Quản lý');
  const userDept = appState.currentUser?.dept || "";
  const currentPhase = appState.systemState?.current_phase || 1;

  // Cập nhật banner thông báo trên bảng đăng ký dựa theo giai đoạn
  const ruleAlertEl = document.getElementById("reg-rule-alert");
  if (ruleAlertEl) {
    if (isManager) {
      ruleAlertEl.className = "alert-note";
      ruleAlertEl.style.background = "#F5ECE5";
      ruleAlertEl.style.border = "1px solid var(--border-color)";
      ruleAlertEl.style.color = "var(--primary-color)";
      ruleAlertEl.innerHTML = `<strong>Chế độ Quản lý / Chủ quán:</strong> Bạn có quyền tự do nhận và phân bổ vào bất kỳ ca nào để lấp đầy các vị trí còn thiếu nhân sự.`;
    } else if (currentPhase === 3) {
      ruleAlertEl.className = "alert-note";
      ruleAlertEl.style.background = "#F0F9FF";
      ruleAlertEl.style.border = "1px solid #BAE6FD";
      ruleAlertEl.style.color = "#0369A1";
      ruleAlertEl.innerHTML = `<strong>Giai đoạn 3 (Đăng ký bổ sung ca thiếu):</strong> Toàn bộ <strong>lịch làm việc cũ của bạn đã được giữ nguyên hoàn toàn</strong>. Hãy tích chọn thêm các ca còn thiếu nhân sự bên dưới để nộp đăng ký bổ sung!`;
    } else if (currentPhase === 1) {
      ruleAlertEl.className = "alert-note warn";
      ruleAlertEl.style.background = "";
      ruleAlertEl.style.border = "";
      ruleAlertEl.style.color = "";
      ruleAlertEl.innerHTML = `<strong>Quy định tối thiểu:</strong> Bạn cần đăng ký ít nhất <strong>20 giờ</strong> và ít nhất <strong>2 Ca Tối</strong> trong tuần để nộp đơn hợp lệ.`;
    } else {
      ruleAlertEl.className = "alert-note warn";
      ruleAlertEl.innerHTML = `<strong>Thông báo:</strong> Cổng đăng ký hiện đang đóng (Giai đoạn ${currentPhase}).`;
    }
  }

  // Khóa form ở Giai đoạn 2 và Giai đoạn 4 đối với nhân viên thường (Quản lý/Chủ quán luôn được phép đăng ký ca thiếu)
  const isPhaseLocked = !isManager && (currentPhase === 2 || currentPhase === 4);

  // Nếu nhân viên đã nộp đơn và không ở chế độ sửa thì khóa checkbox (chỉ áp dụng ở Giai đoạn 1)
  const isFormLockedForEdit = !isManager && currentPhase === 1 && appState.hasUserSubmittedReg && !appState.isEditingRegistration;

  shiftsInfo.forEach(shiftInfo => {
    const tr = document.createElement("tr");

    // Cột Tên ca
    const tdShiftName = document.createElement("td");
    tdShiftName.style.background = "var(--coffee-soft)";
    tdShiftName.style.verticalAlign = "middle";
    tdShiftName.innerHTML = `
      <div style="font-weight: 800; color: var(--primary-color); font-size: 13px;">
        ${shiftInfo.name}
      </div>
      <div style="font-size: 11px; color: var(--color-sub); font-family: var(--font-mono);">
        ${shiftInfo.time} (${shiftInfo.hours}h)
      </div>
    `;
    tr.appendChild(tdShiftName);

    // 7 Cột Thứ 2 -> Chủ Nhật
    for (let d = 1; d <= 7; d++) {
      const td = document.createElement("td");
      td.style.textAlign = "center";
      td.style.verticalAlign = "middle";

      const shiftKey = `${shiftInfo.id}_${d}`;
      const shiftData = appState.shifts.find(s => s.shift_key === shiftKey || (s.day_key === d && s.name === shiftInfo.name));
      const shiftId = shiftData ? shiftData.id : null;

      // 1. Kiểm tra ca này nhân viên ĐÃ ĐƯỢC PHÂN CÔNG CHÍNH THỨC từ trước hay chưa
      const isMyAssignedShift = shiftId && appState.myAssignedShiftIds && appState.myAssignedShiftIds.has(shiftId);

      // 2. Kiểm tra quyền bộ phận (Quản lý/Chủ quán có quyền đăng ký mọi ca)
      let allowed = true;
      if (!isManager) {
        if (userDept === "Bếp" && shiftInfo.id === "sang") allowed = false;
        if (userDept === "Phục vụ" && (shiftInfo.id === "sang" || shiftInfo.id === "chieu")) allowed = false;
      }

      // Trạng thái ca: Đủ hay thiếu người
      const isShiftFull = shiftData ? shiftData.is_full : false;

      // TRƯỜNG HỢP 1: Ca này nhân viên ĐÃ ĐƯỢC XẾP LỊCH CHÍNH THỨC (Bảo toàn 100%, không bị rút)
      if (isMyAssignedShift) {
        td.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;">
            <input type="checkbox" class="shift-check" checked disabled title="Lịch làm việc chính thức đã được xếp (Bảo toàn nguyên vẹn)">
            <span style="background: #E8F5E9; color: #2E7D32; font-size: 10.5px; font-weight: 700; padding: 2px 6px; border-radius: 4px; display: inline-block;">
              Đã xếp ca (Giữ nguyên)
            </span>
          </div>
        `;
        if (shiftId) appState.selectedShiftIds.add(shiftId);
      }
      // TRƯỜNG HỢP 2: Không thuộc bộ phận
      else if (!allowed) {
        td.innerHTML = `<span style="color: var(--color-sub); font-size: 11px;">Không thuộc bộ phận</span>`;
      }
      // TRƯỜNG HỢP 3: Giai đoạn 3 (Đăng ký bổ sung) và ca này ĐÃ ĐỦ NGƯỜI (người khác đã lấp đầy)
      else if (!isManager && currentPhase === 3 && isShiftFull) {
        td.innerHTML = `<span style="color: #6C757D; font-size: 11.5px; font-weight: 500;">Đã đủ người</span>`;
      }
      // TRƯỜNG HỢP 4: Ca còn trống/thiếu người HOẶC Quản lý HOẶC Giai đoạn 1
      else {
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "shift-check";
        checkbox.checked = shiftId && appState.selectedShiftIds.has(shiftId);
        checkbox.disabled = isPhaseLocked || isFormLockedForEdit;

        checkbox.onchange = (e) => {
          if (shiftId) {
            if (e.target.checked) {
              appState.selectedShiftIds.add(shiftId);
            } else {
              appState.selectedShiftIds.delete(shiftId);
            }
            updateRegistrationStats();
          }
        };

        td.appendChild(checkbox);

        // Hiển thị nhãn rõ ràng ca nào đang thiếu người và thiếu bộ phận nào
        if (shiftData) {
          const hint = document.createElement("div");
          hint.style.fontSize = "10.5px";
          hint.style.marginTop = "3px";

          if (!shiftData.is_full) {
            hint.innerHTML = `<span style="color: #D9534F; font-weight: 700; background: #FFEBEE; padding: 2px 6px; border-radius: 4px; display: inline-block;">${shiftData.missing_text || 'Thiếu người'}</span>`;
          } else {
            hint.innerHTML = `<span style="color: #5CB85C; font-weight: 600;">Đủ người</span>`;
          }
          td.appendChild(hint);
        }
      }

      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  });

  updateRegistrationStats();
}

function updateRegistrationStats() {
  let totalHours = 0;
  let nightShifts = 0;

  appState.selectedShiftIds.forEach(shiftId => {
    const shift = appState.shifts.find(s => s.id === shiftId);
    if (shift) {
      totalHours += shift.duration;
      if (shift.shift_key && shift.shift_key.startsWith("toi")) {
        nightShifts++;
      }
    }
  });

  const hoursEl = document.getElementById("total-hours");
  const nightEl = document.getElementById("total-night-shifts");
  const submitBtn = document.getElementById("btn-submit-reg");
  const editBtn = document.getElementById("btn-edit-reg");
  const noteEl = document.getElementById("reg-status-note");

  if (hoursEl) hoursEl.innerText = totalHours;
  if (nightEl) nightEl.innerText = nightShifts;

  const isManager = appState.currentUser && (appState.currentUser.role === 'manager' || appState.currentUser.role === 'admin' || appState.currentUser.dept === 'Quản lý');
  const currentPhase = appState.systemState?.current_phase || 1;
  const isPhase1 = currentPhase === 1;
  const isValid = isManager || !isPhase1 || (totalHours >= 20 && nightShifts >= 2);
  const isLocked = !isManager && (currentPhase === 2 || currentPhase === 4);

  // 1. Xử lý riêng cho Quản lý (Chủ quán): Không bị ràng buộc bởi 20h hay 2 ca tối, luôn được gửi
  if (isManager) {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = "Lưu Ca Đăng Ký (Bổ Sung Ca Thiếu)";
    }
    if (editBtn) {
      editBtn.classList.add("hidden");
    }
    if (noteEl) {
      noteEl.innerHTML = `
        <span class="shift-status valid">Đặc quyền Chủ quán: Tự do chọn ca bổ sung cho ca thiếu</span>
        <span style="font-size: 12px; color: var(--color-sub); margin-left: 8px;">Đã chọn ${appState.selectedShiftIds.size} ca (${totalHours}h)</span>
      `;
    }
    return;
  }

  // 2. Xử lý riêng cho Giai đoạn 3 (Đăng ký bổ sung ca thiếu):
  if (currentPhase === 3) {
    if (editBtn) editBtn.classList.add("hidden");
    const assignedCount = appState.myAssignedShiftIds ? appState.myAssignedShiftIds.size : 0;
    const newlyAddedCount = Array.from(appState.selectedShiftIds).filter(id => !appState.myAssignedShiftIds.has(id)).length;

    if (newlyAddedCount > 0) {
      if (submitBtn) {
        submitBtn.disabled = isLocked;
        submitBtn.innerText = `Nộp Đăng Ký Bổ Sung (+${newlyAddedCount} ca)`;
      }
      if (noteEl) {
        noteEl.innerHTML = `
          <span class="shift-status valid">Sẵn sàng nộp: Đăng ký thêm ${newlyAddedCount} ca thiếu (Bảo toàn ${assignedCount} ca đã xếp)</span>
        `;
      }
    } else {
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = "Chọn ca thiếu để đăng ký bổ sung";
      }
      if (noteEl) {
        noteEl.innerHTML = `
          <span class="shift-status valid" style="background: #E8F5E9; color: #2E7D32;">Lịch cũ (${assignedCount} ca) đã được bảo toàn</span>
          <span style="font-size: 11.5px; color: var(--color-sub); margin-left: 8px;">Tích chọn ca thiếu bên trên nếu bạn muốn đăng ký thêm</span>
        `;
      }
    }
    return;
  }

  // 3. Xử lý cho Giai đoạn 1 (Đăng ký ban đầu: >= 20h và >= 2 ca tối)
  if (appState.hasUserSubmittedReg) {
    if (!appState.isEditingRegistration) {
      // Đã nộp và đang khóa xem lại
      if (submitBtn) {
        submitBtn.disabled = true;
      }
      if (editBtn) {
        editBtn.classList.remove("hidden");
        editBtn.innerText = "Thay Đổi Lịch";
        editBtn.disabled = isLocked;
      }
      if (noteEl) {
        if (isLocked) {
          noteEl.innerHTML = `<span class="shift-status invalid">Cổng đăng ký đang đóng</span>`;
        } else {
          noteEl.innerHTML = `
            <span class="shift-status valid">Đã gửi lịch làm (${totalHours}h, ${nightShifts} ca tối)</span>
            <span style="font-size: 11.5px; color: var(--color-sub); margin-left: 6px;">Bấm "Thay Đổi Lịch" nếu muốn sửa</span>
          `;
        }
      }
    } else {
      // Đang ở chế độ sửa lịch
      if (submitBtn) {
        submitBtn.disabled = isLocked || !isValid;
      }
      if (editBtn) {
        editBtn.classList.remove("hidden");
        editBtn.innerText = "Hủy Thay Đổi";
      }
      if (noteEl) {
        if (isValid) {
          noteEl.innerHTML = `<span class="shift-status valid">Đã hợp lệ, bấm "Gửi Đăng Ký" để cập nhật</span>`;
        } else {
          noteEl.innerHTML = `<span class="shift-status invalid">Chưa đủ điều kiện (>=20h, >=2 tối)</span>`;
        }
      }
    }
  } else {
    // Chưa từng nộp lịch
    if (submitBtn) {
      submitBtn.disabled = isLocked || !isValid;
    }
    if (editBtn) {
      editBtn.classList.add("hidden");
    }
    if (noteEl) {
      if (isLocked) {
        noteEl.innerHTML = `<span class="shift-status invalid">Cổng đăng ký đang đóng</span>`;
      } else if (isValid) {
        noteEl.innerHTML = `<span class="shift-status valid">Đạt điều kiện hợp lệ</span>`;
      } else {
        noteEl.innerHTML = `<span class="shift-status invalid">Chưa đủ điều kiện (>=20h, >=2 tối)</span>`;
      }
    }
  }
}

// Nộp đơn đăng ký ca làm việc qua POST /api/shifts/register
async function submitRegistration() {
  const shiftIdsArray = Array.from(appState.selectedShiftIds);

  if (shiftIdsArray.length === 0) {
    showToast("Vui lòng tích chọn các ca làm việc trước khi nộp đơn.", "warn");
    return;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/shifts/register`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ shift_ids: shiftIdsArray })
    });

    const result = await res.json();

    if (!res.ok || !result.success) {
      throw new Error(result.message || "Đăng ký không hợp lệ.");
    }

    appState.isEditingRegistration = false;
    appState.hasUserSubmittedReg = true;

    showToast(result.message || "Gửi đăng ký ca làm việc thành công! Hệ thống đã ghi nhận lịch của bạn.", "success");
    await loadInitialData();
  } catch (error) {
    showToast(error.message, "warn");
  }
}

// Alias cho tên hàm yêu cầu
const handleEmployeeSubmitRegistration = submitRegistration;

// ==============================================================================
// 9. THEO DÕI NHÂN SỰ: BẢNG TIMESHEET THÁNG & MODAL (DÀNH CHO QUẢN LÝ)
// ==============================================================================
async function loadTimesheetData(year = 2026, month = 10) {
  try {
    const res = await fetch(`${API_BASE_URL}/shifts/timesheet?year=${year}&month=${month}`, {
      headers: getAuthHeaders()
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.data) {
        appState.timesheetData = json.data;
      }
    }
  } catch (e) {
    console.error("Lỗi khi tải dữ liệu Timesheet:", e);
  }
}

function renderTimesheetTable() {
  const thead = document.getElementById("timesheet-thead");
  const tbody = document.getElementById("timesheet-tbody");
  const labelEl = document.getElementById("timesheet-month-label");
  if (!thead || !tbody) return;

  if (labelEl) {
    labelEl.innerText = `Tháng ${appState.timesheetMonth} / ${appState.timesheetYear}`;
  }

  if (!appState.timesheetData) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--color-sub); padding: 30px;">Đang tải dữ liệu bảng Timesheet từ máy chủ...</td></tr>`;
    return;
  }

  const { weeks_meta, departments } = appState.timesheetData;

  // Render Thead
  let theadHtml = `
    <tr>
      <th class="col-staff">Nhân Viên / Bộ Phận</th>
      ${weeks_meta.map(w => `<th>${w.label}</th>`).join("")}
      <th style="min-width: 140px;">Tổng Cộng (Tháng)</th>
    </tr>
  `;
  thead.innerHTML = theadHtml;

  // Filter theo bộ phận
  let deptsToRender = departments;
  if (appState.timesheetDeptFilter !== 'all') {
    deptsToRender = departments.filter(d => d.department === appState.timesheetDeptFilter);
  }

  let tbodyHtml = "";
  deptsToRender.forEach(deptGroup => {
    // Header dòng phân cách bộ phận
    tbodyHtml += `
      <tr class="dept-section-row">
        <td colspan="${weeks_meta.length + 2}">
          BỘ PHẬN ${deptGroup.department.toUpperCase()} (${deptGroup.code_range}) • ${deptGroup.count} NHÂN SỰ
        </td>
      </tr>
    `;

    deptGroup.employees.forEach(emp => {
      let weekCellsHtml = emp.weeks.map((w, wIndex) => {
        return `
          <td>
            <button class="timesheet-cell-badge" onclick="openTimesheetDetailModal('${emp.id}', ${w.week_number})" title="Bấm xem chi tiết các ca của ${emp.full_name} trong ${w.label}">
              ${w.shift_count} ca (${w.total_hours}h)
            </button>
          </td>
        `;
      }).join("");

      tbodyHtml += `
        <tr>
          <td class="col-staff">
            <strong style="color: var(--primary-color); font-size: 13.5px;">${emp.full_name}</strong>
            <small style="color: var(--color-sub); display: block; font-family: var(--font-mono); margin-top: 2px;">
              ${emp.code} • ${emp.department}
            </small>
          </td>
          ${weekCellsHtml}
          <td class="timesheet-total-cell">
            <strong>${emp.monthly_total.shift_count} ca</strong> (${emp.monthly_total.total_hours}h)
          </td>
        </tr>
      `;
    });
  });

  tbody.innerHTML = tbodyHtml;
}

function openTimesheetDetailModal(empId, weekNumber) {
  if (!appState.timesheetData) return;

  let targetEmp = null;
  for (const d of appState.timesheetData.departments) {
    const found = d.employees.find(e => e.id === empId);
    if (found) {
      targetEmp = found;
      break;
    }
  }

  if (!targetEmp) return;

  const targetWeek = targetEmp.weeks.find(w => w.week_number === weekNumber);
  if (!targetWeek) return;

  const modal = document.getElementById("timesheet-detail-modal");
  const nameEl = document.getElementById("modal-staff-name");
  const metaEl = document.getElementById("modal-staff-meta");
  const bannerEl = document.getElementById("modal-summary-banner");
  const tbodyEl = document.getElementById("modal-shifts-tbody");

  if (nameEl) nameEl.innerText = `Chi tiết ca làm việc: ${targetEmp.full_name} (${targetEmp.code})`;
  if (metaEl) metaEl.innerText = `Bộ phận: ${targetEmp.department} • Tuần ${weekNumber} (${targetWeek.start_date} - ${targetWeek.end_date}) • Tháng ${appState.timesheetMonth}/${appState.timesheetYear}`;

  if (bannerEl) {
    bannerEl.innerHTML = `
      <strong>Tóm tắt tuần ${weekNumber}:</strong> Tổng số <strong>${targetWeek.shift_count} ca</strong> • 
      Tổng cộng <strong>${targetWeek.total_hours} giờ làm việc</strong> (trong đó <strong>${targetWeek.night_shifts_count} ca tối</strong>).
      ${targetWeek.total_hours >= 20 && targetWeek.night_shifts_count >= 2 ? '<span class="shift-status valid" style="margin-left: 8px;">Đạt chuẩn (≥20h, ≥2 ca tối)</span>' : ''}
    `;
  }

  if (tbodyEl) {
    if (!targetWeek.shifts_detail || targetWeek.shifts_detail.length === 0) {
      tbodyEl.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--color-sub); padding: 20px;">Không có ca làm việc nào trong tuần này.</td></tr>`;
    } else {
      tbodyEl.innerHTML = targetWeek.shifts_detail.map(s => {
        return `
          <tr>
            <td><strong>${s.day_name}</strong> <small style="color: var(--color-sub);">(${s.date_str})</small></td>
            <td><strong style="color: var(--primary-color);">${s.shift_name}</strong></td>
            <td style="font-family: var(--font-mono); font-size: 12.5px;">${s.time}</td>
            <td><strong>${s.hours}h</strong></td>
            <td><span class="shift-status valid">Đã phân công</span></td>
          </tr>
        `;
      }).join("");
    }
  }

  if (modal) modal.classList.remove("hidden");
}

function closeTimesheetDetailModal() {
  const modal = document.getElementById("timesheet-detail-modal");
  if (modal) modal.classList.add("hidden");
}

function onModalBackdropClick(event) {
  if (event.target.id === "timesheet-detail-modal") {
    closeTimesheetDetailModal();
  }
}

async function changeTimesheetMonth(offset) {
  appState.timesheetMonth += offset;
  if (appState.timesheetMonth < 1) {
    appState.timesheetMonth = 12;
    appState.timesheetYear -= 1;
  } else if (appState.timesheetMonth > 12) {
    appState.timesheetMonth = 1;
    appState.timesheetYear += 1;
  }
  await loadTimesheetData(appState.timesheetYear, appState.timesheetMonth);
  renderTimesheetTable();
}

async function resetTimesheetMonth() {
  appState.timesheetYear = 2026;
  appState.timesheetMonth = 10;
  await loadTimesheetData(appState.timesheetYear, appState.timesheetMonth);
  renderTimesheetTable();
}

function filterTimesheetDept(dept) {
  appState.timesheetDeptFilter = dept;
  document.querySelectorAll(".btn-dept-filter").forEach(btn => btn.classList.remove("active"));
  const btnId = dept === 'all' ? 'filter-dept-all' : dept === 'Bếp' ? 'filter-dept-bep' : dept === 'Phục vụ' ? 'filter-dept-phucvu' : 'filter-dept-phache';
  const btnActive = document.getElementById(btnId);
  if (btnActive) btnActive.classList.add("active");
  renderTimesheetTable();
}

async function runAIScheduling() {
  const reportBox = document.getElementById("manager-ai-report");
  if (reportBox) {
    reportBox.innerHTML = `<p style="color: var(--primary-color);">Đang kích hoạt thuật toán AI tối ưu xếp ca và cân bằng giờ làm...</p>`;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/shifts/auto-schedule`, {
      method: "POST",
      headers: getAuthHeaders()
    });

    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.message || "Không thể chạy thuật toán xếp ca.");
    }

    const { nextPhase, confidence } = result.data;
    if (reportBox) {
      reportBox.innerHTML = `
        <div style="font-size: 13px; line-height: 1.6;">
          <strong>Kết Quả Xếp Ca AI Thành Công:</strong><br>
          • Điểm tin cậy (Confidence Score): <strong>${confidence.score}%</strong><br>
          • Số ca đã lấp đầy định biên: <strong>${confidence.filledShiftsCount} / 21 ca</strong> (${confidence.quotaFillRate}%)<br>
          • Độ cân bằng giờ làm việc: <strong>${confidence.balanceRate}%</strong><br>
          • Trạng thái BPMN chuyển sang: <strong>Giai đoạn ${nextPhase}</strong>.
        </div>
      `;
    }

    showToast("Đã chạy xong thuật toán AI xếp ca tự động!", "success");
    await loadInitialData();
  } catch (error) {
    if (reportBox) {
      reportBox.innerHTML = `<p style="color: var(--danger);">Lỗi khi chạy xếp ca: ${error.message}</p>`;
    }
    showToast(error.message, "warn");
  }
}

// ==============================================================================
// 10. ĐƠN XIN NGHỈ / ĐỔI CA (TAB 3: REQUESTS)
// ==============================================================================
function renderLeaveRequestOptions() {
  const selectEl = document.getElementById("req-shift-select");
  if (!selectEl) return;
  selectEl.innerHTML = `<option value="">-- Chọn ca làm việc đã được phân công --</option>`;

  if (!appState.currentUser || !appState.shifts) return;

  // Lấy các ca mà nhân viên này ĐÃ ĐƯỢC GÁN CHÍNH THỨC (assignments)
  const myAssignedShifts = appState.shifts.filter(shift => {
    return (shift.assignments || []).some(
      u => u.id === appState.currentUser.id || u.email === appState.currentUser.email
    );
  });

  if (myAssignedShifts.length === 0) {
    selectEl.innerHTML = `<option value="">Bạn chưa có ca làm việc chính thức nào để xin nghỉ</option>`;
    return;
  }

  myAssignedShifts.forEach(shift => {
    const dayName = daysOfWeek[shift.day_key - 1] || `Ngày ${shift.day_key}`;
    const opt = document.createElement("option");
    opt.value = shift.id;
    opt.innerText = `${dayName} • ${shift.name} (${shift.start_time.slice(0, 5)} - ${shift.end_time.slice(0, 5)})`;
    selectEl.appendChild(opt);
  });
}

// Nhân viên gửi đơn xin nghỉ qua POST /api/leave/request
async function submitChangeRequest(event) {
  event.preventDefault();
  const shiftId = document.getElementById("req-shift-select").value;
  const reason = document.getElementById("req-reason").value.trim();

  if (!shiftId) {
    showToast("Vui lòng chọn ca làm việc muốn xin nghỉ.", "warn");
    return;
  }

  if (!reason) {
    showToast("Vui lòng nhập lý do xin nghỉ đột xuất.", "warn");
    return;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/leave/request`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ shift_id: parseInt(shiftId, 10), reason })
    });

    const result = await res.json();

    if (!res.ok || !result.success) {
      throw new Error(result.message || "Không thể tạo đơn xin nghỉ.");
    }

    document.getElementById("req-reason").value = "";
    showToast("Gửi đơn xin nghỉ thành công! Quản lý sẽ sớm xét duyệt.", "success");
    await loadInitialData();
  } catch (error) {
    showToast(error.message, "warn");
  }
}

// Alias cho tên hàm yêu cầu
const submitLeaveRequestForm = submitChangeRequest;

// Render bảng danh sách đơn xin nghỉ
function renderRequestsTable() {
  const tbody = document.getElementById("requests-tbody");
  const thAction = document.getElementById("th-action-col");
  if (!tbody) return;
  tbody.innerHTML = "";

  const isManager = appState.currentUser && (appState.currentUser.role === "manager" || appState.currentUser.role === "admin");
  if (thAction) {
    thAction.style.display = isManager ? "" : "none";
  }

  if (!appState.requests || appState.requests.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="6" style="text-align: center; color: var(--color-sub); padding: 25px;">Chưa có đơn xin nghỉ nào cần xử lý</td>`;
    tbody.appendChild(tr);
    return;
  }

  appState.requests.forEach(req => {
    const tr = document.createElement("tr");

    let statusBadge = "";
    if (req.status === "APPROVED" || req.status === "Đã duyệt") {
      statusBadge = `<span class="shift-status valid">Đã duyệt</span>`;
    } else if (req.status === "REJECTED" || req.status === "Từ chối") {
      statusBadge = `<span class="shift-status invalid">Từ chối</span>`;
    } else {
      statusBadge = `<span class="shift-status" style="background: var(--warning-bg); color: var(--warning-text); border: 1px solid var(--warning-border);">Chờ duyệt</span>`;
    }

    let actionButtonsHtml = "";
    if (isManager) {
      if (req.status === "PENDING" || req.status === "Chờ duyệt") {
        actionButtonsHtml = `
          <td>
            <div style="display: flex; gap: 6px;">
              <button class="btn-success" style="padding: 5px 10px; font-size: 11.5px; min-height: 32px;" onclick="approveRequest('${req.id}', true)">
                Duyệt
              </button>
              <button class="btn-danger" style="padding: 5px 10px; font-size: 11.5px; min-height: 32px;" onclick="approveRequest('${req.id}', false)">
                Từ chối
              </button>
            </div>
          </td>
        `;
      } else {
        actionButtonsHtml = `<td><span style="font-size: 11.5px; color: var(--color-sub);">Đã xử lý</span></td>`;
      }
    }

    const applicantName = req.user?.full_name || req.empName || "Nhân viên";
    const applicantCode = req.user?.avatar_text || req.empId || "NV";
    const dept = req.user?.department || req.dept || "";
    const shiftLabel = req.shift
      ? `${daysOfWeek[req.shift.day_key - 1] || ""} • ${req.shift.name} (${req.shift.start_time?.slice(0, 5)} - ${req.shift.end_time?.slice(0, 5)})`
      : (req.shiftKey || "Ca làm việc");

    const replacementInfo = req.replacement
      ? `<br><small style="color: var(--valid-text);">Thế chỗ: <strong>${req.replacement.full_name}</strong></small>`
      : "";

    tr.innerHTML = `
      <td><strong>${applicantCode}</strong></td>
      <td>${applicantName} <small style="color: var(--color-sub);">(${dept})</small></td>
      <td><strong>${shiftLabel}</strong>${replacementInfo}</td>
      <td><em>"${req.reason}"</em></td>
      <td>${statusBadge}</td>
      ${actionButtonsHtml}
    `;

    tbody.appendChild(tr);
  });
}

// Quản lý phê duyệt hoặc từ chối đơn xin nghỉ
async function approveRequest(requestId, isApproved) {
  try {
    const endpoint = isApproved
      ? `${API_BASE_URL}/leave/approve/${requestId}`
      : `${API_BASE_URL}/leave/reject/${requestId}`;

    const res = await fetch(endpoint, {
      method: "PUT",
      headers: getAuthHeaders(),
      body: isApproved ? null : JSON.stringify({ note: "Quản lý từ chối yêu cầu." })
    });

    const result = await res.json();

    if (!res.ok || !result.success) {
      throw new Error(result.message || "Lỗi khi xử lý đơn.");
    }

    showToast(result.message, isApproved ? "success" : "warn");
    await loadInitialData();
  } catch (error) {
    showToast(error.message, "warn");
  }
}

// Alias cho các hàm yêu cầu
const approveLeaveRequest = (id) => approveRequest(id, true);
const rejectLeaveRequest = (id) => approveRequest(id, false);

// ==============================================================================
// 11. ĐIỀU HƯỚNG TAB & GIAO DIỆN CHUNG
// ==============================================================================
function switchTab(tabId) {
  document.querySelectorAll(".menu-item").forEach(btn => btn.classList.remove("active"));
  document.querySelectorAll(".bottom-tab-item").forEach(btn => btn.classList.remove("active"));

  document.getElementById("tab-schedule")?.classList.add("hidden");
  document.getElementById("tab-timesheet")?.classList.add("hidden");
  document.getElementById("tab-register")?.classList.add("hidden");
  document.getElementById("tab-requests")?.classList.add("hidden");

  const titleEl = document.getElementById("active-tab-title");

  if (tabId === "schedule") {
    document.getElementById("tab-schedule")?.classList.remove("hidden");
    document.getElementById("menu-btn-schedule")?.classList.add("active");
    document.getElementById("mob-tab-schedule")?.classList.add("active");
    if (titleEl) titleEl.innerText = "Lịch làm việc tổng quan";
    renderScheduleView();
  } else if (tabId === "timesheet") {
    document.getElementById("tab-timesheet")?.classList.remove("hidden");
    document.getElementById("menu-btn-timesheet")?.classList.add("active");
    document.getElementById("mob-tab-timesheet")?.classList.add("active");
    if (titleEl) titleEl.innerText = "Theo dõi nhân sự";
    renderTimesheetTable();
  } else if (tabId === "register") {
    document.getElementById("tab-register")?.classList.remove("hidden");
    document.getElementById("menu-btn-register")?.classList.add("active");
    document.getElementById("mob-tab-register")?.classList.add("active");
    if (titleEl) titleEl.innerText = "Đăng ký ca làm việc";
    renderRegisterTable();
  } else if (tabId === "requests") {
    document.getElementById("tab-requests")?.classList.remove("hidden");
    document.getElementById("menu-btn-requests")?.classList.add("active");
    document.getElementById("mob-tab-requests")?.classList.add("active");
    if (titleEl) titleEl.innerText = "Quản Lý Đơn Xin Nghỉ";
    renderLeaveRequestOptions();
    renderRequestsTable();
  }
}

function toggleMobileSidebar() {
  const sidebar = document.getElementById("app-sidebar");
  if (sidebar) sidebar.classList.toggle("mobile-open");
}

// ==============================================================================
// 12. ĐIỀU HƯỚNG TUẦN (WEEK DATE HELPERS)
// ==============================================================================
function getWeekDates(offset = 0) {
  const now = new Date();
  const currentDay = now.getDay();
  const distanceToMonday = (currentDay + 6) % 7;

  const monday = new Date(now);
  monday.setDate(now.getDate() - distanceToMonday + offset * 7);
  monday.setHours(0, 0, 0, 0);

  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function formatDateDDMM(date) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

function updateWeekHeaders() {
  const dates = getWeekDates(appState.currentWeekOffset);
  const weekLabelEl = document.getElementById("current-week-label");
  const weekRangeEl = document.getElementById("schedule-week-range-text");

  if (weekLabelEl) {
    if (appState.currentWeekOffset === 0) weekLabelEl.innerText = "Tuần này";
    else if (appState.currentWeekOffset === -1) weekLabelEl.innerText = "Tuần trước";
    else if (appState.currentWeekOffset === 1) weekLabelEl.innerText = "Tuần sau";
    else weekLabelEl.innerText = `Tuần (${appState.currentWeekOffset > 0 ? "+" : ""}${appState.currentWeekOffset})`;
  }

  if (weekRangeEl) {
    weekRangeEl.innerText = `Tuần từ ${formatDateDDMM(dates[0])} đến ${formatDateDDMM(dates[6])} (${dates[0].getFullYear()})`;
  }

  for (let d = 1; d <= 7; d++) {
    const dateStr = formatDateDDMM(dates[d - 1]);
    const thMatrix = document.getElementById(`th-day-${d}`);
    const thReg = document.getElementById(`reg-th-${d}`);
    if (thMatrix) thMatrix.innerText = `${daysOfWeek[d - 1]} (${dateStr})`;
    if (thReg) thReg.innerText = `${daysOfWeek[d - 1]} (${dateStr})`;
  }
}

function changeWeek(offset) {
  appState.currentWeekOffset += offset;
  updateWeekHeaders();
  renderScheduleView();
}

function resetCurrentWeek() {
  appState.currentWeekOffset = 0;
  updateWeekHeaders();
  renderScheduleView();
}

function onDatePicked(dateStr) {
  if (!dateStr) return;
  const picked = new Date(dateStr);
  const now = new Date();
  const diffTime = picked.getTime() - now.getTime();
  const diffWeeks = Math.round(diffTime / (7 * 24 * 60 * 60 * 1000));
  appState.currentWeekOffset = diffWeeks;
  updateWeekHeaders();
  renderScheduleView();
}

// ==============================================================================
// 13. THÔNG BÁO TOAST
// ==============================================================================
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  let iconColor = "var(--primary-color)";
  let iconBg = "#F5ECE5";
  let iconSymbol = "ℹ";

  if (type === "success") {
    iconColor = "#2E7D32";
    iconBg = "#E8F5E9";
    iconSymbol = "✓";
  } else if (type === "warn" || type === "warning") {
    iconColor = "#E65100";
    iconBg = "#FFF3E0";
    iconSymbol = "!";
  } else if (type === "error" || type === "danger") {
    iconColor = "#C62828";
    iconBg = "#FFEBEE";
    iconSymbol = "✕";
  }

  toast.innerHTML = `
    <div style="display: flex; align-items: flex-start; gap: 12px; width: 100%;">
      <span style="display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; background: ${iconBg}; color: ${iconColor}; font-size: 12px; font-weight: 800; flex-shrink: 0; margin-top: 1px;">${iconSymbol}</span>
      <div style="flex: 1; font-size: 13.5px; line-height: 1.5; color: #2B1810; word-break: break-word; font-weight: 500;">${message}</div>
      <button type="button" aria-label="Đóng" style="background: none; border: none; color: #8C7B75; cursor: pointer; font-size: 18px; line-height: 1; padding: 0 0 0 6px; margin-top: -2px; transition: color 0.15s ease;" onmouseover="this.style.color='#2B1810'" onmouseout="this.style.color='#8C7B75'">&times;</button>
    </div>
  `;

  let timer = null;
  const dismiss = () => {
    if (timer) clearTimeout(timer);
    toast.style.animation = "fadeOut 0.25s forwards";
    setTimeout(() => toast.remove(), 250);
  };

  const closeBtn = toast.querySelector("button");
  if (closeBtn) closeBtn.onclick = dismiss;

  container.appendChild(toast);

  // Xuất hiện trong khoảng 10 giây (10,000ms) theo yêu cầu người dùng
  timer = setTimeout(dismiss, 10000);
}

// ==============================================================================
// 14. KIỂM TRA & HIỂN THỊ THÔNG BÁO THAY ĐỔI NGAY SAU KHI ĐĂNG NHẬP
// ==============================================================================
function checkAndShowLoginNotifications() {
  const user = appState.currentUser;
  if (!user) return;

  const isManager = user.role === 'manager' || user.role === 'admin' || user.dept === 'Quản lý';
  const lastNotifiedKey = `2ce_notified_events_${user.id}`;
  let notifiedEvents = [];
  try {
    const raw = sessionStorage.getItem(lastNotifiedKey);
    if (raw) notifiedEvents = JSON.parse(raw);
  } catch (e) {}

  const newNotifications = [];

  if (isManager) {
    // 1. DÀNH CHO QUẢN LÝ
    // Đơn xin nghỉ đang chờ duyệt
    const pendingRequests = (appState.requests || []).filter(r => r.status === 'PENDING' || r.status === 'Chờ duyệt');
    if (pendingRequests.length > 0) {
      const pendingKey = `pending_${pendingRequests.length}_${pendingRequests.map(r => r.id).join('_')}`;
      if (!notifiedEvents.includes(pendingKey)) {
        newNotifications.push({
          message: `Thông báo Quản lý: Hiện có <strong>${pendingRequests.length} đơn xin nghỉ mới</strong> đang chờ bạn xét duyệt!`,
          type: 'warn',
          key: pendingKey
        });
      }
    }

    // Ca thiếu nhân sự
    const missingShifts = (appState.shifts || []).filter(s => !s.is_full);
    if (missingShifts.length > 0) {
      const missingKey = `missing_${missingShifts.length}`;
      if (!notifiedEvents.includes(missingKey)) {
        newNotifications.push({
          message: `Hệ thống vận hành: Đang có <strong>${missingShifts.length} ca làm việc</strong> còn thiếu nhân sự cần bổ sung.`,
          type: 'info',
          key: missingKey
        });
      }
    }
  } else {
    // 2. DÀNH CHO NHÂN VIÊN
    // A. Kiểm tra các đơn xin nghỉ của chính nhân viên này đã được giải quyết
    (appState.requests || []).forEach(req => {
      const isMyRequest = (req.user?.id === user.id || req.user?.email === user.email || req.empId === user.code);
      if (isMyRequest) {
        const reqKey = `my_req_${req.id}_${req.status}`;
        if (!notifiedEvents.includes(reqKey)) {
          if (req.status === 'APPROVED' || req.status === 'Đã duyệt') {
            const replText = req.replacement ? ` (Người thế chỗ: <strong>${req.replacement.full_name}</strong>)` : '';
            newNotifications.push({
              message: `Đơn xin nghỉ ca <strong>${req.shift?.name || 'làm việc'}</strong> của bạn đã được Quản lý <strong>phê duyệt</strong>!${replText}`,
              type: 'success',
              key: reqKey
            });
          } else if (req.status === 'REJECTED' || req.status === 'Từ chối') {
            const noteText = req.note ? ` Ghi chú: <em>"${req.note}"</em>` : '';
            newNotifications.push({
              message: `Đơn xin nghỉ ca <strong>${req.shift?.name || 'làm việc'}</strong> của bạn đã bị <strong>từ chối</strong>.${noteText}`,
              type: 'warn',
              key: reqKey
            });
          }
        }
      }

      // B. Kiểm tra xem nhân viên này có được AI điều động thế chỗ ca làm của đồng nghiệp hay không
      const isReplacementForMe = (
        (req.replacement_user_id === user.id) ||
        (req.replacement?.id === user.id || req.replacement?.email === user.email)
      ) && (req.status === 'APPROVED' || req.status === 'Đã duyệt');

      if (isReplacementForMe) {
        const replKey = `assigned_replacement_${req.id}`;
        if (!notifiedEvents.includes(replKey)) {
          const shiftName = req.shift?.name || 'làm việc';
          const shiftTime = req.shift?.start_time ? ` (${req.shift.start_time.slice(0, 5)} - ${req.shift.end_time.slice(0, 5)})` : '';
          const colleagueName = req.user?.full_name || 'đồng nghiệp';
          newNotifications.push({
            message: `Lịch điều động mới: Bạn đã được AI phân công thế chỗ ca <strong>${shiftName}${shiftTime}</strong> thay cho <strong>${colleagueName}</strong>!`,
            type: 'info',
            key: replKey
          });
        }
      }
    });
  }

  // Hiển thị các thông báo (cách nhau 400ms để hiệu ứng xuất hiện xếp tầng đẹp mắt)
  newNotifications.forEach((notif, index) => {
    setTimeout(() => {
      showToast(notif.message, notif.type);
    }, 600 + index * 400);
    notifiedEvents.push(notif.key);
  });

  // Lưu lại các sự kiện đã thông báo vào sessionStorage để không bị lặp lại trong phiên làm việc
  try {
    sessionStorage.setItem(lastNotifiedKey, JSON.stringify(notifiedEvents));
  } catch (e) {}
}

// ==============================================================================
// 15. TỰ ĐỘNG KHỞI CHẠY (APP INITIALIZATION)
// ==============================================================================
document.addEventListener("DOMContentLoaded", async () => {
  const savedToken = sessionStorage.getItem("2ce_token");

  if (savedToken) {
    try {
      appState.authToken = savedToken;
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: getAuthHeaders()
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          appState.currentUser = {
            id: json.data.id,
            code: json.data.code || json.data.avatar_text,
            name: json.data.full_name,
            email: json.data.email,
            dept: json.data.department,
            role: json.data.role.toLowerCase()
          };
          enterApp();
          await loadInitialData();
          checkAndShowLoginNotifications();
          return;
        }
      }
    } catch (e) {
      console.log("Token đã hết hạn hoặc máy chủ chưa sẵn sàng. Đưa về màn hình đăng nhập.");
      sessionStorage.removeItem("2ce_token");
    }
  }

  document.getElementById("login-screen")?.classList.remove("hidden");
  document.getElementById("main-app")?.classList.add("hidden");
});
