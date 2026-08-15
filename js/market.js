// Marktpreise, Lagerbestände, Kauf/Verkauf-Logik

const Market = (() => {
  let state = {}; // state[cityId][goodId] = { price, stock }

  // Aktive Ernte-/Naturereignisse: [{ goodId, multiplier, endDay }]
  // Erhöhen global den Zielpreis der betroffenen Ware in allen Städten.
  let harvestEvents = [];

  function factorFor(city, goodId) {
    if (city.exports.includes(goodId)) return EXPORT_PRICE_FACTOR;
    if (city.imports.includes(goodId)) return IMPORT_PRICE_FACTOR;
    return 1.0;
  }

  function baselineStock(factor) {
    if (factor <= EXPORT_PRICE_FACTOR) return 250 + Math.random() * 100; // Exportware: reichlich vorhanden
    if (factor >= IMPORT_PRICE_FACTOR) return 15 + Math.random() * 20;   // Importware: knapp
    return 60 + Math.random() * 40;
  }

  function init() {
    state = {};
    harvestEvents = [];
    fillMissingEntries();
  }

  // Gibt den aktuellen Preismultiplikator fuer eine Ware in einer konkreten Stadt zurueck.
  // Regionale Ereignisse: nur aktiv fuer Staedte in der betroffenen Region.
  // Globale Ereignisse (affectedCityIds leer): treffen alle Staedte.
  function harvestMultiplier(goodId, cityId) {
    const evt = harvestEvents.find((e) => e.goodId === goodId);
    if (!evt) return 1.0;
    if (!evt.affectedCityIds || evt.affectedCityIds.size === 0) return evt.multiplier; // global
    return evt.affectedCityIds.has(cityId) ? evt.multiplier : 1.0;
  }

  // Prueft Ereignisablauf und wuerfelt neue regionale/globale Ernteausfaelle.
  // Gibt { expired: [...], started: [...] } zurueck — fuer Log-Meldungen im Aufrufer.
  function checkHarvestEvents(currentDay) {
    const expired = harvestEvents.filter((e) => currentDay >= e.endDay);
    harvestEvents = harvestEvents.filter((e) => currentDay < e.endDay);

    const started = [];
    if (currentDay % HARVEST_FAIL_CHECK_INTERVAL === 0) {
      for (const def of HARVEST_FAIL_EVENTS) {
        // Kein zweites Ereignis fuer dieselbe Ware waehrend eines laufenden
        if (harvestEvents.some((e) => e.goodId === def.goodId)) continue;
        if (Math.random() < def.chance) {
          const duration = Math.round(
            def.durationMin + Math.random() * (def.durationMax - def.durationMin)
          );
          const multiplier = parseFloat(
            (def.multiplierMin + Math.random() * (def.multiplierMax - def.multiplierMin)).toFixed(2)
          );
          // Regionale oder globale Reichweite bestimmen
          let affectedCityIds = new Set();
          let regionName = null;
          if (def.regions && def.regions.length > 0) {
            const regionKey = def.regions[Math.floor(Math.random() * def.regions.length)];
            const regionDef = CITY_REGIONS[regionKey];
            affectedCityIds = new Set(regionDef ? regionDef.cities : []);
            regionName = regionDef ? regionDef.name : regionKey;
          }
          // affectedCityIds leer = globales Ereignis
          const evt = { goodId: def.goodId, multiplier, endDay: currentDay + duration,
                        affectedCityIds, regionName };
          harvestEvents.push(evt);
          started.push({ ...evt, duration });
        }
      }
    }
    return { expired, started };
  }

  // Ergänzt fehlende Stadt/Ware-Einträge, z.B. nach dem Laden eines alten
  // Spielstands, der noch nicht alle aktuellen Waren kennt.
  function fillMissingEntries() {
    CITIES.forEach((city) => {
      if (!state[city.id]) state[city.id] = {};
      GOODS.forEach((good) => {
        if (state[city.id][good.id]) return;
        const factor = factorFor(city, good.id);
        state[city.id][good.id] = {
          price: Math.round(good.basePrice * factor * 100) / 100,
          stock: Math.round(baselineStock(factor)),
        };
      });
    });
  }

  function tick() {
    CITIES.forEach((city) => {
      GOODS.forEach((good) => {
        const factor = factorFor(city, good.id);
        const m = state[city.id][good.id];
        // Aktive Ernteausfaelle heben den globalen Basiszielpreis an; nach Ereignisende
        // zieht der mean-reversion-Term (0.08 * diff) die Preise langsam wieder herunter.
        const evtMult = harvestMultiplier(good.id, city.id);
        const target = good.basePrice * factor * evtMult;
        const noise = (Math.random() - 0.5) * good.volatility * target * 0.3;
        m.price += (target - m.price) * 0.08 + noise;
        m.price = Math.max(good.basePrice * factor * 0.4, Math.min(target * 2.5, m.price));

        const stockTarget = baselineStock(factor);
        // Bei aktivem Ereignis: weniger Bestand verfuegbar (simuliert Angebotsknappheit)
        const stockMult = evtMult > 1 ? 1 / evtMult : 1;
        m.stock += (stockTarget * stockMult - m.stock) * 0.05;
        m.stock = Math.max(0, m.stock);
      });
    });
  }

  function getEntry(cityId, goodId) {
    return state[cityId][goodId];
  }

  function buyPrice(cityId, goodId) {
    return getEntry(cityId, goodId).price * 1.05;
  }

  function sellPrice(cityId, goodId) {
    return getEntry(cityId, goodId).price * 0.95;
  }

  function availableStock(cityId, goodId) {
    return Math.floor(getEntry(cityId, goodId).stock);
  }

  function buy(cityId, goodId, qty) {
    const m = getEntry(cityId, goodId);
    if (qty <= 0) return { ok: false, reason: "Ungültige Menge." };
    if (qty > Math.floor(m.stock)) return { ok: false, reason: "Nicht genug Ware am Markt." };
    const cost = Math.round(buyPrice(cityId, goodId) * qty);
    m.stock -= qty;
    m.price *= 1 + Math.min(0.2, qty * 0.0015);
    return { ok: true, cost };
  }

  function sell(cityId, goodId, qty) {
    const m = getEntry(cityId, goodId);
    if (qty <= 0) return { ok: false, reason: "Ungültige Menge." };
    const revenue = Math.round(sellPrice(cityId, goodId) * qty);
    m.stock += qty;
    m.price *= 1 - Math.min(0.2, qty * 0.0015);
    return { ok: true, revenue };
  }

  function serialize() {
    // Set kann nicht direkt serialisiert werden — als Array speichern
    return {
      prices: state,
      harvestEvents: harvestEvents.map((e) => ({
        goodId: e.goodId, multiplier: e.multiplier, endDay: e.endDay,
        regionName: e.regionName,
        affectedCityIds: e.affectedCityIds ? [...e.affectedCityIds] : [],
      })),
    };
  }

  function restore(saved) {
    if (saved && saved.prices) {
      // Neues Format: { prices, harvestEvents }
      state = saved.prices;
      harvestEvents = (saved.harvestEvents || []).map((e) => ({
        ...e,
        affectedCityIds: new Set(e.affectedCityIds || []),
      }));
    } else {
      // Altes Format: nur state-Objekt (Spielstaende vor Einführung des Ereignissystems)
      state = saved;
      harvestEvents = [];
    }
    fillMissingEntries();
  }

  // Gibt aktive Ereignisse zurueck (fuer Anzeige in Markt-UI und Karten-Tooltip).
  // affectedCityIds als Set beibehalten — ermoeglicht O(1)-Lookup im Tooltip.
  function activeHarvestEvents() {
    return harvestEvents.map((e) => ({
      goodId: e.goodId, multiplier: e.multiplier, endDay: e.endDay,
      regionName: e.regionName,
      affectedCityIds: e.affectedCityIds,
      isGlobal: !e.affectedCityIds || e.affectedCityIds.size === 0,
    }));
  }

  return {
    init, tick, checkHarvestEvents, activeHarvestEvents,
    getEntry, buyPrice, sellPrice, availableStock, buy, sell,
    serialize, restore,
  };
})();
