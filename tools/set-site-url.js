#!/usr/bin/env node
/*
 * NairaWise - replace the placeholder web address everywhere with your real one.
 *
 * Usage (run once, from the project folder, after you know your address):
 *   node tools/set-site-url.js https://YOURNAME.github.io/YOUR-REPO/ https://github.com/YOURNAME/YOUR-REPO
 *
 *   argument 1 = the public address of the site (ends with /)
 *   argument 2 = (optional) your GitHub repository address, used for the feedback link
 *
 * It rewrites canonical links, hreflang links, social-sharing tags, structured data,
 * sitemap.xml and robots.txt. Safe to run again with a new address later.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PLACEHOLDER_SITE = process.env.NW_CURRENT_SITE || "https://YOUR-USERNAME.github.io/YOUR-REPO/";
const PLACEHOLDER_REPO = process.env.NW_CURRENT_REPO || "https://github.com/YOUR-USERNAME/YOUR-REPO";

let site = process.argv[2];
const repo = process.argv[3];
if (!site) {
  console.error("Usage: node tools/set-site-url.js https://YOURNAME.github.io/YOUR-REPO/ [https://github.com/YOURNAME/YOUR-REPO]");
  process.exit(1);
}
if (!/^https:\/\/[^\s/]+(\/[^\s]*)?$/.test(site)) {
  console.error("The site address must start with https:// and contain no spaces.");
  process.exit(1);
}
if (!site.endsWith("/")) site += "/";

function walk(dir, out) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    if (name.name === ".git" || name.name === "node_modules") continue;
    const p = path.join(dir, name.name);
    if (name.isDirectory()) walk(p, out);
    else if (/\.(html|xml|txt|json|md|webmanifest)$/.test(name.name)) out.push(p);
  }
  return out;
}

let changed = 0;
for (const file of walk(ROOT, [])) {
  if (file.includes(path.sep + "tests" + path.sep) || file.endsWith("README.md")) continue;
  const before = fs.readFileSync(file, "utf8");
  let after = before.split(PLACEHOLDER_SITE).join(site);
  if (repo) after = after.split(PLACEHOLDER_REPO).join(repo.replace(/\/$/, ""));
  if (after !== before) {
    fs.writeFileSync(file, after);
    changed++;
    console.log("updated " + path.relative(ROOT, file));
  }
}
console.log(changed + " file(s) updated.");
if (changed) {
  console.log("Tip: if you run this again with another address, first set NW_CURRENT_SITE to the address used now.");
}
