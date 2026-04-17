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

function buildAiSummary(data) {
  const vix = data.vix?.value;
  const dxy = data.dxyProxy?.value;
  const spread = data.yields?.spread2s10s;
  const btc = data.crypto?.btcusd?.value;
  const unrate = data.labor?.unemploymentRate;
  const cpi = data.inflation?.cpiYoY;

  const lines = [];

  if (vix !== null) {
    if (vix >= 25) lines.push(`VIX élevé à ${vix.toFixed(2)} : volatilité tendue.`);
    else if (vix >= 18) lines.push(`VIX à ${vix.toFixed(2)} : prudence modérée.`);
    else lines.push(`VIX à ${vix.toFixed(2)} : stress marché contenu.`);
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

  if (btc !== null) {
    lines.push(`BTC à $${Math.round(btc).toLocaleString("en-US")}.`);
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
      btcUsd
    ] = await Promise.all([
      fredSeries("DTWEXBGS"), // Dollar broad index proxy
      fredSeries("VIXCLS"),
      fredSeries("DGS2"),
      fredSeries("DGS10"),
      fredSeries("DGS30"),
      fredSeries("UNRATE"),
      fredSeries("DFEDTARU"),
      fredSeriesAll("CPIAUCSL"),
      alphaFx("EUR", "USD"),
      alphaFx("BTC", "USD")
    ]);

    const cpiLatest = getLastValidObservation(cpiAll);
    const cpiYoY = computeYoYFromIndex(cpiAll);

    const us2y = toNum(us2yObs?.value);
    const us10y = toNum(us10yObs?.value);
    const us30y = toNum(us30yObs?.value);
    const spread2s10s = us2y !== null && us10y !== null ? (us10y - us2y) * 100 : null;

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
