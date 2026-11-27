/* ── Unified Arabic Numerals Helper (single source via TazkeerUtils) ── */
function toArabicNumerals(str) {
  if (window.TazkeerUtils && typeof window.TazkeerUtils.toArabicDigits === "function") {
    return window.TazkeerUtils.toArabicDigits(str);
  }
  const digits = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  return String(str).replace(/[0-9]/g, (d) => digits[+d]);
}
window.toArabicNumerals = toArabicNumerals;
window.toArabicDigits = toArabicNumerals;

// Global variables
let currentCategory = null;
let isHomePage = true;
let currentCount = 0;
let totalCount = 0;
let currentZikrText = "";
let currentZikrIndex = null;

// Enhanced global variables for UX improvements (SafeStorage-protected boot reads)
function _safeReadJSON(key, fallback) {
  if (window.SafeStorage && typeof window.SafeStorage.getJSON === "function") {
    return window.SafeStorage.getJSON(key, fallback);
  }
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

function _safeReadStr(key, fallback) {
  if (window.SafeStorage && typeof window.SafeStorage.get === "function") {
    return window.SafeStorage.get(key, fallback);
  }
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? raw : fallback;
  } catch (_) {
    return fallback;
  }
}

let favorites = _safeReadJSON("zekrFavorites", []) || [];
let userPreferences = _safeReadJSON("userPreferences", null) || {
  fontSize: "medium",
  autoPlay: false,
  showFadl: true,
  soundEnabled: true,
  lastCategory: "all",
};
let dailyProgress = _safeReadJSON("dailyProgress", null) || {
  date: new Date().toDateString(),
  completedZekr: [],
  streak: parseInt(_safeReadStr("dailyStreak", "0"), 10) || 0,
  totalCompletions: parseInt(_safeReadStr("totalCompletions", "0"), 10) || 0,
};

// Check and update daily progress
function checkDailyProgress() {
  const today = new Date().toDateString();
  if (dailyProgress.date !== today) {
    // New day - advance streak only if yesterday had completions, otherwise reset streak
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (
      dailyProgress.date === yesterday.toDateString() &&
      Array.isArray(dailyProgress.completedZekr) &&
      dailyProgress.completedZekr.length > 0
    ) {
      dailyProgress.streak = (Number(dailyProgress.streak) || 0) + 1;
    } else {
      dailyProgress.streak = 0;
    }

    dailyProgress.date = today;
    dailyProgress.completedZekr = [];
    saveDailyProgress();

    // Reset all azkar counts and swiper positions so each category starts fresh from the first zekr
    Object.keys(adhkarData).forEach((cat) => {
      adhkarData[cat].adhkar.forEach((z) => {
        z.currentCount = 0;
      });
      if (window.SafeStorage) {
        window.SafeStorage.remove("swiperPos_" + cat);
      } else {
        localStorage.removeItem("swiperPos_" + cat);
      }
    });
    saveProgress();
  }
  updateProgressStats();
}

function saveDailyProgress() {
  if (window.SafeStorage) {
    window.SafeStorage.setJSON("dailyProgress", dailyProgress);
    window.SafeStorage.set("dailyStreak", String(dailyProgress.streak || 0));
    window.SafeStorage.set("totalCompletions", String(dailyProgress.totalCompletions || 0));
  } else {
    localStorage.setItem("dailyProgress", JSON.stringify(dailyProgress));
    localStorage.setItem("dailyStreak", dailyProgress.streak.toString());
    localStorage.setItem(
      "totalCompletions",
      dailyProgress.totalCompletions.toString(),
    );
  }
}

function getWeeklyCompletions() {
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // For now, return a simple calculation based on daily progress
  // This can be enhanced later with more detailed tracking
  return Math.min(
    dailyProgress.completedZekr.length * 7,
    dailyProgress.totalCompletions,
  );
}

function updateProgressStats() {
  const totalZekr = Object.values(adhkarData).reduce(
    (sum, category) => sum + category.adhkar.length,
    0,
  );
  const completedToday = dailyProgress.completedZekr.length;
  const completionRate =
    totalZekr > 0 ? Math.round((completedToday / totalZekr) * 100) : 0;
  const favoritesCount = favorites.length;

  // Update stats in the DOM if elements exist (matching HTML IDs)
  const dailyStreakEl = document.getElementById("dailyStreak");
  const totalCompletionsEl = document.getElementById("totalCompletions");
  const todayCompletionsEl = document.getElementById("todayCompletions");
  const weekCompletionsEl = document.getElementById("weekCompletions");

  if (dailyStreakEl) {
    dailyStreakEl.textContent = dailyProgress.streak || 0;
  }
  if (totalCompletionsEl) {
    totalCompletionsEl.textContent = dailyProgress.totalCompletions;
  }
  if (todayCompletionsEl) {
    todayCompletionsEl.textContent = completedToday;
  }
  if (weekCompletionsEl) {
    weekCompletionsEl.textContent = getWeeklyCompletions();
  }
}

// Notification system - centralized single toast manager
let notificationTimer = null;

function showNotification(message, type = "success", duration = 3000) {
  const notification = document.getElementById("notification") || document.querySelector(".notification");
  if (!notification) return;

  const icon = notification.querySelector("i");
  const textSpan = document.getElementById("notificationText") || notification.querySelector("span");

  // Update icon based on type
  if (icon) {
    if (type === "success") icon.className = "fas fa-check-circle";
    else if (type === "warning") icon.className = "fas fa-exclamation-triangle";
    else if (type === "error") icon.className = "fas fa-circle-xmark";
    else icon.className = "fas fa-info-circle";
  }

  // Update message
  if (textSpan) textSpan.textContent = message;

  // Update colors
  if (type === "success") {
    notification.style.background = "linear-gradient(135deg, #1a8a5c, #2d9d6e)";
  } else if (type === "info") {
    notification.style.background = "linear-gradient(135deg, #2b6cb0, #3182ce)";
  } else if (type === "warning") {
    notification.style.background = "linear-gradient(135deg, #d4a847, #b8860b)";
  } else if (type === "error") {
    notification.style.background = "linear-gradient(135deg, #e53e3e, #c53030)";
  }

  notification.classList.add("show");

  if (notificationTimer) {
    clearTimeout(notificationTimer);
  }

  notificationTimer = setTimeout(() => {
    notification.classList.remove("show");
  }, duration || 3000);
}

// Celebration modal
function showCelebration(title, message, isComplete = false) {
  const celebration = document.querySelector(".celebration");
  if (!celebration) return;

  const icon = celebration.querySelector(".celebration-icon");
  const titleEl = celebration.querySelector("h3");
  const messageEl = celebration.querySelector("p");

  if (titleEl) titleEl.textContent = title;
  if (messageEl) messageEl.textContent = message;

  if (icon) {
    icon.innerHTML = isComplete ? "🎉" : "⭐";
  }

  if (isComplete) {
    celebration.style.background = "linear-gradient(135deg, #b8860b, #48bb78)";
  } else {
    celebration.style.background = "linear-gradient(135deg, #1a8a5c, #d4a847)";
  }

  celebration.classList.add("show");
}

function hideCelebration() {
  const celebration = document.querySelector(".celebration");
  if (celebration) celebration.classList.remove("show");
}

// Font size controls
function setFontSize(size, showNotif = true) {
  const root = document.documentElement;
  const buttons = document.querySelectorAll(".font-btn");

  // Remove active class from all buttons
  buttons.forEach((btn) => btn.classList.remove("active"));

  // Add active class to selected button
  const activeBtn = document.querySelector(
    `[onclick*="setFontSize('${size}')"]`,
  );
  if (activeBtn) activeBtn.classList.add("active");

  // Set CSS variable
  switch (size) {
    case "small":
      root.style.setProperty("--adhkar-font-size", "1.1rem");
      break;
    case "medium":
      root.style.setProperty("--adhkar-font-size", "1.3rem");
      break;
    case "large":
      root.style.setProperty("--adhkar-font-size", "1.6rem");
      break;
  }

  // Save preference
  userPreferences.fontSize = size;
  localStorage.setItem("userPreferences", JSON.stringify(userPreferences));

  // Only show notification if explicitly requested (user click)
  if (showNotif) {
    const sizeNames = { small: "صغير", medium: "متوسط", large: "كبير" };
    showNotification(`تم تغيير حجم الخط إلى ${sizeNames[size]}`);
  }
}

// Quick access functions
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
  // showNotification("تم الانتقال إلى أعلى الصفحة");
}

function showFavorites() {
  if (favorites.length === 0) {
    showNotification("لم تضف أي أذكار إلى المفضلة بعد", "info");
    return;
  }

  // Create favorites display
  const favoriteZekr = [];
  Object.keys(adhkarData).forEach((categoryKey) => {
    const category = adhkarData[categoryKey];
    category.adhkar.forEach((zekr, index) => {
      const zekrId = `${categoryKey}_${index}`;
      if (favorites.includes(zekrId)) {
        favoriteZekr.push({
          category: category.title,
          zekr: zekr,
          categoryKey: categoryKey,
          index: index,
        });
      }
    });
  });

  showNotification(`عرض ${favorites.length} من الأذكار المفضلة`);
}

function showFavoritesPage() {
  if (favorites.length === 0) {
    showNotification("لم تضف أي أذكار إلى المفضلة بعد", "info");
    return;
  }

  // Navigate to favorites section
  const navBtns = document.querySelectorAll(".nav-btn");
  navBtns.forEach((btn) => {
    if (btn.dataset.category === "favorites") {
      btn.click();
    }
  });

  showNotification(`عرض ${favorites.length} من الأذكار المفضلة`);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateFavoritesButton() {
  const favoritesBtn = document.getElementById("favoritesBtn");
  if (favoritesBtn) {
    if (favorites.length > 0) {
      favoritesBtn.classList.add("has-favorites");
    } else {
      favoritesBtn.classList.remove("has-favorites");
    }
  }
}

function toggleStats() {
  const stats = document.querySelector(".progress-stats");
  if (stats) {
    const isHidden = stats.style.display === "none";
    stats.style.display = isHidden ? "block" : "none";
    showNotification(isHidden ? "تم عرض الإحصائيات" : "تم إخفاء الإحصائيات");
  }
}

// Favorites system
function toggleFavorite(categoryKey, zekrIndex, event) {
  if (event) event.stopPropagation();

  const zekrId = `${categoryKey}_${zekrIndex}`;
  const index = favorites.indexOf(zekrId);
  const button = event ? event.target.closest(".favorite-btn") : null;

  if (index > -1) {
    favorites.splice(index, 1);
    if (button) button.classList.remove("active");
    showNotification("تم إزالة الذكر من المفضلة");
  } else {
    favorites.push(zekrId);
    if (button) button.classList.add("active");
    showNotification("تم إضافة الذكر إلى المفضلة");
  }

  localStorage.setItem("zekrFavorites", JSON.stringify(favorites));
  updateProgressStats();
  updateFavoritesButton();
}

function getCategoryDisplayName(category) {
  if (!category || !adhkarData[category]) return "غير محدد";
  return adhkarData[category].title;
}

// Enhanced completion tracking
function markZekrCompleted(categoryKey, zekrIndex) {
  const zekrId = `${categoryKey}_${zekrIndex}`;

  if (!dailyProgress.completedZekr.includes(zekrId)) {
    dailyProgress.completedZekr.push(zekrId);
    dailyProgress.totalCompletions++;
    saveDailyProgress();
    updateProgressStats();

    // Check for completion milestones
    const completed = dailyProgress.completedZekr.length;
    const total = Object.values(adhkarData).reduce(
      (sum, category) => sum + category.adhkar.length,
      0,
    );

    if (completed === total) {
      showCelebration(
        "مبروك! 🎉",
        "لقد أكملت جميع الأذكار اليوم! جزاك الله خيراً",
        true,
      );
    } else if (completed === Math.floor(total / 2)) {
      showCelebration(
        "إنجاز رائع! ⭐",
        "لقد أكملت نصف الأذكار اليوم، استمر بارك الله فيك",
      );
    } else if (completed % 5 === 0 && completed > 0) {
      showCelebration(
        "أحسنت! 🌟",
        `أكملت ${completed} من الأذكار، استمر في ذكر الله`,
      );
    }
  }
}

// DOM Elements
const homePage = document.getElementById("tab-home");
const azkarListView = document.getElementById("azkarListView");
const categoryPage = document.getElementById("categoryPage");
const categoriesContainer = document.getElementById("categoriesContainer");
const categoryTitle = document.getElementById("categoryTitle");
const categoryDescription = document.getElementById("categoryDescription");
const adhkarContainer = document.getElementById("adhkarContainer");
const searchInput = document.getElementById("searchInput");
const modal = document.getElementById("counterModal");
const closeModal = document.querySelector("#counterModal .close");
const countNumber = document.getElementById("countNumber");
const totalCountSpan = document.getElementById("totalCount");
const countBtn = document.getElementById("countBtn");
const resetBtn = document.getElementById("resetBtn");
const progressFill = document.getElementById("progressFill");
const modalTitle = document.getElementById("modalTitle");
const fadlText = document.getElementById("fadlText");
const homeBtn = document.getElementById("homeBtn");
const backBtn = document.getElementById("backBtn");
const resetAllBtn = document.getElementById("resetAllBtn");

/* ─── Tab Switching System ─── */
function switchTab(tabId) {
  if (window.AppRouter) {
    window.AppRouter.switchTab(tabId, true);
    return;
  }
  // Fallback if AppRouter not yet ready
  document.querySelectorAll(".tab-content").forEach(function (section) {
    section.classList.remove("active-tab");
  });
  var target = document.getElementById(tabId);
  if (target) target.classList.add("active-tab");
  document.querySelectorAll(".bottom-nav-item").forEach(function (btn) {
    btn.classList.toggle("active", btn.getAttribute("data-tab") === tabId);
  });
  var header = document.querySelector(".header");
  if (header) {
    header.style.display = tabId === "tab-home" ? "" : "none";
  }
  if (window.SafeStorage) {
    window.SafeStorage.set("activeTab", tabId);
  } else {
    try { localStorage.setItem("activeTab", tabId); } catch (e) {}
  }
}

// Theme management functions
function loadTheme() {
  const savedTheme = localStorage.getItem("adhkar-theme");

  if (savedTheme === "light") {
    document.body.classList.remove("dark-mode");
    document.body.classList.add("light-mode");
  } else {
    document.body.classList.add("dark-mode");
    document.body.classList.remove("light-mode");
  }

  updateThemeSwitcherUI();
}

function setAppTheme(mode) {
  document.body.classList.add("theme-transition");
  if (mode === "dark") {
    document.body.classList.add("dark-mode");
    document.body.classList.remove("light-mode");
    localStorage.setItem("adhkar-theme", "dark");
  } else {
    document.body.classList.remove("dark-mode");
    document.body.classList.add("light-mode");
    localStorage.setItem("adhkar-theme", "light");
  }

  updateThemeSwitcherUI();

  if (window.AdhanNative && typeof window.AdhanNative.updateStatusBar === "function") {
    try { window.AdhanNative.updateStatusBar(); } catch (e) {}
  }

  setTimeout(() => {
    document.body.classList.remove("theme-transition");
  }, 300);
}

function toggleTheme() {
  const isDark = document.body.classList.contains("dark-mode");
  setAppTheme(isDark ? "light" : "dark");
}

function updateThemeSwitcherUI() {
  const isDark = document.body.classList.contains("dark-mode");
  const darkBtn = document.getElementById("themeDarkBtn");
  const lightBtn = document.getElementById("themeLightBtn");
  if (darkBtn) darkBtn.classList.toggle("active", isDark);
  if (lightBtn) lightBtn.classList.toggle("active", !isDark);
}

// Make functions globally accessible
window.loadTheme = loadTheme;
window.setAppTheme = setAppTheme;
window.toggleTheme = toggleTheme;
window.updateThemeSwitcherUI = updateThemeSwitcherUI;

// Initialize the app
document.addEventListener("DOMContentLoaded", function () {
  loadTheme(); // Load saved theme preference
  loadProgress();
  // Initialise tab system
  var savedTab = localStorage.getItem("activeTab") || "tab-home";
  switchTab(savedTab);
  setupEventListeners();

  // Show install instructions on first visit (only in web browser mode)
  checkAndShowInstallInstructions();

  // Dismiss native splash screen immediately once initial UI is ready
  // (avoids waiting for launchShowDuration timeout & unblocks WebView first draw)
  setTimeout(function () {
    try {
      var splash =
        window.Capacitor &&
        window.Capacitor.Plugins &&
        window.Capacitor.Plugins.SplashScreen;
      if (splash && typeof splash.hide === "function") {
        splash.hide();
      }
    } catch (_) {}
  }, 0);
});

function checkAndShowInstallInstructions() {
  if (isStandaloneMode()) return;

  const dismissed = localStorage.getItem("installInstructionsDismissed");
  const dismissedDate = localStorage.getItem(
    "installInstructionsDismissedDate",
  );
  const remindLater = localStorage.getItem("installInstructionsRemindLater");

  // If user clicked "understood", don't show again for 30 days
  if (dismissed && dismissedDate) {
    const daysSinceDismissed =
      (Date.now() - parseInt(dismissedDate)) / (1000 * 60 * 60 * 24);
    if (daysSinceDismissed < 30) {
      return; // Don't show
    }
  }

  // If user clicked "remind later", don't show for 3 days
  if (remindLater) {
    const daysSinceRemind =
      (Date.now() - parseInt(remindLater)) / (1000 * 60 * 60 * 24);
    if (daysSinceRemind < 3) {
      return; // Don't show
    }
  }

  // Queue install instructions so they never overlap first-run settings or location modal
  if (window.TazkeerModalQueue) {
    window.TazkeerModalQueue.enqueue({
      id: "install-instructions",
      delayMs: 1200,
      shouldShow: () => !isStandaloneMode(),
      show: () => {
        showManualInstallInstructions();
      },
    });
  } else {
    setTimeout(() => {
      showManualInstallInstructions();
    }, 1200);
  }
}

function showManualInstallInstructions() {
  if (isStandaloneMode()) return;
  if (document.getElementById("installInstructionsModal")) return;

  const instructionsModal = document.createElement("div");
  instructionsModal.className = "modal is-open";
  instructionsModal.id = "installInstructionsModal";

  const userAgent = navigator.userAgent.toLowerCase();
  let instructions = "";
  let deviceIcon = "";
  let deviceName = "";

  // Better device detection
  const isIOS =
    /iphone|ipad|ipod/.test(userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /android/.test(userAgent);

  if (isIOS) {
    deviceName = "iOS";
    instructions = `
      <div class="install-steps active">
        <div class="install-step">
          <div class="step-icon"><i class="fas fa-arrow-up-from-bracket" style="color: #007AFF;"></i></div>
          <div class="step-content">
            <h5>الخطوة ١</h5>
            <p>اضغط على زر <strong>المشاركة</strong> <i class="fas fa-share" style="color: #007AFF;"></i> ثم اختر <strong>إضافة إلى الشاشة الرئيسية</strong>.</p>
          </div>
        </div>
      </div>
      <div class="install-note">
        <i class="fas fa-info-circle"></i>
        <span>لأفضل تجربة، استخدم متصفح <strong>Safari</strong></span>
      </div>
    `;
  } else if (isAndroid) {
    deviceName = "Android";
    instructions = `
      <div class="install-steps active">
        <div class="install-step">
          <div class="step-icon"><i class="fas fa-download" style="color: #4CAF50;"></i></div>
          <div class="step-content">
            <h5>الخطوة ١</h5>
            <p>افتح قائمة المتصفح (<strong>⋮</strong>) واختر <strong>تثبيت التطبيق</strong> أو <strong>إضافة للشاشة الرئيسية</strong>.</p>
          </div>
        </div>
        <div class="install-step">
          <div class="step-icon">✅</div>
          <div class="step-content">
            <h5>الخطوة ٢</h5>
            <p>أكّد التثبيت للتمتع بالتطبيق دون اتصال بالإنترنت.</p>
          </div>
        </div>
      </div>
    `;
  } else {
    deviceIcon = "💻";
    deviceName = "الحاسوب";
    instructions = `
      <div class="install-steps active">
        <div class="install-step">
          <div class="step-icon"><i class="fas fa-download" style="color: #4CAF50;"></i></div>
          <div class="step-content">
            <h5>الخطوة ١</h5>
            <p>اضغط على أيقونة <strong>التثبيت</strong> في شريط العنوان أو قائمة المتصفح.</p>
          </div>
        </div>
        <div class="install-step">
          <div class="step-icon">✅</div>
          <div class="step-content">
            <h5>الخطوة ٢</h5>
            <p>أكّد التثبيت لفتح التطبيق بسهولة والوصول إليه دون إنترنت.</p>
          </div>
        </div>
      </div>
    `;
  }

  instructionsModal.innerHTML = `
    <div class="modal-content install-modal-content">
      <button type="button" class="close" onclick="dismissInstallModal(true)" aria-label="إغلاق">&times;</button>
      <div class="install-content">
        <div class="install-header">
          <h3>قم بتحميل التطبيق الآن</h3>
          <p class="install-subtitle">للوصول السريع والسهل لأذكارك اليومية بدون إنترنت</p>
        </div>
        
        <div class="device-badge">${deviceName}</div>
        
        ${instructions}
        
        <div class="install-buttons">
          <button onclick="dismissInstallModal(true)" class="install-btn primary">
            <i class="fas fa-check"></i> فهمت شكراً
          </button>
          <button onclick="dismissInstallModal(false)" class="install-btn secondary">
            <i class="fas fa-clock"></i> ذكرني لاحقاً
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(instructionsModal);
}

function dismissInstallModal(understood) {
  const modal = document.getElementById("installInstructionsModal");
  if (modal) {
    modal.remove();
  }

  // If user clicked "understood", don't show again for 30 days
  if (understood) {
    localStorage.setItem("installInstructionsDismissed", "true");
    localStorage.setItem("installInstructionsDismissedDate", Date.now());
  }
  // If "remind me later", don't show for 3 days
  else {
    localStorage.setItem("installInstructionsRemindLater", Date.now());
  }

  if (window.TazkeerModalQueue) {
    window.TazkeerModalQueue.notifyClosed("install-instructions");
  }
}

// Setup event listeners
function setupEventListeners() {
  // Modal events (safe guards for removed legacy modal)
  if (closeModal) closeModal.addEventListener("click", closeCounterModal);
  window.addEventListener("click", function (e) {
    if (modal && e.target === modal) {
      closeCounterModal();
    }
    const qModal = document.getElementById("qiblaModal");
    if (qModal && e.target === qModal) {
      closeQiblaModal();
    }
  });

  if (countBtn) countBtn.addEventListener("click", incrementCounter);
  if (resetBtn) resetBtn.addEventListener("click", resetCounter);

  // Keyboard shortcuts
  document.addEventListener("keydown", function (e) {
    if (modal && modal.style.display === "block") {
      if (e.key === "Escape") {
        closeCounterModal();
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        incrementCounter();
      } else if (e.key === "r" || e.key === "R") {
        resetCounter();
      }
    }
  });
}


// Hide suggestions when clicking outside
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-container")) {
    const suggestions = document.querySelector(".search-suggestions");
    if (suggestions) suggestions.style.display = "none";
  }
});

// Enhanced initialization
function initializeEnhancedFeatures() {
  // Load user preferences without showing notification
  if (userPreferences.fontSize) {
    setFontSize(userPreferences.fontSize, false);
  }

  // Check daily progress
  checkDailyProgress();

  // Update stats
  updateProgressStats();

  // Remove search functionality since search is removed

  // Add quick access button listeners
  const scrollTopBtn = document.getElementById("scrollTopBtn");
  const quickHomeBtn = document.getElementById("quickHomeBtn");
  const favoritesBtn = document.getElementById("favoritesBtn");
  const resetAllBtn = document.getElementById("resetAllBtn");
  const settingsHeaderBtn = document.getElementById("settingsHeaderBtn") || document.getElementById("themeToggle");
  const homeBtn = document.getElementById("homeBtn");
  const backBtn = document.getElementById("backBtn");
  const installBtn = document.getElementById("installBtn");

  if (scrollTopBtn) scrollTopBtn.addEventListener("click", scrollToTop);
  if (quickHomeBtn)
    quickHomeBtn.addEventListener("click", function () {
      switchTab("tab-home");
    });
  if (favoritesBtn) {
    favoritesBtn.addEventListener("click", showFavoritesPage);
    updateFavoritesButton();
  }
  if (resetAllBtn) resetAllBtn.addEventListener("click", resetAllAdhkar);
  if (settingsHeaderBtn) {
    settingsHeaderBtn.addEventListener("click", function () {
      if (typeof openAdhanModal === "function") {
        openAdhanModal();
      } else {
        toggleTheme();
      }
    });
  }
  if (homeBtn)
    homeBtn.addEventListener("click", function () {
      switchTab("tab-home");
    });
  if (backBtn)
    backBtn.addEventListener("click", function () {
      showHomePage();
      switchTab("tab-azkar");
    });
  if (installBtn) installBtn.addEventListener("click", showInstallModal);

  // Show/hide quick access buttons at end of page (only attach if elements exist; passive + rAF)
  const quickAccessFloatEl = document.querySelector(".quick-access");
  const quickHomeFloatEl = document.querySelector(".quick-home");
  if (quickAccessFloatEl || quickHomeFloatEl) {
    let quickScrollRaf = 0;
    window.addEventListener(
      "scroll",
      () => {
        if (quickScrollRaf) return;
        quickScrollRaf = requestAnimationFrame(() => {
          quickScrollRaf = 0;
          const scrollPosition = window.pageYOffset;
          const windowHeight = window.innerHeight;
          const documentHeight = document.documentElement.scrollHeight;
          const scrolledPercentage =
            ((scrollPosition + windowHeight) / documentHeight) * 100;
          const displayVal = scrolledPercentage >= 90 ? "flex" : "none";
          if (quickAccessFloatEl && quickAccessFloatEl.style.display !== displayVal) {
            quickAccessFloatEl.style.display = displayVal;
          }
          if (quickHomeFloatEl && quickHomeFloatEl.style.display !== displayVal) {
            quickHomeFloatEl.style.display = displayVal;
          }
        });
      },
      { passive: true },
    );
  }
  // Initialize enhanced theme
  initializeEnhancedTheme();

  // Show install prompt on first visit
  showInstallPrompt();
}

// Enhanced theme initialization
function initializeEnhancedTheme() {
  // Add transition class after theme is set
  setTimeout(() => {
    document.body.classList.add("theme-transition");
  }, 100);
}


let deferredInstallPrompt = null;

function isStandaloneMode() {
  const isCapacitor = Boolean(
    (typeof window !== "undefined" &&
      window.Capacitor &&
      typeof window.Capacitor.isNativePlatform === "function" &&
      window.Capacitor.isNativePlatform()) ||
      (typeof document !== "undefined" &&
        document.body &&
        document.body.classList.contains("is-native-app"))
  );
  const isPwaDisplay =
    typeof window !== "undefined" &&
    ((typeof window.matchMedia === "function" &&
      (window.matchMedia("(display-mode: standalone)").matches ||
        window.matchMedia("(display-mode: fullscreen)").matches ||
        window.matchMedia("(display-mode: minimal-ui)").matches)) ||
      window.navigator.standalone === true);
  const isTrustedWebActivity = Boolean(
    typeof document !== "undefined" &&
      document.referrer &&
      document.referrer.includes("android-app://")
  );
  let wasInstalledFlag = false;
  try {
    wasInstalledFlag =
      (window.SafeStorage
        ? window.SafeStorage.get("tazkeer_app_installed")
        : localStorage.getItem("tazkeer_app_installed")) === "1";
  } catch (_) {}

  return isCapacitor || isPwaDisplay || isTrustedWebActivity || wasInstalledFlag;
}

function isIOSDevice() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function updateInstallButtonVisibility() {
  const installed = isStandaloneMode();
  const installBtn = document.getElementById("installBtn");
  const profileInstallRow = document.getElementById("profileInstallAppRow");
  const profileInstallDivider = document.getElementById("profileInstallAppDivider");

  if (profileInstallRow) {
    profileInstallRow.classList.toggle("hidden", installed);
    profileInstallRow.style.display = installed ? "none" : "";
  }
  if (profileInstallDivider) {
    profileInstallDivider.classList.toggle("hidden", installed);
    profileInstallDivider.style.display = installed ? "none" : "";
  }

  if (!installBtn) return;

  if (installed) {
    installBtn.classList.add("hidden");
    return;
  }

  if (deferredInstallPrompt || isIOSDevice()) {
    installBtn.classList.remove("hidden");
  } else {
    installBtn.classList.add("hidden");
  }
}

function initializeInstallPrompt() {
  updateInstallButtonVisibility();
}

function showInstallPrompt() {
  if (typeof isStandaloneMode === "function" && isStandaloneMode()) return;
  const hasSeen = localStorage.getItem("hasSeenInstallPrompt");
  if (!hasSeen && deferredInstallPrompt && typeof showInstallModal === "function") {
    localStorage.setItem("hasSeenInstallPrompt", "true");
    showInstallModal();
  }
}

async function showInstallModal() {
  if (isStandaloneMode()) {
    showNotification("التطبيق مثبت بالفعل على جهازك");
    updateInstallButtonVisibility();
    return;
  }

  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const choiceResult = await deferredInstallPrompt.userChoice;

    if (choiceResult.outcome === "accepted") {
      try {
        if (window.SafeStorage) {
          window.SafeStorage.set("tazkeer_app_installed", "1");
        } else {
          localStorage.setItem("tazkeer_app_installed", "1");
        }
      } catch (_) {}
      showNotification("تم بدء تثبيت التطبيق");
    }

    deferredInstallPrompt = null;
    updateInstallButtonVisibility();
    return;
  }

  showManualInstallInstructions();
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  updateInstallButtonVisibility();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  try {
    if (window.SafeStorage) {
      window.SafeStorage.set("hasSeenInstallPrompt", "true");
      window.SafeStorage.set("tazkeer_app_installed", "1");
    } else {
      localStorage.setItem("hasSeenInstallPrompt", "true");
      localStorage.setItem("tazkeer_app_installed", "1");
    }
  } catch (_) {}
  showNotification("تم تثبيت التطبيق بنجاح");
  updateInstallButtonVisibility();
});

document.addEventListener("DOMContentLoaded", () => {
  updateInstallButtonVisibility();
});

// Enhanced UX Features
let isOnline = navigator.onLine;
let keyboardShortcutsVisible = false;

// Initialize enhanced UX features (mobile-aware & non-blocking)
function initializeEnhancedUX() {
  const isTouchDevice =
    isCapacitorNative ||
    (window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  if (!isTouchDevice) {
    setupKeyboardShortcuts();
  }
  setupSmoothAnimations();
  setupPerformanceOptimizations();
}

// Keyboard Shortcuts (desktop web only — skipped on Android/touch devices)
function setupKeyboardShortcuts() {
  const shortcutsDiv = document.createElement("div");
  shortcutsDiv.className = "keyboard-shortcuts";
  shortcutsDiv.innerHTML = `
    <h4>اختصارات لوحة المفاتيح</h4>
    <div class="shortcut"><span>الرئيسية</span><span class="key">H</span></div>
    <div class="shortcut"><span>الوضع المظلم</span><span class="key">D</span></div>
    <div class="shortcut"><span>تكبير الخط</span><span class="key">+</span></div>
    <div class="shortcut"><span>تصغير الخط</span><span class="key">-</span></div>
    <div class="shortcut"><span>الأعلى</span><span class="key">↑</span></div>
    <div class="shortcut"><span>الأسفل</span><span class="key">↓</span></div>
  `;
  shortcutsDiv.style.display = "none";
  document.body.appendChild(shortcutsDiv);

  document.addEventListener("keydown", (e) => {
    // Toggle shortcuts visibility with ?
    if (e.key === "?") {
      keyboardShortcutsVisible = !keyboardShortcutsVisible;
      shortcutsDiv.style.display = keyboardShortcutsVisible ? "block" : "none";
      return;
    }

    // Hide shortcuts on any other key
    if (keyboardShortcutsVisible && e.key !== "?") {
      keyboardShortcutsVisible = false;
      shortcutsDiv.style.display = "none";
    }

    // Navigation shortcuts
    if (!e.ctrlKey && !e.altKey && !e.metaKey) {
      switch (e.key.toLowerCase()) {
        case "h":
          e.preventDefault();
          showHomePage();
          break;
        case "d":
          e.preventDefault();
          toggleTheme();
          break;
        case "+":
        case "=":
          e.preventDefault();
          changeFontSize("increase");
          break;
        case "-":
          e.preventDefault();
          changeFontSize("decrease");
          break;
        case "arrowup":
          e.preventDefault();
          scrollToTop();
          break;
        case "arrowdown":
          e.preventDefault();
          scrollToBottom();
          break;
      }
    }
  });
}

// Smooth Animations (unobserves revealed elements to avoid permanent IntersectionObserver overhead)
function setupSmoothAnimations() {
  const targets = document.querySelectorAll(".category-card, .adhkar-card, .stat-item");
  if (!targets.length || typeof IntersectionObserver === "undefined") return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.style.animationDelay = "0s";
          entry.target.style.animationPlayState = "running";
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: "0px 0px -50px 0px" },
  );

  targets.forEach((el, index) => {
    el.style.animation = "slideInUp 0.6s ease forwards";
    el.style.animationDelay = `${Math.min(index, 6) * 0.06}s`;
    el.style.animationPlayState = "paused";
    observer.observe(el);
  });
}

// Performance Optimizations
function setupPerformanceOptimizations() {
  // Debounce search input
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    let searchTimeout;
    const originalOnInput = searchInput.oninput;
    searchInput.oninput = (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        if (originalOnInput) originalOnInput.call(searchInput, e);
      }, 300);
    };
  }

  // Lazy load images if any
  const images = document.querySelectorAll("img[data-src]");
  if (images.length > 0) {
    const imageObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          img.classList.remove("lazy");
          imageObserver.unobserve(img);
        }
      });
    });

    images.forEach((img) => imageObserver.observe(img));
  }
}

// Enhanced Notification System - Unified delegate to centralized showNotification
function showEnhancedNotification(message, type = "success", duration = 3000) {
  showNotification(message, type, duration);
}

function getNotificationIcon(type) {
  const icons = {
    success: "fa-check-circle",
    error: "fa-exclamation-circle",
    warning: "fa-exclamation-triangle",
    info: "fa-info-circle",
  };
  return icons[type] || icons.info;
}

function getNotificationColor(type) {
  const colors = {
    success: "#b8860b",
    error: "#e53e3e",
    warning: "#d69e2e",
    info: "#1a8a5c",
  };
  return colors[type] || colors.info;
}

// Enhanced Loading States
function showLoadingState(element, text = "جارٍ التحميل...") {
  if (typeof element === "string") {
    element = document.querySelector(element);
  }

  if (!element) return;

  element.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; gap: 10px; padding: 20px;">
      <div class="loading-spinner"></div>
      <span>${text}</span>
    </div>
  `;
  element.style.opacity = "0.7";
}

function hideLoadingState(element) {
  if (typeof element === "string") {
    element = document.querySelector(element);
  }

  if (!element) return;

  element.style.opacity = "1";
}

// Skeleton Loading
function showSkeletonLoading(container, count = 3) {
  if (typeof container === "string") {
    container = document.querySelector(container);
  }

  if (!container) return;

  container.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const skeleton = document.createElement("div");
    skeleton.className = "skeleton-card skeleton";
    skeleton.innerHTML = `
      <div class="skeleton skeleton-text long"></div>
      <div class="skeleton skeleton-text medium"></div>
      <div class="skeleton skeleton-text short"></div>
    `;
    container.appendChild(skeleton);
  }
}

// Enhanced Completion Celebration
function showCompletionCelebration(message = "مبروك! تم إكمال الأذكار") {
  const celebration = document.createElement("div");
  celebration.className = "completion-celebration";
  celebration.innerHTML = `
    <h3>مبروك!</h3>
    <p>${message}</p>
    <button onclick="this.parentElement.remove()" style="
      background: rgba(255,255,255,0.2);
      border: 2px solid white;
      color: white;
      padding: 10px 20px;
      border-radius: 25px;
      cursor: pointer;
      margin-top: 15px;
    ">حسناً</button>
  `;

  document.body.appendChild(celebration);

  // Play celebration sound if available
  playSound("celebration");

  // Remove after 5 seconds
  setTimeout(() => {
    if (celebration.parentElement) {
      celebration.style.animation = "fadeOut 0.5s ease";
      setTimeout(() => celebration.remove(), 500);
    }
  }, 5000);
}

// Sound Effects (optional)
function playSound(type) {
  // Only play if user has interacted (browsers block autoplay)
  if (!document.hasUserInteracted) return;

  try {
    const audioContext = new (
      window.AudioContext || window.webkitAudioContext
    )();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    switch (type) {
      case "celebration":
        oscillator.frequency.setValueAtTime(523, audioContext.currentTime);
        oscillator.frequency.setValueAtTime(
          659,
          audioContext.currentTime + 0.1,
        );
        oscillator.frequency.setValueAtTime(
          784,
          audioContext.currentTime + 0.2,
        );
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(
          0.01,
          audioContext.currentTime + 0.5,
        );
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
        break;
      case "click":
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(
          0.01,
          audioContext.currentTime + 0.1,
        );
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);
        break;
    }
  } catch (e) {
    // Silently fail if Web Audio API is not supported
  }
}

// Utility Functions
function scrollToBottom() {
  window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
}

function changeFontSize(direction) {
  const body = document.body;
  const currentSize = parseFloat(getComputedStyle(body).fontSize);
  let newSize;

  if (direction === "increase" && currentSize < 24) {
    newSize = currentSize + 2;
  } else if (direction === "decrease" && currentSize > 14) {
    newSize = currentSize - 2;
  } else {
    return;
  }

  body.style.fontSize = newSize + "px";
  localStorage.setItem("fontSize", newSize);

  showEnhancedNotification(
    direction === "increase" ? "تم تكبير الخط" : "تم تصغير الخط",
    "info",
    2000,
  );
}

// Enhanced Search with Highlighting
function highlightSearchResults(text, query) {
  if (!query) return text;

  const regex = new RegExp(`(${query})`, "gi");
  return text.replace(regex, '<span class="search-highlight">$1</span>');
}

// Progress Ring Animation
function animateProgressRing(ringElement, progress) {
  const circle = ringElement.querySelector(".progress-ring-circle-fill");
  if (circle) {
    const circumference = 188.4; // 2 * π * r (r = 30)
    const offset = circumference - (progress / 100) * circumference;
    circle.style.strokeDashoffset = offset;
  }
}

// Enhanced Error Handling
function handleError(error, context = "general") {
  console.error(`Error in ${context}:`, error);

  const errorMessages = {
    network: "خطأ في الشبكة. يرجى التحقق من الاتصال بالإنترنت.",
    storage: "خطأ في حفظ البيانات. قد تفقد بعض التغييرات.",
    general: "حدث خطأ غير متوقع. يرجى إعادة تحميل الصفحة.",
  };

  showEnhancedNotification(
    errorMessages[context] || errorMessages.general,
    "error",
    5000,
  );
}

// Initialize enhanced features when DOM is loaded
document.addEventListener("DOMContentLoaded", function () {
  // Mark that user has interacted (for audio)
  document.hasUserInteracted = false;
  document.addEventListener(
    "click",
    () => {
      document.hasUserInteracted = true;
    },
    { once: true },
  );

  // Restore font size preference
  const savedFontSize = localStorage.getItem("fontSize");
  if (savedFontSize) {
    document.body.style.fontSize = savedFontSize + "px";
  }

  // Fast-boot prayer times & core UX immediately
  try {
    initializePrayerTimes();
  } catch (err) {
    console.error("Fast-boot prayer times error:", err);
  }

  if (
    window.PrayerDailyRefresh &&
    typeof window.PrayerDailyRefresh.start === "function"
  ) {
    window.PrayerDailyRefresh.start(refreshPrayerTimesForCurrentLocation);
  }

  try {
    initializeEnhancedFeatures();
  } catch (err) {
    console.error("Fast-boot enhanced features error:", err);
  }

  // Defer non-critical UI animations, charts, compass, and install prompt until after first paint
  var _scheduleNonCriticalBoot = function (fn) {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(fn, { timeout: 250 });
    } else {
      setTimeout(fn, 40);
    }
  };

  _scheduleNonCriticalBoot(function () {
    try {
      initializeEnhancedUX();
    } catch (err) {
      console.error("Deferred enhanced UX error:", err);
    }

    try {
      initializeNewFeatures();
    } catch (err) {
      console.error("Deferred new features error:", err);
    }
  });

  // Delayed check for install prompt
  setTimeout(() => {
    try {
      showInstallPrompt();
    } catch (e) {}
  }, 1000);
});

// ========================================
// NEW FEATURES INITIALIZATION
// ========================================

function initializeNewFeatures() {
  try {
    initializeStatsDashboard();
  } catch (e) {
    console.warn("initializeStatsDashboard error", e);
  }

  if (typeof initializeQiblaCompass === "function") {
    try {
      initializeQiblaCompass();
    } catch (e) {
      console.warn("initializeQiblaCompass error", e);
    }
  }

  if (typeof initializeReadingModes === "function") {
    try {
      initializeReadingModes();
    } catch (e) {
      console.warn("initializeReadingModes error", e);
    }
  }

  if (typeof initializeOfflineDetection === "function") {
    try {
      initializeOfflineDetection();
    } catch (e) {
      console.warn("initializeOfflineDetection error", e);
    }
  }
}

// ========================================
// QIBLA COMPASS (Extracted to js/modules/qibla.js)
// ========================================
// Handled seamlessly via js/modules/qibla.js with AppRouter & SafeStorage

// ========================================
// READING MODES
// ========================================

let autoScrollInterval = null;
let autoScrollSpeed = 2; // 1=slow, 2=medium, 3=fast
let isAutoScrolling = false;
let focusModeIndex = 0;
let focusModeAdhkar = [];
let isNightReading = false;

function initializeReadingModes() {
  // Load saved preferences
  isNightReading = localStorage.getItem("nightReading") === "true";
  if (isNightReading) {
    document.body.classList.add("night-reading");
    updateNightReadingButton();
  }
}

function toggleAutoScroll() {
  const btn = document.getElementById("autoScrollBtn");
  const control = document.getElementById("autoScrollControl");

  if (isAutoScrolling) {
    // Stop auto-scroll
    clearInterval(autoScrollInterval);
    isAutoScrolling = false;
    if (btn) btn.classList.remove("active");
    if (control) control.classList.add("hidden");
  } else {
    // Start auto-scroll
    isAutoScrolling = true;
    if (btn) btn.classList.add("active");
    if (control) control.classList.remove("hidden");
    startAutoScroll();
  }
}

function startAutoScroll() {
  const speeds = [30, 50, 80]; // pixels per second
  const pixelsPerTick = speeds[autoScrollSpeed - 1] / 60;

  if (autoScrollInterval) {
    clearInterval(autoScrollInterval);
  }

  autoScrollInterval = setInterval(() => {
    window.scrollBy(0, pixelsPerTick);

    // Stop at bottom
    if (
      window.innerHeight + window.scrollY >=
      document.body.offsetHeight - 100
    ) {
      toggleAutoScroll();
    }
  }, 16); // ~60fps
}

function changeScrollSpeed(delta) {
  autoScrollSpeed = Math.max(1, Math.min(3, autoScrollSpeed + delta));

  const labels = ["بطيء", "متوسط", "سريع"];
  const label = document.getElementById("scrollSpeedLabel");
  if (label) {
    label.textContent = "سرعة: " + labels[autoScrollSpeed - 1];
  }

  // Restart scroll with new speed
  if (isAutoScrolling) {
    startAutoScroll();
  }
}

function enterFocusMode() {
  if (!currentCategory || !adhkarData[currentCategory]) {
    showNotification("يرجى اختيار قسم الأذكار أولاً", "info");
    return;
  }

  focusModeAdhkar = adhkarData[currentCategory].adhkar;
  focusModeIndex = 0;

  const overlay = document.getElementById("focusModeOverlay");
  if (overlay) {
    overlay.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    updateFocusDisplay();
  }
}

function exitFocusMode() {
  const overlay = document.getElementById("focusModeOverlay");
  if (overlay) {
    overlay.classList.add("hidden");
    document.body.style.overflow = "auto";
  }
}

function focusPrev() {
  if (focusModeIndex > 0) {
    focusModeIndex--;
    updateFocusDisplay();
  }
}

function focusNext() {
  if (focusModeIndex < focusModeAdhkar.length - 1) {
    focusModeIndex++;
    updateFocusDisplay();
  }
}

function updateFocusDisplay() {
  const zikr = focusModeAdhkar[focusModeIndex];
  if (!zikr) return;

  const textEl = document.getElementById("focusText");
  const sourceEl = document.getElementById("focusSource");
  const fadlEl = document.getElementById("focusFadl");
  const counterEl = document.getElementById("focusCounter");
  const countTextEl = document.getElementById("focusCountText");
  const progressEl = document.getElementById("focusProgressFill");

  if (textEl) textEl.textContent = zikr.text;
  if (sourceEl) sourceEl.textContent = zikr.source;
  if (fadlEl) fadlEl.textContent = zikr.fadl || "";
  if (counterEl)
    counterEl.textContent = `${focusModeIndex + 1}/${focusModeAdhkar.length}`;
  if (countTextEl)
    countTextEl.textContent = `${zikr.currentCount}/${zikr.count}`;

  const progress = (zikr.currentCount / zikr.count) * 100;
  if (progressEl) progressEl.style.width = progress + "%";

  // Update prev/next buttons
  const prevBtn = document.getElementById("focusPrevBtn");
  const nextBtn = document.getElementById("focusNextBtn");
  if (prevBtn) prevBtn.disabled = focusModeIndex === 0;
  if (nextBtn) nextBtn.disabled = focusModeIndex === focusModeAdhkar.length - 1;
}

function incrementFocusCount() {
  const zikr = focusModeAdhkar[focusModeIndex];
  if (!zikr || zikr.currentCount >= zikr.count) return;

  zikr.currentCount++;
  saveProgress();
  updateFocusDisplay();
  updateCardProgress(currentCategory, focusModeIndex);

  // Vibration feedback
  if (navigator.vibrate) {
    navigator.vibrate(50);
  }

  // Check completion
  if (zikr.currentCount === zikr.count) {
    markZekrCompleted(currentCategory, focusModeIndex);
    updateStatsDashboard();
    updateWeeklyChart();

    // Auto-advance after completion
    setTimeout(() => {
      if (focusModeIndex < focusModeAdhkar.length - 1) {
        focusNext();
      } else {
        showNotification("مبروك! أكملت جميع الأذكار");
        exitFocusMode();
      }
    }, 500);
  }
}

function toggleNightReading() {
  isNightReading = !isNightReading;
  localStorage.setItem("nightReading", isNightReading);

  if (isNightReading) {
    document.body.classList.add("night-reading");
  } else {
    document.body.classList.remove("night-reading");
  }

  updateNightReadingButton();
  showNotification(
    isNightReading
      ? "تم تفعيل وضع القراءة الليلية"
      : "تم إلغاء وضع القراءة الليلية",
  );
}

function updateNightReadingButton() {
  const btn = document.getElementById("nightReadingBtn");
  if (btn) {
    btn.classList.toggle("active", isNightReading);
  }
}

// ========================================
// OFFLINE DETECTION
// ========================================

function initializeOfflineDetection() {
  const banner = document.getElementById("offlineBanner");
  if (!banner) return;

  let offlineTimer = null;

  function handleOffline() {
    isOnline = false;
    const span = banner.querySelector("span");
    const icon = banner.querySelector("i");
    if (span) span.textContent = "لا يوجد اتصال بالإنترنت - التطبيق يعمل بكامل وظائفه بدون اتصال";
    if (icon) icon.className = "fas fa-wifi-slash";
    banner.classList.remove("online-recovered");
    banner.classList.remove("hidden");

    if (offlineTimer) clearTimeout(offlineTimer);
    offlineTimer = setTimeout(() => {
      banner.classList.add("hidden");
    }, 4000);
  }

  function handleOnline() {
    isOnline = true;
    const span = banner.querySelector("span");
    const icon = banner.querySelector("i");
    if (span) span.textContent = "تم استعادة الاتصال بالإنترنت بنجاح";
    if (icon) icon.className = "fas fa-wifi";
    banner.classList.add("online-recovered");
    banner.classList.remove("hidden");

    if (offlineTimer) clearTimeout(offlineTimer);
    offlineTimer = setTimeout(() => {
      banner.classList.add("hidden");
      banner.classList.remove("online-recovered");
    }, 2500);
  }

  window.addEventListener("offline", handleOffline);
  window.addEventListener("online", handleOnline);

  // Check initial status only if already offline on load
  if (!navigator.onLine) {
    handleOffline();
  }
}

// Update stats when zikr is completed
const originalMarkZekrCompleted = markZekrCompleted;
markZekrCompleted = function (categoryKey, zekrIndex) {
  originalMarkZekrCompleted(categoryKey, zekrIndex);
  updateStatsDashboard();
  updateWeeklyChart();
};

// Keyboard shortcuts for focus mode
document.addEventListener("keydown", function (e) {
  const focusOverlay = document.getElementById("focusModeOverlay");
  if (focusOverlay && !focusOverlay.classList.contains("hidden")) {
    if (e.key === "Escape") {
      exitFocusMode();
    } else if (e.key === "ArrowRight") {
      focusPrev();
    } else if (e.key === "ArrowLeft") {
      focusNext();
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      incrementFocusCount();
    }
  }
});

/**
 * Dynamic Time-Aware Hero Card
 * Contextually highlights what matters most right now:
 * - Fajr to Sunrise / Morning: Morning Azkar
 * - Asr to Maghrib / Evening: Evening Azkar
 * - Friday: Surah Al-Kahf & Salawat with golden glow
 * - Night / Pre-sleep: Sleep Azkar & Surah Al-Mulk
 * - Midday: General Dhikr & Misbaha
 */
// ========================================
// AZKAR REMINDER NOTIFICATION SYSTEM
// ========================================
let _lastHeroMode = null;
let _azkarReminderInterval = null;

/**
 * Returns the current hero card mode based on time of day.
 */
function getHeroCardMode(now) {
  now = now || new Date();
  const isFriday = now.getDay() === 5;
  if (isFriday) return "friday";

  const toMinutes = (value, fallback) => {
    const match = String(value || "").match(/(\d{1,2}):(\d{2})/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : fallback;
  };
  const current = now.getHours() * 60 + now.getMinutes();
  const fajr = toMinutes(prayerTimesData && prayerTimesData.Fajr, 270);
  const dhuhr = toMinutes(prayerTimesData && prayerTimesData.Dhuhr, 720);
  const asr = toMinutes(prayerTimesData && prayerTimesData.Asr, 930);
  const maghrib = toMinutes(
    prayerTimesData && (prayerTimesData.Maghrib || prayerTimesData.Sunset),
    1095,
  );
  const isha = toMinutes(prayerTimesData && prayerTimesData.Isha, 1185);

  if (current >= fajr && current < dhuhr) return "morning";
  if (current >= dhuhr && current < asr) return "midday";
  if (current >= asr && current < maghrib) return "evening";
  if (current >= maghrib && current < isha) return "maghrib";
  return "night";
}

/**
 * Returns user-facing notification text for each hero mode.
 */
function getAzkarReminderText(mode) {
  switch (mode) {
    case "morning":
      return {
        title: "أذكار الصباح",
        body: "حان وقت أذكار الصباح، حصنك ليومك بإذن الله",
        section: "morning"
      };
    case "evening":
      return {
        title: "أذكار المساء",
        body: "حان وقت أذكار المساء، طمأنينة لقلبك وحفظ من كل سوء",
        section: "evening"
      };
    case "night":
      return {
        title: "أذكار النوم",
        body: "لا تنسَ أذكار النوم وسورة الملك قبل أن تنام",
        section: "sleep"
      };
    case "friday":
      return {
        title: "يوم الجمعة المبارك",
        body: "لا تنسَ قراءة سورة الكهف والإكثار من الصلاة على النبي ﷺ",
        section: "kahf"
      };
    case "midday":
      return {
        title: "استراحة ذكر",
        body: "رطّب لسانك بذكر الله وتسبيحه",
        section: "misbaha"
      };
    default:
      return null;
  }
}

/**
 * Check if azkar reminders are enabled (defaults to true).
 */
function isAzkarReminderEnabled() {
  try {
    const val = localStorage.getItem("tazkeer_azkar_reminder");
    if (val === null) return true; // default enabled
    return val === "true";
  } catch (e) {
    return true;
  }
}

/**
 * Toggle azkar reminder on/off.
 */
function setAzkarReminderEnabled(enabled) {
  try {
    localStorage.setItem("tazkeer_azkar_reminder", String(enabled));
  } catch (e) {}
  // Update toggle UI if exists
  const toggle = document.getElementById("azkarReminderToggle");
  if (toggle) toggle.checked = enabled;
  syncAzkarNativeSchedule();
}

function azkarStableId(dateKey, reminderKey) {
  let hash = 2166136261;
  const value = "azkar:" + dateKey + ":" + reminderKey;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return 10000 + (hash >>> 0) % 2000000000;
}

function azkarTimeFor(prayerKey, fallback) {
  const value = prayerTimesData && prayerTimesData[prayerKey];
  return /^\d{1,2}:\d{2}/.test(String(value || "")) ? String(value).slice(0, 5) : fallback;
}

async function buildAzkarNativeSchedule() {
  const fallbackDay = {
    date: new Date(),
    timings: prayerTimesData || {},
  };
  let days = [fallbackDay];
  if (
    window.AdhanNative &&
    typeof window.AdhanNative.getPrayerDays === "function"
  ) {
    try {
      const collected = await window.AdhanNative.getPrayerDays(7);
      if (Array.isArray(collected) && collected.length > 0) days = collected;
    } catch (error) {
      console.warn("[Azkar] Prayer calendar unavailable; using today's timings", error);
    }
  }

  const reminders = [
    { key: "morning", prayer: "Fajr", section: "morning" },
    { key: "midday", prayer: "Dhuhr", section: "misbaha" },
    { key: "evening", prayer: "Asr", section: "evening" },
    { key: "night", prayer: "Isha", section: "sleep" },
  ];
  const schedule = [];
  const formatDateKey = (d) =>
    [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-");

  const addMinutesRollover = (date, timeValue, addMins) => {
    if (window.TazkeerUtils && typeof window.TazkeerUtils.addMinutesToLocalDateTime === "function") {
      return window.TazkeerUtils.addMinutesToLocalDateTime(date, cleanTimeString(timeValue), addMins);
    }
    const match = String(timeValue || "").match(/(\d{1,2}):(\d{2})/);
    if (!match) return null;
    const at = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      Number(match[1]),
      Number(match[2]),
      0,
      0,
    );
    at.setMinutes(at.getMinutes() + (Number(addMins) || 0));
    return {
      date: at,
      dateKey: formatDateKey(at),
      timeOfDay: `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`,
      epochMs: at.getTime(),
    };
  };

  days.forEach((day) => {
    const date = day.date instanceof Date ? day.date : new Date(day.date);
    const timings = _applyUserOffsets(day.timings || {});
    if (Number.isNaN(date.getTime())) return;
    const baseDateKey = formatDateKey(date);

    reminders.forEach((reminder) => {
      const shifted = addMinutesRollover(date, timings[reminder.prayer], 60);
      if (!shifted) return;
      if (shifted.epochMs <= Date.now() + 5000) return;
      const text = getAzkarReminderText(reminder.key);
      if (!text) return;
      schedule.push({
        id: azkarStableId(shifted.dateKey, reminder.key),
        date: shifted.dateKey,
        time: shifted.epochMs,
        timeOfDay: shifted.timeOfDay,
        key: reminder.key,
        title: text.title,
        body: text.body,
        section: reminder.section,
      });
    });

    // Friday Surah Al-Kahf reminder at 10:00 AM
    if (date.getDay() === 5) {
      const kahfAt = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        10,
        0,
        0,
        0,
      );
      if (kahfAt.getTime() > Date.now() + 5000) {
        schedule.push({
          id: azkarStableId(baseDateKey, "kahf"),
          date: baseDateKey,
          time: kahfAt.getTime(),
          timeOfDay: "10:00",
          key: "kahf",
          title: "جمعة مباركة — سورة الكهف",
          body: "لا تنسَ قراءة سورة الكهف والإكثار من الصلاة على النبي ﷺ اليوم",
          section: "kahf",
        });
      }
    }

    if (typeof checkFastingOccasions === "function") {
      const events = checkFastingOccasions(date);
      if (Array.isArray(events) && events.length > 0) {
        const reminderDate = new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate() - 1,
          20,
          0,
          0,
          0,
        );
        if (reminderDate.getTime() > Date.now() + 5000) {
          const event = events[0];
          const eventLabel =
            (event && (event.name || event.badge)) || "نافلة";
          schedule.push({
            id: azkarStableId(baseDateKey, "fasting"),
            date: formatDateKey(reminderDate),
            time: reminderDate.getTime(),
            timeOfDay: "20:00",
            key: "fasting",
            title: "تذكير بالصيام",
            body: `غداً موعد الصيام: ${eventLabel}`,
            section: "fasting",
          });
        }
      }
    }
  });
  return schedule;
}

async function syncAzkarNativeSchedule() {
  const plugin =
    window.Capacitor &&
    window.Capacitor.isNativePlatform &&
    window.Capacitor.isNativePlatform() &&
    window.Capacitor.Plugins &&
    window.Capacitor.Plugins.AdhanScheduler;
  if (!plugin) return false;
  try {
    if (!isAzkarReminderEnabled()) {
      await plugin.cancelAzkarReminders();
      return true;
    }
    const reminders = await buildAzkarNativeSchedule();
    if (!reminders.length) return false;
    const result = await plugin.scheduleAzkarReminders({ reminders });
    if (result && result.scheduled === 0) {
      console.warn("[Azkar] Native scheduler accepted no reminders");
      return false;
    }
    return true;
  } catch (error) {
    console.error("[Azkar] Native schedule sync failed:", error);
    return false;
  }
}

/**
 * Plays a clean, pleasant notification chime:
 * 1. Native device notification tone via Capacitor AdhanScheduler.playNotificationSound()
 * 2. In-app melodious chime via Web Audio API
 */
function playAzkarChime() {
  // 1. Try native device notification tone
  if (
    window.Capacitor &&
    window.Capacitor.isNativePlatform &&
    window.Capacitor.isNativePlatform() &&
    window.Capacitor.Plugins &&
    window.Capacitor.Plugins.AdhanScheduler &&
    typeof window.Capacitor.Plugins.AdhanScheduler.playNotificationSound === "function"
  ) {
    try {
      window.Capacitor.Plugins.AdhanScheduler.playNotificationSound();
    } catch (e) {}
  }

  // 2. In-app gentle chime using Web Audio API
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      if (ctx.state === "suspended") {
        ctx.resume();
      }
      const notes = [587.33, 739.99, 880.0]; // D5, F#5, A5
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.12);
        gain.gain.setValueAtTime(0, ctx.currentTime + idx * 0.12);
        gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + idx * 0.12 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.12 + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.12);
        osc.stop(ctx.currentTime + idx * 0.12 + 0.5);
      });
    }
  } catch (e) {}
}

/**
 * Send a system notification (browser Notification API or Capacitor).
 */
function sendAzkarSystemNotification(titleText, bodyText, section) {
  const targetSection = (section && String(section).trim()) || "tab-azkar";
  let sectionHash = 0;
  for (let i = 0; i < targetSection.length; i += 1) {
    sectionHash = ((sectionHash << 5) - sectionHash + targetSection.charCodeAt(i)) | 0;
  }
  const stableId = 99000 + Math.abs(sectionHash % 900);

  // Try native Android AdhanScheduler plugin first (channel already plays notification sound)
  if (
    window.Capacitor &&
    window.Capacitor.isNativePlatform &&
    window.Capacitor.isNativePlatform() &&
    window.Capacitor.Plugins &&
    window.Capacitor.Plugins.AdhanScheduler &&
    typeof window.Capacitor.Plugins.AdhanScheduler.sendAzkarNotification === "function"
  ) {
    try {
      window.Capacitor.Plugins.AdhanScheduler.sendAzkarNotification({
        id: stableId,
        title: titleText,
        body: bodyText,
        section: targetSection
      });
      return;
    } catch (e) {
      console.warn("[Azkar] Native sendAzkarNotification error:", e);
    }
  }

  // Play gentle Web Audio chime only when using non-native fallback
  playAzkarChime();

  // Fallback: Capacitor LocalNotifications
  if (
    window.Capacitor &&
    window.Capacitor.isNativePlatform &&
    window.Capacitor.isNativePlatform() &&
    window.Capacitor.Plugins &&
    window.Capacitor.Plugins.LocalNotifications
  ) {
    try {
      window.Capacitor.Plugins.LocalNotifications.schedule({
        notifications: [
          {
            id: stableId,
            title: titleText,
            body: bodyText,
            smallIcon: "ic_stat_adhan",
            sound: "default",
            extra: { section: targetSection },
            schedule: { at: new Date(Date.now() + 300) }
          }
        ]
      });
      return;
    } catch (e) {}
  }

  // Fallback: Web Notification API
  if ("Notification" in window) {
    const dispatchWebNotif = () => {
      try {
        const notif = new Notification(titleText, {
          body: bodyText,
          icon: "images/icons/icon-192x192.png",
          tag: "azkar-reminder-" + targetSection,
          renotify: true
        });
        notif.onclick = function () {
          try { window.focus(); } catch (_) {}
          if (typeof window.handleDeepLinkTarget === "function") {
            window.handleDeepLinkTarget(targetSection);
          }
          notif.close();
        };
      } catch (e) {}
    };
    if (Notification.permission === "granted") {
      dispatchWebNotif();
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then(function (perm) {
        if (perm === "granted") dispatchWebNotif();
      });
    }
  }
}

/**
 * Manually test Azkar Reminder and Sound from Settings
 */
function testAzkarReminder() {
  const currentMode = getHeroCardMode(new Date());
  const reminder = getAzkarReminderText(currentMode) || {
    title: "تذكير الأذكار",
    body: "تجربة إشعار وصوت تنبيه الأذكار، يعمل بنجاح",
    section: "tab-azkar"
  };
  showNotification(reminder.body, "info", 5000);
  sendAzkarSystemNotification(reminder.title, reminder.body, reminder.section);
}

/**
 * ===== First-Use Permissions Onboarding =====
 * Shows permissions clearly on first launch with Battery Optimization explicitly marked optional.
 */
let _permsOnboardVisibilityHandler = null;

async function _syncPermissionsOnboardingStatus() {
  const isNative = !!(
    window.Capacitor &&
    window.Capacitor.isNativePlatform &&
    window.Capacitor.isNativePlatform()
  );

  // Reflect saved location if already configured
  const savedLoc = _safeReadStr("prayerLocation", null);
  if (savedLoc) {
    const locBtn = document.querySelector("#permOnboardLocation .perms-onboard-item__btn");
    _markPermBtn(locBtn, "تم");
  }

  if (isNative && window.AdhanNative && typeof window.AdhanNative.refreshPermissions === "function") {
    try {
      const perms = await window.AdhanNative.refreshPermissions(true);
      if (perms && !perms.error) {
        const notifOk = perms.notifications === true && perms.notificationRuntimePermission !== false;
        if (notifOk) {
          _markPermBtn(document.querySelector("#permOnboardNotif .perms-onboard-item__btn"), "تم");
        }
        if (perms.exactAlarms === true) {
          _markPermBtn(document.querySelector("#permOnboardExact .perms-onboard-item__btn"), "تم");
        }
        if (perms.batteryOptimizations === true) {
          _markPermBtn(document.querySelector("#permOnboardBattery .perms-onboard-item__btn"), "تم");
        }
      }
    } catch (_) {
      /* non-fatal */
    }
  } else if ("Notification" in window && Notification.permission === "granted") {
    _markPermBtn(document.querySelector("#permOnboardNotif .perms-onboard-item__btn"), "تم");
  }
}

async function _renderPermissionsOemTip(isNative) {
  const tipEl = document.getElementById("permsOemTip");
  if (!tipEl) return;
  if (!isNative) {
    tipEl.classList.add("hidden");
    return;
  }
  let mfg = "";
  try {
    const plugin = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AdhanScheduler;
    if (plugin && typeof plugin.getDeviceInfo === "function") {
      const info = await plugin.getDeviceInfo();
      mfg = ((info && (info.manufacturer || info.brand)) || "").toLowerCase();
    }
  } catch (_) {}

  let title = "نصيحة لاستقرار الأذان:";
  let body = "في إعدادات النظام تأكد من اختيار «بلا قيود» لتطبيق ذَكِّرْ حتى لا يتوقف في الخلفية.";
  if (/xiaomi|redmi|poco/.test(mfg)) {
    title = "أجهزة شاومي / ريدمي / بوكو:";
    body = "افتح الإعدادات ← التطبيقات ← ذَكِّرْ ← فعّل «التشغيل التلقائي (Autostart)» واختر «بلا قيود» في توفير البطارية.";
  } else if (/samsung/.test(mfg)) {
    title = "أجهزة سامسونج:";
    body = "أضف تطبيق ذَكِّرْ إلى قائمة «التطبيقات غير الخاضعة للسكون» في العناية بالجهاز حتى لا تتأخر التنبيهات.";
  } else if (/huawei|honor/.test(mfg)) {
    title = "أجهزة هواوي / هونر:";
    body = "من إعدادات البطارية ← بدء تشغيل التطبيقات، حوّل ذَكِّرْ إلى «إدارة يدوية» وفعّل التشغيل في الخلفية.";
  } else if (/oppo|realme|oneplus|vivo/.test(mfg)) {
    title = "أجهزة أوبو / ريلمي / ون بلس / فيفو:";
    body = "في معلومات تطبيق ذَكِّرْ فعّل «السماح بالنشاط في الخلفية» و«التشغيل التلقائي».";
  }

  tipEl.textContent = "";
  const ico = document.createElement("i");
  ico.className = "fas fa-microchip";
  const box = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = title + " ";
  const span = document.createElement("span");
  span.textContent = body;
  box.appendChild(strong);
  box.appendChild(span);
  tipEl.appendChild(ico);
  tipEl.appendChild(box);
  tipEl.classList.remove("hidden");
}

function showPermissionsOnboarding() {
  const modal = document.getElementById("permissionsOnboardingModal");
  if (!modal) return;

  // Hide non-native items when running in browser (not Capacitor)
  const isNative = !!(
    window.Capacitor &&
    window.Capacitor.isNativePlatform &&
    window.Capacitor.isNativePlatform()
  );
  const exactItem = document.getElementById("permOnboardExact");
  const batteryItem = document.getElementById("permOnboardBattery");
  if (!isNative) {
    if (exactItem) exactItem.style.display = "none";
    if (batteryItem) batteryItem.style.display = "none";
  }

  modal.classList.add("is-open");
  _syncPermissionsOnboardingStatus();
  _renderPermissionsOemTip(isNative);

  if (!_permsOnboardVisibilityHandler) {
    _permsOnboardVisibilityHandler = () => {
      if (!document.hidden && modal.classList.contains("is-open")) {
        _syncPermissionsOnboardingStatus();
      }
    };
    document.addEventListener("visibilitychange", _permsOnboardVisibilityHandler);
  }

  if (window.AppRouter) {
    window.AppRouter.pushModal("permissionsOnboardingModal", closePermissionsOnboarding);
  }
}

function closePermissionsOnboarding() {
  const modal = document.getElementById("permissionsOnboardingModal");
  if (!modal) return;
  modal.classList.remove("is-open");
  if (_permsOnboardVisibilityHandler) {
    document.removeEventListener("visibilitychange", _permsOnboardVisibilityHandler);
    _permsOnboardVisibilityHandler = null;
  }
  if (window.AppRouter && window.AppRouter.isModalOpen("permissionsOnboardingModal")) {
    window.AppRouter.closeModal("permissionsOnboardingModal");
  }
  if (window.TazkeerModalQueue) {
    window.TazkeerModalQueue.notifyClosed("permissions-onboarding");
  }
}

function _markPermBtn(btn, label) {
  if (!btn) return;
  btn.classList.add("granted");
  btn.innerHTML = '<i class="fas fa-check"></i> ' + (label || "تم");
}

async function permOnboardGrantLocation(btn) {
  if (!navigator.geolocation) {
    _markPermBtn(btn, "غير مدعوم");
    return;
  }
  try {
    if (typeof requestLocation === "function") {
      await requestLocation(true);
      const savedLoc = _safeReadStr("prayerLocation", null);
      _markPermBtn(btn, savedLoc ? "تم" : "لاحقاً");
    } else {
      await new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          () => {
            _markPermBtn(btn, "تم");
            resolve();
          },
          () => {
            _markPermBtn(btn, "مرفوض");
            resolve();
          },
          { timeout: 10000 }
        );
      });
    }
  } catch (_) {
    _markPermBtn(btn, "مرفوض");
  }
}

async function permOnboardGrantNotif(btn) {
  const isNative = !!(
    window.Capacitor &&
    window.Capacitor.isNativePlatform &&
    window.Capacitor.isNativePlatform()
  );
  if (isNative && window.AdhanNative && typeof window.AdhanNative.fixPermission === "function") {
    await window.AdhanNative.fixPermission("notifications");
    _markPermBtn(btn, "تم");
  } else if ("Notification" in window) {
    try {
      const perm = await Notification.requestPermission();
      _markPermBtn(btn, perm === "granted" ? "تم" : "مرفوض");
    } catch (_) {
      _markPermBtn(btn, "مرفوض");
    }
  } else {
    _markPermBtn(btn, "غير مدعوم");
  }
}

async function permOnboardGrantExact(btn) {
  if (window.AdhanNative && typeof window.AdhanNative.fixPermission === "function") {
    await window.AdhanNative.fixPermission("exact");
    _markPermBtn(btn, "تم");
  }
}

async function permOnboardGrantBattery(btn) {
  if (window.AdhanNative && typeof window.AdhanNative.fixPermission === "function") {
    await window.AdhanNative.fixPermission("battery");
    _markPermBtn(btn, "تم");
  }
}

async function permOnboardGrantAll() {
  const locBtn = document.querySelector("#permOnboardLocation .perms-onboard-item__btn");
  const notifBtn = document.querySelector("#permOnboardNotif .perms-onboard-item__btn");
  const exactBtn = document.querySelector("#permOnboardExact .perms-onboard-item__btn");

  // Request essential permissions sequentially (never force optional Battery Optimization)
  if (notifBtn && !notifBtn.classList.contains("granted")) {
    await permOnboardGrantNotif(notifBtn);
  }
  if (locBtn && !locBtn.classList.contains("granted")) {
    await permOnboardGrantLocation(locBtn);
  }

  const isNative = !!(
    window.Capacitor &&
    window.Capacitor.isNativePlatform &&
    window.Capacitor.isNativePlatform()
  );
  if (isNative && exactBtn && !exactBtn.classList.contains("granted")) {
    let needExact = true;
    try {
      if (window.AdhanNative && typeof window.AdhanNative.refreshPermissions === "function") {
        const perms = await window.AdhanNative.refreshPermissions(true);
        if (perms && perms.exactAlarms === true) {
          needExact = false;
          _markPermBtn(exactBtn, "تم");
        }
      }
    } catch (_) {
      /* fallback to opening exact alarm settings */
    }
    if (needExact) {
      await permOnboardGrantExact(exactBtn);
    }
  }

  // Close cleanly after essential prompts finish
  setTimeout(() => closePermissionsOnboarding(), 600);
}

// Expose globally
window.showPermissionsOnboarding = showPermissionsOnboarding;
window.closePermissionsOnboarding = closePermissionsOnboarding;
window.permOnboardGrantLocation = permOnboardGrantLocation;
window.permOnboardGrantNotif = permOnboardGrantNotif;
window.permOnboardGrantExact = permOnboardGrantExact;
window.permOnboardGrantBattery = permOnboardGrantBattery;
window.permOnboardGrantAll = permOnboardGrantAll;

/**
 * Check first launch and open settings modal automatically
 */
function checkFirstLaunchSettings() {
  try {
    if (window.__tazkeerPendingDeepLink) return;
    const KEY = "tazkeer_first_launch_v2";
    const done = _safeReadStr(KEY, null);
    if (!done) {
      if (window.SafeStorage) window.SafeStorage.set(KEY, "true");
      else localStorage.setItem(KEY, "true");
      sessionStorage.setItem("tazkeer_is_first_launch", "true");

      // ---- Show permissions onboarding FIRST ----
      if (window.TazkeerModalQueue) {
        window.TazkeerModalQueue.enqueue({
          id: "permissions-onboarding",
          delayMs: 400,
          show: () => {
            showPermissionsOnboarding();
          },
        });
      } else {
        setTimeout(() => showPermissionsOnboarding(), 400);
      }

      // ---- Then show adhan settings as before ----
      if (window.TazkeerModalQueue) {
        window.TazkeerModalQueue.enqueue({
          id: "first-launch-settings",
          delayMs: 700,
          show: () => {
            if (typeof openAdhanModal === "function") {
              openAdhanModal();
            } else {
              return false;
            }
          },
        });
      } else {
        setTimeout(function () {
          if (typeof openAdhanModal === "function") {
            openAdhanModal();
          }
        }, 1500);
      }
    }
  } catch (e) {}
}

/**
 * Checks if the hero card mode changed and sends a reminder notification.
 * Called periodically every 60 seconds.
 */
function checkAzkarReminderTransition() {
  const now = new Date();
  const currentMode = getHeroCardMode(now);

  if (currentMode !== _lastHeroMode) {
    updateDynamicHeroCard(now);
    renderAzkarSuggestion();
  }

  const nativeNotifications =
    window.Capacitor &&
    window.Capacitor.isNativePlatform &&
    window.Capacitor.isNativePlatform();
  if (!nativeNotifications && isAzkarReminderEnabled() && _lastHeroMode !== null && currentMode !== _lastHeroMode) {
    const reminder = getAzkarReminderText(currentMode);
    if (reminder) {
      // In-app toast
      showNotification(reminder.body, "info", 6000);
      // System notification (for background/locked screen)
      sendAzkarSystemNotification(reminder.title, reminder.body, reminder.section);
    }
  }

  _lastHeroMode = currentMode;
}

/**
 * Start the periodic azkar reminder checker (every 60s).
 */
function startAzkarReminderEngine() {
  // Initialize current mode without sending notification
  _lastHeroMode = getHeroCardMode(new Date());

  if (_azkarReminderInterval) clearInterval(_azkarReminderInterval);
  _azkarReminderInterval = setInterval(() => {
    // On native Android, AlarmManager handles background reminders; skip hidden UI ticks
    if (document.hidden && isCapacitorNative) return;
    checkAzkarReminderTransition();
  }, 60000);
}

// Start engine & check first launch after first paint
document.addEventListener("DOMContentLoaded", function () {
  var runReminderBoot = function () {
    startAzkarReminderEngine();
    checkFirstLaunchSettings();
    syncAzkarNativeSchedule();
    if (typeof window.flushPendingDeepLink === "function") {
      window.flushPendingDeepLink();
    }
  };
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(runReminderBoot, { timeout: 300 });
  } else {
    setTimeout(runReminderBoot, 60);
  }
});

// Global exports
window.isAzkarReminderEnabled = isAzkarReminderEnabled;
window.setAzkarReminderEnabled = setAzkarReminderEnabled;
window.testAzkarReminder = testAzkarReminder;
window.playAzkarChime = playAzkarChime;
window.syncAzkarNativeSchedule = syncAzkarNativeSchedule;

function updateDynamicHeroCard(now) {
  const container = document.getElementById("dynamicHeroCard");
  if (!container) return;
  now = now || new Date();

  const mode = getHeroCardMode(now);

  let icon = "fa-hands-praying";
  let title = "ألا بذكر الله تطمئن القلوب";
  let sub = "رطّب لسانك بذكر الله في سائر يومك";
  let action = "openMisbaha()";
  let ctaIcon = "fa-circle-notch";
  let ctaLabel = "المسبحة";

  if (mode === "friday") {
    icon = "fa-mosque";
    title = "سورة الكهف والصلاة على النبي";
    sub = "يوم الجمعة المبارك · اغتنم فضله";
    action = "openSurahAlKahf()";
    ctaIcon = "fa-book-quran";
    ctaLabel = "اقرأ";
  } else if (mode === "morning") {
    icon = "fa-sun";
    title = "أذكار الصباح";
    sub = "حِصنك ليومك · ابدأ الآن";
    action = "showCategoryPage('morning')";
    ctaIcon = "fa-play";
    ctaLabel = "ابدأ";
  } else if (mode === "midday") {
    icon = "fa-fingerprint";
    title = "التسبيح بالمسبحة";
    sub = "رطّب لسانك بذكر الله في وسط يومك";
    action = "openMisbaha()";
    ctaIcon = "fa-circle-notch";
    ctaLabel = "سبّح";
  } else if (mode === "evening") {
    icon = "fa-cloud-moon";
    title = "أذكار المساء";
    sub = "طمأنينة لقلبك · ابدأ الآن";
    action = "showCategoryPage('evening')";
    ctaIcon = "fa-play";
    ctaLabel = "ابدأ";
  } else if (mode === "maghrib") {
    icon = "fa-fingerprint";
    title = "ذكر الله";
    sub = "رطّب لسانك بالتسبيح بعد المغرب";
    action = "openMisbaha()";
    ctaIcon = "fa-circle-notch";
    ctaLabel = "سبّح";
  } else if (mode === "night") {
    icon = "fa-moon";
    title = "أذكار النوم";
    sub = "أذكار تحفظك حتى تصبح بإذن الله";
    action = "showCategoryPage('sleep')";
    ctaIcon = "fa-bed";
    ctaLabel = "ابدأ";
  }

  container.className = "pt-azkar-strip pt-azkar-strip--" + mode;
  container.innerHTML = `
    <div class="pt-azkar-strip__ico"><i class="fas ${icon}"></i></div>
    <div class="pt-azkar-strip__txt">
      <div class="pt-azkar-strip__title">${title}</div>
      <div class="pt-azkar-strip__sub">${sub}</div>
    </div>
    <button class="pt-azkar-strip__play" onclick="${action}" title="${ctaLabel}" aria-label="${ctaLabel}">
      <i class="fas ${ctaIcon}"></i>
    </button>
  `;
}

/**
 * Continue Reading Shortcut Pill
 */
function updateContinueReadingPill() {
  const pill = document.getElementById("continueReadingPill");
  if (!pill) return;

  let lastRead = null;
  try {
    const raw = localStorage.getItem("tazkeer_last_reading");
    if (raw) lastRead = JSON.parse(raw);
  } catch (e) {}

  if (!lastRead) {
    pill.classList.add("hidden");
    return;
  }

  let iconHTML = '<i class="fas fa-book-open"></i>';
  let title = "";
  let sub = "";
  let pct = `${lastRead.percent || 0}%`;

  if (lastRead.type === "prophet") {
    iconHTML = '<i class="fas fa-feather-pointed"></i>';
    title = `متابعة: ${lastRead.title}`;
    sub = lastRead.chapterTitle ? lastRead.chapterTitle : "";
  } else if (lastRead.type === "quran") {
    iconHTML = '<i class="fas fa-book-quran"></i>';
    title = `متابعة: ${lastRead.title}`;
    sub = `صفحة ${toArabicNumerals(lastRead.page)} · جزء ${toArabicNumerals(lastRead.juz || 1)}`;
  }

  pill.innerHTML = `
    <div class="cr-icon-wrap">${iconHTML}</div>
    <div class="cr-info">
      <div class="cr-title">${title}</div>
      <div class="cr-sub">${sub}</div>
    </div>
    <div class="cr-actions">
      <span class="cr-pct-badge">${pct}</span>
      <button class="cr-resume-btn" onclick="resumeLastReading()" title="استئناف القراءة">
        <span>متابعة</span>
        <i class="fas fa-chevron-left"></i>
      </button>
    </div>
  `;
  pill.classList.remove("hidden");
}

function resumeLastReading() {
  let lastRead = null;
  try {
    const raw = localStorage.getItem("tazkeer_last_reading");
    if (raw) lastRead = JSON.parse(raw);
  } catch (e) {}
  if (!lastRead) return;

  if (lastRead.type === "prophet") {
    switchTab("tab-prophets");
    setTimeout(() => {
      if (typeof window._openProphet === "function") {
        window._openProphet(lastRead.slug, lastRead.chapterIdx);
      }
    }, 150);
  } else if (lastRead.type === "quran") {
    switchTab("tab-quran");
    setTimeout(() => {
      if (typeof openFreeReader === "function") {
        openFreeReader(lastRead.page);
      }
    }, 150);
  }
}

window.updateContinueReadingPill = updateContinueReadingPill;
window.resumeLastReading = resumeLastReading;

/**
 * Duaa Management
 */
let currentDailyDuaa = null;

function updateDailyDuaa(date) {
  let allDuaas = [];
  if (
    typeof dailyDuasCollection !== "undefined" &&
    dailyDuasCollection.length > 0
  ) {
    allDuaas = dailyDuasCollection;
  } else if (
    typeof adhkarData !== "undefined" &&
    adhkarData.dua &&
    adhkarData.dua.adhkar
  ) {
    allDuaas = adhkarData.dua.adhkar;
  }

  if (allDuaas.length === 0) return;

  const seedString = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  const seed = stringToSeed(seedString);
  const randomIndex = Math.floor(random(seed) * allDuaas.length);
  setDisplayedDuaa(allDuaas[randomIndex]);
}

function setDisplayedDuaa(duaa) {
  currentDailyDuaa = duaa;
  const textEl = document.getElementById("dailyDuaaText");
  const sourceEl = document.getElementById("duaaSourceText");
  if (textEl && duaa) {
    textEl.style.opacity = "0";
    setTimeout(() => {
      textEl.textContent = `«${duaa.text}»`;
      if (sourceEl) {
        sourceEl.textContent = duaa.source || "أدعية مختارة من الكتاب والسنة";
      }
      textEl.style.opacity = "1";
    }, 150);
  }
}

function nextRandomDuaa() {
  let allDuaas = [];
  if (
    typeof dailyDuasCollection !== "undefined" &&
    dailyDuasCollection.length > 0
  ) {
    allDuaas = dailyDuasCollection;
  } else if (
    typeof adhkarData !== "undefined" &&
    adhkarData.dua &&
    adhkarData.dua.adhkar
  ) {
    allDuaas = adhkarData.dua.adhkar;
  }
  if (allDuaas.length === 0) return;

  const nextIndex = Math.floor(Math.random() * allDuaas.length);
  setDisplayedDuaa(allDuaas[nextIndex]);
}

function copyCurrentDuaa() {
  if (!currentDailyDuaa || !currentDailyDuaa.text) return;
  const fullText = `«${currentDailyDuaa.text}»\n${currentDailyDuaa.source ? "[" + currentDailyDuaa.source + "]" : ""}\n— عبر تطبيق ذَكِّرْ`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(fullText)
      .then(() => {
        onDuaaCopied();
      })
      .catch(() => {
        fallbackCopy(fullText);
      });
  } else {
    fallbackCopy(fullText);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    onDuaaCopied();
  } catch (err) {}
  document.body.removeChild(ta);
}

function onDuaaCopied() {
  const label = document.getElementById("copyDuaaLabel");
  if (label) {
    const orig = label.textContent;
    label.textContent = "تم النسخ ✓";
    setTimeout(() => {
      label.textContent = orig;
    }, 2000);
  }
  const notif = document.getElementById("notification");
  const notifText = document.getElementById("notificationText");
  if (notif && notifText) {
    notifText.textContent = "تم نسخ الدعاء بنجاح!";
    notif.classList.add("show");
    setTimeout(() => notif.classList.remove("show"), 2500);
  }
}

function shareCurrentDuaa() {
  if (!currentDailyDuaa || !currentDailyDuaa.text) return;
  const fullText = `«${currentDailyDuaa.text}»\n${currentDailyDuaa.source ? "[" + currentDailyDuaa.source + "]" : ""}\n— عبر تطبيق ذَكِّرْ`;

  if (navigator.share) {
    navigator
      .share({
        title: "دعاء اليوم - تطبيق ذَكِّرْ",
        text: fullText,
      })
      .catch(() => {});
  } else {
    copyCurrentDuaa();
  }
}

/**
 * Fasting Guide Modal Controller
 */
function _closeFastingGuideModalInternal() {
  const modal = document.getElementById("fastingGuideModal");
  if (modal) {
    modal.style.display = "none";
  }
}

function openFastingGuideModal() {
  const modal = document.getElementById("fastingGuideModal");
  if (modal) {
    modal.style.display = "flex";
    if (window.AppRouter && !window.AppRouter.isModalOpen("fastingGuide")) {
      window.AppRouter.pushModal("fastingGuide", _closeFastingGuideModalInternal);
    }
  }
}

function closeFastingGuideModal() {
  if (window.AppRouter && window.AppRouter.isModalOpen("fastingGuide")) {
    window.AppRouter.closeModal("fastingGuide");
  } else {
    _closeFastingGuideModalInternal();
  }
}

/**
 * Privacy Policy In-App Modal Controller
 */
function _closePrivacyPolicyModalInternal() {
  const modal = document.getElementById("privacyPolicyModal");
  if (modal) {
    modal.style.display = "none";
  }
  if (
    document.body.style.overflow === "hidden" &&
    (!window.AppRouter || !window.AppRouter.isModalOpen())
  ) {
    document.body.style.overflow = "";
  }
}

function openPrivacyPolicyModal() {
  const modal = document.getElementById("privacyPolicyModal");
  if (!modal) return;
  modal.style.display = "flex";
  document.body.style.overflow = "hidden";
  const body = modal.querySelector(".privacy-modal-body");
  if (body) body.scrollTop = 0;
  if (window.AppRouter && !window.AppRouter.isModalOpen("privacyPolicy")) {
    window.AppRouter.pushModal("privacyPolicy", _closePrivacyPolicyModalInternal);
  }
}

function closePrivacyPolicyModal() {
  if (window.AppRouter && window.AppRouter.isModalOpen("privacyPolicy")) {
    window.AppRouter.closeModal("privacyPolicy");
  } else {
    _closePrivacyPolicyModalInternal();
  }
}

/**
 * Scroll smoothly to Qibla compass
 */
function scrollToQibla() {
  const qibla = document.getElementById("qiblaSection");
  if (qibla) {
    qibla.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

// Simple pseudo-random number generator seeded with a string
function stringToSeed(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function random(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// Close modals when clicking outside
window.addEventListener("click", (e) => {
  const fastingModal = document.getElementById("fastingGuideModal");
  if (fastingModal && e.target === fastingModal) {
    closeFastingGuideModal();
  }
});

// Initialize on load
document.addEventListener("DOMContentLoaded", () => {
  updateDailyInfo();
});

/* ================================================================
   MISBAHA (Digital Prayer Beads) — Extracted to js/modules/misbaha.js
   ================================================================ */
// Managed via js/modules/misbaha.js with Haptics, AppRouter & SafeStorage;

// Carousel scroll listener for Quick Actions indicator dots (passive)
document.addEventListener("DOMContentLoaded", function () {
  const quickGrid = document.getElementById("homeQuickGrid");
  if (quickGrid) {
    const dots = document.querySelectorAll("#homeQuickDots .hq-dot");
    if (!dots.length) return;
    quickGrid.addEventListener(
      "scroll",
      function () {
        const scrollLeft = Math.abs(quickGrid.scrollLeft);
        const maxScroll = quickGrid.scrollWidth - quickGrid.clientWidth;
        if (maxScroll <= 0) return;
        const ratio = scrollLeft / maxScroll;
        const activeIdx = ratio > 0.4 ? 1 : 0;
        dots.forEach((dot, idx) => {
          dot.classList.toggle("active", idx === activeIdx);
        });
      },
      { passive: true },
    );
  }
});
