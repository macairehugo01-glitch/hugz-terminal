const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const FRED_API_KEY =
  process.env.FRED_API_KEY || "2945c843ac2ef54c3d1272b9f9cc2747";
const ALPHA_VANTAGE_API_KEY =
  process.env.ALPHA_VANTAGE_API_KEY || "36BBCSJ7TEV9IB64";

app.use(express.static(path.join(__dirname, "public")));

function toNum(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} - ${url}`);
  }
  return res.json();
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

async function alphaFx(from, to) {
  const url =
    `https://www.alphavantage.co/query` +
    `?function=CURRENCY_EXCHANGE_RATE` +
    `&from_currency=${encodeURIComponent(from)}` +
    `&to_currency=${encodeURIComponent(to)}` +
    `&apikey=${encodeURIComponent(ALPHA_VANTAGE_API_KEY)}`;

  const data = await fetchJson(url);
  const rate = data["Realtime Currency Exchange Rate"];
  if (!rate) return null;

  return {
    value: toNum(rate["5. Exchange Rate"]),
    bid: toNum(rate["8. Bid Price"]),
    ask: toNum(rate["9. Ask Price"]),
    lastRefreshed: rate["6. Last Refreshed"] || null,
    timeZone: rate["7. Time Zone"] || null
  };
}

async function alphaCommodity(symbol) {
  const url =
    `https://www.alphavantage.co/query` +
    `?function=GLOBAL_QUOTE` +
    `&symbol=${encodeURIComponent(symbol)}` +
    `&apikey=${encodeURIComponent(ALPHA_VANTAGE_API_KEY)}`;

  const data = await fetchJson(url);
  const q = data["Global Quote"];
  if (!q) return null;

  return {
    value: toNum(q["05. price"]),
    change: toNum(q["09. change"]),
    changePercent: q["10. change percent"] || null,
    latestTradingDay: q["07. latest trading day"] || null
  };
}

async function getCreditSpread() {
  const hy = await fredSeries("BAMLH0A0HYM2");
  const ig = await fredSeries("BAMLC0A0CM");

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

  if (vix > 25) score -= 20;
  if (vix < 15) score += 20;

  if (spread > 0) score += 10;
  if (spread < 0) score -= 10;

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
  const gold = data.commodities?.gold?.value;
  const hy = data.credit?.hy;
  const fg = data.sentiment?.value;

  const lines = [];

  if (vix !== null) {
    if (vix >= 25) lines.push(`VIX élevé à ${vix.toFixed(2)} : tension marquée.`);
    else if (vix >= 18) lines.push(`VIX à ${vix.toFixed(2)} : prudence modérée.`);
    else lines.push(`VIX à ${vix.toFixed(2)} : stress contenu.`);
  }

  if (spread !== null) {
    if (spread > 0) lines.push(`Courbe 2s10s à +${spread.toFixed(0)} pb : pente positive.`);
    else lines.push(`Courbe 2s10s à ${spread.toFixed(0)} pb : inversion persistante.`);
  }

  if (cpi !== null && unrate !== null) {
    lines.push(`Inflation ${cpi.toFixed(2)}% / chômage ${unrate.toFixed(2)}% : équilibre macro à surveiller.`);
  }

  if (dxy !== null) {
    lines.push(`Dollar proxy à ${dxy.toFixed(2)}.`);
  }

  if (gold !== null) {
    lines.push(`Gold à $${gold.toFixed(2)}.`);
  }

  if (btc !== null) {
    lines.push(`BTC à $${Math.round(btc).toLocaleString("en-US")}.`);
  }

  if (hy !== null) {
    lines.push(`High Yield à ${hy.toFixed(2)}%.`);
  }

  if (fg !== null) {
    lines.push(`Sentiment ${fg}/100.`);
  }

  return lines.join(" ");
}

app.get("/api/dashboard", async (req, res) => {
  try {
    const [
      dxyObs,
      vixObs,
      us2yObs,
      us10yObs,
      us30yObs,
      unemploymentObs,
      fedUpperObs,
      cpiAll,
      eurUsd,
      btcUsd,
      gold,
      silver,
      oil,
      credit
    ] = await Promise.all([
      fredSeries("DTWEXBGS"),
      fredSeries("VIXCLS"),
      fredSeries("DGS2"),
      fredSeries("DGS10"),
      fredSeries("DGS30"),
      fredSeries("UNRATE"),
      fredSeries("DFEDTARU"),
      fredSeriesAll("CPIAUCSL"),
      alphaFx("EUR", "USD"),
      alphaFx("BTC", "USD"),
      alphaCommodity("GC=F"),
      alphaCommodity("SI=F"),
      alphaCommodity("CL=F"),
      getCreditSpread()
    ]);

    const cpiLatest = getLastValidObservation(cpiAll);
    const cpiYoY = computeYoYFromIndex(cpiAll);

    const us2y = toNum(us2yObs?.value);
    const us10y = toNum(us10yObs?.value);
    const us30y = toNum(us30yObs?.value);
    const spread2s10s = us2y !== null && us10y !== null ? (us10y - us2y) * 100 : null;

    const sentiment = computeFearGreed(toNum(vixObs?.value), spread2s10s);

    const payload = {
      updatedAt: new Date().toISOString(),
      sources: {
        fred: "FRED",
        alphaVantage: "Alpha Vantage"
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
          us2y,
          us10y,
          us30y,
          spread2s10s
        },
        inflation: {
          cpiYoY,
          cpiIndex: toNum(cpiLatest?.value),
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
          btcusd: btcUsd
        },
        commodities: {
          gold,
          silver,
          oil
        },
        credit,
        sentiment,
        sectors: [
          { name: "Energy", value: 2.8 },
          { name: "Health", value: 2.1 },
          { name: "Utilities", value: 1.4 },
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
