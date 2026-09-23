// Seeded Zufall: gleicher Seed → gleiche Folge, auf jedem Gerät.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a über einen String → 32-bit Seed / Fingerabdruck.
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function range(rng, min, max) {
  return min + (max - min) * rng();
}

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}
