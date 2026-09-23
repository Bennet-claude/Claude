// Kleine Geometrie-Helfer (statt BufferGeometryUtils aus den Three-Beispielen).

import * as THREE from 'three';

// Fügt Geometrien zu einer zusammen (alle nicht-indiziert). Übernimmt position,
// normal (neu berechnet, falls nicht vorhanden), optional uv und color.
export function mergeGeometries(list, withUv) {
  const geos = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const hasColor = geos.every((g) => g.attributes.color);
  let count = 0;
  for (const g of geos) {
    if (!g.attributes.normal) g.computeVertexNormals();
    count += g.attributes.position.count;
  }
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const uv = withUv ? new Float32Array(count * 2) : null;
  const col = hasColor ? new Float32Array(count * 3) : null;
  let o = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (uv && g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    if (col) col.set(g.attributes.color.array, o * 3);
    o += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}
