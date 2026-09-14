/* Der eine orchestrierte Moment: der Kamm-Strich zeichnet sich und legt
   die Headline frei. Erster Teil beim Laden, der Rest beim Scrollen.
   Ohne GSAP oder bei prefers-reduced-motion passiert hier nichts — die
   Seite ist dann von sich aus vollstaendig sichtbar. */

(function () {
  var wurzel = document.documentElement;

  if (!wurzel.classList.contains('bewegung-an')) return;
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

  var strich = document.getElementById('kamm-strich');
  var zeilen = document.querySelectorAll('.signatur .zeilen-maske > span');
  var unterzeile = document.querySelector('.signatur__unterzeile');
  if (!strich || !zeilen.length) return;

  clearTimeout(window.__diloNotbremse);
  gsap.registerPlugin(ScrollTrigger);

  var laenge = strich.getTotalLength();
  var restpunkt = laenge * 0.42; /* beim Laden wird gut die Haelfte gezogen */

  /* Ausgangszustaende einmal setzen.
     Das y: 0 ist nicht ueberfluessig: die CSS-Regel .bewegung-an setzt bereits
     translateY(103%), damit vor dem Start des Skripts nichts aufblitzt. GSAP
     liest diesen Wert als vorhandenen y-Versatz in Pixeln ein und legt sein
     eigenes yPercent obendrauf — die Zeile stuende dann bei 206% und bliebe
     beim Zurueckanimieren auf yPercent 0 um eine Zeilenhoehe zu tief haengen.
     y: 0 nullt den uebernommenen Anteil, danach steuert yPercent allein. */
  gsap.set(strich, { strokeDasharray: laenge, strokeDashoffset: laenge });
  gsap.set(zeilen, { y: 0, yPercent: 103 });
  if (unterzeile) gsap.set(unterzeile, { opacity: 0 });

  var scrollStrichLaeuft = false;

  function scrollStrich() {
    if (scrollStrichLaeuft) return;
    scrollStrichLaeuft = true;

    /* Der Rest des Strichs haengt am Scrollen. Erst nach dem Intro anlegen,
       damit sich die beiden Tweens nicht um denselben Wert streiten. */
    gsap.to(strich, {
      strokeDashoffset: 0,
      ease: 'none',
      immediateRender: false,
      scrollTrigger: {
        trigger: '.signatur',
        start: 'top top',
        end: 'bottom 25%',
        scrub: 0.5
      }
    });
  }

  var intro = gsap.timeline({ onComplete: scrollStrich });

  intro
    .to(strich, {
      strokeDashoffset: restpunkt,
      duration: 0.9,
      ease: 'power2.inOut'
    }, 0)
    .to(zeilen, {
      yPercent: 0,
      duration: 0.75,
      ease: 'power3.out',
      stagger: 0.08
    }, 0.15);

  if (unterzeile) {
    intro.to(unterzeile, {
      opacity: 1,
      duration: 0.6,
      ease: 'power2.out'
    }, 0.6);
  }
})();
