/*
 * NairaWise - conversion maths and number formatting (no dependencies).
 * Works in the browser (window.NairaCalc) and in Node (module.exports).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NairaCalc = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MAX_AMOUNT = 1e12;
  var MAX_RATE = 100000;

  /**
   * Turn what the user typed into a number.
   * Accepts "1,234.56", " 100 ", "$50" is NOT accepted (symbol is shown separately).
   * Returns { value } or { error } where error is one of:
   * "empty" | "invalid" | "negative" | "zero" | "toolarge"
   */
  function parsePositive(text, max) {
    var s = String(text == null ? "" : text).replace(/[\s,]/g, "");
    if (s === "") return { error: "empty" };
    if (/^-/.test(s)) return /^-\d*\.?\d*$/.test(s) && /\d/.test(s) ? { error: "negative" } : { error: "invalid" };
    if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return { error: "invalid" };
    var n = Number(s);
    if (!isFinite(n)) return { error: "invalid" };
    if (n === 0) return { error: "zero" };
    if (n > (max || MAX_AMOUNT)) return { error: "toolarge" };
    return { value: n };
  }

  function parseAmount(text) { return parsePositive(text, MAX_AMOUNT); }
  function parseRate(text) { return parsePositive(text, MAX_RATE); }

  /** direction "usd-ngn": NGN = USD x rate.  "ngn-usd": USD = NGN / rate. */
  function convert(amount, rate, direction) {
    return direction === "ngn-usd" ? amount / rate : amount * rate;
  }

  function group(n, minFrac, maxFrac) {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: minFrac, maximumFractionDigits: maxFrac
    }).format(n);
  }

  /** Display formatting only - never feed the result back into calculations. */
  function formatMoney(n, currency) {
    var symbol = currency === "NGN" ? "₦" : "$";
    var maxFrac = n > 0 && n < 0.01 ? 6 : 2;
    return symbol + group(n, 2, maxFrac);
  }

  /** Rate display keeps the source precision (up to 4 decimals). */
  function formatRate(n) {
    return "₦" + group(n, 2, 4);
  }

  return {
    MAX_AMOUNT: MAX_AMOUNT,
    MAX_RATE: MAX_RATE,
    parseAmount: parseAmount,
    parseRate: parseRate,
    convert: convert,
    formatMoney: formatMoney,
    formatRate: formatRate
  };
});
