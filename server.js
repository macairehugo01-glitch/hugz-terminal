const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Clés fournies par toi.
// Railway pourra les surcharger via Variables si tu veux ensuite.
const FRED_API_KEY =
  process.env.FRED_API_KEY || "2945c843ac2ef54c3d1272b9f9cc2747";
const ALPHA_VANTAGE_API_KEY =
  process.env.ALPHA_VANTAGE_API_KEY || "36BBCSJ7TEV9IB64";

app.use(express.static(path.join(__dirname, "public")));

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} on ${url}`);
  }
  return res.json();
}

function getLastValidObservation(observations) {
  if (!Array.isArray(observations)) return null;
  for (let i = observations.length - 1; i >= 0; i--) {
    const v = observations[i]?.value;
    if (v !== "." && v !== undefined && v !== null && v !== "") {
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
    price: num(rate["5. Exchange Rate"]),
    bid: num(rate["8. Bid Price"]),
    ask: num(rate["9. Ask Price"]),
    lastRefreshed: rate["6. Last Refreshed"] || null,
    timezone: rate["7. Time Zone"] || null
  };
}

async function alphaCommodity(symbol) {
  const url =
    `https://www.alphavantage.co/query` +
    `?function=GLOBAL_QUOTE` +
    `&symbol=${encodeURIComponent(symbol)}` +
    `&apikey=${encodeURIComponent(ALPHA_VANTAGE_API_KEY)}`;
  const data = await fetchJson(url);
  const quote = data["Global Quote"];
  if (!quote) return null;

  return {
    price: num(quote["05. price"]),
    change: num(quote["09. change"]),
    changePercent: quote["10. change percent"] || null,
    latestTradingDay: quote["07. latest trading day"] || null
  };
}

app.get("/api/dashboard", async (req, res) => {
  try {
    const [
      dxyObs,
      vixObs,
      us2yObs,
      us10yObs,
      us30yObs,
      cpiObs,
      unemploymentObs,
      fedUpperObs,
      btcUsd,
      eurUsd
    ] = await Promise.all([
      fredSeries("DTWEXBGS"),   // Dollar index proxy trade-weighted broad
      fredSeries("VIXCLS"),     // VIX
      fredSeries("DGS2"),       // 2Y
      fredSeries("DGS10"),      // 10Y
      fredSeries("DGS30"),      // 30Y
      fredSeries("CPIAUCSL"),   // CPI Index
      fredSeries("UNRATE"),     // Unemployment rate
      fredSeries("DFEDTARU"),   // Fed target upper bound
      alphaFx("BTC", "USD"),
      alphaFx("EUR", "USD")
    ]);

    let cpiYoY = null;
    if (cpiObs?.date) {
      const yearAgoUrl =
        `https://api.stlouisfed.org/fred/series/observations` +
        `?series_id=CPIAUCSL` +
        `&api_key=${encodeURIComponent(FRED_API_KEY)}` +
        `&file_type=json`;
      const cpiAll = await fetchJson(yearAgoUrl);
      const obs = cpiAll.observations || [];
      const latest = getLastValidObservation(obs);
      if (latest) {
        const latestDate = new Date(latest.date);
        const targetDate = new Date(latestDate);
        targetDate.setFullYear(targetDate.getFullYear() - 1);

        let yearAgo = null;
        for (let i = obs.length - 1; i >= 0; i--) {
          const o = obs[i];
          if (o.value === ".") continue;
          const od = new Date(o.date);
          if (od <= targetDate) {
            yearAgo = o;
            break;
          }
        }

        if (yearAgo) {
          const latestVal = num(latest.value);
          const yearAgoVal = num(yearAgo.value);
          if (latestVal && yearAgoVal) {
            cpiYoY = ((latestVal / yearAgoVal) - 1) * 100;
          }
        }
      }
    }

    const us2y = num(us2yObs?.value);
    const us10y = num(us10yObs?.value);
    const us30y = num(us30yObs?.value);

    const payload = {
      updatedAt: new Date().toISOString(),
      sources: {
        fred: "FRED",
        alphaVantage: "Alpha Vantage"
      },
      data: {
        dxyProxy: {
          value: num(dxyObs?.value),
          date: dxyObs?.date || null,
          label: "Dollar Index Proxy"
        },
        vix: {
          value: num(vixObs?.value),
          date: vixObs?.date || null
        },
        yields: {
          us2y: us2y,
          us10y: us10y,
          us30y: us30y,
          spread2s10s:
            us2y !== null && us10y !== null ? (us10y - us2y) * 100 : null
        },
        inflation: {
          cpiYoY: cpiYoY,
          lastCpiIndex: num(cpiObs?.value),
          date: cpiObs?.date || null
        },
        labor: {
          unemploymentRate: num(unemploymentObs?.value),
          date: unemploymentObs?.date || null
        },
        fed: {
          upperBound: num(fedUpperObs?.value),
          date: fedUpperObs?.date || null
        },
        fx: {
          eurusd: eurUsd
            ? {
                value: eurUsd.price,
                lastRefreshed: eurUsd.lastRefreshed
              }
            : null
        },
        crypto: {
          btcusd: btcUsd
            ? {
                value: btcUsd.price,
                lastRefreshed: btcUsd.lastRefreshed
              }
            : null
        }
      }
    };

    res.json(payload);
  } catch (error) {
    res.status(500).json({
      error: "Dashboard fetch failed",
      message: error.message
    });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
