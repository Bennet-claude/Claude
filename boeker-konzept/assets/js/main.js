/* Böker – Konzeptentwurf: Grundfunktionen (Vanilla JS, kein Framework)
   Menü, Absicherung ohne GSAP, Abendgang (Bilderfolge) starten und anhalten,
   Grablichter an den Steinen, Pfadlänge im Trauerfall-Weg. */
(function () {
  'use strict';

  var root = document.documentElement;
  var ruhig = !(window.matchMedia && matchMedia('(prefers-reduced-motion: no-preference)').matches);

  // Falls GSAP nicht geladen wurde: Bewegungs-Layout abschalten, damit alle Inhalte sichtbar sind.
  if (!window.gsap || !window.ScrollTrigger) {
    root.classList.remove('motion-ok');
  }

  var maus = !!(window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches);

  /* ---------- Abendgang: die Bilderfolge im Einstieg ---------- */
  // Der Ablauf selbst ist reines CSS (style.css, „Abendgang“). Hier wird er gestartet,
  // sobald alle Szenen geladen sind, und angehalten: per Knopf, außerhalb des Bildes,
  // bei verdecktem Tab. Bei „Bewegung reduzieren“ blättert der Knopf von Hand weiter.
  var film = document.querySelector('[data-film]');
  if (film) {
    var knopf = film.querySelector('[data-film-knopf]');
    var knopfText = film.querySelector('[data-film-text]');
    var symbol = film.querySelector('[data-film-symbol]');
    var szenen = film.querySelectorAll('.film__bild');
    var titel = film.querySelectorAll('.film__titel span');
    var SYMBOL = {   // Phosphor Icons (regular)
      anhalten: 'M200,32H160a16,16,0,0,0-16,16V208a16,16,0,0,0,16,16h40a16,16,0,0,0,16-16V48A16,16,0,0,0,200,32Zm0,176H160V48h40ZM96,32H56A16,16,0,0,0,40,48V208a16,16,0,0,0,16,16H96a16,16,0,0,0,16-16V48A16,16,0,0,0,96,32Zm0,176H56V48H96Z',
      abspielen: 'M232.4,114.49,88.32,26.35a16,16,0,0,0-16.2-.3A15.86,15.86,0,0,0,64,39.87V216.13A15.94,15.94,0,0,0,80,232a16.07,16.07,0,0,0,8.36-2.35L232.4,141.51a15.81,15.81,0,0,0,0-27ZM80,215.94V40l143.83,88Z',
      weiter: 'M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z'
    };
    var angehalten = false, imBild = true, aktiv = 0;

    var zustand = function () {
      film.classList.toggle('film--ruht', angehalten || !imBild || document.hidden);
    };
    var zeigen = function (n) {
      aktiv = n;
      Array.prototype.forEach.call(szenen, function (el, i) { el.classList.toggle('ist-aktiv', i === n); });
      Array.prototype.forEach.call(titel, function (el, i) { el.classList.toggle('ist-aktiv', i === n); });
    };

    if (ruhig) {
      film.classList.add('film--manuell');
      knopfText.textContent = 'Nächstes Bild';
      symbol.setAttribute('d', SYMBOL.weiter);
      zeigen(0);
      knopf.addEventListener('click', function () { zeigen((aktiv + 1) % szenen.length); });
    } else {
      knopf.addEventListener('click', function () {
        angehalten = !angehalten;
        knopfText.textContent = angehalten ? 'Abspielen' : 'Anhalten';
        symbol.setAttribute('d', angehalten ? SYMBOL.abspielen : SYMBOL.anhalten);
        zustand();
      });
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (eintraege) {
          imBild = eintraege[eintraege.length - 1].isIntersecting;
          zustand();
        }).observe(film);
      }
      document.addEventListener('visibilitychange', zustand);
      // Erst starten, wenn alle Szenen dekodiert sind, sonst bliebe eine Überblendung leer.
      // Bis dahin steht die erste Szene still, genau im Zustand, an dem der Ablauf einsetzt.
      Promise.all(Array.prototype.map.call(film.querySelectorAll('img'), function (img) {
        if (img.decode) return img.decode().catch(function () {});
        return img.complete ? null : new Promise(function (fertig) { img.onload = img.onerror = fertig; });
      })).then(function () {
        zustand();
        film.classList.add('film--laeuft');
      });
    }
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
