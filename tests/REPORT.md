# Test report (12 October 2026)

Run in the build environment. The external rate API was **mocked** in browser tests; the real endpoint was only fetched once with a page-fetch tool (not from a browser).

| Area | Result | How |
|---|---|---|
| Expected files exist | PASSED | `node --test` (site.test.js) |
| English and Hausa pages load (14 pages, HTTP 200) | PASSED | browser test, served from sub-path `/my-test-repo/` |
| Language switching leads to the matching page | PASSED | browser + static tests |
| Navigation, active state, internal links, assets | PASSED | static + browser (no 404 requests) |
| Converter maths, rounding, formatting | PASSED | 8 unit tests + browser checks |
| Invalid / empty / negative / zero / oversized input | PASSED | unit + browser (EN and HA messages) |
| Selected rate source and date shown near result | PASSED | browser |
| Rate date taken from the source response | PASSED | unit + browser (date 7 Oct shown, not today) |
| Stale-data warning (>3 days) | PASSED | unit + browser |
| API failure (HTTP 500, network error, invalid data) does not break page | PASSED | browser (mocked) |
| Cached / snapshot values labelled correctly, original time kept | PASSED | unit + browser |
| Dealer-rate input labelled as user-provided | PASSED | browser |
| Mobile 375px / tablet 768px / desktop 1280px layouts | PASSED | browser, no horizontal scroll, screenshots reviewed |
| SEO: titles, descriptions, canonical, hreflang, sitemap, robots, JSON-LD | PASSED | static tests |
| Works on a GitHub Pages sub-path | PASSED | simulated with local server sub-path |
| No secrets in files | PASSED | static scan |
| No console errors on normal use | PASSED | browser |
| Accessibility (axe-core, 6 pages incl. error state) | PASSED | no serious/critical issues. Not a replacement for screen-reader testing |
| Works without JavaScript (guides readable) | PASSED | browser with JS off |
| **Real API reachable and correct format** | PASSED (once) | fetch tool, 12 Oct 2026 |
| **Real API CORS from a browser** | **NOT TESTED** | no outside network from the sandbox |
| **Frankfurter CBN-specific licence terms** | **NOT VERIFIED** | licence page failed to load |
| **GitHub Actions workflow run** | **NOT TESTED** | needs a real GitHub repository |
| **Pages rebuild after the bot commit** | **NOT TESTED** | needs a real GitHub repository |
| **Core Web Vitals / Lighthouse** | **NOT TESTED** | not available; page is ~15 KB HTML, 1 CSS, 3 small JS files, no fonts |
| **Hausa wording quality** | **NOT TESTED** | needs a native reader |
| Real devices / Safari / Firefox | **NOT TESTED** | only Chromium |
