// Flotte: Kriegskasse, alle Schiffe (Flaggschiff + NPC-Handelsschiffe), Lösegeldforderungen

const Fleet = (() => {
  const PIXELS_PER_DAY = 40;

  let state = {
    gold: STARTING_GOLD,
    ships: [makeFlagship()],
    ransoms: [],
  };

  function makeFlagship() {
    return {
      id: 0,
      name: "Flaggschiff",
      captain: "Du",
      isPlayer: true,
      currentCityId: HOME_CITY_ID,
      destinationCityId: null,
      sailing: false,
      progressDays: 0,
      totalDays: 0,
      cargo: {},
      cargoCost: {},
      cargoCapacity: 100,
      cannons: 2,
      speedBonus: 0,
      insurance: null,
    };
  }

  function init() {
    state = { gold: STARTING_GOLD, ships: [makeFlagship()], ransoms: [] };
  }

  function playerShip() {
    return state.ships.find((s) => s.isPlayer) || null;
  }

  function allShips() {
    return state.ships;
  }

  function getShip(shipId) {
    return state.ships.find((s) => s.id === shipId);
  }

  function gold() {
    return state.gold;
  }

  function addGold(amount) {
    state.gold = Math.max(0, state.gold + amount);
  }

  function spendGold(amount) {
    state.gold = Math.max(0, state.gold - amount);
  }

  function cargoUsed(ship) {
    return Object.values(ship.cargo).reduce((sum, q) => sum + q, 0);
  }

  function cargoFree(ship) {
    return ship.cargoCapacity - cargoUsed(ship);
  }

  function cargoValue(ship) {
    let value = 0;
    Object.entries(ship.cargo).forEach(([goodId, qty]) => {
      value += Market.sellPrice(ship.currentCityId, goodId) * qty;
    });
    return value;
  }

  function daysFor(distance, ship) {
    const speedFactor = 1 - Math.min(0.4, ship.speedBonus * 0.1);
    return Math.max(1, Math.round((distance / PIXELS_PER_DAY) * speedFactor));
  }

  function startVoyage(ship, destCityId) {
    if (ship.sailing) return { ok: false, reason: "Schiff ist bereits auf See." };
    if (destCityId === ship.currentCityId) return { ok: false, reason: "Schiff liegt schon dort vor Anker." };
    const distance = cityDistance(ship.currentCityId, destCityId);
    const totalDays = daysFor(distance, ship);
    ship.sailing = true;
    ship.destinationCityId = destCityId;
    ship.progressDays = 0;
    ship.totalDays = totalDays;
    ship.routeRiskPerDay = Math.min(0.22, 0.05 + distance / 3500);
    return { ok: true, totalDays };
  }

  function addDelay(ship, days) {
    ship.totalDays += days;
  }

  // Gibt zurück: { arrived: bool }
  function advanceDay(ship) {
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

  function progressRatio(ship) {
    if (!ship.sailing || ship.totalDays === 0) return 0;
    return ship.progressDays / ship.totalDays;
  }

  function currentPixelPos(ship) {
    const from = getCity(ship.currentCityId);
    if (!ship.sailing) return { x: from.x, y: from.y };
    const to = getCity(ship.destinationCityId);
    const t = progressRatio(ship);
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
  }

  // Gewichteter Durchschnittspreis, wenn zwei Bestände (z.B. Bord + Lager) zusammengeführt werden.
  function mergeCost(qtyA, costA, qtyB, costB) {
    const totalQty = qtyA + qtyB;
    if (totalQty <= 0) return 0;
    return (qtyA * costA + qtyB * costB) / totalQty;
  }

  // unitPrice ist optional: fehlt er (z.B. bei Verlagerungen ohne Preisangabe),
  // bleibt der bisherige Einkaufspreis unveraendert.
  function addCargo(ship, goodId, qty, unitPrice) {
    if (!ship.cargoCost) ship.cargoCost = {};
    const oldQty = ship.cargo[goodId] || 0;
    if (unitPrice !== undefined) {
      const oldCost = ship.cargoCost[goodId] || 0;
      ship.cargoCost[goodId] = mergeCost(oldQty, oldCost, qty, unitPrice);
    }
    ship.cargo[goodId] = oldQty + qty;
  }

  function removeCargo(ship, goodId, qty) {
    ship.cargo[goodId] = Math.max(0, (ship.cargo[goodId] || 0) - qty);
    if (ship.cargo[goodId] === 0) {
      delete ship.cargo[goodId];
      if (ship.cargoCost) delete ship.cargoCost[goodId];
    }
  }

  function cargoQty(ship, goodId) {
    return ship.cargo[goodId] || 0;
  }

  function avgCost(ship, goodId) {
    return (ship.cargoCost && ship.cargoCost[goodId]) || null;
  }

  function networth() {
    let total = state.gold;
    state.ships.forEach((ship) => {
      total += cargoValue(ship);
    });
    return Math.round(total);
  }

  function shipCost() {
    return SHIP_BASE_COST * state.ships.length;
  }

  function buyShip(cityId) {
    if (Kontor.level(cityId) === 0) return { ok: false, reason: "Kein Kontor in dieser Stadt — dort gibt es keine Werft." };
    const cost = shipCost();
    if (state.gold < cost) return { ok: false, reason: "Nicht genug Gold für ein neues Schiff." };
    state.gold -= cost;
    const becomesFlagship = !playerShip();
    const number = state.ships.length + 1;
    const nextId = Math.max(0, ...state.ships.map((s) => s.id)) + 1;
    const captain = becomesFlagship ? "Du" : CAPTAIN_NAMES[Math.floor(Math.random() * CAPTAIN_NAMES.length)];
    const ship = {
      id: nextId,
      name: becomesFlagship ? "Flaggschiff" : `Kogge ${number}`,
      captain,
      isPlayer: becomesFlagship,
      currentCityId: cityId,
      destinationCityId: null,
      sailing: false,
      progressDays: 0,
      totalDays: 0,
      cargo: {},
      cargoCost: {},
      cargoCapacity: NPC_SHIP_BASE.cargoCapacity,
      cannons: NPC_SHIP_BASE.cannons,
      speedBonus: NPC_SHIP_BASE.speedBonus,
      insurance: null,
    };
    state.ships.push(ship);
    return { ok: true, cost, ship };
  }

  // Anteiliger Beitrag fuer den Rest des laufenden Spieljahres (feste Jahresgrenzen ab Tag 1).
  function insuranceCost(currentDay) {
    const daysIntoYear = (currentDay - 1) % YEAR_LENGTH_DAYS;
    const daysRemaining = YEAR_LENGTH_DAYS - daysIntoYear;
    return Math.max(1, Math.round(INSURANCE_ANNUAL_COST * (daysRemaining / YEAR_LENGTH_DAYS)));
  }

  function nextYearBoundary(currentDay) {
    const daysIntoYear = (currentDay - 1) % YEAR_LENGTH_DAYS;
    return currentDay + (YEAR_LENGTH_DAYS - daysIntoYear);
  }

  function buyInsurance(ship, currentDay) {
    if (ship.insurance && ship.insurance.active) return { ok: false, reason: "Schiff ist bereits versichert." };
    const cost = insuranceCost(currentDay);
    if (state.gold < cost) return { ok: false, reason: "Nicht genug Gold für die Versicherungsprämie." };
    state.gold -= cost;
    ship.insurance = { active: true, dueDay: nextYearBoundary(currentDay) };
    return { ok: true, cost };
  }

  // Wird taeglich pro Schiff geprueft: faellige Verlaengerung abbuchen oder Police erloeschen lassen.
  function checkInsuranceRenewal(ship, currentDay) {
    if (!ship.insurance || !ship.insurance.active) return null;
    if (currentDay < ship.insurance.dueDay) return null;
    if (state.gold >= INSURANCE_ANNUAL_COST) {
      state.gold -= INSURANCE_ANNUAL_COST;
      ship.insurance.dueDay += YEAR_LENGTH_DAYS;
      return { renewed: true, cost: INSURANCE_ANNUAL_COST };
    }
    ship.insurance.active = false;
    return { renewed: false };
  }

  function destroyShip(ship, currentDay) {
    if (ship.insurance && ship.insurance.active) {
      // Vollersatz: Schiff bleibt im selben Slot erhalten, nur Ladung und Fahrt werden zurueckgesetzt.
      ship.cargo = {};
      ship.cargoCost = {};
      ship.sailing = false;
      ship.destinationCityId = null;
      ship.progressDays = 0;
      ship.totalDays = 0;
      return { insured: true };
    }
    state.ships = state.ships.filter((s) => s.id !== ship.id);
    const amount = Math.round(400 + ship.cargoCapacity * 3 + Math.random() * 300);
    const ransom = {
      id: ship.id,
      shipName: ship.name,
      captain: ship.captain,
      amount,
      deadlineDay: currentDay + RANSOM_DEADLINE_DAYS,
    };
    state.ransoms.push(ransom);
    return { insured: false, ransom };
  }

  function payRansom(ransomId) {
    const ransom = state.ransoms.find((r) => r.id === ransomId);
    if (!ransom) return { ok: false, reason: "Lösegeldforderung nicht gefunden." };
    if (state.gold < ransom.amount) return { ok: false, reason: "Nicht genug Gold für das Lösegeld." };
    state.gold -= ransom.amount;
    state.ransoms = state.ransoms.filter((r) => r.id !== ransomId);
    return { ok: true, ransom };
  }

  function expireRansoms(currentDay) {
    const expired = state.ransoms.filter((r) => currentDay >= r.deadlineDay);
    if (expired.length > 0) {
      state.ransoms = state.ransoms.filter((r) => currentDay < r.deadlineDay);
    }
    return expired;
  }

  function ransoms() {
    return state.ransoms;
  }

  function serialize() {
    return state;
  }

  function restore(saved) {
    if (!saved) {
      init();
      return;
    }
    if (!saved.ships) {
      // Migration: altes Einzelschiff-Format (vor Einführung der Flotte)
      state = {
        gold: saved.gold,
        ships: [{ ...saved, id: 0, name: "Flaggschiff", captain: "Du", isPlayer: true, cargoCost: {}, insurance: null }],
        ransoms: [],
      };
      delete state.ships[0].gold;
      return;
    }
    state = saved;
    state.ships.forEach((ship) => {
      if (!ship.cargoCost) ship.cargoCost = {};
      if (ship.insurance === undefined) ship.insurance = null;
    });
  }

  return {
    init,
    playerShip,
    allShips,
    getShip,
    gold,
    addGold,
    spendGold,
    cargoUsed,
    cargoFree,
    cargoValue,
    daysFor,
    startVoyage,
    addDelay,
    advanceDay,
    progressRatio,
    currentPixelPos,
    addCargo,
    removeCargo,
    cargoQty,
    avgCost,
    mergeCost,
    networth,
    shipCost,
    buyShip,
    insuranceCost,
    buyInsurance,
    checkInsuranceRenewal,
    destroyShip,
    payRansom,
    expireRansoms,
    ransoms,
    serialize,
    restore,
  };
})();
