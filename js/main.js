// Spielzustand, Game-Loop, Verkabelung der Module

const Game = (() => {
  const SAIL_STEP_MS = 350;
  const SAVE_KEY = "hansespiel-save";

  let day = 1;
  let pendingPirateResolve = null;
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
      dayTick();
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

  function resumeIfSailing() {
    const player = Fleet.playerShip();
    if (player && player.sailing) {
      UI.showTravelOverlay(getCity(player.destinationCityId).name);
      UI.updateTravelBar(Fleet.progressRatio(player));
    }
    if (anySailing()) {
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
        Fleet.addGold(res.revenue - fee);
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
    const maxByBudget = Math.floor((Fleet.gold() * 0.5) / price);
    const maxByCargo = Fleet.cargoFree(ship);
    const maxByStock = Market.availableStock(ship.currentCityId, goodId);
    const qty = Math.max(0, Math.min(maxByBudget, maxByCargo, maxByStock));
    if (qty <= 0) return 0;
    const res = Market.buy(ship.currentCityId, goodId, qty);
    if (!res.ok) return 0;
    const fee = Math.round(res.cost * HARBOR_FEE_RATE);
    Fleet.addGold(-res.cost - fee);
    Fleet.addCargo(ship, goodId, qty, res.cost / qty);
    Ledger.record("tradeCost", res.cost);
    Ledger.record("harborFees", fee);
    return qty;
  }

  function npcPickDestination(ship, boughtGoodId) {
    const others = CITIES.filter((c) => c.id !== ship.currentCityId);
    if (boughtGoodId) {
      const matches = others.filter((c) => c.imports.includes(boughtGoodId));
      if (matches.length > 0) return matches[Math.floor(Math.random() * matches.length)].id;
    }
    return others[Math.floor(Math.random() * others.length)].id;
  }

  function npcArrive(ship) {
    const revenue = npcSellAll(ship);
    if (revenue > 0) {
      UI.log(`${ship.name} verkauft Ladung in ${getCity(ship.currentCityId).name} für ${revenue} Gulden.`);
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
    if (!anySailing()) return;
    Market.tick();
    day += 1;

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
          UI.showPirateModal("Ein fremdes Segel nähert sich schnell! Was tut Ihr?");
          pendingPirateResolve = () => {
            scheduleTick();
          };
          return;
        }
        const result = Pirates.resolveFlee(ship, day);
        UI.log(`${ship.name}: ${result.message}`);
      }
    }

    Fleet.allShips().forEach((ship) => {
      if (ship.isPlayer) return;
      const wage = Math.round(WAGE_BASE + WAGE_STRENGTH_RATE * shipStrength(ship) + WAGE_CARGO_RATE * Fleet.cargoValue(ship));
      Fleet.addGold(-wage);
      Ledger.record("wages", wage);
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
        UI.log(`Versicherung für ${ship.name} um ein Jahr verlängert (${renewal.cost} Gulden).`);
      } else {
        UI.log(`Versicherungsschutz für ${ship.name} erloschen — nicht genug Gold zur Verlängerung.`);
      }
    });

    Fleet.expireRansoms(day).forEach((ransom) => {
      UI.log(`Die Lösegeldfrist für ${ransom.shipName} ist abgelaufen — die Crew ist verloren.`);
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

    if (anySailing()) {
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
    const res = Kontor.buyCannon();
    if (res.ok) Ledger.record("cannonPurchases", res.cost);
    UI.log(res.ok ? `Neue Kanone installiert (${res.cost} Gulden).` : res.reason);
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
    UI.log(res.ok ? `Versicherung für ${ship.name} abgeschlossen (${res.cost} Gulden, anteilig fürs laufende Jahr).` : res.reason);
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
    UI.on("buyShip", handleBuyShip);
    UI.on("buyInsurance", handleBuyInsurance);
    UI.on("borrowKontor", handleBorrowKontor);
    UI.on("repayKontor", handleRepayKontor);
    UI.on("borrowShip", handleBorrowShip);
    UI.on("repayShip", handleRepayShip);
    UI.on("payRansom", handlePayRansom);
    UI.on("pirateChoice", handlePirateChoice);
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
