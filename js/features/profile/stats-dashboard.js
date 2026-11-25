/* ── Profile Statistics Dashboard & Weekly Charts ── */
// Global hook to refresh all user data in memory after JSON import or restore
function refreshAllUserData() {
  try {
    dailyProgress = JSON.parse(localStorage.getItem("dailyProgress")) || {
      date: new Date().toDateString(),
      completedZekr: [],
      streak: parseInt(localStorage.getItem("dailyStreak")) || 0,
      totalCompletions: parseInt(localStorage.getItem("totalCompletions")) || 0,
    };
    weeklyProgress = JSON.parse(localStorage.getItem("weeklyProgress")) || {};

    if (typeof loadProgress === "function") loadProgress();
    if (typeof checkDailyProgress === "function") checkDailyProgress();
    if (typeof updateStatsDashboard === "function") updateStatsDashboard();
    if (typeof updateWeeklyChart === "function") updateWeeklyChart();
    if (typeof updateQuranWeeklyChart === "function") updateQuranWeeklyChart();
    if (typeof updateProfileTab === "function") updateProfileTab();
    if (typeof loadKhatmahState === "function") loadKhatmahState();
    if (typeof initializePrayerTimes === "function") initializePrayerTimes();
  } catch (e) {
    console.warn("refreshAllUserData error", e);
  }
}
window.refreshAllUserData = refreshAllUserData;

// ========================================
// STATISTICS DASHBOARD
// ========================================

// Weekly progress data stored in localStorage
let weeklyProgress = JSON.parse(localStorage.getItem("weeklyProgress")) || {};

function initializeStatsDashboard() {
  // Update stats on load
  updateStatsDashboard();
  updateWeeklyChart();
  if (typeof updateQuranWeeklyChart === "function") {
    updateQuranWeeklyChart();
  }
}

function updateStatsDashboard() {
  const today = new Date().toDateString();

  try {
    const storedProgress = JSON.parse(localStorage.getItem("dailyProgress") || "null");
    if (storedProgress && Array.isArray(storedProgress.completedZekr)) {
      dailyProgress = storedProgress;
    }
  } catch (error) {
    console.warn("Unable to refresh profile progress", error);
  }

  if (dailyProgress.date !== today) {
    checkDailyProgress();
  }

  // Get or initialize today's progress
  if (!weeklyProgress[today]) {
    weeklyProgress[today] = 0;
  }

  // Calculate streak
  let streak = calculateStreak();

  // Get today's count
  let todayCount = dailyProgress.completedZekr
    ? dailyProgress.completedZekr.length
    : 0;
  weeklyProgress[today] = todayCount;
  localStorage.setItem("weeklyProgress", JSON.stringify(weeklyProgress));

  // Get weekly count
  let weekCount = calculateWeeklyCount();

  // Get total count
  let totalCount = dailyProgress.totalCompletions || 0;

  // Update the profile stats (numbers always shown, "٠" at zero)
  var bestStreak = calculateBestStreak();
  var streakWrap = document.getElementById("streakValueWrap");
  var streakBadgeEl = document.getElementById("streakBadge");
  var streakSubEl = document.getElementById("streakSub");
  if (streakWrap) {
    if (streak > 0) {
      streakWrap.classList.remove("is-zero");
      const streakUnit =
        window.TazkeerUtils && typeof window.TazkeerUtils.formatArabicUnitLabel === "function"
          ? window.TazkeerUtils.formatArabicUnitLabel(streak, "consecutiveDay")
          : "أيام متتالية";
      streakWrap.innerHTML =
        '<b id="streakCount">' + toArabicNumerals(streak) +
        '</b><span id="streakSuffix"> ' + streakUnit + "</span>";
    } else {
      streakWrap.classList.add("is-zero");
      streakWrap.innerHTML = "ابدأ سلسلتك اليوم";
    }
  }
  if (streakBadgeEl) streakBadgeEl.hidden = streak === 0;
  if (streakSubEl) {
    if (streak > 0) {
      const bestUnit =
        window.TazkeerUtils && typeof window.TazkeerUtils.formatArabicUnitLabel === "function"
          ? window.TazkeerUtils.formatArabicUnitLabel(bestStreak, "day")
          : "أيام";
      streakSubEl.innerHTML =
        "أطول سلسلة لك: <b>" + toArabicNumerals(bestStreak) + "</b><span> " + bestUnit + "</span>";
    } else {
      streakSubEl.textContent = "أنجز ذكراً واحداً لتبدأ";
    }
  }
  setPtStatValue(document.getElementById("todayCount"), todayCount);
  setPtStatValue(document.getElementById("weekCount"), weekCount);
  setPtStatValue(document.getElementById("totalCount"), totalCount);

  updateAzkarTodayRing();

  // Update summary cards (top KPIs)
  var summaryAzkarVal = document.getElementById("summaryAzkarVal");
  var summaryStreakVal = document.getElementById("summaryStreakVal");
  if (summaryAzkarVal)
    summaryAzkarVal.textContent = toArabicNumerals(todayCount);
  if (summaryStreakVal) summaryStreakVal.textContent = toArabicNumerals(streak);

  // Update azkar category bars
  updateAzkarCategoryBars();
}

// Writes a counter value, using a designed muted dash instead of the
// Arabic-Indic zero (which renders as a tiny dot at display sizes).
function setPtStatValue(el, value) {
  if (!el) return;
  var n = Number(value) || 0;
  el.textContent = toArabicNumerals(n);
  el.setAttribute("data-value", String(n));
}

// Longest run of consecutive days with at least one completed zekr.
function calculateBestStreak() {
  var days = Object.keys(weeklyProgress)
    .filter(function (key) {
      return (weeklyProgress[key] || 0) > 0;
    })
    .map(function (key) {
      return new Date(key).getTime();
    })
    .filter(function (time) {
      return !isNaN(time);
    })
    .sort(function (a, b) {
      return a - b;
    });

  if (!days.length) return 0;

  var best = 1;
  var run = 1;
  var dayMs = 24 * 60 * 60 * 1000;

  for (var i = 1; i < days.length; i++) {
    var prev = new Date(days[i - 1]);
    var cur = new Date(days[i]);
    // Compare mid-day so DST shifts never break the diff.
    prev.setHours(12, 0, 0, 0);
    cur.setHours(12, 0, 0, 0);
    var diff = Math.round((cur - prev) / dayMs);
    if (diff === 1) {
      run++;
    } else if (diff > 1) {
      run = 1;
    }
    if (run > best) best = run;
  }

  return best;
}

// Today's Azkar completion, by item and by fully-completed category.
function getAzkarTodayProgress() {
  var completed = (dailyProgress && dailyProgress.completedZekr) || [];
  var keys = Object.keys(adhkarData || {});
  var done = 0;
  var total = 0;
  var sectionsDone = 0;

  keys.forEach(function (key) {
    var list = (adhkarData[key] && adhkarData[key].adhkar) || [];
    if (!list.length) return;
    var sectionComplete = true;
    list.forEach(function (_, index) {
      total++;
      if (completed.indexOf(key + "_" + index) !== -1) {
        done++;
      } else {
        sectionComplete = false;
      }
    });
    if (sectionComplete) sectionsDone++;
  });

  return {
    done: done,
    total: total,
    sectionsDone: sectionsDone,
    sectionsTotal: keys.length,
  };
}

function updateAzkarTodayRing() {
  var ring = document.getElementById("azkarRing");
  var pctEl = document.getElementById("azkarRingPct");
  var subEl = document.getElementById("azkarSub");

  if (!ring && !pctEl && !subEl) return;

  var progress = getAzkarTodayProgress();
  var pct = progress.total
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

  if (ring) ring.style.setProperty("--p", String(pct));
  if (pctEl) {
    pctEl.textContent = toArabicNumerals(pct) + "٪";
  }
  if (subEl) {
    const zikrUnit =
      window.TazkeerUtils && typeof window.TazkeerUtils.formatArabicUnitLabel === "function"
        ? window.TazkeerUtils.formatArabicUnitLabel(progress.total, "zikr")
        : "ذكراً";
    subEl.textContent =
      progress.done > 0
        ? toArabicNumerals(progress.done) +
          " من " +
          toArabicNumerals(progress.total) +
          " " +
          zikrUnit
        : "لم تبدأ بعد";
    subEl.classList.toggle("is-zero", progress.done === 0);
  }
}

function updateAzkarCategoryBars() {
  var completed = dailyProgress.completedZekr || [];
  var morningTotal = adhkarData.morning ? adhkarData.morning.adhkar.length : 0;
  var eveningTotal = adhkarData.evening ? adhkarData.evening.adhkar.length : 0;
  // tasbeeh-like counts come from "general" category
  var tasbihTotal = adhkarData.general ? adhkarData.general.adhkar.length : 0;

  var morningDone = completed.filter(function (id) {
    return id.startsWith("morning_");
  }).length;
  var eveningDone = completed.filter(function (id) {
    return id.startsWith("evening_");
  }).length;
  var tasbihDone = completed.filter(function (id) {
    return id.startsWith("general_");
  }).length;

  var barMorning = document.getElementById("barMorning");
  var barEvening = document.getElementById("barEvening");
  var barTasbih = document.getElementById("barTasbih");
  var numMorning = document.getElementById("numMorning");
  var numEvening = document.getElementById("numEvening");
  var numTasbih = document.getElementById("numTasbih");

  if (barMorning)
    barMorning.style.width =
      (morningTotal ? (morningDone / morningTotal) * 100 : 0) + "%";
  if (barEvening)
    barEvening.style.width =
      (eveningTotal ? (eveningDone / eveningTotal) * 100 : 0) + "%";
  if (barTasbih)
    barTasbih.style.width =
      (tasbihTotal ? (tasbihDone / tasbihTotal) * 100 : 0) + "%";

  if (numMorning) numMorning.textContent = morningDone + "/" + morningTotal;
  if (numEvening) numEvening.textContent = eveningDone + "/" + eveningTotal;
  if (numTasbih) numTasbih.textContent = tasbihDone + "/" + tasbihTotal;
}

function calculateStreak() {
  let streak = 0;
  let currentDate = new Date();

  // Check consecutive days
  while (true) {
    const dateStr = currentDate.toDateString();
    const count = weeklyProgress[dateStr] || 0;

    if (count > 0) {
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

function calculateWeeklyCount() {
  let count = 0;
  const today = new Date();

  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toDateString();
    count += weeklyProgress[dateStr] || 0;
  }

  return count;
}

// First day of the displayed week (Saturday) at local midnight.
function getChartWeekStart() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  // getDay(): Sunday = 0 … Saturday = 6. Saturday is the week start.
  const offset = (start.getDay() + 1) % 7;
  start.setDate(start.getDate() - offset);
  return start;
}

// One renderer for both charts: today's week (Sat → Fri), future slots dashed,
// zero days empty (no stub bars) and the current day highlighted.
function renderWeeklyChart(containerId, source) {
  const chartContainer = document.getElementById(containerId);
  if (!chartContainer) return;

  const cols = chartContainer.querySelectorAll(".chart-bar-col");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekStart = getChartWeekStart();

  const dayValues = {};
  let maxVal = 0;

  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + i);
    const val = source[date.toDateString()] || 0;
    dayValues[date.getDay()] = val;
    if (val > maxVal) maxVal = val;
  }

  cols.forEach((col) => {
    const dayNum = parseInt(col.getAttribute("data-day"), 10);
    const dayIndex = (dayNum + 1) % 7; // Sat = 0, Sun = 1, …
    const date = new Date(weekStart);
    date.setDate(date.getDate() + dayIndex);

    const bar = col.querySelector(".chart-bar-fill");
    const valueDiv = col.querySelector(".chart-bar-value");
    const val = dayValues[dayNum] || 0;

    const isToday = date.getTime() === today.getTime();
    const isFuture = date.getTime() > today.getTime();
    const isZero = !isFuture && val === 0;

    col.classList.toggle("today", isToday);
    col.classList.toggle("is-future", isFuture);
    col.classList.toggle("is-zero", isZero);

    if (isFuture || isZero) {
      if (bar) bar.style.height = "0%";
      if (valueDiv) valueDiv.textContent = "";
      return;
    }

    const pct = Math.max(6, Math.round((val / maxVal) * 100));
    if (bar) bar.style.height = pct + "%";
    if (valueDiv) valueDiv.textContent = toArabicNumerals(val);
  });
}

function updateWeeklyChart() {
  renderWeeklyChart("azkarChart", weeklyProgress);
}


// Quran weekly reading progress
let quranWeeklyProgress =
  JSON.parse(localStorage.getItem("quranWeeklyProgress")) || {};

function trackQuranDailyReading() {
  const today = new Date().toDateString();
  if (!quranWeeklyProgress[today]) {
    quranWeeklyProgress[today] = 0;
  }
  quranWeeklyProgress[today]++;
  localStorage.setItem(
    "quranWeeklyProgress",
    JSON.stringify(quranWeeklyProgress),
  );
}

function updateQuranWeeklyChart() {
  renderWeeklyChart("quranChart", quranWeeklyProgress);
}

function switchChartTab(chartType) {
  // Toggle tabs
  document.querySelectorAll(".chart-tab").forEach(function (tab) {
    tab.classList.toggle(
      "active",
      tab.getAttribute("data-chart") === chartType,
    );
  });

  // Toggle chart panels
  var azkarChart = document.getElementById("azkarChart");
  var quranChart = document.getElementById("quranChart");

  if (chartType === "azkar") {
    if (azkarChart) azkarChart.classList.remove("hidden");
    if (quranChart) quranChart.classList.add("hidden");
  } else {
    if (azkarChart) azkarChart.classList.add("hidden");
    if (quranChart) quranChart.classList.remove("hidden");
    updateQuranWeeklyChart();
  }
}

