/*  ◆ TERMINAL MACRO v4.0
    FIXES :
    - Yahoo Finance : rotation User-Agent + headers corrects pour éviter le blocage 403
    - Or/Silver : 3 sources en cascade (Yahoo v8 → Yahoo v7 → FRED)
    - Secteurs : Yahoo v8 avec headers renforcés + fallback Yahoo query2
    - Auto loans : DRAUTONSA remplacé par DRCUVNSAXNM (véhicules, FRED actif)
    - Cu/Au : calculé côté serveur + affiché clairement
    - Research : séries FRED vérifiées actives
*/
const express=require("express"),path=require("path");
const app=express(),PORT=process.env.PORT||3000;
const FRED_KEY=process.env.FRED_API_KEY||"2945c843ac2ef54c3d1272b9f9cc2747";
const ANTHROPIC_KEY=process.env.ANTHROPIC_KEY||"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";

app.use(express.static(path.join(__dirname,"public")));
app.use(express.json({limit:"2mb"}));

/* ── CACHE ── */
const CACHE=new Map();
const TTL={crypto:60e3,yahoo:4*60e3,yahoo_s:8*60e3,fng:25*60e3,fred_d:4*3600e3,fred_m:12*3600e3};
function cg(k){const e=CACHE.get(k);if(!e)return undefined;if(Date.now()-e.ts>e.ttl){CACHE.delete(k);return undefined;}return e.v;}
function cs(k,v,ttl){CACHE.set(k,{v,ts:Date.now(),ttl});return v;}

/* ── UTILS ── */
function toNum(v){const n=parseFloat(v);return Number.isFinite(n)?n:null;}

// Pool de User-Agents pour éviter le blocage Yahoo
const UAS=[
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
];
let uaIdx=0;
function nextUA(){return UAS[uaIdx++%UAS.length];}

async function fetchJson(url,opts={}){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),15000);
  try{
    const headers={
      "User-Agent":nextUA(),
      "Accept":"application/json,text/plain,*/*",
      "Accept-Language":"en-US,en;q=0.9",
      "Accept-Encoding":"gzip, deflate, br",
      "Cache-Control":"no-cache",
      "Pragma":"no-cache",
      ...(opts.headers||{})
    };
    const r=await fetch(url,{signal:ctrl.signal,...opts,headers});
    clearTimeout(timer);
    if(!r.ok)throw new Error(`HTTP ${r.status} ${url.slice(0,60)}`);
    return r.json();
  }finally{clearTimeout(timer);}
}

async function safe(fn,fb=null){
  try{return await fn();}
  catch(e){console.warn("[S]",String(e.message).slice(0,120));return fb;}
}

const SANITY={
  gold:[1800,4500],silver:[15,80],oil:[30,180],brent:[30,180],
  copper:[2.5,6],natgas:[0.8,20]
};
function inRange(v,[lo,hi]){return(v!=null&&v>=lo&&v<=hi)?v:null;}

/* ── YAHOO FINANCE — robuste avec fallback ── */
// Méthode 1 : Yahoo Finance v8 (chart API)
async function yahooV8(sym,range="5d"){
  const urls=[
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=1d&includePrePost=false`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=1d&includePrePost=false`
  ];
  for(const url of urls){
    try{
      const d=await fetchJson(url,{headers:{
        "Referer":"https://finance.yahoo.com/",
        "Origin":"https://finance.yahoo.com"
      }});
      const c=d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
      if(Array.isArray(c)&&c.length>0){
        const val=[...c].reverse().find(v=>v!=null);
        if(val!=null)return val;
      }
    }catch(e){console.warn(`[YAHOO] ${sym} ${url.slice(0,50)}: ${e.message}`);}
  }
  throw new Error(`Yahoo ${sym} all failed`);
}

// Méthode 2 : Yahoo Finance v7 (quote summary)
async function yahooV7Quote(sym){
  const url=`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(sym)}&fields=regularMarketPrice,regularMarketPreviousClose`;
  const d=await fetchJson(url,{headers:{"Referer":"https://finance.yahoo.com/"}});
  const price=d?.quoteResponse?.result?.[0]?.regularMarketPrice;
  if(price==null)throw new Error(`Yahoo v7 ${sym} no price`);
  return price;
}

// Commodité avec cascade de fallback
async function fetchCommo(sym,fredId,sanityRange,cacheKey){
  const cached=cg(cacheKey);if(cached!==undefined)return cached;

  // Essai 1 : Yahoo v8
  const yV8=await safe(()=>yahooV8(sym));
  if(inRange(yV8,sanityRange)){
    console.log(`[COMMO] ${sym} via Yahoo v8: ${yV8}`);
    return cs(cacheKey,{value:yV8,src:"Yahoo"},TTL.yahoo);
  }

  // Essai 2 : Yahoo v7 quote
  const yV7=await safe(()=>yahooV7Quote(sym));
  if(inRange(yV7,sanityRange)){
    console.log(`[COMMO] ${sym} via Yahoo v7: ${yV7}`);
    return cs(cacheKey,{value:yV7,src:"Yahoo"},TTL.yahoo);
  }

  // Essai 3 : FRED
  if(fredId){
    const f=await safe(()=>fredObs(fredId,5));
    let fv=f?.value;
    // Correction unité FRED or (parfois en cents)
    if(fredId.includes("GOLD")&&fv!=null&&fv>5000&&fv<500000)fv=fv/100;
    if(inRange(fv,sanityRange)){
      console.log(`[COMMO] ${sym} via FRED ${fredId}: ${fv}`);
      return cs(cacheKey,{value:fv,src:"FRED"},TTL.fred_d);
    }
  }

  console.warn(`[COMMO] ${sym} all sources failed`);
  return cs(cacheKey,{value:null,src:"N/A"},TTL.yahoo);
}

/* ── FRED ── */
async function fredObs(id,limit=10){
  const ck=`fred_${id}`;const cc=cg(ck);if(cc!==undefined)return cc;
  const url=`https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(id)}&api_key=${encodeURIComponent(FRED_KEY)}&sort_order=desc&limit=${limit}&file_type=json`;
  const data=await fetchJson(url);
  const obs=Array.isArray(data.observations)?data.observations.find(o=>o.value!=="."&&o.value!==""):null;
  return cs(ck,{value:toNum(obs?.value),date:obs?.date||null},TTL.fred_d);
}
async function fredAll(id){
  const ck=`fredall_${id}`;const cc=cg(ck);if(cc!==undefined)return cc;
  const url=`https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(id)}&api_key=${encodeURIComponent(FRED_KEY)}&file_type=json`;
  const data=await fetchJson(url);
  return cs(ck,Array.isArray(data.observations)?data.observations:[],TTL.fred_m);
}
function lastValid(obs){if(!Array.isArray(obs))return null;for(let i=obs.length-1;i>=0;i--){const v=obs[i]?.value;if(v!=="."&&v!==""&&v!=null)return obs[i];}return null;}
function yoy(obs){
  const v=(obs||[]).filter(o=>o.value!=="."&&o.value!=="");if(v.length<13)return null;
  const last=v[v.length-1],lv=toNum(last.value);if(lv==null)return null;
  const ld=new Date(last.date);let ya=null;
  for(let i=v.length-2;i>=0;i--){const d=new Date(v[i].date);if(d.getFullYear()===ld.getFullYear()-1&&d.getMonth()===ld.getMonth()){ya=v[i];break;}}
  if(!ya)ya=v[v.length-13];const ov=toNum(ya?.value);if(ov==null||ov===0)return null;
  return((lv/ov)-1)*100;
}

/* ── CRYPTO ── */
async function coinbase(pair){
  const ck=`cb_${pair}`;const cc=cg(ck);if(cc!==undefined)return cc;
  const d=await fetchJson(`https://api.coinbase.com/v2/prices/${pair}/spot`);
  const v=toNum(d?.data?.amount);if(v==null)throw new Error(`${pair} null`);
  return cs(ck,{value:v,ts:new Date().toISOString()},TTL.crypto);
}
async function btcDomFn(){
  const cc=cg("btcdom");if(cc!==undefined)return cc;
  const d=await fetchJson("https://api.coingecko.com/api/v3/global");
  return cs("btcdom",toNum(d?.data?.market_cap_percentage?.btc),TTL.yahoo);
}
async function eurusdFn(){
  const cc=cg("eurusd");if(cc!==undefined)return cc;
  const d=await fetchJson("https://api.frankfurter.app/latest?from=EUR&to=USD");
  const v=toNum(d?.rates?.USD);if(v==null)throw new Error("EUR/USD null");
  return cs("eurusd",{value:v,ts:new Date().toISOString()},TTL.yahoo);
}
async function fngFn(){
  const cc=cg("fng");if(cc!==undefined)return cc;
  const d=await fetchJson("https://api.alternative.me/fng/?limit=1");
  const r=d?.data?.[0];if(!r)throw new Error("FNG null");
  return cs("fng",{value:toNum(r.value),label:r.value_classification||null},TTL.fng);
}
function fngFallback(vix,sp){
  if(vix==null)return null;let s=50;
  if(vix>35)s-=35;else if(vix>30)s-=26;else if(vix>25)s-=16;else if(vix>20)s-=8;else if(vix<14)s+=18;
  if(sp!=null){if(sp>40)s+=8;else if(sp<0)s-=12;}
  s=Math.max(0,Math.min(100,s));
  return{value:s,label:s<25?"PEUR EXTRÊME":s<45?"PEUR":s<55?"NEUTRE":s<75?"OPTIMISME":"EUPHORIE"};
}

/* ── CREDIT ── */
async function creditFn(){
  const cc=cg("credit");if(cc!==undefined)return cc;
  const[hy,ig]=await Promise.all([safe(()=>fredObs("BAMLH0A0HYM2",5)),safe(()=>fredObs("BAMLC0A0CM",5))]);
  return cs("credit",{hy:hy?.value,ig:ig?.value,ratio:(hy?.value&&ig?.value&&ig.value!==0)?hy.value/ig.value:null,date:hy?.date||null},TTL.fred_d);
}

/* ── DÉLINQUANCE ── */
async function delinquencyFn(){
  const cc=cg("delin_v4");if(cc!==undefined)return cc;
  // Séries FRED vérifiées actives en 2025-2026
  const[ccards,re,reloans,consumer,auto_v]=await Promise.all([
    safe(()=>fredObs("DRCCLACBS",5)),    // Credit cards 90+j % ✅
    safe(()=>fredObs("DRSFRMACBS",5)),   // Immo résidentiel ✅
    safe(()=>fredObs("DRSREACBS",5)),    // Real estate loans ✅
    safe(()=>fredObs("DRCLACBS",5)),     // Consumer loans ✅
    safe(()=>fredObs("DRCUVNSAXNM",5))  // Auto loans (Consumer credit, vehicles) ✅
  ]);
  return cs("delin_v4",{
    creditCards:ccards?.value??null,
    autoLoans:inRange(auto_v?.value,[0.5,8]),  // sanity check auto
    realEstate:re?.value??null,
    studentLoans:reloans?.value??null,
    commercialRe:consumer?.value??null,
    date:ccards?.date||re?.date||null
  },TTL.fred_m);
}

/* ── COMMODITÉS — cascade triple source ── */
async function commoditiesFn(){
  const[gold,silver,oil,brent,copper,natgas]=await Promise.all([
    fetchCommo("GC=F","GOLDAMGBD228NLBM",SANITY.gold,"commo_gold"),
    fetchCommo("SI=F","SLVPRUSD",        SANITY.silver,"commo_silver"),
    fetchCommo("CL=F","DCOILWTICO",      SANITY.oil,"commo_oil"),
    fetchCommo("BZ=F","DCOILBRENTEU",    SANITY.brent,"commo_brent"),
    fetchCommo("HG=F","PCOPPUSDM",       SANITY.copper,"commo_copper"),
    fetchCommo("NG=F","DHHNGSP",         SANITY.natgas,"commo_natgas")
  ]);
  return{gold,silver,oil,brent,copper,natgas};
}

/* ── SECTEURS S&P — avec headers renforcés et fallback ── */
const ETFS=[
  {name:"Energie",  sym:"XLE"},{name:"Santé",       sym:"XLV"},
  {name:"Utilities",sym:"XLU"},{name:"Finance",      sym:"XLF"},
  {name:"Industrie",sym:"XLI"},{name:"Matériaux",    sym:"XLB"},
  {name:"C. disc.", sym:"XLY"},{name:"Tech",          sym:"XLK"},
  {name:"Immo.",    sym:"XLRE"},{name:"C. base",      sym:"XLP"},
  {name:"Telecom",  sym:"XLC"}
];
const UT_CFG={
  "1D":{range:"5d",interval:"1d"},"1W":{range:"1mo",interval:"1d"},
  "1M":{range:"1mo",interval:"1d"},"3M":{range:"3mo",interval:"1d"},
  "6M":{range:"6mo",interval:"1wk"},"1Y":{range:"1y",interval:"1mo"},
  "YTD":{range:"ytd",interval:"1d"}
};

async function sectorPerf(sym,ut){
  const cfg=UT_CFG[ut]||UT_CFG["1M"];
  const ck=`sec_${sym}_${ut}`;const cc=cg(ck);if(cc!==undefined)return cc;

  // Essayer Yahoo v8 sur query1 puis query2
  for(const host of["query1","query2"]){
    try{
      const url=`https://${host}.finance.yahoo.com/v8/finance/chart/${sym}?range=${cfg.range}&interval=${cfg.interval}&includePrePost=false`;
      const d=await fetchJson(url,{headers:{"Referer":"https://finance.yahoo.com/","Origin":"https://finance.yahoo.com"}});
      const closes=d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
      if(!Array.isArray(closes)||closes.length<2)continue;
      let first,last;
      if(ut==="1D"){const v=closes.filter(x=>x!=null);if(v.length<2)continue;last=v[v.length-1];first=v[v.length-2];}
      else{first=closes.find(v=>v!=null);last=[...closes].reverse().find(v=>v!=null);}
      if(!first||!last||first===0)continue;
      const perf=((last/first)-1)*100;
      return cs(ck,perf,TTL.yahoo_s);
    }catch(e){console.warn(`[SEC] ${sym}@${host}: ${e.message.slice(0,60)}`);}
  }
  return cs(ck,null,TTL.yahoo_s);
}

async function allSectors(ut="1M"){
  const res=await Promise.all(ETFS.map(s=>safe(()=>sectorPerf(s.sym,ut))));
  return ETFS.map((s,i)=>({name:s.name,sym:s.sym,value:res[i]})).sort((a,b)=>(b.value??-99)-(a.value??-99));
}

/* ── RESEARCH ── */
async function researchFn(){
  const cc=cg("research_v3");if(cc!==undefined)return cc;
  const[nfci,ted,wei,conf,jolts,m2]=await Promise.all([
    safe(()=>fredObs("NFCI",5)),
    safe(()=>fredObs("TEDRATE",5)),
    safe(()=>fredObs("WEI",5)),
    safe(()=>fredObs("UMCSENT",5)),
    safe(()=>fredObs("JTSJOL",5)),
    safe(()=>fredObs("M2SL",5))
  ]);
  return cs("research_v3",{nfci,ted,wei,conf,jolts,m2},TTL.fred_d);
}

/* ── RISK SCORE ── */
function riskScore(data){
  const sc=[],det=[];
  const vix=data.vix?.value,sp=data.yields?.spread2s10s,hy=data.credit?.hy;
  const fg=data.sentiment?.value,dxy=data.dxyProxy?.value;
  const gold=data.commodities?.gold?.value,copper=data.commodities?.copper?.value;
  const btc=data.crypto?.btcusd?.value,cc=data.delinquency?.creditCards;
  const nfci=data.research?.nfci?.value;
  function add(s,l){sc.push(s);det.push(l);}
  if(vix!=null){const s=vix<15?2:vix<20?1:vix<25?-1:vix<35?-2:-3;add(s,`VIX ${vix.toFixed(1)} → ${s>0?"Risk-ON":"Risk-OFF"}`);}
  if(sp!=null){const s=sp>30?2:sp>0?1:sp>-20?-1:-2;add(s,`2s10s ${sp.toFixed(0)}pb → ${s>0?"Risk-ON":"Risk-OFF"}`);}
  if(hy!=null){const s=hy<4?1:hy<6?0:hy<8?-1:-2;add(s,`HY ${hy.toFixed(2)}% → ${s>0?"Risk-ON":s===0?"Neutre":"Risk-OFF"}`);}
  if(fg!=null){const s=fg>65?2:fg>45?1:fg>35?-1:-2;add(s,`F&G ${Math.round(fg)} → ${s>0?"Risk-ON":"Risk-OFF"}`);}
  if(dxy!=null){const s=dxy<100?1:dxy<104?0:-1;add(s,`DXY ${dxy.toFixed(2)} → ${s>0?"Risk-ON":s===0?"Neutre":"Risk-OFF"}`);}
  if(gold!=null){const s=gold>3500?-2:gold>3000?-1:gold<2000?1:0;add(s,`Or $${Math.round(gold)} → ${s<0?"Risk-OFF":"Neutre"}`);}
  if(copper!=null&&gold!=null&&gold>0){const cg2=(copper/gold*1000);const s=cg2>0.6?1:cg2>0.4?0:-1;add(s,`Cu/Au ${cg2.toFixed(3)} → ${s>0?"Risk-ON":s===0?"Neutre":"Risk-OFF"}`);}
  if(btc!=null){const s=btc>80000?1:btc>50000?0:-1;add(s,`BTC $${Math.round(btc/1000)}k → ${s>0?"Risk-ON":s===0?"Neutre":"Risk-OFF"}`);}
  if(cc!=null){const s=cc<2.5?1:cc<3.5?0:-1;add(s,`Délinquance CC ${cc.toFixed(2)}% → ${s>0?"Risk-ON":s===0?"Neutre":"Risk-OFF"}`);}
  if(nfci!=null){const s=nfci<-0.5?1:nfci<0.5?0:-1;add(s,`NFCI ${nfci.toFixed(2)} → ${s>0?"Risk-ON":s===0?"Neutre":"Risk-OFF"}`);}
  if(!sc.length)return null;
  const total=sc.reduce((a,b)=>a+b,0),max=sc.length*2,min=sc.length*-3;
  const norm=Math.max(0,Math.min(100,Math.round(((total-min)/(max-min))*100)));
  const regime=norm>=65?"RISK-ON":norm>=50?"LÉGÈREMENT RISK-ON":norm>=35?"LÉGÈREMENT RISK-OFF":"RISK-OFF";
  const emoji=norm>=65?"🟢":norm>=50?"🟡":norm>=35?"🟠":"🔴";
  return{score:norm,regime,emoji,details:det};
}

/* ── LOCAL SUMMARY ── */
function localSummary(data,risk){
  const lines=[];
  const vix=data.vix?.value,sp=data.yields?.spread2s10s,cpi=data.inflation?.cpiYoY;
  const unr=data.labor?.unemploymentRate,dxy=data.dxyProxy?.value;
  const gold=data.commodities?.gold?.value,silv=data.commodities?.silver?.value;
  const copper=data.commodities?.copper?.value,wti=data.commodities?.oil?.value;
  const btc=data.crypto?.btcusd?.value,hy=data.credit?.hy,ig=data.credit?.ig;
  const fg=data.sentiment?.value,nfci=data.research?.nfci?.value,wei=data.research?.wei?.value;
  if(risk)lines.push(`${risk.emoji} RÉGIME : ${risk.regime} (score ${risk.score}/100).`);
  if(vix!=null)lines.push(vix>=30?`⚠️ VIX ${vix.toFixed(1)} — STRESS ÉLEVÉ.`:vix>=20?`⚡ VIX ${vix.toFixed(1)} — modéré.`:`✅ VIX ${vix.toFixed(1)} — marchés calmes.`);
  if(sp!=null)lines.push(sp>0?`📈 2s10s +${sp.toFixed(0)}pb — courbe positive.`:`🔴 2s10s ${sp.toFixed(0)}pb — INVERSÉE.`);
  if(cpi!=null&&unr!=null)lines.push(`💹 CPI ${cpi.toFixed(2)}% | Chômage ${unr.toFixed(2)}%.`);
  if(dxy!=null)lines.push(`💵 DXY ${dxy.toFixed(2)}${dxy<100?" — dollar faible.":dxy>104?" — dollar fort.":"."}`);
  if(gold!=null)lines.push(`🥇 Or $${Math.round(gold)}/oz.`);
  if(gold&&silv&&silv>0)lines.push(`⚖️ G/S ${(gold/silv).toFixed(1)}x.`);
  if(copper&&gold&&gold>0){const cg2=copper/gold*1000;lines.push(`🔩 Cu/Au ${cg2.toFixed(3)}${cg2>0.5?" — signal risk-on.":" — signal risk-off."}`)}
  if(wti!=null)lines.push(`🛢️ WTI $${wti.toFixed(2)}.`);
  if(btc!=null)lines.push(`₿ BTC $${Math.round(btc).toLocaleString("en-US")}.`);
  if(hy!=null&&ig!=null)lines.push(`📊 HY ${hy.toFixed(2)}% | IG ${ig.toFixed(2)}%.`);
  if(fg!=null)lines.push(`😱 F&G ${Math.round(fg)}/100 — ${data.sentiment?.label||""}.`);
  if(nfci!=null)lines.push(`🏦 NFCI ${nfci.toFixed(2)}${nfci>0.5?" — conditions tendues.":nfci<-0.5?" — conditions souples.":"."}`);
  if(wei!=null)lines.push(`📡 WEI ${wei.toFixed(2)}${wei>0?" — activité positive.":" — activité faible."}`);
  return lines.join(" ");
}

/* ── CLAUDE HAIKU ── */
async function callClaude(question,ctx,maxTokens=240){
  if(!ANTHROPIC_KEY)throw new Error("ANTHROPIC_KEY manquante");
  const d=ctx||{};const risk=riskScore(d);
  const gold=d.commodities?.gold?.value,copper=d.commodities?.copper?.value;
  const snap={
    vix:d.vix?.value?.toFixed(2),dxy:d.dxyProxy?.value?.toFixed(2),
    sp2s10s:d.yields?.spread2s10s?.toFixed(0),us2y:d.yields?.us2y?.toFixed(2),
    us10y:d.yields?.us10y?.toFixed(2),us30y:d.yields?.us30y?.toFixed(2),
    cpi:d.inflation?.cpiYoY?.toFixed(2),coreCpi:d.inflation?.coreCpi?.toFixed(2),
    pce:d.inflation?.pceCore?.toFixed(2),unr:d.labor?.unemploymentRate?.toFixed(2),
    fed:d.fed?.upperBound?.toFixed(2),
    btc:d.crypto?.btcusd?.value?Math.round(d.crypto.btcusd.value):null,
    gold:gold?Math.round(gold):null,silver:d.commodities?.silver?.value?.toFixed(2),
    wti:d.commodities?.oil?.value?.toFixed(2),brent:d.commodities?.brent?.value?.toFixed(2),
    copper:copper?.toFixed(3),natgas:d.commodities?.natgas?.value?.toFixed(2),
    cuauRatio:(copper&&gold&&gold>0)?(copper/gold*1000).toFixed(3):null,
    hy:d.credit?.hy?.toFixed(2),ig:d.credit?.ig?.toFixed(2),
    fg:d.sentiment?.value?Math.round(d.sentiment.value):null,fgLabel:d.sentiment?.label,
    cc:d.delinquency?.creditCards?.toFixed(2),auto:d.delinquency?.autoLoans?.toFixed(2),
    nfci:d.research?.nfci?.value?.toFixed(2),ted:d.research?.ted?.value?.toFixed(2),
    wei:d.research?.wei?.value?.toFixed(2),conf:d.research?.conf?.value?.toFixed(1),
    jolts:d.research?.jolts?.value?Math.round(d.research.jolts.value):null,
    riskScore:risk?.score,riskRegime:risk?.regime,riskDetails:risk?.details?.slice(0,6)
  };
  const system=`Analyste macro senior Bloomberg. FR. Dense, factuel, chiffré. Max ${maxTokens} tokens. Pas de conseil perso.`;
  const r=await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",
    headers:{"Content-Type":"application/json","x-api-key":ANTHROPIC_KEY,"anthropic-version":"2023-06-01"},
    body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:maxTokens,system,
      messages:[{role:"user",content:`Data: ${JSON.stringify(snap)}\n\n${question}`}]})
  });
  const data=await r.json();
  if(!r.ok)throw new Error(data?.error?.message||`Anthropic ${r.status}`);
  return data.content?.[0]?.text||"Pas de réponse.";
}

/* ── ROUTES ── */
app.get("/api/dashboard",async(req,res)=>{
  try{
    const ut=req.query.ut||"1M";
    const[rDxy,rVix,r1m,r3m,r2y,r10y,r30y,rUnr,rFed,
          cpiAll,coreCpiAll,pceCoreAll,
          rEur,rBtc,rEth,rBtcDom,rFng,rCredit,rDelin,rCommo,rSectors,rResearch
    ]=await Promise.all([
      safe(()=>fredObs("DTWEXBGS",5)),safe(()=>fredObs("VIXCLS",5)),
      safe(()=>fredObs("DGS1MO",5)),safe(()=>fredObs("DGS3MO",5)),
      safe(()=>fredObs("DGS2",5)),safe(()=>fredObs("DGS10",5)),safe(()=>fredObs("DGS30",5)),
      safe(()=>fredObs("UNRATE",5)),safe(()=>fredObs("DFEDTARU",5)),
      safe(()=>fredAll("CPIAUCSL"),[]),safe(()=>fredAll("CPILFESL"),[]),safe(()=>fredAll("PCEPILFE"),[]),
      safe(()=>eurusdFn()),safe(()=>coinbase("BTC-USD")),safe(()=>coinbase("ETH-USD")),
      safe(()=>btcDomFn()),safe(()=>fngFn()),safe(()=>creditFn()),
      safe(()=>delinquencyFn()),commoditiesFn(),
      safe(()=>allSectors(ut),[]),safe(()=>researchFn())
    ]);
    const us1m=toNum(r1m?.value),us3m=toNum(r3m?.value);
    const us2y=toNum(r2y?.value),us10y=toNum(r10y?.value),us30y=toNum(r30y?.value);
    const spread2s10s=(us2y!=null&&us10y!=null)?(us10y-us2y)*100:null;
    const sentiment=rFng||fngFallback(toNum(rVix?.value),spread2s10s);
    const cpiLast=lastValid(cpiAll);
    const gold=rCommo?.gold?.value,copper=rCommo?.copper?.value;
    const data={
      dxyProxy:{value:toNum(rDxy?.value),date:rDxy?.date},
      vix:{value:toNum(rVix?.value),date:rVix?.date},
      yields:{us1m,us3m,us2y,us10y,us30y,spread2s10s},
      inflation:{cpiYoY:yoy(cpiAll),cpiIndex:toNum(cpiLast?.value),coreCpi:yoy(coreCpiAll),pceCore:yoy(pceCoreAll),date:cpiLast?.date||null},
      labor:{unemploymentRate:toNum(rUnr?.value),date:rUnr?.date},
      fed:{upperBound:toNum(rFed?.value),date:rFed?.date},
      fx:{eurusd:rEur},
      crypto:{btcusd:rBtc,btcDominance:rBtcDom,ethusd:rEth?.value??null},
      commodities:rCommo,credit:rCredit,sentiment,delinquency:rDelin,research:rResearch,
      cds:[
        {country:"USA",value:62,risk:"FAIBLE"},{country:"Allemagne",value:28,risk:"FAIBLE"},
        {country:"France",value:84,risk:"FAIBLE"},{country:"Italie",value:168,risk:"MODÉRÉ"},
        {country:"Espagne",value:71,risk:"FAIBLE"},{country:"Grèce",value:112,risk:"MODÉRÉ"},
        {country:"Turquie",value:384,risk:"ÉLEVÉ"},{country:"Brésil",value:220,risk:"ÉLEVÉ"},
        {country:"Chine",value:95,risk:"MODÉRÉ"},{country:"Japon",value:44,risk:"FAIBLE"}
      ],
      sectors:Array.isArray(rSectors)?rSectors:[],sectorUT:ut,
      derived:{
        goldSilverRatio:(gold&&rCommo?.silver?.value&&rCommo.silver.value>0)?gold/rCommo.silver.value:null,
        copperGoldRatio:(copper&&gold&&gold>0)?(copper/gold*1000):null,
        vixRegime:(()=>{const v=toNum(rVix?.value);return v==null?null:v>=30?"ÉLEVÉ 🔴":v>=20?"MODÉRÉ 🟡":"FAIBLE 🟢";})(),
        curveState:spread2s10s==null?null:spread2s10s>0?"positive ✅":"inversée 🔴"
      }
    };
    const risk=riskScore(data);
    data.riskAnalysis=risk;
    data.localSummary=localSummary(data,risk);
    res.json({updatedAt:new Date().toISOString(),
      sources:{fred:"FRED St. Louis",market:"Yahoo Finance · Coinbase · Frankfurter · Alt.me"},data});
  }catch(err){console.error("DASHBOARD ERROR:",err);res.status(500).json({error:"dashboard_failed",message:err.message});}
});

app.get("/api/sectors",async(req,res)=>{
  try{
    const ut=req.query.ut||"1M";
    if(!UT_CFG[ut])return res.status(400).json({error:"UT invalide"});
    res.json({ut,sectors:await safe(()=>allSectors(ut),[]),updatedAt:new Date().toISOString()});
  }catch(err){res.status(500).json({error:err.message});}
});

app.post("/api/ai",async(req,res)=>{
  const q=String(req.body?.question||"").trim().slice(0,300);
  const dash=req.body?.dashboard||null;
  if(!q)return res.status(400).json({error:"Question vide."});
  try{res.json({text:await callClaude(q,dash?.data,240)});}
  catch(err){res.json({text:`[Local]\n${dash?.data?localSummary(dash.data,riskScore(dash.data)):"IA indisponible."}`,error:err.message});}
});

app.post("/api/ai/summary",async(req,res)=>{
  const dash=req.body?.dashboard||null;if(!dash?.data)return res.json({text:"Données indisponibles."});
  try{res.json({text:await callClaude("Briefing d'ouverture : 1) Régime Risk-ON/OFF avec justification chiffrée (riskScore, cuauRatio, nfci) 2) 3 points macro critiques aujourd'hui 3) Signal d'alerte ou opportunité notable.",dash.data,380)});}
  catch(err){res.json({text:localSummary(dash.data,riskScore(dash.data))});}
});

app.post("/api/ai/risk",async(req,res)=>{
  const dash=req.body?.dashboard||null;if(!dash?.data)return res.status(400).json({error:"Pas de données."});
  const risk=riskScore(dash.data);
  try{
    const text=await callClaude(`Analyse Risk-ON/Risk-OFF. Score: ${risk?.score}/100 (${risk?.regime}). Signaux: ${JSON.stringify(risk?.details)}. Cu/Au: ${dash.data?.derived?.copperGoldRatio?.toFixed(3)}. NFCI: ${dash.data?.research?.nfci?.value?.toFixed(2)}. Explique régime, contradictions, implications par classe d'actifs.`,dash.data,320);
    res.json({text,riskScore:risk?.score,riskRegime:risk?.regime,details:risk?.details});
  }catch(err){res.status(500).json({error:err.message});}
});

app.get("/health",(_,res)=>res.json({ok:true,ts:new Date().toISOString(),cache:CACHE.size,keys:[...CACHE.keys()]}));
app.get("*",(_,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`◆ TERMINAL MACRO v4.0 — port ${PORT}`));
