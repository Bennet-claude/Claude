/* ==========================================================================
   Lichtermeer – ein nächtlicher Friedhof mit Grablichtern
   Canvas 2D, ohne Bibliothek. Wird von main.js angelegt, von motion.js bewegt.

   Szene: Reihen von Grabsteinen auf einer Ebene, davor rote und bernsteinfarbene
   Grablichter, am Horizont Zypressen, darüber ein stiller Nachthimmel.
   Kamera: blickt über das Feld; motion.js lässt sie beim Scrollen langsam
   nach vorn gleiten (setFortschritt 0–1).

   modus 'feld'      – das große Bild im Tor (Start)
   modus 'horizont'  – ein ferner Lichterstreifen (Kontakt)
   beobachten        – Element, dessen Sichtbarkeit die Schleife steuert

   Ruhemodus (Bewegung reduzieren): ein einziges, ruhiges Standbild.
   Die Schleife läuft nur, solange das Canvas sichtbar ist.
   ========================================================================== */
(function () {
  'use strict';

  // kleiner, reproduzierbarer Zufall – jede Ansicht zeigt denselben Friedhof
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

  // rotes Grablicht, Bernstein, helles Teelicht
  var GLUT = ['206,70,44', '228,146,62', '242,204,140'];

  function glutSprite(rgb) {
    var n = 128;
    var c = document.createElement('canvas');
    c.width = c.height = n;
    var g = c.getContext('2d');
    var v = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    v.addColorStop(0, 'rgba(' + rgb + ',0.95)');
    v.addColorStop(0.08, 'rgba(' + rgb + ',0.6)');
    v.addColorStop(0.28, 'rgba(' + rgb + ',0.17)');
    v.addColorStop(0.6, 'rgba(' + rgb + ',0.045)');
    v.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = v;
    g.fillRect(0, 0, n, n);
    return c;
  }
  function kernSprite() {
    var n = 32;
    var c = document.createElement('canvas');
    c.width = c.height = n;
    var g = c.getContext('2d');
    var v = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    v.addColorStop(0, 'rgba(255,250,236,1)');
    v.addColorStop(0.4, 'rgba(255,224,168,0.85)');
    v.addColorStop(1, 'rgba(255,196,120,0)');
    g.fillStyle = v;
    g.fillRect(0, 0, n, n);
    return c;
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
    var kern = kernSprite();
    var hinter = document.createElement('canvas');   // zwischengespeicherter Hintergrund
    var hctx = hinter.getContext('2d');
    var hgSchluessel = '';
    var rand = document.createElement('canvas');     // zwischengespeicherte Vignette

    /* ---------- Szene anlegen ---------- */
    var graeber = [];
    for (var z = 2.2; z < 92; z += 1.55 + rnd() * 0.35) {
      var versatz = rnd() * 1.3;
      for (var x = -24 + versatz; x < 24; x += 1.3 + rnd() * 0.3) {
        if (rnd() > 0.5 * dichte) continue;
        var g = {
          x: x + (rnd() - 0.5) * 0.25,
          z: z + (rnd() - 0.5) * 0.3,
          w: 0.42 + rnd() * 0.26,
          h: 0.5 + rnd() * 0.5,
          bogen: rnd() < 0.62,
          licht: null
        };
        if (rnd() < 0.8) {
          var r = rnd();
          g.licht = {
            dx: (rnd() - 0.5) * g.w * 0.7,
            farbe: r < 0.6 ? 0 : r < 0.88 ? 1 : 2,
            p1: rnd() * 6.28, p2: rnd() * 6.28, p3: rnd() * 6.28,
            s1: 1.1 + rnd() * 1.5, s2: 2.4 + rnd() * 2.6, s3: 5 + rnd() * 4,
            basis: 0.72 + rnd() * 0.28,
            // die Lichter gehen von vorn nach hinten an, wie eine Welle
            zuendet: 0.25 + (g.z / 92) * 2.1 + rnd() * 0.6
          };
        }
        graeber.push(g);
      }
    }
    graeber.sort(function (a, b) { return b.z - a.z; });

    var baeume = [];
    for (var i = 0; i < 64; i++) {
      var zypresse = rnd() < 0.62;
      baeume.push({
        x: -80 + rnd() * 160,
        z: 96 + rnd() * 18,
        zypresse: zypresse,
        w: zypresse ? 0.9 + rnd() * 1.1 : 3 + rnd() * 4,
        h: zypresse ? 4 + rnd() * 6 : 4 + rnd() * 4
      });
    }
    baeume.sort(function (a, b) { return b.z - a.z; });

    var sterne = [];
    for (var s = 0; s < 70; s++) {
      sterne.push({ x: rnd(), y: rnd() * 0.85, a: 0.12 + rnd() * 0.4, p: rnd() * 6.28 });
    }

    /* ---------- Zustand ---------- */
    var fortschritt = 0;   // Kamerafahrt (feld)
    var flucht = 0.5;      // Fluchtpunkt x (Anteil der Breite)
    var horBasis = null;   // Horizont y (Anteil der Höhe), null = Standard
    var zeigerZiel = 0, zeigerX = 0;
    var start = null;
    var laeuft = false, sichtbar = false, rafId = 0;
    var bereit = false;            // Schleife erst nach dem Laden der Seite
    var takt = 0, letztes = 0;     // auf kleinen Bildschirmen 30 Bilder/s
    var dpr = 1, w = 0, h = 0;

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

    /* ---------- Zeichnen ---------- */
    function zeichnen(t) {
      if (!w || !h) return;
      var zeit = ruhig ? 99 : (start === null ? 0 : t - start);
      var feld = modus === 'feld';
      var p = feld ? fortschritt : 0;

      var hor = h * (feld ? (horBasis === null ? 0.42 : horBasis) - 0.08 * p : 0.38);
      var camY = feld ? mischen(1.5, 0.95, p) : 2.4;
      var camZ = feld ? 24 * p : -34;
      var f = Math.max(h, w * 0.6) * 0.95;
      var cx = w * flucht;
      if (!ruhig) zeigerX += (zeigerZiel - zeigerX) * 0.045;
      var camX = zeigerX * 0.9;

      // Hintergrund (Himmel, Bäume, Nebel) nur neu zeichnen, wenn sich die Kamera bewegt hat
      var schluessel = w + '|' + h + '|' + hor.toFixed(1) + '|' + camY.toFixed(3) + '|' + camZ.toFixed(3) + '|' + cx.toFixed(1) + '|' + camX.toFixed(3);
      if (schluessel !== hgSchluessel) {
        hgSchluessel = schluessel;
        if (hinter.width !== w || hinter.height !== h) { hinter.width = w; hinter.height = h; }
        hctx.globalCompositeOperation = 'source-over';
        hctx.globalAlpha = 1;

        // Himmel und Boden
        var himmel = hctx.createLinearGradient(0, 0, 0, hor);
        himmel.addColorStop(0, '#090C0B');
        himmel.addColorStop(0.65, '#121714');
        himmel.addColorStop(1, '#212823');
        hctx.fillStyle = himmel;
        hctx.fillRect(0, 0, w, hor + 1);
        var boden = hctx.createLinearGradient(0, hor, 0, h);
        boden.addColorStop(0, '#1B211D');
        boden.addColorStop(0.2, '#0F1311');
        boden.addColorStop(1, '#080A09');
        hctx.fillStyle = boden;
        hctx.fillRect(0, hor, w, h - hor);

        // Sterne
        hctx.fillStyle = '#E8E6DC';
        var sg = Math.max(1, 1.1 * dpr);
        for (var a = 0; a < sterne.length; a++) {
          var st = sterne[a];
          hctx.globalAlpha = st.a;
          hctx.fillRect(st.x * w, st.y * hor * 0.9, sg, sg);
        }
        hctx.globalAlpha = 1;

        // warmer Schein der vielen Lichter über dem Feld
        var schein = hctx.createRadialGradient(cx, hor, 0, cx, hor, Math.max(w, h) * 0.75);
        schein.addColorStop(0, 'rgba(160,82,40,0.2)');
        schein.addColorStop(0.45, 'rgba(120,64,34,0.07)');
        schein.addColorStop(1, 'rgba(120,64,34,0)');
        hctx.fillStyle = schein;
        hctx.fillRect(0, 0, w, h);

        // Zypressen und Bäume am Horizont
        hctx.fillStyle = '#060807';
        for (var b = 0; b < baeume.length; b++) {
          var bm = baeume[b];
          var bdz = bm.z - camZ;
          var bs = f / bdz;
          var bx = cx + (bm.x - camX * 0.6) * bs;
          var bw = bm.w * bs, bh = bm.h * bs;
          if (bx + bw < 0 || bx - bw > w) continue;
          var by = hor + camY * bs;
          hctx.beginPath();
          if (bm.zypresse) {
            hctx.moveTo(bx - bw / 2, by);
            hctx.quadraticCurveTo(bx - bw * 0.62, by - bh * 0.55, bx, by - bh);
            hctx.quadraticCurveTo(bx + bw * 0.62, by - bh * 0.55, bx + bw / 2, by);
          } else {
            hctx.ellipse(bx, by - bh * 0.55, bw / 2, bh * 0.5, 0, 0, Math.PI * 2);
          }
          hctx.fill();
        }

        // Nebelband über dem Horizont
        var nebelBand = hctx.createLinearGradient(0, hor - h * 0.06, 0, hor + h * 0.12);
        nebelBand.addColorStop(0, 'rgba(70,82,74,0)');
        nebelBand.addColorStop(0.45, 'rgba(70,82,74,0.2)');
        nebelBand.addColorStop(1, 'rgba(70,82,74,0)');
        hctx.fillStyle = nebelBand;
        hctx.fillRect(0, hor - h * 0.06, w, h * 0.18);

      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.drawImage(hinter, 0, 0);

      // Gräber und Lichter, von hinten nach vorn
      for (var k = 0; k < graeber.length; k++) {
        var gr = graeber[k];
        var dz = gr.z - camZ;
        if (dz < 0.5) continue;
        var sc = f / dz;
        var gx = cx + (gr.x - camX) * sc;
        if (gx < -sc * 1.5 || gx > w + sc * 1.5) continue;
        var gy = hor + camY * sc;
        if (gy - gr.h * sc > h) continue;
        var nebel = 1 - Math.exp(-dz / 30);

        var hell = 0, L = gr.licht;
        if (L) {
          var an = klemmen((zeit - L.zuendet) / 0.9, 0, 1);
          an = weich(an);
          var flackern = ruhig ? 1 : 0.82 + 0.1 * Math.sin(zeit * L.s1 + L.p1) +
            0.05 * Math.sin(zeit * L.s2 + L.p2) + 0.03 * Math.sin(zeit * L.s3 + L.p3);
          hell = L.basis * flackern * an;
        }

        // Grabstein (nur in der Nähe sichtbar), von unten vom eigenen Licht angestrahlt
        if (dz < 24) {
          var sw = gr.w * sc, sh = gr.h * sc;
          var deck = klemmen((dz - 1.4) / 1.6, 0, 1);   // ganz nahe Steine blenden aus
          if (deck > 0.01) {
            var warm = hell * Math.max(0, 1 - dz / 12);
            var dunkel = 'rgb(' + (mischen(15, 22, nebel) | 0) + ',' + (mischen(18, 27, nebel) | 0) + ',' + (mischen(16, 24, nebel) | 0) + ')';
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = deck;
            if (warm > 0.04) {
              var verlauf = ctx.createLinearGradient(0, gy - sh, 0, gy);
              verlauf.addColorStop(0, dunkel);
              verlauf.addColorStop(1, 'rgb(' + ((18 + 110 * warm) | 0) + ',' + ((21 + 56 * warm) | 0) + ',' + ((19 + 26 * warm) | 0) + ')');
              ctx.fillStyle = verlauf;
            } else {
              ctx.fillStyle = dunkel;
            }
            ctx.beginPath();
            if (gr.bogen) {
              var rad = sw / 2;
              ctx.moveTo(gx - rad, gy);
              ctx.lineTo(gx - rad, gy - sh + rad);
              ctx.arc(gx, gy - sh + rad, rad, Math.PI, 0);
              ctx.lineTo(gx + rad, gy);
            } else {
              ctx.rect(gx - sw / 2, gy - sh, sw, sh);
            }
            ctx.fill();
            ctx.globalAlpha = 1;
          }
        }

        if (L && hell > 0.01) {
          var lz = dz - 0.32;
          if (lz < 0.35) continue;
          var ls = f / lz;
          var lx = cx + (gr.x + L.dx - camX) * ls;
          var ly = hor + (camY - 0.1) * ls;
          var gross = Math.min(ls * 1.25, h * 0.7);
          var alpha = hell * (1 - nebel * 0.58);
          if (lz < 2.8) alpha *= Math.max(0, (lz - 0.35) / 2.45);   // nahe Lichter verschwimmen
          ctx.globalCompositeOperation = 'lighter';
          if (lz < 14) {   // Lichtschein auf dem Boden
            ctx.globalAlpha = alpha * 0.22;
            ctx.drawImage(glut[L.farbe], lx - gross * 1.3, ly + ls * 0.04 - gross * 0.22, gross * 2.6, gross * 0.44);
          }
          ctx.globalAlpha = alpha;
          ctx.drawImage(glut[L.farbe], lx - gross / 2, ly - gross / 2, gross, gross);
          var kg = Math.max(1.5 * dpr, ls * 0.07);
          ctx.globalAlpha = Math.min(1, alpha * 1.15);
          ctx.drawImage(kern, lx - kg / 2, ly - kg * 0.65, kg, kg * 1.3);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      // dunkle Ränder (einmal je Größe vorbereitet)
      if (rand.width !== w || rand.height !== h) {
        rand.width = w; rand.height = h;
        var rc = rand.getContext('2d');
        var rv = rc.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.32, w / 2, h * 0.55, Math.max(w, h) * 0.78);
        rv.addColorStop(0, 'rgba(4,6,5,0)');
        rv.addColorStop(1, 'rgba(4,6,5,0.6)');
        rc.fillStyle = rv;
        rc.fillRect(0, 0, w, h);
      }
      ctx.drawImage(rand, 0, 0);
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
    function einmal() {
      if (!laeuft) zeichnen(performance.now() / 1000);
    }

    groesse();
    takt = canvas.clientWidth < 700 ? 1000 / 30 - 2 : 0;
    einmal();

    function freigeben() {
      bereit = true;
      starten();
    }
    if (document.readyState === 'complete') setTimeout(freigeben, 200);
    else window.addEventListener('load', function () { setTimeout(freigeben, 200); });

    if ('ResizeObserver' in window) {
      new ResizeObserver(function () { if (groesse()) einmal(); }).observe(canvas);
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
      // Lichter neu entzünden (für den Einstieg)
      neuEntzuenden: function () { start = laeuft ? performance.now() / 1000 : null; },
      zeichnen: einmal
    };
  }

  window.Lichtermeer = Lichtermeer;
})();
