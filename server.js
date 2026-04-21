/*
  ◆ TERMINAL MACRO v3.0
  ─────────────────────────────────────────────────────────────────
  Sources de données :
    • FRED St. Louis  → taux, inflation, chômage, délinquance, or, pétrole, cuivre, gaz
    • Coinbase        → BTC / ETH (prix spot temps réel)
    • Frankfurter     → EUR/USD et autres crosses FX
    • Alternative.me  → Fear & Greed Index crypto
    • Yahoo Finance   → Secteurs S&P (ETFs XL*), Silver, Brent, métaux
  IA : Anthropic Claude — mode ultra-économe en tokens
  ─────────────────────────────────────────────────────────────────
*/

const express = require("express");
const path    = require("path");

const app  = express();
const PORT = process.env.PORT || 3000;

// ── CLÉS API ──────────────────────────────────────────────────────
const FRED_KEY      = process.env.FRED_API_KEY   || "2945c843ac2ef54c3d1272b9f9cc2747";
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY  || "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";

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json({ limit: "2mb" }));

// ── CACHE côté serveur (évite re-fetch inutiles = économise bandwidth + IA) ──
const CACHE = new Map();
const CACHE_TTL = {
  fred_daily  : 4  * 60 * 60 * 1000,  // 4h  — données FRED journalières
  fred_monthly: 12 * 60 * 60 * 1000,  // 12h — données mensuelles
  crypto      : 60 * 1000,             // 1 min — crypto
  yahoo       : 10 * 60 * 1000,        // 10 min — Yahoo
  fng         : 30 * 60 * 1000,        // 30 min — Fear&Greed
};

function cacheGet(key) {
  const e = CACHE.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > e.ttl) { CACHE.delete(key); return null; }
  return e.data;
}
function cacheSet(key, data, ttl) {
  CACHE.set(key, { data, ts: Date.now(), ttl });
  return data;
}

// ── UTILITAIRES ───────────────────────────────────────────────────
function toNum(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchJson(url, opts = {}) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 14000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal, ...opts,
      headers: { "User-Agent": "Mozilla/5.0 MacroTerminal/3.0", Accept: "application/json", ...(opts.headers || {}) }
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } finally { clearTimeout(timer); }
}

async function safe(fn, fallback = null) {
  try { return await fn(); }
  catch (e) { console.warn("[SAFE]", e.message?.slice(0, 100)); return fallback; }
}

// ── FRED ──────────────────────────────────────────────────────────
async function fredObs(seriesId, limit = 10) {
  const cached = cacheGet(`fred_${seriesId}`);
  if (cached) return cached;

  const url = `https://api.stlouisfed.org/fred/series/observations`
    + `?series_id=${encodeURIComponent(seriesId)}`
    + `&api_key=${encodeURIComponent(FRED_KEY)}`
    + `&sort_order=desc&limit=${limit}&file_type=json`;
  const data = await fetchJson(url);
  const obs  = Array.isArray(data.observations)
    ? data.observations.find(o => o.value !== "." && o.value !== "")
    : null;
  const result = { value: toNum(obs?.value), date: obs?.date || null };
  return cacheSet(`fred_${seriesId}`, result, CACHE_TTL.fred_daily);
}

async function fredAll(seriesId) {
  const cached = cacheGet(`fredAll_${seriesId}`);
  if (cached) return cached;
  const url = `https://api.stlouisfed.org/fred/series/observations`
    + `?series_id=${encodeURIComponent(seriesId)}`
    + `&api_key=${encodeURIComponent(FRED_KEY)}&file_type=json`;
  const data = await fetchJson(url);
  const obs  = Array.isArray(data.observations) ? data.observations : [];
  return cacheSet(`fredAll_${seriesId}`, obs, CACHE_TTL.fred_monthly);
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
  const valid = observations.filter(o => o.value !== "." && o.value !== "");
  if (valid.length < 13) return null;
  const latest = valid[valid.length - 1];
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
  if (oldVal === null || oldVal === 0) return null;
  return ((latestVal / oldVal) - 1) * 100;
}

// ── CRYPTO ────────────────────────────────────────────────────────
async function fetchCoinbase(pair) {
  const cached = cacheGet(`cb_${pair}`);
  if (cached) return cached;
  const d = await fetchJson(`https://api.coinbase.com/v2/prices/${pair}/spot`);
  const v = toNum(d?.data?.amount);
  if (v === null) throw new Error(`${pair} no data`);
  const result = { value: v, ts: new Date().toISOString() };
  return cacheSet(`cb_${pair}`, result, CACHE_TTL.crypto);
}

async function fetchBTCDominance() {
  const cached = cacheGet("btcdom");
  if (cached) return cached;
  const d = await fetchJson("https://api.coingecko.com/api/v3/global");
  const v = toNum(d?.data?.market_cap_percentage?.btc);
  return cacheSet("btcdom", v, CACHE_TTL.yahoo);
}

// ── FX ────────────────────────────────────────────────────────────
async function fetchEURUSD() {
  const cached = cacheGet("eurusd");
  if (cached) return cached;
  const d = await fetchJson("https://api.frankfurter.app/latest?from=EUR&to=USD");
  const v = toNum(d?.rates?.USD);
  if (v === null) throw new Error("EUR/USD no data");
  const result = { value: v, ts: new Date().toISOString() };
  return cacheSet("eurusd", result, CACHE_TTL.yahoo);
}

// ── FEAR & GREED ──────────────────────────────────────────────────
async function fetchFearGreed() {
  const cached = cacheGet("fng");
  if (cached) return cached;
  const d   = await fetchJson("https://api.alternative.me/fng/?limit=1");
  const row = d?.data?.[0];
  if (!row) throw new Error("FNG no data");
  const result = { value: toNum(row.value), label: row.value_classification || null };
  return cacheSet("fng", result, CACHE_TTL.fng);
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
  if (cached) return cached;
  const [hy, ig] = await Promise.all([
    safe(() => fredObs("BAMLH0A0HYM2", 5)),
    safe(() => fredObs("BAMLC0A0CM",   5))
  ]);
  const result = {
    hy: hy?.value, ig: ig?.value,
    ratio: (hy?.value && ig?.value && ig.value !== 0) ? hy.value / ig.value : null,
    date: hy?.date || null
  };
  return cacheSet("credit", result, CACHE_TTL.fred_daily);
}

// ── DÉLINQUANCE — SÉRIES FRED RÉELLES ─────────────────────────────
async function fetchDelinquency() {
  const cached = cacheGet("delinquency");
  if (cached) return cached;
  const [cc, auto, re, sl, cre] = await Promise.all([
    safe(() => fredObs("DRCCLACBS",  5)),
    safe(() => fredObs("DRAUTONSA",  5)),
    safe(() => fredObs("DRSFRMACBS", 5)),
    safe(() => fredObs("DRSREACBS",  5)),
    safe(() => fredObs("DRCLACBS",   5))
  ]);
  const result = {
    creditCards : cc?.value  ?? null,
    autoLoans   : auto?.value ?? null,
    realEstate  : re?.value   ?? null,
    studentLoans: sl?.value   ?? null,
    commercialRe: cre?.value  ?? null,
    date        : cc?.date    || auto?.date || null
  };
  return cacheSet("delinquency", result, CACHE_TTL.fred_monthly);
}

// ── SECTEURS S&P — MULTI-TIMEFRAME via Yahoo Finance ──────────────
const SECTOR_ETFS = [
  { name: "Energie",     sym: "XLE"  },
  { name: "Santé",       sym: "XLV"  },
  { name: "Utilities",   sym: "XLU"  },
  { name: "Finance",     sym: "XLF"  },
  { name: "Industrie",   sym: "XLI"  },
  { name: "Matériaux",   sym: "XLB"  },
  { name: "Conso. disc.",sym: "XLY"  },
  { name: "Tech",        sym: "XLK"  },
  { name: "Immo.",       sym: "XLRE" },
  { name: "Conso. base", sym: "XLP"  },
  { name: "Telecom",     sym: "XLC"  }
];

const UT_CONFIG = {
  "1D" : { range: "5d",  interval: "1d",  label: "1 Jour"   },
  "1W" : { range: "1mo", interval: "1d",  label: "1 Semaine"},
  "1M" : { range: "1mo", interval: "1d",  label: "1 Mois"   },
  "3M" : { range: "3mo", interval: "1d",  label: "3 Mois"   },
  "6M" : { range: "6mo", interval: "1wk", label: "6 Mois"   },
  "1Y" : { range: "1y",  interval: "1mo", label: "1 An"     },
  "YTD": { range: "ytd", interval: "1d",  label: "YTD"      }
};

async function fetchSectorForUT(sym, ut) {
  const cfg   = UT_CONFIG[ut] || UT_CONFIG["1M"];
  const ckey  = `sector_${sym}_${ut}`;
  const cached = cacheGet(ckey);
  if (cached !== null) return cached;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}`
    + `?range=${cfg.range}&interval=${cfg.interval}&includePrePost=false`;
  const d      = await fetchJson(url);
  const closes = d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(closes) || closes.length < 2) return cacheSet(ckey, null, CACHE_TTL.yahoo);

  let first, last;
  if (ut === "1D") {
    // Variation du jour : dernier close vs avant-dernier close
    const valid = closes.filter(v => v != null);
    if (valid.length < 2) return cacheSet(ckey, null, CACHE_TTL.yahoo);
    last  = valid[valid.length - 1];
    first = valid[valid.length - 2];
  } else {
    first = closes.find(v => v != null);
    last  = [...closes].reverse().find(v => v != null);
  }

  if (first == null || last == null || first === 0) return cacheSet(ckey, null, CACHE_TTL.yahoo);
  const perf = ((last / first) - 1) * 100;
  return cacheSet(ckey, perf, CACHE_TTL.yahoo);
}

async function fetchAllSectors(ut = "1M") {
  const results = await Promise.all(
    SECTOR_ETFS.map(s => safe(() => fetchSectorForUT(s.sym, ut)))
  );
  return SECTOR_ETFS.map((s, i) => ({ name: s.name, sym: s.sym, value: results[i] }))
    .sort((a, b) => (b.value ?? -99) - (a.value ?? -99));
}

// ── COMMODITÉS — FRED + Yahoo fallback ────────────────────────────
async function fetchCommodities() {
  const cached = cacheGet("commodities");
  if (cached) return cached;

  const [goldF, silverF, wtiF, brentF, copperF, natgasF] = await Promise.all([
    safe(() => fredObs("GOLDAMGBD228NLBM", 5)),
    safe(() => fredObs("SLVPRUSD",         5)),
    safe(() => fredObs("DCOILWTICO",       5)),
    safe(() => fredObs("DCOILBRENTEU",     5)),
    safe(() => fredObs("PCOPPUSDM",        5)),
    safe(() => fredObs("DHHNGSP",          5))
  ]);

  // Yahoo fallbacks pour futures
  async function yahooClose(sym) {
    const d = await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=5d&interval=1d`);
    const c = d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
    return Array.isArray(c) ? [...c].reverse().find(v => v != null) ?? null : null;
  }

  const [yGold, ySilver, yWTI, yBrent, yCopper, yGas] = await Promise.all([
    goldF?.value   == null ? safe(() => yahooClose("GC=F"))  : Promise.resolve(null),
    silverF?.value == null ? safe(() => yahooClose("SI=F"))  : Promise.resolve(null),
    wtiF?.value    == null ? safe(() => yahooClose("CL=F"))  : Promise.resolve(null),
    brentF?.value  == null ? safe(() => yahooClose("BZ=F"))  : Promise.resolve(null),
    copperF?.value == null ? safe(() => yahooClose("HG=F"))  : Promise.resolve(null),
    natgasF?.value == null ? safe(() => yahooClose("NG=F"))  : Promise.resolve(null)
  ]);

  const result = {
    gold  : { value: goldF?.value   ?? yGold,   date: goldF?.date   || null },
    silver: { value: silverF?.value ?? ySilver, date: silverF?.date || null },
    oil   : { value: wtiF?.value    ?? yWTI,    date: wtiF?.date    || null },
    brent : { value: brentF?.value  ?? yBrent,  date: brentF?.date  || null },
    copper: { value: copperF?.value ?? yCopper, date: copperF?.date || null },
    natgas: { value: natgasF?.value ?? yGas,    date: natgasF?.date || null }
  };
  return cacheSet("commodities", result, CACHE_TTL.fred_daily);
}

// ── RÉSUMÉ IA — ULTRA-ÉCONOME EN TOKENS ──────────────────────────
// Stratégie : prompt ultra-court + contexte JSON compact + max_tokens limité
// Estimation : ~300 tokens input + 200 tokens output ≈ 0.002$ par appel avec Haiku
async function callClaudeEco(question, contextData, maxTokens = 220) {
  if (!ANTHROPIC_KEY) throw new Error("ANTHROPIC_KEY manquante");

  // Contexte minimal — uniquement les valeurs numériques clés
  const d = contextData || {};
  const snap = {
    vix   : d.vix?.value,
    dxy   : d.dxyProxy?.value,
    s10s  : d.yields?.spread2s10s,
    us10y : d.yields?.us10y,
    cpi   : d.inflation?.cpiYoY,
    unr   : d.labor?.unemploymentRate,
    fed   : d.fed?.upperBound,
    btc   : d.crypto?.btcusd?.value ? Math.round(d.crypto.btcusd.value) : null,
    gold  : d.commodities?.gold?.value ? Math.round(d.commodities.gold.value) : null,
    wti   : d.commodities?.oil?.value,
    hy    : d.credit?.hy,
    ig    : d.credit?.ig,
    fg    : d.sentiment?.value,
    dlinCC: d.delinquency?.creditCards,
    dlinAu: d.delinquency?.autoLoans,
    // Top 3 secteurs (gagnants + perdants)
    sec   : Array.isArray(d.sectors)
      ? [...d.sectors].sort((a,b)=>(b.value??-99)-(a.value??-99)).slice(0,3)
          .map(s=>`${s.name}:${s.value?.toFixed(1)}%`)
      : []
  };

  // Prompt système hyper-court pour minimiser les tokens
  const system = `Analyste macro Bloomberg. FR. Dense. Facts chiffrés. Max ${maxTokens} tokens. Pas de conseil perso.`;

  // Contexte injecté dans le message user (plus court qu'un system long)
  const userMsg = `Données: ${JSON.stringify(snap)}\n\n${question}`;

  const res  = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model      : "claude-haiku-4-5-20251001",  // Haiku = 20x moins cher que Sonnet
      max_tokens : maxTokens,
      system,
      messages   : [{ role: "user", content: userMsg }]
    })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Erreur Anthropic");
  return data.content?.[0]?.text || "Pas de réponse.";
}

// ── RÉSUMÉ AUTOMATIQUE (généré 1x par cycle de données) ───────────
function buildLocalSummary(data) {
  const vix    = data.vix?.value;
  const dxy    = data.dxyProxy?.value;
  const spread = data.yields?.spread2s10s;
  const btc    = data.crypto?.btcusd?.value;
  const unrate = data.labor?.unemploymentRate;
  const cpi    = data.inflation?.cpiYoY;
  const hy     = data.credit?.hy;
  const ig     = data.credit?.ig;
  const gold   = data.commodities?.gold?.value;
  const silver = data.commodities?.silver?.value;
  const wti    = data.commodities?.oil?.value;
  const fg     = data.sentiment?.value;
  const ratio  = (gold && silver && silver > 0) ? gold / silver : null;

  const lines = [];

  if (vix != null) {
    if (vix >= 30) lines.push(`⚠️ STRESS ÉLEVÉ — VIX ${vix.toFixed(2)} (peur extrême).`);
    else if (vix >= 20) lines.push(`⚡ VIX ${vix.toFixed(2)} — volatilité modérée.`);
    else lines.push(`✅ VIX ${vix.toFixed(2)} — marchés calmes.`);
  }
  if (spread != null) {
    const s = spread.toFixed(0);
    lines.push(spread > 0
      ? `📈 Courbe 2s10s +${s}pb — normalisation post-inversion.`
      : `🔴 Courbe 2s10s ${s}pb — INVERSÉE (signal récession).`);
  }
  if (cpi != null && unrate != null)
    lines.push(`💹 CPI ${cpi.toFixed(2)}% | Chômage ${unrate.toFixed(2)}%.`);
  if (dxy != null)
    lines.push(`💵 DXY ${dxy.toFixed(2)}${dxy < 100 ? " — dollar faible, matières premières haussières." : dxy > 104 ? " — dollar fort." : "."}`);
  if (gold != null)
    lines.push(`🥇 Or $${Math.round(gold)}/oz${gold > 3200 ? " — ATH historique." : "."}`);
  if (ratio != null)
    lines.push(`⚖️ Gold/Silver ${ratio.toFixed(1)}x${ratio > 90 ? " — argent sous-évalué." : "."}`);
  if (wti != null) lines.push(`🛢️ WTI $${wti.toFixed(2)}/bbl.`);
  if (btc != null) lines.push(`₿ BTC $${Math.round(btc).toLocaleString("en-US")}.`);
  if (hy != null && ig != null) lines.push(`📊 Spreads HY ${hy.toFixed(2)}% | IG ${ig.toFixed(2)}%.`);
  if (fg != null) {
    const fgl = data.sentiment?.label || "";
    lines.push(`😱 Fear & Greed ${Math.round(fg)}/100 — ${fgl}.`);
  }
  return lines.join(" ");
}

// ── ROUTE : GET /api/dashboard ────────────────────────────────────
app.get("/api/dashboard", async (req, res) => {
  try {
    const ut = req.query.ut || "1M"; // timeframe secteurs

    const [
      dxyObs, vixObs,
      us1m, us3m, us2y, us10y, us30y,
      unemployment, fedUpper,
      cpiAll, coreCpiAll, pceCoreAll,
      eurUsd, btcUsd, ethUsd, btcDom,
      fearGreed, credit, delinquency, commodities,
      sectors
    ] = await Promise.all([
      safe(() => fredObs("DTWEXBGS",  5)),
      safe(() => fredObs("VIXCLS",    5)),
      safe(() => fredObs("DGS1MO",    5)),
      safe(() => fredObs("DGS3MO",    5)),
      safe(() => fredObs("DGS2",      5)),
      safe(() => fredObs("DGS10",     5)),
      safe(() => fredObs("DGS30",     5)),
      safe(() => fredObs("UNRATE",    5)),
      safe(() => fredObs("DFEDTARU",  5)),
      safe(() => fredAll("CPIAUCSL"),    []),
      safe(() => fredAll("CPILFESL"),    []),
      safe(() => fredAll("PCEPILFE"),    []),
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

    const y2  = toNum(us2y?.value),  y10 = toNum(us10y?.value);
    const spread2s10s = (y2 != null && y10 != null) ? (y10 - y2) * 100 : null;

    const sentiment = fearGreed || fearGreedFallback(toNum(vixObs?.value), spread2s10s);

    const cpiLatest = getLastValid(cpiAll);
    const data = {
      dxyProxy  : { value: toNum(dxyObs?.value), date: dxyObs?.date },
      vix       : { value: toNum(vixObs?.value), date: vixObs?.date },
      yields    : {
        us1m : toNum(us1m?.value),  us3m : toNum(us3m?.value),
        us2y : y2,                  us10y: y10,
        us30y: toNum(us30y?.value), spread2s10s
      },
      inflation : {
        cpiYoY: computeYoY(cpiAll), cpiIndex: toNum(cpiLatest?.value),
        coreCpi: computeYoY(coreCpiAll), pceCore: computeYoY(pceCoreAll),
        date: cpiLatest?.date || null
      },
      labor     : { unemploymentRate: toNum(unemployment?.value), date: unemployment?.date },
      fed       : { upperBound: toNum(fedUpper?.value), date: fedUpper?.date },
      fx        : { eurusd: eurUsd },
      crypto    : { btcusd: btcUsd, btcDominance: btcDom, ethusd: ethUsd?.value ?? null },
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
      sectors: Array.isArray(sectors) ? sectors : [],
      sectorUT: ut,
      derived: {
        goldSilverRatio: (() => {
          const g = commodities?.gold?.value, s = commodities?.silver?.value;
          return (g && s && s > 0) ? g / s : null;
        })(),
        vixRegime: (() => {
          const v = toNum(vixObs?.value);
          return v == null ? null : v >= 30 ? "ÉLEVÉ 🔴" : v >= 20 ? "MODÉRÉ 🟡" : "FAIBLE 🟢";
        })(),
        curveState: spread2s10s == null ? null : spread2s10s > 0 ? "positive ✅" : "inversée 🔴"
      }
    };

    // Résumé local (sans IA) pour l'affichage immédiat
    data.localSummary = buildLocalSummary(data);

    res.json({
      updatedAt: new Date().toISOString(),
      sources  : { fred: "FRED St. Louis", market: "Coinbase · Frankfurter · Yahoo Finance · Alternative.me" },
      data
    });
  } catch (err) {
    console.error("DASHBOARD ERROR:", err);
    res.status(500).json({ error: "dashboard_failed", message: err.message });
  }
});

// ── ROUTE : GET /api/sectors?ut=1D ────────────────────────────────
// Endpoint dédié pour changer l'UT des secteurs sans tout recharger
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
// Mode ultra-économe : Haiku, prompt court, max 220 tokens output
app.post("/api/ai", async (req, res) => {
  const question = String(req.body?.question || "").trim().slice(0, 300); // limite la question
  const dashboard = req.body?.dashboard || null;

  if (!question) return res.status(400).json({ error: "Question vide." });

  try {
    const text = await callClaudeEco(question, dashboard?.data, 220);
    res.json({ text });
  } catch (err) {
    // Fallback : résumé local si IA indisponible
    const fallback = dashboard?.data ? buildLocalSummary(dashboard.data) : "IA indisponible.";
    res.json({ text: `[Fallback local] ${fallback}`, error: err.message });
  }
});

// ── ROUTE : POST /api/ai/summary ──────────────────────────────────
// Résumé d'ouverture — légèrement plus long (350 tokens), appelé 1 fois au démarrage
app.post("/api/ai/summary", async (req, res) => {
  const dashboard = req.body?.dashboard || null;
  if (!dashboard?.data) return res.json({ text: buildLocalSummary({}) });

  try {
    const text = await callClaudeEco(
      "Synthèse marché global à l'ouverture : quels sont les 3-4 points macro les plus importants à surveiller aujourd'hui ? Signaux d'alerte, opportunités, tendances.",
      dashboard.data,
      320
    );
    res.json({ text });
  } catch (err) {
    res.json({ text: buildLocalSummary(dashboard.data) });
  }
});

// ── HEALTH ────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ ok: true, ts: new Date().toISOString(), cache: CACHE.size }));

app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`◆ TERMINAL MACRO v3.0 — port ${PORT}`));
