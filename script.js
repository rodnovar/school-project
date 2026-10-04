const wasteLabels = {
  paper: "Бумага",
  plastic: "Пластик",
  glass: "Стекло",
  metal: "Металл",
  batteries: "Батарейки",
  electronics: "Электроника",
  textile: "Текстиль",
  books: "Книги",
  tires: "Шины",
  special: "Спец. фракции",
  other: "Уточнить"
};

const WASTE_TAGS = {
  paper: ["paper", "cardboard", "cartons", "paper_packaging", "newspaper"],
  plastic: ["plastic", "plastic_bottles", "plastic_packaging", "plastic_bags", "plastic_caps", "plastic_bottle_caps", "pet"],
  glass: ["glass", "glass_bottles", "glass_jars"],
  metal: ["metal", "cans", "aluminium", "scrap_metal", "sheet_metal"],
  batteries: ["batteries", "car_batteries"],
  electronics: ["electrical_appliances", "electrical_items", "small_electrical_appliances", "small_appliances", "computers", "mobile_phones", "white_goods", "printer_cartridges", "printer_inkjet_cartridges", "printer_toner_cartridges"],
  textile: ["clothes", "shoes", "textiles"],
  books: ["books"],
  tires: ["tyres", "tires"],
  special: ["fluorescent_tubes", "light_bulbs", "low_energy_bulbs", "waste_oil", "engine_oil", "cooking_oil", "drugs", "christmas_trees", "wood", "garden_waste", "furniture", "cds", "cork", "polystyrene_foam", "organic", "rubble"]
};

const MOSCOW_CENTER = [55.7558, 37.6176];
const CACHE_KEY = "ecopoint_moscow_osm_v3";
const CACHE_TTL = 24 * 60 * 60 * 1000;
const MAX_LIST_ITEMS = 100;

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];

const OVERPASS_QUERY = `
[out:json][timeout:45];
area["boundary"="administrative"]["admin_level"="4"]["name"="Москва"]->.searchArea;
(
  nwr["amenity"="recycling"](area.searchArea);
  nwr["recycling_type"](area.searchArea);
);
out center tags;
`;

// Небольшой резервный набор реальных точек: он используется только если Overpass временно недоступен.
const FALLBACK_POINTS = [
  { id: "fallback-1", name: "Экоцентр «Сборка» — Чистые пруды", address: "Москва, Потаповский переулок, 5, стр. 2", lat: 55.7654, lng: 37.6428, hours: "Пн–Пт 11:00–21:00, Сб–Вс 11:00–20:00", types: ["paper", "plastic", "glass", "metal", "batteries", "electronics", "textile", "books", "special"], source: "https://ecosborka.ru/", sourceLabel: "Сборка" },
  { id: "fallback-2", name: "Экопункт «Сборка» — ARTPLAY", address: "Москва, Нижняя Сыромятническая улица, 10, стр. 2", lat: 55.7539, lng: 37.6695, hours: "Ежедневно 10:00–18:00", types: ["paper", "plastic", "glass", "metal", "textile"], source: "https://ecosborka.ru/", sourceLabel: "Сборка" },
  { id: "fallback-3", name: "«Сборка» — Марьина Роща", address: "Москва, улица Веткина, 2Г, стр. 1", lat: 55.8070, lng: 37.6134, hours: "Пт–Пн 12:00–20:00", types: ["paper", "plastic", "glass", "metal", "electronics", "textile"], source: "https://ecosborka.ru/", sourceLabel: "Сборка" },
  { id: "fallback-4", name: "Экоцентр АО «Экотехпром» — ЮАО", address: "Москва, улица Подольских Курсантов, 22А, стр. 2", lat: 55.5869, lng: 37.6239, hours: "Вт–Вс 11:00–20:00; основные фракции — круглосуточно", types: ["paper", "plastic", "glass", "metal", "batteries", "textile", "special"], source: "https://eco-pro.ru/environmental-education/", sourceLabel: "Экотехпром" },
  { id: "fallback-5", name: "Экоцентр АО «Экотехпром» — ЦАО", address: "Москва, Звенигородское шоссе, 26, стр. 2", lat: 55.7636, lng: 37.5585, hours: "Вт–Вс 11:00–20:00; основные фракции — круглосуточно", types: ["paper", "plastic", "glass", "metal", "batteries", "textile", "special"], source: "https://eco-pro.ru/environmental-education/", sourceLabel: "Экотехпром" }
];

let recyclingPoints = [];
let map;
let userMarker = null;
let pointMarkers = [];
let lastUserLocation = null;
let activePointId = null;
let dataMode = "loading";

const form = document.getElementById("searchForm");
const addressInput = document.getElementById("addressInput");
const wasteFilter = document.getElementById("wasteFilter");
const statusMessage = document.getElementById("statusMessage");
const resultsList = document.getElementById("resultsList");
const resultCount = document.getElementById("resultCount");
const resultsHint = document.getElementById("resultsHint");
const loadedPointCount = document.getElementById("loadedPointCount");

function initMap() {
  if (!window.L) {
    statusMessage.textContent = "Карта не загрузилась. Проверьте подключение к интернету.";
    statusMessage.classList.add("error");
    return;
  }

  map = L.map("map", { scrollWheelZoom: false, preferCanvas: true }).setView(MOSCOW_CENTER, 10);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
  }).addTo(map);
}

async function loadRecyclingPoints() {
  statusMessage.classList.remove("error");

  const cached = readCache();
  if (cached?.points?.length) {
    recyclingPoints = cached.points;
    dataMode = "osm-cache";
    updateLoadedDataUI(`Загружено ${recyclingPoints.length} реальных точек из сохранённой базы OpenStreetMap. Обновляем данные в фоне…`);
    refreshView();
  }

  try {
    const freshPoints = await fetchFromOverpass();
    if (!freshPoints.length) throw new Error("Overpass вернул пустой список");

    recyclingPoints = freshPoints;
    dataMode = "osm-live";
    writeCache(freshPoints);
    updateLoadedDataUI(`Загружено ${recyclingPoints.length} точек переработки Москвы из OpenStreetMap. Данные автоматически обновляются.`);
    refreshView();
  } catch (error) {
    console.warn("Не удалось обновить Overpass:", error);

    if (recyclingPoints.length) {
      statusMessage.textContent = `Используется сохранённая база из ${recyclingPoints.length} точек. Онлайн-обновление сейчас недоступно.`;
      return;
    }

    recyclingPoints = FALLBACK_POINTS.map((point) => ({ ...point }));
    dataMode = "fallback";
    updateLoadedDataUI("Overpass временно недоступен. Показан резервный набор проверенных пунктов; попробуйте обновить страницу позже.", true);
    refreshView();
  }
}

async function fetchFromOverpass() {
  let lastError;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
        signal: controller.signal
      });

      clearTimeout(timeout);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const parsed = parseOverpassElements(data.elements || []);
      if (parsed.length) return parsed;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Нет доступного сервера Overpass");
}

function parseOverpassElements(elements) {
  const seen = new Set();
  const points = [];

  for (const element of elements) {
    const lat = Number(element.lat ?? element.center?.lat);
    const lng = Number(element.lon ?? element.center?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const tags = element.tags || {};
    const types = detectWasteTypes(tags);
    const osmId = `${element.type}/${element.id}`;
    const operator = firstNonEmpty(tags.operator, tags.brand, tags.network);
    const name = firstNonEmpty(tags.name, operator, typeName(tags.recycling_type), "Пункт переработки");

    points.push({
      id: `osm-${element.type}-${element.id}`,
      name,
      operator,
      address: buildAddress(tags),
      lat,
      lng,
      hours: formatOpeningHours(tags.opening_hours),
      types: types.length ? types : ["other"],
      source: `https://www.openstreetmap.org/${osmId}`,
      sourceLabel: "OpenStreetMap",
      note: firstNonEmpty(tags.description, tags.note, tags["recycling:description"], ""),
      osmId
    });
  }

  return points.sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

function detectWasteTypes(tags) {
  const found = [];

  for (const [category, keys] of Object.entries(WASTE_TAGS)) {
    const hasCategory = keys.some((key) => tagIsYes(tags[`recycling:${key}`]));
    if (hasCategory) found.push(category);
  }

  return found;
}

function tagIsYes(value) {
  if (value == null) return false;
  const normalized = String(value).trim().toLowerCase();
  return !["no", "false", "0", "none"].includes(normalized);
}

function buildAddress(tags) {
  const full = firstNonEmpty(tags["addr:full"], tags["contact:address"]);
  if (full) return full;

  const street = firstNonEmpty(tags["addr:street"], tags["addr:place"]);
  const house = tags["addr:housenumber"] || "";
  const parts = [street && house ? `${street}, ${house}` : (street || house), tags["addr:district"], tags["addr:suburb"]]
    .filter(Boolean);

  if (parts.length) return `Москва, ${[...new Set(parts)].join(", ")}`;
  return "Адрес не указан в OpenStreetMap — используйте точку на карте";
}

function formatOpeningHours(value) {
  if (!value) return "Режим работы не указан";
  if (value === "24/7") return "Круглосуточно";
  return value;
}

function typeName(value) {
  if (value === "centre") return "Центр переработки";
  if (value === "container") return "Контейнер для вторсырья";
  return "";
}

function updateLoadedDataUI(message, isError = false) {
  loadedPointCount.textContent = recyclingPoints.length.toLocaleString("ru-RU");
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", isError);
}

function refreshView() {
  const points = filterAndSortPoints();
  renderPoints(points);
  renderResults(points);
}

function renderPoints(points) {
  if (!map) return;

  pointMarkers.forEach((marker) => marker.remove());
  pointMarkers = [];

  points.forEach((point) => {
    const marker = L.circleMarker([point.lat, point.lng], {
      radius: 6,
      weight: 2,
      color: "#ffffff",
      fillColor: "#2e7d4f",
      fillOpacity: 0.92
    }).addTo(map);

    marker.bindPopup(`
      <div class="popup-title">${escapeHtml(point.name)}</div>
      <div class="popup-address">${escapeHtml(point.address)}</div>
      <div class="popup-hours">${escapeHtml(point.hours)}</div>
      <div class="popup-source"><a href="${safeUrl(point.source)}" target="_blank" rel="noopener noreferrer">Источник: ${escapeHtml(point.sourceLabel)}</a></div>
    `);

    marker.on("click", () => setActivePoint(point.id, false));
    marker.ecoPointId = point.id;
    pointMarkers.push(marker);
  });
}

function renderResults(points) {
  resultCount.textContent = points.length.toLocaleString("ru-RU");

  if (!points.length) {
    resultsHint.textContent = "Нет подходящих точек";
    resultsList.innerHTML = '<div class="result-card"><h4>Ничего не найдено</h4><p>У некоторых пунктов OpenStreetMap не указаны принимаемые фракции. Попробуйте «Все виды» или проверьте официальную карту Москвы.</p></div>';
    return;
  }

  const visible = points.slice(0, MAX_LIST_ITEMS);
  resultsHint.textContent = points.length > MAX_LIST_ITEMS
    ? `Показаны первые ${MAX_LIST_ITEMS} из ${points.length.toLocaleString("ru-RU")}`
    : dataMode === "fallback" ? "Резервная база" : "Все найденные точки";

  resultsList.innerHTML = visible.map((point) => {
    const distance = typeof point.distance === "number"
      ? `<span>${formatDistance(point.distance)}</span>`
      : "";

    const types = point.types.map((type) => wasteLabels[type] || type).slice(0, 7);

    return `
      <article class="result-card ${activePointId === point.id ? "active" : ""}" data-point-id="${escapeHtml(point.id)}" tabindex="0">
        <h4>${escapeHtml(point.name)}</h4>
        <p>${escapeHtml(point.address)}</p>
        <div class="result-meta">
          ${distance}
          <span>${escapeHtml(point.hours)}</span>
        </div>
        <div class="result-tags">
          ${types.map((type) => `<span>${escapeHtml(type)}</span>`).join("")}
          ${point.types.length > types.length ? `<span>+${point.types.length - types.length}</span>` : ""}
        </div>
        <div class="result-links">
          <a href="${safeUrl(point.source)}" target="_blank" rel="noopener noreferrer">Проверить источник</a>
          <a href="https://www.openstreetmap.org/?mlat=${point.lat}&mlon=${point.lng}#map=17/${point.lat}/${point.lng}" target="_blank" rel="noopener noreferrer">Открыть на карте</a>
        </div>
      </article>
    `;
  }).join("");

  document.querySelectorAll(".result-card[data-point-id]").forEach((card) => {
    const activate = () => setActivePoint(card.dataset.pointId, true);
    card.addEventListener("click", (event) => {
      if (event.target.closest("a")) return;
      activate();
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activate();
      }
    });
  });
}

function setActivePoint(pointId, moveMap = true) {
  activePointId = String(pointId);
  const point = recyclingPoints.find((item) => String(item.id) === String(pointId));
  if (!point) return;

  document.querySelectorAll(".result-card[data-point-id]").forEach((card) => {
    card.classList.toggle("active", card.dataset.pointId === String(pointId));
  });

  const marker = pointMarkers.find((item) => String(item.ecoPointId) === String(pointId));
  if (marker) marker.openPopup();
  if (moveMap && map) map.setView([point.lat, point.lng], 15, { animate: true });
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
  } else {
    points.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }

  return points;
}

async function geocodeAddress(address) {
  const query = /москв/i.test(address) ? address : `Москва, ${address}`;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "ru");
  url.searchParams.set("q", query);

  const response = await fetch(url, { headers: { "Accept-Language": "ru" } });
  if (!response.ok) throw new Error("Сервис поиска адресов временно недоступен");

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
    renderPoints(points);
    renderResults(points);

    if (map && points.length) {
      const bounds = L.latLngBounds([[location.lat, location.lng]]);
      points.slice(0, 5).forEach((point) => bounds.extend([point.lat, point.lng]));
      map.fitBounds(bounds.pad(0.2), { maxZoom: 13 });
    }

    statusMessage.textContent = points.length
      ? `Подходящих точек: ${points.length.toLocaleString("ru-RU")}. Список отсортирован по расстоянию по прямой от введённого адреса.`
      : "Для выбранной категории точки не найдены. Попробуйте «Все виды» или официальную карту Москвы.";
  } catch (error) {
    statusMessage.textContent = error.message || "Не удалось выполнить поиск.";
    statusMessage.classList.add("error");
  }
});

wasteFilter.addEventListener("change", () => {
  refreshView();
  const points = filterAndSortPoints();
  if (lastUserLocation) {
    statusMessage.textContent = points.length
      ? `Подходящих точек: ${points.length.toLocaleString("ru-RU")}. Ближайшие показаны первыми.`
      : "По выбранной категории точек с указанным типом сырья не найдено.";
  }
});

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.savedAt || Date.now() - parsed.savedAt > CACHE_TTL) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(points) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), points }));
  } catch {
    // localStorage может быть отключён — сайт продолжит работать без кэша.
  }
}

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

function firstNonEmpty(...values) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim() || "";
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? escapeHtml(url.href) : "#";
  } catch {
    return "#";
  }
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
loadRecyclingPoints();
