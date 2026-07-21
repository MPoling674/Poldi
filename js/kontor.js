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
    if (!kontors[cityId]) kontors[cityId] = { level: 0, storage: {}, storageCost: {}, loan: null };
    if (!kontors[cityId].storageCost) kontors[cityId].storageCost = {};
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

  function cannonCost() {
    const ship = Fleet.playerShip();
    return ship ? 300 * (ship.cannons - 1) : 0;
  }

  function buyCannon() {
    const ship = Fleet.playerShip();
    if (!ship) return { ok: false, reason: "Kein eigenes Schiff vorhanden." };
    if (ship.cannons >= 6) return { ok: false, reason: "Schiff ist voll ausgerüstet." };
    const cost = cannonCost();
    if (Fleet.gold() < cost) return { ok: false, reason: "Nicht genug Gold." };
    Fleet.addGold(-cost);
    ship.cannons += 1;
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
