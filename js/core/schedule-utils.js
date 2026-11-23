/**
 * Shared schedule utilities — single source of truth for browser runtime & Node tests.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.TazkeerScheduleUtils = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

  function hashString(value) {
    var hash = 2166136261;
    for (var index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function parseLocalTime(value) {
    var match = typeof value === "string" ? value.match(TIME_PATTERN) : null;
    if (!match) return null;
    return { hours: Number(match[1]), minutes: Number(match[2]) };
  }

  function stableNotificationId(namespace, dateKey, reminderKey) {
    var hash = hashString(namespace + ":" + dateKey + ":" + reminderKey);
    return 10000 + (hash % 1000000000);
  }

  function localDateKey(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
  }

  /**
   * Adds deltaMinutes to a local (dateKey, HH:MM) pair, rolling over dateKey
   * accurately across midnight boundaries (e.g. 23:30 + 60 -> next day 00:30).
   */
  function addMinutesToLocalDateTime(dateKey, hhmm, deltaMinutes) {
    var parsed = parseLocalTime(hhmm);
    if (!parsed || typeof dateKey !== "string") return null;
    var parts = dateKey.split("-").map(Number);
    if (parts.length !== 3 || parts.some(function (n) { return !Number.isFinite(n); })) {
      return null;
    }
    var base = new Date(parts[0], parts[1] - 1, parts[2], parsed.hours, parsed.minutes, 0, 0);
    if (Number.isNaN(base.getTime())) return null;
    var shifted = new Date(base.getTime() + Number(deltaMinutes || 0) * 60000);
    return {
      dateKey: localDateKey(shifted),
      timeOfDay:
        String(shifted.getHours()).padStart(2, "0") +
        ":" +
        String(shifted.getMinutes()).padStart(2, "0"),
      timestamp: shifted.getTime(),
    };
  }

  function normalizeDailyReminders(reminders) {
    if (!Array.isArray(reminders)) return [];

    return reminders
      .filter(function (reminder) {
        return reminder && reminder.enabled !== false;
      })
      .map(function (reminder) {
        var out = {
          key: String(reminder.key || ""),
          time: String(reminder.time || ""),
          title: String(reminder.title || "تذكير الأذكار"),
          body: String(reminder.body || ""),
        };
        if (reminder.section) {
          out.section = String(reminder.section);
        }
        return out;
      })
      .filter(function (reminder) {
        return Boolean(reminder.key && parseLocalTime(reminder.time));
      });
  }

  function buildDailySchedule(date, reminders, namespace) {
    if (namespace === undefined) namespace = "azkar";
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return [];

    var dateKey = localDateKey(date);

    return normalizeDailyReminders(reminders).map(function (reminder) {
      var time = parseLocalTime(reminder.time);
      var at = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        time.hours,
        time.minutes,
        0,
        0
      );

      var entry = {
        id: stableNotificationId(namespace, dateKey, reminder.key),
        date: dateKey,
        time: at.getTime(),
        timeOfDay: reminder.time,
        key: reminder.key,
        title: reminder.title,
        body: reminder.body,
      };
      if (reminder.section) {
        entry.section = reminder.section;
      }
      return entry;
    });
  }

  function validateSchedule(schedule, now) {
    if (now === undefined) now = Date.now();
    if (!Array.isArray(schedule) || schedule.length === 0) return false;

    var ids = new Set();
    return schedule.every(function (entry) {
      if (!entry || !Number.isInteger(entry.id) || ids.has(entry.id)) return false;
      if (!Number.isFinite(entry.time) || entry.time <= now) return false;
      if (!parseLocalTime(entry.timeOfDay)) return false;
      if (typeof entry.date !== "string" || !entry.date) return false;
      ids.add(entry.id);
      return true;
    });
  }

  function shouldReplaceSchedule(nextSchedule, now) {
    if (now === undefined) now = Date.now();
    return validateSchedule(nextSchedule, now);
  }

  function nextLocalMidnight(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  }

  function hasScheduleChanged(previous, next) {
    if (!Array.isArray(previous) || !Array.isArray(next)) return true;
    if (previous.length !== next.length) return true;
    return previous.some(function (entry, index) {
      var candidate = next[index];
      return (
        !candidate ||
        entry.id !== candidate.id ||
        entry.time !== candidate.time ||
        entry.title !== candidate.title ||
        entry.body !== candidate.body
      );
    });
  }

  return {
    parseLocalTime: parseLocalTime,
    stableNotificationId: stableNotificationId,
    normalizeDailyReminders: normalizeDailyReminders,
    buildDailySchedule: buildDailySchedule,
    validateSchedule: validateSchedule,
    shouldReplaceSchedule: shouldReplaceSchedule,
    localDateKey: localDateKey,
    nextLocalMidnight: nextLocalMidnight,
    hasScheduleChanged: hasScheduleChanged,
    addMinutesToLocalDateTime: addMinutesToLocalDateTime,
  };
});
