/* ── Prayer Times, Method Detection & Unified Home Ticker ── */
// ==================== Prayer Times Section ====================

let prayerTimesData = null;
let countdownInterval = null;

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Prayer names mapping
const prayerNames = {
  Fajr: "الفجر",
  Sunrise: "الشروق",
  Dhuhr: "الظهر",
  Asr: "العصر",
  Sunset: "المغرب",
  Maghrib: "المغرب",
  Isha: "العشاء",
  Imsak: "الإمساك",
  Midnight: "منتصف الليل",
};

// Prayer icons
const prayerIcons = {
  Fajr: "fa-cloud-moon",
  Sunrise: "fa-sun",
  Dhuhr: "fa-sun",
  Asr: "fa-cloud-sun",
  Sunset: "fa-cloud-sun",
  Maghrib: "fa-cloud-sun",
  Isha: "fa-moon",
};

// ── Detection of official calculation method by geographic region ──
function detectCalculationMethod(lat, lng) {
  // Egypt (Egyptian General Authority of Survey - matches Google in Egypt)
  if (lat >= 21.5 && lat <= 32.0 && lng >= 24.0 && lng <= 37.0) {
    return 5;
  }
  // Saudi Arabia (Umm Al-Qura, Makkah)
  if (lat >= 16.0 && lat <= 32.5 && lng >= 34.0 && lng <= 55.5) {
    return 4;
  }
  // Gulf Region (UAE, Qatar, Kuwait, Bahrain, Oman)
  if (lat >= 22.0 && lat <= 30.5 && lng >= 46.0 && lng <= 60.0) {
    return 8;
  }
  // North America (ISNA)
  if (lat >= 24.0 && lat <= 72.0 && lng >= -170.0 && lng <= -50.0) {
    return 2;
  }
  // Default World (Muslim World League)
  return 3;
}

// Shared calculation helper delegating to TazkeerUtils
function _getPrayerCalcParams(lat, lng) {
  if (window.TazkeerUtils && typeof window.TazkeerUtils.buildAlAdhanQueryParams === "function") {
    return window.TazkeerUtils.buildAlAdhanQueryParams(lat, lng);
  }
  const method = detectCalculationMethod(lat, lng);
  return {
    method,
    school: 0,
    queryString: `latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&method=${method}&school=0`,
  };
}

function _applyUserOffsets(timings) {
  if (!timings || typeof timings !== "object") return timings;
  if (window.TazkeerUtils && typeof window.TazkeerUtils.applyMinuteOffsets === "function") {
    return window.TazkeerUtils.applyMinuteOffsets(timings);
  }
  return timings;
}

function _getActiveLocationConfig() {
  if (window.TazkeerUtils && typeof window.TazkeerUtils.getPrayerSettings === "function") {
    const cfg = window.TazkeerUtils.getPrayerSettings();
    if (cfg && cfg.manualCity && Number.isFinite(cfg.manualCity.lat) && Number.isFinite(cfg.manualCity.lng)) {
      return {
        latitude: Number(cfg.manualCity.lat),
        longitude: Number(cfg.manualCity.lng),
        city: cfg.manualCity.nameAr || "مدينة مختارة",
        isManual: true,
      };
    }
  }
  const saved = _safeReadJSON("prayerLocation", null);
  if (saved && Number.isFinite(Number(saved.latitude)) && Number.isFinite(Number(saved.longitude))) {
    return {
      latitude: Number(saved.latitude),
      longitude: Number(saved.longitude),
      city: saved.city || "القاهرة",
      isManual: false,
    };
  }
  return { latitude: 30.0444, longitude: 31.2357, city: "القاهرة", isManual: false };
}

let activePrayerCity = "القاهرة";

// Clean time string (removes timezone text like "04:49 (EET)" -> "04:49")
function cleanTimeString(timeStr) {
  if (!timeStr) return "";
  return String(timeStr).split(" ")[0].trim();
}

// Storage key for 30-day monthly calendar (includes method & school!)
function getMonthlyCalendarKey(year, month, lat, lng) {
  const calc = _getPrayerCalcParams(lat, lng);
  return `monthly_prayers_${year}_${month}_${Number(lat).toFixed(2)}_${Number(lng).toFixed(2)}_m${calc.method}_s${calc.school}`;
}

// Read stored monthly calendar from storage
function getStoredMonthlyCalendar(year, month, lat, lng) {
  const key = getMonthlyCalendarKey(year, month, lat, lng);
  const data = _safeReadJSON(key, null);
  if (data && data.days && Object.keys(data.days).length > 0) {
    return data;
  }
  return null;
}

// Lookup today's timings from the stored monthly calendar
function getStoredPrayerTimesForDate(date, lat, lng) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = String(date.getDate());
  const monthData = getStoredMonthlyCalendar(year, month, lat, lng);
  if (monthData && monthData.days && monthData.days[day]) {
    return _applyUserOffsets(monthData.days[day]);
  }
  return null;
}

// Fetch full 30-day monthly calendar from AlAdhan API and cache locally + sync to AdhanNative
async function fetchAndStoreMonthCalendar(lat, lng, year, month, cityName) {
  const calc = _getPrayerCalcParams(lat, lng);
  const url = `https://api.aladhan.com/v1/calendar?${calc.queryString}&month=${month}&year=${year}`;

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("AlAdhan Calendar API HTTP " + response.status);

  const json = await response.json();
  if (!json || !Array.isArray(json.data) || json.data.length === 0) {
    throw new Error("Invalid calendar payload received from AlAdhan");
  }

  // Mirror raw monthly calendar into AdhanNative offline cache
  if (window.AdhanNative && typeof window.AdhanNative.syncOfflineCalendar === "function") {
    try {
      window.AdhanNative.syncOfflineCalendar(lat, lng, year, month, json.data, calc.method, calc.school);
    } catch (_) {}
  }

  const daysObj = {};
  json.data.forEach((dayItem) => {
    const dayNum = String(parseInt(dayItem.date?.gregorian?.day || "0", 10));
    if (dayNum !== "0" && dayItem.timings) {
      daysObj[dayNum] = {
        Fajr: cleanTimeString(dayItem.timings.Fajr),
        Sunrise: cleanTimeString(dayItem.timings.Sunrise),
        Dhuhr: cleanTimeString(dayItem.timings.Dhuhr),
        Asr: cleanTimeString(dayItem.timings.Asr),
        Maghrib: cleanTimeString(dayItem.timings.Maghrib),
        Isha: cleanTimeString(dayItem.timings.Isha),
        Sunset: cleanTimeString(dayItem.timings.Sunset),
        Imsak: cleanTimeString(dayItem.timings.Imsak),
        Midnight: cleanTimeString(dayItem.timings.Midnight),
      };
    }
  });

  const cachePayload = {
    year,
    month,
    lat: Number(lat),
    lng: Number(lng),
    cityName: cityName || "",
    method: calc.method,
    school: calc.school,
    savedAt: Date.now(),
    days: daysObj,
  };

  const key = getMonthlyCalendarKey(year, month, lat, lng);
  if (window.SafeStorage) {
    window.SafeStorage.setJSON(key, cachePayload);
  } else {
    localStorage.setItem(key, JSON.stringify(cachePayload));
  }
  return cachePayload;
}

// Auto-Renewal: Preload next month's calendar in background when month end approaches
function checkAndPreloadNextMonthCalendar(lat, lng, today, cityName) {
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  const daysInMonth = new Date(year, month, 0).getDate();

  if (daysInMonth - day <= 5) {
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const storedNext = getStoredMonthlyCalendar(nextYear, nextMonth, lat, lng);
    if (!storedNext) {
      fetchAndStoreMonthCalendar(lat, lng, nextYear, nextMonth, cityName).catch((err) => {
        console.warn("[PrayerTimes] Next month prefetch warning:", err && err.message);
      });
    }
  }
}

// ── Location permission & manual city picker modal handlers ──
function renderLocationModalCities(query) {
  const listEl = document.getElementById("locModalCityList");
  if (!listEl || !window.TazkeerUtils) return;
  const matches = window.TazkeerUtils.searchPresetCities(query).slice(0, 10);
  if (!matches.length) {
    listEl.innerHTML = '<div class="prayer-city-empty">لا توجد مدينة مطابقة</div>';
    return;
  }
  listEl.innerHTML = matches
    .map(
      (c) => `
      <button type="button" class="loc-city-option" onclick="selectManualCityFromModal('${c.id}')">
        <span class="loc-city-option__name">${c.nameAr}</span>
        <span class="loc-city-option__country">${c.countryAr}</span>
      </button>`,
    )
    .join("");
}

function selectManualCityFromModal(cityId) {
  if (!window.TazkeerUtils) return;
  const city = window.TazkeerUtils.PRESET_CITIES.find((c) => c.id === cityId);
  if (!city) return;
  window.TazkeerUtils.savePrayerSettings({ manualCity: city });
  activePrayerCity = city.nameAr;
  const cityEl = document.getElementById("cityName");
  if (cityEl) cityEl.textContent = city.nameAr;
  closeLocationPermissionModal();
  applyPrayerSettingsAndRefresh();
  if (window.AdhanNative && typeof window.AdhanNative.refresh === "function") {
    window.AdhanNative.refresh();
  }
  showNotification(`تم اختيار مدينة ${city.nameAr}`);
}

function showLocationPermissionModal() {
  const modal = document.getElementById("locationPermissionModal");
  if (!modal) return;
  renderLocationModalCities("");
  modal.classList.add("is-open");
  if (window.AppRouter) {
    window.AppRouter.pushModal("locationPermissionModal", closeLocationPermissionModal);
  }
}

function closeLocationPermissionModal() {
  const modal = document.getElementById("locationPermissionModal");
  if (!modal) return;
  modal.classList.remove("is-open");
  if (window.AppRouter && window.AppRouter.isModalOpen("locationPermissionModal")) {
    window.AppRouter.closeModal("locationPermissionModal");
  }
  if (window.TazkeerModalQueue) {
    window.TazkeerModalQueue.notifyClosed("first-launch-location");
  }
}

function handleEnableLocationFromModal() {
  if (window.TazkeerUtils) {
    window.TazkeerUtils.savePrayerSettings({ manualCity: null });
  }
  closeLocationPermissionModal();
  requestLocation(false);
}

function handleDismissLocationModal() {
  closeLocationPermissionModal();
  const savedLocation = _safeReadStr("prayerLocation", null);
  if (!savedLocation) {
    const fallback = { latitude: 30.0444, longitude: 31.2357, city: "القاهرة" };
    if (window.SafeStorage) window.SafeStorage.setJSON("prayerLocation", fallback);
    else localStorage.setItem("prayerLocation", JSON.stringify(fallback));
  }
}

function applyPrayerSettingsAndRefresh() {
  const loc = _getActiveLocationConfig();
  activePrayerCity = loc.city;
  return fetchPrayerTimes(loc.latitude, loc.longitude, loc.city);
}

window.renderLocationModalCities = renderLocationModalCities;
window.selectManualCityFromModal = selectManualCityFromModal;
window.showLocationPermissionModal = showLocationPermissionModal;
window.closeLocationPermissionModal = closeLocationPermissionModal;
window.handleEnableLocationFromModal = handleEnableLocationFromModal;
window.handleDismissLocationModal = handleDismissLocationModal;
window.applyPrayerSettingsAndRefresh = applyPrayerSettingsAndRefresh;

// Initialize Prayer Times - Instant load with monthly cache and non-overlapping location prompt
async function initializePrayerTimes() {
  const section = document.getElementById("prayerTimesSection");
  if (!section) return;

  const loc = _getActiveLocationConfig();
  const lat = loc.latitude;
  const lng = loc.longitude;
  const city = loc.city;
  activePrayerCity = city;

  // 1. Instant Render: check stored monthly calendar for today to display immediately
  const today = new Date();
  const storedToday = getStoredPrayerTimesForDate(today, lat, lng);
  if (storedToday) {
    prayerTimesData = storedToday;
    displayPrayerTimes(city);
    startCountdown();
    const loading = document.getElementById("prayerTimesLoading");
    if (loading) loading.style.display = "none";
  }

  // 2. Fetch/update monthly calendar in background
  fetchPrayerTimes(lat, lng, city);

  // 3. First launch prompt via sequential ModalQueue (never collides with settings/install)
  const savedLocation = _safeReadStr("prayerLocation", null);
  const promptedOnce = _safeReadStr("locationPromptedOnce", null);
  if (!savedLocation && !loc.isManual && !promptedOnce) {
    if (window.SafeStorage) window.SafeStorage.set("locationPromptedOnce", "true");
    else localStorage.setItem("locationPromptedOnce", "true");

    if (window.TazkeerModalQueue) {
      window.TazkeerModalQueue.enqueue({
        id: "first-launch-location",
        delayMs: 900,
        shouldShow: () => !_safeReadStr("prayerLocation", null) && !_getActiveLocationConfig().isManual,
        show: () => {
          showLocationPermissionModal();
        },
      });
    } else {
      setTimeout(() => showLocationPermissionModal(), 900);
    }
  }

  // Setup event listeners ONCE (prevent listener leak across tab switches)
  const locationBtn = document.getElementById("locationBtn");
  const retryBtn = document.getElementById("retryPrayerTimes");

  if (locationBtn && !locationBtn._tazkeerBound) {
    locationBtn._tazkeerBound = true;
    locationBtn.addEventListener("click", () => showLocationPermissionModal());
  }

  if (retryBtn && !retryBtn._tazkeerBound) {
    retryBtn._tazkeerBound = true;
    retryBtn.addEventListener("click", () => {
      const current = _getActiveLocationConfig();
      fetchPrayerTimes(current.latitude, current.longitude, current.city);
    });
  }
}

function refreshPrayerTimesForCurrentLocation(reason) {
  const location = _getActiveLocationConfig();
  activePrayerCity = location.city;
  console.log("[PrayerTimes] Refreshing schedule:", reason || "manual");
  return fetchPrayerTimes(location.latitude, location.longitude, location.city);
}

// Request user location with polite modal on refusal
async function requestLocation(silent) {
  const loading = document.getElementById("prayerTimesLoading");
  const error = document.getElementById("prayerTimesError");

  if (!navigator.geolocation) {
    if (!silent) showLocationPermissionModal();
    return;
  }

  if (loading) loading.style.display = "block";
  if (error) error.classList.add("hidden");

  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        timeout: 10000,
        enableHighAccuracy: true,
      });
    });

    const { latitude, longitude } = position.coords;
    const cityName = await getCityName(latitude, longitude);

    const payload = { latitude, longitude, city: cityName };
    if (window.SafeStorage) window.SafeStorage.setJSON("prayerLocation", payload);
    else localStorage.setItem("prayerLocation", JSON.stringify(payload));
    if (window.TazkeerUtils) {
      window.TazkeerUtils.savePrayerSettings({ manualCity: null });
    }

    activePrayerCity = cityName;
    closeLocationPermissionModal();
    await fetchPrayerTimes(latitude, longitude, cityName);
  } catch (err) {
    console.warn("[PrayerTimes] Geolocation denied or error:", err);
    if (loading) loading.style.display = "none";

    if (!silent) {
      showLocationPermissionModal();
    }

    const savedLocation = _safeReadStr("prayerLocation", null);
    if (!savedLocation) {
      const cairoLat = 30.0444;
      const cairoLng = 31.2357;
      const cairoName = "القاهرة";
      const fallback = { latitude: cairoLat, longitude: cairoLng, city: cairoName };
      if (window.SafeStorage) window.SafeStorage.setJSON("prayerLocation", fallback);
      else localStorage.setItem("prayerLocation", JSON.stringify(fallback));
      activePrayerCity = cairoName;
      await fetchPrayerTimes(cairoLat, cairoLng, cairoName);
    }
  }
}

// Get city name from coordinates
async function getCityName(latitude, longitude) {
  try {
    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=ar`,
    );
    const data = await response.json();
    return data.city || data.locality || data.principalSubdivision || "موقعك";
  } catch (err) {
    console.error("Geocoding error:", err);
    return "موقعك";
  }
}

// Fetch prayer times using 30-day monthly calendar storage
async function fetchPrayerTimes(latitude, longitude, cityName) {
  const loading = document.getElementById("prayerTimesLoading");
  const error = document.getElementById("prayerTimesError");

  const resolvedCity = cityName || activePrayerCity || _getActiveLocationConfig().city || "القاهرة";
  activePrayerCity = resolvedCity;

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const currentDay = String(today.getDate());

  // 1. Immediately look for today in stored monthly calendar
  let monthData = getStoredMonthlyCalendar(currentYear, currentMonth, latitude, longitude);
  let todayTimings = monthData && monthData.days && monthData.days[currentDay];

  if (todayTimings) {
    prayerTimesData = _applyUserOffsets(todayTimings);
    displayPrayerTimes(resolvedCity);
    startCountdown();
    reconcilePrayerSchedules(resolvedCity);
    if (loading) loading.style.display = "none";
    if (error) error.classList.add("hidden");
  }

  // 2. Fetch or refresh monthly calendar from API if missing or older than 7 days
  try {
    const isStale = !monthData || (Date.now() - Number(monthData.savedAt || 0) > 7 * 24 * 60 * 60 * 1000);
    if (!monthData || !todayTimings || isStale) {
      monthData = await fetchAndStoreMonthCalendar(latitude, longitude, currentYear, currentMonth, resolvedCity);
      if (monthData && monthData.days && monthData.days[currentDay]) {
        prayerTimesData = _applyUserOffsets(monthData.days[currentDay]);
        displayPrayerTimes(resolvedCity);
        startCountdown();
        reconcilePrayerSchedules(resolvedCity);
        if (loading) loading.style.display = "none";
        if (error) error.classList.add("hidden");
      }
    }

    // 3. Auto-renewal: If near end of month, fetch next month's 30-day calendar
    checkAndPreloadNextMonthCalendar(latitude, longitude, today, resolvedCity);

  } catch (err) {
    console.warn("[PrayerTimes] Monthly calendar fetch error, attempting single day fallback:", err);

    if (!todayTimings) {
      try {
        const timestamp = Math.floor(today.getTime() / 1000);
        const calc = _getPrayerCalcParams(latitude, longitude);
        const fallbackRes = await fetch(
          `https://api.aladhan.com/v1/timings/${timestamp}?${calc.queryString}`,
        );
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          if (fallbackData && fallbackData.data && fallbackData.data.timings) {
            prayerTimesData = _applyUserOffsets(fallbackData.data.timings);
            displayPrayerTimes(resolvedCity);
            startCountdown();
            reconcilePrayerSchedules(resolvedCity);
            if (loading) loading.style.display = "none";
            if (error) error.classList.add("hidden");
            return;
          }
        }
      } catch (fallbackErr) {
        console.warn("[PrayerTimes] Single day fallback failed:", fallbackErr);
      }

      showPrayerTimesError("تعذر تحميل مواقيت الصلاة");
    }
  }
}

function reconcilePrayerSchedules(cityName) {
  if (window.AdhanNative && window.AdhanNative.onPrayerTimesUpdated) {
    try {
      window.AdhanNative.onPrayerTimesUpdated(prayerTimesData, cityName);
    } catch (error) {
      console.warn("Adhan sync hook error:", error);
    }
  }
  if (typeof window.syncAzkarNativeSchedule === "function") {
    window.syncAzkarNativeSchedule();
  }
}

// Display prayer times cards
function displayPrayerTimes(cityName) {
  const grid = document.getElementById("prayerTimesGrid");
  const locationEl = document.getElementById("cityName");

  const resolvedCity = cityName || activePrayerCity || _getActiveLocationConfig().city || "القاهرة";
  activePrayerCity = resolvedCity;
  try {
    if (window.SafeStorage) window.SafeStorage.set("cachedPrayerCity", resolvedCity);
    else localStorage.setItem("cachedPrayerCity", resolvedCity);
  } catch (_) {}

  if (locationEl) {
    locationEl.textContent = resolvedCity;
  }

  if (!grid || !prayerTimesData) return;

  // Main prayers to display (including Sunrise)
  const mainPrayers = ["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"];
  const now = new Date();
  const nextPrayer = getNextPrayerKey(now);

  grid.innerHTML = mainPrayers
    .map((prayer) => {
      const time = prayerTimesData[prayer];
      const formattedTime = formatToArabic12Hour(time);
      const name = prayerNames[prayer];
      const icon = prayerIcons[prayer] || "fa-clock";
      const pDate = prayerDateFor(prayer, now);
      const isPast = pDate && pDate <= now;
      const isNext = prayer === nextPrayer;

      return `
        <div class="prayer-card${isPast ? " is-past" : ""}${isNext ? " next-prayer" : ""}" data-prayer="${prayer}">
          <div class="prayer-icon">
            <i class="fas ${icon}"></i>
          </div>
          <div class="prayer-info">
            <div class="prayer-name">${name}</div>
            <div class="prayer-time">${formattedTime || "--:--"}</div>
          </div>
        </div>
      `;
    })
    .join("");

  const nextTimeEl = document.getElementById("nextPrayerTime");
  if (nextTimeEl && nextPrayer && prayerTimesData[nextPrayer]) {
    nextTimeEl.textContent = formatToArabic12Hour(prayerTimesData[nextPrayer]);
  }

  updateDynamicHeroCard(now);
  renderAzkarSuggestion();
}

// Build a Date for a prayer time on the current day
function prayerDateFor(prayer, now) {
  if (!prayerTimesData || !prayerTimesData[prayer]) return null;
  const cleanTime = String(prayerTimesData[prayer]).split(" ")[0];
  const [hours, minutes] = cleanTime.split(":").map(Number);
  if (isNaN(hours) || isNaN(minutes)) return null;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
}

// First obligatory prayer still ahead today (falls back to Fajr tomorrow)
function getNextPrayerKey(now) {
  if (!prayerTimesData) return null;
  const prayers = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
  for (const prayer of prayers) {
    const pDate = prayerDateFor(prayer, now);
    if (pDate && pDate > now) return prayer;
  }
  return "Fajr";
}

// Arabic-Indic 12-hour formatter for prayer chips
function formatToArabic12Hour(time24) {
  if (!time24) return "";
  const cleanTime = String(time24).split(" ")[0];
  const [hours, minutes] = cleanTime.split(":");
  let hour = parseInt(hours, 10);
  if (isNaN(hour)) return "";
  const period = hour >= 12 ? "م" : "ص";
  hour = hour % 12 || 12;
  const mins = parseInt(minutes, 10) || 0;
  return `${toArabicNumerals(hour)}:${toArabicNumerals(String(mins).padStart(2, "0"))} ${period}`;
}

// Convert 24-hour time to 12-hour AM/PM format (Arabic)
function formatTo12Hour(time24) {
  if (!time24) return "";
  const cleanTime = time24.split(" ")[0];
  const [hours, minutes] = cleanTime.split(":");
  let hour = parseInt(hours, 10);
  const period = hour >= 12 ? "م" : "ص";

  hour = hour % 12 || 12; // Convert 0 to 12 for midnight

  return `${hour}:${minutes} ${period}`;
}

let _countdownVisibilityBound = false;
let _lastCountdownState = {
  dataRef: null,
  nextPrayer: null,
  previousPrayer: null,
  countdownText: "",
  progressWidth: "",
};

// Unified 1-second Home Ticker (Countdown + Hero Live Clock) — stops cleanly outside tab-home
let _homeTickerId = null;

function _isHomeTickerEligible() {
  if (document.hidden) return false;
  if (window.AppRouter && typeof window.AppRouter.getCurrentTab === "function") {
    return window.AppRouter.getCurrentTab() === "tab-home";
  }
  const homeTab = document.getElementById("tab-home");
  return !homeTab || homeTab.classList.contains("active-tab");
}

function _runHomeTickerStep() {
  if (!_isHomeTickerEligible()) {
    stopHomeTicker();
    return;
  }
  if (prayerTimesData) updateCountdown();
  if (typeof window.updateLiveClockTick === "function") {
    window.updateLiveClockTick();
  }
}

function stopHomeTicker() {
  if (_homeTickerId) {
    clearInterval(_homeTickerId);
    _homeTickerId = null;
  }
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

function startHomeTicker() {
  if (!_countdownVisibilityBound) {
    _countdownVisibilityBound = true;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        stopHomeTicker();
      } else {
        if (_isHomeTickerEligible()) startHomeTicker();
        if (typeof updateRamadanCountdown === "function") updateRamadanCountdown();
        if (typeof checkAzkarReminderTransition === "function") checkAzkarReminderTransition();
      }
    });
  }

  _lastCountdownState.dataRef = null;
  if (prayerTimesData) updateCountdown();
  if (typeof window.updateLiveClockTick === "function") {
    window.updateLiveClockTick();
  }

  if (!_isHomeTickerEligible()) {
    stopHomeTicker();
    return;
  }
  if (!_homeTickerId) {
    _homeTickerId = setInterval(_runHomeTickerStep, 1000);
    countdownInterval = _homeTickerId;
  }
}

function startCountdown() {
  startHomeTicker();
}
window.startHomeTicker = startHomeTicker;
window.stopHomeTicker = stopHomeTicker;
window.startCountdown = startCountdown;

// Helper to format remaining time in proper Arabic grammar
function formatArabicRemainingTime(hours, minutes, seconds) {
  const getUnit = (count, singular, dual, plural) => {
    if (count <= 0) return null;
    if (count === 1) return singular;
    if (count === 2) return dual;
    if (count >= 3 && count <= 10) return `${count} ${plural}`;
    return `${count} ${singular}`;
  };

  const hStr = getUnit(hours, "ساعة", "ساعتان", "ساعات");
  const mStr = getUnit(minutes, "دقيقة", "دقيقتان", "دقائق");
  const sStr = getUnit(seconds, "ثانية", "ثانيتان", "ثوانٍ");

  const parts = [hStr, mStr, sStr].filter(Boolean);

  if (parts.length === 0) return "متبقي أقل من ثانية";

  let result = parts[0];
  for (let i = 1; i < parts.length; i++) {
    result += ` و${parts[i]}`;
  }

  return `متبقي ${result}`;
}

// Update countdown display (diffed DOM updates to avoid redundant reflows every second)
function updateCountdown() {
  if (!prayerTimesData) return;

  const now = new Date();
  const chain = ["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"];

  let nextPrayer = null;
  let targetDate = null;
  let previousDate = null;
  let previousPrayer = null;

  // Next obligatory prayer (Sunrise is a boundary, never "the next prayer")
  for (const prayer of ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"]) {
    const pDate = prayerDateFor(prayer, now);
    if (pDate && pDate > now) {
      nextPrayer = prayer;
      targetDate = pDate;
      break;
    }
  }

  // Previous boundary on the Fajr → Sunrise → … → Isha chain
  for (const prayer of chain) {
    const pDate = prayerDateFor(prayer, now);
    if (pDate && pDate <= now) {
      previousPrayer = prayer;
      previousDate = pDate;
    }
  }

  // Before Fajr: the previous point is yesterday's Isha
  if (!previousDate) {
    const ishaDate = prayerDateFor("Isha", now);
    if (ishaDate) {
      previousPrayer = "Isha";
      previousDate = new Date(ishaDate.getTime() - 24 * 60 * 60 * 1000);
    }
  }

  // If no obligatory prayer remains today, next is Fajr tomorrow
  if (!nextPrayer) {
    nextPrayer = "Fajr";
    const fajrDate = prayerDateFor("Fajr", now);
    targetDate = fajrDate
      ? new Date(fajrDate.getTime() + 24 * 60 * 60 * 1000)
      : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 5, 0, 0, 0);
  }

  const diffMs = targetDate - now;

  if (diffMs <= 0) {
    _lastCountdownState.dataRef = null;
    if (typeof displayPrayerTimes === "function") {
      const cityName = activePrayerCity || _safeReadStr("cachedPrayerCity", "") || _getActiveLocationConfig().city;
      displayPrayerTimes(cityName);
    }
    return;
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n) => String(n).padStart(2, "0");
  const countdownText = toArabicNumerals(
    `${hours}:${pad(minutes)}:${pad(seconds)}`,
  );

  if (countdownText !== _lastCountdownState.countdownText) {
    _lastCountdownState.countdownText = countdownText;
    const countdownTimeEl = document.getElementById("countdownTime");
    if (countdownTimeEl) {
      countdownTimeEl.textContent = countdownText;
    }
  }

  // Progress from previous prayer to the next one
  let progress = 0;
  if (previousDate) {
    const span = targetDate - previousDate;
    progress = span > 0 ? ((now - previousDate) / span) * 100 : 0;
  }
  progress = Math.min(100, Math.max(0, progress));
  const progressWidth = progress.toFixed(1) + "%";
  if (progressWidth !== _lastCountdownState.progressWidth) {
    _lastCountdownState.progressWidth = progressWidth;
    const progressEl = document.getElementById("prayerProgressFill");
    if (progressEl) {
      progressEl.style.width = progressWidth;
    }
  }

  // Only update prayer titles, previous label, and card classes when boundary or dataset changes
  const boundaryChanged =
    _lastCountdownState.dataRef !== prayerTimesData ||
    _lastCountdownState.nextPrayer !== nextPrayer ||
    _lastCountdownState.previousPrayer !== previousPrayer;

  if (boundaryChanged) {
    _lastCountdownState.dataRef = prayerTimesData;
    _lastCountdownState.nextPrayer = nextPrayer;
    _lastCountdownState.previousPrayer = previousPrayer;

    const nextPrayerNameEl = document.getElementById("nextPrayerName");
    const nextPrayerTimeEl = document.getElementById("nextPrayerTime");
    const elapsedEl = document.getElementById("prayerElapsed");

    if (nextPrayerNameEl) {
      nextPrayerNameEl.textContent = prayerNames[nextPrayer] || nextPrayer;
    }

    if (nextPrayerTimeEl && prayerTimesData[nextPrayer]) {
      nextPrayerTimeEl.textContent = formatToArabic12Hour(
        prayerTimesData[nextPrayer],
      );
    }

    if (elapsedEl) {
      if (previousDate && previousPrayer) {
        const prevName = prayerNames[previousPrayer] || previousPrayer;
        const prevTime = prayerTimesData[previousPrayer]
          ? formatToArabic12Hour(prayerTimesData[previousPrayer])
          : "";
        elapsedEl.textContent = `منذ ${prevName}${prevTime ? " " + prevTime : ""}`;
      } else {
        elapsedEl.textContent = "منذ الفجر";
      }
    }

    // Highlight next prayer card and dim finished ones
    document.querySelectorAll(".prayer-card").forEach((card) => {
      const key = card.getAttribute("data-prayer");
      const pDate = prayerDateFor(key, now);
      card.classList.toggle("is-past", !!(pDate && pDate <= now));
      card.classList.toggle("next-prayer", key === nextPrayer);
    });
  }
}

// Show prayer times error
function showPrayerTimesError(message) {
  const loading = document.getElementById("prayerTimesLoading");
  const error = document.getElementById("prayerTimesError");

  if (loading) loading.style.display = "none";

  if (error) {
    error.classList.remove("hidden");
    const errorText = error.querySelector("p");
    if (errorText) {
      errorText.textContent = message;
    }
  }
}

