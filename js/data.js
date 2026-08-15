// Städte und Waren des Hanse-Handelsspiels

const CITIES = [
  { id: "luebeck",  name: "Lübeck",   x: 430, y: 330, exports: ["bier", "salz"],                    imports: ["pelze", "wachs"] },
  { id: "hamburg",  name: "Hamburg",  x: 350, y: 350, exports: ["bier", "tuch"],                     imports: ["fisch", "getreide", "honig"] },
  { id: "bergen",   name: "Bergen",   x: 220, y: 110, exports: ["fisch", "holz", "eisenerz"],         imports: ["getreide", "bier"] },
  { id: "london",   name: "London",   x: 90,  y: 440, exports: ["tuch", "bier", "wolle"],             imports: ["pelze", "wachs", "salz", "bernstein"] },
  { id: "brugge",   name: "Brügge",   x: 170, y: 410, exports: ["tuch", "wein", "wolle"],             imports: ["pelze", "wachs", "fisch", "getreide"] },
  { id: "riga",     name: "Riga",     x: 610, y: 240, exports: ["getreide", "holz", "wachs", "eisen"], imports: ["tuch", "salz"] },
  { id: "reval",    name: "Reval",    x: 630, y: 160, exports: ["getreide", "holz", "eisen", "eisenerz"], imports: ["tuch", "bier"] },
  { id: "danzig",   name: "Danzig",   x: 500, y: 290, exports: ["getreide", "holz", "bernstein"],    imports: ["tuch", "bier", "salz"] },
  { id: "nowgorod", name: "Nowgorod", x: 730, y: 140, exports: ["pelze", "wachs", "honig"],          imports: ["tuch", "salz", "wein"] },

  { id: "rostock",    name: "Rostock",    x: 465, y: 318, exports: ["getreide", "holz", "fisch"], imports: ["tuch", "salz"] },
  { id: "stettin",    name: "Stettin",    x: 536, y: 282, exports: ["getreide", "holz", "bernstein"], imports: ["tuch", "bier"] },
  { id: "konigsberg", name: "Königsberg", x: 578, y: 270, exports: ["bernstein", "getreide"],      imports: ["tuch", "wein"] },
  { id: "bremen",     name: "Bremen",     x: 300, y: 400, exports: ["bier", "tuch"],              imports: ["fisch", "wein"], river: { mouthX: 272, mouthY: 368 } },
  { id: "luneburg",   name: "Lüneburg",   x: 400, y: 390, exports: ["salz"],                      imports: ["getreide", "holz"], river: { mouthX: 360, mouthY: 355 } },
  { id: "groningen",  name: "Groningen",  x: 240, y: 415, exports: ["getreide", "holz"],          imports: ["tuch", "bier"] },
  { id: "dorpat",     name: "Dorpat",     x: 615, y: 195, exports: ["getreide", "holz"],          imports: ["tuch", "salz"] },
  { id: "visby",      name: "Visby",      x: 540, y: 218, exports: ["wachs", "honig"],            imports: ["tuch", "eisen"] },
  { id: "stockholm",  name: "Stockholm",  x: 290, y: 222, exports: ["eisen", "holz", "fisch"],    imports: ["tuch", "salz"] },
];

const GOODS = [
  { id: "getreide",  name: "Getreide",  basePrice: 8,  volatility: 0.15 },
  { id: "holz",      name: "Holz",      basePrice: 5,  volatility: 0.10 },
  { id: "pelze",     name: "Pelze",     basePrice: 45, volatility: 0.30 },
  { id: "tuch",      name: "Tuch",      basePrice: 30, volatility: 0.20 },
  { id: "bier",      name: "Bier",      basePrice: 6,  volatility: 0.10 },
  { id: "salz",      name: "Salz",      basePrice: 12, volatility: 0.20 },
  { id: "fisch",     name: "Fisch",     basePrice: 7,  volatility: 0.25 },
  { id: "wachs",     name: "Wachs",     basePrice: 25, volatility: 0.20 },
  { id: "eisen",     name: "Eisen",     basePrice: 15, volatility: 0.15 },
  { id: "bernstein", name: "Bernstein", basePrice: 60, volatility: 0.35 },
  { id: "wein",      name: "Wein",      basePrice: 20, volatility: 0.20 },
  { id: "honig",     name: "Honig",     basePrice: 10, volatility: 0.15 },
  // Vorprodukte — Rohstoffe fuer die Weiterverarbeitung in der Produktion
  { id: "eisenerz",  name: "Eisenerz",  basePrice: 6,  volatility: 0.15 },
  { id: "wolle",     name: "Wolle",     basePrice: 10, volatility: 0.20 },
];

const HOME_CITY_ID = "luebeck";

const STARTING_GOLD = 75;

// Preisspanne zwischen Export- und Importstaedten je Ware (kleinere Spanne = geringere
// Handelsspanne/Wachstumsrate). Reduziert auf ca. 1/3 der urspruenglichen Gewinnspanne.
const EXPORT_PRICE_FACTOR = 0.85;
const IMPORT_PRICE_FACTOR = 1.25;

// Flotte: kaufbare NPC-Schiffe, Heuer, Verlustrisiko
const NPC_SHIP_BASE = { cargoCapacity: 80, cannons: 1, speedBonus: 0 };
const SHIP_BASE_COST = 1000; // Kosten = SHIP_BASE_COST * aktuelle Schiffsanzahl

// Einheitliche Masten-Tabellen fuer Laderaum und Buchwert (index = Mastanzahl 0–3).
// Gilt fuer alle Schiffe — Flaggschiff (3 Masten), NPC-Koggen (2 Masten) und erbeutete
// Prisen. Buchwert erbeuteter Schiffe wird als Ertrag gebucht (HGB § 253 Abs. 1 Satz 1:
// Bewertung unentgeltlich erworbener Anlagen zum beizulegenden Zeitwert).
// SHIP_VALUE_BY_MASTS[3] === SHIP_BASE_COST stellt die Konsistenz mit gekauften
// Dreimastern sicher.
const SHIP_CAPACITY_BY_MASTS = [0, 60, 80, 100];
const SHIP_VALUE_BY_MASTS    = [0, Math.round(SHIP_BASE_COST * 0.4), Math.round(SHIP_BASE_COST * 0.7), SHIP_BASE_COST];
const WAGE_BASE = 3; // Gulden/Tag Grundheuer je NPC-Schiff
const WAGE_CARGO_RATE = 0.03; // + 3% des aktuellen Ladungswerts/Tag
const WAGE_STRENGTH_RATE = 1; // + 1 G/Tag je Punkt "Stärke" (Kanonen/Groesse)
const DESTRUCTION_CHANCE = 0.25; // Anteil der Niederlagen, die zum Totalverlust führen
const RANSOM_DEADLINE_DAYS = 15;
// Max. Fahrzeit (Tage), die ein NPC-Schiff je Kanone von seinem aktuellen Hafen aus
// zurücklegt, bevor es dort Handel treibt — begrenzt riskante Fernrouten mit vielen
// Tagen Piratenrisiko (routeRiskPerDay) am Stück.
const NPC_MAX_DAYS_PER_CANNON = 5;
const CAPTAIN_NAMES = [
  "Hinrich Voss", "Tönnies Bruhn", "Cord Wessels", "Marten Hoyer",
  "Gerd Lindeman", "Otto Kranz", "Wulf Segeberg", "Diderik Pahl",
];

// Historisch angemessene Schiffsnamen fuer hanseatische Kauffahrtei-Koggen:
// religioes (Schutzheilige der Seeleute), Tugenden und hanseatische Embleme.
// Deutlich andere Sprachwelt als die Piratenschiffsnamen (dunkel/bedrohlich).
const MERCHANT_SHIP_NAMES = [
  "die Hoffnung", "die Treue", "die Einigkeit", "die Fortuna",
  "Sancta Maria", "die Elisabeth", "die Katharina", "die Margarethe",
  "der Adler", "der Falke", "der Nordstern", "der Hanseat",
  "Sankt Nikolaus", "Sankt Georg", "die Gute Fahrt",
  "der Pelikan", "der Kranich", "die Freiheit",
];

// Wirtschaft: Versicherung, Hafengebühren, Kontor-Unterhalt
const YEAR_LENGTH_DAYS = 360;
const INSURANCE_ANNUAL_COST = 25;
// Eigenstaendige zweite Police fuer die Ladung (unabhaengig von der Rumpf-
// versicherung) — hoeher als INSURANCE_ANNUAL_COST, da eine volle Ladung
// wertvoller Waren oft mehr wert ist als das feste SHIP_BASE_COST-Risiko.
const CARGO_INSURANCE_ANNUAL_COST = 30;
const HARBOR_FEE_RATE = 0.015;
const KONTOR_UPKEEP_PER_LEVEL = 2; // Gulden/Tag je Kontor-Stufe

// Laderaum-Ausbau: pro Stufe +10 Prozentpunkte der urspruenglichen Kapazitaet,
// maximal 10 Stufen (= +100%, Verdoppelung). Aktive Policen (Rumpf/Ladung)
// werden bei jeder Stufe im gleichen Verhaeltnis teurer (siehe shipInsuranceAnnualCost
// / shipCargoInsuranceAnnualCost in fleet.js).
const CARGO_EXPANSION_MAX_LEVEL = 10;
const CARGO_EXPANSION_STEP = 0.1;

// Handelsregionen fuer regionale Ernte- und Naturereignisse.
// Tritt ein Ereignis auf, wird zufaellig eine der konfigurierten Regionen gewaehlt —
// nur Staedte dieser Region erhalten den Preisschock. Das motiviert den Spieler,
// Preisunterschiede zwischen Regionen auszunutzen (z.B. Getreide im betroffenen Osten
// teuer verkaufen, im unbetroffenen Westen guenstig einkaufen).
// Wein ist eine Ausnahme: da er von ausserhalb der Hanse kommt, trifft ein Ernteausfall
// das gesamte Hansegebiet gleichmaessig (keine "regions"-Einschraenkung).
const CITY_REGIONS = {
  north_sea: {
    name: "Nordsee- und Atlantikraum",
    cities: ["bergen", "hamburg", "london", "brugge", "groningen", "bremen"],
  },
  baltic_west: {
    name: "Westliche Ostsee",
    cities: ["luebeck", "rostock", "stettin", "danzig", "konigsberg", "luneburg"],
  },
  baltic_east: {
    name: "Östliche Ostsee",
    cities: ["riga", "reval", "nowgorod", "dorpat", "visby", "stockholm"],
  },
};

// Ernte- und Naturereignisse: Waren, die von Missernten oder schlechten Jahreszeiten
// betroffen sein koennen. Das System wuerfelt alle HARVEST_FAIL_CHECK_INTERVAL Tage
// fuer jede Ware. Bei Treffer wird ein (regionaler oder globaler) Preismultiplikator
// aktiv — bis das Ereignis nach "duration" Tagen ablaeuft.
// "regions": Array von CITY_REGIONS-Schluesseln; bei Treffer wird eine Region zufaellig
// gewaehlt. Fehlendes/leeres "regions" = globales Ereignis (alle Staedte betroffen).
const HARVEST_FAIL_CHECK_INTERVAL = 30; // alle 30 Tage Wuerfeln
const HARVEST_FAIL_EVENTS = [
  {
    goodId: "wein",
    regions: null,                     // global: Burgunder/Rhein-Weinlese trifft gesamten Nordhandel
    chance: 0.07,                      // ~7 % je Pruefung ≈ einmal in ca. 15 Monaten
    durationMin: 45, durationMax: 90,
    multiplierMin: 1.5, multiplierMax: 2.5,
    startMsg: (days, _region) =>
      `🍇 Ernteausfall! Die Weinlese in Burgund und am Rhein ist misslungen — Wein wird für etwa ${days} Tage im gesamten Hansegebiet teurer.`,
    endMsg: (_region) =>
      `☀ Die Weinmärkte erholen sich — Preise kehren auf das übliche Niveau zurück.`,
  },
  {
    goodId: "getreide",
    regions: ["north_sea", "baltic_west", "baltic_east"], // eine Region wird zufaellig getroffen
    chance: 0.05,                      // ~5 % je Pruefung ≈ einmal in ca. 20 Monaten
    durationMin: 60, durationMax: 120,
    multiplierMin: 1.3, multiplierMax: 2.0,
    startMsg: (days, region) =>
      `🌾 Missernte! Dürre und Unwetter vernichten die Getreideernte im ${region} — Getreide wird dort für etwa ${days} Tage teurer.`,
    endMsg: (region) =>
      `☀ Die Getreideernte im ${region} erholt sich — Preise normalisieren sich.`,
  },
  {
    goodId: "fisch",
    regions: ["north_sea", "baltic_east"], // Nordsee-Fischerei oder Ostseefischerei betroffen
    chance: 0.04,                      // ~4 % je Pruefung ≈ einmal in ca. 25 Monaten
    durationMin: 30, durationMax: 60,
    multiplierMin: 1.3, multiplierMax: 1.8,
    startMsg: (days, region) =>
      `🐟 Schlechte Fangsaison im ${region}! Die Fischgründe liefern magere Beute — Fisch wird dort für etwa ${days} Tage teurer.`,
    endMsg: (region) =>
      `☀ Die Fangsaison im ${region} normalisiert sich — Fischpreise kehren zurück.`,
  },
];

function shipStrength(ship) {
  return ship.cannons * 3 + ship.cargoCapacity * 0.1;
}

// Grundstueckskauf als Voraussetzung fuer Produktionsstaetten.
// Jede Parzelle kostet LAND_BASE_COST + LAND_COST_STEP * vorhandeneParzellen
// (staedtischer Boden wird knapper). Je Parzelle ein Produktionsslot.
const LAND_BASE_COST = 300;   // erste Parzelle
const LAND_COST_STEP = 200;   // Aufschlag je weiterer Parzelle
const LAND_MAX_PLOTS = 5;     // maximale Parzellen pro Stadt

// Kaufpreis fuer die naechste Parzelle in einer Stadt.
function landPlotCost(currentPlots) {
  return LAND_BASE_COST + LAND_COST_STEP * currentPlots;
}

// Buchwert des gesamten Grundbesitzes einer Stadt (Summe der gezahlten Kaufpreise).
function landAssetValue(plots) {
  let total = 0;
  for (let i = 0; i < plots; i++) total += landPlotCost(i);
  return total;
}

// Beleihung von Kontoren und Schiffen
const LOAN_MAX_LTV = 0.8; // maximaler Beleihungsgrad (Kredit / Vermögenswert)
const LOAN_BASE_RATE = 0.05; // Jahreszins bei sehr niedrigem Beleihungsgrad
const LOAN_MAX_RATE = 0.20; // Jahreszins bei maximaler Beleihung (LOAN_MAX_LTV)

// Jahreszins abhaengig vom aktuellen Beleihungsgrad (linear zwischen Basis- und Maximalzins).
function loanRate(principal, assetValue) {
  if (assetValue <= 0 || principal <= 0) return LOAN_BASE_RATE;
  const ltv = Math.min(1, principal / assetValue);
  return LOAN_BASE_RATE + (LOAN_MAX_RATE - LOAN_BASE_RATE) * (ltv / LOAN_MAX_LTV);
}

function kontorValue(level) {
  return 500 * (level * (level + 1)) / 2;
}

function getCity(cityId) {
  return CITIES.find((c) => c.id === cityId);
}

function getGood(goodId) {
  return GOODS.find((g) => g.id === goodId);
}

function cityDistance(cityIdA, cityIdB) {
  const a = getCity(cityIdA);
  const b = getCity(cityIdB);
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Produktionsrezepte: welche Waren koennen in Kontor-Staedten erzeugt werden?
// Produktion ist nur in Staedten moeglich, die die jeweilige Ware exportieren.
// goldCost: einmalige Produktionskosten (Saatgut, Lohnkosten, Werkzeug u.a.),
// outputQty: erzeugte Einheiten je Lauf, days: Produktionsdauer in Tagen,
// description: Beschreibung des historischen Gewinnungsprozesses.
// Produktionsrezepte. Optionales Feld "inputs: { goodId: qty }" listet Vorprodukte,
// die bei Produktionsstart sofort aus dem Kontor-Lager verbraucht werden.
// Ohne inputs-Feld (oder leeres Objekt) wird nur Gold benötigt.
// goldCost = reine Lohn- und Betriebskosten; Material-Einsatz wird separat aus dem
// Lagerwert der Vorprodukte (storageCost) gerechnet und dem Fertigprodukt zugerechnet.
const PRODUCTION_RECIPES = {
  // ── Vorprodukte (nur Gold, kein Materialeinsatz) ─────────────────────────────
  eisenerz:  { goldCost: 50,  outputQty: 12, days: 5,
    description: "Eisenerz wird im Tagebau und in Stollen gewonnen, grob aufbereitet und ans Kontor geliefert." },
  wolle:     { goldCost: 40,  outputQty: 10, days: 4,
    description: "Schafe werden auf umliegenden Weiden gehalten; nach der Schur wird die Wolle gewaschen und zu Ballen gepresst." },

  // ── Einfache Erzeugnisse (nur Gold) ──────────────────────────────────────────
  getreide:  { goldCost: 40,  outputQty: 20, days: 4,
    description: "Felder werden bestellt, Getreide gesät, gepflegt und nach der Reifezeit gedroschen." },
  holz:      { goldCost: 35,  outputQty: 20, days: 3,
    description: "Waldstücke werden eingeschlagen; das Holz wird aufgesägt, gebündelt und ans Kontor geliefert." },
  fisch:     { goldCost: 30,  outputQty: 18, days: 3,
    description: "Fischerboote fahren in die nahen Gewässer, die Beute wird gesalzen und für den Transport aufbereitet." },
  salz:      { goldCost: 70,  outputQty: 8,  days: 6,
    description: "Sole wird aus dem Boden gefördert und in Salinen durch Verdampfung zu Siedesalz gewonnen — oder aus Fels gebrochen." },
  // Wein wird im Hansegebiet nicht produziert — er kommt aus Burgund, dem Rheinland und
  // Frankreich und wird ausschliesslich gehandelt. Kein Produktionsrezept vorhanden.
  pelze:     { goldCost: 200, outputQty: 6,  days: 5,
    description: "Pelztiere werden in den umliegenden Wäldern gejagt; die Felle werden abgezogen, gegerbt und aufbereitet." },
  wachs:     { goldCost: 100, outputQty: 7,  days: 5,
    description: "Bienenstöcke werden aufgebaut und regelmäßig geerntet; das Rohwachs wird gereinigt, geläutert und geformt." },
  honig:     { goldCost: 50,  outputQty: 12, days: 4,
    description: "Bienenstöcke liefern Honig, der vorsichtig geerntet, von Wachs und Verunreinigungen getrennt und abgefüllt wird." },
  bernstein: { goldCost: 160, outputQty: 5,  days: 5,
    description: "Bernstein wird nach Stürmen an den Stränden gesammelt oder im Küstentagebau gewonnen und sortiert." },

  // ── Verarbeitungsprodukte (Gold + Vorprodukte aus Lager) ─────────────────────
  bier:  { goldCost: 30,  outputQty: 15, days: 7,
    inputs: { getreide: 5 },
    description: "Getreide wird gemälzt, mit Wasser gemaischt und nach Hopfengabe im Sudhaus zu Bier vergoren und abgefüllt." },
  eisen: { goldCost: 80,  outputQty: 8,  days: 7,
    inputs: { eisenerz: 4 },
    description: "Eisenerz wird geröstet, im Hochofen mit Holzkohle verhüttet und das gewonnene Roheisen zu Stangeneisen gehämmert." },
  tuch:  { goldCost: 100, outputQty: 8,  days: 8,
    inputs: { wolle: 6 },
    description: "Wolle wird gereinigt, gekämmt, gesponnen, auf dem Webstuhl zu Tuch gewebt, gewalkt und in Farbe getaucht." },
};
