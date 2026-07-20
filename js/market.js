// Marktpreise, Lagerbestände, Kauf/Verkauf-Logik

const Market = (() => {
  let state = {}; // state[cityId][goodId] = { price, stock }

  function factorFor(city, goodId) {
    if (city.exports.includes(goodId)) return 0.6;
    if (city.imports.includes(goodId)) return 1.6;
    return 1.0;
  }

  function baselineStock(factor) {
    if (factor <= 0.6) return 250 + Math.random() * 100; // Exportware: reichlich vorhanden
    if (factor >= 1.6) return 15 + Math.random() * 20;   // Importware: knapp
    return 60 + Math.random() * 40;
  }

  function init() {
    state = {};
    fillMissingEntries();
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
        const target = good.basePrice * factor;
        const noise = (Math.random() - 0.5) * good.volatility * target * 0.3;
        m.price += (target - m.price) * 0.08 + noise;
        m.price = Math.max(target * 0.4, Math.min(target * 2.5, m.price));

        const stockTarget = baselineStock(factor);
        m.stock += (stockTarget - m.stock) * 0.05;
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
    return state;
  }

  function restore(saved) {
    state = saved;
    fillMissingEntries();
  }

  return { init, tick, getEntry, buyPrice, sellPrice, availableStock, buy, sell, serialize, restore };
})();
