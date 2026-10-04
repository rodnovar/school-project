const wasteLabels = {
  paper: "Бумага",
  plastic: "Пластик",
  glass: "Стекло",
  metal: "Металл",
  batteries: "Батарейки",
  electronics: "Электроника",
  textile: "Текстиль",
  special: "Редкие фракции"
};

// Демонстрационная база проекта.
// Перед финальной защитой рекомендуется перепроверить адреса, часы работы
// и точный список фракций на официальных сайтах организаций.
const recyclingPoints = [
  {
    id: 1,
    name: "Экоцентр «Сборка» — Чистые пруды",
    address: "Москва, Потаповский переулок, 5, стр. 2",
    lat: 55.7654,
    lng: 37.6428,
    hours: "Пн–Пт 11:00–21:00, Сб–Вс 11:00–20:00",
    types: ["paper", "plastic", "glass", "metal", "batteries", "electronics", "textile", "special"],
    source: "https://ecosborka.ru/"
  },
  {
    id: 2,
    name: "Экопункт «Сборка» — ARTPLAY",
    address: "Москва, Нижняя Сыромятническая улица, 10, стр. 2",
    lat: 55.7539,
    lng: 37.6695,
    hours: "Ежедневно 10:00–18:00",
    types: ["paper", "plastic", "glass", "metal", "textile"],
    source: "https://ecosborka.ru/"
  },
  {
    id: 3,
    name: "«Сборка» — Марьина Роща",
    address: "Москва, улица Веткина, 2Г, стр. 1",
    lat: 55.8070,
    lng: 37.6134,
    hours: "Пт–Пн 12:00–20:00",
    types: ["paper", "plastic", "glass", "metal", "electronics", "textile"],
    source: "https://ecosborka.ru/"
  },
  {
    id: 4,
    name: "Экоцентр АО «Экотехпром» — ЮАО",
    address: "Москва, улица Подольских Курсантов, 22А, стр. 2",
    lat: 55.5869,
    lng: 37.6239,
    hours: "Вт–Вс 11:00–20:00; основные фракции — 24/7 через наружные окна",
    types: ["paper", "plastic", "glass", "metal", "batteries", "textile", "special"],
    source: "https://eco-pro.ru/environmental-education/"
  },
  {
    id: 5,
    name: "Экоцентр АО «Экотехпром» — ЦАО",
    address: "Москва, Звенигородское шоссе, 26, стр. 2",
    lat: 55.7636,
    lng: 37.5585,
    hours: "Вт–Вс 11:00–20:00; основные фракции — 24/7 через наружные окна",
    types: ["paper", "plastic", "glass", "metal", "batteries", "textile", "special"],
    source: "https://eco-pro.ru/environmental-education/"
  }
];

const MOSCOW_CENTER = [55.7558, 37.6176];
let map;
let userMarker = null;
let pointMarkers = [];
let lastUserLocation = null;
let activePointId = null;

const form = document.getElementById("searchForm");
const addressInput = document.getElementById("addressInput");
const wasteFilter = document.getElementById("wasteFilter");
const statusMessage = document.getElementById("statusMessage");
const resultsList = document.getElementById("resultsList");
const resultCount = document.getElementById("resultCount");

function initMap() {
  if (!window.L) {
    statusMessage.textContent = "Карта не загрузилась. Проверьте подключение к интернету.";
    statusMessage.classList.add("error");
    return;
  }

  map = L.map("map", { scrollWheelZoom: false }).setView(MOSCOW_CENTER, 10);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  renderPoints(recyclingPoints);
  renderResults(recyclingPoints);
}

function renderPoints(points) {
  if (!map) return;

  pointMarkers.forEach((marker) => marker.remove());
  pointMarkers = [];

  points.forEach((point) => {
    const marker = L.marker([point.lat, point.lng]).addTo(map);
    marker.bindPopup(`
      <div class="popup-title">${escapeHtml(point.name)}</div>
      <div class="popup-address">${escapeHtml(point.address)}</div>
      <div class="popup-hours">${escapeHtml(point.hours)}</div>
    `);
    marker.on("click", () => setActivePoint(point.id, false));
    marker.ecoPointId = point.id;
    pointMarkers.push(marker);
  });
}

function renderResults(points) {
  resultCount.textContent = points.length;

  if (!points.length) {
    resultsList.innerHTML = '<div class="result-card"><h4>Ничего не найдено</h4><p>Попробуйте выбрать другой вид отходов.</p></div>';
    return;
  }

  resultsList.innerHTML = points.map((point) => {
    const distance = typeof point.distance === "number"
      ? `<span>${formatDistance(point.distance)}</span>`
      : "";

    return `
      <article class="result-card ${activePointId === point.id ? "active" : ""}" data-point-id="${point.id}" tabindex="0">
        <h4>${escapeHtml(point.name)}</h4>
        <p>${escapeHtml(point.address)}</p>
        <div class="result-meta">
          ${distance}
          <span>${escapeHtml(point.hours)}</span>
        </div>
        <div class="result-tags">
          ${point.types.slice(0, 6).map((type) => `<span>${wasteLabels[type]}</span>`).join("")}
          ${point.types.length > 6 ? `<span>+${point.types.length - 6}</span>` : ""}
        </div>
      </article>
    `;
  }).join("");

  document.querySelectorAll(".result-card[data-point-id]").forEach((card) => {
    const activate = () => setActivePoint(Number(card.dataset.pointId), true);
    card.addEventListener("click", activate);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activate();
      }
    });
  });
}

function setActivePoint(pointId, moveMap = true) {
  activePointId = pointId;
  const point = recyclingPoints.find((item) => item.id === pointId);
  if (!point) return;

  document.querySelectorAll(".result-card[data-point-id]").forEach((card) => {
    card.classList.toggle("active", Number(card.dataset.pointId) === pointId);
  });

  const marker = pointMarkers.find((item) => item.ecoPointId === pointId);
  if (marker) marker.openPopup();
  if (moveMap && map) map.setView([point.lat, point.lng], 14, { animate: true });
}

function filterAndSortPoints() {
  const selected = wasteFilter.value;
  let points = recyclingPoints
    .filter((point) => selected === "all" || point.types.includes(selected))
    .map((point) => ({ ...point }));

  if (lastUserLocation) {
    points = points
      .map((point) => ({
        ...point,
        distance: haversineDistance(lastUserLocation.lat, lastUserLocation.lng, point.lat, point.lng)
      }))
      .sort((a, b) => a.distance - b.distance);
  }

  renderPoints(points);
  renderResults(points);
  return points;
}

async function geocodeAddress(address) {
  const query = /москва/i.test(address) ? address : `Москва, ${address}`;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "ru");
  url.searchParams.set("q", query);

  const response = await fetch(url, {
    headers: {
      "Accept-Language": "ru"
    }
  });

  if (!response.ok) throw new Error("Сервис геокодирования временно недоступен");

  const data = await response.json();
  if (!data.length) throw new Error("Адрес не найден. Уточните улицу и номер дома.");

  return {
    lat: Number(data[0].lat),
    lng: Number(data[0].lon),
    displayName: data[0].display_name
  };
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const address = addressInput.value.trim();
  if (!address) return;

  statusMessage.classList.remove("error");
  statusMessage.textContent = "Ищем адрес и ближайшие пункты…";

  try {
    const location = await geocodeAddress(address);
    lastUserLocation = location;

    if (map) {
      if (userMarker) userMarker.remove();
      userMarker = L.circleMarker([location.lat, location.lng], {
        radius: 9,
        weight: 3,
        color: "#ffffff",
        fillColor: "#173d29",
        fillOpacity: 1
      }).addTo(map).bindPopup("Ваш адрес");
    }

    const points = filterAndSortPoints();

    if (map) {
      const bounds = L.latLngBounds([[location.lat, location.lng]]);
      points.slice(0, 4).forEach((point) => bounds.extend([point.lat, point.lng]));
      map.fitBounds(bounds.pad(0.25), { maxZoom: 13 });
    }

    statusMessage.textContent = points.length
      ? `Найдено подходящих пунктов: ${points.length}. Список отсортирован по расстоянию по прямой.`
      : "По выбранной категории пунктов в демо-базе не найдено.";
  } catch (error) {
    statusMessage.textContent = error.message || "Не удалось выполнить поиск.";
    statusMessage.classList.add("error");
  }
});

wasteFilter.addEventListener("change", () => {
  filterAndSortPoints();
});

function haversineDistance(lat1, lon1, lat2, lon2) {
  const toRad = (value) => value * Math.PI / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(km) {
  if (km < 1) return `${Math.round(km * 1000)} м`;
  return `${km.toFixed(1).replace(".", ",")} км`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

initMap();
