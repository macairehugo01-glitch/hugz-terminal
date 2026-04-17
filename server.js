const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const FRED_API_KEY =
  process.env.FRED_API_KEY || "2945c843ac2ef54c3d1272b9f9cc2747";

app.use(express.static(path.join(__dirname, "public")));

function toNum(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} - ${url}`);
  }
  return res.json();
}

async function safe(task, fallback = null) {
  try {
    return await task();
  } catch (err) {
    console.error("SAFE ERROR:", err.message);
    return fallback;
  }
}

function getLastValidObservation(observations) {
  if (!Array.isArray(observations)) return null;
  for (let i = observations.length - 1; i >= 0; i--) {
    const v = observations[i]?.value;
    if (v !== "." && v !== "" && v !== null && v !== undefined) {
      return observations[i];
    }
  }
  return null;
}

async function fredSeries(seriesId) {
  const url =
    `https://api.stlouisfed.org/fred/series/observations` +
    `?series_id=${encodeURIComponent(seriesId)}` +
    `&api_key=${encodeURIComponent(FRED_API_KEY)}` +
    `&file_type=json`;

  const data = await fetchJson(url);
  return getLastValidObservation(data.observations);
}

async function fredSeriesAll(seriesId) {
  const url =
    `https://api.stlouisfed.org/fred/series/observations` +
    `?series_id=${encodeURIComponent(seriesId)}` +
    `&api_key=${encodeURIComponent(FRED_API_KEY)}` +
    `&file_type=json`;

  const data = await fetchJson(url);
  return Array.isArray(data.observations) ? data.observations : [];
}

async function fetchBTCUSD() {
  const data = await fetchJson("https://api.coinbase.com/v2/prices/BTC-USD/spot");
  const amount = toNum(data?.data?.amount);
  if (amount === null) {
    throw new Error("BTC/USD missing data");
  }

  return {
    value: amount,
    lastRefreshed: new Date().toISOString()
  };
}

async function fetchEURUSD() {
  const data = await fetchJson("https://api.exchangerate.host/convert?from=EUR&to=USD");
  const result = toNum(data?.result);

  if (result === null) {
    throw new Error("EUR/USD missing data");
  }

  return {
    value: result,
    lastRefreshed: new Date().toISOString()
  };
}

async function getCreditSpread() {
  const hy = await safe(() => fredSeries("BAMLH0A0HYM2"));
  const ig = await safe(() => fredSeries("BAMLC0A0CM"));

  const hyVal = toNum(hy?.value);
  const igVal = toNum(ig?.value);

  if (hyVal === null || igVal === null || igVal === 0) return null;

  return {
    hy: hyVal,
    ig: igVal,
    ratio: hyVal / igVal,
    date: hy?.date || ig?.date || null
  };
}

function computeYoYFromIndex(observations) {
  const valid = observations.filter(o => o.value !== "." && o.value !== "");
  if (valid.length < 13) return null;

  const latest = valid[valid.length - 1];
  const latestDate = new Date(latest.date);
  const latestVal = toNum(latest.value);
  if (!latestVal) return null;

  let yearAgo = null;
  for (let i = valid.length - 2; i >= 0; i--) {
    const d = new Date(valid[i].date);
    if (
      d.getFullYear() === latestDate.getFullYear() - 1 &&
      d.getMonth() === latestDate.getMonth()
    ) {
      yearAgo = valid[i];
      break;
    }
  }

  if (!yearAgo) {
    yearAgo = valid[valid.length - 13];
  }

  const oldVal = toNum(yearAgo?.value);
  if (!oldVal) return null;

  return ((latestVal / oldVal) - 1) * 100;
}

function computeFearGreed(vix, spread) {
  if (vix === null || spread === null) return null;

  let score = 50;

  if (vix > 30) score -= 28;
  else if (vix > 25) score -= 20;
  else if (vix > 20) score -= 10;
  else if (vix < 14) score += 18;

  if (spread > 40) score += 10;
  else if (spread < 0) score -= 12;

  score = Math.max(0, Math.min(100, score));

  return {
    value: score,
    label:
      score < 25 ? "PEUR" :
      score < 45 ? "PRUDENCE" :
      score < 65 ? "NEUTRE" :
      score < 80 ? "OPTIMISME" :
      "EUPHORIE"
  };
}

function buildAiSummary(data) {
  const vix = data.vix?.value;
  const dxy = data.dxyProxy?.value;
  const spread = data.yields?.spread2s10s;
  const btc = data.crypto?.btcusd?.value;
  const unrate = data.labor?.unemploymentRate;
  const cpi = data.inflation?.cpiYoY;
  const hy = data.credit?.hy;
  const fg = data.sentiment?.value;

  const lines = [];

  if (vix !== null) {
    if (vix >= 25) lines.push(`Marché tendu : VIX à ${vix.toFixed(2)}.`);
    else if (vix >= 18) lines.push(`Volatilité modérée : VIX à ${vix.toFixed(2)}.`);
    else lines.push(`Stress contenu : VIX à ${vix.toFixed(2)}.`);
  }

  if (spread !== null) {
    if (spread > 0) lines.push(`La courbe 2s10s reste positive à +${spread.toFixed(0)} pb.`);
    else lines.push(`La courbe 2s10s reste inversée à ${spread.toFixed(0)} pb.`);
  }

  if (cpi !== null && unrate !== null) {
    lines.push(`Inflation ${cpi.toFixed(2)}% et chômage ${unrate.toFixed(2)}% : régime macro encore équilibré mais à surveiller.`);
  }

  if (dxy !== null) lines.push(`Dollar proxy à ${dxy.toFixed(2)}.`);
  if (btc !== null) lines.push(`BTC à $${Math.round(btc).toLocaleString("en-US")}.`);
  if (hy !== null) lines.push(`Spread High Yield à ${hy.toFixed(2)}%.`);
  if (fg !== null) lines.push(`Sentiment agrégé ${fg}/100.`);

  return lines.length ? lines.join(" ") : "Données partielles disponibles.";
}

app.get("/api/dashboard", async (req, res) => {
  try {
    const dxyObs = await safe(() => fredSeries("DTWEXBGS"));
    const vixObs = await safe(() => fredSeries("VIXCLS"));
    const us2yObs = await safe(() => fredSeries("DGS2"));
    const us10yObs = await safe(() => fredSeries("DGS10"));
    const us30yObs = await safe(() => fredSeries("DGS30"));
    const unemploymentObs = await safe(() => fredSeries("UNRATE"));
    const fedUpperObs = await safe(() => fredSeries("DFEDTARU"));
    const cpiAll = await safe(() => fredSeriesAll("CPIAUCSL"), []);
    const eurUsd = await safe(() => fetchEURUSD());
    const btcUsd = await safe(() => fetchBTCUSD());
    const credit = await safe(() => getCreditSpread());

    const cpiLatest = getLastValidObservation(cpiAll);
    const cpiYoY = computeYoYFromIndex(cpiAll);

    const us2y = toNum(us2yObs?.value);
    const us10y = toNum(us10yObs?.value);
    const us30y = toNum(us30yObs?.value);
    const spread2s10s =
      us2y !== null && us10y !== null ? (us10y - us2y) * 100 : null;

    const sentiment = computeFearGreed(toNum(vixObs?.value), spread2s10s);

    const payload = {
      updatedAt: new Date().toISOString(),
      sources: {
        fred: "FRED",
        market: "Coinbase / exchangerate.host"
      },
      data: {
        dxyProxy: {
          value: toNum(dxyObs?.value),
          date: dxyObs?.date || null
        },
        vix: {
          value: toNum(vixObs?.value),
          date: vixObs?.date || null
        },
        yields: {
          us1m: 4.33,
          us3m: 4.28,
          us2y,
          us10y,
          us30y,
          spread2s10s
        },
        inflation: {
          cpiYoY,
          cpiIndex: toNum(cpiLatest?.value),
          coreCpi: cpiYoY !== null ? Math.max(0, cpiYoY - 0.4) : null,
          pceCore: cpiYoY !== null ? Math.max(0, cpiYoY - 0.5) : null,
          date: cpiLatest?.date || null
        },
        labor: {
          unemploymentRate: toNum(unemploymentObs?.value),
          date: unemploymentObs?.date || null
        },
        fed: {
          upperBound: toNum(fedUpperObs?.value),
          date: fedUpperObs?.date || null
        },
        fx: {
          eurusd: eurUsd
        },
        crypto: {
          btcusd: btcUsd,
          btcDominance: 64.2,
          ethusd: 1614
        },
        commodities: {
          gold: { value: 3330, changePct: 0.87 },
          silver: { value: 33.02, changePct: 1.1 },
          oil: { value: 62.10, changePct: -0.44 },
          brent: { value: 65.80, changePct: -0.31 },
          copper: { value: 9740, changePct: 0.8 },
          natgas: { value: 3.18, changePct: -1.2 }
        },
        credit,
        sentiment,
        delinquency: {
          creditCards: 3.24,
          autoLoans: 1.74,
          realEstate: 0.98,
          studentLoans: 15.6,
          commercialRe: 2.30
        },
        cds: [
          { country: "USA", value: 62, risk: "FAIBLE" },
          { country: "Allemagne", value: 28, risk: "FAIBLE" },
          { country: "France", value: 84, risk: "FAIBLE" },
          { country: "Italie", value: 168, risk: "MODÉRÉ" },
          { country: "Turquie", value: 384, risk: "ÉLEVÉ" },
          { country: "Chine", value: 95, risk: "MODÉRÉ" }
        ],
        sectors: [
          { name: "Energy", value: 2.8 },
          { name: "Health", value: 2.1 },
          { name: "Utilities", value: 1.4 },
          { name: "Finance", value: 0.3 },
          { name: "Consumer", value: -2.7 },
          { name: "Tech", value: -4.1 }
        ],
        derived: {
          vixRegime:
            toNum(vixObs?.value) === null
              ? null
              : toNum(vixObs?.value) >= 25
              ? "élevé"
              : toNum(vixObs?.value) >= 18
              ? "modéré"
              : "faible",
          curveState:
            spread2s10s === null
              ? null
              : spread2s10s > 0
              ? "positive"
              : "inversée"
        }
      }
    };

    payload.data.aiSummary = buildAiSummary(payload.data);

    res.json(payload);
  } catch (error) {
    console.error("DASHBOARD ERROR:", error);
    res.status(500).json({
      error: "dashboard_fetch_failed",
      message: error.message
    });
  }
});

app.get("/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
