// Echte Laufwege nachspielen: Catmull-Rom-Spline durch die Messpunkte (12,5 Hz).
// Liefert Position und Geschwindigkeit ohne Knicke, damit Bewegung und
// Passweg-Modell (das mit Geschwindigkeiten rechnet) sauber funktionieren.

export function createReplay(dt, n, xs, ys) {
  return { dt, n, x: xs, y: ys, tEnd: (n - 1) * dt };
}

// Schreibt x, y, vx, vy von Spur k zur Zeit t in out (Float64Array(4)).
export function sampleTrack(rep, k, t, out) {
  const xs = rep.x[k], ys = rep.y[k], n = rep.n, dt = rep.dt;
  let s = t / dt;
  if (s < 0) s = 0;
  if (s > n - 1) s = n - 1;
  let i = Math.floor(s);
  if (i >= n - 1) i = n - 2;
  const u = s - i;
  const i0 = i > 0 ? i - 1 : 0, i2 = i + 1, i3 = i + 2 < n ? i + 2 : n - 1;
  out[0] = cr(xs[i0], xs[i], xs[i2], xs[i3], u);
  out[1] = cr(ys[i0], ys[i], ys[i2], ys[i3], u);
  out[2] = crd(xs[i0], xs[i], xs[i2], xs[i3], u) / dt;
  out[3] = crd(ys[i0], ys[i], ys[i2], ys[i3], u) / dt;
  return out;
}

function cr(p0, p1, p2, p3, u) {
  const u2 = u * u, u3 = u2 * u;
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
}

function crd(p0, p1, p2, p3, u) {
  return 0.5 * ((-p0 + p2) + 2 * (2 * p0 - 5 * p1 + 4 * p2 - p3) * u + 3 * (-p0 + 3 * p1 - 3 * p2 + p3) * u * u);
}
