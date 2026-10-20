"use strict";
/* Static checks on the finished website files. Needs no browser and no network. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const exists = (p) => fs.existsSync(path.join(ROOT, p));

const SLUGS = ["index", "how-it-works", "rates-explained", "methodology", "faq", "about", "contact"];
const PAGES = [];
for (const s of SLUGS) { PAGES.push({ lang: "en", slug: s, file: s + ".html" }); PAGES.push({ lang: "ha", slug: s, file: "ha/" + s + ".html" }); }

const REQUIRED = [
  "index.html", "ha/index.html", "404.html", "robots.txt", "sitemap.xml", "README.md", ".nojekyll",
  "assets/css/styles.css", "assets/js/calc.js", "assets/js/rates.js", "assets/js/converter.js", "assets/js/site.js",
  "assets/images/favicon.svg", "assets/images/apple-touch-icon.png", "assets/images/nairawise-social-preview.png",
  "data/rates.json", "tools/update-rates.js", "tools/set-site-url.js", ".github/workflows/update-rates.yml"
].concat(PAGES.map((p) => p.file));

test("all expected files exist", () => {
  for (const f of REQUIRED) assert.ok(exists(f), "missing " + f);
});

const metaContent = (html, re) => { const m = html.match(re); return m ? m[1] : null; };

test("every page: lang attribute, one h1, unique title and description, no noindex", () => {
  const titles = new Set(), descs = new Set();
  for (const p of PAGES) {
    const html = read(p.file);
    assert.match(html, new RegExp(`<html lang="${p.lang}">`), p.file + " lang");
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, p.file + " must have exactly one h1");
    const title = metaContent(html, /<title>([^<]+)<\/title>/);
    const desc = metaContent(html, /<meta name="description" content="([^"]+)"/);
    assert.ok(title && desc, p.file + " needs title and description");
    assert.ok(!titles.has(title), "duplicate title " + title); titles.add(title);
    assert.ok(!descs.has(desc), "duplicate description " + desc); descs.add(desc);
    assert.ok(title.length <= 80, p.file + " title too long: " + title.length);
    assert.ok(desc.length >= 60 && desc.length <= 190, p.file + " description length " + desc.length);
    assert.ok(!/noindex/i.test(html), p.file + " must not be noindex");
  }
});

test("canonical + reciprocal hreflang (en, ha, x-default) on every page", () => {
  for (const p of PAGES) {
    const html = read(p.file);
    const canon = metaContent(html, /<link rel="canonical" href="([^"]+)"/);
    const en = metaContent(html, /hreflang="en" href="([^"]+)"/);
    const ha = metaContent(html, /hreflang="ha" href="([^"]+)"/);
    const xd = metaContent(html, /hreflang="x-default" href="([^"]+)"/);
    assert.ok(canon && en && ha && xd, p.file + " missing canonical/hreflang");
    assert.equal(xd, en, p.file + " x-default should be the English page");
    assert.equal(canon, p.lang === "en" ? en : ha, p.file + " canonical must be its own language URL");
    // Reciprocity: the other language page must point back to the same pair.
    const twin = PAGES.find((q) => q.slug === p.slug && q.lang !== p.lang);
    const th = read(twin.file);
    assert.equal(metaContent(th, /hreflang="en" href="([^"]+)"/), en);
    assert.equal(metaContent(th, /hreflang="ha" href="([^"]+)"/), ha);
  }
});

test("language switch link points to the matching page that exists", () => {
  for (const p of PAGES) {
    const html = read(p.file);
    const m = html.match(/<li class="lang"><a href="([^"]+)" hreflang="(\w+)"/);
    assert.ok(m, p.file + " has no language switch");
    const target = path.normalize(path.join(path.dirname(p.file), m[1]));
    const twin = PAGES.find((q) => q.slug === p.slug && q.lang !== p.lang);
    assert.equal(target, path.normalize(twin.file), p.file + " switches to wrong page");
    assert.equal(m[2], twin.lang);
  }
});

test("internal links and assets resolve, and none start with '/' (GitHub Pages subpath safe)", () => {
  const re = /(?:href|src)="([^"]+)"/g;
  for (const p of PAGES) {
    const html = read(p.file);
    let m;
    while ((m = re.exec(html))) {
      const u = m[1];
      if (/^(https?:|mailto:|#|data:)/.test(u)) continue;
      assert.ok(!u.startsWith("/"), p.file + " root-relative path breaks project sites: " + u);
      const clean = u.split("#")[0].split("?")[0];
      if (!clean) continue;
      const target = path.join(path.dirname(p.file), clean);
      assert.ok(exists(target), p.file + " -> broken link " + u);
    }
  }
});

test("external links use https and open safely", () => {
  for (const p of PAGES) {
    const html = read(p.file);
    assert.ok(!/href="http:\/\//.test(html), p.file + " has an http:// link");
    for (const m of html.matchAll(/<a [^>]*target="_blank"[^>]*>/g)) assert.match(m[0], /rel="noopener/, p.file);
  }
});

test("canonical/OG URLs share one placeholder or one real site address", () => {
  const bases = new Set();
  for (const p of PAGES) {
    const html = read(p.file);
    for (const m of html.matchAll(/(?:canonical" href|og:url" content|og:image" content)="(https:\/\/[^"]+)"/g)) {
      bases.add(m[1].replace(/(index\.html|[a-z-]+\.html|ha\/|assets\/images\/[^/]+)$/, "").replace(/\/ha\/$/, "/"));
    }
  }
  assert.equal(bases.size, 1, "mixed site addresses: " + [...bases].join(", "));
});

test("structured data is valid JSON and truthful (no ratings/reviews/prices)", () => {
  for (const p of PAGES) {
    const html = read(p.file);
    const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    assert.ok(m, p.file + " has no JSON-LD");
    const data = JSON.parse(m[1]);
    assert.ok(["WebSite", "WebPage"].includes(data["@type"]));
    assert.equal(data.inLanguage, p.lang);
    assert.ok(!/aggregateRating|review|offers|price/i.test(m[1]), p.file);
  }
});

test("home pages contain the i18n block with identical keys in English and Hausa", () => {
  const get = (f) => JSON.parse(read(f).match(/<script type="application\/json" id="nw-i18n">([\s\S]*?)<\/script>/)[1]);
  const en = get("index.html"), ha = get("ha/index.html");
  assert.deepEqual(Object.keys(en).sort(), Object.keys(ha).sort());
  for (const k of Object.keys(en)) {
    assert.ok(en[k] && ha[k], "empty " + k);
    assert.notEqual(en[k], ha[k], "Hausa text for " + k + " is identical to English (not translated?)");
    // placeholders must match
    assert.deepEqual((en[k].match(/\{\w+\}/g) || []).sort(), (ha[k].match(/\{\w+\}/g) || []).sort(), "placeholders differ in " + k);
  }
});

test("every T.key and element id used by converter.js exists in both home pages", () => {
  const js = read("assets/js/converter.js");
  const keys = new Set([...js.matchAll(/\bT\.(\w+)/g)].map((m) => m[1]));
  ["err_empty", "err_invalid", "err_negative", "err_zero", "err_toolarge", "status_fresh", "status_snapshot", "status_cached"].forEach((k) => keys.add(k));
  const ids = new Set([...js.matchAll(/\$\("([\w-]+)"\)/g)].map((m) => m[1]));
  for (const f of ["index.html", "ha/index.html"]) {
    const html = read(f);
    const T = JSON.parse(html.match(/id="nw-i18n">([\s\S]*?)<\/script>/)[1]);
    for (const k of keys) assert.ok(k in T, f + " missing i18n key " + k);
    for (const id of ids) assert.ok(new RegExp(`id="${id}"`).test(html), f + " missing element #" + id);
    assert.match(html, /name="ratetype"/);
    assert.match(html, /data-rates-url="(\.\.\/)?data\/rates\.json"/);
  }
});

test("Hausa and English pages are in the right language (spot checks)", () => {
  assert.match(read("index.html"), /<h1>Dollar to Naira Converter/);
  assert.match(read("ha/index.html"), /<h1>Na'urar Canja Dala zuwa Naira/);
  assert.ok(!/<h1>[^<]*(Dollar to Naira)/.test(read("ha/index.html")));
  for (const s of SLUGS) {
    const html = read("ha/" + s + ".html");
    assert.ok(!/Skip to main content/.test(html), "ha/" + s + " nav still English");
    assert.match(html, /Tsallake zuwa babban abun ciki/);
    assert.match(read(s + ".html"), /Skip to main content/);
  }
});

test("wording rules: no 'live', 'real-time' or 'updated just now' claims in site pages", () => {
  for (const p of PAGES) {
    const text = read(p.file).replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ");
    // allowed only inside a negation such as "not live", "not a live", "ba na kai-tsaye"
    for (const m of text.matchAll(/(.{0,30})\b(real-time|updated just now|live)\b(.{0,10})/gi)) {
      assert.match(m[1] + m[2], /(not|no|never|isn't|ba|Ba)\b[^.]{0,30}$/i, p.file + ": '" + m[0] + "'");
    }
  }
});

test("sitemap lists every page in both languages with alternates; robots points to it", () => {
  const sm = read("sitemap.xml");
  assert.equal((sm.match(/<url>/g) || []).length, PAGES.length);
  assert.equal((sm.match(/hreflang="x-default"/g) || []).length, PAGES.length);
  for (const p of PAGES) {
    const loc = p.slug === "index" ? (p.lang === "en" ? "" : "ha/") : (p.lang === "en" ? "" : "ha/") + p.slug + ".html";
    assert.ok(sm.includes(loc + "</loc>"), "sitemap missing " + p.file);
  }
  assert.match(read("robots.txt"), /^Sitemap: https:\/\/.+\/sitemap\.xml$/m);
  assert.ok(!/Disallow:\s*\/\s*$/m.test(read("robots.txt")));
});

test("no secrets, keys or tokens anywhere in shipped files", () => {
  const bad = [/api[_-]?key\s*[:=]\s*["'][^"']{6,}/i, /bearer\s+[a-z0-9._-]{12,}/i, /secret\s*[:=]\s*["'][^"']{6,}/i, /ghp_[A-Za-z0-9]{20,}/, /sk_(live|test)_/i, /-----BEGIN [A-Z ]*PRIVATE KEY/];
  const skip = new Set(["node_modules", ".git"]);
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(html|js|json|yml|yaml|md|txt|xml|css|svg)$/.test(e.name) || p.endsWith("site.test.js")) continue;
      const t = fs.readFileSync(p, "utf8");
      for (const re of bad) assert.ok(!re.test(t), path.relative(ROOT, p) + " matches " + re);
    }
  })(ROOT);
});

test("the front-end calls no provider other than the approved one", () => {
  const js = ["rates.js", "converter.js", "calc.js", "site.js"].map((f) => read("assets/js/" + f)).join("\n");
  const urls = new Set([...js.matchAll(/https?:\/\/[^\s"'`)]+/g)].map((m) => new URL(m[0]).host));
  assert.deepEqual([...urls], ["api.frankfurter.dev"]);
  assert.ok(!/allratestoday\.com\/api/i.test(js.replace(/\/\*[\s\S]*?\*\//g, "")), "AllRatesToday must not be called");
});

test("GitHub Actions workflow uses minimal permissions and a manual trigger", () => {
  const y = read(".github/workflows/update-rates.yml");
  assert.match(y, /workflow_dispatch:/);
  assert.match(y, /schedule:/);
  assert.match(y, /permissions:\s*\n\s+contents: write/);
  assert.ok(!/\$\{\{\s*secrets\./.test(y), "workflow must not use repository secrets");
});
