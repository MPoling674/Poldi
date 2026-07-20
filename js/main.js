// Spielzustand, Game-Loop, Verkabelung der Module

const Game = (() => {
  const SAIL_STEP_MS = 350;
  const SAVE_KEY = "hansespiel-save";

  let day = 1;
  let pendingPirateResolve = null;

  function currentDay() {
    return day;
  }

  function buildPayload() {
    return {
      day,
      ship: Ship.serialize(),
      market: Market.serialize(),
      kontor: Kontor.serialize(),
    };
  }

  function saveGame() {
    localStorage.setItem(SAVE_KEY, JSON.stringify(buildPayload()));
  }

  function applyPayload(payload) {
    if (!payload || !payload.ship || !payload.market || !payload.kontor || typeof payload.day !== "number") {
      throw new Error("Ungültiges Spielstand-Format.");
    }
    day = payload.day;
    Ship.restore(payload.ship);
    Market.restore(payload.market);
    Kontor.restore(payload.kontor);
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

  function resumeIfSailing() {
    if (!Ship.get().sailing) return;
    UI.showTravelOverlay(getCity(Ship.get().destinationCityId).name);
    UI.updateTravelBar(Ship.progressRatio());
    setTimeout(sailStep, SAIL_STEP_MS);
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
    if (Ship.get().sailing) {
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
    Ship.init();
    Market.init();
    Kontor.init();
    UI.renderAll();
    UI.setSaveStatus("Neues Spiel gestartet.");
    UI.log("Ein neues Spiel beginnt in Lübeck.");
  }

  function sailStep() {
    if (!Ship.get().sailing) return;
    Market.tick();
    day += 1;
    const result = Ship.advanceDay();
    UI.updateTravelBar(Ship.progressRatio());
    UI.renderHUD();

    if (result.arrived) {
      UI.hideTravelOverlay();
      UI.log(`Das Schiff hat ${getCity(Ship.get().currentCityId).name} erreicht.`);
      UI.renderAll();
      saveGame();
      return;
    }

    if (Pirates.rollEncounter()) {
      UI.showPirateModal("Ein fremdes Segel nähert sich schnell! Was tut Ihr?");
      pendingPirateResolve = () => {
        setTimeout(sailStep, SAIL_STEP_MS);
      };
      return;
    }

    setTimeout(sailStep, SAIL_STEP_MS);
  }

  function handleCityClick(cityId) {
    const ship = Ship.get();
    if (ship.sailing) {
      UI.log("Das Schiff ist bereits auf See.");
      return;
    }
    const res = Ship.startVoyage(cityId);
    if (!res.ok) {
      UI.log(res.reason);
      return;
    }
    UI.log(`Das Schiff sticht in See, Ziel: ${getCity(cityId).name} (${res.totalDays} Tage Fahrt).`);
    UI.showTravelOverlay(getCity(cityId).name);
    UI.updateTravelBar(0);
    UI.renderAll();
    setTimeout(sailStep, SAIL_STEP_MS);
  }

  function handleBuy(goodId, qty) {
    const ship = Ship.get();
    if (ship.sailing) return UI.log("Handel ist nur im Hafen möglich.");
    if (qty > Ship.cargoFree()) return UI.log("Nicht genug Frachtraum an Bord.");
    const estCost = Math.round(Market.buyPrice(ship.currentCityId, goodId) * qty);
    if (ship.gold < estCost) return UI.log("Nicht genug Gold für diesen Kauf.");
    const res = Market.buy(ship.currentCityId, goodId, qty);
    if (!res.ok) return UI.log(res.reason);
    ship.gold -= res.cost;
    Ship.addCargo(goodId, qty);
    UI.log(`${qty}x ${getGood(goodId).name} gekauft für ${res.cost} Gulden.`);
    UI.renderAll();
    saveGame();
  }

  function handleSell(goodId, qty) {
    const ship = Ship.get();
    if (ship.sailing) return UI.log("Handel ist nur im Hafen möglich.");
    if (Ship.cargoQty(goodId) < qty) return UI.log("Nicht genug Ware an Bord.");
    const res = Market.sell(ship.currentCityId, goodId, qty);
    if (!res.ok) return UI.log(res.reason);
    ship.gold += res.revenue;
    Ship.removeCargo(goodId, qty);
    UI.log(`${qty}x ${getGood(goodId).name} verkauft für ${res.revenue} Gulden.`);
    UI.renderAll();
    saveGame();
  }

  function handleBuildKontor(cityId) {
    const res = Kontor.buildKontor(cityId);
    UI.log(res.ok ? `Kontor in ${getCity(cityId).name} ausgebaut (${res.cost} Gulden).` : res.reason);
    UI.renderAll();
    saveGame();
  }

  function handleStore(cityId, goodId, qty) {
    const actualQty = Math.min(qty, Ship.cargoQty(goodId));
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
    UI.log(res.ok ? `Neue Kanone installiert (${res.cost} Gulden).` : res.reason);
    UI.renderAll();
    saveGame();
  }

  function handlePirateChoice(choice) {
    const result = choice === "fight" ? Pirates.resolveFight() : Pirates.resolveFlee();
    UI.log(result.message);
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
    GameMap.render();
    requestAnimationFrame(renderLoop);
  }

  function init() {
    Ship.init();
    Market.init();
    Kontor.init();
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
