// DOM-Verdrahtung: HUD, Markt-Tabelle, Kontor-Panel, Event-Log, Modals

const UI = (() => {
  const el = {};
  const callbacks = {};

  function init() {
    el.hudDate = document.getElementById("hud-date");
    el.hudGold = document.getElementById("hud-gold");
    el.hudShipStatus = document.getElementById("hud-ship-status");
    el.hudCargo = document.getElementById("hud-cargo");
    el.hudNetworth = document.getElementById("hud-networth");

    el.cargoBarItems = document.getElementById("cargo-bar-items");

    el.marketCityName = document.getElementById("market-city-name");
    el.marketTbody = document.getElementById("market-tbody");
    el.marketHint = document.getElementById("market-hint");

    el.kontorInfo = document.getElementById("kontor-info");

    el.fleetShips = document.getElementById("fleet-ships");
    el.fleetBuy = document.getElementById("fleet-buy");
    el.fleetRansoms = document.getElementById("fleet-ransoms");

    el.bilanzInfo = document.getElementById("bilanz-info");

    el.eventLog = document.getElementById("event-log");
    el.toastContainer = document.getElementById("toast-container");

    el.pirateModal = document.getElementById("pirate-modal");
    el.pirateText = document.getElementById("pirate-text");
    el.pirateFightBtn = document.getElementById("pirate-fight");
    el.pirateFleeBtn = document.getElementById("pirate-flee");

    el.travelOverlay = document.getElementById("travel-overlay");
    el.travelText = document.getElementById("travel-text");
    el.travelBarFill = document.getElementById("travel-bar-fill");

    el.saveStatus = document.getElementById("save-status");
    el.saveNowBtn = document.getElementById("save-now-btn");
    el.saveExportBtn = document.getElementById("save-export-btn");
    el.saveImportBtn = document.getElementById("save-import-btn");
    el.saveImportInput = document.getElementById("save-import-input");
    el.newGameBtn = document.getElementById("new-game-btn");

    el.saveNowBtn.addEventListener("click", () => callbacks.saveNow && callbacks.saveNow());
    el.saveExportBtn.addEventListener("click", () => callbacks.exportSave && callbacks.exportSave());
    el.saveImportBtn.addEventListener("click", () => el.saveImportInput.click());
    el.saveImportInput.addEventListener("change", () => {
      const file = el.saveImportInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => callbacks.importSave && callbacks.importSave(reader.result);
      reader.readAsText(file);
      el.saveImportInput.value = "";
    });
    el.newGameBtn.addEventListener("click", () => callbacks.newGame && callbacks.newGame());

    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
        document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
      });
    });

    el.pirateFightBtn.addEventListener("click", () => callbacks.pirateChoice && callbacks.pirateChoice("fight"));
    el.pirateFleeBtn.addEventListener("click", () => callbacks.pirateChoice && callbacks.pirateChoice("flee"));
  }

  function on(name, cb) {
    callbacks[name] = cb;
  }

  function renderHUD() {
    const ship = Fleet.playerShip();
    el.hudDate.textContent = "Tag " + Game.currentDay();
    el.hudGold.textContent = Fleet.gold() + " G";
    el.hudShipStatus.textContent = !ship
      ? "kein eigenes Schiff"
      : ship.sailing
      ? `unterwegs nach ${getCity(ship.destinationCityId).name} (${ship.progressDays}/${ship.totalDays} Tage)`
      : `vor Anker in ${getCity(ship.currentCityId).name}`;
    el.hudCargo.textContent = ship ? `${Fleet.cargoUsed(ship)}/${ship.cargoCapacity}` : "—";
    el.hudNetworth.textContent = Fleet.networth() + " G";
  }

  function renderCargoBar() {
    const ship = Fleet.playerShip();
    if (!ship) {
      el.cargoBarItems.innerHTML = '<span class="cargo-empty">Kein eigenes Schiff im Dienst</span>';
      return;
    }
    const goodIds = Object.keys(ship.cargo).filter((id) => ship.cargo[id] > 0);
    if (goodIds.length === 0) {
      el.cargoBarItems.innerHTML = '<span class="cargo-empty">Kein Frachtgut an Bord</span>';
      return;
    }
    el.cargoBarItems.innerHTML = goodIds
      .map((goodId) => {
        const avgCost = Fleet.avgCost(ship, goodId);
        const costLabel = avgCost !== null ? ` <span class="cost-note">(Ø ${avgCost.toFixed(1)} G)</span>` : "";
        return `<span class="cargo-chip">${getGood(goodId).name} <b>${ship.cargo[goodId]}</b>${costLabel}</span>`;
      })
      .join("");
  }

  function renderMarket() {
    const ship = Fleet.playerShip();
    if (!ship) {
      el.marketCityName.textContent = "-";
      el.marketTbody.innerHTML = "";
      el.marketHint.textContent = "Kein eigenes Schiff — kaufe eines in einer Stadt mit Kontor (Tab \"Flotte\").";
      return;
    }
    if (ship.sailing) {
      el.marketCityName.textContent = "Auf hoher See";
      el.marketTbody.innerHTML = "";
      el.marketHint.textContent = "Kein Handel möglich, solange das Schiff unterwegs ist.";
      return;
    }
    const city = getCity(ship.currentCityId);
    el.marketCityName.textContent = city.name;
    el.marketHint.textContent = `Frachtraum frei: ${Fleet.cargoFree(ship)} / ${ship.cargoCapacity}`;
    el.marketTbody.innerHTML = "";
    GOODS.forEach((good) => {
      const entry = Market.getEntry(city.id, good.id);
      const cargoQty = Fleet.cargoQty(ship, good.id);

      const buyPrice = Market.buyPrice(city.id, good.id);
      const maxAffordable = Math.floor(Fleet.gold() / buyPrice);
      const buyDefault = Math.max(0, Math.min(10, maxAffordable, Fleet.cargoFree(ship), Market.availableStock(city.id, good.id)));
      const sellDefault = Math.min(cargoQty, 10);

      const boughtAt = Fleet.avgCost(ship, good.id);
      let sellCell = `${Market.sellPrice(city.id, good.id).toFixed(1)} G`;
      if (cargoQty > 0 && boughtAt !== null) {
        sellCell += `<br><span class="cost-note">Ø gekauft ${boughtAt.toFixed(1)} G</span>`;
      }

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${good.name}</td>
        <td>${Market.availableStock(city.id, good.id)}</td>
        <td>${buyPrice.toFixed(1)} G</td>
        <td>
          <div class="trade-action">
            <input type="number" min="0" value="${buyDefault}" data-good="${good.id}" class="qty-input-buy">
            <button class="trade-btn" data-action="buy" data-good="${good.id}">Kaufen</button>
          </div>
        </td>
        <td>${sellCell}</td>
        <td>
          <div class="trade-action">
            <input type="number" min="0" value="${sellDefault}" data-good="${good.id}" class="qty-input-sell">
            <button class="trade-btn" data-action="sell" data-good="${good.id}">Verkaufen</button>
          </div>
        </td>
      `;
      el.marketTbody.appendChild(tr);
    });

    el.marketTbody.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const goodId = btn.dataset.good;
        const action = btn.dataset.action;
        const inputClass = action === "buy" ? "qty-input-buy" : "qty-input-sell";
        const input = el.marketTbody.querySelector(`.${inputClass}[data-good="${goodId}"]`);
        const qty = Math.max(1, parseInt(input.value, 10) || 1);
        if (action === "buy" && callbacks.buy) callbacks.buy(goodId, qty);
        if (action === "sell" && callbacks.sell) callbacks.sell(goodId, qty);
      });
    });
  }

  function renderKontor() {
    const ship = Fleet.playerShip();
    const dockedCityId = ship && !ship.sailing ? ship.currentCityId : null;
    let html = "";

    if (ship) {
      html += `<div class="kontor-city"><span>Kanonen an Bord: ${ship.cannons}</span>
        <button data-action="cannon" ${ship.cannons >= 6 ? "disabled" : ""}>
          Aufrüsten (${Kontor.cannonCost()} G)
        </button></div>`;
    }

    CITIES.forEach((city) => {
      const lvl = Kontor.level(city.id);
      const isDocked = city.id === dockedCityId;
      html += `<div class="kontor-city">
        <span>${city.name} — Kontor Stufe ${lvl}/3 (Lager ${Kontor.storageUsed(city.id)}/${Kontor.capacity(city.id)})</span>
        <button data-action="build" data-city="${city.id}" ${!isDocked || lvl >= 3 ? "disabled" : ""}>
          ${lvl >= 3 ? "Max." : "Bauen (" + Kontor.buildCost(city.id) + " G)"}
        </button>
      </div>`;
      if (isDocked && lvl > 0) {
        const storage = Kontor.storageOf(city.id);
        Object.keys(storage).forEach((goodId) => {
          if (storage[goodId] <= 0) return;
          html += `<div class="kontor-city">
            <span>${getGood(goodId).name} im Lager: ${storage[goodId]}</span>
            <button data-action="withdraw" data-city="${city.id}" data-good="${goodId}">Ausladen (10)</button>
          </div>`;
        });
        if (Object.keys(ship.cargo).length > 0) {
          Object.keys(ship.cargo).forEach((goodId) => {
            html += `<div class="kontor-city">
              <span>${getGood(goodId).name} an Bord: ${ship.cargo[goodId]}</span>
              <button data-action="store" data-city="${city.id}" data-good="${goodId}">Einlagern (10)</button>
            </div>`;
          });
        }
      }
    });

    el.kontorInfo.innerHTML = html;
    el.kontorInfo.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.action;
        if (action === "cannon" && callbacks.buyCannon) callbacks.buyCannon();
        if (action === "build" && callbacks.buildKontor) callbacks.buildKontor(btn.dataset.city);
        if (action === "store" && callbacks.store) callbacks.store(btn.dataset.city, btn.dataset.good, 10);
        if (action === "withdraw" && callbacks.withdraw) callbacks.withdraw(btn.dataset.city, btn.dataset.good, 10);
      });
    });
  }

  function shipStatusLine(ship) {
    if (ship.sailing) {
      return `unterwegs nach ${getCity(ship.destinationCityId).name} (${ship.progressDays}/${ship.totalDays} Tage)`;
    }
    return `vor Anker in ${getCity(ship.currentCityId).name}`;
  }

  function insuranceStatusLine(ship) {
    if (ship.insurance && ship.insurance.active) {
      return `Versichert (Verlängerung Tag ${ship.insurance.dueDay})`;
    }
    return `Unversichert`;
  }

  function renderFleet() {
    let html = "";
    Fleet.allShips().forEach((ship) => {
      const cargoUsed = Fleet.cargoUsed(ship);
      const wageLine = ship.isPlayer
        ? ""
        : ` · Heuer/Tag ~${Math.round(WAGE_BASE + WAGE_STRENGTH_RATE * shipStrength(ship) + WAGE_CARGO_RATE * Fleet.cargoValue(ship))} G`;
      const insured = ship.insurance && ship.insurance.active;
      const insuranceCost = Fleet.insuranceCost(Game.currentDay());
      html += `<div class="kontor-city">
        <span><b>${ship.name}</b> (Kapitän: ${ship.isPlayer ? "Du" : ship.captain})<br>
        ${shipStatusLine(ship)} · Ladung ${cargoUsed}/${ship.cargoCapacity}${wageLine}<br>
        ${insuranceStatusLine(ship)}</span>
        ${insured ? "" : `<button data-insure="${ship.id}" ${Fleet.gold() < insuranceCost ? "disabled" : ""}>Versichern (${insuranceCost} G)</button>`}
      </div>`;
    });
    if (Fleet.allShips().length === 0) {
      html += `<p class="hint">Keine Schiffe mehr im Dienst.</p>`;
    }
    el.fleetShips.innerHTML = html;
    el.fleetShips.querySelectorAll("button[data-insure]").forEach((btn) => {
      btn.addEventListener("click", () => callbacks.buyInsurance && callbacks.buyInsurance(Number(btn.dataset.insure)));
    });

    const kontorCities = CITIES.filter((c) => Kontor.level(c.id) > 0);
    let buyHtml = "";
    if (kontorCities.length === 0) {
      buyHtml = `<p class="hint">Noch kein Kontor gebaut — dort entstehen künftige Werften.</p>`;
    } else {
      const cost = Fleet.shipCost();
      kontorCities.forEach((city) => {
        buyHtml += `<div class="kontor-city">
          <span>${city.name} (Kontor Stufe ${Kontor.level(city.id)})</span>
          <button data-city="${city.id}" ${Fleet.gold() < cost ? "disabled" : ""}>Kaufen (${cost} G)</button>
        </div>`;
      });
    }
    el.fleetBuy.innerHTML = buyHtml;
    el.fleetBuy.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => callbacks.buyShip && callbacks.buyShip(btn.dataset.city));
    });

    const ransoms = Fleet.ransoms();
    let ransomHtml = "";
    if (ransoms.length === 0) {
      ransomHtml = `<p class="hint">Keine offenen Forderungen.</p>`;
    } else {
      ransoms.forEach((r) => {
        ransomHtml += `<div class="kontor-city">
          <span>${r.shipName} (Kapitän ${r.captain}) — fällig bis Tag ${r.deadlineDay}</span>
          <button data-ransom="${r.id}" ${Fleet.gold() < r.amount ? "disabled" : ""}>Lösegeld zahlen (${r.amount} G)</button>
        </div>`;
      });
    }
    el.fleetRansoms.innerHTML = ransomHtml;
    el.fleetRansoms.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => callbacks.payRansom && callbacks.payRansom(Number(btn.dataset.ransom)));
    });
  }

  function log(message) {
    const li = document.createElement("li");
    li.textContent = `Tag ${Game.currentDay()}: ${message}`;
    el.eventLog.insertBefore(li, el.eventLog.firstChild);
    while (el.eventLog.children.length > 60) el.eventLog.removeChild(el.eventLog.lastChild);

    showToast(message);
  }

  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    el.toastContainer.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("toast-visible"));
    setTimeout(() => {
      toast.classList.remove("toast-visible");
      setTimeout(() => toast.remove(), 250);
    }, 2000);
  }

  function showPirateModal(text) {
    el.pirateText.textContent = text;
    el.pirateModal.classList.remove("hidden");
  }

  function hidePirateModal() {
    el.pirateModal.classList.add("hidden");
  }

  function showTravelOverlay(destName) {
    el.travelText.textContent = `Unterwegs nach ${destName}...`;
    el.travelOverlay.classList.remove("hidden");
  }

  function updateTravelBar(ratio) {
    el.travelBarFill.style.width = Math.round(ratio * 100) + "%";
  }

  function hideTravelOverlay() {
    el.travelOverlay.classList.add("hidden");
  }

  function setSaveStatus(message) {
    el.saveStatus.textContent = message;
  }

  const LEDGER_LABELS = {
    tradeRevenue: "Handelserlöse",
    tradeCost: "Wareneinkauf",
    harborFees: "Hafengebühren",
    wages: "Heuer",
    kontorUpkeep: "Kontor-Unterhalt",
    insurancePremiums: "Versicherungsprämien",
    ransoms: "Lösegeld",
    shipPurchases: "Schiffskäufe",
    kontorBuilds: "Kontor-Baukosten",
    cannonPurchases: "Kanonenkäufe",
    pirateLosses: "Piratenverluste",
  };
  const LEDGER_INCOME_CATEGORIES = ["tradeRevenue"];
  const LEDGER_EXPENSE_CATEGORIES = [
    "tradeCost", "harborFees", "wages", "kontorUpkeep", "insurancePremiums",
    "ransoms", "shipPurchases", "kontorBuilds", "cannonPurchases", "pirateLosses",
  ];

  function renderBilanz() {
    const summary = Ledger.summary();
    let totalIncome = 0;
    let totalExpense = 0;

    let html = "<h3>Erträge</h3>";
    LEDGER_INCOME_CATEGORIES.forEach((cat) => {
      const amount = Math.round(summary[cat] || 0);
      totalIncome += amount;
      html += `<div class="tooltip-row"><span>${LEDGER_LABELS[cat]}</span><span>${amount} G</span></div>`;
    });

    html += "<h3>Aufwendungen</h3>";
    LEDGER_EXPENSE_CATEGORIES.forEach((cat) => {
      const amount = Math.round(summary[cat] || 0);
      totalExpense += amount;
      html += `<div class="tooltip-row"><span>${LEDGER_LABELS[cat]}</span><span>${amount} G</span></div>`;
    });

    const saldo = totalIncome - totalExpense;
    html += `<h3>Saldo</h3><div class="tooltip-row"><span>${saldo >= 0 ? "Gewinn" : "Verlust"} seit Spielbeginn</span><span>${saldo} G</span></div>`;
    el.bilanzInfo.innerHTML = html;
  }

  function renderAll() {
    renderHUD();
    renderCargoBar();
    renderMarket();
    renderKontor();
    renderFleet();
    renderBilanz();
  }

  return {
    init,
    on,
    renderHUD,
    renderMarket,
    renderKontor,
    renderAll,
    log,
    showPirateModal,
    hidePirateModal,
    showTravelOverlay,
    updateTravelBar,
    hideTravelOverlay,
    setSaveStatus,
  };
})();
