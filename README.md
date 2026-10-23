# NairaWise

A free, zero-budget **USD ↔ NGN converter** in **English** (default) and **Hausa**, built with plain HTML, CSS and JavaScript and hosted on GitHub Pages. It shows a **CBN-sourced reference rate** with its real rate date, and lets users type in a **dealer's own rate**.

> Deployed site: [https://novix37.github.io/NairaWise/](https://novix37.github.io/NairaWise/). If you reuse this project at another address, replace the site URL placeholders before publishing.

---

## 1. Project overview

| | |
|---|---|
| Purpose | Help Nigerians convert dollars to naira and understand the difference between reference and dealer rates |
| Languages | English (`/`) and Hausa (`/ha/`) |
| Tech | HTML, CSS, vanilla JavaScript, public API, GitHub Actions, GitHub Pages |
| Cost | ₦0: no paid hosting, no paid API, no secret keys |

## 2. Folder structure

```
Repository root/
├── index.html                  English home page + converter (default landing page)
├── how-it-works.html           English guide pages
├── rates-explained.html
├── methodology.html            data sources and methodology
├── faq.html
├── about.html
├── contact.html                feedback (links to GitHub Issues)
├── 404.html                    "page not found" (uses absolute URLs, see Troubleshooting)
├── ha/                         Hausa version: same file names as the English pages
│   ├── index.html  how-it-works.html  rates-explained.html  methodology.html
│   └── faq.html  about.html  contact.html
├── assets/
│   ├── css/styles.css          one small stylesheet, mobile-first, no web fonts
│   ├── js/calc.js              maths, validation, number formatting
│   ├── js/rates.js             rate retrieval, validation, cache, stale detection
│   ├── js/converter.js         converter user interface (shared by both languages)
│   ├── js/site.js              mobile menu
│   └── images/                 favicon.svg, apple-touch-icon.png, nairawise-social-preview.png
├── data/rates.json             saved copy of the rate (refreshed by GitHub Actions)
├── tools/
│   ├── update-rates.js         downloads + validates the rate, writes data/rates.json
│   └── set-site-url.js         replaces YOUR-USERNAME/YOUR-REPO with your real address
├── tests/unit/                 automated tests (calculator, rate logic, site checks)
├── tests/browser/              optional real-browser tests (Python + Playwright)
├── .github/workflows/deploy-pages.yml
├── .github/workflows/update-rates.yml
├── robots.txt   sitemap.xml   README.md
```

Final page addresses (after you set your address):

| Page | English | Hausa |
|---|---|---|
| Home / converter | `https://novix37.github.io/NairaWise/` | `https://novix37.github.io/NairaWise/ha/` |
| How it works | `https://novix37.github.io/NairaWise/how-it-works.html` | `https://novix37.github.io/NairaWise/ha/how-it-works.html` |
| Rates explained | `https://novix37.github.io/NairaWise/rates-explained.html` | `https://novix37.github.io/NairaWise/ha/rates-explained.html` |
| Data sources | `https://novix37.github.io/NairaWise/methodology.html` | `https://novix37.github.io/NairaWise/ha/methodology.html` |
| FAQ | `https://novix37.github.io/NairaWise/faq.html` | `https://novix37.github.io/NairaWise/ha/faq.html` |
| About | `https://novix37.github.io/NairaWise/about.html` | `https://novix37.github.io/NairaWise/ha/about.html` |
| Feedback | `https://novix37.github.io/NairaWise/contact.html` | `https://novix37.github.io/NairaWise/ha/contact.html` |

## 3. Main features

- Converter with USD→NGN and NGN→USD (⇄ button), quick amounts, thousand separators, input validation, reset, keyboard access.
- **Official/reference rate** retrieved automatically, shown with *rate date*, *source*, *last checked (WAT)* and a status badge (freshly retrieved / saved site data file / saved in this browser).
- **Stale-data warning** when the rate date is more than 3 calendar days old.
- **"My own rate"**: the user types the rate their dealer quotes. Clearly labelled as user-entered, never as a market or CBN rate.
- Loading skeleton, offline message, error and success messages, manual **Refresh rate** button.
- English default, complete Hausa translation, reciprocal `hreflang`, language switch to the matching page.
- SEO: unique titles/descriptions, canonical URLs, Open Graph, JSON-LD (`WebSite`/`WebPage` only), `sitemap.xml`, `robots.txt`, helpful content pages that work without JavaScript.
- No trackers, no ads, no accounts, no third-party scripts or fonts.

## 4. Rate providers and their limitations

Checked on **12 October 2026** with the tools available in the build environment. "Not verified" means exactly that, so please read it.

### Used: Frankfurter, CBN provider (primary, and the only direct browser source)

`https://api.frankfurter.dev/v2/providers/cbn/rate/usd/ngn`

| Check | Result |
|---|---|
| Reachable | **Yes.** The page-fetch tool returned `{"date":"2026-10-12","base":"USD","quote":"NGN","rate":1331.596}` |
| JSON shape matches `parseFrankfurter()` | **Yes** (`date`, `base`, `quote`, `rate`) |
| Stated source | Frankfurter lists the provider as "Central Bank of Nigeria", rate type "Official exchange rate", coverage 2001–present |
| Is it the NFEM rate? | **Not established.** Frankfurter does not say so, so NairaWise never uses the label "NFEM" |
| Update frequency | Not stated by Frankfurter for this provider. The CBN series is understood to change on business days; the site never claims more |
| Key / limits | No key. "No quotas", but requests are rate-limited to prevent abuse |
| Browser CORS | **Not verified.** The build environment could not make a cross-origin browser request, and the docs do not mention CORS. The site is built to cope (see section 5) |
| Terms | Frankfurter says rates "fall under each provider's terms" and commercial use is allowed. The CBN-specific licence page **could not be loaded** (server error). **Please read https://frankfurter.dev/license yourself** before you launch |
| Attribution | Shown in the footer and on the data-sources page: "Central Bank of Nigeria via Frankfurter" |

### Not used: AllRatesToday open endpoint (the report's "backup")

The endpoint is reachable and appeared to return CBN data, **but its Terms of Service (section 3.3) say the keyless official-rate endpoint may not be used for a "public display", and websites count**; that needs a paid plan. A public GitHub Pages site would break those terms, so it was **removed from the code**. A test (`site.test.js`) fails if it is ever added back without review.

### Parallel-market rate: **not automated**

| Provider | Finding |
|---|---|
| Monierate | Pay-as-you-go ($0.01 per request); the $10 is only a signup credit, not a free plan. Needs a secret API key. Terms of use could not be read (robots-blocked). Not usable in browser code |
| Aboki Forex | Paid plans from ₦70,000/month, API key required |
| Others found (an SDK needing a key; a site whose rates are "calculated from user comments" with no reuse terms) | Not suitable |

No free, permitted, reliable source was verified, so NairaWise **does not show a parallel-market rate**, does not scrape, and does not substitute another rate. Users use **"My own rate"**. If you later get written permission or a paid plan, add it as a separate provider with its own date and warnings, and keep any secret key in a serverless function, never in the browser.

## 5. How the API integration works

`assets/js/rates.js` → `getRate()`, in this order:

1. **Frankfurter** (direct, 8-second timeout).
2. **`data/rates.json`** (same-origin file, no CORS problem), refreshed by GitHub Actions.
3. **Last valid rate saved in this browser** (`localStorage`, key `nairawise.rate.v1`; only rate, date, source and time).
4. **Unavailable state** with a retry button; "My own rate" always works.

Rules enforced in code (and covered by tests):

- HTTP status, JSON structure, pair (`USD`→`NGN`), finite positive rate, real calendar date, and a source date no later than the current West Africa Time (WAT) calendar day. There is no one-day future grace period: a next-day rate cannot be verified yet and is rejected.
- The **rate date is the one the source returned**, never today's date. "Last checked" is the real download time in WAT, or an honest "not known".
- Saved copies are labelled as saved and are never shown as freshly retrieved.
- A failed or invalid response never overwrites a good saved rate.
- Duplicate simultaneous requests share one call. No cookies are sent.
- Stale if older than `STALE_AFTER_DAYS` (3) calendar days. Weekends and holidays can trigger this warning; the message says so.

**GitHub Actions** (`.github/workflows/update-rates.yml`)

- Runs the unit tests, then `node tools/update-rates.js`, then commits `data/rates.json` only if valid.
- Permissions: `contents: write` only. No secrets are used.
- Schedule: 06:15 and 15:45 UTC daily (07:15 and 16:45 Nigerian time). Manual: **Actions → Update exchange rate → Run workflow**.
- Failure: the job fails, the old file is kept, GitHub emails the repo owner. A new rate that differs by more than 25% from the previous one is rejected for manual review.
- GitHub pauses scheduled workflows in public repos after 60 days without repository activity; if so, press **Enable workflow**.

## 6. Run the site locally

You need only a browser. From the project root (the directory containing `index.html`), opening `index.html` by double-click shows the pages, but the browser blocks the data file, so use a tiny local server:

```bash
python3 -m http.server 8000      # then open http://localhost:8000/
```

Run the automated tests (Node 18 or newer, no installs needed):

```bash
node --test tests/unit/*.test.js
```

## 7. Deploy with GitHub Pages

1. Create a free GitHub account and a **public** repository, for example `NairaWise`.
2. Put the project files (`index.html`, `ha/`, `assets/`, `data/`, `.github/`, and the other root files) at the repository root on the `main` branch. The Pages workflow packages this repository root and deploys it with GitHub Actions. Using Git: `git init`, `git add .`, `git commit -m "First version"`, `git remote add origin ...`, `git push -u origin main`.
3. Put your real address into the pages. Either run (needs Node):
   ```bash
   node tools/set-site-url.js https://YOUR-USERNAME.github.io/YOUR-REPO/ https://github.com/YOUR-USERNAME/YOUR-REPO
   ```
   (use your real names), or search-and-replace `https://YOUR-USERNAME.github.io/YOUR-REPO/` and `https://github.com/YOUR-USERNAME/YOUR-REPO` in all files. Commit and push again. This fixes canonical links, `hreflang`, social tags, `sitemap.xml`, `robots.txt`, the 404 page and the feedback link.
4. **Settings → Pages → Build and deployment → Source: GitHub Actions.** The `deploy-pages.yml` workflow uploads the repository root on pushes to `main`, after a successful rate update, and when run manually. Wait for the workflow to finish; your site address appears in the deployment environment.
5. **Settings → Actions → General → Workflow permissions:** choose "Read and write permissions" if your account or organisation restricts the default. Then run the workflow once manually (Actions tab).
6. Submit `https://novix37.github.io/NairaWise/sitemap.xml` in Google Search Console if you want, and follow the data-source terms check in section 4.

Because every internal link and asset path is **relative**, the site works under `/YOUR-REPO/` and also at the root of a custom domain.

## 8. Update or maintain the rate sources

- **Change the freshness limit:** `STALE_AFTER_DAYS` in `assets/js/rates.js` (and the "3 days" wording in the pages).
- **Add a provider:** read its terms for public websites first. Write a `parseXxx(json)` like `parseFrankfurter`, add it to `NETWORK_SOURCES`, add tests, and update `methodology.html` and `ha/methodology.html`.
- **Change the schedule:** edit the `cron` lines in the workflow file.
- **Change an endpoint:** edit `PRIMARY.url` in `rates.js`; `tools/update-rates.js` reuses it.

## 9. How English and Hausa are organised

- English pages are in the project root; Hausa pages are in `ha/` with the **same file names**, so the language switch always leads to the matching page.
- Each page is a complete, separately written document (not machine-translated overlays). All calculator messages live in a JSON block (`<script id="nw-i18n">`) inside each home page, so `converter.js` is shared.
- To add a page: copy a page in both folders, edit the text, add it to the navigation list in every page, and add it to `sitemap.xml`.
- **Hausa wording was written by an AI assistant and should be reviewed by a native reader** before launch. Feedback is welcome via GitHub Issues.

## 10. Troubleshooting

| Problem | What to check |
|---|---|
| Rate says "Saved site data file" or "Saved in this browser" | The direct call failed (offline, rate limit, or **CORS**). Open the browser console (F12). If you see "blocked by CORS policy", the site is working as designed by using `data/rates.json`; make sure the Action runs |
| "We could not get a rate" | No network, no `data/rates.json` and no saved copy. Press Refresh rate; check the file exists |
| Stale warning | Rate date is over 3 days old: weekend/holiday, source delay, or the Action stopped (check Actions tab; re-enable if paused) |
| Styles or scripts missing | Files must be uploaded with folder structure intact. Do not change relative paths to start with `/` |
| `data/rates.json` not updating on the live site | Check the rate-update and Pages deployment runs in Actions; a successful rate update triggers a Pages redeploy. |
| 404 page looks unstyled | `404.html` uses absolute addresses; run `set-site-url.js` (step 3) |
| Search engines show placeholder addresses | You skipped step 3 of deployment |

## 11. Third-party attribution and usage

- Exchange-rate data: **Central Bank of Nigeria**, accessed through **Frankfurter** (https://frankfurter.dev/). Subject to the providers' terms (see section 4). NairaWise is not affiliated with or endorsed by either.
- No other third-party code, fonts, analytics or images are used.

## 12. Known limitations and future improvements

- Parallel-market rate is manual only (see section 4).
- Direct browser access to Frankfurter (CORS) is unverified; the data file is the safety net.
- The reference rate is not confirmed to be the NFEM rate and is not a dealer offer.
- Header, footer and navigation are repeated in every HTML file; edit all pages when changing them.
- A rate is shown only for USD↔NGN. Possible next steps: history chart from `data/` snapshots, more currencies, a serverless proxy if you obtain a licensed parallel-market API, a Hausa review by a native speaker.
- Not financial advice. Information only.
