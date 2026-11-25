import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";

function createSandbox(overrides = {}) {
  const store = new Map();
  const makeEl = () => ({
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {},
    querySelectorAll() { return []; },
    querySelector() { return null; },
    setAttribute() {},
    textContent: "",
    innerHTML: "",
  });

  const sandbox = {
    console,
    Date,
    Math,
    Intl,
    JSON,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Set,
    Map,
    encodeURIComponent,
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); },
    },
    document: {
      hidden: false,
      body: { style: {}, classList: { add() {}, remove() {}, contains() { return false; } } },
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener() {},
      createElement: () => makeEl(),
    },
    navigator: {
      geolocation: {
        getCurrentPosition(success) {
          if (typeof success === "function" && sandbox.__mockCoords) {
            success({ coords: sandbox.__mockCoords });
          }
        },
      },
    },
    ...overrides,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;

  const appUtilsCode = fs.readFileSync(path.resolve("js/core/app-utils.js"), "utf8");
  vm.runInNewContext(appUtilsCode, sandbox);
  sandbox.toArabicDigits = sandbox.TazkeerUtils.toArabicDigits;
  sandbox.toArabicNumerals = sandbox.TazkeerUtils.toArabicDigits;
  return sandbox;
}

test("Qibla bearing calculations match spherical trigonometry across major cities", () => {
  const sandbox = createSandbox();
  const qiblaCode = fs.readFileSync(path.resolve("js/modules/qibla.js"), "utf8");
  vm.runInNewContext(qiblaCode, sandbox);

  const measureBearing = (lat, lng) => {
    sandbox.__mockCoords = { latitude: lat, longitude: lng };
    sandbox.requestQiblaPermissions();
    return sandbox.calculateQiblaDirection();
  };

  // Cairo (~136 deg SE)
  const cairo = measureBearing(30.0444, 31.2357);
  assert.ok(cairo >= 134 && cairo <= 138, `Expected Cairo ~136, got ${cairo}`);

  // Alexandria (~135 deg SE)
  const alex = measureBearing(31.2001, 29.9187);
  assert.ok(alex >= 133 && alex <= 137, `Expected Alex ~135, got ${alex}`);

  // London (~119 deg ESE)
  const london = measureBearing(51.5074, -0.1278);
  assert.ok(london >= 117 && london <= 121, `Expected London ~119, got ${london}`);

  // New York (~58.5 deg ENE)
  const nyc = measureBearing(40.7128, -74.006);
  assert.ok(nyc >= 57 && nyc <= 60.5, `Expected NYC ~58.5, got ${nyc}`);

  // Jakarta (~295 deg WNW)
  const jakarta = measureBearing(-6.2088, 106.8456);
  assert.ok(jakarta >= 293 && jakarta <= 297, `Expected Jakarta ~295, got ${jakarta}`);
});

test("Hijri calendar resolves Umm al-Qura dates and respects Sunnah & forbidden fasting days", () => {
  const sandbox = createSandbox();
  const calCode = fs.readFileSync(
    path.resolve("js/features/calendar/hijri-fasting.js"),
    "utf8"
  );
  vm.runInNewContext(calCode, sandbox);

  const hijri = sandbox.getHijriDate(new Date(2026, 2, 20, 12, 0, 0));
  assert.ok(hijri.year >= 1447 && hijri.month >= 1 && hijri.month <= 12 && hijri.day >= 1);

  // Verify fasting classification across a full year (355 days) using actual Intl Hijri mapping
  let sawEidAlFitrForbidden = false;
  let sawEidAlAdhaForbidden = false;
  let sawRamadanEmpty = false;
  let sawAshura = false;
  let sawArafah = false;
  let sawWhiteDays = false;

  const start = new Date(2026, 0, 1, 12, 0, 0);
  for (let i = 0; i < 365; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const h = sandbox.getHijriDate(d);
    const forbidden = sandbox.getForbiddenFastReason(d);
    const occasions = sandbox.checkFastingOccasions(d);

    if (h.month === 10 && h.day === 1) {
      assert.equal(forbidden, "عيد الفطر");
      assert.equal(occasions.length, 0);
      sawEidAlFitrForbidden = true;
    }
    if (h.month === 12 && h.day === 10) {
      assert.equal(forbidden, "عيد الأضحى");
      assert.equal(occasions.length, 0);
      sawEidAlAdhaForbidden = true;
    }
    if (h.month === 12 && h.day >= 11 && h.day <= 13) {
      assert.equal(forbidden, "أيام التشريق");
      assert.equal(occasions.length, 0);
    }
    if (h.month === 9) {
      assert.equal(occasions.length, 0);
      sawRamadanEmpty = true;
    }
    if (h.month === 1 && h.day === 10) {
      assert.ok(occasions.some((e) => e.name === "يوم عاشوراء"));
      sawAshura = true;
    }
    if (h.month === 12 && h.day === 9) {
      assert.ok(occasions.some((e) => e.name === "يوم عرفة"));
      sawArafah = true;
    }
    if (h.month !== 9 && h.month !== 12 && h.day >= 13 && h.day <= 15) {
      assert.ok(occasions.some((e) => e.name.includes("الأيام البيض")));
      sawWhiteDays = true;
    }
  }

  assert.equal(sawEidAlFitrForbidden, true);
  assert.equal(sawEidAlAdhaForbidden, true);
  assert.equal(sawRamadanEmpty, true);
  assert.equal(sawAshura, true);
  assert.equal(sawArafah, true);
  assert.equal(sawWhiteDays, true);
});

test("Prayer times parser, calculation method auto-detection, offsets and Arabic 12h formatting work accurately", () => {
  const sandbox = createSandbox();
  const prayerCode = fs.readFileSync(
    path.resolve("js/features/prayer/prayer-times.js"),
    "utf8"
  );
  vm.runInNewContext(prayerCode, sandbox);

  // Geographic calculation method detection (Egypt=5, Saudi=4, North America=2, Turkey=13)
  assert.equal(sandbox.TazkeerUtils.detectCalculationMethod(30.0444, 31.2357), 5);
  assert.equal(sandbox.TazkeerUtils.detectCalculationMethod(24.7136, 46.6753), 4);
  assert.equal(sandbox.TazkeerUtils.detectCalculationMethod(40.7128, -74.006), 2);
  assert.equal(sandbox.TazkeerUtils.detectCalculationMethod(41.0082, 28.9784), 13);

  // AlAdhan query builder with Hanafi school and custom offsets
  const query = sandbox.TazkeerUtils.buildAlAdhanQueryParams(30.0444, 31.2357, {
    method: "auto",
    school: 1,
  });
  assert.equal(query.method, 5);
  assert.equal(query.school, 1);
  assert.match(query.queryString, /method=5&school=1/);

  // Offset shifting with midnight wrap
  const shifted = sandbox.TazkeerUtils.applyMinuteOffsets(
    { Fajr: "04:55 (EET)", Isha: "23:55 (EET)" },
    { Fajr: -10, Isha: 15 }
  );
  assert.equal(shifted.Fajr, "04:45");
  assert.equal(shifted.Isha, "00:10");

  // Arabic 12h & 24h parsing (stripping timezone tags like (EET))
  assert.equal(sandbox.formatToArabic12Hour("04:45 (EET)"), "٤:٤٥ ص");
  assert.equal(sandbox.formatToArabic12Hour("17:09 (EEST)"), "٥:٠٩ م");
  assert.equal(sandbox.formatToArabic12Hour("00:05"), "١٢:٠٥ ص");
  assert.equal(sandbox.formatTo12Hour("13:30 (UTC)"), "1:30 م");

  // Local date key & remaining grammar
  assert.equal(sandbox.localDateKey(new Date(2026, 0, 5)), "2026-01-05");
  assert.equal(sandbox.formatArabicRemainingTime(0, 0, 0), "متبقي أقل من ثانية");
  assert.match(sandbox.formatArabicRemainingTime(2, 5, 1), /^متبقي ساعتان و5 دقائق وثانية$/);
});
