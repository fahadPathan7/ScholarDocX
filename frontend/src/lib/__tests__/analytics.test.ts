import { beforeEach, describe, expect, it } from "vitest";
import {
  isAnalyticsSafeUrl,
  readStoredConsent,
  resetAnalyticsForTests,
  sanitizedLocation,
  setAppAnalyticsConsent,
  storeConsent,
  trackPageView,
} from "../analytics";

function fakeEnv(href: string) {
  const scripts: { src: string; async: boolean }[] = [];
  const win = { location: { href }, dataLayer: undefined as unknown[] | undefined } as any;
  const doc = {
    title: "ScholarDocX",
    createElement: () => ({ src: "", async: false }),
    head: { appendChild: (el: { src: string; async: boolean }) => scripts.push(el) },
  } as any;
  return { win, doc, scripts };
}

const ON = { enabled: true, id: "GTM-TEST" };

describe("analytics URL safety", () => {
  it("never allows URLs that carry a token, ids, or a hash", () => {
    expect(isAnalyticsSafeUrl(new URL("https://app.example/auth-complete?token=secret"))).toBe(false);
    expect(isAnalyticsSafeUrl(new URL("https://app.example/auth-complete"))).toBe(false);
    expect(isAnalyticsSafeUrl(new URL("https://app.example/sheet/fullscreen?projectId=p&pageId=s"))).toBe(false);
    expect(isAnalyticsSafeUrl(new URL("https://app.example/dashboard#access_token=x"))).toBe(false);
  });

  it("allows plain page paths", () => {
    expect(isAnalyticsSafeUrl(new URL("https://app.example/"))).toBe(true);
    expect(isAnalyticsSafeUrl(new URL("https://app.example/dashboard"))).toBe(true);
  });

  it("reports only origin and path", () => {
    expect(sanitizedLocation(new URL("https://app.example/dashboard"))).toBe("https://app.example/dashboard");
  });
});

describe("trackPageView", () => {
  beforeEach(() => resetAnalyticsForTests());

  it("does not load the tag on the OAuth hand-off URL", () => {
    const { win, doc, scripts } = fakeEnv("https://app.example/auth-complete?token=secret");
    trackPageView(win, doc, ON);
    expect(scripts).toHaveLength(0);
    expect(win.dataLayer).toBeUndefined();
  });

  it("loads once on the first safe page and pushes a sanitized page view", () => {
    const { win, doc, scripts } = fakeEnv("https://app.example/");
    trackPageView(win, doc, ON);
    win.location.href = "https://app.example/login";
    trackPageView(win, doc, ON);

    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toBe("https://www.googletagmanager.com/gtm.js?id=GTM-TEST");
    const events = win.dataLayer.filter((e: any) => e && e.event);
    expect(events.map((e: any) => e.event)).toEqual(["gtm.js", "spa_page_view", "spa_page_view"]);
    expect(events[2].page_location).toBe("https://app.example/login");
    expect(JSON.stringify(win.dataLayer)).not.toContain("token");
  });

  it("is off when disabled (development) or without a container id", () => {
    const a = fakeEnv("https://app.example/dashboard");
    trackPageView(a.win, a.doc, { enabled: false, id: "GTM-TEST" });
    const b = fakeEnv("https://app.example/dashboard");
    trackPageView(b.win, b.doc, { enabled: true, id: "" });
    expect(a.scripts.length + b.scripts.length).toBe(0);
  });
});

describe("in-app consent", () => {
  beforeEach(() => resetAnalyticsForTests());

  it("public pages are tracked without asking", () => {
    const { win, doc, scripts } = fakeEnv("https://app.example/register");
    trackPageView(win, doc, ON);
    expect(scripts).toHaveLength(1);
  });

  it("signed-in pages are not tracked until the user allows it", () => {
    const { win, doc, scripts } = fakeEnv("https://app.example/dashboard");
    trackPageView(win, doc, ON);
    expect(scripts).toHaveLength(0);

    setAppAnalyticsConsent("granted", win, doc, ON);
    const views = win.dataLayer.filter((e: any) => e && e.event === "spa_page_view");
    expect(scripts).toHaveLength(1);
    expect(views.map((e: any) => e.page_path)).toEqual(["/dashboard"]);
  });

  it("declining stops analytics storage after a public page loaded the tag", () => {
    const { win, doc } = fakeEnv("https://app.example/");
    trackPageView(win, doc, ON);
    setAppAnalyticsConsent("denied", win, doc, ON);
    win.location.href = "https://app.example/dashboard";
    trackPageView(win, doc, ON);

    const views = win.dataLayer.filter((e: any) => e && e.event === "spa_page_view");
    expect(views.map((e: any) => e.page_path)).toEqual(["/"]);
    const lastConsent = [...win.dataLayer].reverse().find((e: any) => e && e[0] === "consent");
    expect(lastConsent[2]).toEqual({ analytics_storage: "denied" });
  });

  it("asks only once per user, even when browser storage is blocked", () => {
    expect(readStoredConsent("u1")).toBe("unknown");
    storeConsent("u1", "granted");
    expect(readStoredConsent("u1")).toBe("granted");
    expect(readStoredConsent("u2")).toBe("unknown"); // another account asks for itself
  });
});
