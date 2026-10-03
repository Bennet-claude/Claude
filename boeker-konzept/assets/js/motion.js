/* ==========================================================================
   Böker – Konzeptentwurf: Bewegung (GSAP + ScrollTrigger, lokal)

   Zwei Highlights
     H1  „Lichtermeer“      – Beim Laden zieht sich ein goldener Umriss um den
                              Bogen, darin erscheint ein Friedhof bei Nacht, die
                              Grablichter gehen nacheinander an. Beim Scrollen
                              öffnet sich der Bogen zum ganzen Bild und die Kamera
                              gleitet langsam über das Lichtermeer.
     H2  „Lichter am Weg“   – Im Trauerfall läuft ein Funke die goldene Linie
                              entlang und entzündet jeden Schritt.
   Drei ruhige Animationen
     R1  Steine             – Eine Erdlinie zieht sich über die Breite, die Steine
                              steigen nacheinander aus ihr auf, die Inschrift wird
                              von links nach rechts eingemeißelt (ab 60em, an den
                              Scroll gekoppelt, läuft genau einmal; sonst Einblenden).
     R2  Bildfenster        – Bild-Platzhalter öffnen sich von unten.
     R3  Einblenden         – Textgruppen erscheinen sanft nacheinander.
   Dazu zwei leise Übergänge zwischen Nacht und Tag: Am Morgen verlöschen kleine
   Lichter, am Abend gehen sie an.

   Grundsatz: Ohne JavaScript oder bei „Bewegung reduzieren“ ist alles sofort
   sichtbar. Startzustände setzt erst dieses Skript.
   ========================================================================== */
(function () {
  'use strict';

  var gsap = window.gsap;
  var ScrollTrigger = window.ScrollTrigger;
  if (!gsap || !ScrollTrigger) return;

  gsap.registerPlugin(ScrollTrigger);

  var root = document.documentElement;
  // Grundtempo aus CSS (--motion-duration), damit Design und Bewegung eine Quelle haben
  var D = parseFloat(getComputedStyle(root).getPropertyValue('--motion-duration')) || 1.6;
  var EASE = 'power2.out';

  function mischen(a, b, t) { return a + (b - a) * t; }

  var mm = gsap.matchMedia();

  mm.add(
    {
      ok: '(prefers-reduced-motion: no-preference)',
      reduce: '(prefers-reduced-motion: reduce)',
      desktop: '(min-width: 64em)',
      quer: '(min-width: 72em)',
      reihe: '(min-width: 60em)'
    },
    function (context) {
      var c = context.conditions;
      if (!c.ok) {
        root.classList.remove('motion-ok');
        return;
      }
      root.classList.add('motion-ok');

      var aufraeumen = [];
      aufraeumen.push(lichtermeer(c.desktop));
      aufraeumen.push(lichterAmWeg(c.quer));
      aufraeumen.push(steine(c.reihe));
      uebergaenge();
      bildfenster();
      einblenden();

      return function () {
        aufraeumen.forEach(function (fn) { if (fn) fn(); });
      };
    }
  );

  // Positionen neu berechnen, sobald die Schriften geladen sind
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
  }

  /* ------------------------------------------------------------------------
     H1 – Lichtermeer
     ------------------------------------------------------------------------ */
  function lichtermeer(desktop) {
    var hero = document.querySelector('.hero');
    if (!hero) return;
    var slot = hero.querySelector('[data-tor-slot]');
    var torEl = hero.querySelector('[data-tor]');
    var schatten = hero.querySelector('[data-tor-schatten]');
    var aussage = hero.querySelector('[data-tor-aussage]');
    var text = hero.querySelector('.hero__text');
    var kopf = document.querySelector('.kopf');
    var meer = window.boekerMeer && window.boekerMeer.feld;

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
        breite: r(s.width),
        hoehe: r(s.height),
        rad: Math.floor(s.width / 2),
        mitte: (s.left - h.left + s.width / 2) / (h.width || 1),
        horizont: (s.top - h.top + s.height * 0.42) / (h.height || 1)
      };
    }
    // Der Bogen als Pfad: ein inset() mit runden Ecken wird über einem Canvas
    // in Chrome nur grob ausgeschnitten, path() ist exakt.
    var form = { k: 0 };
    var G = null;
    function bogenSetzen() {
      if (!G) G = geo();
      var k = form.k;
      var W = hero.clientWidth, H = hero.clientHeight;
      var L = mischen(G.l, 0, k), T = mischen(G.t, 0, k);
      var R = mischen(G.l + G.breite, W, k), B = mischen(G.t + G.hoehe, H, k);
      var rr = Math.min(mischen(G.rad, 0, k), (R - L) / 2);
      var z = function (v) { return Math.round(v * 10) / 10; };
      torEl.style.clipPath = 'path(\'M ' + z(L) + ' ' + z(B) + ' V ' + z(T + rr) +
        ' A ' + z(rr) + ' ' + z(rr) + ' 0 0 1 ' + z(L + rr) + ' ' + z(T) +
        ' H ' + z(R - rr) + ' A ' + z(rr) + ' ' + z(rr) + ' 0 0 1 ' + z(R) + ' ' + z(T + rr) +
        ' V ' + z(B) + ' Z\')';
    }
    function neuVermessen() { G = geo(); bogenSetzen(); }

    hero.classList.add('is-tor');
    neuVermessen();

    // goldener Umriss um den Bogen
    var NS = 'http://www.w3.org/2000/svg';
    var umriss = document.createElementNS(NS, 'svg');
    umriss.setAttribute('class', 'tor__umriss');
    umriss.setAttribute('aria-hidden', 'true');
    var linie = document.createElementNS(NS, 'path');
    umriss.appendChild(linie);
    hero.appendChild(umriss);
    function umrissSetzen() {
      var g = geo();
      var a = 8;
      var bw = g.breite + 2 * a;
      var bh = g.hoehe + a;
      var r = bw / 2;
      umriss.style.left = (g.l - a) + 'px';
      umriss.style.top = (g.t - a) + 'px';
      umriss.setAttribute('width', bw);
      umriss.setAttribute('height', bh);
      umriss.setAttribute('viewBox', '0 0 ' + bw + ' ' + bh);
      linie.setAttribute('d', 'M0.5,' + bh + ' V' + r + ' A' + (r - 0.5) + ',' + (r - 0.5) + ' 0 0 1 ' + (bw - 0.5) + ',' + r + ' V' + bh);
      var laenge = linie.getTotalLength();
      linie.style.strokeDasharray = laenge;
      return laenge;
    }
    var laenge = umrissSetzen();
    ScrollTrigger.addEventListener('refreshInit', umrissSetzen);

    // Blickpunkt: Fluchtpunkt und Horizont erst im Bogen, beim Öffnen in der Bildmitte
    var kamera = { p: 0, f: 0 };
    function fluchtSetzen() {
      if (!meer) return;
      var g = geo();
      meer.setFlucht(mischen(g.mitte, 0.5, kamera.f));
      meer.setHorizont(mischen(g.horizont, 0.47, kamera.f));
    }
    function fahrtSetzen() {
      if (meer) meer.setFortschritt(kamera.p);
    }
    fluchtSetzen();

    // Einstieg: Umriss zeichnet sich, die Nacht erscheint, die Lichter gehen an
    var intro = gsap.timeline({ delay: 0.2 });
    if (window.scrollY < 40) {
      intro
        .fromTo(linie, { strokeDashoffset: laenge }, { strokeDashoffset: 0, duration: 2.4, ease: 'power2.inOut' })
        .fromTo(torEl, { opacity: 0 }, {
          opacity: 1,
          duration: 1.5,
          ease: 'power1.out',
          onStart: function () { if (meer) meer.neuEntzuenden(); }
        }, 0.9);
    } else {
      gsap.set(linie, { strokeDashoffset: 0 });
      gsap.set(torEl, { opacity: 1 });
    }

    // Scrollen: der Bogen öffnet sich, die Kamera gleitet über das Lichtermeer
    var tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: hero,
        start: function () { return 'top ' + (desktop && kopf ? kopf.offsetHeight : 0) + 'px'; },
        end: function () { return '+=' + Math.round(window.innerHeight * (desktop ? 1.5 : 1.2)); },
        pin: true,
        scrub: 1.2,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onRefresh: function () { neuVermessen(); fluchtSetzen(); },
        // der Button in der Aussage ist erst bedienbar, wenn sie zu lesen ist
        onUpdate: function (self) { aussage.classList.toggle('ist-sichtbar', self.progress > 0.8); }
      }
    });

    tl.to(text, { autoAlpha: 0, y: -40, duration: 0.24 }, 0)
      .to(umriss, { opacity: 0, duration: 0.1 }, 0)
      .to(form, { k: 1, duration: 0.46, ease: 'power2.inOut', onUpdate: bogenSetzen }, 0.03)
      .to(kamera, { f: 1, duration: 0.46, ease: 'power2.inOut', onUpdate: fluchtSetzen }, 0.03)
      .to(kamera, { p: 1, duration: 0.95, ease: 'power1.inOut', onUpdate: fahrtSetzen }, 0.05)
      .to(schatten, { opacity: 1, duration: 0.28 }, 0.5)
      .fromTo(aussage,
        { opacity: 0, y: 36, filter: 'blur(8px)' },
        { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.26, ease: 'power2.out' }, 0.64)
      .to({}, { duration: 0.08 });   // kurz verweilen

    // Tastatur: Bekommt der Button in der Aussage den Fokus, bevor sie zu sehen ist,
    // springt die Seite ans Ende der Kamerafahrt, damit er sichtbar wird.
    function fokusZeigen() {
      if (!aussage.classList.contains('ist-sichtbar') && tl.scrollTrigger) {
        window.scrollTo(0, Math.ceil(tl.scrollTrigger.end));
      }
    }
    aussage.addEventListener('focusin', fokusZeigen);

    return function () {
      ScrollTrigger.removeEventListener('refreshInit', umrissSetzen);
      aussage.removeEventListener('focusin', fokusZeigen);
      intro.kill();
      if (umriss.parentNode) umriss.parentNode.removeChild(umriss);
      hero.classList.remove('is-tor');
      aussage.classList.remove('ist-sichtbar');
      torEl.style.clipPath = '';
      if (meer) { meer.setFortschritt(0); meer.setFlucht(0.5); meer.setHorizont(null); }
    };
  }

  /* ------------------------------------------------------------------------
     H2 – Lichter am Weg
     Startet, sobald der Weg ins Bild kommt; ist der Abschnitt ganz zu sehen,
     brennen alle vier Lichter.
     ------------------------------------------------------------------------ */
  function lichterAmWeg(quer) {
    var abschnitt = document.querySelector('.trauerfall');
    var bahn = document.querySelector('.weg__bahn');
    var pfad = document.querySelector('.weg__pfad');
    var glut = document.querySelector('[data-weg-glut]');
    var funke = document.querySelector('[data-weg-funke]');
    var schritte = gsap.utils.toArray('[data-weg-schritt]');
    if (!abschnitt || !bahn || !pfad || !glut || !funke) return;
    var lichter = schritte.map(function (s) { return s.querySelector('.weg__licht'); });

    // Pfadlänge (main.js) vor jeder Neuberechnung aktualisieren
    var pfadKuerzen = window.boekerPfadKuerzen || function () {};
    ScrollTrigger.addEventListener('refreshInit', pfadKuerzen);

    // An welcher Stelle der Linie (0–1) sitzt welches Licht?
    var schwellen = [];
    var laenge = 0;
    function messen() {
      var p = pfad.getBoundingClientRect();
      laenge = quer ? p.width : p.height;
      schwellen = lichter.map(function (l) {
        var r = l.getBoundingClientRect();
        var pos = quer
          ? (r.left + r.width / 2 - p.left) / (p.width || 1)
          : (r.top + r.height / 2 - p.top) / (p.height || 1);
        return Math.max(0.01, Math.min(1, pos) - 0.015);
      });
    }
    messen();
    ScrollTrigger.addEventListener('refresh', messen);

    gsap.set(funke, { xPercent: -50, yPercent: -50 });
    var funkePos = gsap.quickSetter(funke, quer ? 'x' : 'y', 'px');
    var funkeAlpha = gsap.quickSetter(funke, 'opacity');

    var achse = quer ? 'scaleX' : 'scaleY';
    var von = {};
    von[achse] = 0;
    var bis = {
      ease: 'none',
      onUpdate: function () {
        var f = this.progress();
        funkePos(f * laenge);
        funkeAlpha(f > 0.004 && f < 0.996 ? 1 : 0);
        // das Licht geht an, sobald die Glut es erreicht
        schritte.forEach(function (s, i) {
          s.classList.toggle('is-lit', f >= schwellen[i]);
        });
      },
      scrollTrigger: quer
        ? { trigger: bahn, start: 'top 96%', end: 'top 46%', scrub: 1 }
        : { trigger: pfad, start: 'top 88%', end: 'bottom 62%', scrub: 1 }
    };
    bis[achse] = 1;
    var tween = gsap.fromTo(glut, von, bis);

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
      tween.kill();
      schritte.forEach(function (s) { s.classList.remove('is-lit'); });
      abschnitt.classList.remove('is-sichtbar');
    };
  }

  /* ------------------------------------------------------------------------
     R1 – Steine steigen aus der Erde
     Eine Choreografie, an den Scroll gekoppelt: Sie ist fertig, wenn die Reihe
     ganz zu sehen ist, und bleibt danach stehen (kein Absinken beim Zurückscrollen).
     ------------------------------------------------------------------------ */
  function steine(reihe1) {
    var reihe = document.querySelector('[data-steine]');
    var boden = document.querySelector('[data-steine-boden]');
    if (!reihe) return;
    var alle = gsap.utils.toArray(reihe.children);

    if (!reihe1) {
      // Handy und Tablet: Liste, sanft einblenden
      gsap.from(alle, {
        opacity: 0,
        y: 28,
        duration: D,
        ease: EASE,
        stagger: 0.14,
        scrollTrigger: { trigger: reihe, start: 'top 85%', once: true }
      });
      return;
    }

    var inschriften = alle.map(function (s) { return s.querySelector('.grabstein__inschrift'); });

    var tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: reihe,
        start: 'top 92%',
        end: 'bottom 78%',
        scrub: 1.4,
        invalidateOnRefresh: true
      },
      onComplete: function () {
        // einmal ganz aufgebaut: stehen lassen
        if (tl.scrollTrigger) tl.scrollTrigger.kill(false);
      }
    });

    // 1. die Erdlinie zieht sich von links nach rechts
    if (boden) tl.fromTo(boden, { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: 'power1.inOut' }, 0);

    // 2. jeder Stein steigt dort auf, wo die Linie gerade angekommen ist
    alle.forEach(function (stein, i) {
      var beginn = 0.12 + i * 0.13;
      tl.fromTo(stein,
        { yPercent: 101 },
        { yPercent: 0, duration: 0.42, ease: 'power2.out' }, beginn);
      // 3. die Inschrift wird von links nach rechts eingemeißelt
      if (inschriften[i]) {
        tl.fromTo(inschriften[i],
          { clipPath: 'inset(0% 100% 0% 0%)' },
          { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.3, ease: 'power1.inOut' }, beginn + 0.3);
      }
    });

    return function () {
      gsap.set(alle, { clearProps: 'transform' });
      gsap.set(inschriften, { clearProps: 'clipPath' });
      if (boden) gsap.set(boden, { clearProps: 'transform' });
    };
  }

  /* ------------------------------------------------------------------------
     Übergänge zwischen Nacht und Tag: kleine Lichter verlöschen und gehen an
     ------------------------------------------------------------------------ */
  function uebergaenge() {
    gsap.utils.toArray('[data-uebergang]').forEach(function (zone) {
      var lichter = zone.querySelectorAll('span');
      if (!lichter.length) return;
      var morgen = zone.getAttribute('data-uebergang') === 'morgen';
      var reihenfolge = gsap.utils.shuffle(gsap.utils.toArray(lichter).slice());
      gsap.fromTo(reihenfolge,
        { opacity: morgen ? 0.95 : 0, scale: morgen ? 1 : 0.4 },
        {
          opacity: morgen ? 0 : 0.95,
          scale: morgen ? 0.4 : 1,
          ease: 'power1.inOut',
          stagger: 0.18,
          scrollTrigger: morgen
            ? { trigger: zone, start: 'top 75%', end: 'bottom 35%', scrub: 1.5 }
            : { trigger: zone, start: 'top 85%', end: 'bottom 55%', scrub: 1.5 }
        });
    });
  }

  /* ------------------------------------------------------------------------
     R2 – Bildfenster
     ------------------------------------------------------------------------ */
  function bildfenster() {
    gsap.utils.toArray('[data-window]').forEach(function (el) {
      var label = el.querySelector('.ph__text');
      var tl = gsap.timeline({
        scrollTrigger: { trigger: el, start: 'top 85%', once: true }
      });
      tl.fromTo(el,
          { clipPath: 'inset(100% 0% 0% 0%)' },
          { clipPath: 'inset(0% 0% 0% 0%)', duration: D * 1.3, ease: 'power3.inOut', clearProps: 'clipPath' });
      if (label) tl.from(label, { opacity: 0, y: 8, duration: D * 0.5, ease: EASE }, '-=0.5');
    });
  }

  /* ------------------------------------------------------------------------
     R3 – Ruhiges Einblenden
     ------------------------------------------------------------------------ */
  function einblenden() {
    gsap.utils.toArray('[data-fade], [data-fade-list]').forEach(function (gruppe) {
      var einzeln = gruppe.matches('h1, h2, h3, p') || !gruppe.children.length;
      var teile = einzeln ? [gruppe] : gsap.utils.toArray(gruppe.children);
      gsap.from(teile, {
        opacity: 0,
        y: 24,
        duration: D,
        ease: EASE,
        stagger: gruppe.hasAttribute('data-fade-list') ? 0.16 : 0.12,
        scrollTrigger: { trigger: gruppe, start: 'top 86%', once: true }
      });
    });
  }
})();
