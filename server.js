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

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} - ${url}`);
  }

  return res.json();
}

async function safe(fn, fallback = null) {
  try {
    return await fn();
  } catch (e) {
    console.error("SAFE ERROR:", e.message);
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

async function fred(seriesId) {
  const url =
    `https://api.stlouisfed.org/fred/series/observations` +
    `?series_id=${encodeURIComponent(seriesId)}` +
    `&api_key=${encodeURIComponent(FRED_API_KEY)}` +
    `&file_type=json`;

  const data = await fetchJson(url);
  const obs = getLastValidObservation(data.observations);

  return {
    value: toNum(obs?.value),
    date: obs?.date || null
  };
}

async function fredAll(seriesId) {
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
  if (amount === null) throw new Error("BTC/USD missing data");

  return {
    value: amount,
    lastRefreshed: new Date().toISOString()
  };
}

async function fetchEURUSD() {
  const data = await fetchJson("https://api.frankfurter.app/latest?from=EUR&to=USD");
  const result = toNum(data?.rates?.USD);
  if (result === null) throw new Error("EUR/USD missing data");

  return {
    value: result,
    lastRefreshed: new Date().toISOString()
  };
}

async function fetchYahooQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const data = await fetchJson(url);

  const result = data?.chart?.result?.[0];
  if (!result) {
    throw new Error(`Yahoo missing result for ${symbol}`);
  }

  const meta = result.meta || {};
  const price = toNum(meta.regularMarketPrice);
  const prevClose = toNum(meta.chartPreviousClose);

  if (price === null) {
    throw new Error(`Yahoo missing price for ${symbol}`);
  }

  let change = null;
  let changePct = null;

  if (prevClose !== null && prevClose !== 0) {
    change = price - prevClose;
    changePct = (change / prevClose) * 100;
  }

  return {
    value: price,
    previousClose: prevClose,
    change,
    changePct,
    currency: meta.currency || null,
    exchangeName: meta.exchangeName || null,
    lastRefreshed: new Date().toISOString()
  };
}

async function fetchBTCDominance() {
  const data = await fetchJson("https://api.coingecko.com/api/v3/global");
  return toNum(data?.data?.market_cap_percentage?.btc);
}

async function fetchSectorETFs() {
  const mapping = {
    Energy: "XLE",
    Health: "XLV",
    Utilities: "XLU",
    Finance: "XLF",
    Consumer: "XLY",
    Tech: "XLK"
  };

  const out = [];

  for (const [name, symbol] of Object.entries(mapping)) {
    const quote = await safe(() => fetchYahooQuote(symbol));
    if (quote && typeof quote.changePct === "number") {
      out.push({ name, value: quote.changePct });
    }
  }

  return out;
}

async function getCreditSpread() {
  const hy = await safe(() => fred("BAMLH0A0HYM2"));
  const ig = await safe(() => fred("BAMLC0A0CM"));

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

  if (latestVal === null) return null;

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
  if (oldVal === null || oldVal === 0) return null;

  return ((latestVal / oldVal) - 1) * 100;
}

function computeFearGreed(vix, spread) {
  if (vix == null || spread == null) return null;

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
  const gold = data.commodities?.gold?.value;
  const silver = data.commodities?.silver?.value;

  const ratio =
    typeof gold === "number" &&
    typeof silver === "number" &&
    silver !== 0
      ? gold / silver
      : null;

  const lines = [];

  if (typeof vix === "number") {
    if (vix >= 25) lines.push(`Marché sous tension : VIX à ${vix.toFixed(2)}.`);
    else if (vix >= 18) lines.push(`Volatilité modérée : VIX à ${vix.toFixed(2)}.`);
    else lines.push(`Stress contenu : VIX à ${vix.toFixed(2)}.`);
  }

  if (typeof spread === "number") {
    if (spread > 0) lines.push(`La courbe 2s10s reste positive à +${spread.toFixed(0)} pb.`);
    else lines.push(`La courbe 2s10s reste inversée à ${spread.toFixed(0)} pb.`);
  }

  if (typeof cpi === "number" && typeof unrate === "number") {
    lines.push(`Inflation ${cpi.toFixed(2)}% et chômage ${unrate.toFixed(2)}% : régime macro équilibré mais sous surveillance.`);
  }

  if (typeof dxy === "number") lines.push(`Dollar proxy à ${dxy.toFixed(2)}.`);
  if (typeof btc === "number") lines.push(`BTC à $${Math.round(btc).toLocaleString("en-US")}.`);
  if (typeof gold === "number") lines.push(`Gold à $${gold.toFixed(2)}.`);
  if (typeof ratio === "number") lines.push(`Gold/Silver ratio à ${ratio.toFixed(1)}x.`);
  if (typeof hy === "number") lines.push(`High Yield à ${hy.toFixed(2)}%.`);
  if (typeof fg === "number") lines.push(`Sentiment agrégé ${fg.toFixed(0)}/100.`);

  return lines.length ? lines.join(" ") : "Données partielles disponibles.";
}

app.get("/api/dashboard", async (req, res) => {
  try {
    const [
      dxyObs,
      vixObs,
      us1mObs,
      us3mObs,
      us2yObs,
      us10yObs,
      us30yObs,
      unemploymentObs,
      fedUpperObs,
      cpiAll,
      coreCpiObs,
      pceCoreObs,
      eurUsd,
      btcUsd,
      btcDominance,
      credit,
      gold,
      silver,
      oil,
      brent,
      copper,
      natgas,
      eth,
      sectors
    ] = await Promise.all([
      safe(() => fred("DTWEXBGS")),
      safe(() => fred("VIXCLS")),
      safe(() => fred("DGS1MO")),
      safe(() => fred("DGS3MO")),
      safe(() => fred("DGS2")),
      safe(() => fred("DGS10")),
      safe(() => fred("DGS30")),
      safe(() => fred("UNRATE")),
      safe(() => fred("DFEDTARU")),
      safe(() => fredAll("CPIAUCSL"), []),
      safe(() => fred("CPILFESL")),
      safe(() => fred("PCEPILFE")),
      safe(() => fetchEURUSD()),
      safe(() => fetchBTCUSD()),
      safe(() => fetchBTCDominance()),
      safe(() => getCreditSpread()),
      safe(() => fetchYahooQuote("GC=F")),
      safe(() => fetchYahooQuote("SI=F")),
      safe(() => fetchYahooQuote("CL=F")),
      safe(() => fetchYahooQuote("BZ=F")),
      safe(() => fetchYahooQuote("HG=F")),
      safe(() => fetchYahooQuote("NG=F")),
      safe(() => fetchYahooQuote("ETH-USD")),
      safe(() => fetchSectorETFs(), [])
    ]);

    const cpiLatest = getLastValidObservation(cpiAll);
    const cpiYoY = computeYoYFromIndex(cpiAll);

    const us1m = toNum(us1mObs?.value);
    const us3m = toNum(us3mObs?.value);
    const us2y = toNum(us2yObs?.value);
    const us10y = toNum(us10yObs?.value);
    const us30y = toNum(us30yObs?.value);

    const spread2s10s =
      us2y !== null && us10y !== null ? (us10y - us2y) * 100 : null;

    const sentiment = computeFearGreed(toNum(vixObs?.value), spread2s10s);

    const coreCpi = toNum(coreCpiObs?.value);
    const pceCore = toNum(pceCoreObs?.value);

    const payload = {
      updatedAt: new Date().toISOString(),
      sources: {
        fred: "FRED",
        market: "Coinbase / Frankfurter / Yahoo Finance / CoinGecko"
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
          us1m,
          us3m,
          us2y,
          us10y,
          us30y,
          spread2s10s
        },
        inflation: {
          cpiYoY,
          cpiIndex: toNum(cpiLatest?.value),
          coreCpi,
          pceCore,
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
          btcDominance,
          ethusd: eth?.value ?? null
        },
        commodities: {
          gold,
          silver,
          oil,
          brent,
          copper,
          natgas
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
        sectors,
        derived: {
          goldSilverRatio:
            typeof gold?.value === "number" &&
            typeof silver?.value === "number" &&
            silver.value !== 0
              ? gold.value / silver.value
              : null,
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
  console.log(`RUNNING ON ${PORT}`);
});
