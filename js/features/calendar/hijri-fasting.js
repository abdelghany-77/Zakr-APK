/* ── Hijri Calendar, Fasting Occasions & Live Clock ── */
// ========================================
// DATE AND DAILY DUAA FEATURE
// ========================================

/**
 * Updates the date section with current Hijri and Gregorian dates
 * and displays a daily random Duaa.
 */
/**
 * Live Digital Clock for the Hero Calendar
 */
let _cachedLiveClockEl = null;
function updateLiveClockTick() {
  if (document.hidden) return;
  if (!_cachedLiveClockEl || !_cachedLiveClockEl.isConnected) {
    _cachedLiveClockEl = document.getElementById("liveClockText");
  }
  const el = _cachedLiveClockEl;
  if (!el) return;
  const now = new Date();
  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const period = hours >= 12 ? "م" : "ص";
  hours = hours % 12 || 12;
  el.textContent = toArabicNumerals(`${hours}:${minutes}:${seconds} ${period}`);
}
window.updateLiveClockTick = updateLiveClockTick;

function startLiveClock() {
  if (typeof window.startHomeTicker === "function") {
    window.startHomeTicker();
  } else {
    updateLiveClockTick();
  }
}

/**
 * Updates the date section with current Hijri and Gregorian dates,
 * renders interactive calendar strip with fasting indicators,
 * and displays a daily random Duaa.
 */
function updateDailyInfo() {
  const now = new Date();

  // Start live clock
  startLiveClock();

  // 1. Greeting (static) + weekday for the Hijri line
  const weekdayName = new Intl.DateTimeFormat("ar-SA", {
    weekday: "long",
  }).format(now);

  // 2. Update Gregorian Date
  const gregorianMonthElement = document.getElementById("gregorianMonth");
  const gregorianDateElement = document.getElementById("gregorianDate");
  const gregorianFullDate = document.getElementById("gregorianFullDate");

  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const gregMonthName = new Intl.DateTimeFormat("ar-EG", {
    month: "long",
  }).format(now);

  if (gregorianDateElement) {
    gregorianDateElement.textContent = `${dd} / ${mm} / ${yyyy}`;
  }
  if (gregorianMonthElement) {
    gregorianMonthElement.textContent = gregMonthName;
  }
  if (gregorianFullDate) {
    gregorianFullDate.textContent = `${dd} ${gregMonthName} ${yyyy} م`;
  }

  // 3. Update Hijri Date
  const hijriMonthElement = document.getElementById("hijriMonth");
  const hijriDateElement = document.getElementById("hijriDate");
  const hijriFullDate = document.getElementById("hijriFullDate");

  const hijri = getHijriDate(now);
  if (hijriDateElement) {
    hijriDateElement.textContent = `${hijri.day} / ${hijri.month} / ${hijri.year}`;
  }
  if (hijriMonthElement) {
    hijriMonthElement.textContent = hijri.monthName;
  }
  if (hijriFullDate) {
    hijriFullDate.textContent = `${weekdayName} ${toArabicDigits(hijri.day)} ${hijri.monthName} ${toArabicDigits(hijri.year)}`;
  }

  // Update Header with Hijri Date for Duaa
  const duaaHeader = document.getElementById("duaaHeader");
  if (duaaHeader) {
    duaaHeader.textContent = `دعاء اليوم `;
  }

  // 4. Update Daily Duaa
  updateDailyDuaa(now);

  // 5. Friday Banner — show only on Fridays (day 5 = Friday)
  const fridayBanner = document.getElementById("fridayBanner");
  if (fridayBanner) {
    if (now.getDay() === 5) {
      fridayBanner.classList.remove("hidden");
    } else {
      fridayBanner.classList.add("hidden");
    }
  }

  // 6. Fasting Reminder Banner & Calendar Alert & 7-Day Strip
  updateFastingReminder(now);
  updateCalendarFastingAlert(now);
  renderInteractiveCalendar(now);

  // 7. Dynamic Time-Aware Hero Card & Continue Reading Pill
  updateDynamicHeroCard(now);
  updateContinueReadingPill();

  // 8. Ramadan Live Countdown
  startRamadanCountdownTicker();
}

// ========================================
// RAMADAN COUNTDOWN SYSTEM
// ========================================

let ramadanCountdownInterval = null;
let cachedRamadanTarget = null;

function getNextRamadanTarget(now) {
  if (cachedRamadanTarget && cachedRamadanTarget > now) {
    return cachedRamadanTarget;
  }

  let testDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (let i = 0; i <= 365; i++) {
    const h = getHijriDate(testDate);
    if (h.month === 9 && h.day === 1) {
      testDate.setHours(0, 0, 0, 0);
      cachedRamadanTarget = testDate;
      return testDate;
    }
    testDate.setDate(testDate.getDate() + 1);
  }

  return null;
}

/**
 * Adds (or subtracts) whole days to a date without mutating it.
 */
function addDaysToDate(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Arabic-aware day count wording: "يوم واحد" / "يومان" / "٣ أيام" / "٩٠ يومًا".
 */
function formatDaysCount(count) {
  const n = Math.max(0, Math.round(Number(count) || 0));
  if (n === 0) return "اليوم";
  if (n === 1) return "يوم واحد";
  if (n === 2) return "يومان";
  if (n <= 10) return toArabicDigits(n) + " أيام";
  return toArabicDigits(n) + " يومًا";
}

/**
 * Genitive day count for "بعد …": "بعد يوم" / "بعد يومين" / "بعد ٣ أيام".
 */
function formatDaysAfter(count) {
  const n = Math.max(1, Math.round(Number(count) || 0));
  if (n === 1) return "يوم";
  if (n === 2) return "يومين";
  if (n <= 10) return toArabicDigits(n) + " أيام";
  return toArabicDigits(n) + " يومًا";
}

/**
 * Event name without the parenthetical date, for compact rows.
 */
function cleanEventName(name) {
  return String(name || "").replace(/\s*\([^)]*\)\s*/g, " ").trim();
}

/**
 * Ramadan state for the reminders strip / sheet.
 * While inside Ramadan the target is null and `day` holds today's Hijri day.
 */
function getRamadanState(now) {
  const date = now || new Date();
  const hijri = getHijriDate(date);

  if (hijri.month === 9) {
    return {
      inRamadan: true,
      day: hijri.day,
      daysLeft: Math.max(0, 30 - hijri.day),
      pct: Math.min(100, (hijri.day / 30) * 100),
      target: null,
    };
  }

  const target = getNextRamadanTarget(date);
  if (!target) {
    return { inRamadan: false, day: 0, daysLeft: 0, pct: 0, target: null };
  }

  const startOfToday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysLeft = Math.max(0, Math.round((target - startOfToday) / 86400000));
  return {
    inRamadan: false,
    day: 0,
    daysLeft,
    pct: Math.max(3, Math.min(100, 100 - (daysLeft / 354) * 100)),
    target,
  };
}

/**
 * Voluntary-fasting state for the reminders strip / sheet.
 * kind: "forbidden" | "today" | "tomorrow" | "upcoming" | "none"
 */
function getFastingState(now) {
  const date = now || new Date();

  const forbidden = getForbiddenFastReason(date);
  if (forbidden) return { kind: "forbidden", reason: forbidden, events: [] };

  const todayEvents = checkFastingOccasions(date);
  if (todayEvents.length > 0) {
    return { kind: "today", days: 0, events: todayEvents, event: todayEvents[0] };
  }

  for (let i = 1; i <= 14; i++) {
    const future = addDaysToDate(date, i);
    const events = checkFastingOccasions(future);
    if (events.length > 0) {
      return {
        kind: i === 1 ? "tomorrow" : "upcoming",
        days: i,
        date: future,
        events: events,
        event: events[0],
      };
    }
  }

  return { kind: "none", events: [] };
}

function getFastingReminderType(event) {
  if (!event) return "تذكير بالصيام";
  if (event.name && event.name.includes("الأيام البيض")) return "تذكير بالصيام · أيام بيض";
  if (event.badge === "سنة أسبوعية") return "تذكير بالصيام · سنة أسبوعية";
  return event.badge ? `تذكير بالصيام · ${event.badge}` : "تذكير بالصيام";
}

/**
 * Next fasting dates (one entry per day, occasions merged).
 */
function getUpcomingFastingDays(now, maxDays, limit) {
  const date = now || new Date();
  const out = [];
  const max = maxDays || 45;
  const cap = limit || 5;

  for (let i = 1; i <= max && out.length < cap; i++) {
    const future = addDaysToDate(date, i);
    const events = checkFastingOccasions(future);
    if (events.length > 0) out.push({ date: future, events: events });
  }
  return out;
}

/**
 * Renders the compact Home reminders strip (Ramadan + voluntary fasting).
 * Kept compact — all details live in the «تذكير الصيام» bottom sheet.
 */
function updateRemindersStrip(now) {
  const date = now || new Date();
  const ramadan = getRamadanState(date);
  const fasting = getFastingState(date);

  const ramadanChipEl = document.getElementById("remindRamadanSeg");
  const ramadanLabelEl = document.getElementById("remindRamadanLabel");
  const ramadanValueEl = document.getElementById("remindRamadanValue");
  const ramadanDateEl = document.getElementById("remindRamadanDate");
  const ramadanBarEl = document.getElementById("remindRamadanBar");
  const fastingSegEl = document.getElementById("remindFastingSeg");
  const fastingLabelEl = document.getElementById("remindFastingLabel");
  const fastingValueEl = document.getElementById("remindFastingValue");
  const targetLabelEl = document.getElementById("ramadanTargetDateLabel");

  // ── Ramadan chip ──
  const hijriYear = ramadan.inRamadan ? getHijriDate(date).year : getHijriDate(ramadan.target || date).year;
  if (ramadanLabelEl) {
    if (ramadan.inRamadan) {
      ramadanLabelEl.textContent = `رمضان ${toArabicDigits(hijriYear)} — الشهر الحالي`;
    } else if (ramadan.target) {
      const arabicMonths = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
      const targetDay = toArabicDigits(ramadan.target.getDate());
      const targetMonth = arabicMonths[ramadan.target.getMonth()];
      ramadanLabelEl.textContent = `رمضان ${toArabicDigits(hijriYear)} — متوقع ${targetDay} ${targetMonth}`;
    } else {
      ramadanLabelEl.textContent = `رمضان ${toArabicDigits(hijriYear)} — متوقع`;
    }
  }
  if (ramadanValueEl) {
    const fmtDays = (n) =>
      window.TazkeerUtils && window.TazkeerUtils.formatArabicCount
        ? window.TazkeerUtils.formatArabicCount(n, "day")
        : formatDaysAfter(n);
    if (ramadan.inRamadan) {
      ramadanValueEl.textContent = `متبقٍّ ${fmtDays(ramadan.daysLeft)}`;
    } else if (ramadan.target) {
      ramadanValueEl.textContent = `بعد ${formatDaysAfter(ramadan.daysLeft)}`;
    } else {
      ramadanValueEl.textContent = "—";
    }
  }
  if (ramadanBarEl) {
    const pct = ramadan.inRamadan
      ? (ramadan.day / 30) * 100
      : Math.max(8, Math.min(100, ((354 - ramadan.daysLeft) / 354) * 100));
    ramadanBarEl.style.width = pct.toFixed(1) + "%";
  }
  if (targetLabelEl && ramadan.target) {
    targetLabelEl.textContent = "متوقع: " + formatHijriDateLong(ramadan.target);
  }

  // ── Fasting chip ──
  const showFasting = true;
  const spanning = !showFasting;

  if (ramadanChipEl) ramadanChipEl.classList.toggle("is-span-2", spanning);
  if (ramadanDateEl) {
    if (spanning && ramadan.target) {
      ramadanDateEl.hidden = false;
      ramadanDateEl.textContent = "متوقع " + formatHijriDateLong(ramadan.target);
    } else {
      ramadanDateEl.hidden = true;
    }
  }

  if (!fastingSegEl) return;
  if (!showFasting) {
    fastingSegEl.style.display = "none";
    return;
  }
  fastingSegEl.style.display = "";
  if (!fastingLabelEl || !fastingValueEl) return;

  const event = fasting.event || (fasting.events && fasting.events[0]);
  if (!event) {
    const next = getUpcomingFastingDays(date, 45, 1)[0];
    if (!next) {
      fastingLabelEl.textContent = "تذكير الصيام";
      fastingValueEl.textContent = "لا يوجد موعد قريب";
      return;
    }
    fasting.days = Math.max(1, Math.round((next.date - new Date(date.getFullYear(), date.getMonth(), date.getDate())) / 86400000));
    fasting.date = next.date;
    fasting.event = next.events[0];
    fasting.kind = "upcoming";
  }

  const arabicWeekdays = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const fajrRaw = (prayerTimesData && prayerTimesData.Fajr) || "04:47";
  const formattedFajr = formatToArabic12Hour(fajrRaw) || "٤:٤٧ ص";
  const maghribRaw = (prayerTimesData && prayerTimesData.Maghrib) || "17:02";
  const formattedMaghrib = formatToArabic12Hour(maghribRaw) || "٥:٠٢ م";

  if (fasting.kind === "today") {
    const todayDayName = arabicWeekdays[date.getDay()];
    fastingLabelEl.textContent = `تذكير بالصيام · اليوم ${todayDayName}`;
    fastingValueEl.textContent = `الإفطار عند المغرب ${formattedMaghrib}`;
  } else if (fasting.kind === "tomorrow") {
    const tmrDayName = arabicWeekdays[(date.getDay() + 1) % 7];
    const reminderType = getFastingReminderType(fasting.event);
    fastingLabelEl.textContent = reminderType ? `${reminderType} · غداً ${tmrDayName}` : `تذكير بالصيام · غداً ${tmrDayName}`;
    fastingValueEl.textContent = `السحور قبل الفجر ${formattedFajr}`;
  } else {
    const targetDayName = fasting.date ? arabicWeekdays[fasting.date.getDay()] : "";
    const reminderType = getFastingReminderType(fasting.event);
    if (reminderType && targetDayName) {
      fastingLabelEl.textContent = `${reminderType} · ${targetDayName}`;
    } else if (targetDayName) {
      fastingLabelEl.textContent = `تذكير بالصيام · ${targetDayName}`;
    } else {
      fastingLabelEl.textContent = "تذكير بالصيام";
    }
    fastingValueEl.textContent = `السحور قبل الفجر ${formattedFajr}`;
  }
}

function getRamadanCountdownParts(target, now) {
  const remaining = Math.max(0, target.getTime() - now.getTime());
  const totalMinutes = Math.floor(remaining / 60000);
  return {
    days: Math.floor(totalMinutes / 1440),
    hours: Math.floor((totalMinutes % 1440) / 60),
    minutes: totalMinutes % 60,
  };
}

function getNextMidnight(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}

/**
 * "H:MM:SS" remaining until Maghrib, with Arabic digits inside a bdi.
 */
function iftarCountdown(now) {
  try {
    const time = prayerTimesData && prayerTimesData.Maghrib;
    if (!time) return "المغرب";
    const [h, m] = String(time).split(" ")[0].split(":").map(Number);
    if (isNaN(h) || isNaN(m)) return "المغرب";
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
    const diff = Math.floor((target - now) / 1000);
    if (diff <= 0) return "المغرب";
    const pad = (n) => String(n).padStart(2, "0");
    const text = toArabicNumerals(
      `${Math.floor(diff / 3600)}:${pad(Math.floor((diff % 3600) / 60))}:${pad(diff % 60)}`,
    );
    return `<bdi dir="ltr" style="unicode-bidi:isolate">${text}</bdi>`;
  } catch (e) {
    return "المغرب";
  }
}

/**
 * Short label for the strip ("صيام الخميس" → "الخميس").
 */
function shortFastingName(event) {
  if (!event || !event.name) return "";
  return String(event.name).replace(/^صيام\s+/, "");
}

/**
 * "٨ فبراير ٢٠٢٧ م" style long date.
 */
function formatGregorianDateLong(date) {
  try {
    return date.toLocaleDateString("ar-EG", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch (e) {
    return date.getDate() + "/" + (date.getMonth() + 1) + "/" + date.getFullYear();
  }
}

/**
 * "١ رمضان ١٤٤٩ هـ" style Hijri date.
 */
function formatHijriDateLong(date) {
  const hijri = getHijriDate(date);
  return `${toArabicDigits(hijri.day)} ${hijri.monthName} ${toArabicDigits(hijri.year)} هـ`;
}

function updateRamadanCountdown() {
  updateRemindersStrip(new Date());
  const sheetBody = document.getElementById("remindersSheetBody");
  if (sheetBody && sheetBody.querySelector('[data-rsheet-focus="ramadan"]')) {
    sheetBody.innerHTML = buildRemindersSheetHtml("ramadan");
  }
}


function startRamadanCountdownTicker() {
  if (ramadanCountdownInterval) {
    clearInterval(ramadanCountdownInterval);
  }
  updateRamadanCountdown();
  ramadanCountdownInterval = setInterval(() => {
    if (document.hidden) return;
    if (window.AppRouter && window.AppRouter.getCurrentTab() !== "tab-home") return;
    updateRamadanCountdown();
  }, 60000);
}
window.updateRamadanCountdown = updateRamadanCountdown;

// ========================================
// FASTING REMINDER & CALENDAR SYSTEM
// ========================================

// Cached Intl.DateTimeFormat instances to avoid expensive ICU re-allocation per call
let _hijriNumericFmt = null;
let _hijriNamedFmt = null;

/**
 * Gets Hijri date parts for a given Gregorian date.
 * Returns { day: number, month: number, year: number, monthName: string }
 */
function getHijriDate(date) {
  try {
    if (!_hijriNumericFmt) {
      _hijriNumericFmt = new Intl.DateTimeFormat(
        "en-US-u-ca-islamic-umalqura",
        {
          day: "numeric",
          month: "numeric",
          year: "numeric",
        },
      );
    }
    if (!_hijriNamedFmt) {
      _hijriNamedFmt = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
        month: "long",
      });
    }

    const parts = _hijriNumericFmt.formatToParts(date);
    const day = parseInt(parts.find((p) => p.type === "day")?.value || "0", 10);
    const month = parseInt(parts.find((p) => p.type === "month")?.value || "0", 10);
    const year = parseInt(parts.find((p) => p.type === "year")?.value || "0", 10);
    const monthName = _hijriNamedFmt.format(date);

    return { day, month, year, monthName };
  } catch (e) {
    return { day: 1, month: 1, year: 1448, monthName: "محرم" };
  }
}

/**
 * Returns the reason a given date is a forbidden fast day, or null.
 * Festivals of breaking the fast and the days of Tashreeq must never
 * carry a fasting reminder.
 */
function getForbiddenFastReason(date) {
  const hijri = getHijriDate(date);
  // 1 شوال — عيد الفطر
  if (hijri.month === 10 && hijri.day === 1) return "عيد الفطر";
  // 10 ذو الحجة — عيد الأضحى (يوم النحر)
  if (hijri.month === 12 && hijri.day === 10) return "عيد الأضحى";
  // 11–13 ذو الحجة — أيام التشريق
  if (hijri.month === 12 && hijri.day >= 11 && hijri.day <= 13) {
    return "أيام التشريق";
  }
  return null;
}

/**
 * Checks all Islamic fasting occasions for a given date.
 * Returns an array of fasting events, each with { name, detail, badge, priority }.
 */
function checkFastingOccasions(date) {
  const hijri = getHijriDate(date);
  const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon, ..., 4=Thu, 5=Fri, 6=Sat
  const events = [];

  // Ramadan is an obligatory fast (no voluntary-fasting reminder needed),
  // and the Eids / days of Tashreeq are forbidden fast days.
  if (hijri.month === 9) return [];
  if (getForbiddenFastReason(date)) return [];

  // ── 1. يوم عاشوراء (10 محرم) + تاسوعاء (9 محرم) ──
  if (hijri.month === 1 && hijri.day === 10) {
    events.push({
      name: "يوم عاشوراء",
      detail: "١٠ محرم — يُكفِّر السنة التي قبله",
      badge: "سنة مؤكدة",
      priority: 1,
    });
  }
  if (hijri.month === 1 && hijri.day === 9) {
    events.push({
      name: "يوم تاسوعاء",
      detail: "٩ محرم — يُستحب صيامه مع عاشوراء مخالفةً لأهل الكتاب",
      badge: "سنة مؤكدة",
      priority: 1,
    });
  }

  // ── 2. يوم عرفة (9 ذو الحجة) لغير الحاج ──
  if (hijri.month === 12 && hijri.day === 9) {
    events.push({
      name: "يوم عرفة",
      detail: "٩ ذو الحجة — يُكفِّر سنتين (التي قبله والتي بعده)",
      badge: "سنة مؤكدة",
      priority: 1,
    });
  }

  // ── 3. الأيام البيض (13-14-15 من كل شهر هجري) ──
  if (hijri.day >= 13 && hijri.day <= 15) {
    events.push({
      name: `الأيام البيض (${toArabicDigits(hijri.day)} ${hijri.monthName})`,
      detail: `صيام ثلاثة أيام من كل شهر كصيام الدهر كله`,
      badge: "سنة شهرية",
      priority: 3,
    });
  }

  // ── 4. ستة أيام من شوال ──
  if (hijri.month === 10 && hijri.day >= 2 && hijri.day <= 7) {
    events.push({
      name: "أيام شوال الستة",
      detail: `${toArabicDigits(hijri.day)} شوال — من صام رمضان ثم أتبعه ستًّا من شوال كان كصيام الدهر`,
      badge: "سنة سنوية",
      priority: 2,
    });
  }

  // ── 5. صيام العشر الأوائل من ذي الحجة (1-8) ──
  if (hijri.month === 12 && hijri.day >= 1 && hijri.day <= 8) {
    events.push({
      name: "تسع ذي الحجة",
      detail: `${toArabicDigits(hijri.day)} ذو الحجة — ما من أيام العمل الصالح فيها أحبّ إلى الله من هذه الأيام`,
      badge: "مستحب",
      priority: 2,
    });
  }

  // ── 6. صيام شعبان ──
  if (hijri.month === 8 && hijri.day >= 1 && hijri.day <= 15) {
    events.push({
      name: `صيام شعبان`,
      detail: `${toArabicDigits(hijri.day)} شعبان — شهرٌ تُرفع فيه الأعمال إلى الله وكان النبي ﷺ يُكثر من صيامه`,
      badge: "مستحب",
      priority: 4,
    });
  }

  // ── 7. صيام محرم ──
  if (hijri.month === 1 && hijri.day !== 9 && hijri.day !== 10) {
    events.push({
      name: "صيام المحرم",
      detail: `${toArabicDigits(hijri.day)} محرم — أفضل الصيام بعد رمضان شهر الله المحرم`,
      badge: "مستحب",
      priority: 5,
    });
  }

  // ── 8. الاثنين والخميس من كل أسبوع ──
  if (dayOfWeek === 1) {
    // Monday
    events.push({
      name: "صيام الاثنين",
      detail: "يوم تُعرض فيه الأعمال على الله وأحب أن يُعرض عملي وأنا صائم",
      badge: "سنة أسبوعية",
      priority: 6,
    });
  }
  if (dayOfWeek === 4) {
    // Thursday
    events.push({
      name: "صيام الخميس",
      detail: "يوم تُعرض فيه الأعمال على الله وأحب أن يُعرض عملي وأنا صائم",
      badge: "سنة أسبوعية",
      priority: 6,
    });
  }

  // Sort by priority (lower = more important)
  events.sort((a, b) => a.priority - b.priority);
  return events;
}

/**
 * Renders the 7-day interactive week strip in the calendar card.
 */
function renderInteractiveCalendar(now) {
  const strip = document.getElementById("calWeekStrip");
  if (!strip) return;

  const dayNamesArabic = [
    "الأحد",
    "الاثنين",
    "الثلاثاء",
    "الأربعاء",
    "الخميس",
    "الجمعة",
    "السبت",
  ];

  // 7 days: 2 days before today up to 4 days ahead
  const days = [];
  for (let offset = -2; offset <= 4; offset++) {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    days.push(d);
  }

  strip.innerHTML = days
    .map((date) => {
      const isToday = date.toDateString() === now.toDateString();
      const dayOfWeek = date.getDay();
      const dayName = dayNamesArabic[dayOfWeek];
      const hijri = getHijriDate(date);
      const gregDay = date.getDate();
      const occasions = checkFastingOccasions(date);
      const isFasting = occasions.length > 0;
      const topOccasion = isFasting ? occasions[0] : null;

      return `
        <div class="cal-day-pill ${isToday ? "cal-day--today" : ""} ${isFasting ? "cal-day--fasting" : ""}"
             onclick="selectCalendarDay('${date.toISOString()}', ${isToday}, ${isFasting})"
             role="button"
             tabindex="0"
             title="${isToday ? "اليوم - " : ""}${isFasting ? topOccasion.name + " - " + topOccasion.detail : dayName}">
          ${isToday ? '<span class="cal-today-top-bar"></span>' : ""}
          <span class="cal-day-name">${dayName}</span>
          <span class="cal-day-hijri-num">${toArabicDigits(hijri.day)}</span>
          <span class="cal-day-greg-num">${toArabicDigits(gregDay)}</span>
          ${isFasting ? '<span class="cal-fasting-tag">صيام</span>' : ""}
        </div>
      `;
    })
    .join("");
}

/**
 * Handles clicking a day in the 7-day strip.
 */
function selectCalendarDay(dateStr, isToday, isFasting) {
  const date = new Date(dateStr);
  const panel = document.getElementById("calDayDetailPanel");
  const content = document.getElementById("calDayDetailContent");
  if (!panel || !content) return;

  const dayNames = [
    "الأحد",
    "الاثنين",
    "الثلاثاء",
    "الأربعاء",
    "الخميس",
    "الجمعة",
    "السبت",
  ];
  const dayName = dayNames[date.getDay()];
  const hijri = getHijriDate(date);
  const gregFormatted = `${toArabicDigits(date.getDate())} / ${toArabicDigits(date.getMonth() + 1)} / ${toArabicDigits(date.getFullYear())}`;
  const occasions = checkFastingOccasions(date);

  let html = `
    <div class="cal-panel-top">
      <div class="cal-panel-header">
        <span class="cal-panel-day">${dayName} ${isToday ? "— اليوم" : ""}</span>
        <span class="cal-panel-date">${toArabicDigits(hijri.day)} ${hijri.monthName} ${toArabicDigits(hijri.year)} هـ — ${gregFormatted} م</span>
      </div>
    </div>
  `;

  if (occasions.length > 0) {
    html += `
      <div class="cal-panel-fasting-box">
        <div class="cal-panel-fasting-title">
          <i class="fas fa-calendar-day modal-gold-icon"></i>
          <strong>${occasions[0].name}</strong>
          <span class="foc-badge foc-badge--gold">${occasions[0].badge}</span>
        </div>
        <p class="cal-panel-fasting-detail">${occasions[0].detail}</p>
        ${
          occasions.length > 1
            ? `<p class="cal-panel-extra">وأيضاً: ${occasions
                .slice(1)
                .map((e) => e.name)
                .join("، ")}</p>`
            : ""
        }
        <button class="cal-panel-guide-btn" onclick="openFastingGuideModal()">
          <i class="fas fa-book-open"></i> قراءة دليل وفضائل الصيام
        </button>
      </div>
    `;
  } else {
    html += `
      <div class="cal-panel-regular-box">
        <p><i class="fas fa-calendar-check"></i> يوم مبارك — رطّب لسانك بذكر الله وقراءة القرآن</p>
      </div>
    `;
  }

  content.innerHTML = html;
  panel.classList.remove("hidden");
}

function closeCalDayDetail() {
  const panel = document.getElementById("calDayDetailPanel");
  if (panel) panel.classList.add("hidden");
}

/**
 * Updates the Home reminders strip (fasting segment).
 * The strip replaced the old always-visible fasting card.
 */
function updateCalendarFastingAlert(now) {
  updateRemindersStrip(now || new Date());
}

/**
 * Builds the «تذكير الصيام» bottom-sheet body from live Hijri data.
 * @param {Date} [atDate] Optional reference date (defaults to now).
 */
function buildRemindersSheetHtml(tab, atDate) {
  if (tab instanceof Date) {
    atDate = tab;
    tab = "fasting";
  }
  const activeTab = tab === "ramadan" ? "ramadan" : "fasting";
  const now = atDate || new Date();
  const ramadan = getRamadanState(now);
  const fasting = getFastingState(now);
  const upcoming = getUpcomingFastingDays(now, 45, 5);

  const dayNames = [
    "الأحد",
    "الاثنين",
    "الثلاثاء",
    "الأربعاء",
    "الخميس",
    "الجمعة",
    "السبت",
  ];

  // ── Ramadan block ──
  let ramadanHtml = "";
  // ── Fasting block ──
  let fastingHtml = "";
  if (fasting.kind === "forbidden") {
    fastingHtml = `
      <div class="pt-rsheet__block" data-rsheet="fasting">
        <div class="pt-rsheet__top">
          <span class="pt-rsheet__kicker"><i class="fas fa-calendar-alt"></i> صيام التطوع</span>
          <span class="pt-rsheet__chip">لا صيام</span>
        </div>
        <p class="pt-rsheet__date">${fasting.reason} — لا يجوز صيامه.</p>
        <p class="pt-rsheet__hint">«أيام التشريق أيام أكل وشرب وذكر لله» — رواه مسلم. يعود تذكير الصيام بعد انتهاء هذه الأيام.</p>
      </div>`;
  } else if (fasting.kind === "today") {
    fastingHtml = `
      <div class="pt-rsheet__block is-em" data-rsheet="fasting">
        <div class="pt-rsheet__top">
          <span class="pt-rsheet__kicker"><i class="fas fa-calendar-alt"></i> صيام التطوع</span>
          <span class="pt-rsheet__chip">اليوم</span>
        </div>
        <p class="pt-rsheet__date">${fasting.events.map((e) => cleanEventName(e.name)).join(" · ")}</p>
        <p class="pt-rsheet__hint">${fasting.event.detail} — تقبّل الله صيامك.</p>
      </div>`;
  } else if (fasting.kind === "tomorrow") {
    fastingHtml = `
      <div class="pt-rsheet__block" data-rsheet="fasting">
        <div class="pt-rsheet__top">
          <span class="pt-rsheet__kicker"><i class="fas fa-calendar-alt"></i> صيام التطوع</span>
          <span class="pt-rsheet__chip">غدًا</span>
        </div>
        <p class="pt-rsheet__date">${fasting.events.map((e) => cleanEventName(e.name)).join(" · ")}</p>
        <p class="pt-rsheet__hint">${fasting.event.detail} — انوِ الصيام وجهّز سحورك.</p>
      </div>`;
  } else if (fasting.kind === "upcoming") {
    fastingHtml = `
      <div class="pt-rsheet__block" data-rsheet="fasting">
        <div class="pt-rsheet__top">
          <span class="pt-rsheet__kicker"><i class="fas fa-calendar-alt"></i> صيام التطوع</span>
          <span class="pt-rsheet__chip">بعد ${formatDaysAfter(fasting.days)}</span>
        </div>
        <p class="pt-rsheet__date">${fasting.events.map((e) => cleanEventName(e.name)).join(" · ")}</p>
        <p class="pt-rsheet__hint">${fasting.event.detail}</p>
      </div>`;
  } else {
    fastingHtml = `
      <div class="pt-rsheet__block" data-rsheet="fasting">
        <div class="pt-rsheet__top">
          <span class="pt-rsheet__kicker"><i class="fas fa-calendar-alt"></i> صيام التطوع</span>
          <span class="pt-rsheet__chip">سنة</span>
        </div>
        <p class="pt-rsheet__date">الاثنين والخميس والأيام البيض</p>
        <p class="pt-rsheet__hint">نوّع صيامك واغتنم الأجر — يُستحب صيام الاثنين والخميس و١٣ و١٤ و١٥ من كل شهر هجري.</p>
      </div>`;
  }

  // ── Upcoming fasting days ──
  let upcomingHtml = "";
  if (upcoming.length > 0) {
    upcomingHtml = `
      <div class="pt-rsheet__section">
        <h3 class="pt-rsheet__section-title"><i class="fas fa-calendar-day"></i> أقرب أيام الصيام</h3>
        <div class="pt-rsheet__list">
          ${upcoming
            .map((item, index) => {
              const hijri = getHijriDate(item.date);
              const names = item.events.map((e) => cleanEventName(e.name)).join(" · ");
              const chip = index === 0 ? "الأقرب" : item.events[0].badge;
              return `
            <div class="pt-rsheet__item">
              <div class="pt-rsheet__item-main">
                <span class="pt-rsheet__item-title">${names}</span>
                <span class="pt-rsheet__item-sub">${dayNames[item.date.getDay()]} · ${toArabicDigits(hijri.day)} ${hijri.monthName}</span>
              </div>
              <span class="pt-rsheet__item-chip${index === 0 ? " is-next" : ""}">${chip}</span>
            </div>`;
            })
            .join("")}
        </div>
      </div>`;
  }

  // ── Rules + note + guide ──
  const rulesHtml = `
    <div class="pt-rsheet__section">
      <h3 class="pt-rsheet__section-title"><i class="fas fa-list-check"></i> سنن الصيام</h3>
      <div class="pt-rsheet__rules">
        <span class="pt-chip">الاثنين والخميس</span>
        <span class="pt-chip">الأيام البيض ١٣–١٥</span>
        <span class="pt-chip">ستة من شوال</span>
        <span class="pt-chip">عاشوراء وتاسوعاء</span>
        <span class="pt-chip">يوم عرفة</span>
        <span class="pt-chip">تسع ذي الحجة</span>
      </div>
      <div class="pt-rsheet__note">
        <i class="fas fa-circle-info"></i>
        <span>لا صيام في يومَي العيد ولا في أيام التشريق (١١–١٣ ذو الحجة)، ويُكره إفراد الجمعة أو السبت بالصيام.</span>
      </div>
    </div>`;

  const ramadanCountdownTarget = ramadan.inRamadan ? getNextMidnight(now) : ramadan.target;
  const ramadanCountdown = ramadanCountdownTarget
    ? getRamadanCountdownParts(ramadanCountdownTarget, now)
    : { days: ramadan.daysLeft, hours: 0, minutes: 0 };
  const ramadanFocusHtml = ramadanCountdownTarget
    ? `
      <div class="pt-rsheet-focus" data-rsheet-focus="ramadan">
        <div class="pt-rsheet-focus__heading">
          <div>
            <h3>رمضان ${toArabicDigits(getHijriDate(ramadan.target || now).year)}</h3>
            <p>${ramadan.inRamadan ? "اليوم من رمضان · يتجدد العداد مع بداية اليوم التالي" : "الموعد المتوقع " + formatGregorianDateLong(ramadan.target) + " · التاريخ متوقع فلكيًا وقد يتغيّر يومًا حسب الرؤية"}</p>
          </div>
          <span class="pt-rsheet-focus__moon"><i class="fas fa-moon"></i></span>
        </div>
        <div class="pt-rsheet-focus__stats">
          <div class="pt-rsheet-focus__stat is-gold">
            <strong>${toArabicDigits(ramadan.inRamadan ? ramadan.daysLeft : ramadanCountdown.days)}</strong>
            <span>يومًا</span>
          </div>
          <div class="pt-rsheet-focus__stat">
            <strong>${toArabicDigits(ramadanCountdown.hours)}</strong>
            <span>ساعة</span>
          </div>
          <div class="pt-rsheet-focus__stat">
            <strong>${toArabicDigits(ramadanCountdown.minutes)}</strong>
            <span>دقيقة</span>
          </div>
        </div>
        <p class="pt-rsheet-focus__dua">اللهم بلّغنا رمضان</p>
      </div>`
    : "";

  return `
    <div class="pt-rsheet-tabs" role="tablist">
      <button type="button" class="${activeTab === "fasting" ? "is-active" : ""}" onclick="window.selectRemindersTab('fasting')">الصيام</button>
      <button type="button" class="${activeTab === "ramadan" ? "is-active" : ""}" onclick="window.selectRemindersTab('ramadan')">رمضان</button>
    </div>
    ${activeTab === "ramadan" ? ramadanFocusHtml : `
      ${ramadanHtml}
      ${ramadan.inRamadan ? "" : fastingHtml}
      ${upcomingHtml}
      ${rulesHtml}
      <button type="button" class="pt-rsheet__cta" onclick="openFastingGuideFromReminders()">
        <i class="fas fa-book-open"></i>
        دليل وفضائل الصيام
      </button>
    `}
  `;
}

/**
 * Opens the reminders bottom sheet, registered with AppRouter so that the
 * Android back button closes it before anything else.
 * @param {string} [tab] Optional section to focus ("ramadan" | "fasting").
 * @param {Date} [atDate] Optional reference date (defaults to now).
 */
function openRemindersSheet(tab, atDate) {
  const sheet = document.getElementById("remindersSheet");
  const body = document.getElementById("remindersSheetBody");
  if (!sheet || !body) return;

  body.innerHTML = buildRemindersSheetHtml(tab, atDate);
  sheet.classList.add("is-open");
  document.body.classList.add("modal-open");

  const panel = sheet.querySelector(".pt-sheet__panel");
  if (panel) panel.scrollTop = 0;

  if (window.AppRouter && !window.AppRouter.isModalOpen("remindersSheet")) {
    window.AppRouter.pushModal("remindersSheet", function () {
      closeRemindersSheet(false);
    });
  }

}

function closeRemindersSheet(syncRouter) {
  const sheet = document.getElementById("remindersSheet");
  if (sheet) sheet.classList.remove("is-open");
  if (document.body && (!window.AppRouter || !window.AppRouter.isModalOpen())) {
    document.body.classList.remove("modal-open");
  }
  if (
    syncRouter !== false &&
    window.AppRouter &&
    window.AppRouter.isModalOpen("remindersSheet")
  ) {
    window.AppRouter.closeModal("remindersSheet");
  }
}

function selectRemindersTab(tab) {
  const body = document.getElementById("remindersSheetBody");
  if (!body) return;
  body.innerHTML = buildRemindersSheetHtml(tab);
  const panel = document.querySelector("#remindersSheet .pt-sheet__panel");
  if (panel) panel.scrollTop = 0;
}

/**
 * Leaves the sheet and opens the full fasting guide modal above it.
 */
function openFastingGuideFromReminders() {
  closeRemindersSheet();
  window.setTimeout(function () {
    if (typeof openFastingGuideModal === "function") openFastingGuideModal();
  }, 180);
}

window.openRemindersSheet = openRemindersSheet;
window.selectRemindersTab = selectRemindersTab;
window.closeRemindersSheet = closeRemindersSheet;
window.openFastingGuideFromReminders = openFastingGuideFromReminders;

/**
 * Updates the standalone fasting reminder banner.
 */
function updateFastingReminder(now) {
  const banner = document.getElementById("fastingBanner");
  if (!banner) return;

  const label = document.getElementById("fastingLabel");
  const subtitle = document.getElementById("fastingSubtitle");
  const badge = document.getElementById("fastingBadge");
  const badgeText = document.getElementById("fastingBadgeText");

  const todayEvents = checkFastingOccasions(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowEvents = checkFastingOccasions(tomorrow);

  const messages = [];

  if (todayEvents.length > 0) {
    const mainEvent = todayEvents[0];
    messages.push({
      label: `🌙 اليوم ${mainEvent.name}`,
      subtitle: mainEvent.detail,
      badge: mainEvent.badge,
      isToday: true,
      priority: mainEvent.priority,
    });
  }

  if (tomorrowEvents.length > 0) {
    const mainEvent = tomorrowEvents[0];
    if (messages.length === 0 || mainEvent.priority <= 3) {
      messages.push({
        label: `🌅 غدًا ${mainEvent.name}`,
        subtitle: mainEvent.detail,
        badge: mainEvent.badge,
        isToday: false,
        priority: mainEvent.priority,
      });
    }
  }

  if (messages.length === 0) {
    banner.classList.add("hidden");
    return;
  }

  const bestMsg = messages.sort((a, b) => {
    if (a.isToday && !b.isToday) return -1;
    if (!a.isToday && b.isToday) return 1;
    return a.priority - b.priority;
  })[0];

  if (label) label.textContent = bestMsg.label;
  if (subtitle) {
    let subtitleText = bestMsg.subtitle;
    const allEvents = bestMsg.isToday ? todayEvents : tomorrowEvents;
    if (allEvents.length > 1) {
      const otherNames = allEvents
        .slice(1, 3)
        .map((e) => e.name)
        .join("، ");
      subtitleText += ` | وأيضًا: ${otherNames}`;
    }
    subtitle.textContent = subtitleText;
  }
  if (badgeText) badgeText.textContent = bestMsg.badge;
  if (badge) badge.style.display = "";

  banner.classList.remove("hidden");
}

/**
 * Opens Surah Al-Kahf directly in the Mushaf reader.
 */
function openSurahAlKahf() {
  switchTab("tab-quran");
  setTimeout(() => {
    if (typeof openFreeReader === "function") {
      openFreeReader(293, 304);
    }
  }, 150);
}

/**
 * Opens Surah Al-Mulk directly in the Mushaf reader.
 */
function openSurahAlMulk() {
  switchTab("tab-quran");
  setTimeout(() => {
    if (typeof openFreeReader === "function") {
      openFreeReader(562, 564);
    }
  }, 150);
}

