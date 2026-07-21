// Karten-Rendering (Canvas) und Klick-Navigation

const GameMap = (() => {
  let canvas, ctx, tooltip, wrap;
  let onCityClickCallback = null;
  let hoveredCityId = null;
  let touchSelectedCityId = null;

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext("2d");
    wrap = canvas.parentElement;
    tooltip = document.getElementById("city-tooltip");
    canvas.addEventListener("click", handleClick);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", hideTooltip);
    canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
  }

  function onCityClick(cb) {
    onCityClickCallback = cb;
  }

  function cityAt(evt) {
    const rect = canvas.getBoundingClientRect();
    const x = ((evt.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((evt.clientY - rect.top) / rect.height) * canvas.height;
    return CITIES.find((c) => Math.hypot(c.x - x, c.y - y) < 16);
  }

  function handleClick(evt) {
    const hit = cityAt(evt);
    if (hit && onCityClickCallback) onCityClickCallback(hit.id);
  }

  function hideTooltip() {
    hoveredCityId = null;
    touchSelectedCityId = null;
    tooltip.classList.add("hidden");
  }

  function tooltipContent(city) {
    const exportNames = city.exports.map((id) => getGood(id).name).join(", ") || "—";
    const importNames = city.imports.map((id) => getGood(id).name).join(", ") || "—";
    let html = `<h3>${city.name}</h3>`;
    html += `<div class="tooltip-row"><span>Exportiert</span><span>${exportNames}</span></div>`;
    html += `<div class="tooltip-row"><span>Importiert</span><span>${importNames}</span></div>`;

    const kontorLevel = Kontor.level(city.id);
    if (kontorLevel > 0) {
      const relevantGoods = Array.from(new Set([...city.exports, ...city.imports]));
      html += `<div class="tooltip-hint">Kontor Stufe ${kontorLevel} — bekannte Marktpreise:</div>`;
      relevantGoods.forEach((goodId) => {
        const good = getGood(goodId);
        const buy = Market.buyPrice(city.id, goodId).toFixed(1);
        const sell = Market.sellPrice(city.id, goodId).toFixed(1);
        const stock = Market.availableStock(city.id, goodId);
        html += `<div class="tooltip-row"><span>${good.name}</span><span>${buy}/${sell} G · Lager ${stock}</span></div>`;
      });

      const player = Fleet.playerShip();
      const cargoGoodIds = player ? Object.keys(player.cargo).filter((id) => player.cargo[id] > 0) : [];
      const ownCargoGoods = cargoGoodIds.filter((id) => !relevantGoods.includes(id));
      if (ownCargoGoods.length > 0) {
        html += `<div class="tooltip-hint">Deine Ladung hier:</div>`;
        ownCargoGoods.forEach((goodId) => {
          const good = getGood(goodId);
          const sell = Market.sellPrice(city.id, goodId).toFixed(1);
          html += `<div class="tooltip-row"><span>${good.name} (${player.cargo[goodId]}x)</span><span>${sell} G</span></div>`;
        });
      }
    } else {
      html += `<div class="tooltip-hint">Kein Kontor hier — Preise erst vor Ort sichtbar.</div>`;
    }
    return html;
  }

  function positionTooltip(clientX, clientY) {
    const wrapRect = wrap.getBoundingClientRect();
    let left = clientX - wrapRect.left + 16;
    let top = clientY - wrapRect.top + 16;
    const maxLeft = wrap.clientWidth - tooltip.offsetWidth - 4;
    const maxTop = wrap.clientHeight - tooltip.offsetHeight - 4;
    tooltip.style.left = Math.max(4, Math.min(left, maxLeft)) + "px";
    tooltip.style.top = Math.max(4, Math.min(top, maxTop)) + "px";
  }

  function showTooltipFor(city, clientX, clientY) {
    tooltip.innerHTML = tooltipContent(city);
    tooltip.classList.remove("hidden");
    positionTooltip(clientX, clientY);
  }

  function handleMouseMove(evt) {
    const hit = cityAt(evt);
    if (!hit) {
      hideTooltip();
      return;
    }
    hoveredCityId = hit.id;
    showTooltipFor(hit, evt.clientX, evt.clientY);
  }

  // Touch: erstes Antippen einer Stadt zeigt nur die Info-Blase,
  // ein zweites Antippen derselben Stadt bestaetigt die Reise dorthin.
  function handleTouchStart(evt) {
    const touch = evt.touches[0];
    if (!touch) return;
    const hit = cityAt({ clientX: touch.clientX, clientY: touch.clientY });
    if (!hit) {
      hideTooltip();
      return;
    }
    evt.preventDefault();
    if (touchSelectedCityId === hit.id) {
      hideTooltip();
      if (onCityClickCallback) onCityClickCallback(hit.id);
      return;
    }
    touchSelectedCityId = hit.id;
    showTooltipFor(hit, touch.clientX, touch.clientY);
  }

  // Zeichnet ein geschlossenes Vieleck aus [x,y]-Punkten (sicher gegen Selbstueberschneidung,
  // solange die Punkte in einer Richtung um den Umriss herum angegeben werden).
  function fillPolygon(points) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawLandmasses() {
    ctx.fillStyle = "#2d4a34";

    // Großbritannien
    fillPolygon([
      [55, 245], [72, 252], [68, 282], [85, 305], [100, 325], [120, 355],
      [115, 385], [105, 405], [108, 422], [95, 438], [75, 452], [55, 460],
      [38, 445], [35, 415], [28, 385], [35, 355], [20, 320], [28, 285], [18, 258], [55, 245],
    ]);

    // Irland
    fillPolygon([
      [2, 345], [20, 338], [30, 358], [26, 385], [32, 408],
      [14, 430], [-6, 418], [-10, 388], [-6, 362], [2, 345],
    ]);

    // Kontinent: Flandern -> Nordsee -> Ostsee -> Baltikum -> Russland (ohne Juetland)
    // Kanal-Abstand zu Britannien: Kueste beginnt erst bei x=160 (statt 110), damit die Insel frei bleibt.
    fillPolygon([
      [160, 560], [160, 440], [165, 415], [178, 400], [210, 405], [245, 385],
      [280, 365], [312, 348], [332, 328], [345, 310], [340, 293], [360, 300],
      [382, 292], [400, 302], [412, 318], [422, 333], [445, 336], [466, 326],
      [486, 320], [505, 306], [525, 296], [546, 285], [566, 276], [586, 266],
      [606, 255], [617, 234], [628, 216], [630, 195], [636, 158], [652, 156],
      [672, 150], [692, 145], [712, 140], [730, 138], [760, 135],
      [760, 560], [160, 560],
    ]);

    // Jütland (Daenemark) — separate Halbinsel, ueberlappt den Kontinent an der Basis
    fillPolygon([
      [340, 293], [330, 258], [335, 224], [346, 194], [361, 164],
      [378, 168], [386, 196], [378, 226], [386, 252], [400, 280], [396, 302], [340, 293],
    ]);

    // Skandinavien
    fillPolygon([
      [258, 0], [222, 18], [196, 44], [202, 68], [180, 88], [190, 113],
      [172, 136], [184, 160], [168, 184], [180, 208], [196, 224], [212, 244],
      [232, 256], [256, 260], [280, 252], [300, 238], [316, 218], [330, 198],
      [320, 174], [335, 148], [324, 122], [344, 98], [338, 72], [358, 48],
      [352, 22], [372, 4], [258, 0],
    ]);
  }

  function drawRoutes(shipCityId) {
    ctx.strokeStyle = "rgba(232, 223, 201, 0.15)";
    ctx.lineWidth = 1;
    CITIES.forEach((a) => {
      CITIES.forEach((b) => {
        if (a.id >= b.id) return;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      });
    });
  }

  function drawCities(currentCityId, destinationCityId) {
    CITIES.forEach((city) => {
      const isCurrent = city.id === currentCityId;
      const isDest = city.id === destinationCityId;
      const radius = isCurrent ? 9 : 7;
      const hasKontor = Kontor.level(city.id) > 0;

      if (hasKontor) {
        ctx.beginPath();
        ctx.arc(city.x, city.y, radius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = "#6fcf97";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(city.x, city.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = isCurrent ? "#f2c14e" : isDest ? "#e07a5f" : "#e8dfc9";
      ctx.fill();
      ctx.strokeStyle = "#0d1b2a";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = hasKontor ? "#6fcf97" : "#e8dfc9";
      ctx.font = hasKontor ? "bold 13px Segoe UI" : "13px Segoe UI";
      ctx.textAlign = "center";
      ctx.fillText(city.name, city.x, city.y - 16);
    });
  }

  function drawShip(ship) {
    const pos = Fleet.currentPixelPos(ship);
    ctx.save();
    ctx.translate(pos.x, pos.y);
    if (ship.sailing) {
      const to = getCity(ship.destinationCityId);
      const from = getCity(ship.currentCityId);
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      ctx.rotate(angle);
    }
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-8, -6);
    ctx.lineTo(-8, 6);
    ctx.closePath();
    ctx.fillStyle = ship.isPlayer ? "#f2c14e" : "#5fb3d9";
    ctx.fill();
    ctx.strokeStyle = "#0d1b2a";
    ctx.stroke();
    ctx.restore();
  }

  function drawShips() {
    Fleet.allShips().forEach(drawShip);
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawLandmasses();
    const player = Fleet.playerShip();
    drawRoutes();
    drawCities(player ? player.currentCityId : null, player ? player.destinationCityId : null);
    drawShips();
  }

  return { init, onCityClick, render };
})();
