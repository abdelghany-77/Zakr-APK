import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import {
  buildDailySchedule,
  hasScheduleChanged,
  localDateKey,
  normalizeDailyReminders,
  nextLocalMidnight,
  parseLocalTime,
  shouldReplaceSchedule,
  stableNotificationId,
  validateSchedule,
} from "../js/core/schedule-utils.mjs";
import {
  BACKUP_SCHEMA_VERSION,
  createBackupPayload,
  validateBackupPayload,
} from "../js/core/storage-schema.mjs";

test("parses only valid local times", () => {
  assert.deepEqual(parseLocalTime("05:07"), { hours: 5, minutes: 7 });
  assert.equal(parseLocalTime("25:00"), null);
  assert.equal(parseLocalTime("5:07"), null);
});

test("normalizes enabled daily reminders and rejects malformed entries", () => {
  assert.deepEqual(
    normalizeDailyReminders([
      { key: "morning", time: "07:00", title: "صباح الخير" },
      { key: "disabled", time: "08:00", enabled: false },
      { key: "invalid", time: "8:00" },
    ]),
    [{ key: "morning", time: "07:00", title: "صباح الخير", body: "" }]
  );
});

test("builds stable local schedules and IDs", () => {
  const date = new Date(2026, 10, 10, 12, 0, 0);
  const schedule = buildDailySchedule(date, [
    { key: "morning", time: "07:00", body: "اذكر الله" },
    { key: "evening", time: "18:30", body: "أذكار المساء" },
  ]);

  assert.equal(schedule.length, 2);
  assert.equal(schedule[0].date, "2026-11-10");
  assert.equal(new Date(schedule[0].time).getHours(), 7);
  assert.equal(
    schedule[0].id,
    stableNotificationId("azkar", "2026-11-10", "morning")
  );
  assert.notEqual(schedule[0].id, schedule[1].id);
});

test("rejects duplicate, expired, and malformed schedules", () => {
  const now = new Date(2026, 10, 10, 6, 0, 0).getTime();
  const valid = buildDailySchedule(new Date(now), [
    { key: "morning", time: "07:00" },
  ]);
  assert.equal(validateSchedule(valid, now), true);
  assert.equal(shouldReplaceSchedule(valid, now), true);
  assert.equal(
    validateSchedule([{ ...valid[0], id: valid[0].id } , { ...valid[0] }], now),
    false
  );
  assert.equal(validateSchedule([{ ...valid[0], time: now }], now), false);
});

test("validates and creates versioned backups", () => {
  const payload = createBackupPayload({ theme: "dark", progress: "{}" });
  assert.equal(payload.version, BACKUP_SCHEMA_VERSION);
  assert.equal(validateBackupPayload(payload).valid, true);
  assert.equal(validateBackupPayload({ ...payload, version: 99 }).valid, false);
  assert.equal(
    validateBackupPayload({ ...payload, keys: { progress: null } }).valid,
    false
  );
});

test("supports multiple reminders without duplicate stable IDs", () => {
  const reminders = Array.from({ length: 4 }, (_, index) => ({
    key: `reminder-${index}`,
    time: `${String(7 + index).padStart(2, "0")}:15`,
  }));
  const schedule = buildDailySchedule(new Date(2026, 10, 10, 0, 0), reminders);
  assert.equal(new Set(schedule.map((entry) => entry.id)).size, 4);
  assert.equal(new Set(schedule.map((entry) => entry.key)).size, 4);
});

test("uses local date boundaries for midnight and timezone transitions", () => {
  const date = new Date(2026, 10, 10, 23, 59, 59);
  assert.equal(localDateKey(date), "2026-11-10");
  assert.equal(localDateKey(nextLocalMidnight(date)), "2026-11-11");
  assert.notEqual(
    stableNotificationId("azkar", "2026-11-10", "morning"),
    stableNotificationId("azkar", "2026-11-11", "morning")
  );
});

const require = createRequire(import.meta.url);
const appUtils = require("../js/core/app-utils.js");
const scheduleCjs = require("../js/core/schedule-utils.js");

test("detects schedule replacement and preserves unchanged schedules", () => {
  const schedule = buildDailySchedule(new Date(2026, 10, 10, 0, 0), [
    { key: "morning", time: "07:00" },
  ]);
  assert.equal(hasScheduleChanged(schedule, schedule.map((entry) => ({ ...entry }))), false);
  assert.equal(hasScheduleChanged(schedule, [{ ...schedule[0], time: schedule[0].time + 60000 }]), true);
  assert.equal(hasScheduleChanged(schedule, []), true);
});

test("rolls post-23:00 reminder times accurately into the next local date", () => {
  const shifted = scheduleCjs.addMinutesToLocalDateTime("2026-06-21", "23:25", 60);
  assert.ok(shifted);
  assert.equal(shifted.dateKey, "2026-06-22");
  assert.equal(shifted.timeOfDay, "00:25");
  assert.notEqual(
    stableNotificationId("azkar", "2026-06-21", "night"),
    stableNotificationId("azkar", shifted.dateKey, "night")
  );
});

test("normalizes Arabic diacritics, hamza, and taa marbuta consistently", () => {
  assert.equal(appUtils.normalizeArabic("أَذْكَارُ الصَّبَاحِ"), "اذكار الصباح");
  assert.equal(appUtils.normalizeArabic("إبراهيم وموسى وعيسى"), "ابراهيم وموسي وعيسي");
  assert.equal(appUtils.normalizeArabic("مكّة المكرّمة"), "مكه المكرمه");
});

test("resolves prayer calculation methods, offsets, and query params uniformly", () => {
  assert.equal(appUtils.detectCalculationMethod(30.04, 31.23), 5); // Egypt
  assert.equal(appUtils.detectCalculationMethod(21.42, 39.82), 4); // Saudi Arabia
  assert.equal(appUtils.detectCalculationMethod(40.71, -74.0), 2); // North America
  assert.equal(appUtils.detectCalculationMethod(51.5, -0.12), 3); // Default MWL

  const shifted = appUtils.applyMinuteOffsets(
    { Fajr: "04:30 (EET)", Dhuhr: "12:00", Asr: "15:30", Maghrib: "18:15", Isha: "23:55" },
    { Fajr: -5, Dhuhr: 0, Asr: 2, Maghrib: 0, Isha: 10 }
  );
  assert.equal(shifted.Fajr, "04:25");
  assert.equal(shifted.Asr, "15:32");
  assert.equal(shifted.Isha, "00:05");

  const params = appUtils.buildAlAdhanQueryParams(30.04, 31.23, {
    method: 4,
    school: 1,
    offsets: { Fajr: 0, Dhuhr: 0, Asr: 0, Maghrib: 0, Isha: 0 },
    manualCity: null,
  });
  assert.ok(params.includes("method=4"));
  assert.ok(params.includes("school=1"));
});

test("searches preset Arabic cities with normalized matching", () => {
  const results = appUtils.searchPresetCities("الاسكندريه");
  assert.ok(results.some((c) => c.id === "alexandria"));
  const makkah = appUtils.searchPresetCities("مكه");
  assert.ok(makkah.some((c) => c.id === "makkah"));
});

test("formats Arabic countable nouns with accurate grammatical agreement", () => {
  assert.equal(appUtils.formatArabicCount(0, "dayStreak"), "٠ يوم متتالٍ");
  assert.equal(appUtils.formatArabicCount(1, "dayStreak"), "يوم واحد متتالٍ");
  assert.equal(appUtils.formatArabicCount(2, "dayStreak"), "يومان متتاليان");
  assert.equal(appUtils.formatArabicCount(7, "dayStreak"), "٧ أيام متتالية");
  assert.equal(appUtils.formatArabicCount(11, "dayStreak"), "١١ يوماً متتالياً");
  assert.equal(appUtils.formatArabicCount(25, "dayStreak"), "٢٥ يوماً متتالياً");
  assert.equal(appUtils.formatArabicCount(100, "dayStreak"), "١٠٠ يوم متتالٍ");
  assert.equal(appUtils.formatArabicCount(107, "dayStreak"), "١٠٧ أيام متتالية");

  assert.equal(appUtils.formatArabicCount(0, "dayElapsed"), "٠ يوم مضى");
  assert.equal(appUtils.formatArabicCount(1, "dayElapsed"), "يوم واحد مضى");
  assert.equal(appUtils.formatArabicCount(2, "dayElapsed"), "يومان مضيا");
  assert.equal(appUtils.formatArabicCount(7, "dayElapsed"), "٧ أيام مضت");
  assert.equal(appUtils.formatArabicCount(29, "dayRemaining"), "٢٩ يوماً متبقياً");
  assert.equal(appUtils.formatArabicCount(0, "dayRemaining"), "٠ يوم متبقٍّ");

  assert.equal(appUtils.formatArabicUnitLabel(0, "dayElapsed"), "يوم مضى");
  assert.equal(appUtils.formatArabicUnitLabel(1, "dayStreak"), "يوم متتالٍ");
  assert.equal(appUtils.formatArabicUnitLabel(2, "dayStreak"), "يومان متتاليان");
  assert.equal(appUtils.formatArabicUnitLabel(7, "dayStreak"), "أيام متتالية");
  assert.equal(appUtils.formatArabicUnitLabel(15, "dayStreak"), "يوماً متتالياً");
  assert.equal(appUtils.formatArabicUnitLabel(100, "dayStreak"), "يوم متتالٍ");

  assert.equal(appUtils.formatArabicCount(604, "page"), "٦٠٤ صفحات");
  assert.equal(appUtils.formatArabicCount(114, "surah"), "١١٤ سورة");
  assert.equal(appUtils.formatArabicCount(7, "ayah"), "٧ آيات");
  assert.equal(appUtils.formatArabicCount(286, "ayah"), "٢٨٦ آية");
  assert.equal(appUtils.formatArabicCount(10, "second"), "١٠ ثوانٍ");
  assert.equal(appUtils.formatArabicCount(12, "section"), "١٢ قسماً");
  assert.equal(appUtils.formatArabicCount(2, "chapter"), "فصلان");
  assert.equal(appUtils.formatArabicCount(5, "chapter"), "٥ فصول");
  assert.equal(appUtils.formatArabicCount(1, "mention"), "مرة واحدة");
  assert.equal(appUtils.formatArabicCount(2, "mention"), "مرتان");
  assert.equal(appUtils.formatArabicCount(7, "mention"), "٧ مرات");
  assert.equal(appUtils.formatArabicCount(25, "mention"), "٢٥ مرة");
});


