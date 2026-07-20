// Städte und Waren des Hanse-Handelsspiels

const CITIES = [
  { id: "luebeck",  name: "Lübeck",   x: 430, y: 330, exports: ["bier", "salz"],          imports: ["pelze", "wachs"] },
  { id: "hamburg",  name: "Hamburg",  x: 350, y: 350, exports: ["bier", "tuch"],           imports: ["fisch", "getreide"] },
  { id: "bergen",   name: "Bergen",   x: 220, y: 110, exports: ["fisch", "holz"],          imports: ["getreide", "bier"] },
  { id: "london",   name: "London",   x: 90,  y: 440, exports: ["tuch", "bier"],           imports: ["pelze", "wachs", "salz"] },
  { id: "brugge",   name: "Brügge",   x: 170, y: 410, exports: ["tuch"],                   imports: ["pelze", "wachs", "fisch", "getreide"] },
  { id: "riga",     name: "Riga",     x: 610, y: 240, exports: ["getreide", "holz", "wachs"], imports: ["tuch", "salz"] },
  { id: "reval",    name: "Reval",    x: 630, y: 160, exports: ["getreide", "holz"],       imports: ["tuch", "bier"] },
  { id: "danzig",   name: "Danzig",   x: 500, y: 290, exports: ["getreide", "holz"],       imports: ["tuch", "bier", "salz"] },
  { id: "nowgorod", name: "Nowgorod", x: 730, y: 140, exports: ["pelze", "wachs"],         imports: ["tuch", "salz"] },
];

const GOODS = [
  { id: "getreide", name: "Getreide", basePrice: 8,  volatility: 0.15 },
  { id: "holz",     name: "Holz",     basePrice: 5,  volatility: 0.10 },
  { id: "pelze",    name: "Pelze",    basePrice: 45, volatility: 0.30 },
  { id: "tuch",     name: "Tuch",     basePrice: 30, volatility: 0.20 },
  { id: "bier",     name: "Bier",     basePrice: 6,  volatility: 0.10 },
  { id: "salz",     name: "Salz",     basePrice: 12, volatility: 0.20 },
  { id: "fisch",    name: "Fisch",    basePrice: 7,  volatility: 0.25 },
  { id: "wachs",    name: "Wachs",    basePrice: 25, volatility: 0.20 },
];

const HOME_CITY_ID = "luebeck";

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
