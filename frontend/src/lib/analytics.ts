/* ------------------------------------------------------------------ */
/*  Google Analytics via Google Tag Manager (SCHOLARDOCX-0257)         */
/*                                                                     */
/*  Owner-approved scope: public pages (/, /login, /register) are      */
/*  tracked without a prompt; pages inside the signed-in app are       */
/*  tracked only after the user allows it (AnalyticsConsentBanner).    */
/*  GA4 itself is configured inside the GTM container.                 */
/*                                                                     */
/*  Privacy rule: GTM/GA record the page URL. Some URLs here carry     */
/*  secrets or ids — Google sign-in lands on /auth-complete?token=…,   */
/*  the full-screen sheet opens /sheet/fullscreen?projectId=…. So GTM  */
/*  is only ever loaded on a URL with no query string, no hash, and    */
/*  not under /auth-complete, and every page view we push carries a    */
/*  sanitized location (origin + path, nothing else).                  */
/* ------------------------------------------------------------------ */

type DataLayerWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};

/** Empty VITE_GTM_ID disables analytics; unset uses the production container. */
export const GTM_ID: string = (import.meta.env.VITE_GTM_ID ?? "GTM-P5SJXF45").trim();

const BLOCKED_PATH_PREFIXES = ["/auth-complete"];
/** Pages a signed-out visitor sees. Everything else is the signed-in app. */
const PUBLIC_PATHS = new Set(["/", "/login", "/register"]);

export type AppConsent = "granted" | "denied" | "unknown";
let appConsent: AppConsent = "unknown";

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname.replace(/\/+$/, "") || "/");
}

/** True when this URL may be seen by analytics (no query, no hash, not a token route). */
export function isAnalyticsSafeUrl(url: URL): boolean {
  if (url.search || url.hash) return false;
  return !BLOCKED_PATH_PREFIXES.some(
    (prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`),
  );
}

/** The only location analytics is told about: origin + path. */
export function sanitizedLocation(url: URL): string {
  return `${url.origin}${url.pathname}`;
}

let loaded = false;

function loadTagManager(win: DataLayerWindow, doc: Document, id: string): void {
  win.dataLayer = win.dataLayer || [];
  // Same shape as the snippet Google provides…
  win.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    win.dataLayer!.push(arguments);
  };
  // Consent Mode: analytics allowed by default (public pages), advertising
  // never. Entering the app without the user's consent switches it off.
  win.gtag("consent", "default", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  win.gtag("js", new Date());
  // …plus the start event the standard GTM loader pushes; without it the
  // container's page-load triggers never fire.
  win.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });

  const script = doc.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`;
  doc.head.appendChild(script);
}

/**
 * Call on every route change. Loads GTM lazily on the first safe URL and
 * records a sanitized page view; does nothing on unsafe URLs, in development,
 * or when no container id is configured.
 */
export function trackPageView(
  win: DataLayerWindow = window,
  doc: Document = document,
  options: { enabled?: boolean; id?: string } = {},
): void {
  const enabled = options.enabled ?? import.meta.env.PROD;
  const id = options.id ?? GTM_ID;
  if (!enabled || !id) return;

  const url = new URL(win.location.href);
  if (!isAnalyticsSafeUrl(url)) return;

  const publicPage = isPublicPath(url.pathname);
  if (!publicPage && appConsent !== "granted") {
    // Signed-in page without consent: never load the tag here, and if it was
    // loaded on a public page, tell it to stop storing analytics.
    if (loaded) win.gtag?.("consent", "update", { analytics_storage: "denied" });
    return;
  }

  if (!loaded) {
    loadTagManager(win, doc, id);
    loaded = true;
  }
  win.gtag?.("consent", "update", { analytics_storage: "granted" });
  win.dataLayer!.push({
    event: "spa_page_view",
    page_location: sanitizedLocation(url),
    page_path: url.pathname,
    page_title: doc.title,
  });
}

let installed = false;
let lastTrackedPath = "";

/**
 * Track the initial page and every later navigation. Hooks the History API
 * itself because the signed-in app switches tabs with history.pushState
 * directly (not through React Router), and React Router uses it too.
 */
export function installPageViewTracking(win: DataLayerWindow = window): void {
  if (installed) return;
  installed = true;

  const report = () => {
    const path = win.location.pathname + win.location.search + win.location.hash;
    if (path === lastTrackedPath) return; // replaceState to the same URL, re-renders
    lastTrackedPath = path;
    trackPageView(win);
  };

  for (const method of ["pushState", "replaceState"] as const) {
    const original = win.history[method].bind(win.history);
    win.history[method] = (...args: Parameters<History["pushState"]>) => {
      original(...args);
      report();
    };
  }
  win.addEventListener("popstate", report);
  report();
}

/* ---------------- in-app consent (signed-in users only) ---------------- */

const consentKey = (userId: string) => `scholardocx_analytics_consent_${userId}`;

// Fallback for browsers that block storage, so the prompt still appears only
// once per session there instead of on every page load.
const memoryConsent = new Map<string, "granted" | "denied">();

/** The user's saved choice. Asked once: after that this is never "unknown". */
export function readStoredConsent(userId: string): AppConsent {
  const remembered = memoryConsent.get(userId);
  if (remembered) return remembered;
  try {
    const value = window.localStorage.getItem(consentKey(userId));
    return value === "granted" || value === "denied" ? value : "unknown";
  } catch {
    return "unknown";
  }
}

export function storeConsent(userId: string, value: "granted" | "denied"): void {
  memoryConsent.set(userId, value);
  try {
    window.localStorage.setItem(consentKey(userId), value);
  } catch {
    /* private mode / blocked storage: the choice lasts for this page only */
  }
}

/** Apply the signed-in user's choice; on "granted" the current page is tracked now. */
export function setAppAnalyticsConsent(
  value: AppConsent,
  win: DataLayerWindow = window,
  doc: Document = document,
  options: { enabled?: boolean; id?: string } = {},
): void {
  appConsent = value;
  if (value === "granted") {
    trackPageView(win, doc, options);
  } else if (loaded && !isPublicPath(new URL(win.location.href).pathname)) {
    win.gtag?.("consent", "update", { analytics_storage: "denied" });
  }
}

/** Test hook: forget that GTM was loaded and any consent. */
export function resetAnalyticsForTests(): void {
  loaded = false;
  lastTrackedPath = "";
  appConsent = "unknown";
  memoryConsent.clear();
}
