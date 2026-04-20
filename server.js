const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const FRED_API_KEY = "2945c843ac2ef54c3d1272b9f9cc2747";

app.use(express.static(path.join(__dirname, "public")));

const toNum = v => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function safe(fn) {
  try { return await fn(); }
  catch (e) { return null; }
}

async function fred(id) {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${FRED_API_KEY}&file_type=json`;
  const data = await fetchJson(url);
  const obs = data.observations.reverse().find(o => o.value !== ".");
  return { value: toNum(obs?.value), date: obs?.date };
}

async function yahoo(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`;
  const data = await fetchJson(url);
  const meta = data.chart.result[0].meta;
  const price = meta.regularMarketPrice;
  const prev = meta.chartPreviousClose;
  return {
    value: price,
    changePct: prev ? ((price - prev) / prev) * 100 : null
  };
}

async function btc() {
  const d = await fetchJson("https://api.coinbase.com/v2/prices/BTC-USD/spot");
  return { value: toNum(d.data.amount) };
}

async function eurusd() {
  const d = await fetchJson("https://api.frankfurter.app/latest?from=EUR&to=USD");
  return { value: toNum(d.rates.USD) };
}

async function btcDominance() {
  const d = await fetchJson("https://api.coingecko.com/api/v3/global");
  return toNum(d.data.market_cap_percentage.btc);
}

async function sectorETF() {
  const map = {
    Energy: "XLE",
    Health: "XLV",
    Utilities: "XLU",
    Finance: "XLF",
    Consumer: "XLY",
    Tech: "XLK"
  };

  const out = [];

  for (const k in map) {
    const q = await safe(() => yahoo(map[k]));
    if (q) out.push({ name: k, value: q.changePct || 0 });
  }

  return out;
}

app.get("/api/dashboard", async (req, res) => {
  try {
    const [
      dxy, vix,
      us1m, us3m, us2y, us10y, us30y,
      unrate, fed,
      cpi, coreCpi, pce,
      btcusd, eur,
      gold, silver, oil, brent, copper, natgas,
      eth,
      btcDom,
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
      safe(() => fred("CPIAUCSL")),
      safe(() => fred("CPILFESL")),
      safe(() => fred("PCEPILFE")),
      safe(() => btc()),
      safe(() => eurusd()),
      safe(() => yahoo("GC=F")),
      safe(() => yahoo("SI=F")),
      safe(() => yahoo("CL=F")),
      safe(() => yahoo("BZ=F")),
      safe(() => yahoo("HG=F")),
      safe(() => yahoo("NG=F")),
      safe(() => yahoo("ETH-USD")),
      safe(() => btcDominance()),
      safe(() => sectorETF())
    ]);

    const spread = us10y?.value && us2y?.value
      ? (us10y.value - us2y.value) * 100
      : null;

    const ratio =
      gold?.value && silver?.value
        ? gold.value / silver.value
        : null;

    res.json({
      updatedAt: new Date().toISOString(),
      data: {
        dxyProxy: dxy,
        vix,
        yields: {
          us1m: us1m?.value,
          us3m: us3m?.value,
          us2y: us2y?.value,
          us10y: us10y?.value,
          us30y: us30y?.value,
          spread2s10s: spread
        },
        inflation: {
          cpiYoY: cpi?.value,
          coreCpi: coreCpi?.value,
          pceCore: pce?.value
        },
        labor: { unemploymentRate: unrate?.value },
        fed: { upperBound: fed?.value },
        fx: { eurusd: eur },
        crypto: {
          btcusd,
          btcDominance: btcDom,
          ethusd: eth?.value
        },
        commodities: {
          gold, silver, oil, brent, copper, natgas
        },
        sectors,
        derived: {
          goldSilverRatio: ratio
        }
      }
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log("RUNNING V6 ON " + PORT);
});
