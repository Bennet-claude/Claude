# Was noch eingetragen werden muss

Alles unten ist Platzhalter. Reihenfolge nach Dringlichkeit.

## 1. Name und Kontaktdaten (überall, per Suchen-und-Ersetzen)

Aus dem Ordner `agentur/` heraus:

```
grep -rl "Studio Leine" . | xargs sed -i 's/Studio Leine/EUER NAME/g'
grep -rl "studio-leine.de" . | xargs sed -i 's/studio-leine.de/eure-domain.de/g'
grep -rl "hallo@studio-leine.de" . | xargs sed -i 's/hallo@studio-leine.de/eure@adresse.de/g'
grep -rl "0511 123 45 67" . | xargs sed -i 's/0511 123 45 67/EURE NUMMER/g'
grep -rl "+495111234567" . | xargs sed -i 's/+495111234567/+49EURENUMMER/g'
grep -rl "cal.com/DEIN-NUTZERNAME" . | xargs sed -i 's|https://cal.com/DEIN-NUTZERNAME|EURE TERMIN-URL|g'
```

`Studio Leine` ist ein Arbeitstitel, kein Vorschlag. Denkt euch einen
eigenen aus, bevor irgendwer die Seite sieht.

## 2. Terminwerkzeug

Der Knopf „Termin buchen" zeigt auf `https://cal.com/DEIN-NUTZERNAME`.
Kommt an sechs Stellen vor (jede Seite im Fuß, dazu Startseite und Kontakt).
Cal.com und Calendly haben beide kostenlose Stufen. Wichtig fürs
Impressum/Datenschutz: der Anbieter muss dort benannt werden.

## 3. Texte, die noch von euch kommen müssen

| Datei | Stelle |
|---|---|
| `ueber-uns.html` | Text über Bennet — Entwurf drin, mit eigenen Worten ersetzen |
| `ueber-uns.html` | `[Name Gründer 2]`, `[Rolle]` und beide Absätze |
| `ueber-uns.html` | Abschnitt „Wie wir angefangen haben" — komplett, das ist eure Geschichte |
| `ueber-uns.html` | Abschnitt „Was wir nicht können" — prüfen, ob die fünf Punkte stimmen |
| `arbeiten.html` | drei Referenzen: Name, Aufgabe, Ergebnis, Link |
| `arbeiten.html` | drei Kundenstimmen — nach der Übergabe erfragen, schriftlich freigeben lassen |
| `leistungen.html` | Preise prüfen: 1.800 / 3.400 / 900 € sind geraten |
| `kontakt.html` | Erreichbarkeitszeiten prüfen |

## 3b. Hintergrundvideo (optional)

`video/hintergrund.mp4` fehlt noch. Solange die Datei nicht da ist, bleibt
die Videoebene leer und die Farbfelder übernehmen — die Seite funktioniert
vollständig. Vorgaben stehen in `video/LIESMICH.txt`.

**Überlegt euch das gut.** Ihr verkauft kurze Ladezeiten. Ein
Hintergrundvideo ist das Schwerste, was eine Seite laden kann. Unter 2 MB
ist es vertretbar, darüber widersprecht ihr eurem eigenen Verkaufsargument.
Auf dem Handy lädt es wegen `preload="none"` erst beim Abspielen.

Nehmt **keinen** fremden CDN-Link. Die Datei kann verschwinden und ihr wisst
nicht, ob ihr sie verwenden dürft.

## 4. Bilder

Es sind bewusst keine Fotos eingebaut, nur beschriftete Rahmen.

- `arbeiten.html`: drei Screenshots, 1600 px breit, als JPG unter `bilder/`
- `ueber-uns.html`: zwei Porträts, Hochformat 4:5, mindestens 900 px breit,
  beide in derselben Lichtsituation fotografiert

Keine Stockfotos. Ein leerer Rahmen ist ehrlicher als ein fremdes Büro.

## 5. Rechtstexte

`impressum.html` und `datenschutz.html` sind Gerüste. Die grün markierten
Felder ausfüllen und den fertigen Text einmal prüfen lassen. Im Datenschutz
stehen zwei Absätze, die technisch stimmen und so übernommen werden können
(keine Cookies, keine externen Schriften) — die rechtliche Einordnung
gehört trotzdem nicht von uns.

## 6. Vor dem Livegang

- [ ] `<link rel="canonical">` auf jeder Seite auf die echte Domain
- [ ] JSON-LD im `<head>`: Adresse, Telefon, Gründernamen
- [ ] `og:image` ergänzen (fehlt noch komplett)
- [ ] Eigenes Favicon statt des Schichten-Zeichens
- [ ] Google Business Profil anlegen und mit der Domain verbinden
