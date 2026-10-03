/* Böker – Konzeptentwurf: Grundfunktionen (Vanilla JS, kein Framework)
   Menü, Absicherung ohne GSAP, Pfadlänge im Trauerfall-Weg, Lichtermeer anlegen. */
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
