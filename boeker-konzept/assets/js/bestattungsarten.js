/* ==========================================================================
   Böker – Konzeptentwurf: Seite „Bestattungsarten“
   Mitlaufende Leiste und fünf einfache, flache Animationen (GSAP, lokal):
     Erdbestattung     Sarg in seine Teile zerlegen
     Feuerbestattung   Urne drehen (Ziehen, Pfeiltasten, Knöpfe) und zerlegen
     Baumbestattung    Zeitregler: die Urne wird Teil des Waldbodens
     Seebestattung     die Urne sinkt, an das Scrollen gekoppelt
     Eigener Abschied  die Feier zusammenstellen
   Ohne GSAP oder bei „Bewegung reduzieren“ bleibt alles bedienbar, nur ohne Bewegung.
   ========================================================================== */
(function () {
  'use strict';

  var gsap = window.gsap;
  var ScrollTrigger = window.ScrollTrigger;
  var ruhig = !(window.matchMedia && matchMedia('(prefers-reduced-motion: no-preference)').matches);
  var NS = 'http://www.w3.org/2000/svg';
  var SYMBOL_AUS = 'M216,48V96a8,8,0,0,1-16,0V67.31l-42.34,42.35a8,8,0,0,1-11.32-11.32L188.69,56H160a8,8,0,0,1,0-16h48A8,8,0,0,1,216,48ZM98.34,146.34,56,188.69V160a8,8,0,0,0-16,0v48a8,8,0,0,0,8,8H96a8,8,0,0,0,0-16H67.31l42.35-42.34a8,8,0,0,0-11.32-11.32ZM208,152a8,8,0,0,0-8,8v28.69l-42.34-42.35a8,8,0,0,0-11.32,11.32L188.69,200H160a8,8,0,0,0,0,16h48a8,8,0,0,0,8-8V160A8,8,0,0,0,208,152ZM67.31,56H96a8,8,0,0,0,0-16H48a8,8,0,0,0-8,8V96a8,8,0,0,0,16,0V67.31l42.34,42.35a8,8,0,0,0,11.32-11.32Z';
  var SYMBOL_EIN = 'M144,104V64a8,8,0,0,1,16,0V84.69l42.34-42.35a8,8,0,0,1,11.32,11.32L171.31,96H192a8,8,0,0,1,0,16H152A8,8,0,0,1,144,104Zm-40,40H64a8,8,0,0,0,0,16H84.69L42.34,202.34a8,8,0,0,0,11.32,11.32L96,171.31V192a8,8,0,0,0,16,0V152A8,8,0,0,0,104,144Zm67.31,16H192a8,8,0,0,0,0-16H152a8,8,0,0,0-8,8v40a8,8,0,0,0,16,0V171.31l42.34,42.35a8,8,0,0,0,11.32-11.32ZM104,56a8,8,0,0,0-8,8V84.69L53.66,42.34A8,8,0,0,0,42.34,53.66L84.69,96H64a8,8,0,0,0,0,16h40a8,8,0,0,0,8-8V64A8,8,0,0,0,104,56Z';

  function klemmen(v, a, b) { return v < a ? a : v > b ? b : v; }
  function alle(sel, wurzel) { return Array.prototype.slice.call((wurzel || document).querySelectorAll(sel)); }
  function sichtbarkeit(el, rueckruf) {
    if (!('IntersectionObserver' in window)) { rueckruf(true); return; }
    new IntersectionObserver(function (e) { rueckruf(e[e.length - 1].isIntersecting); }).observe(el);
  }

  if (gsap && ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

  /* ------------------------------------------------------------------------
     Mitlaufende Leiste: der Abschnitt auf Höhe des oberen Drittels ist aktiv
     ------------------------------------------------------------------------ */
  (function leiste() {
    var leisteEl = document.querySelector('[data-artenleiste] ul');
    var links = alle('[data-leiste]');
    var abschnitte = alle('[data-art]');
    if (!leisteEl || !links.length || !('IntersectionObserver' in window)) return;
    var drin = {};
    var aktiv = null;
    function setzen(id) {
      if (id === aktiv) return;
      aktiv = id;
      links.forEach(function (a) {
        var an = a.getAttribute('data-leiste') === id;
        a.classList.toggle('ist-aktiv', an);
        if (an) {
          a.setAttribute('aria-current', 'true');
          // den aktiven Eintrag in der Leiste sichtbar halten (nur waagerecht scrollen)
          var ziel = a.offsetLeft - (leisteEl.clientWidth - a.offsetWidth) / 2;
          leisteEl.scrollTo({ left: ziel, behavior: ruhig ? 'auto' : 'smooth' });
        } else {
          a.removeAttribute('aria-current');
        }
      });
    }
    var io = new IntersectionObserver(function (eintraege) {
      eintraege.forEach(function (e) { drin[e.target.id] = e.isIntersecting; });
      var treffer = abschnitte.filter(function (el) { return drin[el.id]; });
      setzen(treffer.length ? treffer[treffer.length - 1].id : null);
    }, { rootMargin: '-30% 0px -60% 0px' });
    abschnitte.forEach(function (el) { io.observe(el); });
  })();

  /* ------------------------------------------------------------------------
     Zerlegen: Sarg und Urne zeigen ihre Teile (Knopf), Legende hebt Teile hervor
     ------------------------------------------------------------------------ */
  function zerlegen(figur, bauen) {
    var knopf = figur.querySelector('[data-zerlegen-knopf]');
    var text = knopf && knopf.querySelector('[data-knopf-text]');
    var pfad = knopf && knopf.querySelector('.btn__chip path');
    var svg = figur.querySelector('svg');

    // Legende: Zeigen oder Tippen auf einen Eintrag hebt das Teil im Bild hervor
    alle('[data-teil-name]', figur).forEach(function (li) {
      var teil = svg.querySelector('[data-teil="' + li.getAttribute('data-teil-name') + '"]');
      if (!teil) return;
      function an() { teil.classList.add('ist-hervorgehoben'); li.classList.add('ist-hervorgehoben'); }
      function aus() { teil.classList.remove('ist-hervorgehoben'); li.classList.remove('ist-hervorgehoben'); }
      li.addEventListener('pointerenter', an);
      li.addEventListener('pointerleave', aus);
      li.addEventListener('click', function () {
        var war = li.classList.contains('ist-hervorgehoben');
        alle('.ist-hervorgehoben', figur).forEach(function (el) { el.classList.remove('ist-hervorgehoben'); });
        if (!war) an();
      });
    });

    if (!knopf) return;
    if (!gsap) { knopf.hidden = true; return; }
    var tl = bauen(gsap.timeline({ paused: true, defaults: { duration: 0.9, ease: 'power3.inOut' } }), svg);
    tl.to(svg.querySelector('[data-marken]'), { opacity: 1, duration: 0.5, ease: 'power1.out' });

    knopf.addEventListener('click', function () {
      var offen = knopf.getAttribute('aria-pressed') !== 'true';
      knopf.setAttribute('aria-pressed', String(offen));
      text.textContent = offen ? 'Zusammensetzen' : 'Teile zeigen';
      if (pfad) pfad.setAttribute('d', offen ? SYMBOL_EIN : SYMBOL_AUS);
      if (ruhig) tl.progress(offen ? 1 : 0);
      else if (offen) tl.timeScale(1).play();
      else tl.timeScale(1.4).reverse();
    });
  }

  // Erdbestattung: Deckel hebt sich, die Innenausstattung kommt heraus, die Griffe lösen sich
  alle('[data-zerlegen]:not([data-urne])').forEach(function (figur) {
    zerlegen(figur, function (tl, svg) {
      var t = function (n) { return svg.querySelector('[data-teil="' + n + '"]'); };
      var aus = t('ausstattung');
      return tl
        .to(t('deckel'), { y: -150 }, 0)
        .to(aus.children[2], { y: -100 }, 0.25)                  // Kissen
        .to(aus.children[3], { y: -100 }, 0.25)                  // Naht am Kissen
        .to(aus.children[1], { y: -62 }, 0.32)                   // Decke
        .to(aus.children[0], { y: -40 }, 0.4)                    // Matratze
        .to(t('griffe'), { y: 74 }, 0.45);
    });
  });

  // Feuerbestattung: Deckel ab, Kapsel heraus, Urne nach links, Kapsel nach rechts, Kapsel auf, Kennstein heraus
  alle('[data-zerlegen][data-urne]').forEach(function (figur) {
    zerlegen(figur, function (tl, svg) {
      var t = function (n) { return svg.querySelector('[data-teil="' + n + '"]'); };
      return tl
        .to(t('deckel'), { y: -84, duration: 0.7 }, 0)
        .to(t('kapsel'), { opacity: 1, duration: 0.15 }, 0.35)
        .to(t('kapsel'), { y: -196, duration: 0.7, ease: 'power2.out' }, 0.35)
        .to(t('urne'), { x: -110, duration: 0.8 }, 1.05)
        .to(t('kapsel'), { x: 120, y: -40, duration: 0.8 }, 1.05)
        .to(t('kapseldeckel'), { y: -46, duration: 0.6 }, 1.75)
        .to(t('kennstein'), { y: -150, duration: 0.7, ease: 'power2.out' }, 2.0);
    });
    urneDrehen(figur);
  });

  /* ------------------------------------------------------------------------
     Urne drehen: Riffelung, Namensplakette und Etikett laufen um die Achse,
     das Licht bleibt stehen. Flach gezeichnet, die Drehung entsteht aus sin/cos.
     ------------------------------------------------------------------------ */
  function urneDrehen(figur) {
    var flaeche = figur.querySelector('[data-drehflaeche]');
    var rillenEl = figur.querySelector('[data-rillen]');
    var plakette = figur.querySelector('[data-plakette]');
    var etikett = figur.querySelector('[data-etikett]');
    if (!flaeche || !rillenEl) return;

    var N = 24, rillen = [];
    for (var i = 0; i < N; i++) {
      var hell = document.createElementNS(NS, 'rect');
      var dunkel = document.createElementNS(NS, 'rect');
      [hell, dunkel].forEach(function (r) { r.setAttribute('y', '262'); r.setAttribute('height', '92'); r.setAttribute('rx', '2'); });
      hell.setAttribute('fill', '#F0D29A');
      dunkel.setAttribute('fill', '#2E1F11');
      rillenEl.appendChild(hell);
      rillenEl.appendChild(dunkel);
      rillen.push([hell, dunkel]);
    }
    var stand = { phi: 0.35 };

    function umlauf(el, winkel, radius) {
      var c = Math.cos(winkel), s = Math.sin(winkel);
      if (c <= 0.05) { el.setAttribute('opacity', '0'); return; }
      el.setAttribute('opacity', String(Math.min(1, c * 1.5)));
      el.setAttribute('transform', 'translate(' + (280 + radius * s).toFixed(2) + ' 0) scale(' + c.toFixed(3) + ' 1) translate(-280 0)');
    }
    function zeichnen() {
      for (var i = 0; i < N; i++) {
        var w = stand.phi + i * Math.PI * 2 / N;
        var c = Math.cos(w), s = Math.sin(w);
        var r = rillen[i];
        if (c <= 0.02) { r[0].setAttribute('opacity', '0'); r[1].setAttribute('opacity', '0'); continue; }
        var x = 280 + 86 * s, breite = 7 * c + 0.4;
        r[1].setAttribute('x', (x - breite * 0.1).toFixed(2));
        r[1].setAttribute('width', (breite * 0.6).toFixed(2));
        r[1].setAttribute('opacity', (0.42 * c).toFixed(3));
        r[0].setAttribute('x', (x - breite * 0.7).toFixed(2));
        r[0].setAttribute('width', (breite * 0.5).toFixed(2));
        r[0].setAttribute('opacity', (0.3 * c * c).toFixed(3));
      }
      if (plakette) umlauf(plakette, stand.phi, 80);
      if (etikett) umlauf(etikett, stand.phi + 0.6, 48);
    }
    zeichnen();

    function drehenUm(winkel) {
      stopAuto();
      if (gsap && !ruhig) gsap.to(stand, { phi: stand.phi + winkel, duration: 0.9, ease: 'power3.out', onUpdate: zeichnen, overwrite: true });
      else { stand.phi += winkel; zeichnen(); }
      spaeterWeiter();
    }

    // Ziehen mit Maus, Finger oder Stift (senkrechtes Scrollen bleibt möglich: touch-action pan-y)
    var ziehen = null;
    flaeche.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return;
      stopAuto();
      if (gsap) gsap.killTweensOf(stand);
      ziehen = { x: e.clientX, phi: stand.phi, lx: e.clientX, lt: performance.now(), v: 0 };
      flaeche.setPointerCapture(e.pointerId);
    });
    flaeche.addEventListener('pointermove', function (e) {
      if (!ziehen) return;
      var jetzt = performance.now();
      var breite = flaeche.clientWidth || 1;
      stand.phi = ziehen.phi + (e.clientX - ziehen.x) / breite * Math.PI * 1.6;
      var dt = jetzt - ziehen.lt;
      if (dt > 0) ziehen.v = ziehen.v * 0.6 + ((e.clientX - ziehen.lx) / dt) * 0.4;
      ziehen.lx = e.clientX; ziehen.lt = jetzt;
      zeichnen();
    });
    function loslassen() {
      if (!ziehen) return;
      var breite = flaeche.clientWidth || 1;
      var schwung = ziehen.v * 1000 / breite * Math.PI * 1.6;   // rad pro Sekunde
      ziehen = null;
      if (gsap && !ruhig && Math.abs(schwung) > 0.3) {
        gsap.to(stand, { phi: stand.phi + klemmen(schwung, -12, 12) * 0.35, duration: 1.4, ease: 'power3.out', onUpdate: zeichnen });
      }
      spaeterWeiter();
    }
    flaeche.addEventListener('pointerup', loslassen);
    flaeche.addEventListener('pointercancel', loslassen);
    flaeche.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); drehenUm(-Math.PI / 8); }
      if (e.key === 'ArrowRight') { e.preventDefault(); drehenUm(Math.PI / 8); }
    });
    alle('[data-drehen]', figur).forEach(function (k) {
      k.addEventListener('click', function () { drehenUm(+k.getAttribute('data-drehen') * Math.PI / 4); });
    });

    // von selbst ganz langsam drehen, solange niemand eingreift und die Urne zu sehen ist
    var auto = false, imBild = false, pause = 0;
    function tick(zeit, dt) { stand.phi += (dt / 1000) * 0.22; zeichnen(); }
    function startAuto() {
      if (ruhig || !gsap || auto || !imBild) return;
      auto = true;
      gsap.ticker.add(tick);
    }
    function stopAuto() {
      clearTimeout(pause);
      if (!auto) return;
      auto = false;
      gsap.ticker.remove(tick);
    }
    function spaeterWeiter() {
      clearTimeout(pause);
      pause = setTimeout(startAuto, 5000);
    }
    sichtbarkeit(flaeche, function (an) { imBild = an; if (an) startAuto(); else stopAuto(); });
  }

  /* ------------------------------------------------------------------------
     Baumbestattung: Zeitregler
     ------------------------------------------------------------------------ */
  alle('[data-baum]').forEach(function (figur) {
    var regler = figur.querySelector('[data-zeitregler]');
    var phase = figur.querySelector('[data-phase]');
    var svg = figur.querySelector('svg');
    if (!regler) return;
    var PHASEN = [[0.15, 'Beisetzung'], [0.5, 'Mit den Jahren'], [0.88, 'Die Urne löst sich auf'], [1.01, 'Teil des Waldbodens']];
    function phasenText(p) {
      for (var i = 0; i < PHASEN.length; i++) if (p < PHASEN[i][0]) return PHASEN[i][1];
      return PHASEN[PHASEN.length - 1][1];
    }
    var letztePhase = '';
    function anzeigen(p) {
      var t = phasenText(p);
      regler.setAttribute('aria-valuetext', t);
      if (t !== letztePhase) { phase.textContent = t; letztePhase = t; }
    }

    if (!gsap) { anzeigen(0); return; }

    var tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } });
    // Hauptwurzeln sind schon ein Stück gewachsen; Seitenwurzeln (die letzten beiden)
    // setzen mitten an einer Hauptwurzel an und wachsen erst, wenn diese sie erreicht hat
    alle('[data-wurzeln] path', svg).forEach(function (w, i, liste) {
      var laenge = w.getTotalLength();
      var seite = i >= liste.length - 2;
      gsap.set(w, { strokeDasharray: laenge, strokeDashoffset: seite ? laenge : laenge * (i < 3 ? 0.55 : 0.8) });
      tl.to(w, { strokeDashoffset: 0, duration: seite ? 0.5 : 1, ease: 'power1.out' }, seite ? 0.5 : 0);
    });
    var urne = svg.querySelector('[data-baumurne]');
    tl.to(svg.querySelector('[data-risse]'), { opacity: 1, duration: 0.2 }, 0.22)
      .to(urne, { opacity: 0, scale: 0.9, transformOrigin: '50% 100%', duration: 0.45 }, 0.45)
      .to(svg.querySelector('[data-krume]'), { opacity: 0.9, duration: 0.25 }, 0.5)
      .to(alle('[data-krume] circle', svg), {
        x: function () { return gsap.utils.random(-12, 12); },
        y: function () { return gsap.utils.random(-4, 10); },
        duration: 0.45
      }, 0.5)
      .to(svg.querySelector('[data-krume]'), { opacity: 0.35, duration: 0.15 }, 0.85);

    function setzen(p) { tl.progress(p); anzeigen(p); }
    var vorfuehrung = null;
    regler.addEventListener('input', function () {
      if (vorfuehrung) { vorfuehrung.kill(); vorfuehrung = null; }
      setzen(regler.value / 100);
    });
    setzen(0);

    // einmal vorführen, wenn der Baum zum ersten Mal zu sehen ist
    if (!ruhig && ScrollTrigger) {
      ScrollTrigger.create({
        trigger: figur,
        start: 'top 65%',
        once: true,
        onEnter: function () {
          var stand = { p: 0 };
          vorfuehrung = gsap.to(stand, {
            p: 1, duration: 7, ease: 'power1.inOut', delay: 0.4,
            onUpdate: function () { regler.value = Math.round(stand.p * 100); setzen(stand.p); },
            onComplete: function () { vorfuehrung = null; }
          });
        }
      });
    }
  });

  /* ------------------------------------------------------------------------
     Seebestattung: die Urne sinkt, an das Scrollen gekoppelt
     ------------------------------------------------------------------------ */
  alle('[data-see]').forEach(function (figur) {
    var svg = figur.querySelector('svg');
    var schritte = alle('[data-schritte] li', figur);
    function schritt(p) {
      var n = p < 0.12 ? 0 : p < 0.6 ? 1 : p < 0.84 ? 2 : 3;
      schritte.forEach(function (li, i) { li.classList.toggle('ist-aktiv', i === n); });
    }
    var q = function (sel) { return svg.querySelector(sel); };
    if (!gsap || !ScrollTrigger || ruhig) {
      // Standbild: Urne auf halbem Weg, Blüten und Karte sichtbar, alle Schritte lesbar
      q('[data-blueten]').setAttribute('opacity', '1');
      q('[data-karte]').setAttribute('opacity', '1');
      q('[data-seeurne]').setAttribute('transform', 'translate(8 120)');
      schritte.forEach(function (li) { li.classList.add('ist-aktiv'); });
      return;
    }
    (function () {
      // Die Szene steht unter dem Text; sie läuft, während sie selbst durchs Bild scrollt.
      var st = { trigger: figur.querySelector('.buehne__flaeche'), start: 'top 80%', end: 'bottom 30%', scrub: 1.2 };
      st.onUpdate = function (self) { schritt(self.progress); };
      var tl = gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: st });
      tl.fromTo(q('[data-blueten]'), { opacity: 0 }, { opacity: 1, duration: 0.1 }, 0)
        .fromTo(q('[data-seeurne]'), { x: 0, y: 0, rotation: 0 }, { x: 14, y: 250, rotation: 8, transformOrigin: '50% 50%', duration: 0.7, ease: 'sine.inOut' }, 0.1)
        .fromTo(q('[data-seeurne]'), { opacity: 1 }, { opacity: 0, duration: 0.2 }, 0.62)
        .fromTo(q('[data-teilchen]'), { opacity: 0 }, { opacity: 0.9, duration: 0.12 }, 0.64)
        .fromTo(alle('[data-teilchen] circle', svg), { x: 0, y: 0 }, {
          x: function () { return gsap.utils.random(-22, 22); },
          y: function () { return gsap.utils.random(-30, -6); },
          duration: 0.3
        }, 0.64)
        .to(q('[data-teilchen]'), { opacity: 0, duration: 0.12 }, 0.86)
        .fromTo(q('[data-karte]'), { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.12 }, 0.84);
      schritt(0);
    })();
  });

  /* ------------------------------------------------------------------------
     Eigener Abschied: zusammenstellen, was zur Feier gehören soll
     ------------------------------------------------------------------------ */
  alle('[data-abschied]').forEach(function (figur) {
    var knoepfe = alle('[data-wahl]', figur);
    var text = figur.querySelector('[data-auswahl-text]');
    var NAMEN = { kerzen: 'Kerzenlicht', foto: 'Foto', blumen: 'Blumen', worte: 'Worte', musik: 'Musik' };
    function zeigen(name, an, sofort) {
      var el = figur.querySelector('[data-wahl-teil="' + name + '"]');
      if (!el) return;
      if (gsap && !sofort && !ruhig) {
        gsap.to(el, { opacity: an ? 1 : 0, y: an ? 0 : 12, duration: an ? 0.8 : 0.45, ease: an ? 'power2.out' : 'power1.in', overwrite: true });
      } else {
        el.setAttribute('opacity', an ? '1' : '0');
        if (gsap) gsap.set(el, { opacity: an ? 1 : 0, y: 0 });
      }
    }
    function zusammenfassen() {
      var gewaehlt = knoepfe.filter(function (k) { return k.getAttribute('aria-pressed') === 'true'; })
        .map(function (k) { return NAMEN[k.getAttribute('data-wahl')]; });
      text.textContent = gewaehlt.length
        ? 'Ihre Auswahl: ' + gewaehlt.join(', ') + '. Sprechen Sie uns gern darauf an.'
        : 'Noch nichts ausgewählt.';
    }
    knoepfe.forEach(function (k) {
      zeigen(k.getAttribute('data-wahl'), k.getAttribute('aria-pressed') === 'true', true);
      k.addEventListener('click', function () {
        var an = k.getAttribute('aria-pressed') !== 'true';
        k.setAttribute('aria-pressed', String(an));
        zeigen(k.getAttribute('data-wahl'), an, false);
        zusammenfassen();
      });
    });
    zusammenfassen();
  });
})();
