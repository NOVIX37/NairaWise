#!/usr/bin/env python3
"""
NairaWise real-browser tests (optional).

  pip install playwright && playwright install chromium     (once)
  python3 tests/browser/browser_test.py

What it does
  * Copies the site into a temporary folder and serves it from a SUB-PATH
    (http://127.0.0.1:PORT/my-test-repo/) to prove it works on a GitHub Pages
    project URL.
  * Freezes the browser clock at 2026-10-12 12:00 UTC so date logic is repeatable.
  * MOCKS the external rate API (api.frankfurter.dev). So this proves how the page
    behaves for good / failing / stale responses. It does NOT prove the real API's
    CORS headers or uptime.
Environment variables: SHOT_DIR (screenshots), AXE_PATH (path to axe.min.js for accessibility checks).
"""
import json, os, shutil, sys, tempfile, threading, functools
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

PROJECT = Path(__file__).resolve().parents[2]
SUB = "my-test-repo"
SHOT_DIR = Path(os.environ.get("SHOT_DIR", tempfile.mkdtemp(prefix="nw-shots-")))
SHOT_DIR.mkdir(parents=True, exist_ok=True)
AXE = os.environ.get("AXE_PATH")

SLUGS = ["index", "how-it-works", "rates-explained", "methodology", "faq", "about", "contact"]
results = []
missing_requests = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + (("  -> " + str(detail)) if (detail and not ok) else ""))


# ---------- static server on a sub-path ----------
tmp = Path(tempfile.mkdtemp(prefix="nw-serve-"))
shutil.copytree(PROJECT, tmp / SUB, ignore=shutil.ignore_patterns(".git", "node_modules", "__pycache__"))


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(tmp), **k)

    def log_message(self, *a):
        pass

    def send_error(self, code, *a, **k):
        if code == 404:
            missing_requests.append(self.path)
        super().send_error(code, *a, **k)


server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
PORT = server.server_address[1]
threading.Thread(target=server.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{PORT}/{SUB}/"

GOOD = {"date": "2026-10-12", "base": "USD", "quote": "NGN", "rate": 1331.596}
SEED_RATE = json.load(open(PROJECT / "data" / "rates.json"))["rate"]


def new_page(browser, mode="ok", viewport=(1280, 800), seed_cache=None, data404=False, stale_date="2026-10-07"):
    ctx = browser.new_context(viewport={"width": viewport[0], "height": viewport[1]})
    ctx.clock.set_fixed_time("2026-10-12T12:00:00Z")
    state = {"mode": mode}

    def frank(route):
        m = state["mode"]
        if m == "ok":
            route.fulfill(status=200, content_type="application/json", headers={"access-control-allow-origin": "*"}, body=json.dumps(GOOD))
        elif m == "stale":
            route.fulfill(status=200, content_type="application/json", headers={"access-control-allow-origin": "*"}, body=json.dumps({**GOOD, "date": stale_date}))
        elif m == "http500":
            route.fulfill(status=500, body="boom")
        elif m == "badjson":
            route.fulfill(status=200, content_type="application/json", headers={"access-control-allow-origin": "*"}, body=json.dumps({**GOOD, "rate": -3}))
        else:
            route.abort()

    ctx.route("https://api.frankfurter.dev/**", frank)
    if data404:
        ctx.route("**/data/rates.json", lambda r: r.fulfill(status=404, body="nope"))
    if seed_cache:
        ctx.add_init_script(
            "if(!localStorage.getItem('nairawise.rate.v1')){localStorage.setItem('nairawise.rate.v1',%s)}" % json.dumps(json.dumps(seed_cache)))
    page = ctx.new_page()
    errors, hosts = [], set()
    page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
    page.on("console", lambda m: errors.append("console: " + m.text) if m.type == "error" else None)
    page.on("request", lambda r: hosts.add(r.url.split("/")[2]) if r.url.startswith("http") else None)
    page.nw_state, page.nw_errors, page.nw_hosts, page.nw_ctx = state, errors, hosts, ctx
    return page


def wait_rate(page):
    page.wait_for_function("() => !document.getElementById('rate-body').hidden || !document.getElementById('rate-unavailable').hidden", timeout=15000)


def txt(page, sel):
    return page.locator(sel).inner_text().strip()


with sync_playwright() as pw:
    browser = pw.chromium.launch()

    # ---- A. success path (English) ----
    p = new_page(browser, "ok")
    p.goto(BASE); wait_rate(p)
    check("A1 English home loads on a sub-path", p.title().startswith("USD to NGN Converter") and p.get_attribute("html", "lang") == "en")
    check("A2 rate value shown with source precision", txt(p, "#rate-value") == "$1 = ₦1,331.596", txt(p, "#rate-value"))
    check("A3 rate date comes from the API response", txt(p, "#rate-date") == "Rate date: 12 October 2026", txt(p, "#rate-date"))
    check("A4 last checked shows real retrieval time in WAT", txt(p, "#rate-checked") == "Last checked: 12 Oct 2026, 13:00 WAT", txt(p, "#rate-checked"))
    check("A5 status badge says freshly retrieved", txt(p, "#rate-status") == "Freshly retrieved", txt(p, "#rate-status"))
    check("A6 no stale warning on a fresh rate", p.locator("#rate-warn").is_hidden())
    check("A7 default $100 converts correctly", txt(p, "#result") == "₦133,159.60", txt(p, "#result"))
    check("A8 selected rate + date shown beside the result", "₦1,331.596" in txt(p, "#result-note") and "12 October 2026" in txt(p, "#result-note"), txt(p, "#result-note"))
    check("A9 official source label mentions CBN", "CBN" in txt(p, "#rate-source"), txt(p, "#rate-source"))
    check("A10 no console errors / page errors on success", not p.nw_errors, p.nw_errors)
    check("A11 only the approved external host is contacted", p.nw_hosts <= {f"127.0.0.1:{PORT}", "api.frankfurter.dev"}, p.nw_hosts)
    check("A12 rate stored in localStorage with source date", json.loads(p.evaluate("localStorage.getItem('nairawise.rate.v1')"))["rateDate"] == "2026-10-12")
    p.screenshot(path=str(SHOT_DIR / "desktop-home-en.png"))

    # ---- B. calculator behaviour ----
    p.fill("#amount", "250")
    check("B1 amount 250 -> ₦332,899.00", txt(p, "#result") == "₦332,899.00", txt(p, "#result"))
    p.fill("#amount", "1,234.56")
    check("B2 commas accepted and separators shown", txt(p, "#result") == "₦1,643,935.16", txt(p, "#result"))
    p.fill("#amount", "abc")
    check("B3 invalid text shows a clear error and no result", txt(p, "#amount-error") == "Use numbers only, for example 100 or 1,250.50." and txt(p, "#result") == "—", txt(p, "#amount-error"))
    check("B4 aria-invalid is set on bad input", p.get_attribute("#amount", "aria-invalid") == "true")
    p.fill("#amount", "")
    p.focus("#amount"); p.evaluate("document.getElementById('amount').blur()")
    check("B5 empty input shows an error", txt(p, "#amount-error") == "Enter an amount.", txt(p, "#amount-error"))
    p.fill("#amount", "-5")
    check("B6 negative input rejected", txt(p, "#amount-error") == "The number cannot be below zero.", txt(p, "#amount-error"))
    p.fill("#amount", "0")
    check("B7 zero rejected", txt(p, "#amount-error") == "The number must be more than zero.", txt(p, "#amount-error"))
    p.fill("#amount", "99999999999999")
    check("B8 oversized amount rejected", txt(p, "#amount-error") == "That number is too large.", txt(p, "#amount-error"))
    p.click("#quick button[data-amount='500']")
    check("B9 quick amount $500 fills the box and converts", p.input_value("#amount") == "500" and txt(p, "#result") == "₦665,798.00", txt(p, "#result"))
    p.fill("#amount", "100")
    p.click("#swap")
    check("B10 swap changes labels and symbol to naira", txt(p, "#amount-label") == "Amount in naira (NGN)" and txt(p, "#amount-sym") == "₦" and p.get_attribute("#swap", "aria-pressed") == "true")
    check("B11 swap carries the answer across and converts back correctly", p.input_value("#amount") == "133,159.6" and txt(p, "#result") == "$100.00", (p.input_value("#amount"), txt(p, "#result")))
    check("B12 quick amounts switch to naira values", "₦10,000" in txt(p, "#quick"), txt(p, "#quick"))
    p.click("button[type=reset]")
    p.wait_for_timeout(50)
    check("B13 reset returns to $100 USD->NGN", p.input_value("#amount") == "100" and txt(p, "#amount-label") == "Amount in US dollars (USD)" and txt(p, "#result") == "₦133,159.60", (p.input_value("#amount"), txt(p, "#result")))
    p.focus("#amount"); p.keyboard.press("Tab")
    check("B14 keyboard: Tab from amount reaches the swap button", p.evaluate("document.activeElement.id") == "swap")
    p.keyboard.press("Enter")
    check("B15 keyboard: Enter on swap switches direction", txt(p, "#amount-label") == "Amount in naira (NGN)")
    p.click("button[type=reset]")

    # ---- C. own / dealer rate ----
    p.check("input[name=ratetype][value=own]")
    check("C1 own-rate box appears and is labelled as not a market rate", p.locator("#own-wrap").is_visible() and "not a market rate" in txt(p, ".tag-own"), txt(p, ".tag-own"))
    check("C2 before a number is typed, no result and a hint is visible", txt(p, "#result") == "—")
    p.fill("#own-rate", "1,500")
    check("C3 own rate 1,500 x $100 = ₦150,000.00", txt(p, "#result") == "₦150,000.00", txt(p, "#result"))
    check("C4 note says own rate, not a market/CBN rate", "own rate" in txt(p, "#result-note") and "not a market or CBN rate" in txt(p, "#result-note"), txt(p, "#result-note"))
    check("C5 official rate panel is not relabelled by own rate", txt(p, "#rate-value") == "$1 = ₦1,331.596")
    p.fill("#own-rate", "abc")
    check("C6 invalid own rate gives an error", txt(p, "#own-error") != "", txt(p, "#own-error"))
    p.check("input[name=ratetype][value=official]")
    check("C7 switching back hides own box and uses the CBN-sourced rate", p.locator("#own-wrap").is_hidden() and "CBN-sourced reference rate" in txt(p, "#result-note"), txt(p, "#result-note"))

    # ---- D. refresh success + offline cache ----
    p.click("#refresh")
    p.wait_for_function("document.getElementById('refresh-msg').textContent.includes('checked just now')")
    check("D1 manual refresh shows a success message", txt(p, "#refresh-msg") == "Rate checked just now.", txt(p, "#refresh-msg"))
    p.nw_state["mode"] = "abort"
    p.nw_ctx.route("**/data/rates.json", lambda r: r.abort())
    p.click("#refresh")
    p.wait_for_function("document.getElementById('refresh-msg').textContent.includes('Unable to refresh')")
    check("D2 failed refresh keeps the last rate on screen and says so", txt(p, "#refresh-msg") == "Unable to refresh. Showing previously saved data." and txt(p, "#rate-value") == "$1 = ₦1,331.596", txt(p, "#refresh-msg"))
    check("D3 cached rate is labelled 'Saved in this browser', not fresh", txt(p, "#rate-status") == "Saved in this browser", txt(p, "#rate-status"))
    check("D4 original retrieval time and rate date are preserved", "13:00 WAT" in txt(p, "#rate-checked") and "12 October 2026" in txt(p, "#rate-date"))
    check("D5 refresh button is usable again after an error", p.is_enabled("#refresh") and txt(p, "#refresh") == "Refresh rate")
    p.nw_ctx.close()

    # ---- E. API failure -> same-origin data file ----
    for mode in ("http500", "abort", "badjson"):
        p = new_page(browser, mode)
        p.goto(BASE); wait_rate(p)
        check(f"E1 [{mode}] falls back to data/rates.json and labels it", txt(p, "#rate-status") == "Saved site data file", txt(p, "#rate-status"))
        check(f"E2 [{mode}] snapshot rate is used for the calculation", txt(p, "#result") == "₦" + f"{SEED_RATE * 100:,.2f}", txt(p, "#result"))
        check(f"E3 [{mode}] page still usable, warns that refresh failed", "Unable to refresh" in txt(p, "#refresh-msg"), txt(p, "#refresh-msg"))
        check(f"E4 [{mode}] snapshot with date-only check says 'Data file checked on'", txt(p, "#rate-checked").startswith("Data file checked on:"), txt(p, "#rate-checked"))
        p.nw_ctx.close()

    # ---- F. stale data warning ----
    p = new_page(browser, "stale")
    p.goto(BASE); wait_rate(p)
    check("F1 5-day-old rate shows a visible stale warning", p.locator("#rate-warn").is_visible() and "5 days old" in txt(p, "#rate-warn"), txt(p, "#rate-warn"))
    check("F2 stale date is the source's date, not today's", txt(p, "#rate-date") == "Rate date: 7 October 2026", txt(p, "#rate-date"))
    p.nw_ctx.close()
    p = new_page(browser, "http500", data404=True, seed_cache={"rate": 1290.5, "rateDate": "2026-10-01", "sourceId": "frankfurter-cbn", "sourceLabel": "Frankfurter", "fetchedAt": "2026-10-01T09:30:00.000Z"})
    p.goto(BASE); wait_rate(p)
    check("F3 old browser cache is labelled saved and stale", txt(p, "#rate-status") == "Saved in this browser" and p.locator("#rate-warn").is_visible() and "11 days old" in txt(p, "#rate-warn"), (txt(p, "#rate-status"), txt(p, "#rate-warn")))
    check("F4 cached retrieval time is the original one (not 'now')", txt(p, "#rate-checked") == "Last checked: 1 Oct 2026, 10:30 WAT", txt(p, "#rate-checked"))
    p.nw_ctx.close()

    # ---- G. nothing available ----
    p = new_page(browser, "abort", data404=True)
    p.goto(BASE); wait_rate(p)
    check("G1 no rate anywhere -> clear unavailable message, no crash", p.locator("#rate-unavailable").is_visible() and "could not get a rate" in txt(p, "#rate-unavailable"), txt(p, "#rate-unavailable"))
    check("G2 result shows a dash and a helpful note", txt(p, "#result") == "—" and "Waiting for the reference rate" in txt(p, "#result-note"), txt(p, "#result-note"))
    p.check("input[name=ratetype][value=own]"); p.fill("#own-rate", "1450")
    check("G3 own rate still works when the API is unavailable", txt(p, "#result") == "₦145,000.00", txt(p, "#result"))
    p.nw_state["mode"] = "ok"; p.nw_ctx.unroute("**/data/rates.json")
    p.click("#refresh"); p.wait_for_function("!document.getElementById('rate-body').hidden")
    check("G4 retry recovers once the source works", txt(p, "#rate-status") == "Freshly retrieved", txt(p, "#rate-status"))
    p.nw_ctx.close()

    # ---- H. Hausa ----
    p = new_page(browser, "ok")
    p.goto(BASE + "ha/"); wait_rate(p)
    check("H1 Hausa home: lang=ha, Hausa title and H1", p.get_attribute("html", "lang") == "ha" and "Canja Dala" in p.title() and "Canja Dala" in txt(p, "h1"), p.title())
    check("H2 rate panel strings are Hausa", txt(p, "#rate-date").startswith("Ranar farashi:") and txt(p, "#rate-checked").startswith("An duba na ƙarshe:") and txt(p, "#rate-status") == "An sauko da shi yanzu", (txt(p, "#rate-date"), txt(p, "#rate-checked")))
    check("H3 same maths as English", txt(p, "#result") == "₦133,159.60", txt(p, "#result"))
    p.fill("#amount", "abc")
    check("H4 Hausa validation message", txt(p, "#amount-error").startswith("Yi amfani da lambobi kawai"), txt(p, "#amount-error"))
    p.fill("#amount", "100"); p.check("input[name=ratetype][value=own]"); p.fill("#own-rate", "1500")
    check("H5 Hausa own-rate wording says it is not a market rate", "ba farashin kasuwa ko na CBN ba ne" in txt(p, "#result-note"), txt(p, "#result-note"))
    check("H6 Hausa page loaded data/assets from ../ without errors", not p.nw_errors, p.nw_errors)
    p.screenshot(path=str(SHOT_DIR / "desktop-home-ha.png"))
    p.nw_ctx.close()

    # ---- I. every page: loads, switches language, no errors, no horizontal scroll ----
    p = new_page(browser, "ok", viewport=(375, 812))
    for lang in ("", "ha/"):
        for slug in SLUGS:
            url = BASE + lang + ("" if slug == "index" else slug + ".html")
            before = len(p.nw_errors)
            r = p.goto(url)
            ok_status = r.status == 200
            overflow = p.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
            check(f"I1 {lang or 'en/'}{slug}: HTTP 200, no horizontal scroll at 375px, no JS errors", ok_status and not overflow and len(p.nw_errors) == before, (r.status, overflow, p.nw_errors[before:]))
            cur = p.locator("a[aria-current=page]").count()
            check(f"I2 {lang or 'en/'}{slug}: active nav state", cur == (1 if slug != "contact" else 0), cur)
            p.click("#nav-toggle") if p.is_visible("#nav-toggle") else None
            link = p.locator("li.lang a")
            href_before = p.url
            link.click()
            p.wait_for_load_state()
            want_lang = "en" if lang == "ha/" else "ha"
            want_url = BASE + ("" if lang == "ha/" else "ha/") + ("" if slug == "index" else slug + ".html")
            check(f"I3 {lang or 'en/'}{slug}: language switch lands on the matching page", p.get_attribute("html", "lang") == want_lang and p.url.rstrip("/") == want_url.rstrip("/") or p.url == want_url + "index.html", p.url)
    p.nw_ctx.close()

    # ---- J. layouts ----
    for name, vp in (("mobile", (375, 812)), ("tablet", (768, 1024)), ("desktop", (1280, 800))):
        p = new_page(browser, "ok", viewport=vp)
        p.goto(BASE); wait_rate(p)
        conv = p.locator("#converter").bounding_box(); panel = p.locator("#rate-panel").bounding_box()
        amount_top = p.locator("#amount").bounding_box()["y"]
        check(f"J1 {name}: amount box is above the fold", amount_top < vp[1], amount_top)
        if vp[0] >= 880:
            check(f"J2 {name}: converter and rate panel sit side by side", panel["x"] > conv["x"] + conv["width"] - 5 and abs(panel["y"] - conv["y"]) < 30, (conv, panel))
        else:
            check(f"J2 {name}: single column, rate panel below converter", panel["y"] > conv["y"] + conv["height"] - 5)
        small = p.evaluate("[...document.querySelectorAll('button, a.btn, .chip, .swap, input:not([type=radio])')].filter(e=>e.offsetParent&&e.getBoundingClientRect().height<40).map(e=>e.tagName+'#'+e.id+'.'+e.className)")
        check(f"J3 {name}: touch targets are at least 40px high", not small, small)
        if name == "mobile":
            check("J4 mobile: menu is collapsed until opened", p.is_visible("#nav-toggle") and p.locator("#site-nav").is_hidden())
            p.click("#nav-toggle")
            check("J5 mobile: menu opens (aria-expanded=true)", p.locator("#site-nav").is_visible() and p.get_attribute("#nav-toggle", "aria-expanded") == "true")
            p.keyboard.press("Escape")
            check("J6 mobile: Escape closes the menu and returns focus", p.locator("#site-nav").is_hidden() and p.evaluate("document.activeElement.id") == "nav-toggle")
        p.screenshot(path=str(SHOT_DIR / f"{name}-home-en.png"), full_page=True)
        p.nw_ctx.close()

    # ---- K. no-JS: essential content is still in the HTML ----
    ctx = browser.new_context(java_script_enabled=False)
    pg = ctx.new_page(); pg.goto(BASE)
    body = pg.inner_text("main")
    check("K1 without JavaScript the guides and explanations are still readable", "How to convert dollars to naira" in body and "Dollar to naira today" in body)
    check("K2 without JavaScript a noscript note explains the converter", "needs JavaScript" in pg.inner_text("#converter"))
    ctx.close()

    # ---- L. accessibility (axe-core) ----
    if AXE and Path(AXE).exists():
        for path in ("", "ha/", "how-it-works.html", "ha/faq.html", "rates-explained.html", "ha/methodology.html"):
            p = new_page(browser, "ok")
            p.goto(BASE + path)
            if path in ("", "ha/"):
                wait_rate(p)
                p.fill("#amount", "abc")  # also audit the error state
            p.add_script_tag(path=AXE)
            res = p.evaluate("axe.run(document, {runOnly:['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice']})")
            bad = [(v["id"], v["impact"], len(v["nodes"])) for v in res["violations"]]
            serious = [b for b in bad if b[1] in ("serious", "critical")]
            check(f"L1 axe {path or 'en/'}: no serious or critical violations", not serious, bad)
            if bad and not serious:
                print("   (minor/moderate axe notes:", bad, ")")
            p.nw_ctx.close()
    else:
        print("SKIP L (accessibility): AXE_PATH not set")

    browser.close()

check("Z1 no missing files (404s) were requested by any page", not missing_requests, missing_requests)

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)} passed, {len(failed)} failed, of {len(results)} checks. Screenshots: {SHOT_DIR}")
(Path(os.environ.get("REPORT_JSON", str(SHOT_DIR / "report.json")))).write_text(json.dumps([{"name": n, "ok": o, "detail": str(d)} for n, o, d in results], indent=1, ensure_ascii=False))
sys.exit(1 if failed else 0)
