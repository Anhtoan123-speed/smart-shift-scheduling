/**
 * ==============================================================================
 * 2CE COFFEE ROASTERY · SYSTEM STATE SERVICE (BPMN AUTOMATION ENGINE)
 * ==============================================================================
 */
const fs = require('fs');
const path = require('path');
const { supabaseAdmin, isSupabaseConfigured } = require('../config/supabase');

const SYSTEM_STATE_FILE = path.join(__dirname, '../../data/localSystemState.json');

function loadLocalSystemState() {
  try {
    if (fs.existsSync(SYSTEM_STATE_FILE)) {
      const content = fs.readFileSync(SYSTEM_STATE_FILE, 'utf8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.error('Lỗi khi đọc file localSystemState.json:', e.message);
  }
  return {
    id: 1,
    current_phase: 1,
    countdown_end_time: null,
    ai_confidence_score: 92,
    last_scheduled_at: null,
    updated_at: new Date().toISOString()
  };
}

function saveLocalSystemState(data) {
  try {
    const dir = path.dirname(SYSTEM_STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SYSTEM_STATE_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Lỗi khi lưu file localSystemState.json:', e.message);
  }
}

let localSystemState = loadLocalSystemState();

async function getSystemState() {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabaseAdmin
        .from('system_state')
        .select('*')
        .eq('id', 1)
        .single();

      if (!error && data) return data;
    } catch (e) {
      // Supabase offline: fallback local
    }
  }

  return localSystemState;
}

async function updateSystemPhase(phase, countdownEndTime = null, aiConfidenceScore = null) {
  localSystemState.current_phase = phase;
  localSystemState.countdown_end_time = countdownEndTime;
  localSystemState.updated_at = new Date().toISOString();
  if (aiConfidenceScore !== null) {
    localSystemState.ai_confidence_score = aiConfidenceScore;
  }
  saveLocalSystemState(localSystemState);

  if (isSupabaseConfigured) {
    try {
      const updates = {
        current_phase: phase,
        countdown_end_time: countdownEndTime,
        updated_at: new Date().toISOString()
      };
      if (aiConfidenceScore !== null) updates.ai_confidence_score = aiConfidenceScore;

      const { data } = await supabaseAdmin
        .from('system_state')
        .update(updates)
        .eq('id', 1)
        .select()
        .single();

      if (data) return data;
    } catch (e) {
      // Supabase offline
    }
  }

  return localSystemState;
}

module.exports = {
  getSystemState,
  updateSystemPhase
};
