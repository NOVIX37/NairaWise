"use strict";
/*
 * Tests for assets/js/rates.js. The network is MOCKED: these tests prove how our
 * code behaves for different responses; they do not prove the real API is up.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../../assets/js/rates.js");

const NOW = new Date("2026-10-12T12:00:00Z"); // 13:00 WAT, 12 Oct 2026
const nowFn = () => NOW;

function memStorage(initial) {
  const m = new Map(Object.entries(initial || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    dump: () => Object.fromEntries(m)
  };
}
const ok = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
const http = (status) => Promise.resolve({ ok: false, status, json: () => Promise.resolve({}) });

/** Build a fetch mock from a map of URL-substring -> handler. */
function mockFetch(routes, calls) {
  return (url) => {
    if (calls) calls.push(url);
    for (const key of Object.keys(routes)) {
      if (url.includes(key)) return routes[key]();
    }
    return Promise.reject(new Error("no route for " + url));
  };
}

const GOOD = { date: "2026-10-12", base: "USD", quote: "NGN", rate: 1331.596 };
const SNAP = { base: "USD", quote: "NGN", rate: 1330.5, rate_date: "2026-10-09", source_id: "frankfurter-cbn", source_label: "Frankfurter, CBN provider", fetched_at: "2026-10-09T15:46:00Z" };

test("only the Frankfurter CBN endpoint is a direct browser source", () => {
  assert.equal(R.NETWORK_SOURCES.length, 1);
  assert.equal(R.NETWORK_SOURCES[0].url, "https://api.frankfurter.dev/v2/providers/cbn/rate/usd/ngn");
  assert.ok(!JSON.stringify(R.NETWORK_SOURCES.map((s) => s.url)).includes("allratestoday"));
});

test("parseFrankfurter accepts a valid response and keeps the source date", () => {
  const rec = R.parseFrankfurter(GOOD);
  assert.equal(rec.rate, 1331.596);
  assert.equal(rec.rateDate, "2026-10-12");
});

test("parseFrankfurter rejects bad responses", () => {
  const bad = [
    null, "x", [], {},
    { ...GOOD, rate: 0 }, { ...GOOD, rate: -5 }, { ...GOOD, rate: "1331" }, { ...GOOD, rate: NaN }, { ...GOOD, rate: Infinity },
    { ...GOOD, date: undefined }, { ...GOOD, date: "12/10/2026" }, { ...GOOD, date: "2026-02-30" },
    { ...GOOD, base: "EUR" }, { ...GOOD, quote: "GHS" }
  ];
  for (const b of bad) assert.throws(() => R.parseFrankfurter(b), undefined, JSON.stringify(b));
});

test("fresh result: date comes from the source, not from the clock", async () => {
  const store = memStorage();
  const res = await R.getRate({
    fetch: mockFetch({ "frankfurter.dev": () => ok({ ...GOOD, date: "2026-10-08" }) }),
    storage: store, now: nowFn
  });
  assert.equal(res.status, "fresh");
  assert.equal(res.rateDate, "2026-10-08"); // NOT 2026-10-12
  assert.equal(res.fetchedAt, NOW.toISOString());
  assert.equal(res.stale, true); // 4 calendar days old
  assert.equal(JSON.parse(store.dump()[R.CACHE_KEY]).rateDate, "2026-10-08");
});

test("stale threshold: 3 days is fine, 4 days is stale", async () => {
  for (const [date, stale] of [["2026-10-12", false], ["2026-10-09", false], ["2026-10-08", true]]) {
    const res = await R.getRate({ fetch: mockFetch({ "frankfurter.dev": () => ok({ ...GOOD, date }) }), storage: memStorage(), now: nowFn });
    assert.equal(res.stale, stale, date);
  }
});

test("a rate dated in the future is rejected", async () => {
  const res = await R.getRate({
    fetch: mockFetch({ "frankfurter.dev": () => ok({ ...GOOD, date: "2026-10-20" }) }),
    storage: memStorage(), now: nowFn
  });
  assert.equal(res.status, "unavailable");
  assert.match(res.errors.join(" "), /future/);
});

test("primary fails -> same-origin snapshot is used and labelled as a snapshot", async () => {
  const res = await R.getRate({
    fetch: mockFetch({ "frankfurter.dev": () => http(500), "data/rates.json": () => ok(SNAP) }),
    storage: memStorage(), localUrl: "http://x/data/rates.json", now: nowFn
  });
  assert.equal(res.status, "snapshot");
  assert.equal(res.rate, 1330.5);
  assert.equal(res.rateDate, "2026-10-09");
  assert.equal(res.fetchedAt, "2026-10-09T15:46:00Z");
  assert.match(res.errors.join(" "), /HTTP 500/);
});

test("snapshot with only a checked_on date has no fake time", async () => {
  const snap = { ...SNAP }; delete snap.fetched_at; snap.checked_on = "2026-10-12";
  const res = await R.getRate({
    fetch: mockFetch({ "frankfurter.dev": () => http(503), "data/rates.json": () => ok(snap) }),
    storage: memStorage(), localUrl: "http://x/data/rates.json", now: nowFn
  });
  assert.equal(res.fetchedAt, null);
  assert.equal(res.checkedOn, "2026-10-12");
});

test("everything fails -> cached copy is returned and labelled cached, never fresh", async () => {
  const cached = { rate: 1300, rateDate: "2026-10-01", sourceId: "frankfurter-cbn", sourceLabel: "x", fetchedAt: "2026-10-01T10:00:00.000Z" };
  const res = await R.getRate({
    fetch: mockFetch({ "frankfurter.dev": () => Promise.reject(new Error("network down")), "data/rates.json": () => http(404) }),
    storage: memStorage({ [R.CACHE_KEY]: JSON.stringify(cached) }), localUrl: "http://x/data/rates.json", now: nowFn
  });
  assert.equal(res.status, "cached");
  assert.equal(res.rate, 1300);
  assert.equal(res.fetchedAt, "2026-10-01T10:00:00.000Z"); // original retrieval time kept
  assert.equal(res.stale, true);
});

test("newer of snapshot and cache wins; ties go to the browser copy", async () => {
  const route = { "frankfurter.dev": () => http(500), "data/rates.json": () => ok(SNAP) };
  const older = { rate: 1290, rateDate: "2026-10-05", sourceId: "s", sourceLabel: "s", fetchedAt: "2026-10-05T09:00:00.000Z" };
  let res = await R.getRate({ fetch: mockFetch(route), storage: memStorage({ [R.CACHE_KEY]: JSON.stringify(older) }), localUrl: "http://x/data/rates.json", now: nowFn });
  assert.equal(res.status, "snapshot");
  const same = { ...older, rate: 1311, rateDate: "2026-10-09" };
  res = await R.getRate({ fetch: mockFetch(route), storage: memStorage({ [R.CACHE_KEY]: JSON.stringify(same) }), localUrl: "http://x/data/rates.json", now: nowFn });
  assert.equal(res.status, "cached");
  assert.equal(res.rate, 1311);
});

test("nothing available -> unavailable state with errors, no throw", async () => {
  const res = await R.getRate({
    fetch: mockFetch({}), storage: memStorage(), localUrl: "http://x/data/rates.json", now: nowFn
  });
  assert.equal(res.status, "unavailable");
  assert.ok(res.errors.length >= 2);
});

test("an invalid response never overwrites a good cached rate", async () => {
  const cached = { rate: 1300, rateDate: "2026-10-10", sourceId: "s", sourceLabel: "s", fetchedAt: "2026-10-10T09:00:00.000Z" };
  const raw = JSON.stringify(cached);
  const store = memStorage({ [R.CACHE_KEY]: raw });
  const res = await R.getRate({ fetch: mockFetch({ "frankfurter.dev": () => ok({ ...GOOD, rate: -1 }) }), storage: store, now: nowFn });
  assert.equal(res.status, "cached");
  assert.equal(store.dump()[R.CACHE_KEY], raw);
});

test("corrupt cache is ignored", () => {
  assert.equal(R.readCache(memStorage({ [R.CACHE_KEY]: "{not json" })), null);
  assert.equal(R.readCache(memStorage({ [R.CACHE_KEY]: JSON.stringify({ rate: 0, rateDate: "2026-10-10", fetchedAt: "2026-10-10T00:00:00Z" }) })), null);
  assert.equal(R.readCache(null), null);
});

test("request timeout is enforced", async () => {
  const hang = () => new Promise(() => {});
  const t0 = Date.now();
  const res = await R.getRate({ fetch: mockFetch({ "frankfurter.dev": hang }), storage: memStorage(), timeoutMs: 60, now: nowFn });
  assert.equal(res.status, "unavailable");
  assert.match(res.errors.join(" "), /Timed out/);
  assert.ok(Date.now() - t0 < 2000);
});

test("simultaneous calls share one request", async () => {
  const calls = [];
  const f = mockFetch({ "frankfurter.dev": () => new Promise((r) => setTimeout(() => r({ ok: true, status: 200, json: () => Promise.resolve(GOOD) }), 30)) }, calls);
  const [a, b] = await Promise.all([R.getRate({ fetch: f, storage: memStorage(), now: nowFn }), R.getRate({ fetch: f, storage: memStorage(), now: nowFn })]);
  assert.equal(calls.length, 1);
  assert.equal(a, b);
});

test("requests send no cookies and ask for fresh data", async () => {
  let seen;
  await R.getRate({ fetch: (u, o) => { seen = o; return ok(GOOD); }, storage: memStorage(), now: nowFn });
  assert.equal(seen.credentials, "omit");
  assert.equal(seen.cache, "no-store");
});

test("WAT helpers use West Africa Time and never shift the source date", () => {
  assert.equal(R.todayInWAT(new Date("2026-10-12T23:30:00Z")), "2026-10-13"); // 00:30 WAT next day
  assert.equal(R.formatWAT("2026-10-12T10:00:00Z", "en-GB"), "12 Oct 2026, 11:00 WAT");
  assert.equal(R.formatSourceDate("2026-10-12", "en-GB"), "12 October 2026");
  assert.equal(R.formatSourceDate("not-a-date", "en-GB"), "");
  assert.equal(R.ageInDays("2026-10-09", NOW), 3);
});

test("Hausa locale formatting does not throw", () => {
  assert.ok(R.formatSourceDate("2026-10-12", "ha").length > 0);
  assert.ok(R.formatWAT("2026-10-12T10:00:00Z", "ha").endsWith("WAT"));
});

test("parseLocal validates the data file", () => {
  assert.equal(R.parseLocal(SNAP).rateDate, "2026-10-09");
  assert.throws(() => R.parseLocal({ ...SNAP, rate_date: undefined }));
  assert.throws(() => R.parseLocal({ ...SNAP, rate: 0 }));
  assert.throws(() => R.parseLocal({ ...SNAP, quote: "GHS" }));
});

test("the shipped data/rates.json passes the website's own validation", () => {
  const rec = R.parseLocal(require("../../data/rates.json"));
  assert.ok(rec.rate > 0);
  assert.ok(R.isIsoDate(rec.rateDate));
});
