/**
 * ============================================================================
 * Tazkeer Shared Utilities — Arabic text, digits, HTML escaping, Prayer
 * Calculation Settings, Preset Cities, In-App Dialogs, and Sequential Modals.
 * ============================================================================
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.TazkeerUtils = api;
    root.normalizeArabic = api.normalizeArabic;
    root.toArabicDigits = api.toArabicDigits;
    root.escapeHtml = api.escapeHtml;
    root.AppDialog = api.AppDialog;
    root.TazkeerModalQueue = api.ModalQueue;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this, function (root) {
  "use strict";

  var PRAYER_SETTINGS_KEY = "tazkeer_prayer_settings_v1";
  var ARABIC_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];

  var PRAYER_METHODS = [
    { id: "auto", label: "تلقائي حسب الموقع (موصى به)" },
    { id: 5, label: "الهيئة المصرية العامة للمساحة" },
    { id: 4, label: "أم القرى — مكة المكرمة" },
    { id: 3, label: "رابطة العالم الإسلامي (MWL)" },
    { id: 2, label: "الجمعية الإسلامية لأمريكا الشمالية (ISNA)" },
    { id: 8, label: "منطقة الخليج" },
    { id: 9, label: "الكويت" },
    { id: 10, label: "قطر" },
    { id: 16, label: "دبي" },
    { id: 1, label: "جامعة العلوم الإسلامية — كراتشي" },
    { id: 13, label: "رئاسة الشؤون الدينية — تركيا" },
    { id: 18, label: "تونس" },
    { id: 19, label: "الجزائر" },
    { id: 21, label: "المغرب" },
    { id: 23, label: "الأردن" },
  ];

  var PRESET_CITIES = [
    { id: "cairo", name: "القاهرة", country: "مصر", lat: 30.0444, lng: 31.2357 },
    { id: "alexandria", name: "الإسكندرية", country: "مصر", lat: 31.2001, lng: 29.9187 },
    { id: "giza", name: "الجيزة", country: "مصر", lat: 30.0131, lng: 31.2089 },
    { id: "mansoura", name: "المنصورة", country: "مصر", lat: 31.0409, lng: 31.3785 },
    { id: "aswan", name: "أسوان", country: "مصر", lat: 24.0889, lng: 32.8998 },
    { id: "makkah", name: "مكة المكرمة", country: "السعودية", lat: 21.4225, lng: 39.8262 },
    { id: "madinah", name: "المدينة المنورة", country: "السعودية", lat: 24.4672, lng: 39.6111 },
    { id: "riyadh", name: "الرياض", country: "السعودية", lat: 24.7136, lng: 46.6753 },
    { id: "jeddah", name: "جدة", country: "السعودية", lat: 21.4858, lng: 39.1925 },
    { id: "dammam", name: "الدمام", country: "السعودية", lat: 26.4207, lng: 50.0888 },
    { id: "dubai", name: "دبي", country: "الإمارات", lat: 25.2048, lng: 55.2708 },
    { id: "abudhabi", name: "أبوظبي", country: "الإمارات", lat: 24.4539, lng: 54.3773 },
    { id: "doha", name: "الدوحة", country: "قطر", lat: 25.2854, lng: 51.531 },
    { id: "kuwait", name: "مدينة الكويت", country: "الكويت", lat: 29.3759, lng: 47.9774 },
    { id: "manama", name: "المنامة", country: "البحرين", lat: 26.2285, lng: 50.586 },
    { id: "muscat", name: "مسقط", country: "عُمان", lat: 23.588, lng: 58.3829 },
    { id: "amman", name: "عمّان", country: "الأردن", lat: 31.9454, lng: 35.9284 },
    { id: "jerusalem", name: "القدس", country: "فلسطين", lat: 31.7683, lng: 35.2137 },
    { id: "beirut", name: "بيروت", country: "لبنان", lat: 33.8938, lng: 35.5018 },
    { id: "damascus", name: "دمشق", country: "سوريا", lat: 33.5138, lng: 36.2765 },
    { id: "baghdad", name: "بغداد", country: "العراق", lat: 33.3152, lng: 44.3661 },
    { id: "casablanca", name: "الدار البيضاء", country: "المغرب", lat: 33.5731, lng: -7.5898 },
    { id: "rabat", name: "الرباط", country: "المغرب", lat: 34.0209, lng: -6.8416 },
    { id: "algiers", name: "الجزائر", country: "الجزائر", lat: 36.7538, lng: 3.0588 },
    { id: "tunis", name: "تونس", country: "تونس", lat: 36.8065, lng: 10.1815 },
    { id: "tripoli", name: "طرابلس", country: "ليبيا", lat: 32.8872, lng: 13.1913 },
    { id: "khartoum", name: "الخرطوم", country: "السودان", lat: 15.5007, lng: 32.5599 },
    { id: "sanaa", name: "صنعاء", country: "اليمن", lat: 15.3694, lng: 44.191 },
    { id: "istanbul", name: "إسطنبول", country: "تركيا", lat: 41.0082, lng: 28.9784 },
    { id: "london", name: "لندن", country: "المملكة المتحدة", lat: 51.5074, lng: -0.1278 },
    { id: "paris", name: "باريس", country: "فرنسا", lat: 48.8566, lng: 2.3522 },
    { id: "berlin", name: "برلين", country: "ألمانيا", lat: 52.52, lng: 13.405 },
    { id: "newyork", name: "نيويورك", country: "الولايات المتحدة", lat: 40.7128, lng: -74.006 },
    { id: "toronto", name: "تورنتو", country: "كندا", lat: 43.6532, lng: -79.3832 },
    { id: "kualalumpur", name: "كوالالمبور", country: "ماليزيا", lat: 3.139, lng: 101.6869 },
    { id: "jakarta", name: "جاكرتا", country: "إندونيسيا", lat: -6.2088, lng: 106.8456 },
  ];

  var DEFAULT_OFFSETS = {
    Fajr: 0,
    Dhuhr: 0,
    Asr: 0,
    Maghrib: 0,
    Isha: 0,
  };

  function normalizeArabic(text) {
    return String(text || "")
      .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "")
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/ؤ/g, "و")
      .replace(/ئ/g, "ي")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function toArabicDigits(value) {
    return String(value == null ? "" : value).replace(/[0-9]/g, function (d) {
      return ARABIC_DIGITS[Number(d)];
    });
  }

  function escapeHtml(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function detectCalculationMethod(lat, lng) {
    var latitude = Number(lat);
    var longitude = Number(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return 5;
    // Egypt
    if (latitude >= 22 && latitude <= 32 && longitude >= 24 && longitude <= 37) return 5;
    // Saudi Arabia
    if (latitude >= 16 && latitude <= 32 && longitude >= 34 && longitude <= 56) return 4;
    // Gulf region
    if (latitude >= 22 && latitude <= 30 && longitude >= 46 && longitude <= 60) return 8;
    // Morocco
    if (latitude >= 27 && latitude <= 36 && longitude >= -13 && longitude <= -1) return 21;
    // Algeria
    if (latitude >= 19 && latitude <= 37 && longitude >= -2 && longitude <= 12) return 19;
    // Tunisia
    if (latitude >= 30 && latitude <= 38 && longitude >= 7 && longitude <= 12) return 18;
    // Turkey
    if (latitude >= 36 && latitude <= 42 && longitude >= 26 && longitude <= 45) return 13;
    // North America
    if (latitude >= 24 && latitude <= 72 && longitude >= -170 && longitude <= -50) return 2;
    // Default: Muslim World League
    return 3;
  }

  function clampOffset(value) {
    var num = parseInt(value, 10);
    if (!Number.isFinite(num)) return 0;
    return Math.max(-30, Math.min(30, num));
  }

  function getDefaultPrayerSettings() {
    return {
      method: "auto",
      school: 0, // 0 = Shafi/Maliki/Hanbali (Standard), 1 = Hanafi
      offsets: {
        Fajr: 0,
        Dhuhr: 0,
        Asr: 0,
        Maghrib: 0,
        Isha: 0,
      },
      manualCity: null, // { id, name, country, lat, lng } or null (GPS/Auto)
    };
  }

  function readRawStorage(key) {
    if (root && root.SafeStorage && typeof root.SafeStorage.getJSON === "function") {
      return root.SafeStorage.getJSON(key, null);
    }
    try {
      if (root && root.localStorage) {
        var raw = root.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      }
    } catch (e) {
      return null;
    }
    return null;
  }

  function writeRawStorage(key, val) {
    if (root && root.SafeStorage && typeof root.SafeStorage.setJSON === "function") {
      return root.SafeStorage.setJSON(key, val);
    }
    try {
      if (root && root.localStorage) {
        root.localStorage.setItem(key, JSON.stringify(val));
        return true;
      }
    } catch (e) {
      return false;
    }
    return false;
  }

  function getPrayerSettings() {
    var defaults = getDefaultPrayerSettings();
    var saved = readRawStorage(PRAYER_SETTINGS_KEY);
    if (!saved || typeof saved !== "object") return defaults;

    var method = saved.method === "auto" ? "auto" : Number(saved.method);
    if (method !== "auto" && (!Number.isInteger(method) || method < 0 || method > 99)) {
      method = "auto";
    }
    var school = Number(saved.school) === 1 ? 1 : 0;

    var offsets = {};
    Object.keys(DEFAULT_OFFSETS).forEach(function (k) {
      offsets[k] = clampOffset(saved.offsets && saved.offsets[k]);
    });

    var manualCity = null;
    if (
      saved.manualCity &&
      typeof saved.manualCity === "object" &&
      Number.isFinite(Number(saved.manualCity.lat)) &&
      Number.isFinite(Number(saved.manualCity.lng)) &&
      typeof saved.manualCity.name === "string" &&
      saved.manualCity.name.trim()
    ) {
      manualCity = {
        id: saved.manualCity.id || "custom",
        name: saved.manualCity.name.trim(),
        country: saved.manualCity.country || "",
        lat: Number(saved.manualCity.lat),
        lng: Number(saved.manualCity.lng),
      };
    }

    return {
      method: method,
      school: school,
      offsets: offsets,
      manualCity: manualCity,
    };
  }

  function savePrayerSettings(patch) {
    var current = getPrayerSettings();
    var merged = {
      method: patch && patch.method !== undefined ? patch.method : current.method,
      school: patch && patch.school !== undefined ? (Number(patch.school) === 1 ? 1 : 0) : current.school,
      offsets: Object.assign({}, current.offsets),
      manualCity: patch && patch.manualCity !== undefined ? patch.manualCity : current.manualCity,
    };
    if (patch && patch.offsets && typeof patch.offsets === "object") {
      Object.keys(DEFAULT_OFFSETS).forEach(function (k) {
        if (patch.offsets[k] !== undefined) {
          merged.offsets[k] = clampOffset(patch.offsets[k]);
        }
      });
    }
    writeRawStorage(PRAYER_SETTINGS_KEY, merged);
    return getPrayerSettings();
  }

  function getEffectivePrayerMethod(lat, lng, settings) {
    var cfg = settings || getPrayerSettings();
    if (cfg.method !== "auto" && Number.isInteger(Number(cfg.method))) {
      return Number(cfg.method);
    }
    return detectCalculationMethod(lat, lng);
  }

  function getEffectivePrayerSchool(settings) {
    var cfg = settings || getPrayerSettings();
    return Number(cfg.school) === 1 ? 1 : 0;
  }

  function shiftTimeHHMM(timeStr, deltaMinutes) {
    if (!timeStr || typeof timeStr !== "string") return timeStr;
    var clean = timeStr.replace(/\s*\([^)]*\)/g, "").trim();
    var parts = clean.split(":");
    var h = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return clean;
    var delta = parseInt(deltaMinutes, 10) || 0;
    var total = (h * 60 + m + delta) % 1440;
    if (total < 0) total += 1440;
    var nh = Math.floor(total / 60);
    var nm = total % 60;
    return String(nh).padStart(2, "0") + ":" + String(nm).padStart(2, "0");
  }

  function applyMinuteOffsets(timings, offsets) {
    if (!timings || typeof timings !== "object") return timings;
    var out = Object.assign({}, timings);
    var map = offsets || getPrayerSettings().offsets;
    if (!map) return out;
    Object.keys(DEFAULT_OFFSETS).forEach(function (key) {
      if (out[key] && map[key]) {
        out[key] = shiftTimeHHMM(out[key], map[key]);
      }
    });
    return out;
  }

  function buildAlAdhanQueryParams(lat, lng, settings) {
    var cfg = settings || getPrayerSettings();
    var method = getEffectivePrayerMethod(lat, lng, cfg);
    var school = getEffectivePrayerSchool(cfg);
    return (
      "latitude=" +
      encodeURIComponent(lat) +
      "&longitude=" +
      encodeURIComponent(lng) +
      "&method=" +
      encodeURIComponent(method) +
      "&school=" +
      encodeURIComponent(school)
    );
  }

  function getPrayerCacheFingerprint(lat, lng, settings) {
    var cfg = settings || getPrayerSettings();
    var method = getEffectivePrayerMethod(lat, lng, cfg);
    var school = getEffectivePrayerSchool(cfg);
    var offsetsKey = [
      cfg.offsets.Fajr,
      cfg.offsets.Dhuhr,
      cfg.offsets.Asr,
      cfg.offsets.Maghrib,
      cfg.offsets.Isha,
    ].join(",");
    return (
      Number(lat).toFixed(2) +
      "|" +
      Number(lng).toFixed(2) +
      "|m" +
      method +
      "|s" +
      school +
      "|o" +
      offsetsKey
    );
  }

  function searchPresetCities(query) {
    var q = normalizeArabic(query);
    if (!q) return PRESET_CITIES;
    return PRESET_CITIES.filter(function (c) {
      return (
        normalizeArabic(c.name).includes(q) ||
        normalizeArabic(c.country).includes(q) ||
        normalizeArabic(c.id).includes(q)
      );
    });
  }

  // ==========================================================================
  // Reusable In-App Dialog (replaces browser alert() / confirm())
  // ==========================================================================
  var AppDialog = (function () {
    var overlay = null;
    var activeResolve = null;

    function ensureOverlay() {
      if (typeof document === "undefined") return null;
      if (overlay && document.body.contains(overlay)) return overlay;

      overlay = document.createElement("div");
      overlay.id = "tazkeerAppDialog";
      overlay.className = "tazkeer-dialog-overlay";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", "tazkeerDialogTitle");
      overlay.innerHTML =
        '<div class="tazkeer-dialog-card" dir="rtl">' +
        '  <div class="tazkeer-dialog-header">' +
        '    <h3 id="tazkeerDialogTitle" class="tazkeer-dialog-title"></h3>' +
        "  </div>" +
        '  <p id="tazkeerDialogMessage" class="tazkeer-dialog-message"></p>' +
        '  <div class="tazkeer-dialog-actions">' +
        '    <button type="button" id="tazkeerDialogCancel" class="tazkeer-dialog-btn tazkeer-dialog-btn-secondary">إلغاء</button>' +
        '    <button type="button" id="tazkeerDialogConfirm" class="tazkeer-dialog-btn tazkeer-dialog-btn-primary">حسناً</button>' +
        "  </div>" +
        "</div>";

      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) {
          close(false);
        }
      });

      document.body.appendChild(overlay);
      return overlay;
    }

    function close(result) {
      if (!overlay) return;
      overlay.classList.remove("is-open");
      var resolver = activeResolve;
      activeResolve = null;
      if (resolver) resolver(result);
    }

    function openDialog(message, options) {
      var opts = options || {};
      var el = ensureOverlay();
      if (!el) {
        return Promise.resolve(opts.isConfirm ? false : true);
      }

      if (activeResolve) {
        activeResolve(false);
        activeResolve = null;
      }

      var titleEl = el.querySelector("#tazkeerDialogTitle");
      var msgEl = el.querySelector("#tazkeerDialogMessage");
      var cancelBtn = el.querySelector("#tazkeerDialogCancel");
      var confirmBtn = el.querySelector("#tazkeerDialogConfirm");

      titleEl.textContent = opts.title || (opts.isConfirm ? "تأكيد الإجراء" : "تنبيه");
      msgEl.textContent = String(message || "");
      confirmBtn.textContent = opts.confirmText || (opts.isConfirm ? "تأكيد" : "حسناً");
      cancelBtn.textContent = opts.cancelText || "إلغاء";
      cancelBtn.style.display = opts.isConfirm ? "" : "none";

      confirmBtn.classList.toggle("tazkeer-dialog-btn-danger", Boolean(opts.danger));

      return new Promise(function (resolve) {
        activeResolve = resolve;

        confirmBtn.onclick = function () {
          close(true);
        };
        cancelBtn.onclick = function () {
          close(false);
        };

        el.classList.add("is-open");
        setTimeout(function () {
          try {
            confirmBtn.focus();
          } catch (e) {}
        }, 20);
      });
    }

    if (typeof document !== "undefined") {
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && overlay && overlay.classList.contains("is-open")) {
          close(false);
        }
      });
    }

    return {
      alert: function (message, options) {
        return openDialog(message, Object.assign({}, options, { isConfirm: false }));
      },
      confirm: function (message, options) {
        return openDialog(message, Object.assign({}, options, { isConfirm: true }));
      },
      close: close,
    };
  })();

  // ==========================================================================
  // Sequential Modal Queue (prevents first-launch overlapping modal storm)
  // ==========================================================================
  var ModalQueue = (function () {
    var queue = [];
    var active = null;

    function isModalCurrentlyVisible(modalId) {
      if (typeof document === "undefined" || !modalId) return false;
      var el = document.getElementById(modalId);
      if (!el) return false;
      var style = typeof getComputedStyle === "function" ? getComputedStyle(el) : el.style;
      return (
        el.classList.contains("show") ||
        el.classList.contains("active") ||
        el.classList.contains("is-open") ||
        (style && style.display !== "none" && el.style.display !== "" && el.style.display !== "none")
      );
    }

    function runNext() {
      if (active || queue.length === 0) return;
      var next = queue.shift();
      if (!next) return;
      if (typeof next.shouldShow === "function" && !next.shouldShow()) {
        runNext();
        return;
      }
      active = next;
      try {
        next.open();
      } catch (e) {
        active = null;
        runNext();
        return;
      }

      if (next.modalId && typeof document !== "undefined") {
        var checkInterval = setInterval(function () {
          if (!isModalCurrentlyVisible(next.modalId)) {
            clearInterval(checkInterval);
            if (active === next) {
              active = null;
              setTimeout(runNext, 350);
            }
          }
        }, 300);
      }
    }

    return {
      enqueue: function (item) {
        if (!item || typeof item.open !== "function") return;
        if (item.id && queue.some(function (q) { return q.id === item.id; })) return;
        if (active && item.id && active.id === item.id) return;
        queue.push(item);
        if (!active) {
          setTimeout(runNext, item.delayMs || 350);
        }
      },
      notifyClosed: function (modalId) {
        if (active && (!modalId || active.modalId === modalId)) {
          active = null;
          setTimeout(runNext, 350);
        }
      },
    };
  })();

  return {
    PRAYER_METHODS: PRAYER_METHODS,
    PRESET_CITIES: PRESET_CITIES,
    normalizeArabic: normalizeArabic,
    toArabicDigits: toArabicDigits,
    escapeHtml: escapeHtml,
    detectCalculationMethod: detectCalculationMethod,
    getPrayerSettings: getPrayerSettings,
    savePrayerSettings: savePrayerSettings,
    getEffectivePrayerMethod: getEffectivePrayerMethod,
    getEffectivePrayerSchool: getEffectivePrayerSchool,
    shiftTimeHHMM: shiftTimeHHMM,
    applyMinuteOffsets: applyMinuteOffsets,
    buildAlAdhanQueryParams: buildAlAdhanQueryParams,
    getPrayerCacheFingerprint: getPrayerCacheFingerprint,
    searchPresetCities: searchPresetCities,
    AppDialog: AppDialog,
    ModalQueue: ModalQueue,
  };
});
