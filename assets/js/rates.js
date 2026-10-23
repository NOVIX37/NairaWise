/*
 * NairaWise - rate retrieval logic (no dependencies).
 *
 * Works in the browser (window.NairaRates) and in Node (module.exports),
 * so the same validation code is used by the website, the GitHub Action
 * and the automated tests.
 *
 * Order of sources (see README):
 *   1. Frankfurter - CBN provider (the only direct browser source)
 *   2. Same-origin data/rates.json (published by the GitHub Action)
 *   3. Last valid copy saved in this browser (localStorage)
 *
 * The AllRatesToday "open" endpoint was deliberately NOT kept as a backup: its
 * terms (section 3.3) say the keyless endpoint may not be used for public
 * displays such as websites without a paid plan. To add another provider later,
 * write a parser like parseFrankfurter and add it to NETWORK_SOURCES - but first
 * read that provider's terms.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NairaRates = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var STALE_AFTER_DAYS = 3; // older than this many calendar days = stale
  var TIMEOUT_MS = 8000;
  var CACHE_KEY = "nairawise.rate.v1";
  var TIMEZONE = "Africa/Lagos"; // West Africa Time (WAT, UTC+1, no DST)

  var PRIMARY = {
    id: "frankfurter-cbn",
    label: "Frankfurter, CBN provider (Central Bank of Nigeria)",
    url: "https://api.frankfurter.dev/v2/providers/cbn/rate/usd/ngn",
    parse: parseFrankfurter
  };
  var NETWORK_SOURCES = [PRIMARY]; // tried in order until one passes validation

  /* ---------- small helpers ---------- */

  function isFinitePositive(n) {
    return typeof n === "number" && isFinite(n) && n > 0;
  }

  function isIsoDate(s) {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var d = new Date(s + "T00:00:00Z");
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }

  /** Today's calendar date in WAT as YYYY-MM-DD. */
  function todayInWAT(now) {
    var parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit"
    }).format(now || new Date());
    return parts; // en-CA gives YYYY-MM-DD
  }

  /** Whole calendar days between two YYYY-MM-DD strings (b - a). */
  function daysBetween(a, b) {
    var ms = Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z");
    return Math.round(ms / 86400000);
  }

  function ageInDays(rateDate, now) {
    return daysBetween(rateDate, todayInWAT(now));
  }

  function isFutureRateDate(rateDate, now) {
    return !!rateDate && isIsoDate(rateDate) && ageInDays(rateDate, now) < 0;
  }

  /* ---------- parsers: return a normalised record or throw ---------- */

  function finish(id, label, rate, rateDate, extra, now) {
    if (!isFinitePositive(rate)) throw new Error("Rate is not a positive number");
    if (!isIsoDate(rateDate)) throw new Error("Missing or invalid rate date");
    if (isFutureRateDate(rateDate, now)) throw new Error("Rate date is in the future");
    var rec = { rate: rate, rateDate: rateDate, sourceId: id, sourceLabel: label };
    if (extra) for (var k in extra) rec[k] = extra[k];
    return rec;
  }

  function parseFrankfurter(json, now) {
    if (!json || typeof json !== "object") throw new Error("Not a JSON object");
    if (json.base !== "USD" || json.quote !== "NGN") throw new Error("Unexpected currency pair");
    return finish(PRIMARY.id, PRIMARY.label, json.rate, json.date, null, now);
  }

  /** Same-origin file written by tools/update-rates.js (or the seed file). */
  function parseLocal(json, now) {
    if (!json || typeof json !== "object") throw new Error("Not a JSON object");
    if (json.base !== "USD" || json.quote !== "NGN") throw new Error("Unexpected currency pair");
    var rec = finish(
      "published-snapshot",
      "NairaWise data file (" + String(json.source_label || json.source_id || "CBN-sourced") + ")",
      json.rate, json.rate_date,
      { snapshotSourceId: json.source_id || null },
      now
    );
    if (typeof json.fetched_at === "string" && !isNaN(Date.parse(json.fetched_at))) {
      rec.fetchedAt = json.fetched_at;
    }
    if (typeof json.checked_on === "string" && isIsoDate(json.checked_on)) {
      rec.checkedOn = json.checked_on;
    }
    return rec;
  }

  /* ---------- cache (localStorage) ---------- */

  function readCache(storage, now) {
    try {
      if (!storage) return null;
      var raw = storage.getItem(CACHE_KEY);
      if (!raw) return null;
      var c = JSON.parse(raw);
      if (!c || !isFinitePositive(c.rate) || !isIsoDate(c.rateDate)) return null;
      if (isFutureRateDate(c.rateDate, now)) return null;
      if (typeof c.fetchedAt !== "string" || isNaN(Date.parse(c.fetchedAt))) return null;
      return c;
    } catch (e) { return null; }
  }

  function writeCache(storage, rec) {
    try {
      if (!storage) return;
      storage.setItem(CACHE_KEY, JSON.stringify({
        rate: rec.rate, rateDate: rec.rateDate, sourceId: rec.sourceId,
        sourceLabel: rec.sourceLabel, fetchedAt: rec.fetchedAt
      }));
    } catch (e) { /* storage may be full or blocked - ignore */ }
  }

  /* ---------- network ---------- */

  function fetchJson(fetchFn, url, timeoutMs) {
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = null;
    var timeout = new Promise(function (_, reject) {
      timer = setTimeout(function () {
        if (controller) controller.abort();
        reject(new Error("Timed out after " + timeoutMs + " ms"));
      }, timeoutMs);
    });
    var req = fetchFn(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      credentials: "omit",
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      if (!res || !res.ok) throw new Error("HTTP " + (res ? res.status : "error"));
      return res.json();
    });
    return Promise.race([req, timeout]).then(
      function (v) { clearTimeout(timer); return v; },
      function (e) { clearTimeout(timer); throw e; }
    );
  }

  /** Decide status flags for a finished record. */
  function describe(rec, kind, now, errors) {
    var age = ageInDays(rec.rateDate, now);
    return {
      status: kind,                 // "fresh" | "snapshot" | "cached"
      rate: rec.rate,
      rateDate: rec.rateDate,       // always the date reported by the source
      sourceId: rec.sourceId,
      sourceLabel: rec.sourceLabel,
      fetchedAt: rec.fetchedAt || null,   // ISO time, or null if unknown
      checkedOn: rec.checkedOn || null,   // date-only note for the bundled snapshot
      ageDays: age,
      stale: age > STALE_AFTER_DAYS,
      errors: errors || []
    };
  }

  var inFlight = null;

  /**
   * Get the best available USD->NGN reference rate.
   * opts: { fetch, storage, localUrl, now, timeoutMs }
   * Never rejects: returns { status: "unavailable", errors } if nothing works.
   */
  function getRate(opts) {
    if (inFlight) return inFlight; // prevent duplicate simultaneous requests
    opts = opts || {};
    var fetchFn = opts.fetch || (typeof fetch !== "undefined" ? fetch.bind(root_()) : null);
    var storage = opts.storage || null;
    var timeoutMs = opts.timeoutMs || TIMEOUT_MS;
    var nowFn = opts.now || function () { return new Date(); };
    var errors = [];

    function tryNetwork(source) {
      return fetchJson(fetchFn, source.url, timeoutMs).then(function (json) {
        var n = nowFn();
        var rec = source.parse(json, n);
        rec.fetchedAt = n.toISOString();
        return rec;
      });
    }

    function fail(label) {
      return function (e) { errors.push(label + ": " + (e && e.message ? e.message : e)); return null; };
    }

    function tryNetworkSources() {
      var i = 0;
      function next() {
        if (i >= NETWORK_SOURCES.length) return Promise.resolve(null);
        var src = NETWORK_SOURCES[i++];
        return tryNetwork(src).catch(fail(src.id)).then(function (rec) { return rec || next(); });
      }
      return next();
    }

    var p = Promise.resolve()
      .then(function () {
        if (!fetchFn) throw new Error("fetch is not available");
        return tryNetworkSources();
      })
      .then(function (rec) {
        if (rec) {
          writeCache(storage, rec);
          return describe(rec, "fresh", nowFn(), errors);
        }
        // Both direct sources failed -> same-origin snapshot and local cache.
        var local = opts.localUrl
          ? fetchJson(fetchFn, opts.localUrl, timeoutMs).then(function (json) {
            return parseLocal(json, nowFn());
          }).catch(fail("snapshot"))
          : Promise.resolve(null);
        return local.then(function (snap) {
          var cached = readCache(storage, nowFn());
          var cachedRec = cached ? {
            rate: cached.rate, rateDate: cached.rateDate, sourceId: cached.sourceId,
            sourceLabel: cached.sourceLabel, fetchedAt: cached.fetchedAt
          } : null;
          // Prefer whichever has the newer source date. Ties go to the browser copy,
          // because its retrieval time was recorded accurately by this browser.
          var pick = null, kind = null;
          if (snap && cachedRec) {
            if (snap.rateDate > cachedRec.rateDate) { pick = snap; kind = "snapshot"; }
            else { pick = cachedRec; kind = "cached"; }
          } else if (snap) { pick = snap; kind = "snapshot"; }
          else if (cachedRec) { pick = cachedRec; kind = "cached"; }
          if (!pick) return { status: "unavailable", errors: errors };
          return describe(pick, kind, nowFn(), errors);
        });
      })
      .then(function (result) { inFlight = null; return result; },
            function (e) { inFlight = null; return { status: "unavailable", errors: errors.concat(String(e)) }; });

    inFlight = p;
    return p;
  }

  function root_() { return typeof self !== "undefined" ? self : globalThis; }

  /* ---------- display helpers ---------- */

  /** Format an ISO instant in WAT, e.g. "12 Oct 2026, 17:11 WAT". */
  function formatWAT(iso, locale) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    var opts = { timeZone: TIMEZONE, day: "numeric", month: "short", year: "numeric",
                 hour: "2-digit", minute: "2-digit", hour12: false };
    var text;
    try { text = new Intl.DateTimeFormat(locale || "en-GB", opts).format(d); }
    catch (e) { text = new Intl.DateTimeFormat("en-GB", opts).format(d); }
    return text + " WAT";
  }

  /** Format a YYYY-MM-DD source date without any time-zone shifting. */
  function formatSourceDate(ymd, locale) {
    if (!isIsoDate(ymd)) return "";
    var d = new Date(ymd + "T12:00:00Z");
    var opts = { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" };
    try { return new Intl.DateTimeFormat(locale || "en-GB", opts).format(d); }
    catch (e) { return new Intl.DateTimeFormat("en-GB", opts).format(d); }
  }

  return {
    STALE_AFTER_DAYS: STALE_AFTER_DAYS,
    CACHE_KEY: CACHE_KEY,
    TIMEZONE: TIMEZONE,
    PRIMARY: PRIMARY,
    NETWORK_SOURCES: NETWORK_SOURCES,
    parseFrankfurter: parseFrankfurter,
    parseLocal: parseLocal,
    isIsoDate: isIsoDate,
    todayInWAT: todayInWAT,
    ageInDays: ageInDays,
    readCache: readCache,
    writeCache: writeCache,
    getRate: getRate,
    formatWAT: formatWAT,
    formatSourceDate: formatSourceDate
  };
});
