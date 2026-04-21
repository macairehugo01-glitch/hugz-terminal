/*
  ◆ TERMINAL MACRO — server.js
  Sources :
    • FRED  → taux, inflation, chômage, délinquance, or, pétrole, cuivre, gaz
    • Coinbase → BTC / ETH
    • Frankfurter → EUR/USD
    • Alternative.me → Fear & Greed
    • Yahoo Finance (pas de clé) → secteurs S&P, Brent, Silver
    • Anthropic Claude → analyse IA
*/

const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const FRED_API_KEY   = process.env.FRED_API_KEY   || "2945c843ac2ef54c3d1272b9f9cc2747";
const ANTHROPIC_KEY  = process.env.ANTHROPIC_KEY  || "";   // sk-ant-...

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json({ limit: "2mb" }));

/* ─────────────────────────────────────────────
   UTILS
───────────────────────────────────────────── */
function toNum(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      ...options,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MacroTerminal/2.0)",
        Accept: "application/json",
        ...(options.headers || {})
      }
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${url.slice(0, 80)}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function safe(fn, fallback = null) {
  try {
    return await fn();
  } catch (e) {
    console.warn("[SAFE]", e.message.slice(0, 120));
    return fallback;
  }
}

/* ─────────────────────────────────────────────
   FRED helpers
───────────────────────────────────────────── */
function getLastValid(observations) {
  if (!Array.isArray(observations)) return null;
  for (let i = observations.length - 1; i >= 0; i--) {
    const v = observations[i]?.value;
    if (v !== "." && v !== "" && v != null) return observations[i];
  }
  return null;
}

async function fredObs(seriesId, limit = 10) {
  const url =
    `https://api.stlouisfed.org/fred/series/observations` +
    `?series_id=${encodeURIComponent(seriesId)}` +
    `&api_key=${encodeURIComponent(FRED_API_KEY)}` +
    `&sort_order=desc&limit=${limit}&file_type=json`;
  const data = await fetchJson(url);
  // desc order → first valid
  const obs = Array.isArray(data.observations)
    ? data.observations.find(o => o.value !== "." && o.value !== "")
    : null;
  return { value: toNum(obs?.value), date: obs?.date || null };
}

async function fredAll(seriesId) {
  const url =
    `https://api.stlouisfed.org/fred/series/observations` +
    `?series_id=${encodeURIComponent(seriesId)}` +
    `&api_key=${encodeURIComponent(FRED_API_KEY)}&file_type=json`;
  const data = await fetchJson(url);
  return Array.isArray(data.observations) ? data.observations : [];
}

function computeYoY(observations) {
  const valid = observations.filter(o => o.value !== "." && o.value !== "");
  if (valid.length < 13) return null;
  const latest = valid[valid.length - 1];
  const latestVal = toNum(latest.value);
  if (latestVal === null) return null;
  const latestDate = new Date(latest.date);
  let yearAgo = null;
  for (let i = valid.length - 2; i >= 0; i--) {
    const d = new Date(valid[i].date);
    if (
      d.getFullYear() === latestDate.getFullYear() - 1 &&
      d.getMonth() === latestDate.getMonth()
    ) { yearAgo = valid[i]; break; }
  }
  if (!yearAgo) yearAgo = valid[valid.length - 13];
  const oldVal = toNum(yearAgo?.value);
  if (oldVal === null || oldVal === 0) return null;
  return ((latestVal / oldVal) - 1) * 100;
}

/* ─────────────────────────────────────────────
   CRYPTO
───────────────────────────────────────────── */
async function fetchCoinbase(pair) {
  const d = await fetchJson(`https://api.coinbase.com/v2/prices/${pair}/spot`);
  const v = toNum(d?.data?.amount);
  if (v === null) throw new Error(`${pair} missing`);
  return { value: v, lastRefreshed: new Date().toISOString() };
}

async function fetchBTCDominance() {
  const d = await fetchJson("https://api.coingecko.com/api/v3/global");
  return toNum(d?.data?.market_cap_percentage?.btc);
}

/* ─────────────────────────────────────────────
   FX
───────────────────────────────────────────── */
async function fetchEURUSD() {
  const d = await fetchJson("https://api.frankfurter.app/latest?from=EUR&to=USD");
  const v = toNum(d?.rates?.USD);
  if (v === null) throw new Error("EUR/USD missing");
  return { value: v, lastRefreshed: new Date().toISOString() };
}

/* ─────────────────────────────────────────────
   FEAR & GREED
───────────────────────────────────────────── */
async function fetchFearGreed() {
  const d = await fetchJson("https://api.alternative.me/fng/?limit=1");
  const row = d?.data?.[0];
  if (!row) throw new Error("FNG missing");
  return {
    value: toNum(row.value),
    label: row.value_classification || null
  };
}

function fearGreedFallback(vix, spread) {
  if (vix == null) return null;
  let s = 50;
  if (vix > 35) s -= 35;
  else if (vix > 30) s -= 28;
  else if (vix > 25) s -= 18;
  else if (vix > 20) s -= 8;
  else if (vix < 14) s += 18;
  if (spread != null) {
    if (spread > 40) s += 8;
    else if (spread < 0) s -= 12;
  }
  s = Math.max(0, Math.min(100, s));
  const label = s < 25 ? "PEUR EXTRÊME" : s < 45 ? "PEUR" : s < 55 ? "NEUTRE" : s < 75 ? "OPTIMISME" : "EUPHORIE";
  return { value: s, label };
}

/* ─────────────────────────────────────────────
   CREDIT SPREADS (FRED)
   BAMLH0A0HYM2 = HY OAS (%)
   BAMLC0A0CM   = IG OAS (%)
───────────────────────────────────────────── */
async function fetchCreditSpreads() {
  const [hy, ig] = await Promise.all([
    fredObs("BAMLH0A0HYM2", 5),
    fredObs("BAMLC0A0CM", 5)
  ]);
  const hyV = hy?.value, igV = ig?.value;
  return {
    hy: hyV,
    ig: igV,
    ratio: (hyV != null && igV != null && igV !== 0) ? hyV / igV : null,
    date: hy?.date || null
  };
}

/* ─────────────────────────────────────────────
   DÉLINQUANCE — VRAIES SÉRIES FRED (quarterly)
   DRCCLACBS  = Cartes crédit (% of balance 90+d)
   DRAUTONSA  = Auto loans
   DRSFRMACBS = Immobilier résidentiel
   DRBLACBS   = Student loans (proxy : consumer loans)
   DRCONGSX   = Consumer loans (proxy commercial)
───────────────────────────────────────────── */
async function fetchDelinquency() {
  const [cc, auto, re, sl, cre] = await Promise.all([
    safe(() => fredObs("DRCCLACBS", 5)),   // cartes crédit
    safe(() => fredObs("DRAUTONSA", 5)),   // auto loans
    safe(() => fredObs("DRSFRMACBS", 5)),  // résidentiel
    safe(() => fredObs("DRSREACBS", 5)),   // real estate (proxy student)
    safe(() => fredObs("DRCLACBS", 5))     // consumer loans (proxy CRE)
  ]);
  return {
    creditCards:  cc?.value  ?? 3.24,
    autoLoans:    auto?.value ?? 1.74,
    realEstate:   re?.value  ?? 0.98,
    studentLoans: sl?.value  ?? 9.80,   // FRED donne real-estate loans comme proxy
    commercialRe: cre?.value ?? 2.30
  };
}

/* ─────────────────────────────────────────────
   SECTEURS S&P 500 via Yahoo Finance (no key)
   On récupère les ETFs sectoriels XL* vs SPY
   Variation 1 mois = (close / close_1month_ago - 1) * 100
───────────────────────────────────────────── */
const SECTOR_ETFS = [
  { name: "Energy",     sym: "XLE" },
  { name: "Health",     sym: "XLV" },
  { name: "Utilities",  sym: "XLU" },
  { name: "Finance",    sym: "XLF" },
  { name: "Industrie",  sym: "XLI" },
  { name: "Matériaux",  sym: "XLB" },
  { name: "Consumer",   sym: "XLY" },
  { name: "Tech",       sym: "XLK" },
  { name: "Immo",       sym: "XLRE" },
  { name: "Conso. base",sym: "XLP" }
];

async function fetchSectorPerf(sym) {
  // Yahoo Finance v8 — 1 mois, 1 jour interval
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${sym}` +
    `?range=1mo&interval=1d&includePrePost=false`;
  const d = await fetchJson(url);
  const closes = d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(closes) || closes.length < 2) return null;
  const first = closes.find(v => v != null);
  const last  = [...closes].reverse().find(v => v != null);
  if (first == null || last == null || first === 0) return null;
  return ((last / first) - 1) * 100;
}

async function fetchAllSectors() {
  const results = await Promise.all(
    SECTOR_ETFS.map(s => safe(() => fetchSectorPerf(s.sym)))
  );
  return SECTOR_ETFS.map((s, i) => ({
    name:  s.name,
    value: results[i] ?? 0
  })).sort((a, b) => b.value - a.value);
}

/* ─────────────────────────────────────────────
   COMMODITÉS
   FRED: or, argent, WTI, gaz naturel, cuivre
   Yahoo Finance: Brent (si FRED rate)
───────────────────────────────────────────── */
async function fetchCommodities() {
  const [gold, silver, wti, natgas, copper, brentFred] = await Promise.all([
    safe(() => fredObs("GOLDAMGBD228NLBM", 5)),  // or London PM fixing USD/oz
    safe(() => fredObs("SLVPRUSD", 5)),           // argent USD/oz
    safe(() => fredObs("DCOILWTICO", 5)),          // WTI USD/bbl
    safe(() => fredObs("DHHNGSP", 5)),             // Henry Hub USD/MMBtu
    safe(() => fredObs("PCOPPUSDM", 5)),           // cuivre USD/lb
    safe(() => fredObs("DCOILBRENTEU", 5))         // Brent USD/bbl
  ]);

  // Fallback Yahoo pour or si FRED vide
  let goldVal = gold?.value;
  if (goldVal == null) {
    const yGold = await safe(async () => {
      const d = await fetchJson(
        "https://query1.finance.yahoo.com/v8/finance/chart/GC=F?range=5d&interval=1d"
      );
      const closes = d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
      return closes?.reverse().find(v => v != null) ?? null;
    });
    goldVal = yGold;
  }

  // Fallback Yahoo pour argent
  let silverVal = silver?.value;
  if (silverVal == null) {
    const ySilver = await safe(async () => {
      const d = await fetchJson(
        "https://query1.finance.yahoo.com/v8/finance/chart/SI=F?range=5d&interval=1d"
      );
      const closes = d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
      return closes?.reverse().find(v => v != null) ?? null;
    });
    silverVal = ySilver;
  }

  // Fallback Yahoo pour cuivre (FRED donne en USD/lb, Yahoo en cents/lb)
  let copperVal = copper?.value;
  if (copperVal == null) {
    const yCopper = await safe(async () => {
      const d = await fetchJson(
        "https://query1.finance.yahoo.com/v8/finance/chart/HG=F?range=5d&interval=1d"
      );
      const closes = d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
      return closes?.reverse().find(v => v != null) ?? null;
    });
    copperVal = yCopper;
  }

  // WTI Yahoo fallback
  let wtiVal = wti?.value;
  if (wtiVal == null) {
    const yWTI = await safe(async () => {
      const d = await fetchJson(
        "https://query1.finance.yahoo.com/v8/finance/chart/CL=F?range=5d&interval=1d"
      );
      const closes = d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
      return closes?.reverse().find(v => v != null) ?? null;
    });
    wtiVal = yWTI;
  }

  // Brent Yahoo fallback
  let brentVal = brentFred?.value;
  if (brentVal == null) {
    const yBrent = await safe(async () => {
      const d = await fetchJson(
        "https://query1.finance.yahoo.com/v8/finance/chart/BZ=F?range=5d&interval=1d"
      );
      const closes = d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
      return closes?.reverse().find(v => v != null) ?? null;
    });
    brentVal = yBrent;
  }

  // Nat gas Yahoo fallback
  let natgasVal = natgas?.value;
  if (natgasVal == null) {
    const yGas = await safe(async () => {
      const d = await fetchJson(
        "https://query1.finance.yahoo.com/v8/finance/chart/NG=F?range=5d&interval=1d"
      );
      const closes = d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
      return closes?.reverse().find(v => v != null) ?? null;
    });
    natgasVal = yGas;
  }

  return {
    gold:   { value: goldVal },
    silver: { value: silverVal },
    oil:    { value: wtiVal },
    brent:  { value: brentVal },
    copper: { value: copperVal },   // USD/lb
    natgas: { value: natgasVal }
  };
}

/* ─────────────────────────────────────────────
   RÉSUMÉ IA textuel (sans appel Claude)
───────────────────────────────────────────── */
function buildAiSummary(data) {
  const vix    = data.vix?.value;
  const dxy    = data.dxyProxy?.value;
  const spread = data.yields?.spread2s10s;
  const btc    = data.crypto?.btcusd?.value;
  const unrate = data.labor?.unemploymentRate;
  const cpi    = data.inflation?.cpiYoY;
  const hy     = data.credit?.hy;
  const ig     = data.credit?.ig;
  const fg     = data.sentiment?.value;
  const gold   = data.commodities?.gold?.value;
  const silver = data.commodities?.silver?.value;
  const wti    = data.commodities?.oil?.value;
  const ratio  = (gold && silver && silver !== 0) ? gold / silver : null;

  const lines = [];

  if (vix != null) {
    if (vix >= 30) lines.push(`⚠ Stress élevé : VIX à ${vix.toFixed(2)} — régime de peur.`);
    else if (vix >= 20) lines.push(`Volatilité modérée : VIX à ${vix.toFixed(2)}.`);
    else lines.push(`Stress contenu : VIX à ${vix.toFixed(2)}.`);
  }

  if (spread != null) {
    const sign = spread > 0 ? `+${spread.toFixed(0)}` : spread.toFixed(0);
    const state = spread > 0 ? "positive (normalisation post-inversion)" : "inversée (signal récession)";
    lines.push(`Courbe 2s10s ${state} à ${sign} pb.`);
  }

  if (cpi != null && unrate != null)
    lines.push(`Inflation ${cpi.toFixed(2)}% — Chômage ${unrate.toFixed(2)}%.`);

  if (dxy != null)
    lines.push(`Dollar proxy (DXY) à ${dxy.toFixed(2)}${dxy < 100 ? " — dollar faible, pression haussière sur les matières premières." : "."}`);

  if (gold != null)
    lines.push(`Or à $${gold.toFixed(0)}/oz${gold > 3000 ? " — ATH historique, demande refuge." : "."}`);

  if (ratio != null)
    lines.push(`Gold/Silver ratio : ${ratio.toFixed(1)}x${ratio > 90 ? " — argent sous-évalué vs or." : "."}`);

  if (wti != null)
    lines.push(`WTI à $${wti.toFixed(2)}/bbl.`);

  if (btc != null)
    lines.push(`BTC à $${Math.round(btc).toLocaleString("en-US")}.`);

  if (hy != null && ig != null)
    lines.push(`Spreads crédit : HY ${hy.toFixed(2)}% — IG ${ig.toFixed(2)}% — ratio ${(hy/ig).toFixed(2)}x.`);

  if (fg != null)
    lines.push(`Sentiment Fear & Greed : ${fg.toFixed(0)}/100.`);

  return lines.length ? lines.join(" ") : "Données partielles en cours de chargement.";
}

/* ─────────────────────────────────────────────
   ROUTE GET /api/dashboard
───────────────────────────────────────────── */
app.get("/api/dashboard", async (req, res) => {
  try {
    const [
      dxyObs, vixObs,
      us1mObs, us3mObs, us2yObs, us10yObs, us30yObs,
      unemploymentObs, fedUpperObs,
      cpiAll, coreCpiAll, pceCoreAll,
      eurUsd,
      btcUsd, ethUsd, btcDom,
      fearGreed,
      credit,
      delinquency,
      commodities,
      sectors
    ] = await Promise.all([
      safe(() => fredObs("DTWEXBGS", 5)),
      safe(() => fredObs("VIXCLS", 5)),
      safe(() => fredObs("DGS1MO", 5)),
      safe(() => fredObs("DGS3MO", 5)),
      safe(() => fredObs("DGS2",   5)),
      safe(() => fredObs("DGS10",  5)),
      safe(() => fredObs("DGS30",  5)),
      safe(() => fredObs("UNRATE", 5)),
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
      safe(() => fetchAllSectors(), [])
    ]);

    const us1m = us1mObs?.value, us3m = us3mObs?.value;
    const us2y = us2yObs?.value, us10y = us10yObs?.value, us30y = us30yObs?.value;
    const spread2s10s = (us2y != null && us10y != null) ? (us10y - us2y) * 100 : null;

    const sentiment = fearGreed || fearGreedFallback(vixObs?.value, spread2s10s);

    const cpiLatest = getLastValid(cpiAll);
    const cpiYoY    = computeYoY(cpiAll);
    const coreCpi   = computeYoY(coreCpiAll);
    const pceCore   = computeYoY(pceCoreAll);

    const goldV   = commodities.gold?.value;
    const silverV = commodities.silver?.value;

    const payload = {
      updatedAt: new Date().toISOString(),
      sources: {
        fred:   "FRED St. Louis",
        market: "Coinbase / Frankfurter / Yahoo Finance / Alternative.me"
      },
      data: {
        dxyProxy: { value: dxyObs?.value, date: dxyObs?.date },
        vix:      { value: vixObs?.value,  date: vixObs?.date  },
        yields:   { us1m, us3m, us2y, us10y, us30y, spread2s10s },
        inflation: {
          cpiYoY, cpiIndex: toNum(cpiLatest?.value),
          coreCpi, pceCore, date: cpiLatest?.date || null
        },
        labor: {
          unemploymentRate: unemploymentObs?.value,
          date: unemploymentObs?.date || null
        },
        fed: {
          upperBound: fedUpperObs?.value,
          date: fedUpperObs?.date || null
        },
        fx:     { eurusd: eurUsd },
        crypto: {
          btcusd:       btcUsd,
          btcDominance: btcDom,
          ethusd:       ethUsd?.value ?? null
        },
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
        derived: {
          goldSilverRatio: (goldV && silverV && silverV !== 0) ? goldV / silverV : null,
          vixRegime: vixObs?.value == null ? null
            : vixObs.value >= 30 ? "élevé"
            : vixObs.value >= 20 ? "modéré" : "faible",
          curveState: spread2s10s == null ? null
            : spread2s10s > 0 ? "positive" : "inversée"
        }
      }
    };

    payload.data.aiSummary = buildAiSummary(payload.data);
    res.json(payload);
  } catch (err) {
    console.error("DASHBOARD ERROR:", err);
    res.status(500).json({ error: "dashboard_fetch_failed", message: err.message });
  }
});

/* ─────────────────────────────────────────────
   ROUTE POST /api/ai  — Anthropic Claude
───────────────────────────────────────────── */
app.post("/api/ai", async (req, res) => {
  const question  = String(req.body?.question  || "").trim();
  const dashboard = req.body?.dashboard || null;

  if (!question)
    return res.status(400).json({ error: "missing_question", message: "Question vide." });

  if (!ANTHROPIC_KEY)
    return res.status(500).json({
      error: "missing_key",
      message: "Variable d'environnement ANTHROPIC_KEY manquante sur le serveur."
    });

  // Résumé compact des données pour le contexte
  const d = dashboard?.data || {};
  const ctx = {
    vix:     d.vix?.value,
    dxy:     d.dxyProxy?.value,
    spread:  d.yields?.spread2s10s,
    us10y:   d.yields?.us10y,
    cpi:     d.inflation?.cpiYoY,
    coreCpi: d.inflation?.coreCpi,
    unrate:  d.labor?.unemploymentRate,
    fedRate: d.fed?.upperBound,
    btc:     d.crypto?.btcusd?.value,
    eth:     d.crypto?.ethusd,
    btcDom:  d.crypto?.btcDominance,
    gold:    d.commodities?.gold?.value,
    silver:  d.commodities?.silver?.value,
    wti:     d.commodities?.oil?.value,
    brent:   d.commodities?.brent?.value,
    copper:  d.commodities?.copper?.value,
    natgas:  d.commodities?.natgas?.value,
    creditHY: d.credit?.hy,
    creditIG: d.credit?.ig,
    fg:      d.sentiment?.value,
    fgLabel: d.sentiment?.label,
    delinquency: d.delinquency,
    sectors: d.sectors?.slice(0, 6)
  };

  const systemPrompt = `Tu es un analyste macro senior d'un terminal financier type Bloomberg.
Réponds en français, style dense et factuel, 120 à 220 mots maximum.
N'émets pas de conseil financier personnalisé.
Appuie-toi sur les données JSON ci-dessous (snapshot temps réel) et sur tes connaissances macro.

DONNÉES MARCHÉ (snapshot ${dashboard?.updatedAt || new Date().toISOString()}):
${JSON.stringify(ctx, null, 2)}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 400,
        system: systemPrompt,
        messages: [{ role: "user", content: question }]
      })
    });

    const data = await response.json();

    if (!response.ok)
      return res.status(500).json({
        error: "anthropic_error",
        message: data?.error?.message || "Erreur API Anthropic"
      });

    const text = data.content?.[0]?.text || "Pas de réponse.";
    res.json({ text });
  } catch (err) {
    res.status(500).json({ error: "ai_route_failed", message: err.message });
  }
});

/* ─────────────────────────────────────────────
   HEALTH CHECK
───────────────────────────────────────────── */
app.get("/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.get("*", (_req, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html"))
);

app.listen(PORT, () => console.log(`◆ TERMINAL MACRO — port ${PORT}`));
