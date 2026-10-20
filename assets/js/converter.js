/*
 * NairaWise - converter user interface.
 * Needs rates.js and calc.js to be loaded first. All visible words come from the
 * JSON block #nw-i18n written into each page, so English and Hausa share this file.
 */
(function () {
  "use strict";

  var root = document.getElementById("converter");
  if (!root || !window.NairaRates || !window.NairaCalc) return;

  var R = window.NairaRates;
  var C = window.NairaCalc;
  var T = {};
  try { T = JSON.parse(document.getElementById("nw-i18n").textContent); } catch (e) { return; }

  var lang = document.documentElement.lang === "ha" ? "ha" : "en";
  var locale = lang === "ha" ? "ha" : "en-GB";

  function $(id) { return document.getElementById(id); }
  function fill(tpl, vars) {
    return String(tpl).replace(/\{(\w+)\}/g, function (_, k) { return vars[k] != null ? vars[k] : ""; });
  }

  var el = {
    form: $("conv-form"),
    amount: $("amount"),
    amountLabel: $("amount-label"),
    amountSym: $("amount-sym"),
    amountError: $("amount-error"),
    swap: $("swap"),
    quick: $("quick"),
    result: $("result"),
    resultLabel: $("result-label"),
    resultNote: $("result-note"),
    ownWrap: $("own-wrap"),
    ownRate: $("own-rate"),
    ownError: $("own-error"),
    panel: $("rate-panel"),
    skeleton: $("rate-skeleton"),
    body: $("rate-body"),
    rateValue: $("rate-value"),
    rateDate: $("rate-date"),
    rateSource: $("rate-source"),
    rateChecked: $("rate-checked"),
    rateStatus: $("rate-status"),
    rateWarn: $("rate-warn"),
    rateUnavailable: $("rate-unavailable"),
    refresh: $("refresh"),
    refreshMsg: $("refresh-msg")
  };

  var state = {
    direction: "usd-ngn",
    rateType: "official",
    official: null // latest result from NairaRates.getRate()
  };

  var QUICK = {
    "usd-ngn": [10, 50, 100, 500, 1000],
    "ngn-usd": [10000, 50000, 100000, 500000, 1000000]
  };

  /* ---------- rendering ---------- */

  function renderQuick() {
    el.quick.textContent = "";
    var currency = state.direction === "usd-ngn" ? "USD" : "NGN";
    QUICK[state.direction].forEach(function (n) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.dataset.amount = String(n);
      b.textContent = C.formatMoney(n, currency).replace(/\.00$/, "");
      el.quick.appendChild(b);
    });
  }

  function renderLabels() {
    var usd = state.direction === "usd-ngn";
    el.amountLabel.textContent = usd ? T.amountUsd : T.amountNgn;
    el.amountSym.textContent = usd ? "$" : "₦";
    el.resultLabel.textContent = usd ? T.resultNgn : T.resultUsd;
    el.swap.setAttribute("aria-label", usd ? T.swapToNgn : T.swapToUsd);
    el.swap.setAttribute("aria-pressed", usd ? "false" : "true");
  }

  function activeRate() {
    if (state.rateType === "own") {
      var r = C.parseRate(el.ownRate.value);
      return r.value ? { value: r.value, kind: "own" } : { error: r.error, kind: "own" };
    }
    if (state.official && state.official.rate) {
      return { value: state.official.rate, kind: "official" };
    }
    return { error: "norate", kind: "official" };
  }

  function setError(node, input, msg) {
    node.textContent = msg || "";
    if (input) {
      if (msg) input.setAttribute("aria-invalid", "true");
      else input.removeAttribute("aria-invalid");
    }
  }

  function update() {
    var usd = state.direction === "usd-ngn";
    var amt = C.parseAmount(el.amount.value);
    var rate = activeRate();

    // Own-rate field errors only show once the field has something typed or was touched.
    if (state.rateType === "own") {
      var showOwn = el.ownRate.value.trim() !== "" || el.ownRate.dataset.touched === "1";
      setError(el.ownError, el.ownRate, showOwn && rate.error ? T["err_" + rate.error] : "");
    } else {
      setError(el.ownError, el.ownRate, "");
    }

    var amountTouched = el.amount.value.trim() !== "" || el.amount.dataset.touched === "1";
    setError(el.amountError, el.amount, amountTouched && amt.error ? T["err_" + amt.error] : "");

    if (amt.error || rate.error) {
      el.result.textContent = "—";
      el.result.classList.add("is-empty");
      if (!amt.error && rate.error === "norate") {
        el.resultNote.textContent = T.noRateYet;
      } else {
        el.resultNote.textContent = "";
      }
      return;
    }

    var out = C.convert(amt.value, rate.value, state.direction);
    el.result.textContent = C.formatMoney(out, usd ? "NGN" : "USD");
    el.result.classList.remove("is-empty");

    if (rate.kind === "own") {
      el.resultNote.textContent = fill(T.usingOwn, { rate: C.formatRate(rate.value) });
    } else {
      el.resultNote.textContent = fill(T.usingOfficial, {
        rate: C.formatRate(rate.value),
        date: R.formatSourceDate(state.official.rateDate, locale)
      });
    }
  }

  function renderRatePanel(prevError) {
    var r = state.official;
    el.skeleton.hidden = true;
    if (!r || r.status === "unavailable") {
      el.body.hidden = true;
      el.rateUnavailable.hidden = false;
      el.rateUnavailable.textContent = navigator.onLine === false ? T.offline : T.unavailable;
      return;
    }
    el.rateUnavailable.hidden = true;
    el.body.hidden = false;
    el.rateValue.textContent = "$1 = " + C.formatRate(r.rate);
    el.rateDate.textContent = fill(T.rateDate, { date: R.formatSourceDate(r.rateDate, locale) });
    el.rateSource.textContent = fill(T.source, { source: r.sourceLabel });

    var checked;
    if (r.fetchedAt) {
      checked = fill(T.lastChecked, { time: R.formatWAT(r.fetchedAt, locale) });
    } else if (r.checkedOn) {
      checked = fill(T.snapshotChecked, { date: R.formatSourceDate(r.checkedOn, locale) });
    } else {
      checked = T.lastCheckedUnknown;
    }
    el.rateChecked.textContent = checked;

    el.rateStatus.className = "badge badge-" + r.status;
    el.rateStatus.textContent = T["status_" + r.status];

    if (r.stale) {
      el.rateWarn.hidden = false;
      el.rateWarn.textContent = fill(T.staleWarning, { days: r.ageDays, max: R.STALE_AFTER_DAYS });
    } else {
      el.rateWarn.hidden = true;
      el.rateWarn.textContent = "";
    }

    el.refreshMsg.textContent = prevError ? prevError : "";
  }

  /* ---------- loading ---------- */

  var loading = false;
  function load(manual) {
    if (loading) return;
    loading = true;
    el.refresh.disabled = true;
    el.refresh.setAttribute("aria-busy", "true");
    el.refresh.textContent = T.refreshing;
    if (!state.official) { el.skeleton.hidden = false; el.body.hidden = true; el.rateUnavailable.hidden = true; }
    el.refreshMsg.textContent = manual ? T.refreshing : "";

    var storage = null;
    try { storage = window.localStorage; } catch (e) { storage = null; }

    R.getRate({
      fetch: window.fetch ? window.fetch.bind(window) : null,
      storage: storage,
      localUrl: new URL(root.dataset.ratesUrl, window.location.href).href
    }).then(function (res) {
      var msg = "";
      if (res.status === "unavailable") {
        if (state.official && state.official.rate) {
          msg = T.refreshFailed; // keep showing the last good result on screen
        } else {
          state.official = res;
        }
      } else {
        state.official = res;
        if (res.status !== "fresh") msg = T.refreshFailed;
        else if (manual) msg = T.refreshOk || "";
      }
      renderRatePanel(manual || res.status !== "fresh" ? msg : "");
      update();
    }).then(function () {
      loading = false;
      el.refresh.disabled = false;
      el.refresh.removeAttribute("aria-busy");
      el.refresh.textContent = T.refresh;
    });
  }

  /* ---------- events ---------- */

  el.amount.addEventListener("input", update);
  el.amount.addEventListener("blur", function () { el.amount.dataset.touched = "1"; update(); });
  el.ownRate.addEventListener("input", update);
  el.ownRate.addEventListener("blur", function () { el.ownRate.dataset.touched = "1"; update(); });

  el.form.addEventListener("submit", function (e) { e.preventDefault(); update(); });

  el.quick.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-amount]");
    if (!b) return;
    el.amount.value = new Intl.NumberFormat("en-US").format(Number(b.dataset.amount));
    el.amount.dataset.touched = "1";
    update();
    el.amount.focus();
  });

  el.swap.addEventListener("click", function () {
    var parsed = C.parseAmount(el.amount.value);
    var rate = activeRate();
    state.direction = state.direction === "usd-ngn" ? "ngn-usd" : "usd-ngn";
    // Carry the current answer over as the new input, so the swap feels natural.
    if (!parsed.error && !rate.error) {
      var out = C.convert(parsed.value, rate.value, state.direction === "usd-ngn" ? "ngn-usd" : "usd-ngn");
      el.amount.value = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Math.round(out * 100) / 100);
    }
    renderLabels();
    renderQuick();
    update();
  });

  el.form.addEventListener("reset", function () {
    setTimeout(function () {
      el.amount.dataset.touched = "";
      el.ownRate.dataset.touched = "";
      state.direction = "usd-ngn";
      state.rateType = "official";
      el.ownWrap.hidden = true;
      renderLabels();
      renderQuick();
      update();
      el.amount.focus();
    }, 0);
  });

  Array.prototype.forEach.call(el.form.elements.ratetype, function (radio) {
    radio.addEventListener("change", function () {
      state.rateType = radio.value;
      el.ownWrap.hidden = state.rateType !== "own";
      if (state.rateType === "own") el.ownRate.focus();
      update();
    });
  });

  el.refresh.addEventListener("click", function () { load(true); });
  window.addEventListener("online", function () { load(false); });

  /* ---------- start ---------- */

  renderLabels();
  renderQuick();
  update();
  load(false);
})();
