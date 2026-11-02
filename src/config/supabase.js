/**
 * ==============================================================================
 * 2CE COFFEE ROASTERY · SUPABASE POSTGRESQL CLIENT CONFIGURATION
 * ==============================================================================
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey;

// Kiểm tra xem Supabase đã được cấu hình với URL và Key thực tế hay chưa
const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  !supabaseUrl.includes('your-project-id') &&
  !supabaseUrl.includes('placeholder') &&
  supabaseAnonKey &&
  !supabaseAnonKey.includes('dummy')
);

if (!isSupabaseConfigured) {
  console.log('ℹ️ [SUPABASE CLIENT] Đang chạy ở chế độ Local / Seed Data (Chưa phát hiện SUPABASE_URL thực tế trong .env).');
}

// Client thông thường với anon key
const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? supabaseAnonKey : 'placeholder_key',
  {
    auth: { persistSession: false, autoRefreshToken: false }
  }
);

// Admin Client với service role key (bypass RLS)
const supabaseAdmin = createClient(
  isSupabaseConfigured ? supabaseUrl : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? supabaseServiceRoleKey : 'placeholder_key',
  {
    auth: { persistSession: false, autoRefreshToken: false }
  }
);

module.exports = {
  supabase,
  supabaseAdmin,
  isSupabaseConfigured
};
