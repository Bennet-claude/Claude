/* ==========================================================================
   Böker – Konzeptentwurf: Scroll-Animationen (GSAP + ScrollTrigger, lokal)

   Zwei Highlights
     H1  „Das Tor öffnet sich“  – Start: Der Bogen weitet sich zum ganzen Bild,
                                   es dämmert, die Aussage erscheint.
     H2  „Lichter am Weg“       – Im Trauerfall: Eine Linie wächst mit dem Scrollen
                                   (ab 72em waagerecht, sonst senkrecht), an jedem
                                   Schritt entzündet sich ein Licht.
   Drei ruhige Animationen
     R1  Feine Linien           – Trennlinien ziehen sich von links nach rechts.
     R2  Bogenfenster           – Bild-Platzhalter öffnen sich von unten.
     R3  Ruhiges Einblenden     – Textgruppen erscheinen sanft nacheinander.

   Grundsatz: Ohne JavaScript oder bei „Bewegung reduzieren“ ist alles sofort
   sichtbar. Animationen setzen ihren Startzustand erst hier per JS.
   ========================================================================== */
(function () {
  'use strict';

  var gsap = window.gsap;
  var ScrollTrigger = window.ScrollTrigger;
  if (!gsap || !ScrollTrigger) return;

  gsap.registerPlugin(ScrollTrigger);

  var root = document.documentElement;
  var css = getComputedStyle(root);
  // Grundtempo aus CSS (--motion-duration), damit Design und Bewegung eine Quelle haben
  var D = parseFloat(css.getPropertyValue('--motion-duration')) || 1.6;
  var EASE = 'power2.out';   // entspricht etwa --motion-ease

  var mm = gsap.matchMedia();

  mm.add(
    {
      ok: '(prefers-reduced-motion: no-preference)',
      reduce: '(prefers-reduced-motion: reduce)',
      desktop: '(min-width: 64em)',
      quer: '(min-width: 72em)'
    },
    function (context) {
      var c = context.conditions;
      if (!c.ok) {
        root.classList.remove('motion-ok');
        return;
      }
      root.classList.add('motion-ok');

      var cleanup = [];
      cleanup.push(tor(c.desktop));
      cleanup.push(lichterAmWeg(c.quer));
      feineLinien();
      bogenfenster();
      ruhigesEinblenden();

      return function () {
        cleanup.forEach(function (fn) { if (fn) fn(); });
      };
    }
  );

  // Positionen neu berechnen, sobald die Schriften geladen sind
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
  }

  /* ------------------------------------------------------------------------
     H1 – Das Tor öffnet sich
     ------------------------------------------------------------------------ */
  function tor(desktop) {
    var hero = document.querySelector('.hero');
    if (!hero) return;
    var slot = hero.querySelector('[data-tor-slot]');
    var torEl = hero.querySelector('[data-tor]');
    var bild = hero.querySelector('[data-tor-bild]');
    var schatten = hero.querySelector('[data-tor-schatten]');
    var aussage = hero.querySelector('[data-tor-aussage]');
    var text = hero.querySelector('.hero__text');
    var kopf = document.querySelector('.kopf');

    // Geometrie des Bogens relativ zum Abschnitt
    function geo() {
      var h = hero.getBoundingClientRect();
      var s = slot.getBoundingClientRect();
      var r = Math.round;
      return {
        t: r(s.top - h.top),
        r: r(h.right - s.right),
        b: r(h.bottom - s.bottom),
        l: r(s.left - h.left),
        rad: Math.floor(s.width / 2),
        mitte: r(s.left - h.left + s.width / 2)
      };
    }
    function bogen() {
      var g = geo();
      hero.style.setProperty('--label-x', g.mitte + 'px');
      return 'inset(' + g.t + 'px ' + g.r + 'px ' + g.b + 'px ' + g.l + 'px round ' +
        g.rad + 'px ' + g.rad + 'px 0px 0px)';
    }
    var offen = 'inset(0px 0px 0px 0px round 0px 0px 0px 0px)';

    hero.classList.add('is-tor');

    var tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: hero,
        start: function () { return 'top ' + (desktop && kopf ? kopf.offsetHeight : 0) + 'px'; },
        end: function () { return '+=' + Math.round(window.innerHeight * (desktop ? 1.15 : 0.95)); },
        pin: true,
        scrub: 1.4,              // langsames Nachziehen
        anticipatePin: 1,
        invalidateOnRefresh: true
      }
    });

    tl.to(text, { autoAlpha: 0, y: -36, duration: 0.3 }, 0)
      .fromTo(torEl, { clipPath: bogen }, { clipPath: offen, duration: 0.62, ease: 'power1.inOut' }, 0.04)
      .fromTo(bild, { scale: 1.14 }, { scale: 1, duration: 0.72 }, 0.04)
      .to(schatten, { opacity: 1, duration: 0.45 }, 0.3)
      .fromTo(aussage,
        { opacity: 0, y: 32, filter: 'blur(6px)' },
        { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.3, ease: 'power1.out' }, 0.62)
      .to({}, { duration: 0.14 });   // kurz verweilen, bevor es weitergeht

    return function () {
      hero.classList.remove('is-tor');
      hero.style.removeProperty('--label-x');
    };
  }

  /* ------------------------------------------------------------------------
     H2 – Lichter am Weg
     ------------------------------------------------------------------------ */
  function lichterAmWeg(quer) {
    var abschnitt = document.querySelector('.trauerfall');
    var bahn = document.querySelector('.weg__bahn');
    var pfad = document.querySelector('.weg__pfad');
    var glut = document.querySelector('[data-weg-glut]');
    var schritte = gsap.utils.toArray('[data-weg-schritt]');
    if (!abschnitt || !bahn || !pfad || !glut) return;
    var lichter = schritte.map(function (s) { return s.querySelector('.weg__licht'); });

    // Pfadlänge (main.js) vor jeder Neuberechnung aktualisieren
    var pfadKuerzen = window.boekerPfadKuerzen || function () {};
    ScrollTrigger.addEventListener('refreshInit', pfadKuerzen);

    // An welcher Stelle der Linie (0–1) sitzt welches Licht?
    var schwellen = [];
    function messen() {
      var p = pfad.getBoundingClientRect();
      schwellen = lichter.map(function (l) {
        var r = l.getBoundingClientRect();
        var pos = quer
          ? (r.left + r.width / 2 - p.left) / (p.width || 1)
          : (r.top + r.height / 2 - p.top) / (p.height || 1);
        return Math.max(0.02, Math.min(1, pos) - 0.01);
      });
    }
    messen();
    ScrollTrigger.addEventListener('refresh', messen);

    var achse = quer ? 'scaleX' : 'scaleY';
    var von = {}; von[achse] = 0;
    var bis = {
      ease: 'none',
      // Das Licht geht an, sobald die Glut es erreicht
      onUpdate: function () {
        var fortschritt = this.progress();
        schritte.forEach(function (s, i) {
          s.classList.toggle('is-lit', fortschritt >= schwellen[i]);
        });
      },
      scrollTrigger: quer
        ? { trigger: bahn, start: 'top 82%', end: 'top 32%', scrub: 1.5 }
        : { trigger: pfad, start: 'top 62%', end: 'bottom 62%', scrub: 1.2 }
    };
    bis[achse] = 1;
    gsap.fromTo(glut, von, bis);

    // Flackern nur, solange der Abschnitt zu sehen ist
    ScrollTrigger.create({
      trigger: abschnitt,
      start: 'top bottom',
      end: 'bottom top',
      toggleClass: 'is-sichtbar'
    });

    return function () {
      ScrollTrigger.removeEventListener('refreshInit', pfadKuerzen);
      ScrollTrigger.removeEventListener('refresh', messen);
      schritte.forEach(function (s) { s.classList.remove('is-lit'); });
      abschnitt.classList.remove('is-sichtbar');
    };
  }

  /* ------------------------------------------------------------------------
     R1 – Feine Linien
     ------------------------------------------------------------------------ */
  function feineLinien() {
    var linien = gsap.utils.toArray('[data-line]');
    if (!linien.length) return;
    gsap.set(linien, { scaleX: 0 });
    ScrollTrigger.batch(linien, {
      start: 'top 90%',
      once: true,
      onEnter: function (batch) {
        gsap.to(batch, { scaleX: 1, duration: D * 1.15, ease: 'power2.inOut', stagger: 0.18, overwrite: true });
      }
    });
  }

  /* ------------------------------------------------------------------------
     R2 – Bogenfenster
     ------------------------------------------------------------------------ */
  function bogenfenster() {
    gsap.utils.toArray('[data-window]').forEach(function (el) {
      var label = el.querySelector('.ph__label');
      var tl = gsap.timeline({
        scrollTrigger: { trigger: el, start: 'top 85%', once: true }
      });
      tl.fromTo(el,
          { clipPath: 'inset(100% 0% 0% 0%)' },
          { clipPath: 'inset(0% 0% 0% 0%)', duration: D * 1.35, ease: 'power2.inOut', clearProps: 'clipPath' })
        .from(label, { autoAlpha: 0, y: 8, duration: D * 0.6, ease: EASE }, '-=0.5');
    });
  }

  /* ------------------------------------------------------------------------
     R3 – Ruhiges Einblenden
     ------------------------------------------------------------------------ */
  function ruhigesEinblenden() {
    gsap.utils.toArray('[data-fade], [data-fade-list]').forEach(function (gruppe) {
      var einzeln = gruppe.matches('h1, h2, h3, p') || !gruppe.children.length;
      var teile = einzeln ? [gruppe] : gsap.utils.toArray(gruppe.children);
      gsap.from(teile, {
        autoAlpha: 0,
        y: 24,
        duration: D,
        ease: EASE,
        stagger: gruppe.hasAttribute('data-fade-list') ? 0.2 : 0.14,
        scrollTrigger: { trigger: gruppe, start: 'top 86%', once: true }
      });
    });
  }
})();
