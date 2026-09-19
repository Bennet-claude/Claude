/* Studio Leine — Bewegung.
   1. Lenis glaettet das Scrollen auf Zeigergeraeten
   2. Headlines bauen sich zeilenweise auf (SplitText)
   3. Der gepinnte Schicht-Abschnitt auf der Startseite
   4. Die Leiste weicht beim Runterscrollen aus
   5. Notbremse, falls etwas davon nicht laedt                   */

(function () {
  'use strict';

  var wurzel = document.documentElement;
  var ruhig = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function notbremse() { wurzel.classList.remove('js'); }

  /* Preisschalter. Steht bewusst vor der GSAP-Pruefung: wenn die
     Bewegungsbibliothek ausfaellt, muss der Schalter trotzdem gehen. */
  var schalter = document.querySelector('.schalter');
  if (schalter) {
    var tarife = document.querySelector('.tarife');
    schalter.addEventListener('click', function () {
      var an = schalter.getAttribute('aria-pressed') === 'true';
      schalter.setAttribute('aria-pressed', an ? 'false' : 'true');
      if (tarife) { tarife.setAttribute('data-pflege', an ? 'aus' : 'an'); }
    });
  }

  if (!window.gsap || !window.ScrollTrigger) { notbremse(); return; }
  window.__bewegung = true;

  /* Sicherheitsnetz: falls der Browser die Scrollposition doch
     wiederhergestellt hat, oben anfangen — ausser bei einem Anker. */
  if (!window.location.hash) { window.scrollTo(0, 0); }

  gsap.registerPlugin(ScrollTrigger);
  var hatSplit = typeof window.SplitText !== 'undefined';
  if (hatSplit) { gsap.registerPlugin(SplitText); }

  /* cubic-bezier(0.23, 1, 0.32, 1) als Funktion, damit CSS und GSAP
     dieselbe Kurve fahren statt einer Naeherung. */
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

  /* ---------- 1. Flüssiges Scrollen ----------
     Nur auf Geraeten mit echtem Zeiger. Auf dem Telefon bleibt das
     native Scrollen von iOS stehen — das ist dort schneller und
     verhaeltnismaessig immer fluessiger als jede Bibliothek. */

  var zeiger = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  if (window.Lenis && zeiger && !ruhig) {
    var lenis = new Lenis({
      duration: 0.85,
      easing: sanft,
      smoothWheel: true,
      syncTouch: false,
      wheelMultiplier: 1.05
    });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function (zeit) { lenis.raf(zeit * 1000); });
    gsap.ticker.lagSmoothing(0);
  }

  /* ---------- 2. Headlines zeilenweise ---------- */

  var kopfzeile = document.querySelector('[data-zeilen]');

  if (kopfzeile) {
    if (ruhig) {
      gsap.from(kopfzeile, { opacity: 0, duration: 0.4, ease: 'none' });
    } else if (hatSplit) {
      document.fonts.ready.then(function () {
        var geteilt = new SplitText(kopfzeile, { type: 'lines', mask: 'lines' });
        gsap.from(geteilt.lines, {
          yPercent: 108,
          opacity: 0,
          duration: 0.7,
          stagger: 0.045,
          ease: sanft
        });
      });
    } else {
      gsap.from(kopfzeile, { opacity: 0, y: 16, duration: 0.5, ease: sanft });
    }
  }

  /* ---------- 3. Der gepinnte Abschnitt ----------
     Kurz gehalten: die ganze Drehung laeuft in einer knappen
     Bildschirmhoehe Scrollweg ab. Laenger fuehlt sich an, als
     wuerde die Seite einen festhalten. */

  var buehne = document.querySelector('[data-buehne]');

  if (buehne) {
    var raum = buehne.querySelector('.stapel__raum');
    var schichten = gsap.utils.toArray(buehne.querySelectorAll('.schicht'));
    var namen = gsap.utils.toArray(buehne.querySelectorAll('.schichtnamen li'));
    var saetze = gsap.utils.toArray(buehne.querySelectorAll('.satz'));
    var schmal = window.innerWidth < 940;
    var tiefe = schmal ? 34 : 52;

    if (ruhig) {
      gsap.set(raum, { rotateX: 54, rotateY: -24, transformPerspective: 1500 });
      schichten.forEach(function (el, i) { gsap.set(el, { z: i * tiefe }); });
      gsap.set(namen, { opacity: 1 });
      wurzel.classList.remove('js');
    } else {
      gsap.set(raum, { transformPerspective: 1500, transformOrigin: '50% 50%' });
      gsap.set(saetze.slice(1), { opacity: 0, yPercent: 12 });

      var band = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: buehne,
          start: 'top top',
          end: schmal ? '+=620' : '+=900',
          pin: true,
          scrub: 0.35,
          anticipatePin: 1,
          invalidateOnRefresh: true
        }
      });

      /* Volle transform-Angabe ueber rotateX/rotateY/z, keine
         Kurzschreibweise. */
      band.to(raum, { rotateX: 54, rotateY: -24, duration: 1 }, 0);

      schichten.forEach(function (el, i) {
        band.to(el, { z: i * tiefe, duration: 1 }, 0);
      });

      band.to(namen, { opacity: 1, duration: 0.07, stagger: 0.025 }, 0.34);

      band.to(saetze[0], { opacity: 0, yPercent: -10, duration: 0.06 }, 0.24);
      band.to(saetze[1], { opacity: 1, yPercent: 0, duration: 0.06 }, 0.3);
      band.to(saetze[1], { opacity: 0, yPercent: -10, duration: 0.06 }, 0.64);
      band.to(saetze[2], { opacity: 1, yPercent: 0, duration: 0.06 }, 0.7);
    }
  }

  /* ---------- 4. Leiste weicht aus ---------- */

  var kopf = document.querySelector('.kopf');

  if (kopf && !ruhig) {
    var zuletzt = 0;
    ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: function (selbst) {
        var y = selbst.scroll();
        if (y < 140) { kopf.classList.remove('kopf--weg'); }
        else if (y > zuletzt + 6) { kopf.classList.add('kopf--weg'); }
        else if (y < zuletzt - 6) { kopf.classList.remove('kopf--weg'); }
        zuletzt = y;
      }
    });
  }

  /* Zurueck-Button: die Seite kommt aus dem bfcache, das Skript laeuft
     nicht neu. Ohne das bleibt die Leiste ausgeblendet haengen. */
  window.addEventListener('pageshow', function (e) {
    if (e.persisted && kopf) {
      kopf.classList.remove('kopf--weg');
      ScrollTrigger.refresh();
    }
  });

  /* ---------- 5. Notbremse ---------- */

  window.addEventListener('error', function (e) {
    if (e && e.target && e.target.tagName === 'SCRIPT') { notbremse(); }
  }, true);
}());
