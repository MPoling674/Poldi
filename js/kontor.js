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
    const ship = Ship.get();
    const cost = buildCost(cityId);
    if (level(cityId) >= 3) return { ok: false, reason: "Kontor bereits auf Höchststufe." };
    if (ship.gold < cost) return { ok: false, reason: "Nicht genug Gold." };
    ship.gold -= cost;
    if (!kontors[cityId]) kontors[cityId] = { level: 0, storage: {} };
    kontors[cityId].level += 1;
    return { ok: true, cost };
  }

  function storeGood(cityId, goodId, qty) {
    if (!kontors[cityId] || kontors[cityId].level === 0) return { ok: false, reason: "Kein Kontor in dieser Stadt." };
    if (Ship.cargoQty(goodId) < qty) return { ok: false, reason: "Nicht genug Ware an Bord." };
    if (storageUsed(cityId) + qty > capacity(cityId)) return { ok: false, reason: "Lagerhaus ist voll." };
    Ship.removeCargo(goodId, qty);
    kontors[cityId].storage[goodId] = (kontors[cityId].storage[goodId] || 0) + qty;
    return { ok: true };
  }

  function withdrawGood(cityId, goodId, qty) {
    const store = kontors[cityId] && kontors[cityId].storage;
    if (!store || (store[goodId] || 0) < qty) return { ok: false, reason: "Nicht genug Ware im Lager." };
    if (Ship.cargoFree() < qty) return { ok: false, reason: "Nicht genug Platz an Bord." };
    store[goodId] -= qty;
    if (store[goodId] === 0) delete store[goodId];
    Ship.addCargo(goodId, qty);
    return { ok: true };
  }

  function storageOf(cityId) {
    return (kontors[cityId] && kontors[cityId].storage) || {};
  }

  function cannonCost() {
    return 300 * (Ship.get().cannons - 1);
  }

  function buyCannon() {
    const ship = Ship.get();
    if (ship.cannons >= 6) return { ok: false, reason: "Schiff ist voll ausgerüstet." };
    const cost = cannonCost();
    if (ship.gold < cost) return { ok: false, reason: "Nicht genug Gold." };
    ship.gold -= cost;
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
