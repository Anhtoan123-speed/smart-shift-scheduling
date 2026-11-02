-- ==============================================================================
-- 2CE COFFEE ROASTERY · DATABASE MIGRATION & SEED SCRIPT (SUPABASE POSTGRESQL)
-- ==============================================================================
-- Hệ thống cơ sở dữ liệu cho Hệ thống Quản lý và Xếp lịch Ca làm việc Tự động
-- Hỗ trợ phân quyền RBAC, Quota định biên 21 ca, Đăng ký ca, Đơn xin nghỉ & State Machine

-- Bật extension pgcrypto để sinh UUID và hash mật khẩu
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. BẢNG USERS (Hồ sơ người dùng đồng bộ từ Supabase Auth / Local Users)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    department VARCHAR(50) NOT NULL CHECK (department IN ('Bếp', 'Phục vụ', 'Pha chế', 'Quản lý')),
    role VARCHAR(50) NOT NULL CHECK (role IN ('Admin', 'Manager', 'Employee')),
    avatar_text VARCHAR(10) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 2. BẢNG SHIFTS (Cấu trúc 21 ca làm việc trong tuần & Định biên Quotas)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shifts (
    id SERIAL PRIMARY KEY,
    day_key INT NOT NULL CHECK (day_key BETWEEN 1 AND 7), -- 1: Thứ 2, 7: Chủ Nhật
    shift_key VARCHAR(50) UNIQUE NOT NULL,                -- Ví dụ: sang_1, chieu_2, toi_7
    name VARCHAR(100) NOT NULL,                           -- Ca Sáng, Ca Chiều, Ca Tối
    start_time TIME NOT NULL,                             -- 09:00:00, 13:00:00, 17:00:00
    end_time TIME NOT NULL,                               -- 13:00:00, 17:00:00, 23:00:00
    duration INT NOT NULL,                                -- Số giờ làm (4 hoặc 6)
    quotas JSONB NOT NULL,                                -- Định biên nhân sự từng bộ phận
    allowed_departments JSONB NOT NULL,                   -- Danh sách bộ phận được đăng ký
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 3. BẢNG REGISTRATIONS (Đơn đăng ký ca & Phân bổ ca chính thức)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    shift_id INT NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
    is_assigned BOOLEAN DEFAULT FALSE, -- FALSE: Đăng ký rảnh, TRUE: AI xếp vào ca chính thức
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_user_shift UNIQUE (user_id, shift_id)
);

-- ------------------------------------------------------------------------------
-- 4. BẢNG LEAVE_REQUESTS (Đơn xin nghỉ đột xuất & AI Smart Replacement)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    shift_id INT NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    replacement_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- ------------------------------------------------------------------------------
-- 5. BẢNG SYSTEM_STATE (Trạng thái luồng công việc tự động - 1 Record duy nhất)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_state (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    current_phase INT NOT NULL DEFAULT 1 CHECK (current_phase IN (1, 2, 3, 4)),
    countdown_end_time TIMESTAMPTZ,
    ai_confidence_score NUMERIC(5,2) DEFAULT 0,
    last_scheduled_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Khởi tạo record duy nhất cho system_state
INSERT INTO public.system_state (id, current_phase, ai_confidence_score)
VALUES (1, 1, 0)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 6. TẠO INDEXES TỐI ƯU HIỆU NĂNG QUERY
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_reg_user_id ON public.registrations(user_id);
CREATE INDEX IF NOT EXISTS idx_reg_shift_id ON public.registrations(shift_id);
CREATE INDEX IF NOT EXISTS idx_reg_is_assigned ON public.registrations(is_assigned);
CREATE INDEX IF NOT EXISTS idx_leave_status ON public.leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_shifts_day ON public.shifts(day_key);

-- ------------------------------------------------------------------------------
-- 7. SEED DỮ LIỆU: 21 CA LÀM VIỆC THEO QUY ĐỊNH ĐỊNH BIÊN
-- ------------------------------------------------------------------------------
-- Ca Sáng (09:00 - 13:00, 4h): Chỉ Pha chế (Đúng 1 Pha chế)
-- Ca Chiều (13:00 - 17:00, 4h): Bếp + Pha chế (Đúng 1 Bếp & 1-2 Pha chế)
-- Ca Tối (17:00 - 23:00, 6h): Cả 3 bộ phận (Đúng 2 Bếp, 2 Phục vụ & 2-3 Pha chế)

DO $$
BEGIN
    FOR d IN 1..7 LOOP
        -- 1. Ca Sáng
        INSERT INTO public.shifts (day_key, shift_key, name, start_time, end_time, duration, quotas, allowed_departments)
        VALUES (
            d,
            'sang_' || d,
            'Ca Sáng',
            '09:00:00',
            '13:00:00',
            4,
            '{"phache": {"min": 1, "max": 1}, "bep": {"min": 0, "max": 0}, "phucvu": {"min": 0, "max": 0}}'::jsonb,
            '["Pha chế"]'::jsonb
        )
        ON CONFLICT (shift_key) DO UPDATE SET
            quotas = EXCLUDED.quotas,
            allowed_departments = EXCLUDED.allowed_departments;

        -- 2. Ca Chiều
        INSERT INTO public.shifts (day_key, shift_key, name, start_time, end_time, duration, quotas, allowed_departments)
        VALUES (
            d,
            'chieu_' || d,
            'Ca Chiều',
            '13:00:00',
            '17:00:00',
            4,
            '{"bep": {"min": 1, "max": 1}, "phache": {"min": 1, "max": 2}, "phucvu": {"min": 0, "max": 0}}'::jsonb,
            '["Bếp", "Pha chế"]'::jsonb
        )
        ON CONFLICT (shift_key) DO UPDATE SET
            quotas = EXCLUDED.quotas,
            allowed_departments = EXCLUDED.allowed_departments;

        -- 3. Ca Tối
        INSERT INTO public.shifts (day_key, shift_key, name, start_time, end_time, duration, quotas, allowed_departments)
        VALUES (
            d,
            'toi_' || d,
            'Ca Tối',
            '17:00:00',
            '23:00:00',
            6,
            '{"bep": {"min": 2, "max": 2}, "phucvu": {"min": 2, "max": 2}, "phache": {"min": 2, "max": 3}}'::jsonb,
            '["Bếp", "Phục vụ", "Pha chế"]'::jsonb
        )
        ON CONFLICT (shift_key) DO UPDATE SET
            quotas = EXCLUDED.quotas,
            allowed_departments = EXCLUDED.allowed_departments;
    END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 8. SEED DỮ LIỆU: 18 NHÂN VIÊN + 1 QUẢN LÝ (PASSWORD HASHED BCRYPT)
-- Mật khẩu 6 số được băm bảo mật bằng crypt('<password>', gen_salt('bf'))
-- ------------------------------------------------------------------------------

-- Quản lý
INSERT INTO public.users (email, password_hash, full_name, department, role, avatar_text)
VALUES 
    ('tranthimyco28@gmail.com', crypt('839214', gen_salt('bf')), 'Quản lý Cửa hàng', 'Quản lý', 'Manager', 'QL')
ON CONFLICT (email) DO UPDATE SET
    role = EXCLUDED.role,
    department = EXCLUDED.department,
    full_name = EXCLUDED.full_name;

-- 6 Nhân viên Bếp (NV01 - NV06)
INSERT INTO public.users (email, password_hash, full_name, department, role, avatar_text)
VALUES
    ('toananhluong92@gmail.com', crypt('283401', gen_salt('bf')), 'Nguyễn Văn An', 'Bếp', 'Employee', 'NA'),
    ('binh.nv02@gmail.com', crypt('592183', gen_salt('bf')), 'Trần Thị Bình', 'Bếp', 'Employee', 'TB'),
    ('cuong.nv03@gmail.com', crypt('748291', gen_salt('bf')), 'Lê Hoàng Cường', 'Bếp', 'Employee', 'LC'),
    ('dung.nv04@gmail.com', crypt('103948', gen_salt('bf')), 'Phạm Thị Dung', 'Bếp', 'Employee', 'PD'),
    ('em.nv05@gmail.com', crypt('482019', gen_salt('bf')), 'Hoàng Văn Em', 'Bếp', 'Employee', 'HE'),
    ('giang.nv06@gmail.com', crypt('918237', gen_salt('bf')), 'Vũ Thị Giang', 'Bếp', 'Employee', 'VG')
ON CONFLICT (email) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    department = EXCLUDED.department;

-- 3 Nhân viên Phục vụ (NV07 - NV09)
INSERT INTO public.users (email, password_hash, full_name, department, role, avatar_text)
VALUES
    ('namtran2772006@gmail.com', crypt('374812', gen_salt('bf')), 'Đặng Hữu Hải', 'Phục vụ', 'Employee', 'DH'),
    ('linh.nv08@gmail.com', crypt('610293', gen_salt('bf')), 'Bùi Khánh Linh', 'Phục vụ', 'Employee', 'BL'),
    ('minh.nv09@gmail.com', crypt('829304', gen_salt('bf')), 'Ngô Đức Minh', 'Phục vụ', 'Employee', 'NM')
ON CONFLICT (email) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    department = EXCLUDED.department;

-- 9 Nhân viên Pha chế (NV10 - NV18)
INSERT INTO public.users (email, password_hash, full_name, department, role, avatar_text)
VALUES
    ('tu090906@gmail.com', crypt('571829', gen_salt('bf')), 'Đỗ Phương Thảo', 'Pha chế', 'Employee', 'DT'),
    ('huy.nv11@gmail.com', crypt('204857', gen_salt('bf')), 'Trịnh Quốc Huy', 'Pha chế', 'Employee', 'TH'),
    ('tuyet.nv12@gmail.com', crypt('491823', gen_salt('bf')), 'Mai Ánh Tuyết', 'Pha chế', 'Employee', 'MT'),
    ('bao.nv13@gmail.com', crypt('738192', gen_salt('bf')), 'Lâm Gia Bảo', 'Pha chế', 'Employee', 'LB'),
    ('nhu.nv14@gmail.com', crypt('192837', gen_salt('bf')), 'Võ Quỳnh Như', 'Pha chế', 'Employee', 'VN'),
    ('khang.nv15@gmail.com', crypt('658291', gen_salt('bf')), 'Phan Minh Khang', 'Pha chế', 'Employee', 'PK'),
    ('han.nv16@gmail.com', crypt('384756', gen_salt('bf')), 'Tạ Ngọc Hân', 'Pha chế', 'Employee', 'TH'),
    ('nam.nv17@gmail.com', crypt('827364', gen_salt('bf')), 'Châu Nhật Nam', 'Pha chế', 'Employee', 'CN'),
    ('nhi.nv18@gmail.com', crypt('561029', gen_salt('bf')), 'Đoàn Yến Nhi', 'Pha chế', 'Employee', 'DN')
ON CONFLICT (email) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    department = EXCLUDED.department;

-- Ghi chú kiểm tra
SELECT 'MIGRATION & SEED SUCCESSFUL' AS status, count(*) AS total_users FROM public.users;

