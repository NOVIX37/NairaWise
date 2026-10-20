"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../../assets/js/calc.js");

test("parseAmount accepts plain, comma and decimal numbers", () => {
  assert.equal(C.parseAmount("100").value, 100);
  assert.equal(C.parseAmount(" 1,234.56 ").value, 1234.56);
  assert.equal(C.parseAmount(".5").value, 0.5);
  assert.equal(C.parseAmount("5.").value, 5);
});

test("parseAmount reports the right error for bad input", () => {
  assert.equal(C.parseAmount("").error, "empty");
  assert.equal(C.parseAmount("   ").error, "empty");
  assert.equal(C.parseAmount(null).error, "empty");
  assert.equal(C.parseAmount("abc").error, "invalid");
  assert.equal(C.parseAmount("1e3").error, "invalid");
  assert.equal(C.parseAmount("$50").error, "invalid");
  assert.equal(C.parseAmount("1.2.3").error, "invalid");
  assert.equal(C.parseAmount("-").error, "invalid");
  assert.equal(C.parseAmount("-5").error, "negative");
  assert.equal(C.parseAmount("0").error, "zero");
  assert.equal(C.parseAmount("0.00").error, "zero");
  assert.equal(C.parseAmount("1000000000001").error, "toolarge");
  assert.equal(C.parseAmount("9".repeat(400)).error, "invalid"); // Infinity
});

test("parseRate has its own, smaller limit", () => {
  assert.equal(C.parseRate("1,500").value, 1500);
  assert.equal(C.parseRate("100001").error, "toolarge");
  assert.equal(C.parseRate("").error, "empty");
});

test("convert: NGN = USD x rate and USD = NGN / rate", () => {
  assert.equal(C.convert(100, 1000, "usd-ngn"), 100000);
  assert.equal(C.convert(250.5, 1000, "usd-ngn"), 250500);
  assert.equal(C.convert(75000, 1000, "ngn-usd"), 75);
  const r = 1331.596;
  assert.ok(Math.abs(C.convert(C.convert(10, r, "usd-ngn"), r, "ngn-usd") - 10) < 1e-9);
});

test("convert does not round the underlying value", () => {
  assert.equal(C.convert(1, 1331.596, "usd-ngn"), 1331.596);
  assert.ok(C.convert(3, 1331.5963, "usd-ngn") > 3994.7889 - 1e-9);
});

test("formatMoney adds symbols, separators and 2 decimals", () => {
  assert.equal(C.formatMoney(1234567.891, "NGN"), "₦1,234,567.89");
  assert.equal(C.formatMoney(100, "USD"), "$100.00");
  assert.equal(C.formatMoney(0, "USD"), "$0.00");
});

test("formatMoney shows extra decimals for tiny non-zero values", () => {
  assert.equal(C.formatMoney(0.000752, "USD"), "$0.000752");
});

test("formatRate keeps source precision up to 4 decimals", () => {
  assert.equal(C.formatRate(1331.596), "₦1,331.596");
  assert.equal(C.formatRate(1500), "₦1,500.00");
  assert.equal(C.formatRate(1331.59634), "₦1,331.5963");
});
