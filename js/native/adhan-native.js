/**
 * ============================================================================
 * adhan-native.js — Tazkeer Adhan engine (web <-> Capacitor bridge)
 * ============================================================================
 *
 * Responsibilities:
 *  1. Detect the native Android shell.
 *  2. Build a rolling 7-day prayer schedule from AlAdhan (with offline cache).
 *  3. Push that schedule into the native AlarmManager plugin.
 *  4. Render the muezzin / per-prayer / permissions settings UI.
 *  5. Reconcile the schedule on app start, resume and prayer-time refresh.
 *
 * The web layer never plays the adhan itself: on Android the native
 * AdhanPlaybackService does, which is the only way to guarantee audio while
 * the app is killed or the device is in Doze.
 *
 * Public API: window.AdhanNative
 */
(function (global) {
  "use strict";

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  var SETTINGS_KEY = "adhanSettings.v2";
  var CALENDAR_PREFIX = "adhanCalendar.v2";
  var CALENDAR_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
  var RESYNC_THROTTLE_MS = 5 * 60 * 1000;
  var PERMISSION_THROTTLE_MS = 4 * 1000;

  var PRAYERS = [
    { key: "Fajr", name: "الفجر", icon: "fa-cloud-moon" },
    { key: "Dhuhr", name: "الظهر", icon: "fa-sun" },
    { key: "Asr", name: "العصر", icon: "fa-cloud-sun" },
    { key: "Maghrib", name: "المغرب", icon: "fa-moon" },
    { key: "Isha", name: "العشاء", icon: "fa-star" }
  ];

  /**
   * Bundled, offline muezzin catalogue.
   *
   * `sound` maps to a file in android/app/src/main/res/raw/<sound>.mp3.
   * Fajr always uses the dedicated Fajr recording so the
   * "الصلاة خير من النوم" line is present.
   *
   * Licensing: the three bundled recordings come from Internet Archive items
   * explicitly marked Public Domain Mark 1.0 (see AUDIO-NOTICE.md). To add a
   * licensed Alafasy recording, drop `adhan_alafasy.mp3` into res/raw and add:
   *
   *   alafasy: {
   *     id: "alafasy",
   *     name: "الشيخ مشاري العفاسي",
   *     desc: "أذان بصوت الشيخ مشاري العفاسي",
   *     sound: "adhan_alafasy",
   *     fajrSound: "adhan_fajr",
   *     icon: "fa-microphone"
   *   }
   */
  var MUEZZINS = {
    abdulbasit: {
      id: "abdulbasit",
      name: "الشيخ عبد الباسط عبد الصمد",
      desc: "الأذان الأساسي المعتمد في التطبيق",
      sound: "adhan_abdulbasit",
      fajrSound: "adhan_abdulbasit",
      isBuiltIn: true,
      icon: "fa-microphone-lines"
    },
    alafasy: {
      id: "alafasy",
      name: "الشيخ مشاري العفاسي",
      desc: "أذان بصوت الشيخ مشاري راشد العفاسي",
      sound: "adhan_alafasy",
      fajrSound: "adhan_fajr",
      downloadUrl: "https://archive.org/download/AdhanMisharyRashidAlafasy/Adhan%20-%20Mishary%20Rashid%20Alafasy.mp3",
      icon: "fa-microphone"
    },
    makkah: {
      id: "makkah",
      name: "أذان الحرم المكي",
      desc: "تسجيل الأذان من الحرم المكي الشريف",
      sound: "adhan_makkah",
      fajrSound: "adhan_fajr",
      downloadUrl: "https://archive.org/download/azaan-of-world-mosques_202608/1st%20Haram%20Makkah%20best.mp3",
      icon: "fa-mosque"
    },
    fajr: {
      id: "fajr",
      name: "أذان الفجر (الصلاة خير من النوم)",
      desc: "تسجيل فجر مخصص مع التثويب",
      sound: "adhan_fajr",
      fajrSound: "adhan_fajr",
      downloadUrl: "https://archive.org/download/azaan-of-world-mosques_202608/2nd%20Fajr%20Haram%20Makkah%20best.mp3",
      icon: "fa-cloud-moon"
    }
  };

  var DEFAULT_PRAYERS = {
    Fajr: true,
    Dhuhr: true,
    Asr: true,
    Maghrib: true,
    Isha: true
  };

  var state = {
    settings: null,
    permissions: null,
    nextAlarm: null,
    scheduledCount: 0,
    lastSync: 0,
    lastSignal: 0,
    lastResumeSync: 0,
    lastPermissionCheck: 0,
    syncing: false,
    lastError: null
  };

  // ---------------------------------------------------------------------------
  // Environment / storage helpers
  // ---------------------------------------------------------------------------

  function isNativePlatform() {
    return Boolean(
      global.Capacitor &&
        typeof global.Capacitor.isNativePlatform === "function" &&
        global.Capacitor.isNativePlatform()
    );
  }

  function platformName() {
    try {
      return global.Capacitor && global.Capacitor.getPlatform
        ? global.Capacitor.getPlatform()
        : "web";
    } catch (e) {
      return "web";
    }
  }

  function getPlugin() {
    try {
      if (!isNativePlatform()) return null;
      return (
        (global.Capacitor &&
          global.Capacitor.Plugins &&
          global.Capacitor.Plugins.AdhanScheduler) ||
        null
      );
    } catch (e) {
      return null;
    }
  }

  function notify(message, type) {
    if (typeof global.showNotification === "function") {
      global.showNotification(message, type || "success", 3600);
    } else if (typeof global.showEnhancedNotification === "function") {
      global.showEnhancedNotification(message, type || "success", 3600);
    } else {
      console.log("[Adhan]", message);
    }
  }

  function readJSON(key, fallback) {
    try {
      var raw = global.localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      global.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn("[Adhan] localStorage write failed", e);
      return false;
    }
  }

  function clamp(value, min, max, fallback) {
    var number = Number(value);
    if (!isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  }

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  function normalizeSettings(raw) {
    var input = raw && typeof raw === "object" ? raw : {};
    var prayers = {};
    PRAYERS.forEach(function (prayer) {
      prayers[prayer.key] =
        input.prayers && typeof input.prayers[prayer.key] === "boolean"
          ? input.prayers[prayer.key]
          : DEFAULT_PRAYERS[prayer.key];
    });

    return {
      enabled: input.enabled !== false, // Defaults to true (auto-enabled on first launch)
      muezzin: MUEZZINS[input.muezzin] ? input.muezzin : "abdulbasit",
      volume: clamp(input.volume, 0.05, 1, 1),
      prayers: prayers,
      daysAhead: 7,
      notifyOnly: input.notifyOnly === true
    };
  }

  function loadSettings() {
    return normalizeSettings(readJSON(SETTINGS_KEY, null));
  }

  function saveSettings() {
    writeJSON(SETTINGS_KEY, state.settings);
  }

  function getSettings() {
    if (!state.settings) state.settings = loadSettings();
    return state.settings;
  }

  function updateSettings(patch) {
    var next = normalizeSettings(
      Object.assign({}, getSettings(), patch || {})
    );
    if (patch && patch.prayers) {
      next.prayers = Object.assign({}, getSettings().prayers, patch.prayers);
    }
    state.settings = next;
    saveSettings();
    return next;
  }

  // ---------------------------------------------------------------------------
  // Date helpers (local timezone, no external dependencies)
  // ---------------------------------------------------------------------------

  function pad2(value) {
    return value < 10 ? "0" + value : String(value);
  }

  function dateKey(date) {
    return (
      date.getFullYear() +
      "-" +
      pad2(date.getMonth() + 1) +
      "-" +
      pad2(date.getDate())
    );
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function addDays(date, days) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  }

  function parseTimeValue(value) {
    var match = String(value || "").match(/(\d{1,2}):(\d{2})/);
    if (!match) return null;
    var hours = parseInt(match[1], 10);
    var minutes = parseInt(match[2], 10);
    if (hours > 23 || minutes > 59) return null;
    return { hours: hours, minutes: minutes, text: pad2(hours) + ":" + pad2(minutes) };
  }

  function parseAladhanDay(day) {
    if (!day || !day.date) return null;
    var gregorian = day.date.gregorian;
    if (gregorian && typeof gregorian.date === "string") {
      var parts = gregorian.date.split("-");
      if (parts.length === 3) {
        return new Date(
          parseInt(parts[2], 10),
          parseInt(parts[1], 10) - 1,
          parseInt(parts[0], 10)
        );
      }
    }
    if (typeof day.date.timestamp === "number") {
      return new Date(day.date.timestamp * 1000);
    }
    return null;
  }

  function formatNextAlarm(alarm) {
    if (!alarm || !alarm.time) return "";
    var when = new Date(Number(alarm.time));
    if (isNaN(when.getTime())) return "";

    var today = startOfDay(new Date());
    var target = startOfDay(when);
    var dayLabel;
    var diff = Math.round((target.getTime() - today.getTime()) / 86400000);

    if (diff <= 0) {
      dayLabel = "اليوم";
    } else if (diff === 1) {
      dayLabel = "غداً";
    } else {
      try {
        dayLabel = new Intl.DateTimeFormat("ar-EG", {
          weekday: "long"
        }).format(when);
      } catch (e) {
        dayLabel = dateKey(when);
      }
    }

    var timeLabel;
    try {
      timeLabel = new Intl.DateTimeFormat("ar-EG", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
      }).format(when);
    } catch (e) {
      timeLabel = pad2(when.getHours()) + ":" + pad2(when.getMinutes());
    }

    var prayerName = "";
    PRAYERS.forEach(function (prayer) {
      if (prayer.key === alarm.prayer) prayerName = prayer.name;
    });
    if (!prayerName && alarm.label) prayerName = alarm.label;

    return dayLabel + " — " + timeLabel + (prayerName ? " — " + prayerName : "");
  }

  // ---------------------------------------------------------------------------
  // AlAdhan calendar (7-day rolling window + offline cache)
  // ---------------------------------------------------------------------------

  function getPrayerCalcConfig() {
    if (global.TazkeerUtils && typeof global.TazkeerUtils.getPrayerSettings === "function") {
      return global.TazkeerUtils.getPrayerSettings();
    }
    return {
      method: "auto",
      school: 0,
      offsets: { Fajr: 0, Dhuhr: 0, Asr: 0, Maghrib: 0, Isha: 0 },
      manualCity: null
    };
  }

  function getLocation() {
    var calcCfg = getPrayerCalcConfig();
    if (
      calcCfg &&
      calcCfg.manualCity &&
      isFinite(calcCfg.manualCity.lat) &&
      isFinite(calcCfg.manualCity.lng)
    ) {
      return {
        lat: Number(calcCfg.manualCity.lat),
        lng: Number(calcCfg.manualCity.lng),
        city: calcCfg.manualCity.nameAr || "مدينة مختارة"
      };
    }
    var saved = readJSON("prayerLocation", null);
    if (saved && isFinite(saved.latitude) && isFinite(saved.longitude)) {
      return {
        lat: Number(saved.latitude),
        lng: Number(saved.longitude),
        city: saved.city || "موقعك"
      };
    }
    return { lat: 30.0444, lng: 31.2357, city: "القاهرة" };
  }

  function resolveCalcParams(lat, lng) {
    if (global.TazkeerUtils && typeof global.TazkeerUtils.buildAlAdhanQueryParams === "function") {
      return global.TazkeerUtils.buildAlAdhanQueryParams(lat, lng, getPrayerCalcConfig());
    }
    return {
      method: 5,
      school: 0,
      queryString:
        "latitude=" + encodeURIComponent(lat) + "&longitude=" + encodeURIComponent(lng) + "&method=5&school=0"
    };
  }

  function calendarCacheKey(lat, lng, year, month, method, school) {
    var m = method !== undefined ? method : resolveCalcParams(lat, lng).method;
    var s = school !== undefined ? school : resolveCalcParams(lat, lng).school;
    return (
      CALENDAR_PREFIX +
      "." +
      lat.toFixed(2) +
      "." +
      lng.toFixed(2) +
      ".m" +
      m +
      ".s" +
      s +
      "." +
      year +
      "-" +
      month
    );
  }

  function syncOfflineCalendar(lat, lng, year, month, days, method, school) {
    if (!Array.isArray(days) || !days.length) return false;
    var key = calendarCacheKey(Number(lat), Number(lng), Number(year), Number(month), method, school);
    return writeJSON(key, { savedAt: Date.now(), days: days });
  }

  function fetchWithTimeout(url, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        reject(new Error("request timeout"));
      }, timeoutMs);

      global
        .fetch(url, { cache: "no-store" })
        .then(
          function (response) {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(response);
          },
          function (error) {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(error);
          }
        );
    });
  }

  async function fetchMonthDays(lat, lng, year, month) {
    var calc = resolveCalcParams(lat, lng);
    var key = calendarCacheKey(lat, lng, year, month, calc.method, calc.school);
    var cached = readJSON(key, null);
    if (
      cached &&
      Array.isArray(cached.days) &&
      cached.days.length &&
      Date.now() - Number(cached.savedAt || 0) < CALENDAR_TTL_MS
    ) {
      return cached.days;
    }

    var url =
      "https://api.aladhan.com/v1/calendar?" +
      calc.queryString +
      "&month=" +
      month +
      "&year=" +
      year;

    var response = await fetchWithTimeout(url, 15000);
    if (!response.ok) throw new Error("AlAdhan HTTP " + response.status);

    var payload = await response.json();
    if (!payload || !Array.isArray(payload.data)) {
      throw new Error("AlAdhan returned an invalid calendar payload");
    }

    writeJSON(key, { savedAt: Date.now(), days: payload.data });
    return payload.data;
  }

  async function collectDays(lat, lng, daysAhead) {
    var today = startOfDay(new Date());
    var monthRequests = {};
    var index;

    for (index = 0; index < daysAhead; index++) {
      var cursor = addDays(today, index);
      monthRequests[cursor.getFullYear() + "-" + (cursor.getMonth() + 1)] = {
        year: cursor.getFullYear(),
        month: cursor.getMonth() + 1
      };
    }

    var monthKeys = Object.keys(monthRequests);
    var monthResults = await Promise.all(
      monthKeys.map(function (key) {
        var item = monthRequests[key];
        return fetchMonthDays(lat, lng, item.year, item.month).catch(function (
          error
        ) {
          console.warn(
            "[Adhan] Calendar fetch failed for " + key + ":",
            error && error.message
          );
          return null;
        });
      })
    );

    var byDate = {};
    monthResults.forEach(function (days) {
      if (!Array.isArray(days)) return;
      days.forEach(function (day) {
        var parsed = parseAladhanDay(day);
        if (parsed && day.timings) {
          byDate[dateKey(parsed)] = day.timings;
        }
      });
    });

    var collected = [];
    for (index = 0; index < daysAhead; index++) {
      var date = addDays(today, index);
      var timings = byDate[dateKey(date)];
      if (timings) {
        collected.push({ date: date, timings: timings });
      }
    }

    // Offline fallback for *today only*: reuse the timings cached by script.js
    // so a device that has never downloaded a calendar still gets today's
    // remaining adhans.
    if (!collected.length) {
      var cachedToday = readJSON("cachedPrayerTimes", null);
      var cachedDate = global.localStorage.getItem("cachedPrayerDate");
      var cachedLat = Number(global.localStorage.getItem("cachedPrayerLatitude"));
      var cachedLng = Number(global.localStorage.getItem("cachedPrayerLongitude"));
      var cacheMatchesLocation =
        Number.isFinite(cachedLat) &&
        Number.isFinite(cachedLng) &&
        Math.abs(cachedLat - lat) < 0.01 &&
        Math.abs(cachedLng - lng) < 0.01;
      if (
        cachedToday &&
        typeof cachedToday === "object" &&
        cachedDate === dateKey(today) &&
        cacheMatchesLocation
      ) {
        collected.push({ date: today, timings: cachedToday });
      }
    }

    return collected;
  }

  function resolveFajrSound(muezzin) {
    // Use dedicated Fajr recording if downloaded; otherwise fall back to the selected muezzin's sound.
    if (isMuezzinReady("fajr")) {
      return "adhan_fajr";
    }
    return (muezzin && muezzin.sound) || "adhan_abdulbasit";
  }

  function buildAlarms(days, settings) {
    var muezzin = MUEZZINS[settings.muezzin] || MUEZZINS.abdulbasit;
    var calcCfg = getPrayerCalcConfig();
    var offsets = (calcCfg && calcCfg.offsets) || {};
    var now = Date.now();
    var alarms = [];

    days.forEach(function (day, dayIndex) {
      PRAYERS.forEach(function (prayer, prayerIndex) {
        if (!settings.prayers[prayer.key]) return;

        var rawTime = day.timings[prayer.key];
        var offsetMin = Number(offsets[prayer.key]) || 0;
        if (
          offsetMin !== 0 &&
          global.TazkeerUtils &&
          typeof global.TazkeerUtils.applyMinuteOffset === "function"
        ) {
          rawTime = global.TazkeerUtils.applyMinuteOffset(rawTime, offsetMin);
        }

        var parsed = parseTimeValue(rawTime);
        if (!parsed) return;

        var when = new Date(
          day.date.getFullYear(),
          day.date.getMonth(),
          day.date.getDate(),
          parsed.hours,
          parsed.minutes,
          0,
          0
        );
        var time = when.getTime();
        if (!isFinite(time) || time <= now + 3000) return;

        var isFajr = prayer.key === "Fajr";
        alarms.push({
          id: dayIndex * 10 + prayerIndex,
          time: time,
          date: dateKey(when),
          timeOfDay: parsed.text,
          prayer: prayer.key,
          label: "حان الآن وقت صلاة " + prayer.name,
          sound: isFajr ? resolveFajrSound(muezzin) : muezzin.sound,
          fajr: isFajr,
          volume: settings.volume
        });
      });
    });

    alarms.sort(function (a, b) {
      return a.time - b.time;
    });
    return alarms;
  }

  // ---------------------------------------------------------------------------
  // Native synchronisation
  // ---------------------------------------------------------------------------

  async function pushWidgetPrayerSchedule(days) {
    var plugin = getPlugin();
    if (!isNativePlatform() || !plugin || typeof plugin.updateWidgetData !== "function") {
      return;
    }
    try {
      var list = [];
      var now = Date.now();
      var cfg = getPrayerCalcConfig();
      var savedLoc = readJSON("prayerLocation", null);
      var cityName =
        (cfg && cfg.manualCity && cfg.manualCity.nameAr) ||
        (savedLoc && savedLoc.city) ||
        "";

      (days || []).forEach(function (day) {
        if (!day || !day.date || !day.timings) return;
        PRAYERS.forEach(function (p) {
          var rawTime = day.timings[p.key];
          var hhmm = typeof rawTime === "string" ? rawTime.slice(0, 5) : "";
          if (!/^\d{2}:\d{2}$/.test(hhmm)) return;
          var parts = hhmm.split(":");
          var dParts = day.date.split("-");
          if (dParts.length !== 3) return;
          var dt = new Date(
            Number(dParts[0]),
            Number(dParts[1]) - 1,
            Number(dParts[2]),
            Number(parts[0]),
            Number(parts[1]),
            0,
            0
          );
          var epoch = dt.getTime();
          if (epoch > now + 1000) {
            list.push({
              prayer: p.key,
              nameAr: "صلاة " + p.name,
              date: day.date,
              timeOfDay: hhmm,
              time: epoch
            });
          }
        });
      });

      await plugin.updateWidgetData({
        city: cityName,
        prayers: list
      });
    } catch (err) {
      console.warn("[Adhan] Widget data sync failed", err);
    }
  }

  async function syncSchedule(reason) {
    var settings = getSettings();
    var plugin = getPlugin();

    if (!isNativePlatform() || !plugin) {
      renderStatus();
      return false;
    }

    if (state.syncing) return false;
    state.syncing = true;
    state.lastError = null;
    renderStatus();

    try {
      var location = getLocation();
      var days = await collectDays(location.lat, location.lng, settings.daysAhead);

      // Always keep the Android home-screen widget synced with the latest prayers & city
      // even if the user disabled Adhan audio playback.
      if (days && days.length) {
        await pushWidgetPrayerSchedule(days);
      }

      if (!settings.enabled) {
        await plugin.cancelAllAlarms();
        state.nextAlarm = null;
        state.scheduledCount = 0;
        state.lastSync = Date.now();
        return true;
      }

      if (!days.length) {
        state.lastError =
          "لا توجد بيانات مواقيت محفوظة. اتصل بالإنترنت مرة واحدة لجدولة الأذان.";
        // Do not wipe a previously working native schedule.
        await refreshNextAlarm();
        return false;
      }

      var alarms = buildAlarms(days, settings);
      if (!alarms.length) {
        state.lastError = "مواقيت الصلاة الحالية غير صالحة للجدولة.";
        await refreshNextAlarm();
        return false;
      }
      var result = await plugin.scheduleAlarms({ alarms: alarms });

      state.lastSync = Date.now();
      state.scheduledCount =
        result && typeof result.scheduled === "number"
          ? result.scheduled
          : alarms.length;
      state.nextAlarm = alarms.length
        ? {
            time: alarms[0].time,
            prayer: alarms[0].prayer,
            label: alarms[0].label
          }
        : null;

      if (!result.exactAlarms) {
        state.lastError =
          "المنبهات الدقيقة غير مفعّلة — قد يتأخر الأذان. فعّلها من قسم التشغيل الموثوق.";
      }

      console.log(
        "[Adhan] Synced " +
          state.scheduledCount +
          "/" +
          alarms.length +
          " alarms (" +
          (reason || "manual") +
          ")"
      );

      await refreshNextAlarm();
      return state.scheduledCount > 0;
    } catch (error) {
      state.lastError = (error && error.message) || "تعذر جدولة الأذان";
      console.error("[Adhan] schedule sync failed:", error);
      return false;
    } finally {
      state.syncing = false;
      renderStatus();
    }
  }

  async function refreshNextAlarm() {
    var plugin = getPlugin();
    if (!plugin) {
      state.nextAlarm = null;
      state.scheduledCount = 0;
      renderStatus();
      return;
    }

    try {
      var result = await plugin.getScheduledAlarms();
      var alarms = result && result.alarms ? result.alarms : [];
      alarms.sort(function (a, b) {
        return Number(a.time) - Number(b.time);
      });
      state.nextAlarm = alarms.length ? alarms[0] : null;
      state.scheduledCount = alarms.length;
    } catch (error) {
      console.warn("[Adhan] Could not read native schedule", error);
    }
    renderStatus();
  }

  function scheduleResync(delayMs) {
    if (state._resyncTimer) clearTimeout(state._resyncTimer);
    state._resyncTimer = setTimeout(function () {
      if (isNativePlatform()) {
        syncSchedule("configuration");
      }
    }, Math.max(0, delayMs || 800));
  }

  // ---------------------------------------------------------------------------
  // Permissions
  // ---------------------------------------------------------------------------

  async function refreshPermissions(force) {
    var plugin = getPlugin();

    if (!plugin) {
      state.permissions = { native: false };
      updatePermissionUI();
      return state.permissions;
    }

    var now = Date.now();
    if (
      !force &&
      state.permissions &&
      state.permissions.native &&
      now - state.lastPermissionCheck < PERMISSION_THROTTLE_MS
    ) {
      updatePermissionUI();
      return state.permissions;
    }

    try {
      state.permissions = await plugin.checkPermissions();
      state.permissions.native = true;
    } catch (error) {
      console.warn("[Adhan] checkPermissions failed", error);
      state.permissions = { native: true, error: error && error.message };
    }

    state.lastPermissionCheck = Date.now();
    updatePermissionUI();
    return state.permissions;
  }

  function permissionRowId(kind) {
    if (kind === "notifications") return "adhanPermNotif";
    if (kind === "exact") return "adhanPermExact";
    if (kind === "battery") return "adhanPermBattery";
    return "";
  }

  function setPermissionRow(kind, ok, description) {
    var row = document.getElementById(permissionRowId(kind));
    if (!row) return;
    var isOptional = kind === "battery";
    var badge = row.querySelector(".adhan-perm-badge");
    var desc = row.querySelector(".adhan-perm-desc");
    var button = row.querySelector(".adhan-perm-fix");

    if (badge) {
      badge.classList.toggle("is-ok", !!ok);
      badge.classList.toggle("is-optional", isOptional && !ok);
      badge.innerHTML = ok
        ? '<i class="fas fa-check"></i>'
        : isOptional
          ? '<i class="fas fa-circle-info"></i>'
          : '<i class="fas fa-exclamation"></i>';
    }
    if (desc) desc.textContent = description;
    if (button) {
      button.disabled = !!ok || !isNativePlatform();
      button.textContent = ok ? "تم" : isOptional ? "إعداد" : "تفعيل";
    }
  }

  function updatePermissionUI() {
    var permissions = state.permissions || { native: false };

    if (!isNativePlatform()) {
      setPermissionRow(
        "notifications",
        false,
        "تعمل الإشعارات في تطبيق أندرويد فقط"
      );
      setPermissionRow(
        "exact",
        false,
        "المنبهات الدقيقة متاحة داخل تطبيق أندرويد"
      );
      setPermissionRow(
        "battery",
        false,
        "اختياري — متاح داخل تطبيق أندرويد فقط"
      );
      return;
    }

    if (permissions.error) {
      setPermissionRow("notifications", false, "تعذر قراءة حالة الإشعارات");
      setPermissionRow("exact", false, "تعذر قراءة حالة المنبهات الدقيقة");
      setPermissionRow("battery", false, "اختياري — تعذر قراءة حالة البطارية");
      return;
    }

    var notificationsOk =
      permissions.notifications === true &&
      permissions.notificationRuntimePermission !== false;
    setPermissionRow(
      "notifications",
      notificationsOk,
      notificationsOk
        ? "إشعار الأذان سيظهر على الشاشة"
        : "اسمح بالإشعارات ليظهر تنبيه الأذان"
    );

    var exactOk = permissions.exactAlarms === true;
    setPermissionRow(
      "exact",
      exactOk,
      exactOk
        ? "المنبهات الدقيقة مفعّلة — الأذان في الثانية المحددة"
        : "فعّل «المنبهات والتذكيرات» لضبط الأذان بدقة"
    );

    var batteryOk = permissions.batteryOptimizations === true;
    setPermissionRow(
      "battery",
      batteryOk,
      batteryOk
        ? "مفعّل (اختياري) — التطبيق مستثنى من توفير البطارية"
        : "اختياري وليس إجبارياً — يُنصح به فقط إذا تأخر الأذان في الخلفية"
    );

    var permSummary = document.getElementById("adhanPermSummary");
    if (permSummary) {
      if (!isNativePlatform()) {
        permSummary.textContent = "أندرويد فقط";
        permSummary.classList.remove("is-ok", "is-warn");
      } else if (notificationsOk && exactOk) {
        permSummary.textContent = "مفعّلة بالكامل";
        permSummary.classList.add("is-ok");
        permSummary.classList.remove("is-warn");
      } else {
        permSummary.textContent = "تحتاج تفعيل";
        permSummary.classList.add("is-warn");
        permSummary.classList.remove("is-ok");
      }
    }
  }

  async function fixPermission(kind) {
    var plugin = getPlugin();
    if (!plugin) {
      notify(
        "إعدادات الأذان المتقدمة تعمل داخل تطبيق أندرويد فقط.",
        "info"
      );
      return;
    }

    var method = {
      notifications: "requestNotificationPermission",
      exact: "requestExactAlarmPermission",
      battery: "requestBatteryOptimizationExemption"
    }[kind];

    if (!method || typeof plugin[method] !== "function") return;

    try {
      await plugin[method]();
      if (kind === "notifications") {
        notify("تم تحديث إذن الإشعارات", "success");
      } else {
        notify("اتبع الخطوات في شاشة الإعدادات ثم عُد للتطبيق", "info");
      }
    } catch (error) {
      console.warn("[Adhan] permission request failed", error);
      notify("تعذر فتح إعدادات النظام. افتح إعدادات التطبيق يدوياً.", "error");
    }

    setTimeout(function () {
      refreshPermissions(true);
    }, 1200);
  }

  // ---------------------------------------------------------------------------
  // UI rendering
  // ---------------------------------------------------------------------------

  function arNum(value) {
    if (typeof global.toArabicDigits === "function") {
      return global.toArabicDigits(value);
    }
    var digits = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
    return String(value).replace(/[0-9]/g, function (d) {
      return digits[+d];
    });
  }

  var downloadingMuezzins = {};
  var downloadingProgress = {};

  function isMuezzinReady(key) {
    var item = MUEZZINS[key];
    if (!item) return false;
    if (item.isBuiltIn) return true;
    var downloaded = readJSON("adhan_downloaded_muezzins.v1", {});
    return Boolean(downloaded[key] || downloaded[item.sound]);
  }

  async function syncDownloadedMuezzins() {
    var plugin = getPlugin();
    if (!plugin || typeof plugin.isMuezzinDownloaded !== "function") return;
    var downloaded = readJSON("adhan_downloaded_muezzins.v1", {});
    var keys = Object.keys(MUEZZINS);
    var changed = false;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var item = MUEZZINS[k];
      if (!item.isBuiltIn) {
        try {
          var res = await plugin.isMuezzinDownloaded({ sound: item.sound });
          if (res && res.downloaded && !downloaded[k]) {
            downloaded[k] = true;
            downloaded[item.sound] = true;
            changed = true;
          }
        } catch (e) {}
      }
    }
    if (changed) {
      writeJSON("adhan_downloaded_muezzins.v1", downloaded);
      renderMuezzinList();
    }
  }

  async function downloadMuezzin(key) {
    var item = MUEZZINS[key];
    if (!item || item.isBuiltIn || !item.downloadUrl) return;
    if (downloadingMuezzins[key]) return;

    var plugin = getPlugin();
    if (!isNativePlatform() || !plugin || typeof plugin.downloadMuezzin !== "function") {
      notify("تنزيل أصوات المؤذنين للاستخدام دون اتصال متاح داخل تطبيق أندرويد فقط.", "info");
      return;
    }

    downloadingMuezzins[key] = true;
    downloadingProgress[key] = { percent: 0 };
    renderMuezzinList();
    notify("جارٍ تحميل أذان " + item.name + "...", "info");

    var success = false;
    try {
      var res = await plugin.downloadMuezzin({
        sound: item.sound,
        url: item.downloadUrl
      });
      if (res && res.success) {
        success = true;
      }
    } catch (err) {
      console.error("[Adhan] download error", err);
    }

    delete downloadingMuezzins[key];
    delete downloadingProgress[key];

    if (success) {
      var downloaded = readJSON("adhan_downloaded_muezzins.v1", {});
      downloaded[key] = true;
      downloaded[item.sound] = true;
      writeJSON("adhan_downloaded_muezzins.v1", downloaded);
      notify("تم تحميل أذان " + item.name + " بنجاح!", "success");
      selectMuezzin(key);
    } else {
      renderMuezzinList();
      notify("تعذر تحميل أذان " + item.name + ". تأكد من اتصال الإنترنت.", "error");
    }
  }

  function renderMuezzinList() {
    var container = document.getElementById("adhanMuezzinList");
    if (!container) return;

    var current = getSettings().muezzin;
    var downloaded = readJSON("adhan_downloaded_muezzins.v1", {});
    var html = "";
    Object.keys(MUEZZINS).forEach(function (key) {
      var item = MUEZZINS[key];
      var isReady = item.isBuiltIn || Boolean(downloaded[key] || downloaded[item.sound]);
      var isDownloading = Boolean(downloadingMuezzins[key]);
      var isSelected = key === current;

      var actionHtml = "";
      if (item.isBuiltIn) {
        actionHtml = '<span class="adhan-badge-builtin"><i class="fas fa-bolt"></i> أساسي</span>';
      } else if (isDownloading) {
        var prog = downloadingProgress[key];
        var pctVal = prog && typeof prog.percent === "number" && prog.percent >= 0 ? Math.min(100, Math.round(prog.percent)) : null;
        var pctLabel = pctVal !== null ? arNum(pctVal) + "٪" : "جارٍ التحميل";
        var fillW = pctVal !== null ? pctVal : 25;
        actionHtml =
          '<span class="adhan-muezzin-downloading" id="adhanDlBadge_' + key + '">' +
          '<span class="adhan-muezzin-dl-row"><i class="fas fa-spinner fa-spin"></i> <span class="adhan-dl-pct">' + pctLabel + '</span></span>' +
          '<span class="adhan-muezzin-dl-bar"><span class="adhan-muezzin-dl-fill" style="width:' + fillW + '%"></span></span>' +
          '</span>';
      } else if (isReady) {
        actionHtml = '<span class="adhan-badge-downloaded"><i class="fas fa-check"></i> جاهز</span>';
      } else {
        actionHtml = '<button type="button" class="adhan-download-btn" onclick="event.stopPropagation(); AdhanNative.downloadMuezzin(\'' + key + '\')" title="تحميل الصوت"><i class="fas fa-download"></i> تحميل</button>';
      }

      html +=
        '<div class="adhan-muezzin-card' +
        (isSelected ? " is-selected" : "") +
        (!isReady && !isDownloading ? " is-not-ready" : "") +
        '" role="button" tabindex="0" data-muezzin="' +
        key +
        '" onclick="AdhanNative.selectMuezzin(\'' +
        key +
        "')\">" +
        '<span class="adhan-muezzin-icon"><i class="fas ' +
        item.icon +
        '"></i></span>' +
        '<span class="adhan-muezzin-text">' +
        '<span class="adhan-muezzin-name">' +
        item.name +
        "</span>" +
        '<span class="adhan-muezzin-desc">' +
        item.desc +
        "</span>" +
        "</span>" +
        '<span class="adhan-muezzin-action">' +
        actionHtml +
        "</span>" +
        '<span class="adhan-muezzin-check"><i class="fas fa-circle-check"></i></span>' +
        "</div>";
    });

    container.innerHTML = html;

    var selectedMeta = document.getElementById("adhanSelectedMuezzinSummary");
    if (selectedMeta && MUEZZINS[current]) {
      selectedMeta.textContent = MUEZZINS[current].name;
    }
  }

  function renderPrayerGrid() {
    var container = document.getElementById("adhanPrayerGrid");
    if (!container) return;
    var settings = getSettings();
    var html = "";

    PRAYERS.forEach(function (prayer) {
      html +=
        '<button type="button" class="adhan-prayer-chip' +
        (settings.prayers[prayer.key] ? " is-on" : "") +
        '" data-prayer="' +
        prayer.key +
        '" onclick="AdhanNative.togglePrayer(\'' +
        prayer.key +
        "')\">" +
        '<i class="fas ' +
        prayer.icon +
        '"></i>' +
        "<span>" +
        prayer.name +
        "</span>" +
        "</button>";
    });

    container.innerHTML = html;
  }

  function renderStatus() {
    var settings = getSettings();
    var native = isNativePlatform();
    var plugin = getPlugin();

    var toggle = document.getElementById("adhanEnabledToggle");
    if (toggle) toggle.checked = settings.enabled;

    var volume = document.getElementById("adhanVolume");
    if (volume) volume.value = String(Math.round(settings.volume * 100));
    var volumeValue = document.getElementById("adhanVolumeValue");
    if (volumeValue)
      volumeValue.textContent = arNum(Math.round(settings.volume * 100)) + "٪";

    var statusPill = document.getElementById("adhanStatusPill");
    var summary = document.getElementById("adhanSummary");
    var headerButton = document.getElementById("adhanHeaderBtn");

    var statusText;
    if (!native) {
      statusText = "وضع المتصفح";
    } else if (!plugin) {
      statusText = "غير مهيأ";
    } else if (!settings.enabled) {
      statusText = "متوقف";
    } else if (state.scheduledCount > 0) {
      statusText = "مفعّل — " + arNum(state.scheduledCount) + " مواعيد";
    } else {
      statusText = "مفعّل";
    }

    if (statusPill) {
      statusPill.textContent = statusText;
      statusPill.classList.toggle(
        "is-on",
        native && !!plugin && settings.enabled
      );
    }

    if (headerButton) {
      headerButton.classList.toggle("is-active", settings.enabled);
    }

    var summaryHtml = "";
    if (!native) {
      summaryHtml =
        '<i class="fas fa-mobile-screen-button"></i><span>الأذان في الخلفية يعمل داخل تطبيق أندرويد. في المتصفح تعمل المواقيت فقط.</span>';
    } else if (!settings.enabled) {
      summaryHtml =
        '<i class="fas fa-bell-slash"></i><span>الأذان متوقف — فعّله ليصدح في وقت كل صلاة حتى لو كان التطبيق مغلقاً.</span>';
    } else if (state.nextAlarm) {
      summaryHtml =
        '<i class="fas fa-bell"></i><span>الأذان القادم: <strong>' +
        formatNextAlarm(state.nextAlarm) +
        "</strong></span>";
    } else if (state.lastError) {
      summaryHtml =
        '<i class="fas fa-triangle-exclamation"></i><span>' +
        state.lastError +
        "</span>";
    } else {
      summaryHtml =
        '<i class="fas fa-hourglass-half"></i><span>جارٍ تجهيز جدول الأذان للأيام القادمة...</span>';
    }

    if (summary) summary.innerHTML = summaryHtml;

    var nextInfo = document.getElementById("adhanNextInfo");
    if (nextInfo) {
      if (!native) {
        nextInfo.innerHTML =
          '<i class="fas fa-circle-info"></i><span>افتح التطبيق على أندرويد لتفعيل المحرك الأصلي للأذان.</span>';
      } else if (state.nextAlarm) {
        nextInfo.innerHTML =
          '<i class="fas fa-clock"></i><span>الموعد القادم: <strong>' +
          formatNextAlarm(state.nextAlarm) +
          "</strong></span>";
      } else if (state.lastError) {
        nextInfo.innerHTML =
          '<i class="fas fa-triangle-exclamation"></i><span>' +
          state.lastError +
          "</span>";
      } else {
        nextInfo.innerHTML =
          '<i class="fas fa-circle-info"></i><span>لا توجد مواعيد مجدولة حالياً.</span>';
      }
    }

    var webNotice = document.getElementById("adhanWebNotice");
    if (webNotice) {
      webNotice.classList.toggle("is-visible", !native);
    }

    var footnote = document.getElementById("adhanFootnote");
    if (footnote) {
      footnote.textContent = native
        ? "التسجيلات الصوتية مضمّنة داخل التطبيق وتعمل دون إنترنت."
        : "لتشغيل الأذان في الخلفية ثبّت نسخة أندرويد من التطبيق.";
    }

    var generalAdhanSummary = document.getElementById("generalAdhanSummary");
    if (generalAdhanSummary) {
      var activeMuezzin = MUEZZINS[settings.muezzin] ? MUEZZINS[settings.muezzin].name : "";
      if (!native) {
        generalAdhanSummary.textContent = activeMuezzin || "تخصيص المؤذن والصلوات والصوت";
      } else if (!settings.enabled) {
        generalAdhanSummary.textContent = "الأذان متوقف حالياً";
      } else {
        generalAdhanSummary.textContent = "مفعّل • " + activeMuezzin;
      }
    }
  }

  function renderPrayerSettingsUI() {
    if (!global.TazkeerUtils) return;
    var cfg = getPrayerCalcConfig();

    // 1. Calculation method selector
    var methodSelect = document.getElementById("prayerMethodSelect");
    if (methodSelect) {
      if (!methodSelect.options.length) {
        methodSelect.innerHTML = global.TazkeerUtils.PRAYER_METHODS.map(function (m) {
          return '<option value="' + m.id + '">' + m.nameAr + "</option>";
        }).join("");
      }
      methodSelect.value = String(cfg.method);
    }

    // 2. Asr School segmented buttons
    document.querySelectorAll(".prayer-school-btn").forEach(function (btn) {
      var val = Number(btn.getAttribute("data-school"));
      btn.classList.toggle("active", val === (cfg.school === 1 ? 1 : 0));
    });

    // 3. Location mode & selected city label
    var cityStatus = document.getElementById("prayerCityCurrentLabel");
    var autoBtn = document.getElementById("prayerCityAutoBtn");
    if (cityStatus) {
      if (cfg.manualCity) {
        cityStatus.textContent =
          "مدينة يدوية: " +
          cfg.manualCity.nameAr +
          (cfg.manualCity.countryAr ? "، " + cfg.manualCity.countryAr : "");
      } else {
        cityStatus.textContent = "تحديد تلقائي عبر الموقع الجغرافي (GPS)";
      }
    }
    if (autoBtn) {
      autoBtn.classList.toggle("active", !cfg.manualCity);
    }

    renderSettingsCityList(
      (document.getElementById("prayerCitySearchInput") || {}).value || ""
    );

    var generalCitySummary = document.getElementById("generalCitySummary");
    if (generalCitySummary) {
      generalCitySummary.textContent = cfg.manualCity
        ? cfg.manualCity.nameAr + (cfg.manualCity.countryAr ? "، " + cfg.manualCity.countryAr : "")
        : "تحديد تلقائي عبر الموقع الجغرافي";
    }

    // 4. Per-prayer minute offsets
    var offsetsWrap = document.getElementById("prayerOffsetsList");
    var hasCustomOffset = false;
    if (offsetsWrap) {
      var html = PRAYERS.map(function (p) {
        var val = Number((cfg.offsets && cfg.offsets[p.key]) || 0);
        if (val !== 0) hasCustomOffset = true;
        var sign = val > 0 ? "+" : val < 0 ? "−" : "";
        var displayVal = sign + arNum(Math.abs(val)) + " د";
        return (
          '<div class="prayer-offset-row">' +
          '<span class="prayer-offset-name"><i class="fas ' + p.icon + '"></i> ' + p.name + "</span>" +
          '<div class="prayer-offset-stepper">' +
          '<button type="button" class="prayer-offset-btn" onclick="AdhanNative.adjustPrayerOffset(\'' + p.key + '\', -1)" aria-label="إنقاص دقيقة">−</button>' +
          '<span class="prayer-offset-val' + (val !== 0 ? " is-modified" : "") + '">' + displayVal + "</span>" +
          '<button type="button" class="prayer-offset-btn" onclick="AdhanNative.adjustPrayerOffset(\'' + p.key + '\', 1)" aria-label="زيادة دقيقة">+</button>' +
          "</div>" +
          "</div>"
        );
      }).join("");
      offsetsWrap.innerHTML = html;
    }

    var offsetsSummary = document.getElementById("prayerOffsetsSummary");
    if (offsetsSummary) {
      offsetsSummary.textContent = hasCustomOffset ? "معدّل" : "افتراضي";
    }
  }

  function renderSettingsCityList(query) {
    var listEl = document.getElementById("prayerCityResultsList");
    if (!listEl || !global.TazkeerUtils) return;
    var cfg = getPrayerCalcConfig();
    var selectedId = cfg.manualCity ? cfg.manualCity.id : null;
    var matches = global.TazkeerUtils.searchPresetCities(query).slice(0, 12);
    if (!matches.length) {
      listEl.innerHTML = '<div class="prayer-city-empty">لا توجد مدينة مطابقة لبحثك</div>';
      return;
    }
    listEl.innerHTML = matches
      .map(function (c) {
        var active = selectedId === c.id ? " is-selected" : "";
        return (
          '<button type="button" class="prayer-city-chip' +
          active +
          '" onclick="AdhanNative.selectManualCity(\'' +
          c.id +
          "')\">" +
          '<span class="prayer-city-chip-name">' +
          c.nameAr +
          "</span>" +
          '<span class="prayer-city-chip-country">' +
          c.countryAr +
          "</span>" +
          "</button>"
        );
      })
      .join("");
  }

  function applyPrayerCalcChange(patch, toastMsg) {
    if (!global.TazkeerUtils) return;
    global.TazkeerUtils.savePrayerSettings(patch);
    renderPrayerSettingsUI();
    if (typeof global.applyPrayerSettingsAndRefresh === "function") {
      global.applyPrayerSettingsAndRefresh();
    }
    scheduleResync(400);
    if (toastMsg) notify(toastMsg, "success");
  }

  function setCalculationMethod(methodVal) {
    var parsed = methodVal === "auto" ? "auto" : Number(methodVal);
    applyPrayerCalcChange({ method: parsed }, "تم تحديث طريقة حساب المواقيت");
  }

  function setAsrSchool(schoolVal) {
    var s = Number(schoolVal) === 1 ? 1 : 0;
    applyPrayerCalcChange(
      { school: s },
      s === 1 ? "تم اختيار المذهب الحنفي لصلاة العصر" : "تم اختيار المذهب الشافعي والجمهور لصلاة العصر"
    );
  }

  function adjustPrayerOffset(prayerKey, delta) {
    var cfg = getPrayerCalcConfig();
    var current = Number((cfg.offsets && cfg.offsets[prayerKey]) || 0);
    var next = Math.max(-30, Math.min(30, current + Number(delta || 0)));
    if (next === current) return;
    var offsetsPatch = {};
    offsetsPatch[prayerKey] = next;
    applyPrayerCalcChange({ offsets: offsetsPatch });
  }

  function resetPrayerOffsets() {
    applyPrayerCalcChange(
      { offsets: { Fajr: 0, Dhuhr: 0, Asr: 0, Maghrib: 0, Isha: 0 } },
      "تمت إعادة تعيين فروق الدقائق إلى الصفر"
    );
  }

  function selectManualCity(cityId) {
    if (!global.TazkeerUtils) return;
    var city = global.TazkeerUtils.PRESET_CITIES.find(function (c) {
      return c.id === cityId;
    });
    if (!city) return;
    applyPrayerCalcChange(
      { manualCity: city },
      "تم ضبط الموقع على مدينة " + city.nameAr
    );
  }

  function useAutoLocation() {
    applyPrayerCalcChange(
      { manualCity: null },
      "تم التبديل إلى التحديد التلقائي للموقع"
    );
  }

  var WIDGET_STYLE_STORAGE_KEY = "tazkeer_widget_style.v1";

  function syncWidgetStyleUI() {
    var group = document.getElementById("widgetStyleGroup");
    if (!group) return;
    var saved = "solid";
    try {
      saved = localStorage.getItem(WIDGET_STYLE_STORAGE_KEY) || "solid";
    } catch (_) {}
    group.querySelectorAll("[data-widget-style]").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-widget-style") === saved);
    });
  }

  async function setWidgetStyle(style) {
    var normalized = style === "translucent" || style === "glass" ? style : "solid";
    try {
      localStorage.setItem(WIDGET_STYLE_STORAGE_KEY, normalized);
    } catch (_) {}
    syncWidgetStyleUI();
    var plugin = getPlugin();
    if (isNativePlatform() && plugin && typeof plugin.setWidgetStyle === "function") {
      try {
        await plugin.setWidgetStyle({ style: normalized });
        notify("تم تحديث مظهر الويدجت", "success");
      } catch (_) {}
    }
  }

  function render() {
    renderMuezzinList();
    renderPrayerGrid();
    renderStatus();
    renderPrayerSettingsUI();
    updatePermissionUI();
    syncWidgetStyleUI();
  }

  // ---------------------------------------------------------------------------
  // UI actions
  // ---------------------------------------------------------------------------

  async function setEnabled(enabled) {
    if (!isNativePlatform()) {
      if (enabled) {
        notify(
          "ميزة الأذان في الخلفية تعمل داخل تطبيق أندرويد فقط.",
          "info"
        );
      }
      // Reset the switch: the web build cannot schedule native alarms, so
      // persisting enabled=true here would only mislead the user.
      renderStatus();
      return;
    }

    updateSettings({ enabled: !!enabled });
    renderStatus();

    var plugin = getPlugin();
    if (!plugin) {
      notify("جارٍ تهيئة محرك الأذان... أعد فتح التطبيق.", "info");
      return;
    }

    if (!enabled) {
      try {
        await plugin.cancelAllAlarms();
      } catch (error) {
        console.warn("[Adhan] cancelAllAlarms failed", error);
      }
      state.nextAlarm = null;
      state.scheduledCount = 0;
      renderStatus();
      notify("تم إيقاف الأذان", "info");
      return;
    }

    try {
      await plugin.requestNotificationPermission();
    } catch (error) {
      console.warn("[Adhan] notification permission request failed", error);
    }

    await refreshPermissions(true);
    var ok = await syncSchedule("enabled");
    if (ok) {
      notify("تم تفعيل الأذان — سيعمل حتى لو أُغلق التطبيق", "success");
    } else {
      notify(
        state.lastError || "تعذر جدولة الأذان. تحقق من الاتصال والموقع.",
        "error"
      );
    }
    render();
  }

  function selectMuezzin(id) {
    if (!MUEZZINS[id]) return;
    if (!isMuezzinReady(id)) {
      downloadMuezzin(id);
      return;
    }
    updateSettings({ muezzin: id });
    renderMuezzinList();
    renderStatus();
    notify("تم اختيار: " + MUEZZINS[id].name, "success");
    scheduleResync(900);
  }

  function togglePrayer(key) {
    var settings = getSettings();
    if (!Object.prototype.hasOwnProperty.call(settings.prayers, key)) return;
    var next = Object.assign({}, settings.prayers);
    next[key] = !next[key];
    updateSettings({ prayers: next });
    renderPrayerGrid();
    renderStatus();
    scheduleResync(900);
  }

  function setVolume(value) {
    var normalized = clamp(Number(value) / 100, 0.05, 1, 1);
    updateSettings({ volume: normalized });
    var volumeValue = document.getElementById("adhanVolumeValue");
    if (volumeValue)
      volumeValue.textContent = arNum(Math.round(normalized * 100)) + "٪";

    var plugin = getPlugin();
    if (plugin && typeof plugin.setVolume === "function") {
      plugin.setVolume({ volume: normalized }).catch(function () {});
    }

    scheduleResync(1600);
  }

  async function testAdhanNow(seconds) {
    var plugin = getPlugin();
    if (!plugin) {
      notify("تجربة الأذان متاحة داخل تطبيق أندرويد فقط.", "info");
      return;
    }

    var settings = getSettings();
    var muezzin = MUEZZINS[settings.muezzin] || MUEZZINS.abdulbasit;
    var delay = Math.max(1, Number(seconds) || 10);

    try {
      await plugin.requestNotificationPermission();
    } catch (error) {
      /* non-fatal */
    }

    try {
      var result = await plugin.testAdhan({
        delaySeconds: delay,
        soundRes: muezzin.sound,
        prayer: "تجربة",
        volume: settings.volume
      });

      if (result && result.scheduled) {
        notify(
          "سيُشغَّل الأذان بعد " + arNum(delay) + " ثوانٍ. يمكنك إغلاق التطبيق الآن.",
          "success"
        );
      } else {
        notify("تعذر جدولة تجربة الأذان.", "error");
      }
    } catch (error) {
      console.warn("[Adhan] test failed", error);
      notify("تعذر تشغيل تجربة الأذان.", "error");
    }
  }

  async function testFajrAdhan() {
    var plugin = getPlugin();
    if (!plugin) {
      notify("تجربة الأذان متاحة داخل تطبيق أندرويد فقط.", "info");
      return;
    }
    var settings = getSettings();
    var muezzin = MUEZZINS[settings.muezzin] || MUEZZINS.abdulbasit;
    var soundRes = resolveFajrSound(muezzin);
    try {
      await plugin.testAdhan({
        delaySeconds: 10,
        soundRes: soundRes,
        prayer: "الفجر",
        volume: settings.volume
      });
      notify("سيُشغَّل أذان الفجر التجريبي بعد ١٠ ثوانٍ.", "success");
    } catch (error) {
      notify("تعذر تشغيل تجربة أذان الفجر.", "error");
    }
  }

  async function stopPlayback() {
    var plugin = getPlugin();
    if (!plugin) {
      notify("لا يوجد أذان قيد التشغيل.", "info");
      return;
    }
    try {
      await plugin.stopPlayback();
      notify("تم إيقاف الأذان", "info");
    } catch (error) {
      notify("تعذر إيقاف الأذان.", "error");
    }
  }

  async function resyncNow() {
    if (!isNativePlatform()) {
      notify("إعادة المزامنة تعمل داخل تطبيق أندرويد فقط.", "info");
      return;
    }
    var ok = await syncSchedule("manual");
    await refreshPermissions(true);
    if (ok) {
      notify("تمت مزامنة مواعيد الأذان بنجاح.", "success");
    } else {
      notify(state.lastError || "تعذرت مزامنة مواعيد الأذان.", "error");
    }
  }

  // ---------------------------------------------------------------------------
  // Modal integration
  // ---------------------------------------------------------------------------

  function _closeAdhanInternal() {
    var modal = document.getElementById("adhanModal");
    if (modal) modal.style.display = "none";
    if (
      document.body.style.overflow === "hidden" &&
      (!global.AppRouter || !global.AppRouter.isModalOpen())
    ) {
      document.body.style.overflow = "";
    }
    if (global.TazkeerModalQueue) {
      global.TazkeerModalQueue.notifyClosed("first-launch-settings");
    }
  }

  function switchSettingsTab(tabKey) {
    var target = tabKey === "adhan" || tabKey === "prayer" ? tabKey : "general";
    var modal = document.getElementById("adhanModal");
    if (!modal) return;

    modal.querySelectorAll(".settings-tab-btn").forEach(function (btn) {
      var isActive = btn.getAttribute("data-settings-tab") === target;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });

    modal.querySelectorAll(".settings-tab-panel").forEach(function (panel) {
      var isActive = panel.getAttribute("data-settings-panel") === target;
      panel.classList.toggle("is-active", isActive);
    });

    var body = document.getElementById("adhanModalBody");
    if (body) body.scrollTop = 0;
  }

  function openAdhanModal(initialTab) {
    var modal = document.getElementById("adhanModal");
    if (!modal) return;

    modal.style.display = "flex";
    document.body.style.overflow = "hidden";
    switchSettingsTab(initialTab || "general");
    render();
    syncDownloadedMuezzins();
    if (typeof global.updateThemeSwitcherUI === "function") {
      global.updateThemeSwitcherUI();
    }
    refreshPermissions(true);
    refreshNextAlarm();

    // Sync Azkar Reminder toggle state
    var azkarToggle = document.getElementById("azkarReminderToggle");
    if (azkarToggle && typeof global.isAzkarReminderEnabled === "function") {
      azkarToggle.checked = global.isAzkarReminderEnabled();
    }

    if (
      global.AppRouter &&
      typeof global.AppRouter.pushModal === "function" &&
      !global.AppRouter.isModalOpen("adhan")
    ) {
      global.AppRouter.pushModal("adhan", _closeAdhanInternal);
    }
  }

  function closeAdhanModal() {
    if (
      global.AppRouter &&
      typeof global.AppRouter.isModalOpen === "function" &&
      global.AppRouter.isModalOpen("adhan")
    ) {
      global.AppRouter.closeModal("adhan");
    } else {
      _closeAdhanInternal();
    }
  }

  // ---------------------------------------------------------------------------
  // App shell: zoom lockdown, safe areas, status bar, deep links, resume hooks
  // ---------------------------------------------------------------------------

  function isInsideMushafReader(target) {
    return Boolean(
      target &&
        typeof target.closest === "function" &&
        target.closest(".mushaf-container, .mushaf-image-area, #mushafReader")
    );
  }

  function isRapidTapTarget(target) {
    if (!target) return false;
    var tag = target.tagName;
    if (
      tag === "BUTTON" ||
      tag === "A" ||
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      tag === "LABEL"
    ) {
      return true;
    }
    if (typeof target.closest === "function") {
      return Boolean(
        target.closest(
          ".misbaha-tap-btn, #misbahaOverlay, .slide-counter-btn, .azkar-slide, .azkar-slide-body, .mushaf-container, .mushaf-image-area"
        )
      );
    }
    return false;
  }

  function setupAppLockdown() {
    // Allow pinch-to-zoom inside the Mushaf reader while locking chrome UI.
    ["gesturestart", "gesturechange", "gestureend"].forEach(function (event) {
      document.addEventListener(
        event,
        function (e) {
          if (!isInsideMushafReader(e.target)) {
            e.preventDefault();
          }
        },
        { passive: false }
      );
    });

    document.addEventListener(
      "touchmove",
      function (e) {
        if (e.touches && e.touches.length > 1 && !isInsideMushafReader(e.target)) {
          e.preventDefault();
        }
      },
      { passive: false }
    );

    // Prevent double-tap to zoom on non-interactive chrome without blocking rapid Misbaha/Azkar taps.
    var lastTouchEnd = 0;
    document.addEventListener(
      "touchend",
      function (e) {
        var now = Date.now();
        if (now - lastTouchEnd <= 300) {
          if (!isRapidTapTarget(e.target)) {
            e.preventDefault();
          }
        }
        lastTouchEnd = now;
      },
      { passive: false }
    );
  }

  function updateStatusBar() {
    if (!isNativePlatform()) return;
    var statusBar =
      global.Capacitor &&
      global.Capacitor.Plugins &&
      global.Capacitor.Plugins.StatusBar;
    if (!statusBar) return;

    var darkMode = document.body.classList.contains("dark-mode");
    try {
      // Capacitor StatusBar: Style.Dark = light icons on dark background; Style.Light = dark icons on light background.
      statusBar.setStyle({ style: darkMode ? "DARK" : "LIGHT" });
      statusBar.setOverlaysWebView({ overlay: true }).catch(function () {});
      statusBar.setBackgroundColor({
        color: "#00000000"
      }).catch(function () {});
    } catch (error) {
      /* non-fatal */
    }
  }

  function handleDeepLinkUrl(url) {
    if (!url || typeof url !== "string") return;
    var match = url.match(/tazkeer:\/\/open\/([^?#]+)/i);
    if (!match || !match[1]) return;
    var target = decodeURIComponent(match[1]).trim();
    if (/^tab-(home|azkar|quran|prophets|profile)$/.test(target)) {
      if (typeof global.switchTab === "function") {
        global.switchTab(target);
      }
      return;
    }
    if (target === "kahf" || target === "surah-kahf") {
      if (typeof global.switchTab === "function") global.switchTab("tab-quran");
      if (typeof global.openSurahInMushaf === "function") {
        setTimeout(function () {
          global.openSurahInMushaf(18);
        }, 180);
      }
      return;
    }
    if (typeof global.showCategoryPage === "function") {
      if (typeof global.switchTab === "function") global.switchTab("tab-azkar");
      setTimeout(function () {
        global.showCategoryPage(target);
      }, 150);
    }
  }

  function setupNativeShell() {
    if (!isNativePlatform()) return;

    document.documentElement.classList.add("capacitor-native");
    document.body.classList.add("capacitor-native");
    document.body.classList.add("is-native-app");

    // Suppress any web install prompts/modals in the native app
    var installBtn = document.getElementById("installBtn");
    if (installBtn) installBtn.classList.add("hidden");
    var installModal = document.getElementById("installInstructionsModal");
    if (installModal) installModal.remove();

    try {
      var statusBar =
        global.Capacitor &&
        global.Capacitor.Plugins &&
        global.Capacitor.Plugins.StatusBar;
      if (statusBar) {
        statusBar.setOverlaysWebView({ overlay: true }).catch(function () {});
        statusBar.setBackgroundColor({ color: "#00000000" }).catch(function () {});
        updateStatusBar();
      }
    } catch (error) {
      /* non-fatal */
    }

    try {
      var appPlugin =
        global.Capacitor &&
        global.Capacitor.Plugins &&
        global.Capacitor.Plugins.App;
      if (appPlugin && typeof appPlugin.addListener === "function") {
        appPlugin.addListener("appStateChange", function (appState) {
          if (appState && appState.isActive) onResume();
        });
        appPlugin.addListener("appUrlOpen", function (event) {
          if (event && event.url) handleDeepLinkUrl(event.url);
        });
      }
      if (appPlugin && typeof appPlugin.getLaunchUrl === "function") {
        appPlugin
          .getLaunchUrl()
          .then(function (launch) {
            if (launch && launch.url) {
              setTimeout(function () {
                handleDeepLinkUrl(launch.url);
              }, 260);
            }
          })
          .catch(function () {});
      }
    } catch (error) {
      /* non-fatal */
    }
  }

  function onResume() {
    if (!isNativePlatform()) return;
    render();
    refreshPermissions(true);

    if (!getSettings().enabled) {
      refreshNextAlarm();
      return;
    }

    if (Date.now() - state.lastResumeSync > 60 * 1000) {
      state.lastResumeSync = Date.now();
      syncSchedule("resume");
    } else {
      refreshNextAlarm();
    }
  }

  /**
   * Called by script.js after AlAdhan returns fresh timings.
   * Reconciles the native schedule a few seconds later so the two network
   * calls do not race each other.
   */
  function onPrayerTimesUpdated(timings, city) {
    if (timings && typeof timings === "object") state.fallbackTimings = timings;
    if (!isNativePlatform()) {
      renderStatus();
      return;
    }

    renderStatus();
    if (!getSettings().enabled) return;
    if (Date.now() - state.lastSignal < RESYNC_THROTTLE_MS) return;
    state.lastSignal = Date.now();
    scheduleResync(1200);
  }

  async function getPrayerDays(daysAhead) {
    var location = getLocation();
    var count = Number(daysAhead) || 7;
    return collectDays(location.lat, location.lng, Math.max(1, Math.min(14, count)));
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------

  function init() {
    state.settings = loadSettings();
    setupAppLockdown();
    setupNativeShell();
    var pluginRef = getPlugin();
    if (isNativePlatform() && pluginRef && typeof pluginRef.addListener === "function") {
      try {
        pluginRef.addListener("adhanDownloadProgress", function (ev) {
          if (!ev || !ev.sound) return;
          var matchedKey = Object.keys(MUEZZINS).find(function (k) {
            return MUEZZINS[k] && MUEZZINS[k].sound === ev.sound;
          });
          if (!matchedKey) return;
          downloadingProgress[matchedKey] = {
            percent: typeof ev.percent === "number" ? ev.percent : -1,
            downloadedBytes: ev.downloadedBytes || 0,
            totalBytes: ev.totalBytes || 0
          };
          var badge = document.getElementById("adhanDlBadge_" + matchedKey);
          if (badge) {
            var pctTxtEl = badge.querySelector(".adhan-dl-pct");
            var fillEl = badge.querySelector(".adhan-muezzin-dl-fill");
            var pct = typeof ev.percent === "number" && ev.percent >= 0 ? Math.min(100, Math.round(ev.percent)) : null;
            if (pctTxtEl) pctTxtEl.textContent = pct !== null ? arNum(pct) + "٪" : "جارٍ التحميل";
            if (fillEl && pct !== null) fillEl.style.width = pct + "%";
          }
        });
      } catch (_) {}
    }
    render();
    refreshPermissions(true);

    if (isNativePlatform() && getSettings().enabled) {
      // Let the webview settle before doing network + native work.
      setTimeout(function () {
        syncSchedule("app-start");
      }, 900);
    } else {
      refreshNextAlarm();
    }

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) onResume();
    });

    // Reconciliation heartbeat while the UI is open (the native alarm
    // schedule itself does not depend on this).
    setInterval(
      function () {
        if (
          !document.hidden &&
          isNativePlatform() &&
          getSettings().enabled
        ) {
          syncSchedule("heartbeat");
        }
      },
      30 * 60 * 1000
    );
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  var AdhanNative = {
    isNativePlatform: isNativePlatform,
    platformName: platformName,
    getSettings: getSettings,
    updateSettings: updateSettings,
    updateStatusBar: updateStatusBar,
    syncOfflineCalendar: syncOfflineCalendar,
    refresh: render,
    refreshPermissions: refreshPermissions,
    refreshNextAlarm: refreshNextAlarm,
    syncSchedule: syncSchedule,
    getPrayerDays: getPrayerDays,
    onPrayerTimesUpdated: onPrayerTimesUpdated,
    openModal: openAdhanModal,
    closeModal: closeAdhanModal,
    switchSettingsTab: switchSettingsTab,
    setEnabled: setEnabled,
    selectMuezzin: selectMuezzin,
    downloadMuezzin: downloadMuezzin,
    togglePrayer: togglePrayer,
    setVolume: setVolume,
    setCalculationMethod: setCalculationMethod,
    setAsrSchool: setAsrSchool,
    adjustPrayerOffset: adjustPrayerOffset,
    resetPrayerOffsets: resetPrayerOffsets,
    selectManualCity: selectManualCity,
    useAutoLocation: useAutoLocation,
    renderSettingsCityList: renderSettingsCityList,
    testNow: testAdhanNow,
    testFajr: testFajrAdhan,
    stopPlayback: stopPlayback,
    resync: resyncNow,
    fixPermission: fixPermission,
    setWidgetStyle: setWidgetStyle,
    formatNextAlarm: formatNextAlarm,
    PRAYERS: PRAYERS,
    MUEZZINS: MUEZZINS
  };

  global.AdhanNative = AdhanNative;

  // Compatibility globals for inline HTML handlers / existing code.
  global.openAdhanModal = openAdhanModal;
  global.closeAdhanModal = closeAdhanModal;
  global.switchSettingsTab = switchSettingsTab;
  global.testAdhanNow = testAdhanNow;
  global.stopAdhanPlayback = stopPlayback;
  global.resyncAdhanSchedule = resyncNow;

  if (document.readyState !== "complete") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
