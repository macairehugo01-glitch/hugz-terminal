/*
  ◆ TERMINAL MACRO v3.1
  ─────────────────────────────────────────────────────────────────
  CORRECTIONS v3.1 :
    • BUG OR CORRIGÉ : Yahoo Finance GC=F en priorité (prix live USD)
      FRED GOLDAMGBD228NLBM retournait parfois des valeurs en cents
      → sanity check ajoutée (or ne peut pas dépasser 5000 USD/oz)
    • Argent : SI=F Yahoo en priorité, FRED SLVPRUSD en fallback
    • Cuivre : HG=F Yahoo (USD/lb), FRED PCOPPUSDM = USD/lb mensuel
    • IA : analyse risk-on / risk-off automatique à chaque charge
    • Morning briefing : question risk-on/off intégrée
  Sources :
    • Yahoo Finance   → Or, Argent, WTI, Brent, Cuivre, Gaz, Secteurs
    • FRED St. Louis  → Taux, inflation, chômage, délinquance, credit
    • Coinbase        → BTC / ETH
    • Frankfurter     → EUR/USD
    • Alternative.me  → Fear & Greed
    • Anthropic Haiku → IA économe
  ─────────────────────────────────────────────────────────────────
*/

const express = require("express");
const path    = require("path");

const app  = express();
const PORT = process.env.PORT || 3000;

// ── CLÉS API ──────────────────────────────────────────────────────
const FRED_KEY      = process.env.FRED_API_KEY  || "2945c843ac2ef54c3d1272b9f9cc2747";
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || "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";

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json({ limit: "2mb" }));

// ── CACHE SERVEUR ─────────────────────────────────────────────────
const CACHE = new Map();
const TTL = {
  crypto      : 60       * 1000,   // 1 min
  yahoo_live  : 5  * 60 * 1000,   // 5 min  (commodités live Yahoo)
  yahoo_sector: 10 * 60 * 1000,   // 10 min (secteurs)
  fng         : 30 * 60 * 1000,   // 30 min
  fred_daily  : 4  * 3600 * 1000, // 4 h    (DGS*, VIXCLS, etc.)
  fred_monthly: 12 * 3600 * 1000, // 12 h   (UNRATE, CPI, délinquance)
};

function cacheGet(key) {
  const e = CACHE.get(key);
  if (!e) return undefined;
  if (Date.now() - e.ts > e.ttl) { CACHE.delete(key); return undefined; }
  return e.data;
}
function cacheSet(key, data, ttl) {
  CACHE.set(key, { data, ts: Date.now(), ttl });
  return data;
}

// ── UTILITAIRES ───────────────────────────────────────────────────
function toNum(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : null; }

async function fetchJson(url, opts = {}) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 14000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal, ...opts,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json,*/*",
        ...(opts.headers || {})
      }
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${url.slice(0, 80)}`);
    return res.json();
  } finally { clearTimeout(timer); }
}

async function safe(fn, fallback = null) {
  try { return await fn(); }
  catch (e) { console.warn("[SAFE]", String(e.message).slice(0, 120)); return fallback; }
}

// ── SANITY CHECKS — plages réalistes 2024-2026 ────────────────────
const SANITY = {
  gold  : [1500, 5000],   // USD/oz
  silver: [10,   100],    // USD/oz
  oil   : [20,   200],    // USD/bbl
  brent : [20,   200],
  copper: [2,    15],     // USD/lb
  natgas: [0.5,  20],     // USD/MMBtu
};

function sanity(value, [min, max]) {
  if (value == null) return null;
  return (value >= min && value <= max) ? value : null;
}

// ── YAHOO FINANCE — close spot ────────────────────────────────────
async function yahooClose(sym, range = "5d", interval = "1d") {
  const ckey = `yclose_${sym}_${range}`;
  const cached = cacheGet(ckey);
  if (cached !== undefined) return cached;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}`
    + `?range=${range}&interval=${interval}&includePrePost=false`;
  const d = await fetchJson(url);
  const closes = d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(closes)) return cacheSet(ckey, null, TTL.yahoo_live);
  const val = [...closes].reverse().find(v => v != null) ?? null;
  return cacheSet(ckey, val, TTL.yahoo_live);
}

// ── COMMODITÉS — Yahoo en PRIORITÉ, FRED en fallback ─────────────
// Raison : FRED GOLDAMGBD228NLBM (London fixing) peut avoir 1-3 jours de délai
// et certaines implémentations retournent des valeurs en cents → bug $4811
async function fetchCommodities() {
  const cached = cacheGet("commodities_v2");
  if (cached !== undefined) return cached;

  // ① Fetch Yahoo en premier (données spot live)
  const [yGold, ySilver, yWTI, yBrent, yCopper, yGas] = await Promise.all([
    safe(() => yahooClose("GC=F")),   // Or spot (USD/oz) ✅
    safe(() => yahooClose("SI=F")),   // Argent spot (USD/oz) ✅
    safe(() => yahooClose("CL=F")),   // WTI crude (USD/bbl) ✅
    safe(() => yahooClose("BZ=F")),   // Brent crude (USD/bbl) ✅
    safe(() => yahooClose("HG=F")),   // Cuivre (USD/lb) ✅
    safe(() => yahooClose("NG=F")),   // Nat gas (USD/MMBtu) ✅
  ]);

  // ② Fetch FRED en parallèle comme fallback secondaire
  const [fGold, fSilver, fWTI, fBrent, fCopper, fGas] = await Promise.all([
    safe(() => fredObs("GOLDAMGBD228NLBM", 5)),
    safe(() => fredObs("SLVPRUSD",         5)),
    safe(() => fredObs("DCOILWTICO",       5)),
    safe(() => fredObs("DCOILBRENTEU",     5)),
    safe(() => fredObs("PCOPPUSDM",        5)),
    safe(() => fredObs("DHHNGSP",          5))
  ]);

  // ③ Sélection + sanity check
  // Pour l'or FRED, si valeur > 5000 elle est probablement en cents → diviser par 100
  function normalizeFredGold(v) {
    if (v == null) return null;
    if (v > 5000 && v < 500000) return v / 100; // correction cents → USD
    return v;
  }

  const fGoldNorm = normalizeFredGold(fGold?.value);

  const pick = (yahoo, fredVal, range) => {
    const yOk = sanity(yahoo,    range);
    const fOk = sanity(fredVal,  range);
    return yOk ?? fOk ?? null; // Yahoo prioritaire, FRED si Yahoo null
  };

  const result = {
    gold  : { value: pick(yGold,   fGoldNorm,     SANITY.gold),   src: yGold   != null ? "Yahoo GC=F" : "FRED" },
    silver: { value: pick(ySilver, fSilver?.value,SANITY.silver), src: ySilver != null ? "Yahoo SI=F" : "FRED" },
    oil   : { value: pick(yWTI,    fWTI?.value,   SANITY.oil),    src: yWTI    != null ? "Yahoo CL=F" : "FRED" },
    brent : { value: pick(yBrent,  fBrent?.value, SANITY.brent),  src: yBrent  != null ? "Yahoo BZ=F" : "FRED" },
    copper: { value: pick(yCopper, fCopper?.value,SANITY.copper), src: yCopper != null ? "Yahoo HG=F" : "FRED" },
    natgas: { value: pick(yGas,    fGas?.value,   SANITY.natgas), src: yGas    != null ? "Yahoo NG=F" : "FRED" },
  };

  console.log("[COMMODITIES]", JSON.stringify({
    gold: result.gold.value, src: result.gold.src,
    silver: result.silver.value, oil: result.oil.value
  }));

  return cacheSet("commodities_v2", result, TTL.yahoo_live);
}

// ── FRED ──────────────────────────────────────────────────────────
async function fredObs(seriesId, limit = 10) {
  const cached = cacheGet(`fred_${seriesId}`);
  if (cached !== undefined) return cached;

  const url = `https://api.stlouisfed.org/fred/series/observations`
    + `?series_id=${encodeURIComponent(seriesId)}`
    + `&api_key=${encodeURIComponent(FRED_KEY)}`
    + `&sort_order=desc&limit=${limit}&file_type=json`;
  const data = await fetchJson(url);
  const obs  = Array.isArray(data.observations)
    ? data.observations.find(o => o.value !== "." && o.value !== "")
    : null;
  const result = { value: toNum(obs?.value), date: obs?.date || null };
  return cacheSet(`fred_${seriesId}`, result, TTL.fred_daily);
}

async function fredAll(seriesId) {
  const cached = cacheGet(`fredAll_${seriesId}`);
  if (cached !== undefined) return cached;
  const url = `https://api.stlouisfed.org/fred/series/observations`
    + `?series_id=${encodeURIComponent(seriesId)}`
    + `&api_key=${encodeURIComponent(FRED_KEY)}&file_type=json`;
  const data = await fetchJson(url);
  const obs  = Array.isArray(data.observations) ? data.observations : [];
  return cacheSet(`fredAll_${seriesId}`, obs, TTL.fred_monthly);
}

function getLastValid(obs) {
  if (!Array.isArray(obs)) return null;
  for (let i = obs.length - 1; i >= 0; i--) {
    const v = obs[i]?.value;
    if (v !== "." && v !== "" && v != null) return obs[i];
  }
  return null;
}

function computeYoY(observations) {
  const valid = (observations || []).filter(o => o.value !== "." && o.value !== "");
  if (valid.length < 13) return null;
  const latest   = valid[valid.length - 1];
  const latestVal = toNum(latest.value);
  if (latestVal === null) return null;
  const ld = new Date(latest.date);
  let ya = null;
  for (let i = valid.length - 2; i >= 0; i--) {
    const d = new Date(valid[i].date);
    if (d.getFullYear() === ld.getFullYear() - 1 && d.getMonth() === ld.getMonth()) { ya = valid[i]; break; }
  }
  if (!ya) ya = valid[valid.length - 13];
  const oldVal = toNum(ya?.value);
  if (oldVal == null || oldVal === 0) return null;
  return ((latestVal / oldVal) - 1) * 100;
}

// ── CRYPTO ────────────────────────────────────────────────────────
async function fetchCoinbase(pair) {
  const cached = cacheGet(`cb_${pair}`);
  if (cached !== undefined) return cached;
  const d = await fetchJson(`https://api.coinbase.com/v2/prices/${pair}/spot`);
  const v = toNum(d?.data?.amount);
  if (v == null) throw new Error(`${pair} no data`);
  return cacheSet(`cb_${pair}`, { value: v, ts: new Date().toISOString() }, TTL.crypto);
}

async function fetchBTCDominance() {
  const cached = cacheGet("btcdom");
  if (cached !== undefined) return cached;
  const d = await fetchJson("https://api.coingecko.com/api/v3/global");
  return cacheSet("btcdom", toNum(d?.data?.market_cap_percentage?.btc), TTL.yahoo_live);
}

// ── FX ────────────────────────────────────────────────────────────
async function fetchEURUSD() {
  const cached = cacheGet("eurusd");
  if (cached !== undefined) return cached;
  const d = await fetchJson("https://api.frankfurter.app/latest?from=EUR&to=USD");
  const v = toNum(d?.rates?.USD);
  if (v == null) throw new Error("EUR/USD no data");
  return cacheSet("eurusd", { value: v, ts: new Date().toISOString() }, TTL.yahoo_live);
}

// ── FEAR & GREED ──────────────────────────────────────────────────
async function fetchFearGreed() {
  const cached = cacheGet("fng");
  if (cached !== undefined) return cached;
  const d   = await fetchJson("https://api.alternative.me/fng/?limit=1");
  const row = d?.data?.[0];
  if (!row) throw new Error("FNG no data");
  return cacheSet("fng", { value: toNum(row.value), label: row.value_classification || null }, TTL.fng);
}

function fearGreedFallback(vix, spread) {
  if (vix == null) return null;
  let s = 50;
  if (vix > 35) s -= 35; else if (vix > 30) s -= 26; else if (vix > 25) s -= 16;
  else if (vix > 20) s -= 8; else if (vix < 14) s += 18;
  if (spread != null) { if (spread > 40) s += 8; else if (spread < 0) s -= 12; }
  s = Math.max(0, Math.min(100, s));
  const label = s < 25 ? "PEUR EXTRÊME" : s < 45 ? "PEUR" : s < 55 ? "NEUTRE" : s < 75 ? "OPTIMISME" : "EUPHORIE";
  return { value: s, label };
}

// ── CRÉDIT SPREADS ────────────────────────────────────────────────
async function fetchCreditSpreads() {
  const cached = cacheGet("credit");
  if (cached !== undefined) return cached;
  const [hy, ig] = await Promise.all([
    safe(() => fredObs("BAMLH0A0HYM2", 5)),
    safe(() => fredObs("BAMLC0A0CM",   5))
  ]);
  const result = {
    hy   : hy?.value,
    ig   : ig?.value,
    ratio: (hy?.value && ig?.value && ig.value !== 0) ? hy.value / ig.value : null,
    date : hy?.date || null
  };
  return cacheSet("credit", result, TTL.fred_daily);
}

// ── DÉLINQUANCE ───────────────────────────────────────────────────
async function fetchDelinquency() {
  const cached = cacheGet("delinquency");
  if (cached !== undefined) return cached;
  const [cc, auto, re, sl, cre] = await Promise.all([
    safe(() => fredObs("DRCCLACBS",  5)),
    safe(() => fredObs("DRAUTONSA",  5)),
    safe(() => fredObs("DRSFRMACBS", 5)),
    safe(() => fredObs("DRSREACBS",  5)),
    safe(() => fredObs("DRCLACBS",   5))
  ]);
  const result = {
    creditCards : cc?.value   ?? null,
    autoLoans   : auto?.value ?? null,
    realEstate  : re?.value   ?? null,
    studentLoans: sl?.value   ?? null,
    commercialRe: cre?.value  ?? null,
    date        : cc?.date    || auto?.date || null
  };
  return cacheSet("delinquency", result, TTL.fred_monthly);
}

// ── SECTEURS S&P — MULTI-TIMEFRAME ────────────────────────────────
const SECTOR_ETFS = [
  { name: "Energie",      sym: "XLE"  },
  { name: "Santé",        sym: "XLV"  },
  { name: "Utilities",    sym: "XLU"  },
  { name: "Finance",      sym: "XLF"  },
  { name: "Industrie",    sym: "XLI"  },
  { name: "Matériaux",    sym: "XLB"  },
  { name: "Conso. disc.", sym: "XLY"  },
  { name: "Tech",         sym: "XLK"  },
  { name: "Immo.",        sym: "XLRE" },
  { name: "Conso. base",  sym: "XLP"  },
  { name: "Telecom",      sym: "XLC"  }
];

const UT_CONFIG = {
  "1D" : { range: "5d",  interval: "1d",  label: "1 Jour"    },
  "1W" : { range: "1mo", interval: "1d",  label: "1 Semaine" },
  "1M" : { range: "1mo", interval: "1d",  label: "1 Mois"    },
  "3M" : { range: "3mo", interval: "1d",  label: "3 Mois"    },
  "6M" : { range: "6mo", interval: "1wk", label: "6 Mois"    },
  "1Y" : { range: "1y",  interval: "1mo", label: "1 An"      },
  "YTD": { range: "ytd", interval: "1d",  label: "YTD"       }
};

async function fetchSectorForUT(sym, ut) {
  const cfg  = UT_CONFIG[ut] || UT_CONFIG["1M"];
  const ckey = `sector_${sym}_${ut}`;
  const cached = cacheGet(ckey);
  if (cached !== undefined) return cached;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}`
    + `?range=${cfg.range}&interval=${cfg.interval}&includePrePost=false`;
  const d = await fetchJson(url);
  const closes = d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(closes) || closes.length < 2) return cacheSet(ckey, null, TTL.yahoo_sector);

  let first, last;
  if (ut === "1D") {
    const valid = closes.filter(v => v != null);
    if (valid.length < 2) return cacheSet(ckey, null, TTL.yahoo_sector);
    last  = valid[valid.length - 1];
    first = valid[valid.length - 2];
  } else {
    first = closes.find(v => v != null);
    last  = [...closes].reverse().find(v => v != null);
  }
  if (!first || !last || first === 0) return cacheSet(ckey, null, TTL.yahoo_sector);
  return cacheSet(ckey, ((last / first) - 1) * 100, TTL.yahoo_sector);
}

async function fetchAllSectors(ut = "1M") {
  const results = await Promise.all(
    SECTOR_ETFS.map(s => safe(() => fetchSectorForUT(s.sym, ut)))
  );
  return SECTOR_ETFS.map((s, i) => ({ name: s.name, sym: s.sym, value: results[i] }))
    .sort((a, b) => (b.value ?? -99) - (a.value ?? -99));
}

// ── CALCUL RISK-ON / RISK-OFF ─────────────────────────────────────
// Score composite sur 10 indicateurs clés
function computeRiskScore(data) {
  const scores = [];
  const details = [];

  const vix    = data.vix?.value;
  const spread = data.yields?.spread2s10s;
  const hy     = data.credit?.hy;
  const fg     = data.sentiment?.value;
  const dxy    = data.dxyProxy?.value;
  const gold   = data.commodities?.gold?.value;
  const btc    = data.crypto?.btcusd?.value;
  const cpi    = data.inflation?.cpiYoY;
  const unrate = data.labor?.unemploymentRate;
  const cc     = data.delinquency?.creditCards;

  // VIX : <15 = +2 (RO), 15-20 = +1, 20-25 = -1, 25-35 = -2, >35 = -3
  if (vix != null) {
    const s = vix < 15 ? 2 : vix < 20 ? 1 : vix < 25 ? -1 : vix < 35 ? -2 : -3;
    scores.push(s);
    details.push(`VIX ${vix.toFixed(1)} → ${s > 0 ? "Risk-ON" : "Risk-OFF"}`);
  }

  // Courbe 2s10s : >30pb = +2, 0-30 = +1, -20-0 = -1, <-20 = -2
  if (spread != null) {
    const s = spread > 30 ? 2 : spread > 0 ? 1 : spread > -20 ? -1 : -2;
    scores.push(s);
    details.push(`2s10s ${spread.toFixed(0)}pb → ${s > 0 ? "Risk-ON" : "Risk-OFF"}`);
  }

  // Spread HY : <4% = +1, 4-6% = 0, >6% = -1, >8% = -2
  if (hy != null) {
    const s = hy < 4 ? 1 : hy < 6 ? 0 : hy < 8 ? -1 : -2;
    scores.push(s);
    details.push(`HY ${hy.toFixed(2)}% → ${s > 0 ? "Risk-ON" : s === 0 ? "Neutre" : "Risk-OFF"}`);
  }

  // Fear & Greed : >65 = +2, 45-65 = +1, 35-45 = -1, <35 = -2
  if (fg != null) {
    const s = fg > 65 ? 2 : fg > 45 ? 1 : fg > 35 ? -1 : -2;
    scores.push(s);
    details.push(`F&G ${Math.round(fg)} → ${s > 0 ? "Risk-ON" : "Risk-OFF"}`);
  }

  // DXY : dollar fort = Risk-OFF (capitaux vers USD), dollar faible = Risk-ON (actifs risqués)
  if (dxy != null) {
    const s = dxy < 100 ? 1 : dxy < 104 ? 0 : -1;
    scores.push(s);
    details.push(`DXY ${dxy.toFixed(2)} → ${s > 0 ? "Risk-ON" : s === 0 ? "Neutre" : "Risk-OFF"}`);
  }

  // Or : hausse forte = refuge = Risk-OFF signal
  if (gold != null) {
    const s = gold > 3500 ? -2 : gold > 3000 ? -1 : gold < 2000 ? 1 : 0;
    scores.push(s);
    details.push(`Or $${Math.round(gold)} → ${s < 0 ? "Risk-OFF (refuge)" : s === 0 ? "Neutre" : "Risk-ON"}`);
  }

  // BTC : proxy appétit risque
  if (btc != null) {
    const s = btc > 80000 ? 1 : btc > 50000 ? 0 : -1;
    scores.push(s);
    details.push(`BTC $${Math.round(btc / 1000)}k → ${s > 0 ? "Risk-ON" : s === 0 ? "Neutre" : "Risk-OFF"}`);
  }

  // Délinquance cartes : élevée = stress consommateur = Risk-OFF
  if (cc != null) {
    const s = cc < 2.5 ? 1 : cc < 3.5 ? 0 : -1;
    scores.push(s);
    details.push(`Délinquance CC ${cc.toFixed(2)}% → ${s > 0 ? "Risk-ON" : s === 0 ? "Neutre" : "Risk-OFF"}`);
  }

  if (scores.length === 0) return null;

  const total = scores.reduce((a, b) => a + b, 0);
  const max   = scores.length * 2;
  const min   = scores.length * -3;
  // Normaliser sur 0-100
  const normalized = Math.round(((total - min) / (max - min)) * 100);
  const clamped    = Math.max(0, Math.min(100, normalized));

  let regime, emoji;
  if (clamped >= 65)      { regime = "RISK-ON 🟢";    emoji = "🟢"; }
  else if (clamped >= 50) { regime = "LÉGÈREMENT RISK-ON 🟡"; emoji = "🟡"; }
  else if (clamped >= 35) { regime = "LÉGÈREMENT RISK-OFF 🟠"; emoji = "🟠"; }
  else                    { regime = "RISK-OFF 🔴";   emoji = "🔴"; }

  return { score: clamped, regime, emoji, details, total, raw: scores };
}

// ── RÉSUMÉ LOCAL (sans IA) ────────────────────────────────────────
function buildLocalSummary(data, riskAnalysis) {
  const vix    = data.vix?.value;
  const spread = data.yields?.spread2s10s;
  const cpi    = data.inflation?.cpiYoY;
  const unrate = data.labor?.unemploymentRate;
  const dxy    = data.dxyProxy?.value;
  const gold   = data.commodities?.gold?.value;
  const silver = data.commodities?.silver?.value;
  const wti    = data.commodities?.oil?.value;
  const btc    = data.crypto?.btcusd?.value;
  const hy     = data.credit?.hy;
  const ig     = data.credit?.ig;
  const fg     = data.sentiment?.value;
  const ratio  = (gold && silver && silver > 0) ? gold / silver : null;

  const lines = [];

  // Risk score en premier
  if (riskAnalysis) {
    lines.push(`${riskAnalysis.emoji} RÉGIME : ${riskAnalysis.regime} (score ${riskAnalysis.score}/100).`);
  }

  if (vix != null) {
    if (vix >= 30)      lines.push(`⚠️ VIX ${vix.toFixed(2)} — STRESS ÉLEVÉ.`);
    else if (vix >= 20) lines.push(`⚡ VIX ${vix.toFixed(2)} — volatilité modérée.`);
    else                lines.push(`✅ VIX ${vix.toFixed(2)} — marchés calmes.`);
  }
  if (spread != null)
    lines.push(spread > 0
      ? `📈 Courbe 2s10s +${spread.toFixed(0)}pb — positive.`
      : `🔴 Courbe INVERSÉE ${spread.toFixed(0)}pb.`);
  if (cpi != null && unrate != null)
    lines.push(`💹 CPI ${cpi.toFixed(2)}% | Chômage ${unrate.toFixed(2)}%.`);
  if (dxy != null)
    lines.push(`💵 DXY ${dxy.toFixed(2)}${dxy < 100 ? " — dollar faible." : dxy > 104 ? " — dollar fort." : "."}`);
  if (gold != null)
    lines.push(`🥇 Or $${Math.round(gold)}/oz.`);
  if (ratio != null)
    lines.push(`⚖️ Gold/Silver ${ratio.toFixed(1)}x.`);
  if (wti != null)    lines.push(`🛢️ WTI $${wti.toFixed(2)}.`);
  if (btc != null)    lines.push(`₿ BTC $${Math.round(btc).toLocaleString("en-US")}.`);
  if (hy != null && ig != null) lines.push(`📊 HY ${hy.toFixed(2)}% | IG ${ig.toFixed(2)}%.`);
  if (fg != null)     lines.push(`😱 F&G ${Math.round(fg)}/100 — ${data.sentiment?.label || ""}.`);

  return lines.join(" ");
}

// ── APPEL CLAUDE HAIKU — ULTRA-ÉCONOME ────────────────────────────
// ~300 tokens input + 220 output = environ $0.0008 par appel
async function callClaudeEco(question, contextData, maxTokens = 220) {
  if (!ANTHROPIC_KEY) throw new Error("ANTHROPIC_KEY manquante");

  const d = contextData || {};
  const risk = computeRiskScore(d);

  // Snapshot minimal des données clés
  const snap = {
    vix    : d.vix?.value?.toFixed(2),
    dxy    : d.dxyProxy?.value?.toFixed(2),
    spread : d.yields?.spread2s10s?.toFixed(0),
    us10y  : d.yields?.us10y?.toFixed(2),
    cpi    : d.inflation?.cpiYoY?.toFixed(2),
    coreCpi: d.inflation?.coreCpi?.toFixed(2),
    unr    : d.labor?.unemploymentRate?.toFixed(2),
    fed    : d.fed?.upperBound?.toFixed(2),
    btc    : d.crypto?.btcusd?.value ? Math.round(d.crypto.btcusd.value) : null,
    eth    : d.crypto?.ethusd ? Math.round(d.crypto.ethusd) : null,
    gold   : d.commodities?.gold?.value ? Math.round(d.commodities.gold.value) : null,
    silver : d.commodities?.silver?.value?.toFixed(2),
    wti    : d.commodities?.oil?.value?.toFixed(2),
    brent  : d.commodities?.brent?.value?.toFixed(2),
    copper : d.commodities?.copper?.value?.toFixed(3),
    natgas : d.commodities?.natgas?.value?.toFixed(2),
    hy     : d.credit?.hy?.toFixed(2),
    ig     : d.credit?.ig?.toFixed(2),
    fg     : d.sentiment?.value ? Math.round(d.sentiment.value) : null,
    fgLabel: d.sentiment?.label,
    cc     : d.delinquency?.creditCards?.toFixed(2),
    riskScore : risk?.score,
    riskRegime: risk?.regime,
    riskDetails: risk?.details?.slice(0, 4) // top 4 pour pas surcharger
  };

  const system = `Tu es analyste macro senior Bloomberg Terminal. Réponds EN FRANÇAIS. Style: dense, factuel, chiffré. Pas de conseil d'investissement personnel. Max ${maxTokens} tokens.`;
  const userMsg = `Données temps réel: ${JSON.stringify(snap)}\n\n${question}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model     : "claude-haiku-4-5-20251001",
      max_tokens: maxTokens,
      system,
      messages  : [{ role: "user", content: userMsg }]
    })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Anthropic ${res.status}`);
  return data.content?.[0]?.text || "Pas de réponse.";
}

// ── ROUTE : GET /api/dashboard ────────────────────────────────────
app.get("/api/dashboard", async (req, res) => {
  try {
    const ut = req.query.ut || "1M";

    const [
      dxyObs, vixObs,
      us1m, us3m, us2y, us10y, us30y,
      unemployment, fedUpper,
      cpiAll, coreCpiAll, pceCoreAll,
      eurUsd, btcUsd, ethUsd, btcDom,
      fearGreed, credit, delinquency, commodities, sectors
    ] = await Promise.all([
      safe(() => fredObs("DTWEXBGS", 5)),
      safe(() => fredObs("VIXCLS",   5)),
      safe(() => fredObs("DGS1MO",   5)),
      safe(() => fredObs("DGS3MO",   5)),
      safe(() => fredObs("DGS2",     5)),
      safe(() => fredObs("DGS10",    5)),
      safe(() => fredObs("DGS30",    5)),
      safe(() => fredObs("UNRATE",   5)),
      safe(() => fredObs("DFEDTARU", 5)),
      safe(() => fredAll("CPIAUCSL"),  []),
      safe(() => fredAll("CPILFESL"),  []),
      safe(() => fredAll("PCEPILFE"),  []),
      safe(() => fetchEURUSD()),
      safe(() => fetchCoinbase("BTC-USD")),
      safe(() => fetchCoinbase("ETH-USD")),
      safe(() => fetchBTCDominance()),
      safe(() => fetchFearGreed()),
      safe(() => fetchCreditSpreads()),
      safe(() => fetchDelinquency()),
      fetchCommodities(),
      safe(() => fetchAllSectors(ut), [])
    ]);

    const y2          = toNum(us2y?.value);
    const y10         = toNum(us10y?.value);
    const spread2s10s = (y2 != null && y10 != null) ? (y10 - y2) * 100 : null;
    const sentiment   = fearGreed || fearGreedFallback(toNum(vixObs?.value), spread2s10s);
    const cpiLatest   = getLastValid(cpiAll);

    const data = {
      dxyProxy  : { value: toNum(dxyObs?.value), date: dxyObs?.date },
      vix       : { value: toNum(vixObs?.value), date: vixObs?.date },
      yields    : {
        us1m : toNum(us1m?.value),  us3m : toNum(us3m?.value),
        us2y,                        us10y: y10,
        us30y: toNum(us30y?.value), spread2s10s
      },
      inflation : {
        cpiYoY : computeYoY(cpiAll),
        cpiIndex: toNum(cpiLatest?.value),
        coreCpi : computeYoY(coreCpiAll),
        pceCore : computeYoY(pceCoreAll),
        date    : cpiLatest?.date || null
      },
      labor       : { unemploymentRate: toNum(unemployment?.value), date: unemployment?.date },
      fed         : { upperBound: toNum(fedUpper?.value), date: fedUpper?.date },
      fx          : { eurusd: eurUsd },
      crypto      : { btcusd: btcUsd, btcDominance: btcDom, ethusd: ethUsd?.value ?? null },
      commodities,
      credit,
      sentiment,
      delinquency,
      cds: [
        { country: "USA",       value: 62,  risk: "FAIBLE"  },
        { country: "Allemagne", value: 28,  risk: "FAIBLE"  },
        { country: "France",    value: 84,  risk: "FAIBLE"  },
        { country: "Italie",    value: 168, risk: "MODÉRÉ"  },
        { country: "Espagne",   value: 71,  risk: "FAIBLE"  },
        { country: "Grèce",     value: 112, risk: "MODÉRÉ"  },
        { country: "Turquie",   value: 384, risk: "ÉLEVÉ"   },
        { country: "Brésil",    value: 220, risk: "ÉLEVÉ"   },
        { country: "Chine",     value: 95,  risk: "MODÉRÉ"  },
        { country: "Japon",     value: 44,  risk: "FAIBLE"  }
      ],
      sectors  : Array.isArray(sectors) ? sectors : [],
      sectorUT : ut,
      derived  : {
        goldSilverRatio: (() => {
          const g = commodities?.gold?.value, s = commodities?.silver?.value;
          return (g && s && s > 0) ? g / s : null;
        })(),
        vixRegime  : (() => {
          const v = toNum(vixObs?.value);
          return v == null ? null : v >= 30 ? "ÉLEVÉ 🔴" : v >= 20 ? "MODÉRÉ 🟡" : "FAIBLE 🟢";
        })(),
        curveState : spread2s10s == null ? null : spread2s10s > 0 ? "positive ✅" : "inversée 🔴"
      }
    };

    // Calcul risk score
    const riskAnalysis = computeRiskScore(data);
    data.riskAnalysis = riskAnalysis;
    data.localSummary = buildLocalSummary(data, riskAnalysis);

    res.json({
      updatedAt: new Date().toISOString(),
      sources  : { fred: "FRED St. Louis", market: "Yahoo Finance · Coinbase · Frankfurter · Alternative.me" },
      data
    });
  } catch (err) {
    console.error("DASHBOARD ERROR:", err);
    res.status(500).json({ error: "dashboard_failed", message: err.message });
  }
});

// ── ROUTE : GET /api/sectors ──────────────────────────────────────
app.get("/api/sectors", async (req, res) => {
  try {
    const ut = req.query.ut || "1M";
    if (!UT_CONFIG[ut]) return res.status(400).json({ error: "UT invalide" });
    const sectors = await safe(() => fetchAllSectors(ut), []);
    res.json({ ut, sectors, updatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ROUTE : POST /api/ai ──────────────────────────────────────────
app.post("/api/ai", async (req, res) => {
  const question  = String(req.body?.question || "").trim().slice(0, 300);
  const dashboard = req.body?.dashboard || null;
  if (!question) return res.status(400).json({ error: "Question vide." });

  try {
    const text = await callClaudeEco(question, dashboard?.data, 230);
    res.json({ text });
  } catch (err) {
    const fallback = dashboard?.data
      ? buildLocalSummary(dashboard.data, computeRiskScore(dashboard.data))
      : "IA indisponible.";
    res.json({ text: `[Résumé local]\n${fallback}`, error: err.message });
  }
});

// ── ROUTE : POST /api/ai/summary — Morning briefing ───────────────
app.post("/api/ai/summary", async (req, res) => {
  const dashboard = req.body?.dashboard || null;
  if (!dashboard?.data) return res.json({ text: "Données indisponibles." });

  try {
    const text = await callClaudeEco(
      "Synthèse d'ouverture : 1) Régime Risk-ON ou Risk-OFF et pourquoi (utilise riskScore et riskDetails) 2) 3 points macro critiques à surveiller aujourd'hui 3) Un signal d'alerte ou d'opportunité notable.",
      dashboard.data,
      340
    );
    res.json({ text });
  } catch (err) {
    res.json({ text: buildLocalSummary(dashboard.data, computeRiskScore(dashboard.data)) });
  }
});

// ── ROUTE : POST /api/ai/risk — Analyse Risk-ON/OFF dédiée ────────
app.post("/api/ai/risk", async (req, res) => {
  const dashboard = req.body?.dashboard || null;
  if (!dashboard?.data) return res.status(400).json({ error: "Pas de données." });

  const risk = computeRiskScore(dashboard.data);

  try {
    const text = await callClaudeEco(
      `Analyse détaillée du régime Risk-ON / Risk-OFF. Score calculé: ${risk?.score}/100 (${risk?.regime}). Détails par indicateur: ${JSON.stringify(risk?.details)}. Explique le régime actuel, les indicateurs contradictoires s'il y en a, et les implications pour les grandes classes d'actifs (actions, obligations, or, dollar, crypto).`,
      dashboard.data,
      280
    );
    res.json({ text, riskScore: risk?.score, riskRegime: risk?.regime, details: risk?.details });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── HEALTH ────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({
  ok: true, ts: new Date().toISOString(),
  cache: CACHE.size,
  keys: [...CACHE.keys()]
}));

app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, () => console.log(`◆ TERMINAL MACRO v3.1 — port ${PORT} — or via Yahoo GC=F`));
