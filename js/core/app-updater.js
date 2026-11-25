/* ── Tazkeer App Updater & Service Worker Registration ── */
// Service Worker for offline functionality (optional)
// Capacitor serves the app from a local https://localhost origin where a
// service worker would fight asset updates, so only register it on the web.
const isCapacitorNative =
  typeof window.Capacitor !== "undefined" &&
  typeof window.Capacitor.isNativePlatform === "function" &&
  window.Capacitor.isNativePlatform();

const TAZKEER_APP_VERSION = "2.3.0";
const TAZKEER_APP_VERSION_CODE = 5;
const TAZKEER_REMOTE_VERSION_URL = "https://abdelghany-77.github.io/tazkeer/version.json";
const TAZKEER_FALLBACK_APK_URL = "https://github.com/Abdelghany-77/tazkeer/releases/latest";
const TAZKEER_PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.abdelghany.tazkeer";
let _activeUpdateWorker = null;
let _updateModalShownThisSession = false;
let _lastRemoteUpdateCheckAt = 0;

function compareSemver(a, b) {
  const pa = String(a || "0.0.0").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b || "0.0.0").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

async function openUpdateDownloadLink(url) {
  if (!url) return;
  if (
    isCapacitorNative &&
    window.Capacitor &&
    window.Capacitor.Plugins &&
    window.Capacitor.Plugins.AdhanScheduler &&
    typeof window.Capacitor.Plugins.AdhanScheduler.openExternalUrl === "function"
  ) {
    try {
      await window.Capacitor.Plugins.AdhanScheduler.openExternalUrl({ url });
      return;
    } catch (_) {
      /* fallback below */
    }
  }
  window.location.href = url;
}

function closeAppUpdateModal(syncRouter) {
  const modal = document.getElementById("appUpdateModal");
  if (modal) {
    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
  }
  if (syncRouter !== false && window.AppRouter && window.AppRouter.isModalOpen("appUpdateModal")) {
    window.AppRouter.closeModal("appUpdateModal");
  }
  if (window.TazkeerModalQueue) {
    if (typeof window.TazkeerModalQueue.notifyClosed === "function") {
      window.TazkeerModalQueue.notifyClosed("appUpdateModal");
    } else if (typeof window.TazkeerModalQueue.complete === "function") {
      window.TazkeerModalQueue.complete("appUpdateModal");
    }
  }
}

function showAppUpdateModal(options) {
  const opts = options || {};
  const modal = document.getElementById("appUpdateModal");
  const applyBtn = document.getElementById("appUpdateApplyBtn");
  const dismissBtn = document.getElementById("appUpdateDismissBtn");
  const descEl = document.getElementById("appUpdateModalDesc");
  const versionEl = document.getElementById("appUpdateModalVersion");
  if (!modal || !applyBtn) return;

  if (opts.waitingWorker) {
    _activeUpdateWorker = opts.waitingWorker;
  }
  if (_updateModalShownThisSession && !opts.force) return;
  _updateModalShownThisSession = true;

  const targetUrl = opts.downloadUrl || opts.storeUrl || "";

  const openModalNow = () => {
    if (descEl) {
      descEl.textContent =
        opts.notes ||
        "تتوفر نسخة أحدث من تطبيق ذَكِّرْ تتضمن تحسينات وإصلاحات جديدة. حدّث التطبيق الآن لتبقى دائماً على أحدث إصدار.";
    }
    if (versionEl) {
      if (opts.version) {
        const arVer =
          typeof toArabicDigits === "function"
            ? toArabicDigits(opts.version).replace(/\./g, "٫")
            : opts.version;
        versionEl.textContent = `الإصدار الجديد: ${arVer}`;
        versionEl.classList.remove("hidden");
      } else {
        versionEl.classList.add("hidden");
      }
    }

    applyBtn.disabled = false;
    applyBtn.innerHTML = '<i class="fas fa-download"></i><span>تحديث الآن</span>';
    applyBtn.onclick = () => {
      if (_activeUpdateWorker) {
        applyBtn.disabled = true;
        applyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>جارٍ التحديث...</span>';
        _activeUpdateWorker.postMessage({ type: "SKIP_WAITING" });
        setTimeout(() => {
          window.location.reload();
        }, 2500);
      } else if (targetUrl) {
        openUpdateDownloadLink(targetUrl);
        closeAppUpdateModal();
      } else {
        window.location.reload();
      }
    };

    if (dismissBtn) {
      dismissBtn.onclick = () => closeAppUpdateModal();
    }

    modal.onclick = (e) => {
      if (e.target === modal) closeAppUpdateModal();
    };

    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");

    if (window.AppRouter && !window.AppRouter.isModalOpen("appUpdateModal")) {
      window.AppRouter.pushModal("appUpdateModal", () => closeAppUpdateModal(false));
    }
  };

  if (window.TazkeerModalQueue && typeof window.TazkeerModalQueue.enqueue === "function") {
    window.TazkeerModalQueue.enqueue({
      id: "appUpdateModal",
      delayMs: 300,
      show: openModalNow,
    });
  } else {
    openModalNow();
  }
}

function showSwUpdateBanner(waitingWorker) {
  if (!waitingWorker) return;
  showAppUpdateModal({ waitingWorker });
}

async function getInstalledAppVersionInfo() {
  let installedVersion = TAZKEER_APP_VERSION;
  let installedCode = TAZKEER_APP_VERSION_CODE;
  if (
    isCapacitorNative &&
    window.Capacitor &&
    window.Capacitor.Plugins &&
    window.Capacitor.Plugins.App &&
    typeof window.Capacitor.Plugins.App.getInfo === "function"
  ) {
    try {
      const info = await window.Capacitor.Plugins.App.getInfo();
      if (info && info.version) installedVersion = String(info.version);
      if (info && info.build) {
        const parsedCode = parseInt(info.build, 10);
        if (!Number.isNaN(parsedCode) && parsedCode > 0) installedCode = parsedCode;
      }
    } catch (_) {
      /* keep bundled constants */
    }
  }
  return { version: installedVersion, versionCode: installedCode };
}

async function checkRemoteAppVersionUpdate(force) {
  if (!navigator.onLine) return;
  const now = Date.now();
  if (!force && now - _lastRemoteUpdateCheckAt < 6 * 60 * 60 * 1000) return;
  _lastRemoteUpdateCheckAt = now;

  const baseManifestUrl =
    window.TAZKEER_UPDATE_MANIFEST_URL ||
    (isCapacitorNative ? TAZKEER_REMOTE_VERSION_URL : "./version.json");
  const separator = baseManifestUrl.includes("?") ? "&" : "?";
  const manifestUrl = `${baseManifestUrl}${separator}_t=${now}`;

  try {
    const res = await fetch(manifestUrl, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    if (!data) return;

    const current = await getInstalledAppVersionInfo();
    const remoteVersion = data.version ? String(data.version) : "";
    const remoteCode = Number(data.versionCode) || 0;
    const isNewerBySemver = remoteVersion && compareSemver(remoteVersion, current.version) > 0;
    const isNewerByCode = remoteCode > 0 && remoteCode > current.versionCode;

    if (isNewerBySemver || isNewerByCode) {
      const downloadUrl = data.preferStore
        ? data.storeUrl || TAZKEER_PLAY_STORE_URL
        : data.apkUrl || data.storeUrl || TAZKEER_FALLBACK_APK_URL;
      showAppUpdateModal({
        version: remoteVersion || current.version,
        notes: data.notes,
        downloadUrl,
        storeUrl: data.storeUrl || TAZKEER_PLAY_STORE_URL,
      });
    }
  } catch (_) {
    /* non-fatal offline or CORS */
  }
}

window.showAppUpdateModal = showAppUpdateModal;
window.closeAppUpdateModal = closeAppUpdateModal;
window.showSwUpdateBanner = showSwUpdateBanner;
window.checkRemoteAppVersionUpdate = checkRemoteAppVersionUpdate;

if ("serviceWorker" in navigator) {
  if (isCapacitorNative) {
    // Upgrading from a build that registered a service worker? Remove it so
    // the WebView always loads the assets bundled with the current APK.
    // CacheStorage is intentionally left untouched (Quran page downloads).
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      })
      .catch(() => {
        /* non-fatal */
      });
    window.addEventListener("load", () => {
      setTimeout(() => checkRemoteAppVersionUpdate(true), 3500);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        checkRemoteAppVersionUpdate(false);
      }
    });
  } else {
    let swRefreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (swRefreshing) return;
      swRefreshing = true;
      window.location.reload();
    });

    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("./sw.js")
        .then((registration) => {
          if (registration.waiting) {
            showAppUpdateModal({ waitingWorker: registration.waiting });
          }
          registration.addEventListener("updatefound", () => {
            const installing = registration.installing;
            if (!installing) return;
            installing.addEventListener("statechange", () => {
              if (
                installing.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                showAppUpdateModal({
                  waitingWorker: registration.waiting || installing,
                });
              }
            });
          });

          const checkUpdate = () => {
            registration.update().catch(() => {});
          };
          document.addEventListener("visibilitychange", () => {
            if (!document.hidden) checkUpdate();
          });
          setInterval(checkUpdate, 30 * 60 * 1000);
        })
        .catch((registrationError) => {
          console.error(
            "Service worker registration failed:",
            registrationError,
          );
        });
    });
  }
}
