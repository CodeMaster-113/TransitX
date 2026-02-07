const TOMTOM_KEY = "2BxpSJpHZiiox4AZIjvjW8DCmB98wRHy";

let map;
let userLatLng = null;
let routeLayers = [];
let trafficLayers = [];

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

  const url = `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(place)}.json?key=${TOMTOM_KEY}${bias}&countrySet=IN&limit=1`;

  const res = await fetch(url);
  const data = await res.json();
  if (!data.results.length) return null;

  return [data.results[0].position.lat, data.results[0].position.lon];
}

// ---------------- ROUTING ----------------
async function findRoute() {
  const startVal = document.getElementById("start").value.trim();
  const endVal = document.getElementById("end").value.trim();

  let startCoords =
    startVal.toLowerCase() === "your location"
      ? userLatLng
      : await geocode(startVal);

  const endCoords = await geocode(endVal);

  if (!startCoords || !endCoords) {
    alert("Location not found — try a more specific name");
    return;
  }

  clearAllRoutes();

  const url = `https://api.tomtom.com/routing/1/calculateRoute/${startCoords[0]},${startCoords[1]}:${endCoords[0]},${endCoords[1]}/json?traffic=true&routeType=fastest&maxAlternatives=2&key=${TOMTOM_KEY}`;

  const res = await fetch(url);
  const data = await res.json();

  const mainRoute = data.routes[0];
  const summary = mainRoute.summary;

  // 📏 Distance & ⏱ Time
  const km = (summary.lengthInMeters / 1000).toFixed(2);
  const mins = Math.round(summary.travelTimeInSeconds / 60);

  document.getElementById("infoBar").innerText =
    `Distance: ${km} km | Time: ${mins} mins`;

  data.routes.forEach((route, index) => {
    const points = route.legs[0].points.map(p => [p.latitude, p.longitude]);

    const baseRoute = L.polyline(points, {
      color: index === 0 ? "#0066ff" : "#999",
      weight: index === 0 ? 6 : 4,
      opacity: index === 0 ? 1 : 0.6
    }).addTo(map);

    routeLayers.push(baseRoute);

    if (index === 0) drawTrafficSegments(route.legs[0]);
  });

  map.fitBounds(routeLayers[0].getBounds());
}

// ---------------- TRAFFIC COLORING ----------------
function drawTrafficSegments(leg) {
  const pts = leg.points;

  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];

    const congestion = Math.random(); // simulated congestion

    let color = "green";
    if (congestion > 0.66) color = "red";
    else if (congestion > 0.33) color = "orange";

    const seg = L.polyline(
      [
        [p1.latitude, p1.longitude],
        [p2.latitude, p2.longitude]
      ],
      { color, weight: 7, opacity: 0.9 }
    ).addTo(map);

    trafficLayers.push(seg);
  }
}

// ---------------- CLEAR OLD ROUTES ----------------
function clearAllRoutes() {
  routeLayers.forEach(r => map.removeLayer(r));
  trafficLayers.forEach(t => map.removeLayer(t));
  routeLayers = [];
  trafficLayers = [];
  document.getElementById("infoBar").innerText = "Distance: — | Time: —";
}

document.getElementById("routeBtn").addEventListener("click", findRoute);
