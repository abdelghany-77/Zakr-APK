/**
 * ============================================================================
 * Tazkeer Core Utilities — Unified Prayer Settings, Arabic Grammar,
 * Search Normalization, Native Dialogs & Sequential Modal Queue.
 * ============================================================================
 * Single source of truth shared between script.js, quran.js, prophets.js,
 * adhan-native.js, qibla.js, misbaha.js, and storage.js.
 */
(function (root) {
  "use strict";

  const PRAYER_SETTINGS_KEY = "tazkeer.prayerSettings.v1";
  const ARABIC_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];

  // --------------------------------------------------------------------------
  // 1. Arabic Normalization & Numerals
  // --------------------------------------------------------------------------

  function toArabicDigits(value) {
    if (value === null || value === undefined) return "";
    return String(value).replace(/\d/g, (d) => ARABIC_DIGITS[Number(d)] || d);
  }

  function toWesternDigits(value) {
    if (value === null || value === undefined) return "";
    return String(value).replace(/[٠-٩]/g, (ch) => String(ARABIC_DIGITS.indexOf(ch)));
  }

  function normalizeArabic(text) {
    if (!text) return "";
    return toWesternDigits(String(text))
      .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "") // Tashkeel & Quranic marks
      .replace(/\u0640/g, "") // Tatweel
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/ؤ/g, "و")
      .replace(/ئ/g, "ي")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // --------------------------------------------------------------------------
  // 2. Classical Arabic Countable Grammar (العدد والمعدود)
  // --------------------------------------------------------------------------

  const ARABIC_UNITS = {
    day: {
      zero: "يوم",
      one: "يوم واحد",
      oneLabel: "يوم",
      two: "يومان",
      twoLabel: "يومان",
      few: "أيام",
      many: "يوماً",
      hundred: "يوم",
    },
    consecutiveDay: {
      zero: "يوم متتالٍ",
      one: "يوم متتالٍ",
      oneLabel: "يوم متتالٍ",
      two: "يومان متتاليان",
      twoLabel: "يومان متتاليان",
      few: "أيام متتالية",
      many: "يوماً متتالياً",
      hundred: "يوم متتالٍ",
    },
    elapsedDay: {
      zero: "يوم مضى",
      one: "يوم مضى",
      oneLabel: "يوم مضى",
      two: "يومان مضيا",
      twoLabel: "يومان مضيا",
      few: "أيام مضت",
      many: "يوماً مضى",
      hundred: "يوم مضى",
    },
    remainingDay: {
      zero: "يوم متبقٍ",
      one: "يوم متبقٍ",
      oneLabel: "يوم متبقٍ",
      two: "يومان متبقيان",
      twoLabel: "يومان متبقيان",
      few: "أيام متبقية",
      many: "يوماً متبقياً",
      hundred: "يوم متبقٍ",
    },
    page: {
      zero: "صفحة",
      one: "صفحة واحدة",
      oneLabel: "صفحة",
      two: "صفحتان",
      twoLabel: "صفحتان",
      few: "صفحات",
      many: "صفحة",
      hundred: "صفحة",
    },
    ayah: {
      zero: "آية",
      one: "آية واحدة",
      oneLabel: "آية",
      two: "آيتان",
      twoLabel: "آيتان",
      few: "آيات",
      many: "آية",
      hundred: "آية",
    },
    section: {
      zero: "قسم",
      one: "قسم واحد",
      oneLabel: "قسم",
      two: "قسمان",
      twoLabel: "قسمان",
      few: "أقسام",
      many: "قسماً",
      hundred: "قسم",
    },
    zikr: {
      zero: "ذكر",
      one: "ذكر واحد",
      oneLabel: "ذكر",
      two: "ذِكران",
      twoLabel: "ذِكران",
      few: "أذكار",
      many: "ذكراً",
      hundred: "ذكر",
    },
    chapter: {
      zero: "فصل",
      one: "فصل واحد",
      oneLabel: "فصل",
      two: "فصلان",
      twoLabel: "فصلان",
      few: "فصول",
      many: "فصلاً",
      hundred: "فصل",
    },
    minute: {
      zero: "دقيقة",
      one: "دقيقة واحدة",
      oneLabel: "دقيقة",
      two: "دقيقتان",
      twoLabel: "دقيقتان",
      few: "دقائق",
      many: "دقيقة",
      hundred: "دقيقة",
    },
    prophet: {
      zero: "نبي",
      one: "نبي واحد",
      oneLabel: "نبي",
      two: "نبيان",
      twoLabel: "نبيان",
      few: "أنبياء",
      many: "نبياً",
      hundred: "نبي",
    },
    story: {
      zero: "قصة",
      one: "قصة واحدة",
      oneLabel: "قصة",
      two: "قصتان",
      twoLabel: "قصتان",
      few: "قصص",
      many: "قصة",
      hundred: "قصة",
    },
    item: {
      zero: "عنصر",
      one: "عنصر واحد",
      oneLabel: "عنصر",
      two: "عنصران",
      twoLabel: "عنصران",
      few: "عناصر",
      many: "عنصراً",
      hundred: "عنصر",
    },
    ward: {
      zero: "ورد",
      one: "ورد واحد",
      oneLabel: "ورد",
      two: "وردان",
      twoLabel: "وردان",
      few: "أوراد",
      many: "ورداً",
      hundred: "ورد",
    },
    juz: {
      zero: "جزء",
      one: "جزء واحد",
      oneLabel: "جزء",
      two: "جزءان",
      twoLabel: "جزءان",
      few: "أجزاء",
      many: "جزءاً",
      hundred: "جزء",
    },
    surah: {
      zero: "سورة",
      one: "سورة واحدة",
      oneLabel: "سورة",
      two: "سورتان",
      twoLabel: "سورتان",
      few: "سور",
      many: "سورة",
      hundred: "سورة",
    },
    mention: {
      zero: "مرة",
      one: "مرة واحدة",
      oneLabel: "مرة",
      two: "مرتان",
      twoLabel: "مرتان",
      few: "مرات",
      many: "مرة",
      hundred: "مرة",
    },
  };

  function getArabicPluralCategory(count) {
    const n = Math.abs(Math.floor(Number(count) || 0));
    if (n === 0) return "zero";
    if (n === 1) return "one";
    if (n === 2) return "two";
    const mod100 = n % 100;
    if (mod100 >= 3 && mod100 <= 10) return "few";
    if (mod100 >= 11 && mod100 <= 99) return "many";
    return "hundred"; // 100, 101, 102, 200, 300...
  }

  function formatArabicUnitLabel(count, unitKey) {
    const unit = ARABIC_UNITS[unitKey];
    if (!unit) return "";
    const cat = getArabicPluralCategory(count);
    if (cat === "one") return unit.oneLabel || unit.one;
    if (cat === "two") return unit.twoLabel || unit.two;
    return unit[cat] || unit.zero;
  }

  function formatArabicCount(count, unitKey, options) {
    const opts = options || {};
    const n = Math.max(0, Math.floor(Number(count) || 0));
    const unit = ARABIC_UNITS[unitKey];
    const numStr = opts.westernDigits ? String(n) : toArabicDigits(n);
    if (!unit) return numStr;

    const cat = getArabicPluralCategory(n);
    if (n === 0) {
      return `${numStr} ${unit.zero}`;
    }
    if (n === 1) {
      return opts.alwaysShowNumber ? `${numStr} ${unit.oneLabel || unit.one}` : unit.one;
    }
    if (n === 2) {
      return opts.alwaysShowNumber ? `${numStr} ${unit.twoLabel || unit.two}` : unit.two;
    }
    return `${numStr} ${unit[cat]}`;
  }

  // --------------------------------------------------------------------------
  // 3. Prayer Calculation Methods, Preset Cities & Unified Settings
  // --------------------------------------------------------------------------

  const PRAYER_METHODS = [
    { id: "auto", nameAr: "تلقائي حسب الموقع (موصى به)" },
    { id: 5, nameAr: "الهيئة المصرية العامة للمساحة" },
    { id: 4, nameAr: "جامعة أم القرى — مكة المكرمة" },
    { id: 3, nameAr: "رابطة العالم الإسلامي" },
    { id: 2, nameAr: "الجمعية الإسلامية لأمريكا الشمالية (ISNA)" },
    { id: 8, nameAr: "منطقة الخليج العربي" },
    { id: 9, nameAr: "الكويت" },
    { id: 10, nameAr: "قطر" },
    { id: 16, nameAr: "دبي — الإمارات" },
    { id: 23, nameAr: "وزارة الأوقاف — الأردن" },
    { id: 18, nameAr: "تونس" },
    { id: 19, nameAr: "الجزائر" },
    { id: 21, nameAr: "المغرب" },
    { id: 13, nameAr: "رئاسة الشؤون الدينية — تركيا" },
    { id: 1, nameAr: "جامعة العلوم الإسلامية — كراتشي" },
  ];

  const PRESET_CITIES = [
    { id: "cairo", nameAr: "القاهرة", countryAr: "مصر", lat: 30.0444, lng: 31.2357, method: 5, aliases: "مصر القاهره cairo egypt" },
    { id: "alexandria", nameAr: "الإسكندرية", countryAr: "مصر", lat: 31.2001, lng: 29.9187, method: 5, aliases: "اسكندريه alexandria egypt" },
    { id: "giza", nameAr: "الجيزة", countryAr: "مصر", lat: 30.0131, lng: 31.2089, method: 5, aliases: "جيزه giza egypt" },
    { id: "mansoura", nameAr: "المنصورة", countryAr: "مصر", lat: 31.0409, lng: 31.3785, method: 5, aliases: "منصوره mansoura" },
    { id: "aswan", nameAr: "أسوان", countryAr: "مصر", lat: 24.0889, lng: 32.8998, method: 5, aliases: "اسوان aswan" },
    { id: "makkah", nameAr: "مكة المكرمة", countryAr: "السعودية", lat: 21.4225, lng: 39.8262, method: 4, aliases: "مكه الحرم makkah mecca saudi" },
    { id: "madinah", nameAr: "المدينة المنورة", countryAr: "السعودية", lat: 24.4672, lng: 39.6111, method: 4, aliases: "المدينه مدينه madinah medina" },
    { id: "riyadh", nameAr: "الرياض", countryAr: "السعودية", lat: 24.7136, lng: 46.6753, method: 4, aliases: "رياض riyadh saudi" },
    { id: "jeddah", nameAr: "جدة", countryAr: "السعودية", lat: 21.4858, lng: 39.1925, method: 4, aliases: "جده jeddah" },
    { id: "dammam", nameAr: "الدمام", countryAr: "السعودية", lat: 26.4207, lng: 50.0888, method: 4, aliases: "دمام dammam" },
    { id: "dubai", nameAr: "دبي", countryAr: "الإمارات", lat: 25.2048, lng: 55.2708, method: 16, aliases: "الامارات dubai uae" },
    { id: "abudhabi", nameAr: "أبو ظبي", countryAr: "الإمارات", lat: 24.4539, lng: 54.3773, method: 16, aliases: "ابوظبي abu dhabi uae" },
    { id: "kuwait", nameAr: "مدينة الكويت", countryAr: "الكويت", lat: 29.3759, lng: 47.9774, method: 9, aliases: "الكويت kuwait" },
    { id: "doha", nameAr: "الدوحة", countryAr: "قطر", lat: 25.2854, lng: 51.531, method: 10, aliases: "دوحه قطر doha qatar" },
    { id: "manama", nameAr: "المنامة", countryAr: "البحرين", lat: 26.2285, lng: 50.586, method: 8, aliases: "منامه البحرين manama bahrain" },
    { id: "muscat", nameAr: "مسقط", countryAr: "عُمان", lat: 23.588, lng: 58.3829, method: 8, aliases: "عمان muscat oman" },
    { id: "amman", nameAr: "عمّان", countryAr: "الأردن", lat: 31.9454, lng: 35.9284, method: 23, aliases: "عمان الاردن amman jordan" },
    { id: "jerusalem", nameAr: "القدس", countryAr: "فلسطين", lat: 31.7683, lng: 35.2137, method: 23, aliases: "الاقصى فلسطين jerusalem palestine" },
    { id: "gaza", nameAr: "غزة", countryAr: "فلسطين", lat: 31.5017, lng: 34.4668, method: 5, aliases: "غزه فلسطين gaza" },
    { id: "damascus", nameAr: "دمشق", countryAr: "سوريا", lat: 33.5138, lng: 36.2765, method: 3, aliases: "سوريا damascus syria" },
    { id: "beirut", nameAr: "بيروت", countryAr: "لبنان", lat: 33.8938, lng: 35.5018, method: 3, aliases: "لبنان beirut lebanon" },
    { id: "baghdad", nameAr: "بغداد", countryAr: "العراق", lat: 33.3152, lng: 44.3661, method: 3, aliases: "العراق baghdad iraq" },
    { id: "sanaa", nameAr: "صنعاء", countryAr: "اليمن", lat: 15.3694, lng: 44.191, method: 4, aliases: "اليمن sanaa yemen" },
    { id: "khartoum", nameAr: "الخرطوم", countryAr: "السودان", lat: 15.5007, lng: 32.5599, method: 5, aliases: "السودان khartoum sudan" },
    { id: "tripoli", nameAr: "طرابلس", countryAr: "ليبيا", lat: 32.8872, lng: 13.1913, method: 5, aliases: "ليبيا tripoli libya" },
    { id: "tunis", nameAr: "تونس", countryAr: "تونس", lat: 36.8065, lng: 10.1815, method: 18, aliases: "تونس tunis tunisia" },
    { id: "algiers", nameAr: "الجزائر", countryAr: "الجزائر", lat: 36.7538, lng: 3.0588, method: 19, aliases: "الجزائر algiers algeria" },
    { id: "casablanca", nameAr: "الدار البيضاء", countryAr: "المغرب", lat: 33.5731, lng: -7.5898, method: 21, aliases: "المغرب كازابلانكا casablanca morocco" },
    { id: "rabat", nameAr: "الرباط", countryAr: "المغرب", lat: 34.0209, lng: -6.8416, method: 21, aliases: "المغرب rabat morocco" },
    { id: "istanbul", nameAr: "إسطنبول", countryAr: "تركيا", lat: 41.0082, lng: 28.9784, method: 13, aliases: "تركيا اسطنبول istanbul turkey" },
    { id: "london", nameAr: "لندن", countryAr: "المملكة المتحدة", lat: 51.5074, lng: -0.1278, method: 3, aliases: "بريطانيا london uk" },
    { id: "paris", nameAr: "باريس", countryAr: "فرنسا", lat: 48.8566, lng: 2.3522, method: 3, aliases: "فرنسا paris france" },
    { id: "berlin", nameAr: "برلين", countryAr: "ألمانيا", lat: 52.52, lng: 13.405, method: 3, aliases: "المانيا berlin germany" },
    { id: "newyork", nameAr: "نيويورك", countryAr: "الولايات المتحدة", lat: 40.7128, lng: -74.006, method: 2, aliases: "امريكا new york usa" },
    { id: "toronto", nameAr: "تورنتو", countryAr: "كندا", lat: 43.6532, lng: -79.3832, method: 2, aliases: "كندا toronto canada" },
    { id: "kualalumpur", nameAr: "كوالالمبور", countryAr: "ماليزيا", lat: 3.139, lng: 101.6869, method: 3, aliases: "ماليزيا kuala lumpur malaysia" },
    { id: "jakarta", nameAr: "جاكرتا", countryAr: "إندونيسيا", lat: -6.2088, lng: 106.8456, method: 3, aliases: "اندونيسيا jakarta indonesia" },
    { id: "karachi", nameAr: "كراتشي", countryAr: "باكستان", lat: 24.8607, lng: 67.0011, method: 1, aliases: "باكستان karachi pakistan" },
  ];

  const DEFAULT_OFFSETS = { Fajr: 0, Dhuhr: 0, Asr: 0, Maghrib: 0, Isha: 0 };

  function clampOffset(val) {
    const n = Math.round(Number(val) || 0);
    return Math.max(-30, Math.min(30, n));
  }

  function detectCalculationMethod(lat, lng) {
    const la = Number(lat);
    const lo = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return 5;
    // Egypt & Sudan
    if (la >= 12 && la <= 32.5 && lo >= 24 && lo <= 37) return 5;
    // Saudi Arabia & Yemen
    if (la >= 12 && la <= 32.5 && lo > 37 && lo <= 50.5) return 4;
    // Kuwait
    if (la >= 28.4 && la <= 30.2 && lo >= 46.5 && lo <= 49) return 9;
    // Qatar
    if (la >= 24.4 && la <= 26.3 && lo >= 50.6 && lo <= 51.8) return 10;
    // UAE
    if (la >= 22.5 && la <= 26.2 && lo >= 51.5 && lo <= 56.5) return 16;
    // Oman & Bahrain
    if (la >= 16.5 && la <= 26.5 && lo > 50.2 && lo <= 60) return 8;
    // Jordan & Palestine
    if (la >= 29.5 && la <= 33.5 && lo >= 34 && lo <= 39.5) return 23;
    // Tunisia
    if (la >= 30 && la <= 37.6 && lo >= 7.5 && lo <= 12) return 18;
    // Algeria
    if (la >= 19 && la <= 37.2 && lo >= -2.5 && lo < 8.5) return 19;
    // Morocco
    if (la >= 21 && la <= 36 && lo >= -13.5 && lo < -1) return 21;
    // Turkey
    if (la >= 35.8 && la <= 42.2 && lo >= 26 && lo <= 45) return 13;
    // Pakistan / India / Bangladesh
    if (la >= 6 && la <= 37 && lo >= 60.5 && lo <= 93) return 1;
    // North America (ISNA)
    if (la >= 15 && la <= 72 && lo >= -168 && lo <= -52) return 2;
    // Default global: Muslim World League
    return 3;
  }

  function defaultPrayerSettings() {
    return {
      method: "auto",
      school: 0, // 0 = Shafi'i/Standard, 1 = Hanafi
      offsets: { ...DEFAULT_OFFSETS },
      manualCity: null, // { id, nameAr, countryAr, lat, lng, method }
    };
  }

  function sanitizePrayerSettings(raw) {
    const base = defaultPrayerSettings();
    if (!raw || typeof raw !== "object") return base;

    const method =
      raw.method === "auto" || raw.method === undefined || raw.method === null
        ? "auto"
        : Number.isFinite(Number(raw.method))
          ? Number(raw.method)
          : "auto";

    const school = Number(raw.school) === 1 ? 1 : 0;

    const offsets = { ...DEFAULT_OFFSETS };
    if (raw.offsets && typeof raw.offsets === "object") {
      Object.keys(DEFAULT_OFFSETS).forEach((k) => {
        offsets[k] = clampOffset(raw.offsets[k]);
      });
    }

    let manualCity = null;
    if (
      raw.manualCity &&
      typeof raw.manualCity === "object" &&
      Number.isFinite(Number(raw.manualCity.lat)) &&
      Number.isFinite(Number(raw.manualCity.lng))
    ) {
      manualCity = {
        id: String(raw.manualCity.id || "custom"),
        nameAr: String(raw.manualCity.nameAr || "موقع مخصص"),
        countryAr: String(raw.manualCity.countryAr || ""),
        lat: Number(raw.manualCity.lat),
        lng: Number(raw.manualCity.lng),
        method: Number.isFinite(Number(raw.manualCity.method))
          ? Number(raw.manualCity.method)
          : detectCalculationMethod(raw.manualCity.lat, raw.manualCity.lng),
      };
    }

    return { method, school, offsets, manualCity };
  }

  function getPrayerSettings() {
    try {
      const storage = root.SafeStorage || root.localStorage;
      if (!storage) return defaultPrayerSettings();
      const raw =
        typeof storage.getJSON === "function"
          ? storage.getJSON(PRAYER_SETTINGS_KEY, null)
          : JSON.parse(storage.getItem(PRAYER_SETTINGS_KEY) || "null");
      return sanitizePrayerSettings(raw);
    } catch (_) {
      return defaultPrayerSettings();
    }
  }

  function savePrayerSettings(patch) {
    const current = getPrayerSettings();
    const merged = {
      ...current,
      ...(patch || {}),
      offsets: {
        ...current.offsets,
        ...((patch && patch.offsets) || {}),
      },
    };
    const clean = sanitizePrayerSettings(merged);
    try {
      const storage = root.SafeStorage || root.localStorage;
      if (storage) {
        if (typeof storage.setJSON === "function") {
          storage.setJSON(PRAYER_SETTINGS_KEY, clean);
        } else {
          storage.setItem(PRAYER_SETTINGS_KEY, JSON.stringify(clean));
        }
      }
    } catch (_) {}
    return clean;
  }

  function resolveCalculationMethod(lat, lng, settings) {
    const cfg = sanitizePrayerSettings(settings || getPrayerSettings());
    if (cfg.method !== "auto" && Number.isFinite(Number(cfg.method))) {
      return Number(cfg.method);
    }
    if (cfg.manualCity && Number.isFinite(Number(cfg.manualCity.method))) {
      return Number(cfg.manualCity.method);
    }
    return detectCalculationMethod(lat, lng);
  }

  function buildAlAdhanQueryParams(lat, lng, settings) {
    const cfg = sanitizePrayerSettings(settings || getPrayerSettings());
    const method = resolveCalculationMethod(lat, lng, cfg);
    const school = cfg.school === 1 ? 1 : 0;
    return {
      method,
      school,
      queryString: `latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&method=${method}&school=${school}`,
    };
  }

  function applyMinuteOffset(hhmm, offsetMinutes) {
    if (!hhmm || typeof hhmm !== "string") return hhmm;
    const match = hhmm.trim().match(/^(\d{1,2}):(\d{2})/);
    if (!match) return hhmm;
    const delta = clampOffset(offsetMinutes);
    if (delta === 0) {
      return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
    }
    let total = Number(match[1]) * 60 + Number(match[2]) + delta;
    total = ((total % 1440) + 1440) % 1440;
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  function applyMinuteOffsets(timings, offsets) {
    if (!timings || typeof timings !== "object") return timings;
    const offs = offsets || getPrayerSettings().offsets;
    const result = { ...timings };
    Object.keys(DEFAULT_OFFSETS).forEach((prayer) => {
      if (result[prayer]) {
        result[prayer] = applyMinuteOffset(result[prayer], offs[prayer] || 0);
      }
    });
    return result;
  }

  function addMinutesToLocalDateTime(baseDate, hhmm, addMinutes) {
    const match = String(hhmm || "").trim().match(/^(\d{1,2}):(\d{2})/);
    if (!match || !(baseDate instanceof Date) || Number.isNaN(baseDate.getTime())) {
      return null;
    }
    const target = new Date(
      baseDate.getFullYear(),
      baseDate.getMonth(),
      baseDate.getDate(),
      Number(match[1]),
      Number(match[2]),
      0,
      0
    );
    target.setMinutes(target.getMinutes() + (Number(addMinutes) || 0));
    const dateKey = [
      target.getFullYear(),
      String(target.getMonth() + 1).padStart(2, "0"),
      String(target.getDate()).padStart(2, "0"),
    ].join("-");
    const timeOfDay = `${String(target.getHours()).padStart(2, "0")}:${String(target.getMinutes()).padStart(2, "0")}`;
    return {
      date: target,
      dateKey,
      timeOfDay,
      epochMs: target.getTime(),
    };
  }

  function searchPresetCities(query) {
    const q = normalizeArabic(query);
    if (!q) return PRESET_CITIES;
    return PRESET_CITIES.filter((city) => {
      const hay = normalizeArabic(`${city.nameAr} ${city.countryAr} ${city.aliases || ""}`);
      return hay.includes(q);
    });
  }

  // --------------------------------------------------------------------------
  // 4. Custom In-App Dialog (Replaces browser alert() and confirm())
  // --------------------------------------------------------------------------

  const AppDialog = (function () {
    let activeResolve = null;

    function ensureOverlay() {
      if (typeof document === "undefined") return null;
      let overlay = document.getElementById("tazkeerAppDialogOverlay");
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "tazkeerAppDialogOverlay";
        overlay.className = "app-dialog-overlay";
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.innerHTML = `
          <div class="app-dialog-card">
            <div class="app-dialog-icon" id="appDialogIcon" aria-hidden="true">
              <i class="fas fa-circle-info"></i>
            </div>
            <h3 class="app-dialog-title" id="appDialogTitle"></h3>
            <p class="app-dialog-message" id="appDialogMessage"></p>
            <div class="app-dialog-actions" id="appDialogActions">
              <button type="button" class="app-dialog-btn app-dialog-btn--cancel" id="appDialogCancel"></button>
              <button type="button" class="app-dialog-btn app-dialog-btn--confirm" id="appDialogConfirm"></button>
            </div>
          </div>
        `;
        document.body.appendChild(overlay);

        overlay.addEventListener("click", (e) => {
          if (e.target === overlay) {
            close(false);
          }
        });
        document.addEventListener("keydown", (e) => {
          if (e.key === "Escape" && overlay.classList.contains("active")) {
            close(false);
          }
        });
      }
      return overlay;
    }

    function close(value) {
      const overlay = document.getElementById("tazkeerAppDialogOverlay");
      if (overlay) {
        overlay.classList.remove("active");
      }
      if (activeResolve) {
        const res = activeResolve;
        activeResolve = null;
        res(value);
      }
    }

    function show(opts) {
      if (typeof document === "undefined") {
        return Promise.resolve(false);
      }
      const options = typeof opts === "string" ? { message: opts } : opts || {};
      const overlay = ensureOverlay();
      if (!overlay) return Promise.resolve(false);

      if (activeResolve) {
        activeResolve(false);
        activeResolve = null;
      }

      const iconWrap = overlay.querySelector("#appDialogIcon");
      const titleEl = overlay.querySelector("#appDialogTitle");
      const msgEl = overlay.querySelector("#appDialogMessage");
      const cancelBtn = overlay.querySelector("#appDialogCancel");
      const confirmBtn = overlay.querySelector("#appDialogConfirm");

      const isConfirm = options.mode === "confirm";
      const isDanger = Boolean(options.danger);

      titleEl.textContent = options.title || (isConfirm ? "تأكيد الإجراء" : "تنبيه");
      msgEl.textContent = options.message || "";

      iconWrap.className = "app-dialog-icon" + (isDanger ? " app-dialog-icon--danger" : "");
      iconWrap.innerHTML = isDanger
        ? '<i class="fas fa-triangle-exclamation"></i>'
        : isConfirm
          ? '<i class="fas fa-circle-question"></i>'
          : '<i class="fas fa-circle-info"></i>';

      confirmBtn.textContent = options.confirmText || (isConfirm ? "تأكيد" : "حسناً");
      confirmBtn.className =
        "app-dialog-btn app-dialog-btn--confirm" + (isDanger ? " app-dialog-btn--danger" : "");

      if (isConfirm) {
        cancelBtn.style.display = "";
        cancelBtn.textContent = options.cancelText || "إلغاء";
      } else {
        cancelBtn.style.display = "none";
      }

      confirmBtn.onclick = () => close(true);
      cancelBtn.onclick = () => close(false);

      overlay.classList.add("active");

      return new Promise((resolve) => {
        activeResolve = resolve;
      });
    }

    return {
      alert(messageOrOpts, extraOpts) {
        const opts =
          typeof messageOrOpts === "string"
            ? { ...(extraOpts || {}), message: messageOrOpts, mode: "alert" }
            : { ...(messageOrOpts || {}), mode: "alert" };
        return show(opts);
      },
      confirm(messageOrOpts, extraOpts) {
        const opts =
          typeof messageOrOpts === "string"
            ? { ...(extraOpts || {}), message: messageOrOpts, mode: "confirm" }
            : { ...(messageOrOpts || {}), mode: "confirm" };
        return show(opts);
      },
      close,
    };
  })();

  // --------------------------------------------------------------------------
  // 5. Sequential First-Run Modal Queue (Prevents Overlapping Modals)
  // --------------------------------------------------------------------------

  const TazkeerModalQueue = (function () {
    const queue = [];
    let current = null;
    let running = false;

    function next() {
      if (running) return;
      if (queue.length === 0) {
        current = null;
        return;
      }
      running = true;
      current = queue.shift();
      try {
        if (typeof current.shouldShow === "function" && !current.shouldShow()) {
          running = false;
          current = null;
          next();
          return;
        }
        const done = () => {
          if (!running) return;
          running = false;
          current = null;
          setTimeout(next, 320);
        };
        current.done = done;
        const result = current.show(done);
        if (result === false) {
          done();
        }
      } catch (_) {
        running = false;
        current = null;
        setTimeout(next, 320);
      }
    }

    return {
      enqueue(item) {
        if (!item || typeof item.show !== "function") return;
        if (item.id && (queue.some((q) => q.id === item.id) || (current && current.id === item.id))) {
          return;
        }
        queue.push(item);
        const delay = Number(item.delayMs) || 0;
        if (!running) {
          if (delay > 0) {
            setTimeout(next, delay);
          } else {
            next();
          }
        }
      },
      notifyClosed(id) {
        if (current && (!id || current.id === id) && typeof current.done === "function") {
          current.done();
        }
      },
      isActive(id) {
        return Boolean(current && (!id || current.id === id));
      },
    };
  })();

  const api = {
    PRAYER_SETTINGS_KEY,
    PRAYER_METHODS,
    PRESET_CITIES,
    toArabicDigits,
    toWesternDigits,
    normalizeArabic,
    escapeHtml,
    formatArabicCount,
    formatArabicUnitLabel,
    detectCalculationMethod,
    getPrayerSettings,
    savePrayerSettings,
    resolveCalculationMethod,
    buildAlAdhanQueryParams,
    applyMinuteOffset,
    applyMinuteOffsets,
    addMinutesToLocalDateTime,
    searchPresetCities,
    AppDialog,
    ModalQueue: TazkeerModalQueue,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.TazkeerUtils = api;
    root.AppDialog = AppDialog;
    root.TazkeerModalQueue = TazkeerModalQueue;
  }
})(typeof window !== "undefined" ? window : globalThis);
