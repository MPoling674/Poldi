// Piraten-Zufallsereignisse während der Fahrt

const Pirates = (() => {
  function rollEncounter() {
    const ship = Ship.get();
    if (!ship.sailing) return false;
    return Math.random() < (ship.routeRiskPerDay || 0);
  }

  function resolveFight() {
    const ship = Ship.get();
    const pirateStrength = 2 + Math.random() * 4;
    const winChance = ship.cannons / (ship.cannons + pirateStrength);
    if (Math.random() < winChance) {
      const loot = Math.round(50 + Math.random() * 100);
      ship.gold += loot;
      return { won: true, message: `Die Piraten wurden abgewehrt! Erbeutet: ${loot} Gulden.` };
    }
    const goldLoss = Math.round(ship.gold * (0.1 + Math.random() * 0.15));
    ship.gold = Math.max(0, ship.gold - goldLoss);
    const cargoGoodIds = Object.keys(ship.cargo);
    let cargoMsg = "";
    if (cargoGoodIds.length > 0) {
      const goodId = cargoGoodIds[Math.floor(Math.random() * cargoGoodIds.length)];
      const lost = Math.max(1, Math.round(ship.cargo[goodId] * 0.3));
      Ship.removeCargo(goodId, lost);
      cargoMsg = ` Zudem wurden ${lost} Einheiten ${getGood(goodId).name} geraubt.`;
    }
    Ship.addDelay(1);
    return {
      won: false,
      message: `Die Schlacht ging verloren! ${goldLoss} Gulden geraubt.${cargoMsg} Das Schiff hat einen Tag Verzögerung.`,
    };
  }

  function resolveFlee() {
    const ship = Ship.get();
    const fleeChance = Math.max(0.3, Math.min(0.9, 0.5 + ship.speedBonus * 0.1));
    if (Math.random() < fleeChance) {
      return { fled: true, message: "Die Flucht gelang, die Piraten bleiben zurück." };
    }
    const cargoGoodIds = Object.keys(ship.cargo);
    let cargoMsg = "Keine Ladung an Bord.";
    if (cargoGoodIds.length > 0) {
      const goodId = cargoGoodIds[Math.floor(Math.random() * cargoGoodIds.length)];
      const lost = Math.max(1, Math.round(ship.cargo[goodId] * 0.2));
      Ship.removeCargo(goodId, lost);
      cargoMsg = `${lost} Einheiten ${getGood(goodId).name} wurden bei der Verfolgung über Bord geworfen.`;
    }
    return { fled: false, message: `Die Flucht misslang! ${cargoMsg}` };
  }

  return { rollEncounter, resolveFight, resolveFlee };
})();
