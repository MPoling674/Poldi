// Piraten-Zufallsereignisse während der Fahrt: Kampf, Flucht, Totalverlust & Lösegeld

const Pirates = (() => {
  // Aktuell laufende Begegnung (Statistiken des Piraten-Schiffs). Wird bei
  // generateEncounter() gesetzt und nach Aufloesung (resolveFight / resolveFlee)
  // geloescht, damit kein alter Stand in eine neue Begegnung einfliesst.
  let _currentEncounter = null;

  const PIRATE_SHIP_NAMES = [
    "die Schwarze Möwe", "die Rote Flut", "der Meereswolf",
    "die Todesgaleere", "der Nordwind", "die Stürmerbraut",
    "die Eiserne Faust", "der Blutfriese", "das Nebeltier",
    "der Rächer der Nordsee",
  ];

  // Erzeugt einen zufälligen Piratengegner und speichert ihn für resolveFight/
  // resolveFlee. Masten (1–3) bestimmen die Schiffsgrösse; Kanonen (0–2×Masten)
  // sind der entscheidende Kampfwert. Staerke = f(Kanonen, Masten, Zufall).
  function generateEncounter() {
    const masts = 1 + Math.floor(Math.random() * 3);
    const cannons = Math.floor(Math.random() * (masts * 2 + 1));
    const strength = cannons * 1.5 + masts * 0.5 + 0.5 + Math.random() * 1.5;
    const name = PIRATE_SHIP_NAMES[Math.floor(Math.random() * PIRATE_SHIP_NAMES.length)];
    _currentEncounter = { masts, cannons, strength, name };
    return _currentEncounter;
  }

  function currentEncounter() {
    return _currentEncounter;
  }

  function rollEncounter(ship) {
    if (!ship.sailing) return false;
    return Math.random() < (ship.routeRiskPerDay || 0);
  }

  function maybeDestroy(ship, currentDay) {
    if (Math.random() >= DESTRUCTION_CHANCE) return null;
    return Fleet.destroyShip(ship, currentDay);
  }

  // Formuliert die Ladungsverlust-Zeile fuer die Ereignis-Meldung. Bei aktiver
  // Ladungspolice wird der Warenwert in Gold ausgezahlt (die Ladung selbst ist mit
  // dem Schiff/der Fahrt physisch weg, der Warenbestand-Wert (Bilanz) sinkt dadurch
  // bereits live — die Gold-Gutschrift ist die noetige Gegenbuchung, sonst stimmt
  // der Ertrag im GuV nicht mit einem tatsaechlichen Vermoegenszuwachs ueberein).
  // Ohne Police wird der Verlust als "Warenverluste durch Piraten" gebucht — ein
  // davon-Vermerk zum Wareneinsatz (siehe Ledger.record-Aufruf in resolveFight/
  // resolveFlee bei Teilraub), damit Diebstahl in der GuV sichtbar bleibt statt
  // unbenannt im Wareneinkauf/Warenbestand unterzugehen (Saldo bleibt unveraendert,
  // die Zeile wird in ui.js nicht nochmal in die Aufwandssumme eingerechnet).
  // insuredBranch unterscheidet nur die Formulierung (Schiff bleibt vs. geht mit
  // der Ladung verloren).
  function cargoNoteFor(outcome, insuredBranch) {
    if (outcome.cargoLossValue <= 0) return insuredBranch ? " Es war keine Ladung an Bord." : "";
    if (outcome.cargoInsured) {
      Ledger.record("cargoInsurancePayouts", outcome.cargoLossValue);
      Fleet.addGold(outcome.cargoLossValue);
      return ` Die Ladung war zusätzlich versichert — ${outcome.cargoLossValue} Gulden Warenwert wurden ersetzt.`;
    }
    Ledger.record("cargoLossesPirates", outcome.cargoLossValue);
    return insuredBranch
      ? ` Die Ladung im Wert von ${outcome.cargoLossValue} Gulden ist verloren.`
      : ` Die Ladung im Wert von ${outcome.cargoLossValue} Gulden ist mit dem Schiff verloren.`;
  }

  function resolveFight(ship, currentDay) {
    // Vorher generierte Begegnung (mit sichtbaren Schiffsdaten) verwenden, falls vorhanden;
    // Fallback fuer den Fall, dass resolveFight ohne vorherigen generateEncounter-Aufruf
    // aufgerufen wird (z.B. bei alten Tests oder NPC-Schiffen, die kaempfen).
    const pirateStrength = _currentEncounter ? _currentEncounter.strength : (2 + Math.random() * 4);
    _currentEncounter = null;
    const winChance = ship.cannons / (ship.cannons + pirateStrength);
    if (Math.random() < winChance) {
      const loot = Math.round(50 + Math.random() * 100);
      Fleet.addGold(loot);
      Ledger.record("pirateLoot", loot);
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
      const lostValue = Math.round(Fleet.cargoUnitCost(ship, goodId) * lost);
      Fleet.removeCargo(ship, goodId, lost);
      Ledger.record("cargoLossesPirates", lostValue);
      cargoMsg = ` Zudem wurden ${lost} Einheiten ${getGood(goodId).name} geraubt (Warenwert ${lostValue} Gulden).`;
    }
    Fleet.addDelay(ship, 1);
    return {
      won: false,
      destroyed: false,
      message: `Die Schlacht ging verloren! ${goldLoss} Gulden geraubt.${cargoMsg} Das Schiff hat einen Tag Verzögerung.`,
    };
  }

  function resolveFlee(ship, currentDay) {
    _currentEncounter = null; // Begegnung nach Entscheidung loeschen
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
      const lostValue = Math.round(Fleet.cargoUnitCost(ship, goodId) * lost);
      Fleet.removeCargo(ship, goodId, lost);
      Ledger.record("cargoLossesPirates", lostValue);
      cargoMsg = `${lost} Einheiten ${getGood(goodId).name} (Warenwert ${lostValue} Gulden) wurden bei der Verfolgung über Bord geworfen.`;
    }
    return { fled: false, destroyed: false, message: `Die Flucht misslang! ${cargoMsg}` };
  }

  return { rollEncounter, generateEncounter, currentEncounter, resolveFight, resolveFlee };
})();
