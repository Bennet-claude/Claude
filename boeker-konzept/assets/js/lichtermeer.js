/* ==========================================================================
   Lichtermeer – ein Friedhof bei Nacht, voller Grablichter
   Canvas 2D, ohne Bibliothek. main.js legt es an, motion.js bewegt die Kamera.

   Szene (Einheiten etwa in Metern):
     ein Kiesweg in der Mitte, links und rechts Grabreihen mit Einfassung,
     Bepflanzung und Steinen in neun Formen und vier Materialien,
     davor rote, bernsteinfarbene und helle Grablichter, dazwischen Eiben,
     am Horizont Zypressen, darüber ein stiller Nachthimmel, am Boden Nebel.

   Interaktion
     entzuenden(x, y)       – an dieser Stelle ein neues Licht entzünden
     entzuendenZufaellig()  – ein Licht vor der Kamera entzünden (Button)
     setLaterne(x, y|null)  – der Mauszeiger leuchtet wie eine Laterne

   Kamera
     setFortschritt(0–1)    – Gang über den Weg
     setFlucht(x), setHorizont(y) – Blickpunkt (Anteile von Breite/Höhe)

   modus 'feld' (Start) | 'horizont' (ferner Lichterstreifen im Kontakt)
   ruhig: true  – Bewegung reduzieren: ein ruhiges Standbild
   beobachten   – Element, dessen Sichtbarkeit die Schleife steuert
   ========================================================================== */
(function () {
  'use strict';

  function zufall(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function klemmen(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mischen(a, b, t) { return a + (b - a) * t; }
  function weich(t) { return t * t * (3 - 2 * t); }
  function rgb(r, g, b) { return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')'; }

  // Lichtfarben: rotes Grablicht, Bernstein, helles Teelicht
  var GLUT = ['198,62,40', '226,142,58', '240,202,142'];
  // Glas der Grablichter (nur in der Nähe sichtbar)
  var GLAS = [[150, 34, 24], [176, 104, 36], [214, 206, 190]];
  // Steinmaterial ohne Licht: dunkler Granit, grauer Granit, Sandstein, Kalkstein
  var STEIN = [[16, 17, 18], [30, 31, 31], [40, 37, 32], [48, 48, 45]];
  var KREUZ = [18, 16, 14];
  var ARTEN = ['rund', 'rund', 'segment', 'spitz', 'schulter', 'schraeg', 'stele', 'findling', 'kreuz'];

  function sprite(n, stopps) {
    var c = document.createElement('canvas');
    c.width = c.height = n;
    var g = c.getContext('2d');
    var v = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    stopps.forEach(function (s) { v.addColorStop(s[0], s[1]); });
    g.fillStyle = v;
    g.fillRect(0, 0, n, n);
    return c;
  }
  function glutSprite(f) {
    return sprite(128, [[0, 'rgba(' + f + ',0.95)'], [0.08, 'rgba(' + f + ',0.6)'], [0.28, 'rgba(' + f + ',0.17)'], [0.6, 'rgba(' + f + ',0.045)'], [1, 'rgba(' + f + ',0)']]);
  }

  function Lichtermeer(canvas, optionen) {
    var o = optionen || {};
    var ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return null;

    var modus = o.modus || 'feld';
    var dichte = o.dichte || 1;
    var ruhig = !!o.ruhig;
    var rnd = zufall(o.seed || 7);

    var glut = GLUT.map(glutSprite);
    var kern = sprite(32, [[0, 'rgba(255,250,236,1)'], [0.4, 'rgba(255,224,168,0.85)'], [1, 'rgba(255,196,120,0)']]);
    var nebelSprite = sprite(128, [[0, 'rgba(150,158,152,0.55)'], [0.5, 'rgba(150,158,152,0.2)'], [1, 'rgba(150,158,152,0)']]);
    var laterneSprite = sprite(128, [[0, 'rgba(255,214,150,0.5)'], [0.35, 'rgba(255,190,120,0.16)'], [1, 'rgba(255,190,120,0)']]);
    // feine Körnung für Steine und Kies
    var korn = document.createElement('canvas');
    korn.width = korn.height = 96;
    var kc = korn.getContext('2d');
    for (var kp = 0; kp < 1400; kp++) {
      var hellig = rnd() < 0.5 ? 255 : 0;
      kc.fillStyle = 'rgba(' + hellig + ',' + hellig + ',' + hellig + ',' + (0.08 + rnd() * 0.22) + ')';
      kc.fillRect(rnd() * 96, rnd() * 96, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
    }
    var kornMuster = ctx.createPattern(korn, 'repeat');
    var hinter = document.createElement('canvas');   // zwischengespeicherter Hintergrund
    var hctx = hinter.getContext('2d');
    var hgSchluessel = '';
    var rand = document.createElement('canvas');     // zwischengespeicherte Vignette

    /* ---------- Szene anlegen ---------- */
    function neuesLicht(z, r) {
      return {
        dx: 0,
        farbe: r < 0.6 ? 0 : r < 0.88 ? 1 : 2,
        p1: rnd() * 6.28, p2: rnd() * 6.28, p3: rnd() * 6.28,
        s1: 1.1 + rnd() * 1.5, s2: 2.4 + rnd() * 2.6, s3: 5 + rnd() * 4,
        basis: 0.72 + rnd() * 0.28,
        zuendet: 0.2 + (z / 92) * 2 + rnd() * 0.5,   // Welle von vorn nach hinten
        nutzer: false
      };
    }

    var WEG = 0.85;   // halbe Wegbreite; die Grabreihen beginnen gleich daneben

    var objekte = [];
    for (var z = 2.4; z < 92; z += 1.9 + rnd() * 0.3) {
      for (var seite = -1; seite <= 1; seite += 2) {
        for (var x = WEG + 0.5 + rnd() * 0.3; x < 24; x += 1.25 + rnd() * 0.35) {
          if (rnd() > 0.62 * dichte) continue;
          var art = ARTEN[(rnd() * ARTEN.length) | 0];
          var breit = art === 'stele' ? 0.32 + rnd() * 0.1 : art === 'kreuz' ? 0.5 : 0.48 + rnd() * 0.3;
          var hoch = art === 'stele' ? 1 + rnd() * 0.3 : art === 'kreuz' ? 0.9 + rnd() * 0.3 : 0.55 + rnd() * 0.45;
          var g = {
            typ: 'grab',
            x: seite * x + (rnd() - 0.5) * 0.2,
            z: z + (rnd() - 0.5) * 0.25,
            art: art,
            w: breit,
            h: hoch,
            mat: art === 'kreuz' ? KREUZ : STEIN[(rnd() * STEIN.length) | 0],
            neigung: rnd() < 0.22 ? (rnd() - 0.5) * 0.09 : 0,
            einfassung: rnd() < 0.75,
            pflanze: rnd() < 0.55,
            zacken: null,
            licht: null
          };
          if (art === 'findling') {
            g.zacken = [];
            for (var zk = 0; zk < 9; zk++) g.zacken.push(0.82 + rnd() * 0.3);
          }
          if (rnd() < 0.8) {
            g.licht = neuesLicht(g.z, rnd());
            g.licht.dx = (rnd() - 0.5) * g.w * 0.7;
          }
          objekte.push(g);
        }
      }
      // Eiben zwischen den Reihen, gelegentlich
      if (rnd() < 0.16) {
        var buckel = [];
        for (var bk = 0; bk < 7; bk++) buckel.push(0.85 + rnd() * 0.3);
        objekte.push({ typ: 'eibe', x: (rnd() < 0.5 ? -1 : 1) * (3.5 + rnd() * 10), z: z + 0.9, w: 0.9 + rnd() * 0.7, h: 1.6 + rnd() * 1.4, buckel: buckel });
      }
    }
    objekte.sort(function (a, b) { return b.z - a.z; });

    var baeume = [];
    for (var i = 0; i < 70; i++) {
      var zyp = rnd() < 0.6;
      var teile = [];
      // Laubkrone aus vielen unregelmäßigen Blattballen
      if (!zyp) for (var t = 0; t < 11; t++) {
        var wi = rnd() * 6.28, ra = Math.sqrt(rnd());
        teile.push([Math.cos(wi) * ra * 0.36, 0.12 + Math.sin(wi) * ra * 0.22 + 0.1, 0.12 + rnd() * 0.16]);
      }
      baeume.push({
        x: -80 + rnd() * 160, z: 96 + rnd() * 18, zypresse: zyp, teile: teile,
        w: zyp ? 0.9 + rnd() * 1.1 : 3.5 + rnd() * 3.5,
        h: zyp ? 4 + rnd() * 6 : 4.5 + rnd() * 3.5,
        knick: (rnd() - 0.5) * 0.25
      });
    }
    baeume.sort(function (a, b) { return b.z - a.z; });

    var sterne = [];
    for (var s = 0; s < 80; s++) sterne.push({ x: rnd(), y: rnd() * 0.85, a: 0.1 + rnd() * 0.4 });

    var nebelBaenke = [
      { y: 0.02, hoehe: 0.1, breite: 1.6, tempo: 0.007, phase: 0.1, alpha: 0.3 },
      { y: 0.1, hoehe: 0.14, breite: 2.1, tempo: -0.005, phase: 0.6, alpha: 0.2 },
      { y: 0.26, hoehe: 0.22, breite: 2.6, tempo: 0.004, phase: 0.3, alpha: 0.12 }
    ];

    /* ---------- Zustand ---------- */
    var fortschritt = 0;
    var flucht = 0.5;
    var horBasis = null;
    var zeigerZiel = 0, zeigerX = 0;
    var laterne = null, laterneSanft = null;
    var start = null;
    var laeuft = false, sichtbar = false, rafId = 0;
    var bereit = false;
    var takt = 0, letztes = 0;
    var dpr = 1, w = 0, h = 0;
    var kamera = { hor: 0, camY: 1.5, camZ: 0, f: 1, cx: 0, camX: 0 };   // zuletzt gezeichnete Kamera
    var nutzerLichter = 0;

    function groesse() {
      dpr = Math.min(window.devicePixelRatio || 1, canvas.clientWidth < 1000 ? 1.5 : 1);
      var nw = Math.max(1, Math.round(canvas.clientWidth * dpr));
      var nh = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (nw !== w || nh !== h) {
        w = canvas.width = nw;
        h = canvas.height = nh;
        return true;
      }
      return false;
    }

    function jetzt() { return performance.now() / 1000; }
    function szenenZeit(t) { return ruhig ? 99 : (start === null ? 0 : t - start); }

    /* ---------- Steinformen ---------- */
    function steinPfad(g, x, y, sw, sh) {
      var r;
      ctx.beginPath();
      switch (g.art) {
        case 'rund':
          r = sw / 2;
          ctx.moveTo(x - r, y); ctx.lineTo(x - r, y - sh + r);
          ctx.arc(x, y - sh + r, r, Math.PI, 0); ctx.lineTo(x + r, y);
          break;
        case 'segment':
          ctx.moveTo(x - sw / 2, y); ctx.lineTo(x - sw / 2, y - sh * 0.86);
          ctx.quadraticCurveTo(x, y - sh * 1.1, x + sw / 2, y - sh * 0.86); ctx.lineTo(x + sw / 2, y);
          break;
        case 'spitz':
          ctx.moveTo(x - sw / 2, y); ctx.lineTo(x - sw / 2, y - sh * 0.66);
          ctx.quadraticCurveTo(x - sw / 2, y - sh * 0.93, x, y - sh);
          ctx.quadraticCurveTo(x + sw / 2, y - sh * 0.93, x + sw / 2, y - sh * 0.66); ctx.lineTo(x + sw / 2, y);
          break;
        case 'schulter':
          ctx.moveTo(x - sw / 2, y); ctx.lineTo(x - sw / 2, y - sh * 0.8); ctx.lineTo(x - sw * 0.3, y - sh * 0.8);
          ctx.lineTo(x - sw * 0.3, y - sh); ctx.lineTo(x + sw * 0.3, y - sh); ctx.lineTo(x + sw * 0.3, y - sh * 0.8);
          ctx.lineTo(x + sw / 2, y - sh * 0.8); ctx.lineTo(x + sw / 2, y);
          break;
        case 'schraeg':
          ctx.moveTo(x - sw / 2, y); ctx.lineTo(x - sw / 2, y - sh * 0.8); ctx.lineTo(x + sw / 2, y - sh); ctx.lineTo(x + sw / 2, y);
          break;
        case 'stele':
          ctx.rect(x - sw / 2, y - sh, sw, sh);
          break;
        case 'findling':
          for (var k = 0; k < g.zacken.length; k++) {
            var a = Math.PI + (k / (g.zacken.length - 1)) * Math.PI;
            var px = x + Math.cos(a) * sw / 2 * g.zacken[k];
            var py = y - sh * 0.5 + Math.sin(a) * sh * 0.5 * g.zacken[k] - sh * 0.5 * (1 - Math.abs(Math.cos(a))) * 0.2;
            if (k === 0) ctx.moveTo(x - sw / 2, y); else ctx.lineTo(px, Math.min(py, y));
          }
          ctx.lineTo(x + sw / 2, y);
          break;
        case 'kreuz':
          var b = sw * 0.2;
          ctx.rect(x - b / 2, y - sh, b, sh);
          ctx.rect(x - sw * 0.4, y - sh * 0.78, sw * 0.8, b);
          break;
      }
      ctx.closePath();
    }

    /* ---------- Hintergrund: Himmel, Sterne, Bäume, Weg ---------- */
    function hintergrund(hor, camY, camZ, f, cx, camX) {
      var schluessel = w + '|' + h + '|' + hor.toFixed(1) + '|' + camY.toFixed(3) + '|' + camZ.toFixed(3) + '|' + cx.toFixed(1) + '|' + camX.toFixed(3);
      if (schluessel === hgSchluessel) return;
      hgSchluessel = schluessel;
      if (hinter.width !== w || hinter.height !== h) { hinter.width = w; hinter.height = h; }
      var c = hctx;
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;

      var himmel = c.createLinearGradient(0, 0, 0, hor);
      himmel.addColorStop(0, '#000000');
      himmel.addColorStop(0.6, '#0B0C0C');
      himmel.addColorStop(1, '#1D201F');
      c.fillStyle = himmel;
      c.fillRect(0, 0, w, hor + 1);
      var boden = c.createLinearGradient(0, hor, 0, h);
      boden.addColorStop(0, '#191B1A');
      boden.addColorStop(0.18, '#0C0D0D');
      boden.addColorStop(1, '#050505');
      c.fillStyle = boden;
      c.fillRect(0, hor, w, h - hor);
      c.globalCompositeOperation = 'soft-light';
      c.globalAlpha = 0.6;
      c.fillStyle = kornMuster;
      c.fillRect(0, hor, w, h - hor);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;

      c.fillStyle = '#E6E6E1';
      var sg = Math.max(1, 1.1 * dpr);
      for (var a = 0; a < sterne.length; a++) {
        c.globalAlpha = sterne[a].a;
        c.fillRect(sterne[a].x * w, sterne[a].y * hor * 0.9, sg, sg);
      }
      c.globalAlpha = 1;

      // warmer Schein der vielen Lichter über dem Feld
      var schein = c.createRadialGradient(cx, hor, 0, cx, hor, Math.max(w, h) * 0.75);
      schein.addColorStop(0, 'rgba(158,74,36,0.2)');
      schein.addColorStop(0.45, 'rgba(120,58,30,0.07)');
      schein.addColorStop(1, 'rgba(120,58,30,0)');
      c.fillStyle = schein;
      c.fillRect(0, 0, w, h);

      // Zypressen und Laubbäume am Horizont
      c.fillStyle = '#040404';
      for (var b = 0; b < baeume.length; b++) {
        var bm = baeume[b];
        var bs = f / (bm.z - camZ);
        var bx = cx + (bm.x - camX * 0.6) * bs;
        var bw = bm.w * bs, bh = bm.h * bs;
        if (bx + bw < 0 || bx - bw > w) continue;
        var by = hor + camY * bs;
        c.beginPath();
        if (bm.zypresse) {
          c.moveTo(bx - bw / 2, by);
          c.bezierCurveTo(bx - bw * 0.62, by - bh * 0.45, bx - bw * 0.3 + bm.knick * bw, by - bh * 0.85, bx + bm.knick * bw, by - bh);
          c.bezierCurveTo(bx + bw * 0.3 + bm.knick * bw, by - bh * 0.85, bx + bw * 0.62, by - bh * 0.45, bx + bw / 2, by);
        } else {
          for (var k = 0; k < bm.teile.length; k++) {
            var tl = bm.teile[k];
            var ky = by - bh * (0.5 + tl[1]);
            c.moveTo(bx + tl[0] * bw + tl[2] * bw, ky);
            c.ellipse(bx + tl[0] * bw, ky, tl[2] * bw, tl[2] * bw * 0.9, 0, 0, Math.PI * 2);
          }
          c.rect(bx - bw * 0.03, by - bh * 0.42, bw * 0.06, bh * 0.42);
        }
        c.fill();
      }

      // der Kiesweg in der Mitte, auf dem die Kamera geht
      var nahZ = 0.6, fernZ = 95;
      var ns = f / nahZ, fs = f / (fernZ - camZ);
      var nahY = hor + camY * ns, fernY = hor + camY * fs;
      var weg = c.createLinearGradient(0, fernY, 0, Math.min(nahY, h));
      weg.addColorStop(0, '#171817');
      weg.addColorStop(0.3, '#101110');
      weg.addColorStop(1, '#1C1C1B');
      c.fillStyle = weg;
      c.beginPath();
      c.moveTo(cx + (-WEG - camX) * ns, nahY);
      c.lineTo(cx + (-WEG - camX) * fs, fernY);
      c.lineTo(cx + (WEG - camX) * fs, fernY);
      c.lineTo(cx + (WEG - camX) * ns, nahY);
      c.closePath();
      c.fill();
      c.globalCompositeOperation = 'overlay';   // Kies
      c.globalAlpha = 0.5;
      c.fillStyle = kornMuster;
      c.fill();
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 0.5;                       // Randsteine
      c.strokeStyle = '#262725';
      c.lineWidth = Math.max(1, 1.2 * dpr);
      c.beginPath();
      c.moveTo(cx + (-WEG - camX) * ns, nahY); c.lineTo(cx + (-WEG - camX) * fs, fernY);
      c.moveTo(cx + (WEG - camX) * ns, nahY); c.lineTo(cx + (WEG - camX) * fs, fernY);
      c.stroke();
      c.globalAlpha = 1;
    }

    /* ---------- Zeichnen ---------- */
    function zeichnen(t) {
      if (!w || !h) return;
      var zeit = szenenZeit(t);
      var feld = modus === 'feld';
      var p = feld ? fortschritt : 0;

      var hor = feld ? h * (horBasis === null ? 0.42 : horBasis) + 0.05 * p * h : h * 0.38;
      var camY = feld ? mischen(1.5, 1.2, p) : 2.4;
      var camZ = feld ? 22 * p : -34;
      var f = Math.max(h, w * 0.6) * 0.95;
      var cx = w * flucht;
      if (!ruhig) zeigerX += (zeigerZiel - zeigerX) * 0.045;
      var camX = zeigerX * 0.45;
      kamera = { hor: hor, camY: camY, camZ: camZ, f: f, cx: cx, camX: camX };

      // Laterne folgt dem Zeiger weich (im Ruhemodus sofort)
      if (laterne && ruhig) {
        laterneSanft = { x: laterne.x, y: laterne.y, a: 1 };
      } else if (laterne) {
        if (!laterneSanft) laterneSanft = { x: laterne.x, y: laterne.y, a: 0 };
        laterneSanft.x += (laterne.x - laterneSanft.x) * 0.18;
        laterneSanft.y += (laterne.y - laterneSanft.y) * 0.18;
        laterneSanft.a += (1 - laterneSanft.a) * 0.12;
      } else if (laterneSanft) {
        laterneSanft.a *= 0.88;
        if (laterneSanft.a < 0.01) laterneSanft = null;
      }
      var lat = laterneSanft;
      var latR = Math.min(w, h) * 0.32;

      hintergrund(hor, camY, camZ, f, cx, camX);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.drawImage(hinter, 0, 0);

      for (var k = 0; k < objekte.length; k++) {
        var ob = objekte[k];
        var dz = ob.z - camZ;
        if (dz < 0.5) continue;
        var sc = f / dz;
        var gx = cx + (ob.x - camX) * sc;
        if (gx < -sc * 2 || gx > w + sc * 2) continue;
        var gy = hor + camY * sc;
        var nebel = 1 - Math.exp(-dz / 30);
        var deck = klemmen((dz - 1.2) / 1.6, 0, 1);   // ganz Nahes blendet aus

        if (ob.typ === 'eibe') {
          if (dz > 70 || deck <= 0.01) continue;
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = deck;
          ctx.fillStyle = rgb(mischen(4, 18, nebel), mischen(6, 21, nebel), mischen(5, 19, nebel));
          var ew = ob.w * sc, eh = ob.h * sc;
          ctx.beginPath();
          ctx.moveTo(gx - ew / 2, gy);
          for (var eb = 0; eb < ob.buckel.length; eb++) {
            var ea = Math.PI + (eb / (ob.buckel.length - 1)) * Math.PI;
            var spitz = 1 - Math.abs(Math.cos(ea));
            ctx.lineTo(gx + Math.cos(ea) * ew / 2 * ob.buckel[eb], gy - eh * 0.15 - eh * 0.85 * spitz * ob.buckel[eb]);
          }
          ctx.lineTo(gx + ew / 2, gy);
          ctx.fill();
          ctx.globalAlpha = 1;
          continue;
        }

        // Licht dieses Grabes
        var hell = 0, aufflammen = 0, L = ob.licht;
        if (L) {
          var seit = zeit - L.zuendet;
          var an = weich(klemmen(seit / 0.9, 0, 1));
          var flackern = ruhig ? 1 : 0.82 + 0.1 * Math.sin(zeit * L.s1 + L.p1) +
            0.05 * Math.sin(zeit * L.s2 + L.p2) + 0.03 * Math.sin(zeit * L.s3 + L.p3);
          hell = L.basis * flackern * an;
          if (L.nutzer && !ruhig && seit > 0) aufflammen = Math.exp(-seit * 1.8);
        }

        // Laterne: wie nah ist der Zeiger an diesem Grab?
        var latWarm = 0;
        if (lat && dz < 26) {
          var ldx = gx - lat.x, ldy = (gy - ob.h * sc * 0.5) - lat.y;
          latWarm = lat.a * Math.max(0, 1 - Math.sqrt(ldx * ldx + ldy * ldy) / latR);
          latWarm *= latWarm;
        }

        if (ob.typ === 'grab' && dz < 26 && deck > 0.01) {
          var warm = Math.min(1.3, hell * Math.max(0, 1 - dz / 12) + latWarm * 1.3);
          var sw = ob.w * sc, sh = ob.h * sc;
          var m = ob.mat;

          // Einfassung und Bepflanzung auf dem Grabfeld vor dem Stein
          if (dz < 13) {
            var vorneZ = Math.max(dz - 1.7, 0.45);
            var vs = f / vorneZ;
            var pw = ob.w + 0.4;
            var vy = hor + camY * vs;
            if (ob.einfassung) {
              ctx.globalCompositeOperation = 'source-over';
              ctx.globalAlpha = deck * 0.75;
              ctx.strokeStyle = rgb(mischen(22 + 80 * warm, 22, nebel), mischen(23 + 46 * warm, 24, nebel), mischen(22 + 22 * warm, 23, nebel));
              ctx.lineWidth = Math.max(1, 0.045 * (sc + vs) / 2);
              ctx.beginPath();
              ctx.moveTo(cx + (ob.x - pw / 2 - camX) * sc, gy);
              ctx.lineTo(cx + (ob.x - pw / 2 - camX) * vs, vy);
              ctx.lineTo(cx + (ob.x + pw / 2 - camX) * vs, vy);
              ctx.lineTo(cx + (ob.x + pw / 2 - camX) * sc, gy);
              ctx.stroke();
            }
            if (ob.pflanze) {
              var mz = Math.max(dz - 0.8, 0.5), ms = f / mz;
              ctx.globalAlpha = deck;
              ctx.fillStyle = rgb(8 + 40 * warm, 12 + 24 * warm, 9 + 10 * warm);
              ctx.beginPath();
              ctx.ellipse(cx + (ob.x - camX) * ms, hor + camY * ms - 0.1 * ms, pw * 0.33 * ms, 0.16 * ms, 0, Math.PI, 0);
              ctx.fill();
            }
          }

          // der Stein: oben ein heller Rand vom Himmel, unten warm vom Licht
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = deck;
          var dunkel = function (fak) {
            return rgb(mischen(m[0] * fak, 22, nebel * 0.8), mischen(m[1] * fak, 26, nebel * 0.8), mischen(m[2] * fak, 24, nebel * 0.8));
          };
          var verlauf = ctx.createLinearGradient(0, gy - sh, 0, gy);
          verlauf.addColorStop(0, dunkel(1.25));
          verlauf.addColorStop(0.05, dunkel(0.9));
          // Kerzenlicht fällt nach oben schnell ab: nur der Fuß des Steins wird warm
          verlauf.addColorStop(0.5, dunkel(0.85 + warm * 0.12));
          verlauf.addColorStop(0.78, dunkel(0.9 + warm * 0.45));
          verlauf.addColorStop(1, rgb(
            mischen(m[0] + 120 * warm, 26, nebel * 0.8),
            mischen(m[1] + 58 * warm, 28, nebel * 0.8),
            mischen(m[2] + 24 * warm, 26, nebel * 0.8)));
          // Seitenfläche: die Dicke des Steins, auf der dem Weg zugewandten Seite
          if (dz < 14 && ob.art !== 'kreuz' && ob.art !== 'findling' && !ob.neigung) {
            var dick = 0.13;
            var sb = f / (dz + dick);
            var kante = ob.x < camX ? ob.x + ob.w / 2 : ob.x - ob.w / 2;
            var xv = cx + (kante - camX) * sc, xh = cx + (kante - camX) * sb;
            var gyh = hor + camY * sb;
            var seitHoch = ob.art === 'rund' ? Math.max(0.2, 1 - ob.w / (2 * ob.h)) : ob.art === 'spitz' ? 0.66 : ob.art === 'stele' ? 1 : 0.82;
            ctx.fillStyle = dunkel(0.5 + warm * 0.4);
            ctx.beginPath();
            ctx.moveTo(xv, gy); ctx.lineTo(xv, gy - sh * seitHoch);
            ctx.lineTo(xh, gyh - ob.h * sb * seitHoch); ctx.lineTo(xh, gyh);
            ctx.closePath();
            ctx.fill();
          }
          ctx.fillStyle = verlauf;
          if (ob.neigung) {
            ctx.save();
            ctx.translate(gx, gy);
            ctx.rotate(ob.neigung);
            ctx.translate(-gx, -gy);
          }
          steinPfad(ob, gx, gy, sw, sh);
          ctx.fill();
          if (dz < 16 && sw > 10) {   // Körnung des Steins
            ctx.globalCompositeOperation = 'soft-light';
            ctx.globalAlpha = deck * 0.7;
            ctx.fillStyle = kornMuster;
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
          }
          // polierter dunkler Granit spiegelt das Kerzenlicht als matten Glanz
          if (dz < 9 && m === STEIN[0] && warm > 0.15) {
            var glanz = ctx.createLinearGradient(gx - sw * 0.2, 0, gx + sw * 0.2, 0);
            glanz.addColorStop(0, 'rgba(255,190,130,0)');
            glanz.addColorStop(0.5, 'rgba(255,190,130,' + (0.16 * warm * deck) + ')');
            glanz.addColorStop(1, 'rgba(255,190,130,0)');
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = glanz;
            ctx.fillRect(gx - sw * 0.2, gy - sh * 0.75, sw * 0.4, sh * 0.7);
            ctx.globalCompositeOperation = 'source-over';
          }
          // Inschrift: ein paar gemeißelte Zeilen, nur ganz nah
          if (dz < 7 && ob.art !== 'kreuz' && ob.art !== 'findling' && sw > 18) {
            ctx.globalAlpha = deck * 0.22 * (1 - dz / 7) * (0.4 + warm);
            ctx.fillStyle = 'rgba(214,196,160,1)';
            var zh = Math.max(1, sh * 0.018);
            ctx.fillRect(gx - sw * 0.26, gy - sh * 0.62, sw * 0.52, zh);
            ctx.fillRect(gx - sw * 0.18, gy - sh * 0.54, sw * 0.36, zh);
            ctx.fillRect(gx - sw * 0.22, gy - sh * 0.46, sw * 0.44, zh);
          }
          if (ob.neigung) ctx.restore();
          ctx.globalAlpha = 1;
        }

        if (L && hell > 0.01) {
          var lz = dz - 0.32;
          if (lz < 0.35) continue;
          var ls = f / lz;
          var lx = cx + (ob.x + L.dx - camX) * ls;
          var boden = hor + camY * ls;
          var ly = boden - 0.12 * ls;
          var gross = Math.min(ls * 1.25 * (1 + aufflammen * 0.8), h * 0.7);
          var alpha = Math.min(1.6, hell * (1 - nebel * 0.58) * (1 + aufflammen * 1.4));
          if (lz < 2.8) alpha *= Math.max(0, (lz - 0.35) / 2.45);

          // Glas des Grablichts, nur in der Nähe
          if (ls > 60) {
            var gl = GLAS[L.farbe];
            var gb = 0.07 * ls, gh = 0.13 * ls;
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = Math.min(1, alpha) * 0.9;
            var glas = ctx.createLinearGradient(lx - gb / 2, 0, lx + gb / 2, 0);
            glas.addColorStop(0, rgb(gl[0] * 0.5, gl[1] * 0.5, gl[2] * 0.5));
            glas.addColorStop(0.45, rgb(gl[0], gl[1], gl[2]));
            glas.addColorStop(1, rgb(gl[0] * 0.45, gl[1] * 0.45, gl[2] * 0.45));
            ctx.fillStyle = glas;
            ctx.fillRect(lx - gb / 2, boden - gh, gb, gh);
          }

          ctx.globalCompositeOperation = 'lighter';
          if (lz < 14) {   // Lichtschein auf dem Boden
            ctx.globalAlpha = Math.min(1, alpha * 0.24);
            ctx.drawImage(glut[L.farbe], lx - gross * 1.3, boden - gross * 0.2, gross * 2.6, gross * 0.4);
          }
          ctx.globalAlpha = Math.min(1, alpha);
          ctx.drawImage(glut[L.farbe], lx - gross / 2, ly - gross / 2, gross, gross);
          var kg = Math.max(1.5 * dpr, ls * 0.07);
          ctx.globalAlpha = Math.min(1, alpha * 1.15);
          ctx.drawImage(kern, lx - kg / 2, ly - kg * 0.65, kg, kg * 1.3);

          // beim Entzünden durch Besucher: Lichtring am Boden und aufsteigende Funken
          if (aufflammen > 0.02) {
            var seit2 = zeit - L.zuendet;
            var puls = (0.4 + seit2 * 1.6) * ls;   // weicher Lichtpuls am Boden
            ctx.globalAlpha = aufflammen * 0.55;
            ctx.drawImage(laterneSprite, lx - puls, boden - puls * 0.24, puls * 2, puls * 0.48);
            for (var fu = 0; fu < L.funken.length; fu++) {
              var fk = L.funken[fu];
              var fy = ly - seit2 * fk.v * ls;
              var fx = lx + Math.sin(seit2 * 3 + fk.p) * fk.d * ls;
              ctx.globalAlpha = aufflammen * (1 - seit2 * 0.3);
              ctx.drawImage(kern, fx - kg * 0.25, fy - kg * 0.25, kg * 0.5, kg * 0.5);
            }
          }
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      // Bodennebel zieht langsam
      for (var n = 0; n < nebelBaenke.length; n++) {
        var nb = nebelBaenke[n];
        var nbH = h * nb.hoehe, nbW = w * nb.breite;
        var versatz = ((nb.phase + zeit * nb.tempo) % 1 + 1) % 1;
        var ny = hor + h * nb.y - nbH / 2;
        ctx.globalAlpha = nb.alpha;
        ctx.drawImage(nebelSprite, -nbW * 0.5 + versatz * w * 0.6 - w * 0.3, ny, nbW, nbH);
      }
      ctx.globalAlpha = 1;

      // Laterne: ein warmer Schein dort, wo der Zeiger auf den Boden fällt
      if (lat && lat.a > 0.02 && lat.y > hor) {
        var tief = f * camY / Math.max(1, lat.y - hor);
        var ps = f / Math.max(tief, 0.6);
        var lr = Math.min(ps * 3.2, w * 0.6);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = lat.a * 0.8;
        ctx.drawImage(laterneSprite, lat.x - lr, lat.y - lr * 0.32, lr * 2, lr * 0.64);
        ctx.globalAlpha = lat.a * 0.35;
        ctx.drawImage(laterneSprite, lat.x - lr * 0.6, lat.y - lr * 0.6, lr * 1.2, lr * 1.2);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }

      // dunkle Ränder (einmal je Größe vorbereitet)
      if (rand.width !== w || rand.height !== h) {
        rand.width = w; rand.height = h;
        var rc = rand.getContext('2d');
        var rv = rc.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.32, w / 2, h * 0.55, Math.max(w, h) * 0.78);
        rv.addColorStop(0, 'rgba(0,0,0,0)');
        rv.addColorStop(1, 'rgba(0,0,0,0.62)');
        rc.fillStyle = rv;
        rc.fillRect(0, 0, w, h);
      }
      ctx.drawImage(rand, 0, 0);
    }

    /* ---------- Lichter entzünden ---------- */
    function lichtSetzen(wx, wz) {
      var L = neuesLicht(wz, rnd());
      L.zuendet = ruhig ? 90 : Math.max(0, szenenZeit(jetzt()));
      L.basis = 0.95;
      L.nutzer = true;
      L.funken = [];
      for (var i = 0; i < 14; i++) L.funken.push({ v: 0.2 + rnd() * 0.55, d: (rnd() - 0.5) * 0.16, p: rnd() * 6.28 });
      var ob = { typ: 'licht', x: wx, z: wz, licht: L };
      // in Tiefenordnung einsortieren (fern zuerst)
      var j = 0;
      while (j < objekte.length && objekte[j].z > wz) j++;
      objekte.splice(j, 0, ob);
      nutzerLichter++;
      if (start === null && !ruhig) start = jetzt() - 3;   // Szene läuft noch nicht: sofort sichtbar
      einmal();
      return ob;
    }

    function entzuenden(x, y) {
      if (modus !== 'feld') return null;
      var k = kamera;
      var px = x * dpr, py = y * dpr;
      if (py < k.hor + 4) py = k.hor + (h - k.hor) * 0.12;
      var tief = klemmen(k.f * k.camY / (py - k.hor), 2.6, 40);   // genau dort, wo geklickt wurde
      var wx = k.camX + (px - k.cx) * tief / k.f;
      return lichtSetzen(wx, k.camZ + tief);
    }

    function entzuendenZufaellig() {
      if (modus !== 'feld') return null;
      var k = kamera;
      var tief = 4 + rnd() * 5;
      var seite = rnd() < 0.5 ? -1 : 1;
      return lichtSetzen(k.camX + seite * (WEG + 0.35 + rnd() * 1.4), k.camZ + tief);
    }

    /* ---------- Schleife ---------- */
    function bild(t) {
      rafId = 0;
      if (!laeuft) return;
      if (takt && t - letztes < takt) { rafId = requestAnimationFrame(bild); return; }
      letztes = t;
      if (start === null) start = t / 1000;
      zeichnen(t / 1000);
      rafId = requestAnimationFrame(bild);
    }
    function starten() {
      if (ruhig || !bereit || laeuft || !sichtbar || document.hidden) return;
      laeuft = true;
      rafId = requestAnimationFrame(bild);
    }
    function anhalten() {
      laeuft = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    }
    var einmalGeplant = 0;
    function einmal() {
      if (laeuft || einmalGeplant) return;
      einmalGeplant = requestAnimationFrame(function () {
        einmalGeplant = 0;
        if (!laeuft) zeichnen(jetzt());
      });
    }

    groesse();
    takt = canvas.clientWidth < 700 ? 1000 / 30 - 2 : 0;
    zeichnen(jetzt());

    function freigeben() {
      bereit = true;
      starten();
    }
    if (document.readyState === 'complete') setTimeout(freigeben, 200);
    else window.addEventListener('load', function () { setTimeout(freigeben, 200); });

    if ('ResizeObserver' in window) {
      new ResizeObserver(function () { if (groesse()) { hgSchluessel = ''; einmal(); } }).observe(canvas);
    }
    if ('IntersectionObserver' in window) {
      // beobachtet den umgebenden Abschnitt: ein per clip-path zugeschnittenes
      // Canvas würde sonst als unsichtbar gelten
      new IntersectionObserver(function (eintraege) {
        sichtbar = eintraege[eintraege.length - 1].isIntersecting;
        if (sichtbar) { starten(); einmal(); } else { anhalten(); }
      }).observe(o.beobachten || canvas);
    } else {
      sichtbar = true;
      starten();
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) anhalten(); else starten();
    });
    if (!ruhig && window.matchMedia && matchMedia('(pointer: fine)').matches) {
      window.addEventListener('pointermove', function (e) {
        zeigerZiel = e.clientX / window.innerWidth - 0.5;
      }, { passive: true });
    }

    return {
      setFortschritt: function (v) { fortschritt = klemmen(v, 0, 1); einmal(); },
      setFlucht: function (v) { flucht = v; einmal(); },
      setHorizont: function (v) { horBasis = v; einmal(); },
      setLaterne: function (x, y) {
        laterne = (x === null || x === undefined) ? null : { x: x * dpr, y: y * dpr };
        einmal();
      },
      entzuenden: entzuenden,
      entzuendenZufaellig: entzuendenZufaellig,
      anzahlEntzuendet: function () { return nutzerLichter; },
      neuEntzuenden: function () { start = laeuft ? jetzt() : null; },
      zeichnen: einmal
    };
  }

  window.Lichtermeer = Lichtermeer;
})();
