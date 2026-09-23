// Debug-Anzeige (?debug=1, #debug oder im Pausemenü): FPS, Frame-Zeiten, Draw Calls,
// Simulationszustand und die Passwege aller Mitspieler. Aktualisiert 4× pro Sekunde.

import { passOptions, createOptionList } from '../eval/options.js';

export class DebugPanel {
  constructor(el) {
    this.el = el;
    this.t = 0;
    this.opts = createOptionList();
  }

  update(dt, renderer, w, fp, clock) {
    if (this.el.hidden) return;
    this.t += dt;
    if (this.t < 0.25) return;
    this.t = 0;
    const info = renderer.r.info.render;
    const lines = [];
    lines.push(`${renderer.fps.toFixed(0)} fps · ${renderer.avgMs.toFixed(1)} ms (max ${renderer.maxMs.toFixed(1)})`);
    lines.push(`DPR ${renderer.dpr} · ${renderer.width}×${renderer.height} · ${info.calls} Calls · ${(info.triangles / 1000).toFixed(1)}k Dreiecke`);
    const deg = (a) => Math.round((a * 180) / Math.PI);
    lines.push(`Szene ${w.scene ? w.scene.id : '–'} · t ${w.t.toFixed(2)} s · ${w.phase} · Tempo ${clock.tempo}× · Blick ${deg(fp.gaze)}° (Körper ${deg(fp.bodyHd)}°)`);
    if (w.phase === 'decide' || w.phase === 'toUser') {
      const carrier = w.phase === 'decide' ? w.user : -1;
      if (carrier >= 0) {
        passOptions(w, carrier, this.opts);
        const parts = [];
        for (let i = 0; i < this.opts.count; i++) {
          const o = this.opts[i];
          const m = o.margin === Infinity ? '∞' : o.margin.toFixed(2);
          parts.push(`${w.num[o.target]} ${o.status} ${m}${o.lofted ? ' H' : ''}${o.offside ? ' Abseits' : ''}`);
        }
        lines.push('Passwege: ' + parts.join(' · '));
      } else lines.push('Passwege: nach der Annahme');
    }
    if (w.passInfo) {
      const p = w.passInfo;
      lines.push(`Letzter Pass → ${w.num[p.target]}: ${p.status} (${p.margin.toFixed(2)} s)${p.lofted ? ' halbhoch' : ''}`);
    }
    this.el.textContent = lines.join('\n');
  }
}
