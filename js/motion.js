/* Bewegung. Laeuft nur, wenn GSAP da ist und der Besucher keine reduzierte
   Bewegung eingestellt hat — sonst ist die Seite von sich aus vollstaendig
   sichtbar. Animiert wird ausschliesslich transform und opacity, damit kein
   Layout neu berechnet wird und das Scrollen fluessig bleibt. */

(function () {
  var wurzel = document.documentElement;
  var breit = window.matchMedia('(min-width: 48rem)');

  /* Kopfleiste bekommt ihren Milchglas-Grund erst nach ein paar Pixeln. */
  var kopf = document.querySelector('.kopf');
  if (kopf) {
    var setzen = function () {
      kopf.classList.toggle('kopf--fest', window.scrollY > 12);
    };
    setzen();
    window.addEventListener('scroll', setzen, { passive: true });
  }

  if (!wurzel.classList.contains('motion')) return;
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

  clearTimeout(window.__notbremse);
  gsap.registerPlugin(ScrollTrigger);

  /* ---------- Startbild ---------- */

  /* ---------- Der Signature-Moment ----------
     Ein handgezeichneter Kamm-Strich zieht sich durch und legt dabei die
     Headline frei.

     Abweichung von der Vorgabe, bewusst: Bei reinem scrub stuende die
     Zeitleiste bei Scroll-Position 0 auf null und der erste Bildschirm
     waere leer, bis jemand scrollt. Deshalb zieht sich der Strich beim
     Laden auf 45 Prozent und legt dabei die Headline frei; den Rest
     uebernimmt scrub beim Scrollen. */

  var zeilen = document.querySelectorAll('.buehne .maske > span');
  var strichSvg = document.getElementById('strich');
  var neben = document.querySelectorAll('.buehne__neben, .buehne__unter');

  if (zeilen.length) {
    /* y: 0 nullt den Versatz, den die CSS-Regel .motion bereits gesetzt hat.
       Ohne das rechnet GSAP sein yPercent obendrauf und die Zeile bleibt
       eine Zeilenhoehe zu tief stehen. */
    gsap.set(zeilen, { y: 0, yPercent: 104 });
    gsap.set(neben, { opacity: 0, y: 24 });

    var linie = strichSvg && strichSvg.querySelector('[data-strich]');
    var laenge = 0, halt = 0;

    if (linie) {
      laenge = linie.getTotalLength();
      halt = laenge * 0.55; /* Rest-Versatz nach dem Vorlauf */
      gsap.set(linie, { strokeDasharray: laenge, strokeDashoffset: laenge });
    }

    var start = gsap.timeline({ defaults: { ease: 'power3.out' } });

    if (linie) {
      start.to(linie, {
        strokeDashoffset: halt,
        duration: 0.9,
        ease: 'power2.inOut'
      }, 0);
    }

    start.to(zeilen, { yPercent: 0, duration: 0.95, stagger: 0.08 }, 0.12);
    start.to(neben, { opacity: 1, y: 0, duration: 0.8, stagger: 0.12 }, 0.55);

    /* Den Rest des Strichs zieht das Scrollen. Erst nach dem Vorlauf
       anlegen, sonst streiten sich beide Tweens um denselben Wert. */
    if (linie) {
      start.eventCallback('onComplete', function () {
        gsap.to(linie, {
          strokeDashoffset: 0,
          ease: 'none',
          immediateRender: false,
          scrollTrigger: {
            trigger: '.buehne',
            start: 'top top',
            end: 'bottom 40%',
            scrub: true
          }
        });
      });
    }
  }

  /* ---------- Gepinnte Bildszene ----------
     Das Bild waechst, waehrend der Abschnitt stehen bleibt. Auf dem Handy
     ohne Pinning, dort ist der Effekt mehr Stoerung als Gewinn. */

  var szene = document.querySelector('.szene');
  if (szene && breit.matches) {
    var bild = szene.querySelector('.szene__bild');
    var text = szene.querySelector('.szene__text');

    gsap.fromTo(bild,
      { scale: 0.78, y: 0 },
      {
        scale: 1,
        ease: 'none',
        scrollTrigger: {
          trigger: szene,
          start: 'top top',
          end: '+=900',
          scrub: 0.7,
          pin: true,
          anticipatePin: 1,
          invalidateOnRefresh: true
        }
      }
    );

    if (text) {
      gsap.fromTo(text,
        { opacity: 0, y: 30 },
        {
          opacity: 1, y: 0, ease: 'none',
          scrollTrigger: {
            trigger: szene,
            start: 'top top',
            end: '+=420',
            scrub: 0.7
          }
        }
      );
    }
  }

  /* ---------- Waagerechte Galerie ---------- */

  var galerie = document.querySelector('.galerie');
  if (galerie && breit.matches) {
    var bahn = galerie.querySelector('.galerie__bahn');

    var weg = function () {
      return Math.max(0, bahn.scrollWidth - galerie.offsetWidth + parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--rand')
      ) || 0);
    };

    gsap.to(bahn, {
      x: function () { return -weg(); },
      ease: 'none',
      scrollTrigger: {
        trigger: galerie,
        start: 'center center',
        end: function () { return '+=' + weg(); },
        scrub: 0.8,
        pin: true,
        anticipatePin: 1,
        invalidateOnRefresh: true
      }
    });
  }

  /* ---------- Zaehler ---------- */

  document.querySelectorAll('[data-zahl]').forEach(function (el) {
    var ziel = parseFloat(el.dataset.zahl);
    var stellen = parseInt(el.dataset.stellen || '0', 10);
    var stand = { wert: 0 };

    ScrollTrigger.create({
      trigger: el,
      start: 'top 88%',
      once: true,
      onEnter: function () {
        gsap.to(stand, {
          wert: ziel,
          duration: 1.5,
          ease: 'power2.out',
          onUpdate: function () {
            el.textContent = stand.wert.toFixed(stellen).replace('.', ',');
          }
        });
      }
    });
  });

  /* ---------- Sanfte Tiefe ---------- */

  gsap.utils.toArray('[data-tiefe]').forEach(function (el) {
    var mass = parseFloat(el.dataset.tiefe) || 5;
    gsap.fromTo(el,
      { yPercent: -mass },
      {
        yPercent: mass,
        ease: 'none',
        scrollTrigger: {
          trigger: el.parentElement,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 1
        }
      }
    );
  });

  /* Gepinnte Abschnitte messen die Seitenhoehe aus. Solange die Schriften
     noch nicht da sind, stimmt diese Hoehe nicht — danach neu vermessen. */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
  }
  window.addEventListener('load', function () { ScrollTrigger.refresh(); });
})();
