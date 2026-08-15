// Kontor (Lagerhaus) pro Stadt + Schiffsausbau (Kanonen)

const Kontor = (() => {
  let kontors = {}; // kontors[cityId] = { level }

  function init() {
    kontors = {};
  }

  function level(cityId) {
    return (kontors[cityId] && kontors[cityId].level) || 0;
  }

  function capacity(cityId) {
    return level(cityId) * 100;
  }

  function storageUsed(cityId) {
    const store = kontors[cityId] && kontors[cityId].storage;
    if (!store) return 0;
    return Object.values(store).reduce((sum, q) => sum + q, 0);
  }

  function buildCost(cityId) {
    return 500 * (level(cityId) + 1);
  }

  function buildKontor(cityId) {
    const cost = buildCost(cityId);
    if (level(cityId) >= 3) return { ok: false, reason: "Kontor bereits auf Höchststufe." };
    if (Fleet.gold() < cost) return { ok: false, reason: "Nicht genug Gold." };
    Fleet.addGold(-cost);
    if (!kontors[cityId]) kontors[cityId] = { level: 0, storage: {}, storageCost: {}, loan: null, productions: [] };
    if (!kontors[cityId].storageCost) kontors[cityId].storageCost = {};
    if (!kontors[cityId].productions) kontors[cityId].productions = [];
    kontors[cityId].level += 1;
    return { ok: true, cost };
  }

  function assetValue(cityId) {
    return kontorValue(level(cityId));
  }

  function loanOf(cityId) {
    return (kontors[cityId] && kontors[cityId].loan) || null;
  }

  function borrowAgainstKontor(cityId, amount) {
    const kontor = kontors[cityId];
    if (!kontor || kontor.level === 0) return { ok: false, reason: "Kein Kontor in dieser Stadt." };
    if (amount <= 0) return { ok: false, reason: "Ungültiger Betrag." };
    const currentPrincipal = (kontor.loan && kontor.loan.principal) || 0;
    const maxLoan = assetValue(cityId) * LOAN_MAX_LTV;
    if (currentPrincipal + amount > maxLoan) {
      return { ok: false, reason: `Beleihungsgrenze überschritten (max. ${Math.round(maxLoan)} G).` };
    }
    Fleet.addGold(amount);
    kontor.loan = { principal: currentPrincipal + amount };
    return { ok: true, amount };
  }

  function repayKontorLoan(cityId, amount) {
    const kontor = kontors[cityId];
    if (!kontor || !kontor.loan) return { ok: false, reason: "Kein offener Kredit auf dieses Kontor." };
    const actual = Math.min(amount, kontor.loan.principal, Fleet.gold());
    if (actual <= 0) return { ok: false, reason: "Nicht genug Gold oder ungültiger Betrag." };
    Fleet.addGold(-actual);
    kontor.loan.principal -= actual;
    if (kontor.loan.principal <= 0) kontor.loan = null;
    return { ok: true, amount: actual };
  }

  function storeGood(cityId, goodId, qty) {
    const ship = Fleet.playerShip();
    if (!ship) return { ok: false, reason: "Kein eigenes Schiff vorhanden." };
    if (!kontors[cityId] || kontors[cityId].level === 0) return { ok: false, reason: "Kein Kontor in dieser Stadt." };
    if (Fleet.cargoQty(ship, goodId) < qty) return { ok: false, reason: "Nicht genug Ware an Bord." };
    if (storageUsed(cityId) + qty > capacity(cityId)) return { ok: false, reason: "Lagerhaus ist voll." };
    const kontor = kontors[cityId];
    if (!kontor.storageCost) kontor.storageCost = {};
    const shipCost = Fleet.avgCost(ship, goodId); // null, falls unbekannt (z.B. alter Spielstand)
    const oldQty = kontor.storage[goodId] || 0;
    if (shipCost !== null) {
      const oldCost = kontor.storageCost[goodId] || 0;
      kontor.storageCost[goodId] = Fleet.mergeCost(oldQty, oldCost, qty, shipCost);
    }
    Fleet.removeCargo(ship, goodId, qty);
    kontor.storage[goodId] = oldQty + qty;
    return { ok: true };
  }

  function withdrawGood(cityId, goodId, qty) {
    const ship = Fleet.playerShip();
    if (!ship) return { ok: false, reason: "Kein eigenes Schiff vorhanden." };
    const kontor = kontors[cityId];
    const store = kontor && kontor.storage;
    if (!store || (store[goodId] || 0) < qty) return { ok: false, reason: "Nicht genug Ware im Lager." };
    if (Fleet.cargoFree(ship) < qty) return { ok: false, reason: "Nicht genug Platz an Bord." };
    if (!kontor.storageCost) kontor.storageCost = {};
    const storedCost = kontor.storageCost[goodId]; // undefined bei altem Lagerbestand ohne Preisdaten
    store[goodId] -= qty;
    if (store[goodId] === 0) {
      delete store[goodId];
      delete kontor.storageCost[goodId];
    }
    Fleet.addCargo(ship, goodId, qty, storedCost);
    return { ok: true };
  }

  function storageOf(cityId) {
    return (kontors[cityId] && kontors[cityId].storage) || {};
  }

  function storageCostOf(cityId) {
    return (kontors[cityId] && kontors[cityId].storageCost) || {};
  }

  // Kauft eine weitere Grundstuecksparzelle in einer Stadt — Voraussetzung fuer
  // den Betrieb von Produktionsstaetten (je Parzelle ein Produktionsslot).
  // Ein Kontor muss bereits vorhanden sein; Grundstuecke koennen nur im Hafen
  // der jeweiligen Stadt erworben werden.
  function buyLand(cityId) {
    const kontor = kontors[cityId];
    if (!kontor || kontor.level === 0) return { ok: false, reason: "Kein Kontor in dieser Stadt — erst ein Kontor bauen." };
    const plots = kontor.plots || 0;
    if (plots >= LAND_MAX_PLOTS) return { ok: false, reason: `Maximaler Grundbesitz erreicht (${LAND_MAX_PLOTS} Parzellen).` };
    const cost = landPlotCost(plots);
    if (Fleet.gold() < cost) return { ok: false, reason: `Nicht genug Gold (benötigt: ${cost} G).` };
    Fleet.addGold(-cost);
    kontor.plots = plots + 1;
    kontor.landValue = (kontor.landValue || 0) + cost;
    return { ok: true, cost, newPlots: kontor.plots };
  }

  function plotsOf(cityId) {
    return (kontors[cityId] && kontors[cityId].plots) || 0;
  }

  function landValueOf(cityId) {
    return (kontors[cityId] && kontors[cityId].landValue) || 0;
  }

  // Startet einen Produktionslauf fuer eine Ware, die die Stadt exportiert.
  // Voraussetzungen: Kontor + mindestens eine Grundstuecksparzelle.
  // Je Parzelle ein gleichzeitiger Auftrag (statt bisher: je Kontor-Stufe).
  function startProduction(cityId, goodId, currentDay) {
    const city = getCity(cityId);
    if (!city) return { ok: false, reason: "Stadt nicht gefunden." };
    if (!city.exports.includes(goodId)) {
      return { ok: false, reason: `${getGood(goodId).name} kann in ${city.name} nicht produziert werden — die Stadt exportiert diese Ware nicht.` };
    }
    const kontor = kontors[cityId];
    if (!kontor || kontor.level === 0) return { ok: false, reason: "Kein Kontor in dieser Stadt." };
    const plots = kontor.plots || 0;
    if (plots === 0) {
      return { ok: false, reason: "Kein Grundstück vorhanden — erst Land kaufen, um Produktionsstätten betreiben zu können." };
    }
    const recipe = PRODUCTION_RECIPES[goodId];
    if (!recipe) return { ok: false, reason: "Kein Produktionsrezept vorhanden." };
    if (Fleet.gold() < recipe.goldCost) {
      return { ok: false, reason: `Nicht genug Gold (benötigt: ${recipe.goldCost} G).` };
    }
    if (!kontor.productions) kontor.productions = [];
    // Pro Parzelle ein gleichzeitiger Produktionsauftrag
    if (kontor.productions.length >= plots) {
      return {
        ok: false,
        reason: `Alle Produktionsslots belegt (${plots} Parzelle${plots !== 1 ? "n" : ""}). Warte auf Fertigstellung oder kaufe weiteres Land.`,
      };
    }
    // Vorprodukte prüfen: alle benötigten Mengen müssen im Kontor-Lager vorhanden sein.
    const inputs = recipe.inputs || {};
    for (const [inputId, needed] of Object.entries(inputs)) {
      const available = (kontor.storage && kontor.storage[inputId]) || 0;
      if (available < needed) {
        return {
          ok: false,
          reason: `Nicht genug ${getGood(inputId).name} im Lager (benötigt: ${needed}, vorhanden: ${available}).`,
        };
      }
    }
    // Lagerkapazitätsprüfung: Inputs werden sofort verbraucht (freien Platz), Output reserviert.
    const inputQtyTotal = Object.values(inputs).reduce((sum, q) => sum + q, 0);
    const reservedQty = kontor.productions.reduce((sum, p) => sum + p.outputQty, 0);
    if (storageUsed(cityId) - inputQtyTotal + reservedQty + recipe.outputQty > capacity(cityId)) {
      return { ok: false, reason: "Lagerkapazität reicht für die zu erzeugende Ware nicht aus." };
    }
    // Materialeinsatz buchwertlich erfassen (Vollkostenprinzip: Vorprodukte fliessen zum
    // Lagerwert in die Herstellkosten ein, damit das Fertigprodukt nicht unterbewertet wird).
    if (!kontor.storageCost) kontor.storageCost = {};
    let inputCost = 0;
    for (const [inputId, needed] of Object.entries(inputs)) {
      const unitCost = kontor.storageCost[inputId] || 0;
      inputCost += unitCost * needed;
      kontor.storage[inputId] -= needed;
      if (kontor.storage[inputId] <= 0) {
        delete kontor.storage[inputId];
        delete kontor.storageCost[inputId];
      }
    }
    inputCost = Math.round(inputCost);
    Fleet.addGold(-recipe.goldCost);
    kontor.productions.push({
      goodId,
      endDay: currentDay + recipe.days,
      outputQty: recipe.outputQty,
      goldCost: recipe.goldCost,
      inputCost, // Lagerwert der verbrauchten Vorprodukte (fuer Herstellkostenbewertung)
    });
    return { ok: true, recipe, endDay: currentDay + recipe.days, inputCost };
  }

  // Prueft alle laufenden Produktionen fuer eine Stadt und schliesst abgeschlossene
  // ab — Ware wird ins Kontor-Lager eingebucht, Stueckkosten werden fortgeschrieben.
  // Gibt die fertiggestellten Jobs zurueck (fuer Log-Meldungen im Aufrufer).
  function checkProductions(cityId, currentDay) {
    const kontor = kontors[cityId];
    if (!kontor || !kontor.productions || kontor.productions.length === 0) return [];
    const done = kontor.productions.filter((p) => currentDay >= p.endDay);
    kontor.productions = kontor.productions.filter((p) => currentDay < p.endDay);
    if (!kontor.storage) kontor.storage = {};
    if (!kontor.storageCost) kontor.storageCost = {};
    done.forEach((p) => {
      // Vollkostenpreis: goldCost (Lohn/Betrieb) + inputCost (Materialeinsatz zum Lagerwert).
      // Ohne inputCost (alte Spielstaende oder Rezepte ohne Vorprodukte) nur goldCost.
      const unitCost = ((p.goldCost || 0) + (p.inputCost || 0)) / p.outputQty;
      const existingQty = kontor.storage[p.goodId] || 0;
      const existingCost = kontor.storageCost[p.goodId] || 0;
      // Gewichteter Durchschnitt aus bestehendem Bestand und neuer Produktionscharge
      kontor.storageCost[p.goodId] = Fleet.mergeCost(existingQty, existingCost, p.outputQty, unitCost);
      kontor.storage[p.goodId] = existingQty + p.outputQty;
    });
    return done;
  }

  function productionsOf(cityId) {
    return (kontors[cityId] && kontors[cityId].productions) || [];
  }

  function cannonCost(ship) {
    return ship ? 300 * (ship.cannons - 1) : 0;
  }

  // Kanonen sind eine Kapitalausgabe fuer ein bestimmtes Schiff (Flaggschiff oder
  // NPC-Handelsschiff) — bezahlt aus der gemeinsamen Kriegskasse, nicht aus dem
  // isolierten Handelskapital eines NPC-Schiffs.
  function buyCannon(ship) {
    if (!ship) return { ok: false, reason: "Kein Schiff vorhanden." };
    if (ship.cannons >= 6) return { ok: false, reason: "Schiff ist voll ausgerüstet." };
    const cost = cannonCost(ship);
    if (Fleet.gold() < cost) return { ok: false, reason: "Nicht genug Gold." };
    Fleet.addGold(-cost);
    ship.cannons += 1;
    ship.cannonValue = (ship.cannonValue || 0) + cost;
    return { ok: true, cost };
  }

  function serialize() {
    return kontors;
  }

  function restore(saved) {
    kontors = saved || {};
    Object.values(kontors).forEach((kontor) => {
      if (!kontor.storageCost) kontor.storageCost = {};
      if (kontor.loan === undefined) kontor.loan = null;
      if (!kontor.productions) kontor.productions = [];
      // Migration: Bestandsspeicherstände ohne Grundstuecksdaten nachrüsten
      if (kontor.plots === undefined) kontor.plots = 0;
      if (kontor.landValue === undefined) kontor.landValue = 0;
    });
  }

  return {
    init,
    level,
    capacity,
    storageUsed,
    buildCost,
    buildKontor,
    storeGood,
    withdrawGood,
    storageOf,
    storageCostOf,
    buyLand,
    plotsOf,
    landValueOf,
    startProduction,
    checkProductions,
    productionsOf,
    cannonCost,
    buyCannon,
    assetValue,
    loanOf,
    borrowAgainstKontor,
    repayKontorLoan,
    serialize,
    restore,
  };
})();
