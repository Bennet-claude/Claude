/* Kleinigkeiten, die die Seite lebendig machen: Jahreszahl, der Hinweis ob
   gerade geoeffnet ist, die Hervorhebung des heutigen Tages und die Karte,
   die erst auf Klick laedt. */

(function () {
  var OEFFNET = 9 * 60;        /* 9:00 */
  var SCHLIESST = 18 * 60 + 30; /* 18:30 */

  document.querySelectorAll('[data-jahr]').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  var jetzt = new Date();
  var tag = jetzt.getDay();               /* 0 = Sonntag */
  var minute = jetzt.getHours() * 60 + jetzt.getMinutes();
  var werktag = tag >= 1 && tag <= 6;
  var offen = werktag && minute >= OEFFNET && minute < SCHLIESST;

  var status = document.getElementById('status-heute');
  if (status) {
    if (offen) {
      status.textContent = 'Jetzt geöffnet, heute noch bis 18:30 Uhr.';
    } else if (werktag && minute < OEFFNET) {
      status.textContent = 'Heute ab 9:00 Uhr geöffnet.';
    } else if (tag === 6) {
      status.textContent = 'Sonntag geschlossen. Montag wieder ab 9:00 Uhr.';
    } else if (tag === 0) {
      status.textContent = 'Sonntag geschlossen. Montag wieder ab 9:00 Uhr.';
    } else {
      status.textContent = 'Morgen wieder ab 9:00 Uhr geöffnet.';
    }
  }

  var heute = document.querySelector('[data-tag="' + tag + '"]');
  if (heute) {
    heute.classList.add('zeit--heute');
    var marke = heute.querySelector('.zeit__tag');
    if (marke) marke.textContent = marke.textContent + ' — heute';
  }

  var knopf = document.getElementById('karte-laden');
  if (knopf) {
    knopf.addEventListener('click', function () {
      var halter = document.getElementById('landkarte');
      var rahmen = document.createElement('iframe');
      rahmen.src = 'https://maps.google.com/maps?q=' +
        encodeURIComponent('Alfred-Bentz-Straße 1, 30966 Hemmingen') +
        '&z=16&output=embed';
      rahmen.title = 'Karte mit dem Standort des Salons in Hemmingen';
      rahmen.loading = 'lazy';
      rahmen.referrerPolicy = 'no-referrer-when-downgrade';
      halter.textContent = '';
      halter.style.padding = '0';
      halter.appendChild(rahmen);
    });
  }
})();
