# Hanse — Handelsspiel

Ein browserbasiertes Handelsspiel im Umfeld der mittelalterlichen Hanse. Du startest mit einem bescheidenen Startkapital in Lübeck und baust von dort aus ein Handelsimperium auf — mit eigenen Kontoren, einer wachsenden Flotte und einem wachsamen Blick auf Piraten und Zinsen.

🔗 **Live spielen:** https://mpoling674.github.io/Poldi/

## Features

- **Markt & Handel** — 18 Hansestädte (u. a. Lübeck, Hamburg, Bergen, London, Brügge, Riga, Reval, Danzig, Nowgorod) mit eigenen Export- und Importwaren.
- **Kontor** — Baue in einer Stadt ein Kontor (bis Stufe 3) für eigenes Lager und eine Werft, um Schiffe zu kaufen.
- **Flotte** — Kaufe weitere Schiffe mit eigener Besatzung, Heuer und Frachtkapazität.
- **Piraten** — Zufällige Piratenüberfälle auf See: kämpfen oder fliehen, sonst drohen Ladungs- oder Schiffsverlust und Lösegeldforderungen.
- **Versicherung** — Versichere Schiffe gegen Totalverlust; im Ernstfall wird das Schiff sofort ersetzt.
- **Kredite** — Beleihe Kontore und Schiffe bis zu 80 % ihres Werts; der Zinssatz steigt mit dem Beleihungsgrad, unbezahlte Zinsen werden dem Kredit zugeschlagen.
- **Bilanz** — Laufende Ergebnisrechnung mit Erträgen, Aufwendungen, offenen Krediten und Nettovermögen.
- Responsive Bedienung für Desktop und Mobilgeräte, Spielstand wird automatisch lokal im Browser gespeichert.

## Technik

Reines HTML/CSS/JavaScript ohne Build-Schritt oder Framework — läuft direkt im Browser. Der Spielstand wird per `localStorage` gehalten und lässt sich zusätzlich als JSON-Datei exportieren/importieren.

## Lokal starten

Da keine externen Abhängigkeiten benötigt werden, reicht ein einfacher lokaler Webserver im Projektverzeichnis, z. B.:

```
npx serve .
```

Anschließend die ausgegebene lokale Adresse im Browser öffnen.

## Deployment

Der `master`-Branch wird automatisch über GitHub Pages veröffentlicht.
