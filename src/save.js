import { SAVE_VERSION } from './engine/league.js';

export const SAVE_KEY = 'cfb-dynasty-save';
export const BACKUP_KEY = 'cfb-dynasty-save-broken';

const REQUIRED = ['version', 'seed', 'rngState', 'year', 'week', 'phase', 'coach', 'teams', 'players', 'games'];

export function serialize(state) {
  return JSON.stringify(state);
}

// Returns { ok: true, state } or { ok: false, error }.
export function deserialize(text) {
  let state;
  try {
    state = JSON.parse(text);
  } catch {
    return { ok: false, error: 'The save file is not valid JSON.' };
  }
  if (!state || typeof state !== 'object') return { ok: false, error: 'The save file is empty.' };
  const missing = REQUIRED.filter((k) => !(k in state));
  if (missing.length) return { ok: false, error: `The save is missing: ${missing.join(', ')}.` };
  if (state.version !== SAVE_VERSION) return { ok: false, error: `Unsupported save version ${state.version}.` };
  if (!state.teams[state.coach.teamId]) return { ok: false, error: "The save's coach team doesn't exist." };
  return { ok: true, state };
}

// storage is window.localStorage (or a test double with getItem/setItem/removeItem).
// Returns { status: 'none' | 'ok' | 'corrupt' | 'unavailable', state?, error? }.
export function loadFromStorage(storage) {
  let raw;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch {
    return { status: 'unavailable' };
  }
  if (raw === null || raw === undefined) return { status: 'none' };
  const result = deserialize(raw);
  if (result.ok) return { status: 'ok', state: result.state };
  try {
    storage.setItem(BACKUP_KEY, raw);
  } catch {
    // Keeping the backup is best effort.
  }
  return { status: 'corrupt', error: result.error };
}

// Returns true if saved.
export function saveToStorage(storage, state) {
  try {
    storage.setItem(SAVE_KEY, serialize(state));
    return true;
  } catch {
    return false;
  }
}

export function clearStorage(storage) {
  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear.
  }
}
