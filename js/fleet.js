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
      cargoInsurance: null,
      loan: null,
      paused: false,
      cannonValue: 0,
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

  // Wert der Ladung zum Einkaufspreis (statt Verkaufspreis) — fuer Verlustbuchungen,
  // damit sie zur "Warenbestand"-Bewertung in der Bilanz passen.
  function cargoCostValue(ship) {
    let value = 0;
    Object.entries(ship.cargo).forEach(([goodId, qty]) => {
      const unitCost = avgCost(ship, goodId);
      value += (unitCost !== null ? unitCost : Market.buyPrice(ship.currentCityId, goodId)) * qty;
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
      total += cargoValue(ship) + (ship.tradingCapital || 0);
    });
    return Math.round(total);
  }

  function shipCost() {
    return SHIP_BASE_COST * state.ships.length;
  }

  function shipValue(ship) {
    return SHIP_BASE_COST;
  }

  function borrowAgainstShip(ship, amount) {
    if (amount <= 0) return { ok: false, reason: "Ungültiger Betrag." };
    const currentPrincipal = (ship.loan && ship.loan.principal) || 0;
    const maxLoan = shipValue(ship) * LOAN_MAX_LTV;
    if (currentPrincipal + amount > maxLoan) {
      return { ok: false, reason: `Beleihungsgrenze überschritten (max. ${Math.round(maxLoan)} G).` };
    }
    addGold(amount);
    ship.loan = { principal: currentPrincipal + amount };
    return { ok: true, amount };
  }

  function repayShipLoan(ship, amount) {
    if (!ship.loan) return { ok: false, reason: "Kein offener Kredit auf dieses Schiff." };
    const actual = Math.min(amount, ship.loan.principal, state.gold);
    if (actual <= 0) return { ok: false, reason: "Nicht genug Gold oder ungültiger Betrag." };
    state.gold -= actual;
    ship.loan.principal -= actual;
    if (ship.loan.principal <= 0) ship.loan = null;
    return { ok: true, amount: actual };
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
    // NPC-Schiffe bekommen ein eigenes, gedeckeltes Handelskapital (50% des nach dem
    // Kauf verbleibenden Goldes) statt frei aus der gemeinsamen Kriegskasse zu handeln.
    const initialCapital = becomesFlagship ? 0 : Math.round(state.gold * 0.5);
    state.gold -= initialCapital;
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
      cargoInsurance: null,
      loan: null,
      paused: false,
      tradingCapital: initialCapital,
      cannonValue: 0,
    };
    state.ships.push(ship);
    return { ok: true, cost, ship };
  }

  // Pausieren wirkt sofort: eine laufende Fahrt wird abgebrochen, das Schiff kehrt in
  // den Hafen zurueck, den es gerade verlassen hat (ship.currentCityId aendert sich erst
  // bei tatsaechlicher Ankunft, ist also waehrend der Fahrt noch der Ausgangshafen).
  function setPaused(ship, paused) {
    ship.paused = paused;
    if (paused && ship.sailing) {
      ship.sailing = false;
      ship.destinationCityId = null;
      ship.progressDays = 0;
      ship.totalDays = 0;
    }
  }

  // Verbucht Handelsgewinn/-verlust eines NPC-Schiffs auf sein eigenes Handelskapital
  // (nicht auf die gemeinsame Kriegskasse) — Untergrenze 0, analog zu addGold.
  function addShipCapital(ship, amount) {
    ship.tradingCapital = Math.max(0, (ship.tradingCapital || 0) + amount);
  }

  function fundShip(ship, amount) {
    if (ship.isPlayer) return { ok: false, reason: "Das Flaggschiff handelt direkt über die Kriegskasse." };
    if (amount <= 0) return { ok: false, reason: "Ungültiger Betrag." };
    if (state.gold < amount) return { ok: false, reason: "Nicht genug Gold." };
    state.gold -= amount;
    ship.tradingCapital = (ship.tradingCapital || 0) + amount;
    return { ok: true, amount };
  }

  function withdrawShipCapital(ship, amount) {
    if (ship.isPlayer) return { ok: false, reason: "Das Flaggschiff handelt direkt über die Kriegskasse." };
    const available = ship.tradingCapital || 0;
    const actual = Math.min(amount, available);
    if (actual <= 0) return { ok: false, reason: "Kein Handelskapital zum Abziehen vorhanden." };
    ship.tradingCapital -= actual;
    addGold(actual);
    return { ok: true, amount: actual };
  }

  // Verkauft ein NPC-Schiff endgueltig gegen 50% seines Buchwerts — sowohl Rumpf als
  // auch investierte Kanonen. Ein offener Kredit wird zuerst aus dem Erloes getilgt;
  // reicht der Erloes nicht, wird der Verkauf verweigert (kein automatischer Erlass,
  // da der Verkauf freiwillig ist). Verbleibendes Handelskapital ist nur Bargeld in
  // der Schiffskasse und wird zusaetzlich gutgeschrieben. Die andere Haelfte des
  // Buchwerts ist ein Anlagenabgang-Verlust, den der Aufrufer als GuV-Aufwand
  // verbucht (assetLoss).
  function sellShip(ship) {
    if (ship.isPlayer) return { ok: false, reason: "Das Flaggschiff kann nicht verkauft werden." };
    if (ship.sailing) return { ok: false, reason: "Schiff ist auf See — kann nicht verkauft werden." };
    const cannonValueLost = ship.cannonValue || 0;
    const proceeds = Math.round(shipValue(ship) * 0.5) + Math.round(cannonValueLost * 0.5);
    const loanPrincipal = (ship.loan && ship.loan.principal) || 0;
    if (loanPrincipal > proceeds) {
      return { ok: false, reason: `Verkauf nicht möglich — offener Kredit (${Math.round(loanPrincipal)} G) übersteigt den Restwert (${proceeds} G). Bitte zuerst tilgen.` };
    }
    const netProceeds = proceeds - loanPrincipal;
    const capitalReturned = ship.tradingCapital || 0;
    const assetLoss = Math.max(0, shipValue(ship) + cannonValueLost - proceeds);
    addGold(netProceeds + capitalReturned);
    state.ships = state.ships.filter((s) => s.id !== ship.id);
    return { ok: true, proceeds, loanRepaid: loanPrincipal, netProceeds, capitalReturned, cannonValueLost, assetLoss };
  }

  // Anteiliger Beitrag fuer den Rest des laufenden Spieljahres (feste Jahresgrenzen ab Tag 1).
  function proRatedCost(currentDay, annualCost) {
    const daysIntoYear = (currentDay - 1) % YEAR_LENGTH_DAYS;
    const daysRemaining = YEAR_LENGTH_DAYS - daysIntoYear;
    return Math.max(1, Math.round(annualCost * (daysRemaining / YEAR_LENGTH_DAYS)));
  }

  function insuranceCost(currentDay) {
    return proRatedCost(currentDay, INSURANCE_ANNUAL_COST);
  }

  // Ladungsversicherung ist eine eigenstaendige zweite Police (unabhaengig von der
  // Rumpfversicherung) — deckt nur den Warenwert an Bord, nicht das Schiff selbst.
  function cargoInsuranceCost(currentDay) {
    return proRatedCost(currentDay, CARGO_INSURANCE_ANNUAL_COST);
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

  function buyCargoInsurance(ship, currentDay) {
    if (ship.cargoInsurance && ship.cargoInsurance.active) return { ok: false, reason: "Ladung ist bereits versichert." };
    const cost = cargoInsuranceCost(currentDay);
    if (state.gold < cost) return { ok: false, reason: "Nicht genug Gold für die Ladungsversicherungsprämie." };
    state.gold -= cost;
    ship.cargoInsurance = { active: true, dueDay: nextYearBoundary(currentDay) };
    return { ok: true, cost };
  }

  // Wird taeglich pro Schiff geprueft: faellige Verlaengerung abbuchen oder Police erloeschen lassen.
  // Die jaehrliche Verlaengerung ist eine automatische Betriebskosten des Schiffs:
  // beim Flaggschiff aus der Kriegskasse (kein eigenes Handelskapital), bei
  // NPC-Schiffen aus deren eigenem Handelskapital (der Erstabschluss ueber
  // buyInsurance() bleibt bewusst eine Kriegskassen-Investitionsentscheidung).
  function checkInsuranceRenewal(ship, currentDay) {
    if (!ship.insurance || !ship.insurance.active) return null;
    if (currentDay < ship.insurance.dueDay) return null;
    const available = ship.isPlayer ? state.gold : (ship.tradingCapital || 0);
    if (available >= INSURANCE_ANNUAL_COST) {
      if (ship.isPlayer) state.gold -= INSURANCE_ANNUAL_COST;
      else ship.tradingCapital -= INSURANCE_ANNUAL_COST;
      ship.insurance.dueDay += YEAR_LENGTH_DAYS;
      return { renewed: true, cost: INSURANCE_ANNUAL_COST };
    }
    ship.insurance.active = false;
    return { renewed: false };
  }

  // Analog zu checkInsuranceRenewal(), fuer die separate Ladungspolice.
  function checkCargoInsuranceRenewal(ship, currentDay) {
    if (!ship.cargoInsurance || !ship.cargoInsurance.active) return null;
    if (currentDay < ship.cargoInsurance.dueDay) return null;
    const available = ship.isPlayer ? state.gold : (ship.tradingCapital || 0);
    if (available >= CARGO_INSURANCE_ANNUAL_COST) {
      if (ship.isPlayer) state.gold -= CARGO_INSURANCE_ANNUAL_COST;
      else ship.tradingCapital -= CARGO_INSURANCE_ANNUAL_COST;
      ship.cargoInsurance.dueDay += YEAR_LENGTH_DAYS;
      return { renewed: true, cost: CARGO_INSURANCE_ANNUAL_COST };
    }
    ship.cargoInsurance.active = false;
    return { renewed: false };
  }

  function destroyShip(ship, currentDay) {
    const cargoLossValue = Math.round(cargoCostValue(ship));
    // Die Ladungspolice ist unabhaengig von der Rumpfversicherung: sie entscheidet
    // nur, ob der Warenwert ersetzt wird, nicht ob das Schiff selbst erhalten bleibt.
    const cargoInsured = !!(ship.cargoInsurance && ship.cargoInsurance.active);
    if (ship.insurance && ship.insurance.active) {
      // Vollersatz: Schiff bleibt im selben Slot erhalten, nur Ladung und Fahrt werden zurueckgesetzt.
      ship.cargo = {};
      ship.cargoCost = {};
      ship.sailing = false;
      ship.destinationCityId = null;
      ship.progressDays = 0;
      ship.totalDays = 0;
      return { insured: true, cargoInsured, cargoLossValue, shipValue: SHIP_BASE_COST };
    }
    let loanWrittenOff = 0;
    let loanRepaid = 0;
    if (ship.loan && ship.loan.principal > 0) {
      loanRepaid = Math.min(ship.loan.principal, state.gold);
      state.gold -= loanRepaid;
      loanWrittenOff = ship.loan.principal - loanRepaid;
    }
    // Handelskapital ist nur Bargeld in der Schiffskasse, kein Schiffswert —
    // es geht mit dem Schiff nicht verloren, sondern kommt aufs Spielerkonto zurueck.
    const capitalReturned = ship.tradingCapital || 0;
    addGold(capitalReturned);
    // Schiffsrumpf und investierte Kanonen sind hier hingegen endgueltig verloren
    // (Anlagenabgang) — der Aufrufer bucht das als GuV-Verlust.
    const cannonValueLost = ship.cannonValue || 0;
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
    return { insured: false, cargoInsured, ransom, cargoLossValue, loanRepaid, loanWrittenOff, capitalReturned, shipValue: SHIP_BASE_COST, cannonValueLost };
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
        ships: [{ ...saved, id: 0, name: "Flaggschiff", captain: "Du", isPlayer: true, cargoCost: {}, insurance: null, cargoInsurance: null, loan: null, paused: false, tradingCapital: 0, cannonValue: 0 }],
        ransoms: [],
      };
      delete state.ships[0].gold;
      return;
    }
    state = saved;
    state.ships.forEach((ship) => {
      if (!ship.cargoCost) ship.cargoCost = {};
      if (ship.insurance === undefined) ship.insurance = null;
      if (ship.cargoInsurance === undefined) ship.cargoInsurance = null;
      if (ship.loan === undefined) ship.loan = null;
      if (ship.paused === undefined) ship.paused = false;
      if (ship.tradingCapital === undefined) ship.tradingCapital = 0;
      if (ship.cannonValue === undefined) ship.cannonValue = 0;
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
    shipValue,
    borrowAgainstShip,
    repayShipLoan,
    buyShip,
    setPaused,
    addShipCapital,
    fundShip,
    withdrawShipCapital,
    sellShip,
    insuranceCost,
    buyInsurance,
    checkInsuranceRenewal,
    cargoInsuranceCost,
    buyCargoInsurance,
    checkCargoInsuranceRenewal,
    destroyShip,
    payRansom,
    expireRansoms,
    ransoms,
    serialize,
    restore,
  };
})();
