(() => {
  const PLATFORM_VERSION = "20260620f";
  const APP_SRC = "/app.js";
  const CSS_SRC = "/platform.css";
  const RELEASE_TIMEOUT_MS = 2500;

  const root = document.documentElement;
  let releaseTimeout = null;
  let released = false;

  function sameOrigin(url) {
    try {
      return new URL(url, window.location.href).origin === window.location.origin;
    } catch {
      return false;
    }
  }

  function setBootStyles() {
    if (document.getElementById("qoc-route-boot-styles")) return;
    const style = document.createElement("style");
    style.id = "qoc-route-boot-styles";
    style.textContent = `
      html.qoc-route-transition {
        cursor: wait;
      }

      html.qoc-booting,
      html.qoc-route-transition {
        background: #151816;
      }

      html.qoc-booting body {
        opacity: 0;
      }

      html.qoc-route-transition::before {
        content: "";
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        background: radial-gradient(circle at 18% 0%, rgba(0, 189, 200, 0.16), transparent 28%),
          radial-gradient(circle at 86% 4%, rgba(255, 196, 37, 0.12), transparent 24%),
          #151816;
      }

      html.qoc-route-transition body {
        pointer-events: none;
      }
    `;
    document.head.append(style);
  }

  function maskTransition() {
    root.classList.add("qoc-route-transition");
  }

  function releaseTransition() {
    if (released) return;
    released = true;
    root.classList.remove("qoc-route-transition", "qoc-booting");
  }

  function onLinkClick(event) {
    const link = event.target.closest("a.brand-mark, a.site-logo-link, .site-nav a[href]");
    if (!link || !(link instanceof HTMLAnchorElement)) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (!sameOrigin(link.href)) return;
    if (link.getAttribute("target") === "_blank") return;

    event.preventDefault();
    const next = new URL(link.href, window.location.href).toString();
    if (next === window.location.href) return;

    maskTransition();
    window.location.assign(next);
  }

  function loadStylesheet() {
    const existing = document.querySelector("link[rel='stylesheet'][href*='/platform.css']");
    if (existing) {
      return existing.sheet ? Promise.resolve(existing) : new Promise((resolve) => {
        existing.addEventListener("load", () => resolve(existing), { once: true });
        existing.addEventListener("error", () => resolve(existing), { once: true });
      });
    }

    return new Promise((resolve) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = `${CSS_SRC}?v=${PLATFORM_VERSION}`;
      link.addEventListener("load", () => resolve(link), { once: true });
      link.addEventListener("error", () => resolve(link), { once: true });
      document.head.append(link);
    });
  }

  function loadApp() {
    if (document.querySelector("script[data-qoc-platform-app]")) return;

    const script = document.createElement("script");
    script.src = `${APP_SRC}?v=${PLATFORM_VERSION}`;
    script.defer = true;
    script.dataset.qocPlatformApp = "true";
    script.addEventListener("error", () => {
      window.qocReleaseBootShield?.();
    }, { once: true });
    document.body.append(script);
  }

  function initApp() {
    Promise.resolve(loadStylesheet()).then(() => {
      loadApp();
    });
  }

  function onPersistedShow(event) {
    if (!event.persisted) return;
    maskTransition();
    window.location.reload();
  }

  function run() {
    setBootStyles();

    window.__qocPlatform = Object.freeze({
      version: PLATFORM_VERSION,
      appUrl: `${APP_SRC}?v=${PLATFORM_VERSION}`,
      cssUrl: `${CSS_SRC}?v=${PLATFORM_VERSION}`
    });

    window.qocReleaseBootShield = () => {
      clearTimeout(releaseTimeout);
      releaseTransition();
    };

    releaseTimeout = setTimeout(() => {
      window.qocReleaseBootShield();
    }, RELEASE_TIMEOUT_MS);

    document.addEventListener("click", onLinkClick, true);
    window.addEventListener("beforeunload", maskTransition);
    window.addEventListener("pagehide", maskTransition);
    window.addEventListener("pageshow", onPersistedShow);

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initApp, { once: true });
    } else {
      initApp();
    }
  }

  run();
})();
