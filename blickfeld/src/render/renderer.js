// WebGL-Setup, Licht, Größenanpassung, Pixeldichte (max. 2, adaptiv), Frame-Statistik.

import * as THREE from 'three';
import { CAMERA } from '../config.js';
import { buildPitch, HAZE } from './pitch.js';

const DPR_STEPS = [2, 1.75, 1.5, 1.25];

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const r = new THREE.WebGLRenderer({
      canvas, antialias: true, powerPreference: 'high-performance', alpha: false, stencil: false,
    });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.enabled = false;
    this.r = r;
    this.maxDpr = Math.min(2, window.devicePixelRatio || 1);
    this.dprIndex = DPR_STEPS.findIndex((d) => d <= this.maxDpr + 1e-6);
    if (this.dprIndex < 0) this.dprIndex = DPR_STEPS.length - 1;
    this.dpr = Math.min(this.maxDpr, DPR_STEPS[this.dprIndex]);
    r.setPixelRatio(this.dpr);

    this.scene = new THREE.Scene();
    this.scene.background = HAZE;
    this.scene.fog = new THREE.Fog(HAZE, 35, 700);
    this.camera = new THREE.PerspectiveCamera(60, 16 / 9, CAMERA.near, CAMERA.far);
    this.scene.add(this.camera);

    // weiches Tageslicht, leicht bewölkt – passt zu den Blob-Schatten
    const hemi = new THREE.HemisphereLight(0xe4edf5, 0x4d5f3c, 1.55);
    const sun = new THREE.DirectionalLight(0xfff6e8, 1.65);
    sun.position.set(-30, 60, 25);
    this.scene.add(hemi, sun);

    this.pitch = buildPitch(r);
    this.scene.add(this.pitch);

    // Statistik
    this.frameTimes = new Float32Array(120);
    this.frameIdx = 0;
    this.fps = 0; this.avgMs = 0; this.maxMs = 0;
    this.adaptT = 0;
    this.adaptLocked = false;
    this.lastAdaptAvg = 0;
    this.onResize = null;
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.r.setSize(w, h, false);
    this.width = w; this.height = h;
    if (this.onResize) this.onResize(w / h);
  }

  // Frame-Zeiten sammeln; bei dauerhaft < ~55 fps Auflösung schrittweise senken.
  track(dtMs) {
    const n = this.frameTimes.length;
    this.frameTimes[this.frameIdx % n] = dtMs;
    this.frameIdx++;
    if (this.frameIdx % 15 === 0) {
      const count = Math.min(this.frameIdx, 60);
      let sum = 0, max = 0;
      for (let k = 0; k < count; k++) {
        const v = this.frameTimes[(this.frameIdx - 1 - k + n) % n];
        sum += v; if (v > max) max = v;
      }
      this.avgMs = sum / count;
      this.maxMs = max;
      this.fps = 1000 / this.avgMs;
    }
    this.adaptT += dtMs;
    if (!this.adaptLocked && this.adaptT > 2500 && this.frameIdx > 150) {
      this.adaptT = 0;
      const avg = this.avgMs;
      if (avg > 18.2 && this.dprIndex < DPR_STEPS.length - 1) {
        // hat die letzte Stufe nichts gebracht (z. B. 30-fps-Grenze im Stromsparmodus), aufhören
        if (this.lastAdaptAvg && avg > this.lastAdaptAvg * 0.93) { this.adaptLocked = true; return; }
        this.lastAdaptAvg = avg;
        this.dprIndex++;
        this.dpr = Math.min(this.maxDpr, DPR_STEPS[this.dprIndex]);
        this.r.setPixelRatio(this.dpr);
        this.resize();
      }
    }
  }

  render() {
    this.r.render(this.scene, this.camera);
  }

  compile() {
    this.r.compile(this.scene, this.camera);
  }
}
