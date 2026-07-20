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
    if (!kontors[cityId]) kontors[cityId] = { level: 0, storage: {} };
    kontors[cityId].level += 1;
    return { ok: true, cost };
  }

  function storeGood(cityId, goodId, qty) {
    const ship = Fleet.playerShip();
    if (!ship) return { ok: false, reason: "Kein eigenes Schiff vorhanden." };
    if (!kontors[cityId] || kontors[cityId].level === 0) return { ok: false, reason: "Kein Kontor in dieser Stadt." };
    if (Fleet.cargoQty(ship, goodId) < qty) return { ok: false, reason: "Nicht genug Ware an Bord." };
    if (storageUsed(cityId) + qty > capacity(cityId)) return { ok: false, reason: "Lagerhaus ist voll." };
    Fleet.removeCargo(ship, goodId, qty);
    kontors[cityId].storage[goodId] = (kontors[cityId].storage[goodId] || 0) + qty;
    return { ok: true };
  }

  function withdrawGood(cityId, goodId, qty) {
    const ship = Fleet.playerShip();
    if (!ship) return { ok: false, reason: "Kein eigenes Schiff vorhanden." };
    const store = kontors[cityId] && kontors[cityId].storage;
    if (!store || (store[goodId] || 0) < qty) return { ok: false, reason: "Nicht genug Ware im Lager." };
    if (Fleet.cargoFree(ship) < qty) return { ok: false, reason: "Nicht genug Platz an Bord." };
    store[goodId] -= qty;
    if (store[goodId] === 0) delete store[goodId];
    Fleet.addCargo(ship, goodId, qty);
    return { ok: true };
  }

  function storageOf(cityId) {
    return (kontors[cityId] && kontors[cityId].storage) || {};
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
    kontors = saved;
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
    cannonCost,
    buyCannon,
    serialize,
    restore,
  };
})();
