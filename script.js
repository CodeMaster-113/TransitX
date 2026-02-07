const TOMTOM_KEY = "2BxpSJpHZiiox4AZIjvjW8DCmB98wRHy";

let map;
let userLatLng = null;
let routeLayers = [];
let poiMarkers = [];
let activeMode = "drive";
let lastStart = null;
let lastEnd = null;
let lastEndText = "";

// ---------------- INIT MAP ----------------
navigator.geolocation.getCurrentPosition(
  pos => {
    userLatLng = [pos.coords.latitude, pos.coords.longitude];
    initMap(userLatLng);
    L.marker(userLatLng).addTo(map).bindPopup("You are here").openPopup();
  },
  () => initMap([19.0760, 72.8777])
);

function initMap(center) {
  map = L.map("map").setView(center, 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors"
  }).addTo(map);
}

// ---------------- GEOCODE ----------------
async function geocode(place) {
  if (!place) return null;

  const bias = userLatLng
    ? `&lat=${userLatLng[0]}&lon=${userLatLng[1]}`
    : "&lat=19.0760&lon=72.8777";

  const url = `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(place)}.json?key=${TOMTOM_KEY}${bias}&countrySet=IN&limit=5`;

  const res = await fetch(url);
  const data = await res.json();
  if (!data.results.length) return null;

  return {
    lat: data.results[0].position.lat,
    lon: data.results[0].position.lon,
    name: data.results[0].address.freeformAddress || place
  };
}

// ---------------- FIND ROUTE ----------------
async function findRoute() {
  const startVal = document.getElementById("start").value.trim();
  const endVal = document.getElementById("end").value.trim();

  const startObj =
    startVal.toLowerCase() === "your location"
      ? { lat: userLatLng[0], lon: userLatLng[1], name: "Your Location" }
      : await geocode(startVal);

  const endObj = await geocode(endVal);

  if (!startObj || !endObj) {
    alert("Location not found");
    return;
  }

  lastStart = startObj;
  lastEnd = endObj;
  lastEndText = endVal.toLowerCase();

  drawRouteByMode();
}

// ---------------- MODE SWITCH ----------------
document.querySelectorAll(".modeBtn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".modeBtn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeMode = btn.dataset.mode;
    drawRouteByMode();
  });
});

// ---------------- ROUTE MODE HANDLER ----------------
function drawRouteByMode() {
  if (!lastStart || !lastEnd) return;

  clearAllRoutes();

  if (activeMode === "drive") drawDrivingRoute(lastStart, lastEnd);
  if (activeMode === "train") drawTrainRoute(lastStart, lastEnd);
}

// ---------------- 🚗 DRIVE (Traffic-Aware) ----------------
async function drawDrivingRoute(start, end) {
  const url = `https://api.tomtom.com/routing/1/calculateRoute/${start.lat},${start.lon}:${end.lat},${end.lon}/json?traffic=true&routeType=fastest&key=${TOMTOM_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  const route = data.routes[0];

  clearAllRoutes();

  // Draw route segments with traffic-aware color
  route.legs[0].points.forEach((point, i, arr) => {
    if (i === 0) return;
    const prev = arr[i - 1];
    // Here, simulate traffic color based on travelTime (or use speedLimit if available)
    let color = "#0066ff"; // normal
    // Simulated traffic coloring (can be enhanced with real segment traffic info)
    const randomTraffic = Math.random(); // temporary for demo
    if (randomTraffic > 0.7) color = "#ff0000"; // heavy
    else if (randomTraffic > 0.4) color = "#ffa500"; // medium

    const segment = L.polyline(
      [
        [prev.latitude, prev.longitude],
        [point.latitude, point.longitude]
      ],
      { color: color, weight: 6 }
    ).addTo(map);
    routeLayers.push(segment);
  });

  const allPoints = route.legs[0].points.map(p => [p.latitude, p.longitude]);
  const poly = L.polyline(allPoints);
  map.fitBounds(poly.getBounds());

  const km = (route.summary.lengthInMeters / 1000).toFixed(2);
  const mins = Math.round(route.summary.travelTimeInSeconds / 60);
  showInfo(`🚗 ${km} km · ${mins} mins (Traffic-aware)`);
}

// ---------------- 🚆 TRAIN ----------------
async function drawTrainRoute(start, end) {
  const allStations = await getRailwayStationsNear(start.lat, start.lon, 45000);
  if (!allStations.length) {
    alert("No railway stations found");
    return;
  }

  const startStation = pickNearestByWalking(start, allStations);

  let endStation;
  if (lastEndText.includes("station")) {
    endStation = { lat: end.lat, lon: end.lon, name: end.name };
  } else {
    const endStations = await getRailwayStationsNear(end.lat, end.lon, 45000);
    endStation = pickNearestByWalking(end, endStations);
  }

  await drawWalkingRoute(start, startStation);

  const railLine = L.polyline(
    [
      [startStation.lat, startStation.lon],
      [endStation.lat, endStation.lon]
    ],
    { color: "#1d4ed8", weight: 6 }
  ).addTo(map);
  routeLayers.push(railLine);

  if (!lastEndText.includes("station")) {
    await drawWalkingRoute(endStation, end);
  }

  addPOI([startStation.lat, startStation.lon], `🚆 ${startStation.name}`);
  addPOI([endStation.lat, endStation.lon], `🚆 ${endStation.name}`);

  const km = haversineDistance(startStation, endStation).toFixed(2);
  showInfo(`🚆 ${startStation.name} → ${endStation.name} · ${km} km`);

  map.fitBounds(railLine.getBounds());
}

// ---------------- WALKING ROUTE ----------------
async function drawWalkingRoute(from, to) {
  const url = `https://api.tomtom.com/routing/1/calculateRoute/${from.lat},${from.lon}:${to.lat},${to.lon}/json?travelMode=pedestrian&key=${TOMTOM_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  const route = data.routes[0];

  const points = route.legs[0].points.map(p => [p.latitude, p.longitude]);
  const poly = L.polyline(points, { color: "#666", weight: 4, dashArray: "6 6" }).addTo(map);
  routeLayers.push(poly);
}

// ---------------- RAILWAY STATIONS ----------------
async function getRailwayStationsNear(lat, lon, radius) {
  const query = `
    [out:json];
    node["railway"="station"]["station"!="subway"]["station"!="metro"]["station"!="light_rail"]
    (around:${radius}, ${lat}, ${lon});
    out tags center;
  `;
  const url = "https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(query);
  const res = await fetch(url);
  const data = await res.json();
  return data.elements.map(e => ({ lat: e.lat, lon: e.lon, name: e.tags.name || "Railway Station" }));
}

// ---------------- HELPERS ----------------
function pickNearestByWalking(point, stations) {
  let best = null;
  let bestDist = Infinity;
  for (const s of stations) {
    const d = haversineDistance(point, s);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}

function addPOI(latlng, label) {
  const m = L.marker(latlng).addTo(map).bindPopup(label);
  poiMarkers.push(m);
}

function showInfo(text) {
  document.getElementById("infoBar").innerText = text;
}

function clearAllRoutes() {
  routeLayers.forEach(r => map.removeLayer(r));
  poiMarkers.forEach(m => map.removeLayer(m));
  routeLayers = [];
  poiMarkers = [];
  document.getElementById("infoBar").innerText = "Distance: — | Time: —";
}

function haversineDistance(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// ---------------- BUTTONS ----------------
document.getElementById("routeBtn").addEventListener("click", findRoute);

let pendingRedirectURL = null;
function showRedirectModal(title, text, url) {
  pendingRedirectURL = url;
  document.getElementById("modalTitle").innerText = title;
  document.getElementById("modalText").innerText = text;
  document.getElementById("redirectModal").classList.remove("hidden");
}
document.getElementById("modalCancel").onclick = () => {
  pendingRedirectURL = null;
  document.getElementById("redirectModal").classList.add("hidden");
};
document.getElementById("modalOk").onclick = () => {
  if (pendingRedirectURL) window.open(pendingRedirectURL, "_blank");
  pendingRedirectURL = null;
  document.getElementById("redirectModal").classList.add("hidden");
};

// -------- BOOK TRAIN BUTTON --------
document.getElementById("bookTrainBtn")?.addEventListener("click", () => {
  const from = document.getElementById("start").value || "Mumbai";
  const to = document.getElementById("end").value || "Delhi";
  const url = `https://www.irctc.co.in/nget/train-search?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  showRedirectModal("Book Train Ticket", "You will be redirected to IRCTC website. Continue?", url);
});
