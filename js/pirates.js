// Piraten-Zufallsereignisse während der Fahrt: Kampf, Flucht, Totalverlust & Lösegeld

const Pirates = (() => {
  function rollEncounter(ship) {
    if (!ship.sailing) return false;
    return Math.random() < (ship.routeRiskPerDay || 0);
  }

  function maybeDestroy(ship, currentDay) {
    if (Math.random() >= DESTRUCTION_CHANCE) return null;
    return Fleet.destroyShip(ship, currentDay);
  }

  function resolveFight(ship, currentDay) {
    const pirateStrength = 2 + Math.random() * 4;
    const winChance = ship.cannons / (ship.cannons + pirateStrength);
    if (Math.random() < winChance) {
      const loot = Math.round(50 + Math.random() * 100);
      Fleet.addGold(loot);
      return { won: true, destroyed: false, message: `Die Piraten wurden abgewehrt! Erbeutet: ${loot} Gulden.` };
    }

    const outcome = maybeDestroy(ship, currentDay);
    if (outcome && outcome.insured) {
      return {
        won: false,
        destroyed: true,
        insured: true,
        message: `Das Schiff ${ship.name} wurde in der Schlacht schwer beschädigt — die Versicherung ersetzt den Schaden sofort, keine Ladung an Bord verloren gegangen.`,
      };
    }
    if (outcome && outcome.ransom) {
      const ransom = outcome.ransom;
      return {
        won: false,
        destroyed: true,
        ransom,
        message: `Das Schiff ${ship.name} wurde in der Schlacht versenkt! Die Crew wird als Geisel gehalten — Lösegeld: ${ransom.amount} Gulden (fällig bis Tag ${ransom.deadlineDay}).`,
      };
    }

    const goldLoss = Math.round(Fleet.gold() * (0.1 + Math.random() * 0.15));
    Fleet.addGold(-goldLoss);
    Ledger.record("pirateLosses", goldLoss);
    const cargoGoodIds = Object.keys(ship.cargo);
    let cargoMsg = "";
    if (cargoGoodIds.length > 0) {
      const goodId = cargoGoodIds[Math.floor(Math.random() * cargoGoodIds.length)];
      const lost = Math.max(1, Math.round(ship.cargo[goodId] * 0.3));
      Fleet.removeCargo(ship, goodId, lost);
      cargoMsg = ` Zudem wurden ${lost} Einheiten ${getGood(goodId).name} geraubt.`;
    }
    Fleet.addDelay(ship, 1);
    return {
      won: false,
      destroyed: false,
      message: `Die Schlacht ging verloren! ${goldLoss} Gulden geraubt.${cargoMsg} Das Schiff hat einen Tag Verzögerung.`,
    };
  }

  function resolveFlee(ship, currentDay) {
    const fleeChance = Math.max(0.3, Math.min(0.9, 0.5 + ship.speedBonus * 0.1));
    if (Math.random() < fleeChance) {
      return { fled: true, destroyed: false, message: "Die Flucht gelang, die Piraten bleiben zurück." };
    }

    const outcome = maybeDestroy(ship, currentDay);
    if (outcome && outcome.insured) {
      return {
        fled: false,
        destroyed: true,
        insured: true,
        message: `Das Schiff ${ship.name} wurde bei der Flucht schwer beschädigt — die Versicherung ersetzt den Schaden sofort, keine Ladung an Bord verloren gegangen.`,
      };
    }
    if (outcome && outcome.ransom) {
      const ransom = outcome.ransom;
      return {
        fled: false,
        destroyed: true,
        ransom,
        message: `Das Schiff ${ship.name} wurde bei der Flucht gekapert! Die Crew wird als Geisel gehalten — Lösegeld: ${ransom.amount} Gulden (fällig bis Tag ${ransom.deadlineDay}).`,
      };
    }

    const cargoGoodIds = Object.keys(ship.cargo);
    let cargoMsg = "Keine Ladung an Bord.";
    if (cargoGoodIds.length > 0) {
      const goodId = cargoGoodIds[Math.floor(Math.random() * cargoGoodIds.length)];
      const lost = Math.max(1, Math.round(ship.cargo[goodId] * 0.2));
      Fleet.removeCargo(ship, goodId, lost);
      cargoMsg = `${lost} Einheiten ${getGood(goodId).name} wurden bei der Verfolgung über Bord geworfen.`;
    }
    return { fled: false, destroyed: false, message: `Die Flucht misslang! ${cargoMsg}` };
  }

  return { rollEncounter, resolveFight, resolveFlee };
})();
