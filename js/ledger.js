// Ergebnisrechnung: kumulierte Erträge/Aufwendungen seit Spielbeginn

const Ledger = (() => {
  function emptyTotals() {
    return {
      tradeRevenue: 0,
      tradeCost: 0,
      harborFees: 0,
      wages: 0,
      kontorUpkeep: 0,
      insurancePremiums: 0,
      insurancePayouts: 0,
      ransoms: 0,
      shipPurchases: 0,
      kontorBuilds: 0,
      cannonPurchases: 0,
      pirateLosses: 0,
      loanInterest: 0,
      assetDisposalLosses: 0,
    };
  }

  let totals = emptyTotals();

  function init() {
    totals = emptyTotals();
  }

  // amount ist immer positiv (die Groesse des Postens); die Kategorie legt fest,
  // ob es sich um Ertrag oder Aufwand handelt (siehe INCOME_CATEGORIES in ui.js).
  function record(category, amount) {
    if (totals[category] === undefined) totals[category] = 0;
    totals[category] += amount;
  }

  function summary() {
    return { ...totals };
  }

  function serialize() {
    return totals;
  }

  function restore(saved) {
    totals = { ...emptyTotals(), ...(saved || {}) };
  }

  return { init, record, summary, serialize, restore };
})();
