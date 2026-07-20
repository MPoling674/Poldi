// Karten-Rendering (Canvas) und Klick-Navigation

const GameMap = (() => {
  let canvas, ctx;
  let onCityClickCallback = null;

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext("2d");
    canvas.addEventListener("click", handleClick);
  }

  function onCityClick(cb) {
    onCityClickCallback = cb;
  }

  function handleClick(evt) {
    const rect = canvas.getBoundingClientRect();
    const x = ((evt.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((evt.clientY - rect.top) / rect.height) * canvas.height;
    const hit = CITIES.find((c) => Math.hypot(c.x - x, c.y - y) < 16);
    if (hit && onCityClickCallback) onCityClickCallback(hit.id);
  }

  function drawLandmasses() {
    ctx.fillStyle = "#2d4a34";
    // Britische Inseln
    ctx.beginPath();
    ctx.ellipse(40, 440, 55, 90, -0.2, 0, Math.PI * 2);
    ctx.fill();
    // Kontinent (Flandern bis Ostsee)
    ctx.beginPath();
    ctx.moveTo(120, 560);
    ctx.lineTo(120, 380);
    ctx.bezierCurveTo(250, 340, 380, 360, 560, 330);
    ctx.lineTo(560, 560);
    ctx.closePath();
    ctx.fill();
    // Skandinavien
    ctx.beginPath();
    ctx.moveTo(150, 0);
    ctx.lineTo(340, 0);
    ctx.bezierCurveTo(320, 100, 260, 180, 200, 220);
    ctx.bezierCurveTo(160, 150, 140, 60, 150, 0);
    ctx.closePath();
    ctx.fill();
    // Baltikum / Russland
    ctx.beginPath();
    ctx.moveTo(560, 0);
    ctx.lineTo(760, 0);
    ctx.lineTo(760, 220);
    ctx.bezierCurveTo(680, 200, 600, 260, 560, 330);
    ctx.closePath();
    ctx.fill();
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
      ctx.beginPath();
      ctx.arc(city.x, city.y, isCurrent ? 9 : 7, 0, Math.PI * 2);
      ctx.fillStyle = isCurrent ? "#f2c14e" : isDest ? "#e07a5f" : "#e8dfc9";
      ctx.fill();
      ctx.strokeStyle = "#0d1b2a";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#e8dfc9";
      ctx.font = "13px Segoe UI";
      ctx.textAlign = "center";
      ctx.fillText(city.name, city.x, city.y - 14);
    });
  }

  function drawShip() {
    const ship = Ship.get();
    const pos = Ship.currentPixelPos();
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
    ctx.fillStyle = "#f2c14e";
    ctx.fill();
    ctx.strokeStyle = "#0d1b2a";
    ctx.stroke();
    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawLandmasses();
    const ship = Ship.get();
    drawRoutes();
    drawCities(ship.currentCityId, ship.destinationCityId);
    drawShip();
  }

  return { init, onCityClick, render };
})();
