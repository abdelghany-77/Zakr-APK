/* ── Azkar Categories, Search, Swiper & Progress Engine ── */
// Show azkar list (populate categories)
function _showHomePageInternal() {
  // Don't reset counters when leaving — preserve progress
  // Counters only reset when ALL azkar in a category are completed

  // Disconnect IntersectionObserver to prevent stale callbacks
  if (_swiperObserver) {
    _swiperObserver.disconnect();
    _swiperObserver = null;
  }
  _swiperIsScrolling = false;

  // Toggle internal azkar views
  const listEl = document.getElementById("azkarListView");
  const catPageEl = document.getElementById("categoryPage");
  const catsHost = document.getElementById("categoriesContainer");
  if (listEl) listEl.classList.remove("hidden");
  if (catPageEl) catPageEl.classList.add("hidden");
  if (backBtn) backBtn.classList.add("hidden");
  isHomePage = true;
  currentCategory = null;

  // Populate categories once to eliminate flicker on subsequent tab switches
  if (catsHost && catsHost.children.length === 0) {
    Object.keys(adhkarData).forEach((categoryKey, index) => {
      createCategoryCard(categoryKey, adhkarData[categoryKey], index);
    });
  }

  // Time-aware suggestion card
  renderAzkarSuggestion();
}

/**
 * Render the time-aware Azkar suggestion card (Azkar tab).
 */
function renderAzkarSuggestion() {
  const host = document.getElementById("azkarSuggestion");
  if (!host) return;

  const mode = getHeroCardMode(new Date());
  const content = {
    morning: ["is-em", "fa-sun", "حان وقت أذكار الصباح", "٢٩ ذكراً — نحو ٨ دقائق", "showCategoryPage('morning')", 30],
    midday: ["is-em", "fa-fingerprint", "حان وقت التسبيح", "سبّح واذكر الله بالمسبحة الإلكترونية", "openMisbaha()", 50],
    evening: ["", "fa-cloud-moon", "حان وقت أذكار المساء", "٢٦ ذكراً — نحو ٨ دقائق", "showCategoryPage('evening')", 70],
    maghrib: ["is-em", "fa-fingerprint", "حان وقت ذكر الله", "وقت مناسب للتسبيح بالمسبحة الإلكترونية", "openMisbaha()", 80],
    night: ["", "fa-moon", "حان وقت أذكار النوم", "أذكار النوم وسورة الملك — نحو ٥ دقائق", "showCategoryPage('sleep')", 90],
    friday: ["is-gold", "fa-book-quran", "جمعة مباركة", "سورة الكهف والصلاة على النبي ﷺ", "openSurahAlKahf()", 65],
  }[mode];
  const [variant, icon, title, sub, action, progress] = content;

  host.innerHTML = `
    <div class="pt-suggest ${variant}">
      <div class="pt-suggest__top">
        <span class="pt-suggest__now">الآن</span>
        <span class="pt-suggest__ico"><i class="fas ${icon}"></i></span>
      </div>
      <h2 class="pt-suggest__title">${title}</h2>
      <p class="pt-suggest__sub">${sub}</p>
      <div class="pt-suggest__bar"><span style="width:${progress}%"></span></div>
      <button class="pt-suggest__cta" onclick="${action}">
        <i class="fas fa-play"></i>
        <span>ابدأ الأذكار</span>
      </button>
    </div>
  `;
}

/**
 * Show/hide the Azkar search field.
 */
function toggleAzkarSearch() {
  const box = document.getElementById("azkarSearchBox");
  const input = document.getElementById("azkarSearchInput");
  if (!box) return;
  const open = box.classList.toggle("is-open");
  if (open && input) {
    setTimeout(() => input.focus(), 60);
  } else if (input) {
    input.value = "";
    filterAzkarCategories("");
  }
}

/**
 * Filter the Azkar category grid by normalized Arabic text.
 */
function filterAzkarCategories(query) {
  const norm =
    window.TazkeerUtils && typeof window.TazkeerUtils.normalizeArabic === "function"
      ? window.TazkeerUtils.normalizeArabic
      : (s) => String(s || "").trim().toLowerCase();
  const q = norm(query);
  const cards = document.querySelectorAll("#categoriesContainer .category-card");
  cards.forEach((card) => {
    const title = card.querySelector(".category-title");
    const desc = card.querySelector(".category-description");
    const hay = norm(`${title ? title.textContent : ""} ${desc ? desc.textContent : ""}`);
    const match = !q || hay.includes(q);
    card.style.display = match ? "" : "none";
  });

  const suggestion = document.getElementById("azkarSuggestion");
  const misbahaRow = document.getElementById("misbahaLaunchBtn");
  if (suggestion) suggestion.style.display = q ? "none" : "";
  if (misbahaRow) misbahaRow.style.display = q ? "none" : "";
}

function showHomePage(syncRouter) {
  if (syncRouter !== false && window.AppRouter && window.AppRouter.isModalOpen("azkarCategory")) {
    window.AppRouter.closeModal("azkarCategory");
    return;
  }
  _showHomePageInternal();
}

// Show category page with adhkar
function showCategoryPage(categoryKey) {
  // Switch to azkar tab first
  switchTab("tab-azkar");
  // Then show detail view
  if (azkarListView) azkarListView.classList.add("hidden");
  categoryPage.classList.remove("hidden");
  if (backBtn) backBtn.classList.remove("hidden");
  isHomePage = false;
  currentCategory = categoryKey;

  loadCategory(categoryKey);

  // Scroll to top of page
  window.scrollTo({ top: 0, behavior: "smooth" });

  // Register with AppRouter for Hardware Back Button handling
  if (window.AppRouter && !window.AppRouter.isModalOpen("azkarCategory")) {
    window.AppRouter.pushModal("azkarCategory", function () {
      _showHomePageInternal();
    });
  }
}

// SVG icons for category cards (matching the reference design)
const categoryIcons = {
  morning: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" style="stop-color:#FFD700;stop-opacity:0.6"/>
        <stop offset="100%" style="stop-color:#FFD700;stop-opacity:0"/>
      </radialGradient>
    </defs>
    <circle cx="50" cy="50" r="40" fill="url(#sunGlow)"/>
    <circle cx="50" cy="50" r="20" fill="#FFD700"/>
    <circle cx="50" cy="50" r="16" fill="#FFA500"/>
    <g stroke="#FFD700" stroke-width="3" stroke-linecap="round">
      <line x1="50" y1="10" x2="50" y2="22"/>
      <line x1="50" y1="78" x2="50" y2="90"/>
      <line x1="10" y1="50" x2="22" y2="50"/>
      <line x1="78" y1="50" x2="90" y2="50"/>
      <line x1="21" y1="21" x2="30" y2="30"/>
      <line x1="70" y1="70" x2="79" y2="79"/>
      <line x1="79" y1="21" x2="70" y2="30"/>
      <line x1="30" y1="70" x2="21" y2="79"/>
    </g>
  </svg>`,
  evening: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="moonGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" style="stop-color:#87CEEB;stop-opacity:0.3"/>
        <stop offset="100%" style="stop-color:#87CEEB;stop-opacity:0"/>
      </radialGradient>
    </defs>
    <circle cx="50" cy="50" r="40" fill="url(#moonGlow)"/>
    <path d="M55 20 C35 20, 20 40, 25 60 C30 80, 55 85, 70 70 C55 75, 40 60, 40 45 C40 30, 50 20, 55 20Z" fill="#C0D8E8"/>
    <path d="M55 20 C35 20, 20 40, 25 60 C30 80, 55 85, 70 70 C55 75, 40 60, 40 45 C40 30, 50 20, 55 20Z" fill="url(#moonGlow)" opacity="0.5"/>
    <circle cx="68" cy="28" r="2" fill="#FFD700"/>
    <circle cx="78" cy="40" r="1.5" fill="#FFD700"/>
    <circle cx="75" cy="55" r="2.5" fill="#FFD700"/>
    <circle cx="82" cy="30" r="1" fill="#FFD700"/>
    <circle cx="85" cy="48" r="1.5" fill="#FFD700"/>
    <path d="M65 22 l2 5 5 0 -4 3 1.5 5 -4.5-3 -4.5 3 1.5-5 -4-3 5 0z" fill="#FFD700" transform="scale(0.6) translate(35, 10)"/>
  </svg>`,
  prayer: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="prayGlow" cx="50%" cy="40%" r="50%">
        <stop offset="0%" style="stop-color:#FFD700;stop-opacity:0.4"/>
        <stop offset="100%" style="stop-color:#FFD700;stop-opacity:0"/>
      </radialGradient>
    </defs>
    <circle cx="50" cy="40" r="35" fill="url(#prayGlow)"/>
    <path d="M35 75 C35 50, 30 40, 30 30 C30 20, 35 15, 40 25 C42 30, 43 40, 45 50 L50 35 L55 50 C57 40, 58 30, 60 25 C65 15, 70 20, 70 30 C70 40, 65 50, 65 75Z" fill="#E8D5B0" stroke="#D4A847" stroke-width="1"/>
    <path d="M42 30 C44 25, 46 22, 50 22 C54 22, 56 25, 58 30" fill="none" stroke="#FFD700" stroke-width="2" opacity="0.6"/>
    <circle cx="50" cy="18" r="3" fill="#FFD700" opacity="0.5"/>
  </svg>`,
  sleep: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bedGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#7B9EC7"/>
        <stop offset="100%" style="stop-color:#5A7FA0"/>
      </linearGradient>
    </defs>
    <rect x="15" y="55" width="70" height="20" rx="4" fill="url(#bedGrad)"/>
    <rect x="12" y="70" width="4" height="12" rx="2" fill="#5A7FA0"/>
    <rect x="84" y="70" width="4" height="12" rx="2" fill="#5A7FA0"/>
    <rect x="80" y="48" width="5" height="25" rx="2" fill="#5A7FA0"/>
    <ellipse cx="30" cy="50" rx="12" ry="8" fill="#A8C4DB"/>
    <circle cx="35" cy="42" r="8" fill="#D4B896"/>
    <text x="60" y="40" font-size="14" fill="#87CEEB" font-weight="bold" opacity="0.8">Z</text>
    <text x="68" y="30" font-size="10" fill="#87CEEB" font-weight="bold" opacity="0.6">Z</text>
    <text x="74" y="22" font-size="8" fill="#87CEEB" font-weight="bold" opacity="0.4">Z</text>
  </svg>`,
  wakeup: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="sunriseGrad" x1="50%" y1="100%" x2="50%" y2="0%">
        <stop offset="0%" style="stop-color:#FF6B35;stop-opacity:0.6"/>
        <stop offset="50%" style="stop-color:#FFD700;stop-opacity:0.3"/>
        <stop offset="100%" style="stop-color:#FFD700;stop-opacity:0"/>
      </linearGradient>
    </defs>
    <rect x="0" y="60" width="100" height="40" fill="url(#sunriseGrad)" opacity="0.3"/>
    <circle cx="50" cy="62" r="18" fill="#FFD700"/>
    <circle cx="50" cy="62" r="14" fill="#FFA500"/>
    <line x1="10" y1="62" x2="90" y2="62" stroke="#C0D8E8" stroke-width="2" opacity="0.5"/>
    <g stroke="#FFD700" stroke-width="2.5" stroke-linecap="round" opacity="0.8">
      <line x1="50" y1="32" x2="50" y2="40"/>
      <line x1="25" y1="42" x2="32" y2="48"/>
      <line x1="75" y1="42" x2="68" y2="48"/>
      <line x1="15" y1="56" x2="24" y2="56"/>
      <line x1="85" y1="56" x2="76" y2="56"/>
    </g>
  </svg>`,
  general: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="personGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" style="stop-color:#87CEEB;stop-opacity:0.3"/>
        <stop offset="100%" style="stop-color:#87CEEB;stop-opacity:0"/>
      </radialGradient>
    </defs>
    <circle cx="50" cy="50" r="40" fill="url(#personGlow)"/>
    <circle cx="50" cy="30" r="10" fill="#C0D8E8"/>
    <path d="M50 42 L50 65" stroke="#C0D8E8" stroke-width="4" stroke-linecap="round"/>
    <path d="M50 48 L30 35" stroke="#C0D8E8" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M50 48 L70 35" stroke="#C0D8E8" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M50 65 L35 82" stroke="#C0D8E8" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M50 65 L65 82" stroke="#C0D8E8" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M45 15 C38 10, 30 15, 35 22 C28 18, 30 10, 38 8 C42 7, 46 10, 45 15Z" fill="#C0D8E8" opacity="0.8"/>
  </svg>`,
  food: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="foodGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" style="stop-color:#FFD700;stop-opacity:0.3"/>
        <stop offset="100%" style="stop-color:#FFD700;stop-opacity:0"/>
      </radialGradient>
    </defs>
    <circle cx="50" cy="55" r="35" fill="url(#foodGlow)"/>
    <ellipse cx="50" cy="60" rx="30" ry="15" fill="none" stroke="#D4A847" stroke-width="2.5"/>
    <path d="M20 60 Q50 35 80 60" fill="none" stroke="#D4A847" stroke-width="2.5"/>
    <path d="M30 40 Q35 20 30 10" fill="none" stroke="#C0D8E8" stroke-width="2" opacity="0.5"/>
    <path d="M50 35 Q55 15 50 5" fill="none" stroke="#C0D8E8" stroke-width="2" opacity="0.5"/>
    <path d="M70 40 Q75 20 70 10" fill="none" stroke="#C0D8E8" stroke-width="2" opacity="0.5"/>
  </svg>`,
  travel: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="travelGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" style="stop-color:#87CEEB;stop-opacity:0.3"/>
        <stop offset="100%" style="stop-color:#87CEEB;stop-opacity:0"/>
      </radialGradient>
    </defs>
    <circle cx="50" cy="50" r="40" fill="url(#travelGlow)"/>
    <path d="M50 20 L55 45 L75 50 L55 55 L50 80 L45 55 L25 50 L45 45Z" fill="#87CEEB" opacity="0.8"/>
    <circle cx="50" cy="50" r="6" fill="#5A7FA0"/>
    <ellipse cx="30" cy="30" rx="12" ry="5" fill="#C0D8E8" opacity="0.4"/>
    <ellipse cx="72" cy="25" rx="10" ry="4" fill="#C0D8E8" opacity="0.3"/>
  </svg>`,
  dua: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="duaGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" style="stop-color:#1a8a5c;stop-opacity:0.4"/>
        <stop offset="100%" style="stop-color:#1a8a5c;stop-opacity:0"/>
      </radialGradient>
    </defs>
    <circle cx="50" cy="50" r="40" fill="url(#duaGlow)"/>
    <path d="M30 80 Q30 55 35 45 Q38 38 43 40 L47 50 L50 38 L53 50 L57 40 Q62 38 65 45 Q70 55 70 80Z" fill="#2d9d6e" opacity="0.8"/>
    <path d="M40 35 L50 20 L60 35" fill="none" stroke="#FFD700" stroke-width="2.5"/>
    <circle cx="50" cy="15" r="4" fill="#FFD700" opacity="0.7"/>
    <line x1="50" y1="8" x2="50" y2="3" stroke="#FFD700" stroke-width="1.5" opacity="0.5"/>
    <line x1="43" y1="10" x2="40" y2="6" stroke="#FFD700" stroke-width="1.5" opacity="0.5"/>
    <line x1="57" y1="10" x2="60" y2="6" stroke="#FFD700" stroke-width="1.5" opacity="0.5"/>
  </svg>`,
  rain: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="rainGlow" cx="50%" cy="40%" r="50%">
        <stop offset="0%" style="stop-color:#87CEEB;stop-opacity:0.3"/>
        <stop offset="100%" style="stop-color:#87CEEB;stop-opacity:0"/>
      </radialGradient>
    </defs>
    <circle cx="50" cy="40" r="35" fill="url(#rainGlow)"/>
    <ellipse cx="50" cy="35" rx="28" ry="16" fill="#8BA4B8"/>
    <ellipse cx="35" cy="32" rx="14" ry="12" fill="#A0B4C8"/>
    <ellipse cx="65" cy="32" rx="14" ry="12" fill="#A0B4C8"/>
    <ellipse cx="50" cy="28" rx="12" ry="10" fill="#B4C8DC"/>
    <line x1="30" y1="55" x2="28" y2="68" stroke="#87CEEB" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
    <line x1="42" y1="55" x2="40" y2="72" stroke="#87CEEB" stroke-width="2" stroke-linecap="round" opacity="0.8"/>
    <line x1="54" y1="55" x2="52" y2="70" stroke="#87CEEB" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
    <line x1="66" y1="55" x2="64" y2="68" stroke="#87CEEB" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
  </svg>`,
  distress: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="heartGlow" cx="50%" cy="45%" r="50%">
        <stop offset="0%" style="stop-color:#E87C7C;stop-opacity:0.4"/>
        <stop offset="100%" style="stop-color:#E87C7C;stop-opacity:0"/>
      </radialGradient>
    </defs>
    <circle cx="50" cy="50" r="40" fill="url(#heartGlow)"/>
    <path d="M50 80 C20 55 10 35 25 25 C35 18 45 25 50 35 C55 25 65 18 75 25 C90 35 80 55 50 80Z" fill="#E87C7C"/>
    <path d="M30 50 L40 50 L45 38 L50 55 L55 42 L60 50 L70 50" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
  </svg>`,
  home: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="homeGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" style="stop-color:#2d9d6e;stop-opacity:0.3"/>
        <stop offset="100%" style="stop-color:#2d9d6e;stop-opacity:0"/>
      </radialGradient>
    </defs>
    <circle cx="50" cy="50" r="40" fill="url(#homeGlow)"/>
    <path d="M50 18 L15 48 L22 48 L22 78 L78 78 L78 48 L85 48Z" fill="#5A7FA0" stroke="#7B9EC7" stroke-width="1.5"/>
    <rect x="40" y="55" width="20" height="23" rx="2" fill="#D4A847" opacity="0.8"/>
    <circle cx="55" cy="67" r="2" fill="#A0843C"/>
    <rect x="28" y="52" width="10" height="10" rx="1" fill="#87CEEB" opacity="0.6"/>
    <rect x="62" y="52" width="10" height="10" rx="1" fill="#87CEEB" opacity="0.6"/>
  </svg>`,
};

// Short labels + Font Awesome icons for the v2 Azkar grid
const categoryMeta = {
  morning: { label: "أذكار الصباح", icon: "fa-sun", color: "pt-c-gold" },
  evening: { label: "أذكار المساء", icon: "fa-cloud-moon", color: "pt-c-indigo" },
  prayer: { label: "أذكار الصلاة", icon: "fa-person-praying", color: "pt-c-em" },
  sleep: { label: "أذكار النوم", icon: "fa-bed", color: "pt-c-blue" },
  wakeup: { label: "أذكار الاستيقاظ", icon: "fa-bell", color: "pt-c-warm" },
  general: { label: "أذكار عامة", icon: "fa-hands-praying", color: "pt-c-purple" },
  eating: { label: "أذكار الطعام", icon: "fa-utensils", color: "pt-c-gold" },
  travel: { label: "أذكار السفر", icon: "fa-plane", color: "pt-c-sky" },
  dua: { label: "أدعية مأثورة", icon: "fa-hand-holding-heart", color: "pt-c-em" },
  rain: { label: "أذكار المطر", icon: "fa-cloud-rain", color: "pt-c-rain" },
  anxiety: { label: "أذكار الهم", icon: "fa-heart-pulse", color: "pt-c-pink" },
  home: { label: "أذكار المنزل", icon: "fa-house", color: "pt-c-em" },
};

// Create category card (instant render with zero layout flicker)
/**
 * Arabic-friendly "N azkar" label for category cards.
 */
function formatAzkarCount(count) {
  if (count === 1) return "ذكر واحد";
  if (count === 2) return "ذكران";
  if (count >= 3 && count <= 10) return `${toArabicNumerals(count)} أذكار`;
  return `${toArabicNumerals(count)} ذكرًا`;
}

function createCategoryCard(categoryKey, categoryData, index) {  const card = document.createElement("div");
  card.className = "category-card";
  card.setAttribute("data-category", categoryKey);

  const adhkarCount = categoryData.adhkar.length;
  const meta = categoryMeta[categoryKey] || {
    label: categoryData.title,
    icon: "fa-hands-praying",
    color: "pt-c-em",
  };

  card.innerHTML = `
    <div class="category-card-inner">
      <div class="category-card-icon ${meta.color}">
        <i class="fas ${meta.icon}"></i>
      </div>
      <div class="category-card-info">
        <h3 class="category-title">${meta.label}</h3>
        <div class="category-card-bottom">
          <span class="category-count-badge">${formatAzkarCount(adhkarCount)}</span>
          <span class="pt-card-chevron"><i class="fas fa-chevron-left"></i></span>
        </div>
      </div>
    </div>
  `;

  card.addEventListener("click", () => showCategoryPage(categoryKey));
  categoriesContainer.appendChild(card);
}

// ── Global scroll lock flag for programmatic scrolls ──
let _swiperIsScrolling = false;
let _swiperObserver = null;

// Load category as Swiper (scroll-snap) – uses IntersectionObserver for reliable index detection
function loadCategory(category) {
  const data = adhkarData[category];
  if (categoryTitle) categoryTitle.textContent = data.title;
  if (categoryDescription) categoryDescription.textContent = data.description;
  currentCategory = category;

  const track = document.getElementById("azkarSwiperTrack");
  const dotsWrap = document.getElementById("swiperDotsWrap");
  if (!track) return;

  // Disconnect previous observer if exists
  if (_swiperObserver) {
    _swiperObserver.disconnect();
    _swiperObserver = null;
  }

  track.innerHTML = "";
  if (dotsWrap) dotsWrap.innerHTML = "";

  // Build slides and dots
  data.adhkar.forEach((zikr, index) => {
    createAdhkarSlide(zikr, index, category, track);
    if (dotsWrap) {
      const dot = document.createElement("button");
      dot.className =
        "swiper-dot" +
        (zikr.currentCount >= zikr.count ? " done" : "") +
        (index === 0 ? " active" : "");
      dot.setAttribute("aria-label", `ذكر ${index + 1}`);
      dot.addEventListener("click", () => goToSlide(index));
      dotsWrap.appendChild(dot);
    }
  });

  // Apply saved font size
  loadSwiperFontSize();

  // Restore last position (instant – no animation on first render)
  // Reset to position 0 if it's a new day (so morning azkar start fresh)
  const today = new Date().toDateString();
  const savedPosData = localStorage.getItem("swiperPos_" + category);
  let savedPos = 0;
  if (savedPosData) {
    try {
      const parsed = JSON.parse(savedPosData);
      // Only restore position if same day
      if (parsed.date === today) {
        savedPos = parsed.index || 0;
      }
    } catch (e) {
      // Legacy format (just a number) — treat as expired
      savedPos = 0;
    }
  }
  const validPos = Math.min(Math.max(0, savedPos), data.adhkar.length - 1);
  requestAnimationFrame(() => {
    const slides = track.querySelectorAll(".azkar-slide");
    if (slides[validPos]) {
      slides[validPos].scrollIntoView({
        behavior: "instant",
        inline: "start",
        block: "nearest",
      });
    }
    updateSwiperUI(category, validPos);
  });

  // ── IntersectionObserver – reliably detect active slide ──
  // Fires when a slide crosses 50% visibility in the track viewport.
  // This eliminates the timing race condition between scroll-snap and
  // the old setTimeout-based scrollLeft calculation that caused skipping.
  _swiperObserver = new IntersectionObserver(
    (entries) => {
      // Skip if a programmatic scroll is in progress
      if (_swiperIsScrolling) return;

      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const slide = entry.target;
          const idx = parseInt(slide.dataset.index, 10);
          if (!isNaN(idx)) {
            updateSwiperUI(category, idx);
            saveSwiperPosition(category, idx);
          }
        }
      });
    },
    {
      root: track,
      threshold: 0.5, // fire when 50% of slide is visible
    },
  );

  // Observe all slides
  track.querySelectorAll(".azkar-slide").forEach((slide) => {
    _swiperObserver.observe(slide);
  });
}

// Format Dhikr text for maximum visual clarity
function formatZikrDisplayHtml(text) {
  if (!text) return "";
  let formatted = text.trim();

  // Highlight Bismillah as an ornamental header if present at the start
  const basmalaPattern = /^بِسْمِ اللهِ الرَّحْمنِ الرَّحِيم\s*/;
  let hasBasmala = false;
  if (basmalaPattern.test(formatted)) {
    hasBasmala = true;
    formatted = formatted.replace(basmalaPattern, "").trim();
  }

  // Format Ayah brackets e.g. ﴿١﴾ with ornamental gold styling
  formatted = formatted.replace(
    /﴿\s*([٠-٩\d]+)\s*﴾/g,
    '<span class="quran-aya-num">﴿$1﴾</span>',
  );

  // Convert newlines to breaks
  formatted = formatted.replace(/\n/g, "<br>");

  if (hasBasmala) {
    return `<div class="bismillah-header">بِسْمِ اللهِ الرَّحْمنِ الرَّحِيم</div><div class="zikr-content-lines">${formatted}</div>`;
  }
  return `<div class="zikr-content-lines">${formatted}</div>`;
}

// Toggle collapsible Fadl drawer
function toggleSlideFadl(triggerEl) {
  const card = triggerEl.closest(".slide-body");
  if (!card) return;
  const fadlBox = card.querySelector(".slide-fadl-box");
  if (fadlBox) {
    const isCollapsed = fadlBox.classList.contains("collapsed");
    fadlBox.classList.toggle("collapsed", !isCollapsed);
    triggerEl.classList.toggle("active", isCollapsed);
  }
}

// Share Dhikr helper
function shareZikr(text, source) {
  const cleanText = text.replace(/<[^>]*>/g, "");
  const shareData = {
    title: "تطبيق ذَكِّرْ",
    text: `${cleanText}\n[${source}]\n\nتم المشاركة من تطبيق ذَكِّرْ 🌙`,
  };
  if (navigator.share) {
    navigator.share(shareData).catch(() => {});
  } else {
    copyText(`${cleanText}\n[${source}]`);
    showNotification("تم نسخ الذكر للمشاركة");
  }
}

// Create one swiper slide with Reader-First layout
function createAdhkarSlide(zikr, index, category, track) {
  const isCompleted = zikr.currentCount >= zikr.count;
  const safeText = zikr.text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, " ");
  const safeSource = (zikr.source || "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'");

  const totalSlides = adhkarData[category]
    ? adhkarData[category].adhkar.length
    : 0;
  const isFirst = index === 0;
  const isLast = index === totalSlides - 1;
  const isLong = zikr.text.length > 180;

  // Circular ring calculation (radius 44 → circumference ≈ 276.46)
  const circumference = 276.46;
  const progressRatio = Math.min(1, zikr.currentCount / zikr.count);
  const ringOffset = circumference * (1 - progressRatio);
  const remainingCount = Math.max(0, zikr.count - zikr.currentCount);

  const slide = document.createElement("div");
  slide.className = "azkar-slide";
  slide.dataset.index = index;

  slide.innerHTML = `
    <div class="slide-body">
      <!-- ── Hero Reading Text Container ── -->
      <div class="slide-text-container">
        <div class="slide-zikr-text ${isLong ? "long-text" : ""}">
          ${formatZikrDisplayHtml(zikr.text)}
        </div>
      </div>

      <!-- ── Meta Row (Source & Fadl Trigger & Copy) ── -->
      <div class="slide-meta-row">
        <span class="slide-source-label">
          <i class="fas fa-book-open"></i> <span class="slide-source-text">${toArabicNumerals(zikr.source || "")}</span>
        </span>
        <div class="slide-meta-actions">
          ${
            zikr.fadl
              ? `<button class="slide-fadl-toggle" onclick="toggleSlideFadl(this)" title="فضل الذكر" aria-label="فضل الذكر">
                   <i class="fas fa-star"></i> <span>فضل الذكر</span> <i class="fas fa-chevron-down arrow-indicator"></i>
                 </button>`
              : ""
          }
          <button class="slide-copy-btn" onclick="copyText('${safeText}')" title="نسخ الذكر" aria-label="نسخ الذكر">
            <i class="fas fa-copy"></i>
          </button>
        </div>
      </div>

      <!-- ── Collapsible Fadl Box ── -->
      ${
        zikr.fadl
          ? `<div class="slide-fadl-box collapsed">
               <div class="slide-fadl-content"><p>${zikr.fadl}</p></div>
             </div>`
          : ""
      }

      <!-- ── Ergonomic Thumb Counter Area ── -->
      <div class="slide-counter-area">
        <div class="slide-counter-row">
          <button
            class="slide-nav-arrow prev-arrow${isFirst ? " disabled" : ""}"
            onclick="swiperPrevSlide()"
            title="الذكر السابق"
            aria-label="الذكر السابق"
            ${isFirst ? "disabled" : ""}
          >
            <i class="fas fa-chevron-right"></i>
          </button>

          <!-- Circular Button with SVG Progress Ring -->
          <button
            class="slide-counter-btn${isCompleted ? " completed" : ""}"
            id="slideCounterBtn_${category}_${index}"
            ${isCompleted ? "disabled" : ""}
            aria-label="عدّ الذكر"
          >
            <svg class="counter-ring-svg" viewBox="0 0 100 100">
              <circle class="ring-bg" cx="50" cy="50" r="44" />
              <circle 
                class="ring-progress" 
                id="ringProgress_${category}_${index}" 
                cx="50" 
                cy="50" 
                r="44" 
                style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${ringOffset};" 
              />
            </svg>
            <div class="counter-btn-inner">
              <span class="counter-num">${isCompleted ? "✓" : toArabicNumerals(remainingCount)}</span>
              <span class="counter-lbl">${isCompleted ? "مكتمل" : (zikr.count > 1 ? "متبقي" : "مرة")}</span>
            </div>
          </button>

          <button
            class="slide-nav-arrow next-arrow${isLast ? " disabled" : ""}"
            onclick="swiperNextSlide()"
            title="الذكر التالي"
            aria-label="الذكر التالي"
            ${isLast ? "disabled" : ""}
          >
            <i class="fas fa-chevron-left"></i>
          </button>
        </div>
        <div class="counter-status-hint">
          <span class="counter-hint-text">${
            isCompleted
              ? "تقبل الله طاعتكم ✓"
              : zikr.count > 1
                ? "اضغط في أي مكان للعدّ"
                : "اضغط للإتمام"
          }</span>
        </div>
      </div>
    </div>
  `;

  // Attach counter click
  const btn = slide.querySelector(".slide-counter-btn");
  if (btn)
    btn.addEventListener("click", () => decrementSlideCounter(category, index));

  // ── Tap Anywhere Mode ──────────────────────────────
  // Allows user to tap anywhere on the slide to count without aiming at the button
  slide.addEventListener("click", (e) => {
    if (
      e.target.closest(
        "button, a, .slide-fadl-toggle, .slide-fadl-box, .slide-copy-btn, .slide-nav-arrow",
      )
    ) {
      return;
    }
    decrementSlideCounter(category, index);
  });

  track.appendChild(slide);
}

// Increment zikr count directly on card
function incrementZikrCount(category, index) {
  const zikr = adhkarData[category].adhkar[index];

  if (zikr.currentCount < zikr.count) {
    zikr.currentCount++;

    // Add visual feedback - find the card and animate it
    const cards = document.querySelectorAll(".adhkar-card");
    if (cards[index]) {
      const card = cards[index];
      card.style.transform = "scale(0.98)";
      setTimeout(() => {
        card.style.transform = "scale(1)";
      }, 150);
    }

    // Vibration feedback (if supported)
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }

    // Save progress
    saveProgress();

    // Update the specific card progress without reloading the entire page
    updateCardProgress(category, index);

    // Check if this individual zikr is completed and mark it
    if (zikr.currentCount === zikr.count) {
      markZekrCompleted(category, index);
    }

    // Check if all adhkar in the category are completed
    const categoryData = adhkarData[category];
    const allCompleted = categoryData.adhkar.every(
      (adhkar) => adhkar.currentCount === adhkar.count,
    );

    if (allCompleted) {
      setTimeout(() => {
        showNotification("تم إكمال الأذكار! بارك الله فيك");
        // Reset counters after completion so they're fresh next time
        resetCategoryCounters(category);
      }, 300);
    }
  }
}

// Reset all adhkar in current category
async function resetAllAdhkar() {
  if (!currentCategory) return;

  const confirmed = window.AppDialog
    ? await window.AppDialog.confirm({
        title: "إعادة تعيين الأذكار",
        message: "هل أنت متأكد من إعادة تعيين جميع الأذكار في هذا القسم؟",
        confirmText: "إعادة تعيين",
        cancelText: "إلغاء",
        danger: true,
      })
    : true;

  if (confirmed) {
    adhkarData[currentCategory].adhkar.forEach((zikr) => {
      zikr.currentCount = 0;
    });

    saveProgress();
    updateAllCardsProgress(currentCategory);
    showNotification("تمت إعادة تعيين جميع الأذكار");
  }
}

// Update all slides / cards progress without reloading
function updateAllCardsProgress(category) {
  if (!category) return;
  adhkarData[category].adhkar.forEach((zikr, index) => {
    updateCardProgress(category, index);
  });
}

// Reset all counters in a category when leaving it
// NOTE: This is now only called when ALL azkar are completed
function resetCategoryCounters(category) {
  if (!category || !adhkarData[category]) return;

  adhkarData[category].adhkar.forEach((zikr) => {
    zikr.currentCount = 0;
  });

  // Reset swiper position so category starts from first zekr next time
  saveSwiperPosition(category, 0);

  // Save progress
  saveProgress();
}

// Handle search
function handleSearch(e) {
  const searchTerm = e.target.value.toLowerCase().trim();
  const cards = document.querySelectorAll(".adhkar-card");

  cards.forEach((card) => {
    const text = card.querySelector(".adhkar-text").textContent.toLowerCase();
    const source = card
      .querySelector(".adhkar-source")
      .textContent.toLowerCase();

    if (text.includes(searchTerm) || source.includes(searchTerm)) {
      card.style.display = "block";
      card.classList.add("fade-in");
    } else {
      card.style.display = "none";
    }
  });
}

// Open counter modal
function openCounter(text, count, category, index) {
  currentZikrText = text;
  totalCount = count;
  currentCount = adhkarData[category].adhkar[index].currentCount;
  currentCategory = category;
  currentZikrIndex = index;

  const zikr = adhkarData[category].adhkar[index];

  modalTitle.textContent = `العداد - ${count} ${count === 1 ? "مرة" : "مرات"}`;
  totalCountSpan.textContent = count;

  // Display the fadl (virtue/benefit) if available
  if (zikr.fadl) {
    fadlText.textContent = zikr.fadl;
    document.getElementById("fadlSection").style.display = "block";
  } else {
    document.getElementById("fadlSection").style.display = "none";
  }

  updateCounterDisplay();

  modal.style.display = "block";
  document.body.style.overflow = "hidden";
}

// Close counter modal
function closeCounterModal() {
  if (!modal) return;
  modal.style.display = "none";
  document.body.style.overflow = "auto";
}

// Increment counter
function incrementCounter() {
  if (currentCount < totalCount) {
    currentCount++;

    // Update the data
    if (currentCategory && currentZikrIndex !== null) {
      adhkarData[currentCategory].adhkar[currentZikrIndex].currentCount =
        currentCount;
    }

    updateCounterDisplay();

    // Update the progress bar on the main category page without reloading
    updateCardProgress(currentCategory, currentZikrIndex);

    // Add click animation
    countBtn.style.transform = "scale(0.9)";
    setTimeout(() => {
      countBtn.style.transform = "scale(1)";
    }, 150);

    // Vibration feedback (if supported)
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }

    // Save progress
    saveProgress();

    // Update statistics
    updateProgressStats();

    // Check if completed
    if (currentCount === totalCount) {
      // Mark as completed for daily progress
      if (currentCategory && currentZikrIndex !== null) {
        markZekrCompleted(currentCategory, currentZikrIndex);
      }

      setTimeout(() => {
        showCompletionMessage();
      }, 300);
    }
  }
}

// Reset counter
function resetCounter() {
  currentCount = 0;

  // Update the data
  if (currentCategory && currentZikrIndex !== null) {
    adhkarData[currentCategory].adhkar[currentZikrIndex].currentCount = 0;
  }

  updateCounterDisplay();

  // Update the progress bar on the main category page without reloading
  updateCardProgress(currentCategory, currentZikrIndex);

  saveProgress();
}

// Update counter display
function updateCounterDisplay() {
  countNumber.textContent = toArabicNumerals(currentCount);
  const progress = (currentCount / totalCount) * 100;
  progressFill.style.width = `${progress}%`;

  // Change color based on progress
  if (progress === 100) {
    countNumber.style.color = "#b8860b";
    progressFill.style.background = "linear-gradient(90deg, #b8860b, #48bb78)";
  } else {
    countNumber.style.color = "#1a8a5c";
    progressFill.style.background = "linear-gradient(90deg, #1a8a5c, #d4a847)";
  }
}

// Update slide counter OR fallback to old card progress bar
function updateCardProgress(category, index) {
  if (!category || index === null) return;

  const zikr = adhkarData[category].adhkar[index];
  const isCompleted = zikr.currentCount >= zikr.count;

  // ─── Swiper slide counter ───
  const swiperBtn = document.getElementById(
    `slideCounterBtn_${category}_${index}`,
  );
  if (swiperBtn) {
    const numEl = swiperBtn.querySelector(".counter-num");
    const lblEl = swiperBtn.querySelector(".counter-lbl");
    const ringEl = document.getElementById(`ringProgress_${category}_${index}`);
    const areaEl = swiperBtn.closest(".slide-counter-area");
    const hintEl = areaEl ? areaEl.querySelector(".counter-hint-text") : null;

    const remaining = Math.max(0, zikr.count - zikr.currentCount);
    if (numEl) numEl.textContent = isCompleted ? "✓" : toArabicNumerals(remaining);
    if (lblEl) lblEl.textContent = isCompleted ? "مكتمل" : (zikr.count > 1 ? "متبقي" : "مرة");

    // Circular SVG Progress Ring update
    if (ringEl) {
      const circumference = 276.46; // 2 * PI * 44
      const ratio = Math.min(1, zikr.currentCount / zikr.count);
      const offset = circumference * (1 - ratio);
      ringEl.style.strokeDashoffset = offset;
    }

    if (isCompleted) {
      swiperBtn.classList.add("completed");
      swiperBtn.disabled = true;
      if (hintEl) hintEl.textContent = "تقبل الله طاعتكم ✓";
      swiperBtn.style.animation = "swiperCounterComplete 0.4s ease forwards";
      setTimeout(() => {
        if (swiperBtn) swiperBtn.style.animation = "";
      }, 500);
    } else {
      swiperBtn.classList.remove("completed");
      swiperBtn.disabled = false;
      if (hintEl)
        hintEl.textContent =
          zikr.count > 1 ? "اضغط في أي مكان للعدّ" : "اضغط للإتمام";
      swiperBtn.style.animation = "swiperCounterPulse 0.18s ease";
      setTimeout(() => {
        if (swiperBtn) swiperBtn.style.animation = "";
      }, 220);
    }
    // Sync dot state
    const dots = document.querySelectorAll(".swiper-dot");
    if (dots[index]) dots[index].classList.toggle("done", isCompleted);
    return;
  }

  // ─── Fallback: old adhkar-card ───
  const cards = document.querySelectorAll(".adhkar-card");
  if (cards[index]) {
    const card = cards[index];
    const progressBar = card.querySelector(".progress-fill");
    const progressText = card.querySelector(".progress-text");
    const countBtn = card.querySelector(".count-action-btn");
    const progressPercent = (zikr.currentCount / zikr.count) * 100;

    if (progressBar) {
      progressBar.style.width = `${progressPercent}%`;
      progressBar.style.background = isCompleted
        ? "linear-gradient(90deg, #b8860b, #48bb78)"
        : "linear-gradient(90deg, #1a8a5c, #d4a847)";
    }
    if (progressText)
      progressText.textContent = isCompleted
        ? "مكتمل"
        : `${toArabicNumerals(zikr.currentCount)} / ${toArabicNumerals(zikr.count)}`;
    if (countBtn) {
      if (isCompleted) {
        countBtn.style.background = "#b8860b";
        countBtn.innerHTML = '<i class="fas fa-plus"></i> مكتمل';
      } else {
        countBtn.style.background = "#1a8a5c";
        countBtn.innerHTML = '<i class="fas fa-plus"></i> عدّ';
      }
    }
  }
}

// Show completion message
function showCompletionMessage() {
  const originalText = countBtn.innerHTML;
  countBtn.innerHTML = '<i class="fas fa-check"></i> تم الإكمال';
  countBtn.style.background = "#b8860b";

  setTimeout(() => {
    countBtn.innerHTML = originalText;
    countBtn.style.background = "#1a8a5c";
  }, 2000);
}

// Copy text to clipboard
function copyText(text) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand("copy");
  document.body.removeChild(textArea);

  showNotification("تم نسخ النص");
}

// Touch/Swipe support for mobile
let touchStartX = 0;
let touchEndX = 0;
let touchStartTarget = null; // used to skip swipe-back when inside swiper

document.addEventListener("touchstart", (e) => {
  touchStartX = e.changedTouches[0].screenX;
  touchStartTarget = e.target;
});

document.addEventListener("touchend", (e) => {
  touchEndX = e.changedTouches[0].screenX;
  handleSwipe();
});

function handleSwipe() {
  const swipeDistance = touchEndX - touchStartX;
  const minSwipeDistance = 100;

  // Don't intercept swipes that start inside the azkar swiper track
  const swiperTrack = document.getElementById("azkarSwiperTrack");
  if (
    swiperTrack &&
    touchStartTarget &&
    swiperTrack.contains(touchStartTarget)
  ) {
    return;
  }

  if (Math.abs(swipeDistance) > minSwipeDistance && !isHomePage) {
    if (swipeDistance > 0) {
      // Swipe right - go back to category list
      showHomePage();
    }
  }
}

// ═══════════════════════════════════════════════════════
//  AZKAR SWIPER  –  helper functions
// ═══════════════════════════════════════════════════════

let _currentSwiperIndex = 0;

/** Programmatically scroll to the slide at [index] with smooth animation */
function goToSlide(index) {
  const track = document.getElementById("azkarSwiperTrack");
  if (!track || !currentCategory) return;

  // Lock the observer during programmatic scroll to prevent conflicts
  _swiperIsScrolling = true;

  const slides = track.querySelectorAll(".azkar-slide");
  if (slides[index]) {
    slides[index].scrollIntoView({
      behavior: "smooth",
      inline: "start",
      block: "nearest",
    });
  }
  updateSwiperUI(currentCategory, index);
  saveSwiperPosition(currentCategory, index);

  // Release lock after scroll animation completes
  setTimeout(() => {
    _swiperIsScrolling = false;
  }, 450);
}

/** Navigate to next slide in swiper */
function swiperNextSlide() {
  if (!currentCategory || !adhkarData[currentCategory]) return;
  const total = adhkarData[currentCategory].adhkar.length;
  if (_currentSwiperIndex < total - 1) {
    goToSlide(_currentSwiperIndex + 1);
  }
}

/** Navigate to previous slide in swiper */
function swiperPrevSlide() {
  if (_currentSwiperIndex > 0) {
    goToSlide(_currentSwiperIndex - 1);
  }
}

/** Sync progress badge, progress line, dots, and nav arrows to reflect current slide index */
function updateSwiperUI(category, index) {
  if (!category || !adhkarData[category]) return;
  _currentSwiperIndex = index;
  const total = adhkarData[category].adhkar.length;

  // Convert to Arabic-Indic numerals for the badge
  const toAr = (n) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]);
  const badge = document.getElementById("swiperProgressText");
  if (badge) badge.textContent = `${toAr(index + 1)} / ${toAr(total)}`;

  // Progress line fill
  const fill = document.getElementById("swiperProgressFill");
  if (fill) {
    const pct = total > 0 ? ((index + 1) / total) * 100 : 0;
    fill.style.width = pct + "%";
  }

  // Dots
  document.querySelectorAll(".swiper-dot").forEach((dot, i) => {
    dot.classList.toggle("active", i === index);
  });

  // Enable/disable navigation buttons
  const prevBtn = document.getElementById("swiperPrevBtn");
  const nextBtn = document.getElementById("swiperNextBtn");
  if (prevBtn) prevBtn.classList.toggle("disabled", index <= 0);
  if (nextBtn) nextBtn.classList.toggle("disabled", index >= total - 1);
}

// Keyboard arrow & spacebar controls for Azkar swiper
document.addEventListener("keydown", (e) => {
  const catPage = document.getElementById("categoryPage");
  if (!catPage || catPage.classList.contains("hidden")) return;
  if (e.key === "ArrowLeft") {
    swiperNextSlide();
  } else if (e.key === "ArrowRight") {
    swiperPrevSlide();
  } else if (e.code === "Space" || e.key === " ") {
    // Spacebar to count on desktop
    e.preventDefault();
    if (currentCategory && _currentSwiperIndex !== null) {
      decrementSlideCounter(currentCategory, _currentSwiperIndex);
    }
  }
});

/**
 * Decrement the visual counter (internally increments currentCount toward
 * the goal, then auto-advances to the next slide on completion).
 */
function decrementSlideCounter(category, index) {
  const zikr = adhkarData[category].adhkar[index];
  if (zikr.currentCount >= zikr.count) return; // already done

  // Delegate to the shared increment logic (updates data + stats + marks done)
  incrementZikrCount(category, index);

  // Auto-advance to next slide on completion with ultra-fluid transition
  if (zikr.currentCount >= zikr.count) {
    // Add completion flash effect to counter button
    const swiperBtn = document.getElementById(
      `slideCounterBtn_${category}_${index}`,
    );
    if (swiperBtn) {
      swiperBtn.classList.add("completion-flash");
      setTimeout(() => swiperBtn.classList.remove("completion-flash"), 600);
    }

    const total = adhkarData[category].adhkar.length;
    if (index < total - 1) {
      // 600ms delay for ultra-fluid auto-advance (was 1500ms)
      setTimeout(() => goToSlide(index + 1), 600);
    }
  }
}

/** Persist which slide the user is on per category (with date for daily reset) */
function saveSwiperPosition(category, index) {
  localStorage.setItem(
    "swiperPos_" + category,
    JSON.stringify({
      index: index,
      date: new Date().toDateString(),
    }),
  );
}

// ── Font-size stepping ──────────────────────────────
const SWIPER_FONT_SIZES = [0.85, 1.05, 1.25, 1.45, 1.7, 2.0]; // rem steps
let swiperFontSizeIndex = 2; // default → 1.25 rem (smaller to avoid header overlap)

// ── Floating settings menu ──────────────────────────
function toggleSwiperSettings() {
  const menu = document.getElementById("swiperFloatingMenu");
  if (!menu) return;
  menu.classList.toggle("hidden");
}

// Close floating menu on outside click
document.addEventListener("click", function (e) {
  const menu = document.getElementById("swiperFloatingMenu");
  const btn = document.getElementById("swiperSettingsBtn");
  if (!menu || menu.classList.contains("hidden")) return;
  if (!menu.contains(e.target) && !btn.contains(e.target)) {
    menu.classList.add("hidden");
  }
});

function adjustSwiperFont(delta) {
  swiperFontSizeIndex = Math.max(
    0,
    Math.min(SWIPER_FONT_SIZES.length - 1, swiperFontSizeIndex + delta),
  );
  applyCurrentSwiperFont();
  localStorage.setItem("swiperFontSizeIndex", swiperFontSizeIndex);
}

function applyCurrentSwiperFont() {
  const size = SWIPER_FONT_SIZES[swiperFontSizeIndex];
  document.querySelectorAll(".slide-zikr-text").forEach((el) => {
    if (el.classList.contains("long-text")) {
      el.style.fontSize = (size * 0.88) + "rem";
    } else {
      el.style.fontSize = size + "rem";
    }
  });
}

function loadSwiperFontSize() {
  const saved = localStorage.getItem("swiperFontSizeIndex");
  if (saved !== null) swiperFontSizeIndex = parseInt(saved, 10);
  applyCurrentSwiperFont();
}

// ═══════════════════════════════════════════════════════

// Save progress to localStorage (date-aware & dirty-checked to avoid redundant writes)
let _lastSavedProgressSnapshot = null;
function saveProgress(force) {
  const payload = JSON.stringify({
    date: new Date().toDateString(),
    data: adhkarData,
  });
  if (!force && payload === _lastSavedProgressSnapshot) return;
  _lastSavedProgressSnapshot = payload;
  try {
    localStorage.setItem("adhkarProgress", payload);
  } catch (_) {
    /* quota/storage fallback */
  }
}

// Load progress from localStorage (starts fresh on a new day)
function loadProgress() {
  const saved = localStorage.getItem("adhkarProgress");
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      const today = new Date().toDateString();
      const savedDate = parsed.date;
      const savedData = parsed.data || parsed;

      // If data is from a previous day, start fresh from the first zekr
      if (savedDate && savedDate !== today) {
        Object.keys(adhkarData).forEach((categoryKey) => {
          adhkarData[categoryKey].adhkar.forEach((zikr) => {
            zikr.currentCount = 0;
          });
          localStorage.removeItem("swiperPos_" + categoryKey);
        });
        saveProgress(true);
        return;
      }

      // Update currentCount for all adhkar if same day
      Object.keys(savedData).forEach((categoryKey) => {
        if (
          adhkarData[categoryKey] &&
          savedData[categoryKey] &&
          savedData[categoryKey].adhkar
        ) {
          savedData[categoryKey].adhkar.forEach((savedZikr, index) => {
            if (adhkarData[categoryKey].adhkar[index]) {
              adhkarData[categoryKey].adhkar[index].currentCount =
                savedZikr.currentCount || 0;
            }
          });
        }
      });
      _lastSavedProgressSnapshot = JSON.stringify({
        date: today,
        data: adhkarData,
      });
    } catch (error) {
      console.error("Error loading progress:", error);
    }
  }
}

// Auto-save progress (only writes when changed and skips background ticks)
setInterval(() => {
  if (!document.hidden) saveProgress();
}, 10000);

// Flush any pending unsaved progress when app is backgrounded or closed
document.addEventListener("visibilitychange", () => {
  if (document.hidden) saveProgress();
});
window.addEventListener("pagehide", () => saveProgress());

