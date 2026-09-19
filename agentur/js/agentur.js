/* Studio Leine — Bewegung.
   Drei Dinge, mehr passiert hier nicht:
   1. Headlines zeilenweise aufbauen (SplitText)
   2. Der gepinnte Schicht-Abschnitt auf der Startseite
   3. Eine Notbremse, falls GSAP nicht laedt                     */

(function () {
  'use strict';

  var wurzel = document.documentElement;
  var ruhig = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Faellt GSAP aus, wird die Klasse 'js' wieder entfernt und alles
     steht im CSS-Grundzustand da: sichtbar, aufgefaechert, lesbar. */
  function notbremse() {
    wurzel.classList.remove('js');
  }

  if (!window.gsap || !window.ScrollTrigger) { notbremse(); return; }
  window.__bewegung = true;
  if (ruhig) { /* Endzustand direkt, siehe unten */ }

  gsap.registerPlugin(ScrollTrigger);
  var hatSplit = typeof window.SplitText !== 'undefined';
  if (hatSplit) { gsap.registerPlugin(SplitText); }

  /* cubic-bezier(0.23, 1, 0.32, 1) als Funktion, damit CSS und GSAP
     wirklich dieselbe Kurve fahren statt einer Naeherung. */
  function bezier(x1, y1, x2, y2) {
    var cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    var cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    function fx(t) { return ((ax * t + bx) * t + cx) * t; }
    function dfx(t) { return (3 * ax * t + 2 * bx) * t + cx; }
    return function (p) {
      var t = p, i, e, d;
      for (i = 0; i < 8; i++) {
        e = fx(t) - p;
        if (Math.abs(e) < 1e-5) { break; }
        d = dfx(t);
        if (Math.abs(d) < 1e-6) { break; }
        t -= e / d;
      }
      if (t < 0) { t = 0; } else if (t > 1) { t = 1; }
      return ((ay * t + by) * t + cy) * t;
    };
  }

  var sanft = bezier(0.23, 1, 0.32, 1);

  /* ---------- 1. Headlines zeilenweise ---------- */

  var kopfzeile = document.querySelector('[data-zeilen]');

  if (kopfzeile) {
    if (ruhig) {
      gsap.from(kopfzeile, { opacity: 0, duration: 0.5, ease: 'none' });
    } else if (hatSplit) {
      document.fonts.ready.then(function () {
        var geteilt = new SplitText(kopfzeile, { type: 'lines', mask: 'lines' });
        gsap.from(geteilt.lines, {
          yPercent: 108,
          opacity: 0,
          duration: 0.85,
          stagger: 0.055,
          ease: sanft
        });
      });
    } else {
      gsap.from(kopfzeile, { opacity: 0, y: 16, duration: 0.6, ease: sanft });
    }
  }

  /* ---------- 2. Der gepinnte Abschnitt ---------- */

  var buehne = document.querySelector('[data-buehne]');

  if (buehne) {
    var raum = buehne.querySelector('.stapel__raum');
    var schichten = gsap.utils.toArray(buehne.querySelectorAll('.schicht'));
    var namen = gsap.utils.toArray(buehne.querySelectorAll('.schichtnamen li'));
    var saetze = gsap.utils.toArray(buehne.querySelectorAll('.satz'));
    var tiefe = window.innerWidth < 700 ? 34 : 52;

    if (ruhig) {
      /* Endzustand direkt: Stapel aufgefaechert, alle Saetze sichtbar,
         kein Pin, kein Scrub. */
      gsap.set(raum, { rotateX: 54, rotateY: -24, transformPerspective: 1500 });
      schichten.forEach(function (el, i) { gsap.set(el, { z: i * tiefe }); });
      gsap.set(namen, { opacity: 1 });
      wurzel.classList.remove('js');
    } else {
      gsap.set(raum, { transformPerspective: 1500, transformOrigin: '50% 50%' });
      gsap.set(saetze.slice(1), { opacity: 0, yPercent: 14 });

      var band = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: buehne,
          start: 'top top',
          end: '+=2200',
          pin: true,
          scrub: 0.6,
          anticipatePin: 1,
          invalidateOnRefresh: true
        }
      });

      /* Aufrichten und eindrehen — volle transform-Angabe ueber
         rotateX/rotateY/z, keine Kurzschreibweise. */
      band.to(raum, { rotateX: 54, rotateY: -24, duration: 1 }, 0);

      schichten.forEach(function (el, i) {
        band.to(el, { z: i * tiefe, duration: 1 }, 0);
      });

      band.to(namen, { opacity: 1, duration: 0.09, stagger: 0.03 }, 0.4);

      /* Kurze Wechsel, lange Standzeiten: jeder Satz steht den groessten
         Teil seines Abschnitts bei voller Deckkraft, sonst liest man
         durchgehend halbtransparente Schrift. */
      band.to(saetze[0], { opacity: 0, yPercent: -12, duration: 0.07 }, 0.26);
      band.to(saetze[1], { opacity: 1, yPercent: 0, duration: 0.07 }, 0.33);
      band.to(saetze[1], { opacity: 0, yPercent: -12, duration: 0.07 }, 0.66);
      band.to(saetze[2], { opacity: 1, yPercent: 0, duration: 0.07 }, 0.73);
    }
  }

  /* ---------- 3. Notbremse ---------- */

  window.addEventListener('error', function (e) {
    if (e && e.target && e.target.tagName === 'SCRIPT') { notbremse(); }
  }, true);
}());
