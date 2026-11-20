import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const scheduleUtils = require("./schedule-utils.js");

export const {
  parseLocalTime,
  stableNotificationId,
  normalizeDailyReminders,
  buildDailySchedule,
  validateSchedule,
  shouldReplaceSchedule,
  localDateKey,
  nextLocalMidnight,
  hasScheduleChanged,
  addMinutesToLocalDateTime,
} = scheduleUtils;
