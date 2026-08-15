// Spielzustand, Game-Loop, Verkabelung der Module

const Game = (() => {
  const SAIL_STEP_MS = 350;
  const SAVE_KEY = "hansespiel-save";

  let day = 1;
  let pendingPirateResolve = null;
  let pendingCaptureOffer = null; // gesetztes Kapern-Angebot, bis Spieler entschieden hat
  let tickScheduled = false;

  function currentDay() {
    return day;
  }

  // Stellt sicher, dass niemals zwei parallele Tick-Ketten laufen
  // (z.B. wenn ein Import/Kauf passiert, während bereits eine Reise tickt).
  function scheduleTick() {
    if (tickScheduled) return;
    tickScheduled = true;
    setTimeout(() => {
      tickScheduled = false;
      try {
        dayTick();
      } catch (e) {
        console.error("Fehler im Tages-Tick:", e);
        UI.log("Ein unerwarteter Fehler ist aufgetreten — das Spiel läuft weiter.");
        if (playerIsSailing()) scheduleTick();
      }
    }, SAIL_STEP_MS);
  }

  function buildPayload() {
    return {
      day,
      fleet: Fleet.serialize(),
      market: Market.serialize(),
      kontor: Kontor.serialize(),
      ledger: Ledger.serialize(),
    };
  }

  function saveGame() {
    localStorage.setItem(SAVE_KEY, JSON.stringify(buildPayload()));
  }

  function applyPayload(payload) {
    if (!payload || !payload.market || !payload.kontor || typeof payload.day !== "number") {
      throw new Error("Ungültiges Spielstand-Format.");
    }
    if (!payload.fleet && !payload.ship) {
      throw new Error("Ungültiges Spielstand-Format.");
    }
    day = payload.day;
    Fleet.restore(payload.fleet || payload.ship);
    Market.restore(payload.market);
    Kontor.restore(payload.kontor);
    Ledger.restore(payload.ledger);
  }

  function loadGame() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    try {
      applyPayload(JSON.parse(raw));
      return true;
    } catch (e) {
      return false;
    }
  }

  function anySailing() {
    return Fleet.allShips().some((s) => s.sailing);
  }

  // Die Spielzeit laeuft nur, solange das eigene Schiff unterwegs ist — NPC-Schiffe
  // "ziehen" ihre Fahrt- und Handelstage nur an diesen Tagen mit, damit die Welt nicht
  // im Hintergrund weiterlaeuft, waehrend der Spieler im Hafen liegt.
  function playerIsSailing() {
    const player = Fleet.playerShip();
    return !!(player && player.sailing);
  }

  function resumeIfSailing() {
    const player = Fleet.playerShip();
    if (player && player.sailing) {
      UI.showTravelOverlay(getCity(player.destinationCityId).name);
      UI.updateTravelBar(Fleet.progressRatio(player));
    }
    if (playerIsSailing()) {
      scheduleTick();
    }
  }

  function handleSaveNow() {
    saveGame();
    UI.setSaveStatus(`Gespeichert (Tag ${day}).`);
    UI.log("Spielstand manuell gespeichert.");
  }

  function handleExportSave() {
    const payload = buildPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hansespiel-tag${day}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    UI.setSaveStatus(`Als Datei gesichert (Tag ${day}).`);
    UI.log("Spielstand als Datei heruntergeladen.");
  }

  function handleImportSave(jsonText) {
    if (anySailing()) {
      pendingPirateResolve = null;
      UI.hidePirateModal();
      UI.hideTravelOverlay();
    }
    try {
      applyPayload(JSON.parse(jsonText));
    } catch (e) {
      UI.setSaveStatus("Import fehlgeschlagen: " + e.message);
      UI.log("Import fehlgeschlagen: " + e.message);
      return;
    }
    saveGame();
    UI.renderAll();
    UI.setSaveStatus(`Spielstand aus Datei geladen (Tag ${day}).`);
    UI.log("Spielstand aus Datei geladen.");
    resumeIfSailing();
  }

  function handleNewGame() {
    if (!window.confirm("Neues Spiel beginnen? Der aktuelle Spielstand geht dabei verloren.")) return;
    pendingPirateResolve = null;
    UI.hidePirateModal();
    UI.hideTravelOverlay();
    localStorage.removeItem(SAVE_KEY);
    day = 1;
    Fleet.init();
    Market.init();
    Kontor.init();
    Ledger.init();
    UI.renderAll();
    UI.setSaveStatus("Neues Spiel gestartet.");
    UI.log("Ein neues Spiel beginnt in Lübeck.");
  }

  function npcSellAll(ship) {
    let totalRevenue = 0;
    Object.keys(ship.cargo).forEach((goodId) => {
      const qty = ship.cargo[goodId];
      const res = Market.sell(ship.currentCityId, goodId, qty);
      if (res.ok) {
        const fee = Math.round(res.revenue * HARBOR_FEE_RATE);
        Fleet.addShipCapital(ship, res.revenue - fee);
        Fleet.removeCargo(ship, goodId, qty);
        Ledger.record("tradeRevenue", res.revenue);
        Ledger.record("harborFees", fee);
        totalRevenue += res.revenue - fee;
      }
    });
    return totalRevenue;
  }

  function npcPickPurchase(ship) {
    let bestGoodId = null;
    let bestRatio = Infinity;
    GOODS.forEach((good) => {
      if (Market.availableStock(ship.currentCityId, good.id) <= 0) return;
      const ratio = Market.buyPrice(ship.currentCityId, good.id) / good.basePrice;
      if (ratio < bestRatio) {
        bestRatio = ratio;
        bestGoodId = good.id;
      }
    });
    return bestGoodId;
  }

  function npcBuy(ship, goodId) {
    if (!goodId) return 0;
    const price = Market.buyPrice(ship.currentCityId, goodId) * (1 + HARBOR_FEE_RATE);
    const maxByBudget = Math.floor((ship.tradingCapital || 0) / price);
    const maxByCargo = Fleet.cargoFree(ship);
    const maxByStock = Market.availableStock(ship.currentCityId, goodId);
    const qty = Math.max(0, Math.min(maxByBudget, maxByCargo, maxByStock));
    if (qty <= 0) return 0;
    const res = Market.buy(ship.currentCityId, goodId, qty);
    if (!res.ok) return 0;
    const fee = Math.round(res.cost * HARBOR_FEE_RATE);
    Fleet.addShipCapital(ship, -res.cost - fee);
    Fleet.addCargo(ship, goodId, qty, res.cost / qty);
    Ledger.record("tradeCost", res.cost);
    Ledger.record("harborFees", fee);
    return qty;
  }

  function npcPickDestination(ship, boughtGoodId) {
    const maxDays = ship.cannons * NPC_MAX_DAYS_PER_CANNON;
    const others = CITIES.filter((c) => c.id !== ship.currentCityId);
    const inRange = others.filter((c) => Fleet.daysFor(cityDistance(ship.currentCityId, c.id), ship) <= maxDays);
    const pool = inRange.length > 0 ? inRange : others;
    if (boughtGoodId) {
      const matches = pool.filter((c) => c.imports.includes(boughtGoodId));
      if (matches.length > 0) return matches[Math.floor(Math.random() * matches.length)].id;
    }
    if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)].id;
    // Fallback (sollte praktisch nie eintreten): naechstgelegene Stadt, damit das
    // Schiff auf keinen Fall ohne Ziel liegen bleibt.
    return others.slice().sort((a, b) =>
      cityDistance(ship.currentCityId, a.id) - cityDistance(ship.currentCityId, b.id)
    )[0].id;
  }

  function npcArrive(ship) {
    const revenue = npcSellAll(ship);
    if (revenue > 0) {
      UI.log(`${ship.name} verkauft Ladung in ${getCity(ship.currentCityId).name} für ${revenue} Gulden.`);
    }
    if (ship.paused) {
      UI.log(`${ship.name} bleibt pausiert im Hafen von ${getCity(ship.currentCityId).name} liegen.`);
      return;
    }
    const goodId = npcPickPurchase(ship);
    const qty = npcBuy(ship, goodId);
    if (qty > 0) {
      UI.log(`${ship.name} kauft ${qty}x ${getGood(goodId).name} in ${getCity(ship.currentCityId).name}.`);
    }
    const destId = npcPickDestination(ship, goodId);
    const res = Fleet.startVoyage(ship, destId);
    if (res.ok) {
      UI.log(`${ship.name} sticht in See, Ziel: ${getCity(destId).name} (${res.totalDays} Tage Fahrt).`);
    }
  }

  function dayTick() {
    if (!playerIsSailing()) return;
    Market.tick();
    day += 1;

    // Ernte- und Naturereignisse pruefen (Ablauf + neue Wuerfe)
    const harvest = Market.checkHarvestEvents(day);
    harvest.expired.forEach((evt) => {
      const def = HARVEST_FAIL_EVENTS.find((d) => d.goodId === evt.goodId);
      if (def) UI.log(def.endMsg(evt.regionName));
    });
    harvest.started.forEach((evt) => {
      const def = HARVEST_FAIL_EVENTS.find((d) => d.goodId === evt.goodId);
      if (def) UI.log(def.startMsg(evt.duration, evt.regionName));
    });

    const sailingShips = Fleet.allShips().filter((s) => s.sailing);
    for (const ship of sailingShips) {
      const result = Fleet.advanceDay(ship);
      if (ship.isPlayer) {
        UI.updateTravelBar(Fleet.progressRatio(ship));
      }

      if (result.arrived) {
        if (ship.isPlayer) {
          UI.hideTravelOverlay();
          UI.log(`Das Schiff hat ${getCity(ship.currentCityId).name} erreicht.`);
        } else {
          npcArrive(ship);
        }
        continue;
      }

      if (Pirates.rollEncounter(ship)) {
        if (ship.isPlayer) {
          // Piraten-Schiff vor der Entscheidung generieren, damit der Spieler
          // Masten und Kanonen sieht und eine fundierte Wahl treffen kann.
          const encounter = Pirates.generateEncounter();
          UI.showPirateModal(
            "Ein fremdes Segel nähert sich schnell — was tut Ihr?",
            { name: encounter.name, masts: encounter.masts, cannons: encounter.cannons, shipCannons: ship.cannons }
          );
          pendingPirateResolve = () => {
            scheduleTick();
          };
          return;
        }
        // NPC-Schiffe fliehen automatisch; Begegnung wird in resolveFlee geloescht.
        const result = Pirates.resolveFlee(ship, day);
        UI.log(`${ship.name}: ${result.message}`);
      }
    }

    Fleet.allShips().forEach((ship) => {
      if (ship.isPlayer) return;
      const wage = Math.round(WAGE_BASE + WAGE_STRENGTH_RATE * shipStrength(ship) + WAGE_CARGO_RATE * Fleet.cargoValue(ship));
      // Heuer ist eine Betriebskosten des Schiffs selbst — bezahlt aus seinem eigenen
      // Handelskapital, nicht aus der Kriegskasse. Reicht es nicht, wird nur der
      // tatsaechlich zahlbare Teil verbucht (kein Schulden-Modell fuer Heuer).
      const paid = Math.min(wage, ship.tradingCapital || 0);
      Fleet.addShipCapital(ship, -paid);
      Ledger.record("wages", paid);
    });

    let kontorUpkeepTotal = 0;
    CITIES.forEach((city) => {
      const level = Kontor.level(city.id);
      if (level > 0) kontorUpkeepTotal += KONTOR_UPKEEP_PER_LEVEL * level;
    });
    if (kontorUpkeepTotal > 0) {
      Fleet.addGold(-kontorUpkeepTotal);
      Ledger.record("kontorUpkeep", kontorUpkeepTotal);
    }

    Fleet.allShips().forEach((ship) => {
      const renewal = Fleet.checkInsuranceRenewal(ship, day);
      if (!renewal) return;
      if (renewal.renewed) {
        Ledger.record("insurancePremiums", renewal.cost);
        UI.log(`Rumpfversicherung für ${ship.name} um ein Jahr verlängert (${renewal.cost} Gulden).`);
      } else {
        const reason = ship.isPlayer ? "nicht genug Gold" : "nicht genug Handelskapital";
        UI.log(`Rumpfversicherung für ${ship.name} erloschen — ${reason} zur Verlängerung.`);
      }
    });

    Fleet.allShips().forEach((ship) => {
      const renewal = Fleet.checkCargoInsuranceRenewal(ship, day);
      if (!renewal) return;
      if (renewal.renewed) {
        Ledger.record("cargoInsurancePremiums", renewal.cost);
        UI.log(`Ladungsversicherung für ${ship.name} um ein Jahr verlängert (${renewal.cost} Gulden).`);
      } else {
        const reason = ship.isPlayer ? "nicht genug Gold" : "nicht genug Handelskapital";
        UI.log(`Ladungsversicherung für ${ship.name} erloschen — ${reason} zur Verlängerung.`);
      }
    });

    Fleet.expireRansoms(day).forEach((ransom) => {
      UI.log(`Die Lösegeldfrist für ${ransom.shipName} ist abgelaufen — die Crew ist verloren.`);
    });

    // Abgeschlossene Produktionslaeufe in allen Kontoren verbuchen
    CITIES.forEach((city) => {
      if (Kontor.level(city.id) === 0) return;
      const completed = Kontor.checkProductions(city.id, day);
      completed.forEach((job) => {
        UI.log(
          `${getCity(city.id).name}: ${job.outputQty}× ${getGood(job.goodId).name} produziert und ins Kontor-Lager eingelagert.`
        );
      });
    });

    CITIES.forEach((city) => {
      const loan = Kontor.loanOf(city.id);
      if (!loan) return;
      const rate = loanRate(loan.principal, Kontor.assetValue(city.id));
      const interest = (loan.principal * rate) / YEAR_LENGTH_DAYS;
      if (Fleet.gold() >= interest) {
        Fleet.addGold(-interest);
        Ledger.record("loanInterest", interest);
      } else {
        loan.principal += interest;
        UI.log(`Zinszahlung für den Kontor-Kredit in ${city.name} nicht möglich — ${interest.toFixed(2)} Gulden wurden dem Kredit zugeschlagen.`);
      }
    });

    Fleet.allShips().forEach((ship) => {
      if (!ship.loan) return;
      const rate = loanRate(ship.loan.principal, Fleet.shipValue(ship));
      const interest = (ship.loan.principal * rate) / YEAR_LENGTH_DAYS;
      if (Fleet.gold() >= interest) {
        Fleet.addGold(-interest);
        Ledger.record("loanInterest", interest);
      } else {
        ship.loan.principal += interest;
        UI.log(`Zinszahlung für den Kredit auf ${ship.name} nicht möglich — ${interest.toFixed(2)} Gulden wurden dem Kredit zugeschlagen.`);
      }
    });

    UI.renderAll();
    saveGame();

    if (playerIsSailing()) {
      scheduleTick();
    }
  }

  function handleCityClick(cityId) {
    const ship = Fleet.playerShip();
    if (!ship) return UI.log("Du hast derzeit kein eigenes Schiff. Kaufe eines in einer Stadt mit Kontor.");
    if (ship.sailing) {
      UI.log("Das Schiff ist bereits auf See.");
      return;
    }
    const res = Fleet.startVoyage(ship, cityId);
    if (!res.ok) {
      UI.log(res.reason);
      return;
    }
    UI.log(`Das Schiff sticht in See, Ziel: ${getCity(cityId).name} (${res.totalDays} Tage Fahrt).`);
    UI.showTravelOverlay(getCity(cityId).name);
    UI.updateTravelBar(0);
    UI.renderAll();
    scheduleTick();
  }

  function handleBuy(goodId, qty) {
    const ship = Fleet.playerShip();
    if (!ship) return UI.log("Du hast derzeit kein eigenes Schiff.");
    if (ship.sailing) return UI.log("Handel ist nur im Hafen möglich.");
    if (qty > Fleet.cargoFree(ship)) return UI.log("Nicht genug Frachtraum an Bord.");
    const estCost = Math.round(Market.buyPrice(ship.currentCityId, goodId) * qty * (1 + HARBOR_FEE_RATE));
    if (Fleet.gold() < estCost) return UI.log("Nicht genug Gold für diesen Kauf (inkl. Hafengebühr).");
    const res = Market.buy(ship.currentCityId, goodId, qty);
    if (!res.ok) return UI.log(res.reason);
    const fee = Math.round(res.cost * HARBOR_FEE_RATE);
    Fleet.addGold(-res.cost - fee);
    Fleet.addCargo(ship, goodId, qty, res.cost / qty);
    Ledger.record("tradeCost", res.cost);
    Ledger.record("harborFees", fee);
    UI.log(`${qty}x ${getGood(goodId).name} gekauft für ${res.cost} Gulden (+${fee} G Hafengebühr).`);
    UI.renderAll();
    saveGame();
  }

  function handleSell(goodId, qty) {
    const ship = Fleet.playerShip();
    if (!ship) return UI.log("Du hast derzeit kein eigenes Schiff.");
    if (ship.sailing) return UI.log("Handel ist nur im Hafen möglich.");
    if (Fleet.cargoQty(ship, goodId) < qty) return UI.log("Nicht genug Ware an Bord.");
    const res = Market.sell(ship.currentCityId, goodId, qty);
    if (!res.ok) return UI.log(res.reason);
    const fee = Math.round(res.revenue * HARBOR_FEE_RATE);
    const netRevenue = res.revenue - fee;
    const boughtAt = Fleet.avgCost(ship, goodId);
    Fleet.addGold(netRevenue);
    Fleet.removeCargo(ship, goodId, qty);
    Ledger.record("tradeRevenue", res.revenue);
    Ledger.record("harborFees", fee);
    let profitNote = "";
    if (boughtAt !== null) {
      const profit = Math.round(netRevenue - boughtAt * qty);
      profitNote = profit >= 0 ? ` (Gewinn: ${profit} G)` : ` (Verlust: ${-profit} G)`;
    }
    UI.log(`${qty}x ${getGood(goodId).name} verkauft für ${res.revenue} Gulden (-${fee} G Hafengebühr)${profitNote}.`);
    UI.renderAll();
    saveGame();
  }

  function handleBuildKontor(cityId) {
    const res = Kontor.buildKontor(cityId);
    if (res.ok) Ledger.record("kontorBuilds", res.cost);
    UI.log(res.ok ? `Kontor in ${getCity(cityId).name} ausgebaut (${res.cost} Gulden).` : res.reason);
    UI.renderAll();
    saveGame();
  }

  function handleStore(cityId, goodId, qty) {
    const ship = Fleet.playerShip();
    const actualQty = ship ? Math.min(qty, Fleet.cargoQty(ship, goodId)) : 0;
    if (actualQty <= 0) return UI.log("Nichts an Bord, das eingelagert werden könnte.");
    const res = Kontor.storeGood(cityId, goodId, actualQty);
    UI.log(res.ok ? `${actualQty}x ${getGood(goodId).name} im Kontor ${getCity(cityId).name} eingelagert.` : res.reason);
    UI.renderAll();
    saveGame();
  }

  function handleWithdraw(cityId, goodId, qty) {
    const stored = Kontor.storageOf(cityId)[goodId] || 0;
    const actualQty = Math.min(qty, stored);
    if (actualQty <= 0) return UI.log("Nichts im Lager, das ausgeladen werden könnte.");
    const res = Kontor.withdrawGood(cityId, goodId, actualQty);
    UI.log(res.ok ? `${actualQty}x ${getGood(goodId).name} aus dem Kontor geholt.` : res.reason);
    UI.renderAll();
    saveGame();
  }

  function handleBuyCannon() {
    const ship = Fleet.playerShip();
    if (!ship) return UI.log("Kein eigenes Schiff vorhanden.");
    const res = Kontor.buyCannon(ship);
    if (res.ok) Ledger.record("cannonPurchases", res.cost);
    UI.log(res.ok ? `Neue Kanone installiert (${res.cost} Gulden).` : res.reason);
    UI.renderAll();
    saveGame();
  }

  function handleBuyCannonForShip(shipId) {
    const ship = Fleet.getShip(shipId);
    if (!ship) return UI.log("Schiff nicht gefunden.");
    const res = Kontor.buyCannon(ship);
    if (res.ok) Ledger.record("cannonPurchases", res.cost);
    UI.log(res.ok ? `Neue Kanone für ${ship.name} installiert (${res.cost} Gulden).` : res.reason);
    UI.renderAll();
    saveGame();
  }

  function handleBuyShip(cityId) {
    const res = Fleet.buyShip(cityId);
    if (!res.ok) {
      UI.log(res.reason);
      return;
    }
    Ledger.record("shipPurchases", res.cost);
    UI.log(`${res.ship.name} (Kapitän ${res.ship.captain}) in ${getCity(cityId).name} in Dienst gestellt (${res.cost} Gulden).`);
    if (!res.ship.isPlayer) {
      npcArrive(res.ship); // erste Ladung einkaufen und sofort in See stechen
      scheduleTick();
    }
    UI.renderAll();
    saveGame();
  }

  function handleBuyInsurance(shipId) {
    const ship = Fleet.getShip(shipId);
    if (!ship) return UI.log("Schiff nicht gefunden.");
    const res = Fleet.buyInsurance(ship, day);
    if (res.ok) Ledger.record("insurancePremiums", res.cost);
    UI.log(res.ok ? `Rumpfversicherung für ${ship.name} abgeschlossen (${res.cost} Gulden, anteilig fürs laufende Jahr).` : res.reason);
    UI.renderAll();
    saveGame();
  }

  function handleBuyCargoInsurance(shipId) {
    const ship = Fleet.getShip(shipId);
    if (!ship) return UI.log("Schiff nicht gefunden.");
    const res = Fleet.buyCargoInsurance(ship, day);
    if (res.ok) Ledger.record("cargoInsurancePremiums", res.cost);
    UI.log(res.ok ? `Ladungsversicherung für ${ship.name} abgeschlossen (${res.cost} Gulden, anteilig fürs laufende Jahr).` : res.reason);
    UI.renderAll();
    saveGame();
  }

  function handleExpandCargoHold(shipId) {
    const ship = Fleet.getShip(shipId);
    if (!ship) return UI.log("Schiff nicht gefunden.");
    const res = Fleet.expandCargoHold(ship, day);
    if (!res.ok) {
      UI.log(res.reason);
      UI.renderAll();
      return;
    }
    Ledger.record("cargoExpansionPurchases", res.cost);
    if (res.hullSurcharge > 0) Ledger.record("insurancePremiums", res.hullSurcharge);
    if (res.cargoSurcharge > 0) Ledger.record("cargoInsurancePremiums", res.cargoSurcharge);
    const surcharge = res.hullSurcharge + res.cargoSurcharge;
    const surchargeNote = surcharge > 0 ? ` Versicherungsprämien anteilig um ${surcharge} Gulden erhöht.` : "";
    UI.log(`Laderaum von ${ship.name} auf ${res.newCapacity} erweitert (Stufe ${res.newLevel}/${CARGO_EXPANSION_MAX_LEVEL}, ${res.cost} Gulden).${surchargeNote}`);
    UI.renderAll();
    saveGame();
  }

  function handlePauseShip(shipId) {
    const ship = Fleet.getShip(shipId);
    if (!ship) return UI.log("Schiff nicht gefunden.");
    const wasSailing = ship.sailing;
    const previousCityId = ship.currentCityId;
    Fleet.setPaused(ship, true);
    UI.log(wasSailing
      ? `${ship.name}: Fahrt abgebrochen — kehrt nach ${getCity(previousCityId).name} zurück und bleibt dort pausiert liegen.`
      : `${ship.name}: Handel pausiert — bleibt im Hafen liegen, bis der Handel fortgesetzt wird.`);
    UI.renderAll();
    saveGame();
  }

  function handleResumeShip(shipId) {
    const ship = Fleet.getShip(shipId);
    if (!ship) return UI.log("Schiff nicht gefunden.");
    Fleet.setPaused(ship, false);
    UI.log(`${ship.name}: Handel fortgesetzt.`);
    if (!ship.sailing) {
      npcArrive(ship);
      scheduleTick();
    }
    UI.renderAll();
    saveGame();
  }

  function handleSellShip(shipId) {
    const ship = Fleet.getShip(shipId);
    if (!ship) return UI.log("Schiff nicht gefunden.");
    const res = Fleet.sellShip(ship);
    if (res.ok) {
      if (res.assetLoss > 0) Ledger.record("assetDisposalLosses", res.assetLoss);
      const loanNote = res.loanRepaid > 0 ? ` (nach Tilgung von ${Math.round(res.loanRepaid)} G Kredit)` : "";
      const capitalNote = res.capitalReturned > 0 ? ` inkl. ${Math.round(res.capitalReturned)} G Handelskapital` : "";
      const assetNote = res.assetLoss > 0 ? ` Der Buchwertverlust (${res.assetLoss} Gulden) wurde als Anlagenabgang verbucht.` : "";
      UI.log(`${ship.name} verkauft für ${res.netProceeds} Gulden${loanNote}${capitalNote}.${assetNote}`);
    } else {
      UI.log(res.reason);
    }
    UI.renderAll();
    saveGame();
  }

  function handleFundShip(shipId, amount) {
    const ship = Fleet.getShip(shipId);
    if (!ship) return UI.log("Schiff nicht gefunden.");
    const res = Fleet.fundShip(ship, amount);
    UI.log(res.ok ? `${res.amount} Gulden Handelskapital an ${ship.name} übertragen.` : res.reason);
    UI.renderAll();
    saveGame();
  }

  function handleWithdrawShipCapital(shipId, amount) {
    const ship = Fleet.getShip(shipId);
    if (!ship) return UI.log("Schiff nicht gefunden.");
    const res = Fleet.withdrawShipCapital(ship, amount);
    UI.log(res.ok ? `${res.amount} Gulden Handelskapital von ${ship.name} aufs Konto übertragen.` : res.reason);
    UI.renderAll();
    saveGame();
  }

  function handleBorrowKontor(cityId, amount) {
    const res = Kontor.borrowAgainstKontor(cityId, amount);
    UI.log(res.ok ? `Kredit über ${res.amount} Gulden gegen das Kontor in ${getCity(cityId).name} aufgenommen.` : res.reason);
    UI.renderAll();
    saveGame();
  }

  function handleRepayKontor(cityId, amount) {
    const res = Kontor.repayKontorLoan(cityId, amount);
    UI.log(res.ok ? `${res.amount} Gulden Kontor-Kredit in ${getCity(cityId).name} getilgt.` : res.reason);
    UI.renderAll();
    saveGame();
  }

  function handleBorrowShip(shipId, amount) {
    const ship = Fleet.getShip(shipId);
    if (!ship) return UI.log("Schiff nicht gefunden.");
    const res = Fleet.borrowAgainstShip(ship, amount);
    UI.log(res.ok ? `Kredit über ${res.amount} Gulden gegen ${ship.name} aufgenommen.` : res.reason);
    UI.renderAll();
    saveGame();
  }

  function handleRepayShip(shipId, amount) {
    const ship = Fleet.getShip(shipId);
    if (!ship) return UI.log("Schiff nicht gefunden.");
    const res = Fleet.repayShipLoan(ship, amount);
    UI.log(res.ok ? `${res.amount} Gulden Kredit auf ${ship.name} getilgt.` : res.reason);
    UI.renderAll();
    saveGame();
  }

  function handleBuyLand(cityId) {
    const res = Kontor.buyLand(cityId);
    if (res.ok) {
      Ledger.record("landPurchases", res.cost);
      UI.log(
        `Grundstück in ${getCity(cityId).name} erworben (${res.cost} G) — ` +
        `${res.newPlots} Parzelle${res.newPlots !== 1 ? "n" : ""}, ${res.newPlots} Produktionsslot${res.newPlots !== 1 ? "s" : ""}.`
      );
    } else {
      UI.log(res.reason);
    }
    UI.renderAll();
    saveGame();
  }

  function handleStartProduction(cityId, goodId) {
    const res = Kontor.startProduction(cityId, goodId, day);
    if (res.ok) {
      Ledger.record("productionCosts", res.recipe.goldCost);
      // Vorprodukt-Materialeinsatz: die Waren wurden bereits beim Einkauf als tradeCost
      // gebucht; ihr Verschwinden aus dem Warenbestand reduziert die Inventarseite der
      // GuV automatisch. Kein separater Ledger-Eintrag nötig — nur Hinweis im Log.
      const inputNote = res.inputCost > 0
        ? ` · Materialeinsatz: ${res.inputCost} G (Vorprodukte aus Lager)`
        : "";
      UI.log(
        `Produktion gestartet: ${getGood(goodId).name} in ${getCity(cityId).name}` +
        ` (${res.recipe.goldCost} G · ${res.recipe.days} Tage · fertig Tag ${res.endDay}${inputNote}).`
      );
    } else {
      UI.log(res.reason);
    }
    UI.renderAll();
    saveGame();
  }

  function handlePayRansom(ransomId) {
    const res = Fleet.payRansom(ransomId);
    if (res.ok) Ledger.record("ransoms", res.ransom.amount);
    UI.log(res.ok ? `Lösegeld für ${res.ransom.shipName} bezahlt — die Crew ist frei.` : res.reason);
    UI.renderAll();
    saveGame();
  }

  function handlePirateChoice(choice) {
    const ship = Fleet.playerShip();
    const result = choice === "fight" ? Pirates.resolveFight(ship, day) : Pirates.resolveFlee(ship, day);
    UI.log(result.message);

    // Sieg mit Kapern-Angebot: Modal bleibt offen und wechselt in den Kapern-Modus.
    // Tick-Fortsetzung (pendingPirateResolve) bleibt bis zur Kapernentscheidung hängen.
    if (result.captureOffer) {
      pendingCaptureOffer = result.captureOffer;
      UI.showCaptureModal(result.captureOffer);
      return;
    }

    UI.hidePirateModal();
    if (result.destroyed) {
      UI.hideTravelOverlay();
    }
    UI.renderAll();
    saveGame();
    if (pendingPirateResolve) {
      const fn = pendingPirateResolve;
      pendingPirateResolve = null;
      fn();
    }
  }

  // Verarbeitet die Kapernentscheidung nach einem Seesieg.
  // "capture" → Schiff in die Flotte aufnehmen + weniger Gold.
  // "plunder" → Mehr Gold, Schiff versenkt.
  function handleCaptureChoice(choice) {
    const offer = pendingCaptureOffer;
    pendingCaptureOffer = null;
    if (!offer) { UI.hidePirateModal(); return; }

    const player = Fleet.playerShip();
    // Das erbeutete Schiff erscheint am Zielhafen (noch unterwegs) oder am aktuellen Hafen.
    const landingCityId = player && player.sailing
      ? player.destinationCityId
      : (player ? player.currentCityId : HOME_CITY_ID);

    if (choice === "capture") {
      const res = Fleet.captureShip(offer, landingCityId);
      const gold = offer.boardingGold;
      Fleet.addGold(gold);
      Ledger.record("pirateLoot", gold);
      // HGB-Zugangsbuchung: Prise wird zum beizulegenden Zeitwert aktiviert; gleicher Betrag
      // als Ertrag "Ertraege aus Schiffszugaengen (Prisen)" — Bilanz und GuV bleiben ausgeglichen.
      Ledger.record("shipCaptures", res.captureValue);
      UI.log(
        `⚓ ${res.ship.name} (Kapitän ${res.ship.captain}) in die Flotte aufgenommen — ` +
        `${offer.masts} Mast${offer.masts !== 1 ? "en" : ""}, ${offer.cannons} Kanone${offer.cannons !== 1 ? "n" : ""}, ${offer.capacity} Laderaum. ` +
        `Buchwert: ${res.captureValue} G · Wartet pausiert in ${getCity(landingCityId).name}. Erbeutet: ${gold} Gulden.`
      );
    } else {
      const gold = offer.plunderGold;
      Fleet.addGold(gold);
      Ledger.record("pirateLoot", gold);
      UI.log(`💰 ${offer.name} geplündert und versenkt. Erbeutet: ${gold} Gulden.`);
    }

    UI.hidePirateModal();
    UI.renderAll();
    saveGame();
    if (pendingPirateResolve) {
      const fn = pendingPirateResolve;
      pendingPirateResolve = null;
      fn();
    }
  }

  function renderLoop() {
    try {
      GameMap.render();
    } catch (e) {
      console.error("Fehler beim Kartenrendern:", e);
    }
    requestAnimationFrame(renderLoop);
  }

  function init() {
    Fleet.init();
    Market.init();
    Kontor.init();
    Ledger.init();
    day = 1;
    loadGame();

    GameMap.init(document.getElementById("map-canvas"));
    UI.init();

    GameMap.onCityClick(handleCityClick);
    UI.on("buy", handleBuy);
    UI.on("sell", handleSell);
    UI.on("buildKontor", handleBuildKontor);
    UI.on("store", handleStore);
    UI.on("withdraw", handleWithdraw);
    UI.on("buyCannon", handleBuyCannon);
    UI.on("buyCannonForShip", handleBuyCannonForShip);
    UI.on("buyShip", handleBuyShip);
    UI.on("buyInsurance", handleBuyInsurance);
    UI.on("buyCargoInsurance", handleBuyCargoInsurance);
    UI.on("expandCargoHold", handleExpandCargoHold);
    UI.on("pauseShip", handlePauseShip);
    UI.on("resumeShip", handleResumeShip);
    UI.on("sellShip", handleSellShip);
    UI.on("fundShip", handleFundShip);
    UI.on("withdrawShipCapital", handleWithdrawShipCapital);
    UI.on("borrowKontor", handleBorrowKontor);
    UI.on("repayKontor", handleRepayKontor);
    UI.on("borrowShip", handleBorrowShip);
    UI.on("repayShip", handleRepayShip);
    UI.on("payRansom", handlePayRansom);
    UI.on("buyLand", handleBuyLand);
    UI.on("startProduction", handleStartProduction);
    UI.on("pirateChoice", handlePirateChoice);
    UI.on("captureChoice", handleCaptureChoice);
    UI.on("saveNow", handleSaveNow);
    UI.on("exportSave", handleExportSave);
    UI.on("importSave", handleImportSave);
    UI.on("newGame", handleNewGame);

    UI.log("Willkommen an Bord! Die Reise durch die Hanse beginnt in Lübeck.");
    UI.renderAll();
    resumeIfSailing();
    renderLoop();
  }

  return { init, currentDay };
})();

document.addEventListener("DOMContentLoaded", Game.init);
