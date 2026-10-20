#!/usr/bin/env node
/*
 * NairaWise - download the USD->NGN CBN-sourced rate and write data/rates.json.
 *
 * Run by the GitHub Action (.github/workflows/update-rates.yml) or by hand:
 *     node tools/update-rates.js
 *
 * Needs Node 18 or newer (built-in fetch). No npm packages.
 *
 * Safety rules:
 *  - The response is checked by the SAME code the website uses (assets/js/rates.js).
 *  - data/rates.json is only replaced when the new data is valid.
 *  - On any failure the script exits with code 1 and leaves the old file untouched,
 *    so the website keeps showing the last good snapshot.
 *  - A new rate that differs from the previous one by more than MAX_JUMP is rejected
 *    for manual review (protects against a broken upstream feed).
 */
"use strict";

const fs = require("fs");
const path = require("path");
const R = require("../assets/js/rates.js");

const OUT = path.join(__dirname, "..", "data", "rates.json");
const MAX_JUMP = 0.25; // 25 % change between two snapshots = suspicious
const TIMEOUT_MS = 15000;

async function download(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: ctrl.signal });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function readPrevious() {
  try {
    const j = JSON.parse(fs.readFileSync(OUT, "utf8"));
    return typeof j.rate === "number" && j.rate > 0 ? j : null;
  } catch (e) {
    return null;
  }
}

async function main() {
  const source = R.PRIMARY;
  const json = await download(source.url);
  const rec = source.parse(json); // throws if the response is not valid

  const ageDays = R.ageInDays(rec.rateDate, new Date());
  if (ageDays < -1) throw new Error("Rate date " + rec.rateDate + " is in the future");

  const prev = readPrevious();
  if (prev) {
    const change = Math.abs(rec.rate - prev.rate) / prev.rate;
    if (change > MAX_JUMP) {
      throw new Error(
        "New rate " + rec.rate + " differs from previous " + prev.rate + " by " +
        (change * 100).toFixed(1) + "% - not saved. Check the source, then delete data/rates.json to accept it."
      );
    }
  }

  const out = {
    base: "USD",
    quote: "NGN",
    rate: rec.rate,
    rate_date: rec.rateDate,        // the date reported by the source, never today's date
    source_id: rec.sourceId,
    source_label: "Frankfurter, CBN provider",
    fetched_at: new Date().toISOString() // exact time this script downloaded it (UTC)
  };

  // Final check with the website's own parser before writing anything.
  R.parseLocal(out);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT + ".tmp", JSON.stringify(out, null, 2) + "\n");
  fs.renameSync(OUT + ".tmp", OUT);
  console.log("Saved " + out.rate + " NGN per USD, rate date " + out.rate_date + ", fetched " + out.fetched_at);
}

main().catch((e) => {
  console.error("update-rates failed: " + (e && e.message ? e.message : e));
  process.exit(1);
});
