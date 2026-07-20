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

    el.eventLog = document.getElementById("event-log");

    el.pirateModal = document.getElementById("pirate-modal");
    el.pirateText = document.getElementById("pirate-text");
    el.pirateFightBtn = document.getElementById("pirate-fight");
    el.pirateFleeBtn = document.getElementById("pirate-flee");

    el.travelOverlay = document.getElementById("travel-overlay");
    el.travelText = document.getElementById("travel-text");
    el.travelBarFill = document.getElementById("travel-bar-fill");

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
    const ship = Ship.get();
    el.hudDate.textContent = "Tag " + Game.currentDay();
    el.hudGold.textContent = ship.gold + " G";
    el.hudShipStatus.textContent = ship.sailing
      ? `unterwegs nach ${getCity(ship.destinationCityId).name} (${ship.progressDays}/${ship.totalDays} Tage)`
      : `vor Anker in ${getCity(ship.currentCityId).name}`;
    el.hudCargo.textContent = `${Ship.cargoUsed()}/${ship.cargoCapacity}`;
    el.hudNetworth.textContent = Ship.networth() + " G";
  }

  function renderCargoBar() {
    const ship = Ship.get();
    const goodIds = Object.keys(ship.cargo).filter((id) => ship.cargo[id] > 0);
    if (goodIds.length === 0) {
      el.cargoBarItems.innerHTML = '<span class="cargo-empty">Kein Frachtgut an Bord</span>';
      return;
    }
    el.cargoBarItems.innerHTML = goodIds
      .map((goodId) => `<span class="cargo-chip">${getGood(goodId).name} <b>${ship.cargo[goodId]}</b></span>`)
      .join("");
  }

  function renderMarket() {
    const ship = Ship.get();
    if (ship.sailing) {
      el.marketCityName.textContent = "Auf hoher See";
      el.marketTbody.innerHTML = "";
      el.marketHint.textContent = "Kein Handel möglich, solange das Schiff unterwegs ist.";
      return;
    }
    const city = getCity(ship.currentCityId);
    el.marketCityName.textContent = city.name;
    el.marketHint.textContent = `Frachtraum frei: ${Ship.cargoFree()} / ${ship.cargoCapacity}`;
    el.marketTbody.innerHTML = "";
    GOODS.forEach((good) => {
      const entry = Market.getEntry(city.id, good.id);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${good.name}</td>
        <td>${Market.buyPrice(city.id, good.id).toFixed(1)} G</td>
        <td>${Market.sellPrice(city.id, good.id).toFixed(1)} G</td>
        <td>${Market.availableStock(city.id, good.id)}</td>
        <td><input type="number" min="1" value="10" data-good="${good.id}" class="qty-input"></td>
        <td><button data-action="buy" data-good="${good.id}">Kaufen</button></td>
        <td><button data-action="sell" data-good="${good.id}">Verkaufen</button></td>
      `;
      el.marketTbody.appendChild(tr);
    });

    el.marketTbody.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const goodId = btn.dataset.good;
        const input = el.marketTbody.querySelector(`.qty-input[data-good="${goodId}"]`);
        const qty = Math.max(1, parseInt(input.value, 10) || 1);
        if (btn.dataset.action === "buy" && callbacks.buy) callbacks.buy(goodId, qty);
        if (btn.dataset.action === "sell" && callbacks.sell) callbacks.sell(goodId, qty);
      });
    });
  }

  function renderKontor() {
    const ship = Ship.get();
    const dockedCityId = ship.sailing ? null : ship.currentCityId;
    let html = "";

    html += `<div class="kontor-city"><span>Kanonen an Bord: ${ship.cannons}</span>
      <button data-action="cannon" ${ship.cannons >= 6 ? "disabled" : ""}>
        Aufrüsten (${Kontor.cannonCost()} G)
      </button></div>`;

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

  function log(message) {
    const li = document.createElement("li");
    li.textContent = `Tag ${Game.currentDay()}: ${message}`;
    el.eventLog.insertBefore(li, el.eventLog.firstChild);
    while (el.eventLog.children.length > 60) el.eventLog.removeChild(el.eventLog.lastChild);
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

  function renderAll() {
    renderHUD();
    renderCargoBar();
    renderMarket();
    renderKontor();
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
  };
})();
