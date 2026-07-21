// Städte und Waren des Hanse-Handelsspiels

const CITIES = [
  { id: "luebeck",  name: "Lübeck",   x: 430, y: 330, exports: ["bier", "salz"],                    imports: ["pelze", "wachs"] },
  { id: "hamburg",  name: "Hamburg",  x: 350, y: 350, exports: ["bier", "tuch"],                     imports: ["fisch", "getreide", "honig"] },
  { id: "bergen",   name: "Bergen",   x: 220, y: 110, exports: ["fisch", "holz"],                    imports: ["getreide", "bier"] },
  { id: "london",   name: "London",   x: 90,  y: 440, exports: ["tuch", "bier"],                     imports: ["pelze", "wachs", "salz", "bernstein"] },
  { id: "brugge",   name: "Brügge",   x: 170, y: 410, exports: ["tuch", "wein"],                     imports: ["pelze", "wachs", "fisch", "getreide"] },
  { id: "riga",     name: "Riga",     x: 610, y: 240, exports: ["getreide", "holz", "wachs", "eisen"], imports: ["tuch", "salz"] },
  { id: "reval",    name: "Reval",    x: 630, y: 160, exports: ["getreide", "holz", "eisen"],        imports: ["tuch", "bier"] },
  { id: "danzig",   name: "Danzig",   x: 500, y: 290, exports: ["getreide", "holz", "bernstein"],    imports: ["tuch", "bier", "salz"] },
  { id: "nowgorod", name: "Nowgorod", x: 730, y: 140, exports: ["pelze", "wachs", "honig"],          imports: ["tuch", "salz", "wein"] },

  { id: "rostock",    name: "Rostock",    x: 465, y: 318, exports: ["getreide", "holz"],          imports: ["tuch", "salz"] },
  { id: "stettin",    name: "Stettin",    x: 536, y: 282, exports: ["getreide", "holz", "bernstein"], imports: ["tuch", "bier"] },
  { id: "konigsberg", name: "Königsberg", x: 578, y: 270, exports: ["bernstein", "getreide"],      imports: ["tuch", "wein"] },
  { id: "bremen",     name: "Bremen",     x: 300, y: 400, exports: ["bier", "tuch"],              imports: ["fisch", "wein"], river: { mouthX: 272, mouthY: 368 } },
  { id: "luneburg",   name: "Lüneburg",   x: 400, y: 390, exports: ["salz"],                      imports: ["getreide", "holz"], river: { mouthX: 360, mouthY: 355 } },
  { id: "groningen",  name: "Groningen",  x: 240, y: 415, exports: ["getreide", "holz"],          imports: ["tuch", "bier"] },
  { id: "dorpat",     name: "Dorpat",     x: 615, y: 195, exports: ["getreide", "holz"],          imports: ["tuch", "salz"] },
  { id: "visby",      name: "Visby",      x: 540, y: 218, exports: ["wachs", "honig"],            imports: ["tuch", "eisen"] },
  { id: "stockholm",  name: "Stockholm",  x: 290, y: 222, exports: ["eisen", "holz"],             imports: ["tuch", "salz"] },
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
const WAGE_BASE = 3; // Gulden/Tag Grundheuer je NPC-Schiff
const WAGE_CARGO_RATE = 0.03; // + 3% des aktuellen Ladungswerts/Tag
const WAGE_STRENGTH_RATE = 1; // + 1 G/Tag je Punkt "Stärke" (Kanonen/Groesse)
const DESTRUCTION_CHANCE = 0.25; // Anteil der Niederlagen, die zum Totalverlust führen
const RANSOM_DEADLINE_DAYS = 15;
const CAPTAIN_NAMES = [
  "Hinrich Voss", "Tönnies Bruhn", "Cord Wessels", "Marten Hoyer",
  "Gerd Lindeman", "Otto Kranz", "Wulf Segeberg", "Diderik Pahl",
];

// Wirtschaft: Versicherung, Hafengebühren, Kontor-Unterhalt
const YEAR_LENGTH_DAYS = 360;
const INSURANCE_ANNUAL_COST = 25;
const HARBOR_FEE_RATE = 0.015;
const KONTOR_UPKEEP_PER_LEVEL = 2; // Gulden/Tag je Kontor-Stufe

function shipStrength(ship) {
  return ship.cannons * 3 + ship.cargoCapacity * 0.1;
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
