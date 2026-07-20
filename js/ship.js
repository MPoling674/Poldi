// Schiff: Position, Fracht, Reisezustand

const Ship = (() => {
  const PIXELS_PER_DAY = 40;

  let ship = {
    currentCityId: HOME_CITY_ID,
    destinationCityId: null,
    sailing: false,
    progressDays: 0,
    totalDays: 0,
    cargo: {},
    cargoCapacity: 100,
    gold: 800,
    cannons: 2,
    speedBonus: 0, // reduziert Reisedauer leicht pro Stufe
  };

  function init() {
    ship = {
      currentCityId: HOME_CITY_ID,
      destinationCityId: null,
      sailing: false,
      progressDays: 0,
      totalDays: 0,
      cargo: {},
      cargoCapacity: 100,
      gold: 800,
      cannons: 2,
      speedBonus: 0,
    };
  }

  function cargoUsed() {
    return Object.values(ship.cargo).reduce((sum, q) => sum + q, 0);
  }

  function cargoFree() {
    return ship.cargoCapacity - cargoUsed();
  }

  function daysFor(distance) {
    const speedFactor = 1 - Math.min(0.4, ship.speedBonus * 0.1);
    return Math.max(1, Math.round((distance / PIXELS_PER_DAY) * speedFactor));
  }

  function startVoyage(destCityId) {
    if (ship.sailing) return { ok: false, reason: "Schiff ist bereits auf See." };
    if (destCityId === ship.currentCityId) return { ok: false, reason: "Schiff liegt schon dort vor Anker." };
    const distance = cityDistance(ship.currentCityId, destCityId);
    const totalDays = daysFor(distance);
    ship.sailing = true;
    ship.destinationCityId = destCityId;
    ship.progressDays = 0;
    ship.totalDays = totalDays;
    ship.routeRiskPerDay = Math.min(0.22, 0.05 + distance / 3500);
    return { ok: true, totalDays };
  }

  function addDelay(days) {
    ship.totalDays += days;
  }

  // Gibt zurück: { arrived: bool }
  function advanceDay() {
    ship.progressDays += 1;
    if (ship.progressDays >= ship.totalDays) {
      ship.currentCityId = ship.destinationCityId;
      ship.destinationCityId = null;
      ship.sailing = false;
      ship.progressDays = 0;
      ship.totalDays = 0;
      return { arrived: true };
    }
    return { arrived: false };
  }

  function progressRatio() {
    if (!ship.sailing || ship.totalDays === 0) return 0;
    return ship.progressDays / ship.totalDays;
  }

  function currentPixelPos() {
    const from = getCity(ship.currentCityId);
    if (!ship.sailing) return { x: from.x, y: from.y };
    const to = getCity(ship.destinationCityId);
    const t = progressRatio();
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
  }

  function addCargo(goodId, qty) {
    ship.cargo[goodId] = (ship.cargo[goodId] || 0) + qty;
  }

  function removeCargo(goodId, qty) {
    ship.cargo[goodId] = Math.max(0, (ship.cargo[goodId] || 0) - qty);
    if (ship.cargo[goodId] === 0) delete ship.cargo[goodId];
  }

  function cargoQty(goodId) {
    return ship.cargo[goodId] || 0;
  }

  function networth() {
    let goodsValue = 0;
    Object.entries(ship.cargo).forEach(([goodId, qty]) => {
      goodsValue += Market.sellPrice(ship.sailing ? ship.currentCityId : ship.currentCityId, goodId) * qty;
    });
    return Math.round(ship.gold + goodsValue);
  }

  function serialize() {
    return ship;
  }

  function restore(saved) {
    ship = saved;
  }

  return {
    get: () => ship,
    init,
    cargoUsed,
    cargoFree,
    daysFor,
    startVoyage,
    addDelay,
    advanceDay,
    progressRatio,
    currentPixelPos,
    addCargo,
    removeCargo,
    cargoQty,
    networth,
    serialize,
    restore,
  };
})();
