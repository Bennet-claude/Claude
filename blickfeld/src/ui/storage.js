// localStorage immer mit try/catch: privater Modus, blockierte Daten, Vorschau.

const PREFIX = 'blickfeld.v1.';

export function load(key, fallback) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

export function save(key, value) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch (_) {
    return false;
  }
}
