/* Böker – Konzeptentwurf: Grundfunktionen (Vanilla JS, kein Framework)
   Menü, Absicherung ohne GSAP, Lichtermeer anlegen und bedienen,
   Grablichter an den Steinen, Pfadlänge im Trauerfall-Weg. */
(function () {
  'use strict';

  var root = document.documentElement;
  var ruhig = !(window.matchMedia && matchMedia('(prefers-reduced-motion: no-preference)').matches);

  // Falls GSAP nicht geladen wurde: Bewegungs-Layout abschalten, damit alle Inhalte sichtbar sind.
  if (!window.gsap || !window.ScrollTrigger) {
    root.classList.remove('motion-ok');
  }

  /* ---------- Lichtermeer: Start (Feld) und Kontakt (Horizont) ---------- */
  window.boekerMeer = {};
  if (window.Lichtermeer) {
    var klein = window.innerWidth < 700;
    var feld = document.querySelector('[data-meer]');
    var horizont = document.querySelector('[data-meer-horizont]');
    if (feld) {
      window.boekerMeer.feld = window.Lichtermeer(feld, { modus: 'feld', dichte: klein ? 0.55 : 1, ruhig: ruhig, seed: 7, beobachten: feld.closest('section') });
    }
    if (horizont) {
      window.boekerMeer.horizont = window.Lichtermeer(horizont, { modus: 'horizont', dichte: klein ? 0.5 : 0.8, ruhig: ruhig, seed: 11, beobachten: horizont.parentElement });
    }
  }

  /* ---------- Lichtermeer: Laterne unter der Maus, Klick entzündet ein Licht ---------- */
  var meer = window.boekerMeer.feld;
  var tor = document.querySelector('[data-tor]');
  var meerCanvas = document.querySelector('[data-meer]');
  var lichtKnopf = document.querySelector('[data-licht-button]');
  var hinweis = document.querySelector('[data-licht-hinweis]');
  var status = document.querySelector('[data-licht-status]');
  var maus = !!(window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches);

  if (hinweis && !maus) hinweis.textContent = 'Oder tippen Sie in das Bild.';

  function melden() {
    if (!status || !meer) return;
    var n = meer.anzahlEntzuendet();
    status.textContent = n === 1 ? 'Ein Licht wurde entzündet.' : 'Sie haben ' + n + ' Lichter entzündet.';
  }
  function lokal(e) {
    var r = meerCanvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  if (meer && tor && meerCanvas) {
    tor.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      var p = lokal(e);
      meer.setLaterne(p.x, p.y);
    });
    tor.addEventListener('pointerleave', function () { meer.setLaterne(null); });
    tor.addEventListener('click', function (e) {
      var p = lokal(e);
      if (meer.entzuenden(p.x, p.y)) melden();
    });
  }
  if (meer && lichtKnopf) {
    lichtKnopf.addEventListener('click', function () {
      if (meer.entzuendenZufaellig()) melden();
    });
  } else if (lichtKnopf) {
    lichtKnopf.closest('.tor__aktion').hidden = true;
  }

  /* ---------- Grabsteine: ein Grablicht bei Berührung, ein Klick lässt es brennen ---------- */
  var steine = document.querySelectorAll('.grabstein');
  Array.prototype.forEach.call(steine, function (stein) {
    stein.addEventListener('pointerenter', function (e) {
      if (e.pointerType === 'mouse') stein.classList.add('brennt');
    });
    stein.addEventListener('pointerleave', function (e) {
      if (e.pointerType === 'mouse' && !stein.classList.contains('bleibt')) stein.classList.remove('brennt');
    });
    stein.addEventListener('click', function () {
      var bleibt = !stein.classList.contains('bleibt');
      stein.classList.toggle('bleibt', bleibt);
      stein.classList.toggle('brennt', bleibt || maus);
    });
  });

  /* ---------- Weg im Trauerfall: Die Linie endet genau in der Mitte des letzten Lichts ---------- */
  var bahn = document.querySelector('.weg__bahn');
  var pfad = document.querySelector('.weg__pfad');
  function pfadKuerzen() {
    var lichter = document.querySelectorAll('.weg__licht');
    var letztes = lichter[lichter.length - 1];
    if (!bahn || !pfad || !letztes) return;
    var b = bahn.getBoundingClientRect();
    var l = letztes.getBoundingClientRect();
    var erstes = lichter[0].getBoundingClientRect();
    if (Math.abs(erstes.top - l.top) < 2) {
      // waagerechter Weg (große Bildschirme): Länge regelt das CSS
      pfad.style.removeProperty('bottom');
      return;
    }
    pfad.style.bottom = Math.round(b.bottom - (l.top + l.height / 2)) + 'px';
  }
  window.boekerPfadKuerzen = pfadKuerzen;
  pfadKuerzen();
  if (bahn && 'ResizeObserver' in window) new ResizeObserver(pfadKuerzen).observe(bahn);

  /* ---------- Menü (mobil und Tablet) ---------- */
  var toggle = document.querySelector('.nav__toggle');
  var liste = document.getElementById('nav-liste');
  if (!toggle || !liste) return;

  function setOffen(offen) {
    toggle.setAttribute('aria-expanded', String(offen));
    liste.classList.toggle('is-offen', offen);
  }

  toggle.addEventListener('click', function () {
    setOffen(toggle.getAttribute('aria-expanded') !== 'true');
  });

  liste.addEventListener('click', function (e) {
    if (e.target.closest('a')) setOffen(false);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setOffen(false);
      toggle.focus();
    }
  });

  document.addEventListener('click', function (e) {
    if (toggle.getAttribute('aria-expanded') === 'true' && !e.target.closest('.nav')) {
      setOffen(false);
    }
  });
})();
