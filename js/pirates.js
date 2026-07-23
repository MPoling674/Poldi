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

  // Formuliert die Ladungsverlust-Zeile fuer die Ereignis-Meldung und bucht bei
  // aktiver Ladungspolice den Ersatz als Ertrag — ohne Gegenbuchung, da der
  // Warenbestand-Wert (Bilanz) durch die geleerte Ladung bereits live sinkt
  // (die gleiche implizite Verlustbuchung wie beim unversicherten Fall, siehe
  // "Doppelt gebuchten Ladungsverlust..."-Fix). insuredBranch unterscheidet nur
  // die Formulierung (Schiff bleibt vs. geht mit der Ladung verloren).
  function cargoNoteFor(outcome, insuredBranch) {
    if (outcome.cargoLossValue <= 0) return insuredBranch ? " Es war keine Ladung an Bord." : "";
    if (outcome.cargoInsured) {
      Ledger.record("cargoInsurancePayouts", outcome.cargoLossValue);
      return ` Die Ladung war zusätzlich versichert — ${outcome.cargoLossValue} Gulden Warenwert wurden ersetzt.`;
    }
    return insuredBranch
      ? ` Die Ladung im Wert von ${outcome.cargoLossValue} Gulden ist verloren.`
      : ` Die Ladung im Wert von ${outcome.cargoLossValue} Gulden ist mit dem Schiff verloren.`;
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
      // Das gesunkene Schiff geht als Anlagenabgang in gleicher Hoehe ab wie die
      // Versicherungsleistung als Ertrag gebucht wird — beide gleichen sich netto aus,
      // sodass kein Scheingewinn aus der Ersatzbeschaffung entsteht. Die Kanonen bleiben
      // unangetastet (nur der Rumpf wird "ersetzt", das Schiffsobjekt bleibt erhalten).
      Ledger.record("insurancePayouts", outcome.shipValue);
      Ledger.record("assetDisposalLosses", outcome.shipValue);
      const cargoNote = cargoNoteFor(outcome, true);
      return {
        won: false,
        destroyed: true,
        insured: true,
        message: `Das Schiff ${ship.name} wurde in der Schlacht versenkt — die Versicherung ersetzt das Schiff sofort (Wert: ${outcome.shipValue} Gulden).${cargoNote}`,
      };
    }
    if (outcome && outcome.ransom) {
      const ransom = outcome.ransom;
      const cargoNote = cargoNoteFor(outcome, false);
      // Erlassene Restschuld ist ein echter Vermoegenszuwachs (die Verbindlichkeit
      // verschwindet ohne Gegenleistung) und muss als Ertrag verbucht werden — sonst
      // stimmt die Bilanz-Eigenkapital-Aenderung nicht mit dem GuV-Saldo ueberein.
      if (outcome.loanWrittenOff > 0) Ledger.record("debtForgiveness", outcome.loanWrittenOff);
      const loanNote = outcome.loanWrittenOff > 0
        ? ` Ein offener Kredit auf das Schiff wurde zu ${outcome.loanRepaid} Gulden getilgt, ${outcome.loanWrittenOff} Gulden Restschuld wurden erlassen.`
        : outcome.loanRepaid > 0 ? ` Ein offener Kredit auf das Schiff (${outcome.loanRepaid} Gulden) wurde vollständig getilgt.` : "";
      const capitalNote = outcome.capitalReturned > 0 ? ` Das Handelskapital des Schiffs (${outcome.capitalReturned} Gulden) wurde deinem Konto gutgeschrieben.` : "";
      const assetLoss = (outcome.shipValue || 0) + (outcome.cannonValueLost || 0);
      if (assetLoss > 0) Ledger.record("assetDisposalLosses", assetLoss);
      const assetNote = assetLoss > 0 ? ` Der Buchwert des Schiffs (${assetLoss} Gulden) wurde als Anlagenabgang verbucht.` : "";
      return {
        won: false,
        destroyed: true,
        ransom,
        message: `Das Schiff ${ship.name} wurde in der Schlacht versenkt! Die Crew wird als Geisel gehalten — Lösegeld: ${ransom.amount} Gulden (fällig bis Tag ${ransom.deadlineDay}).${cargoNote}${loanNote}${capitalNote}${assetNote}`,
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
      // Das gesunkene Schiff geht als Anlagenabgang in gleicher Hoehe ab wie die
      // Versicherungsleistung als Ertrag gebucht wird — beide gleichen sich netto aus,
      // sodass kein Scheingewinn aus der Ersatzbeschaffung entsteht. Die Kanonen bleiben
      // unangetastet (nur der Rumpf wird "ersetzt", das Schiffsobjekt bleibt erhalten).
      Ledger.record("insurancePayouts", outcome.shipValue);
      Ledger.record("assetDisposalLosses", outcome.shipValue);
      const cargoNote = cargoNoteFor(outcome, true);
      return {
        fled: false,
        destroyed: true,
        insured: true,
        message: `Das Schiff ${ship.name} wurde bei der Flucht gekapert — die Versicherung ersetzt das Schiff sofort (Wert: ${outcome.shipValue} Gulden).${cargoNote}`,
      };
    }
    if (outcome && outcome.ransom) {
      const ransom = outcome.ransom;
      const cargoNote = cargoNoteFor(outcome, false);
      // Erlassene Restschuld ist ein echter Vermoegenszuwachs (die Verbindlichkeit
      // verschwindet ohne Gegenleistung) und muss als Ertrag verbucht werden — sonst
      // stimmt die Bilanz-Eigenkapital-Aenderung nicht mit dem GuV-Saldo ueberein.
      if (outcome.loanWrittenOff > 0) Ledger.record("debtForgiveness", outcome.loanWrittenOff);
      const loanNote = outcome.loanWrittenOff > 0
        ? ` Ein offener Kredit auf das Schiff wurde zu ${outcome.loanRepaid} Gulden getilgt, ${outcome.loanWrittenOff} Gulden Restschuld wurden erlassen.`
        : outcome.loanRepaid > 0 ? ` Ein offener Kredit auf das Schiff (${outcome.loanRepaid} Gulden) wurde vollständig getilgt.` : "";
      const capitalNote = outcome.capitalReturned > 0 ? ` Das Handelskapital des Schiffs (${outcome.capitalReturned} Gulden) wurde deinem Konto gutgeschrieben.` : "";
      const assetLoss = (outcome.shipValue || 0) + (outcome.cannonValueLost || 0);
      if (assetLoss > 0) Ledger.record("assetDisposalLosses", assetLoss);
      const assetNote = assetLoss > 0 ? ` Der Buchwert des Schiffs (${assetLoss} Gulden) wurde als Anlagenabgang verbucht.` : "";
      return {
        fled: false,
        destroyed: true,
        ransom,
        message: `Das Schiff ${ship.name} wurde bei der Flucht gekapert! Die Crew wird als Geisel gehalten — Lösegeld: ${ransom.amount} Gulden (fällig bis Tag ${ransom.deadlineDay}).${cargoNote}${loanNote}${capitalNote}${assetNote}`,
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
