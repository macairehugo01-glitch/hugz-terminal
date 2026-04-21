/*  ◆ TERMINAL MACRO v3.2 — RESEARCH GRADE
    ─────────────────────────────────────────
    BUG FIXES :
      • us2y : conflit de nommage corrigé (r2y → toNum → us2y numérique)
      • auto loans : DRAUTONSA retiré de FRED → DTCTHFNM + fallback propre
      • Sanity check or renforcée
    AJOUTS RESEARCH :
      • Ratio cuivre/or (Cu/Au) — baromètre macro #1
      • Chicago Fed NFCI — conditions financières
      • TED spread — stress interbancaire
      • Weekly Economic Index (NY Fed WEI)
      • Conf. consommateur U Michigan
      • JOLTS — offres d'emploi
      • Route /api/ai/risk dédiée risk-on/off
*/
const express=require("express"),path=require("path");
const app=express(),PORT=process.env.PORT||3000;
const FRED_KEY=process.env.FRED_API_KEY||"2945c843ac2ef54c3d1272b9f9cc2747";
const ANTHROPIC_KEY=process.env.ANTHROPIC_KEY||"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";
app.use(express.static(path.join(__dirname,"public")));
app.use(express.json({limit:"2mb"}));

/* CACHE */
const CACHE=new Map();
const TTL={crypto:60e3,yahoo:5*60e3,yahoo_sec:10*60e3,fng:30*60e3,fred_d:4*3600e3,fred_m:12*3600e3};
function cacheGet(k){const e=CACHE.get(k);if(!e)return undefined;if(Date.now()-e.ts>e.ttl){CACHE.delete(k);return undefined;}return e.data;}
function cacheSet(k,d,ttl){CACHE.set(k,{data:d,ts:Date.now(),ttl});return d;}

/* UTILS */
function toNum(v){const n=parseFloat(v);return Number.isFinite(n)?n:null;}
async function fetchJson(url,opts={}){
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),14000);
  try{
    const r=await fetch(url,{signal:ctrl.signal,...opts,headers:{"User-Agent":"Mozilla/5.0 MacroTerminal/3.2",Accept:"application/json",...(opts.headers||{})}});
    clearTimeout(timer);if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();
  }finally{clearTimeout(timer);}
}
async function safe(fn,fb=null){try{return await fn();}catch(e){console.warn("[S]",String(e.message).slice(0,100));return fb;}}
const SANITY={gold:[1500,5000],silver:[10,100],oil:[15,200],brent:[15,200],copper:[2,15],natgas:[0.5,25]};
function inRange(v,[lo,hi]){return(v!=null&&v>=lo&&v<=hi)?v:null;}

/* YAHOO */
async function yahooClose(sym,range="5d"){
  const ck=`yc_${sym}_${range}`;const cc=cacheGet(ck);if(cc!==undefined)return cc;
  const d=await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=1d&includePrePost=false`);
  const c=d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
  if(!Array.isArray(c))return cacheSet(ck,null,TTL.yahoo);
  return cacheSet(ck,[...c].reverse().find(v=>v!=null)??null,TTL.yahoo);
}

/* FRED */
async function fredObs(id,limit=10){
  const ck=`fred_${id}`;const cc=cacheGet(ck);if(cc!==undefined)return cc;
  const url=`https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(id)}&api_key=${encodeURIComponent(FRED_KEY)}&sort_order=desc&limit=${limit}&file_type=json`;
  const data=await fetchJson(url);
  const obs=Array.isArray(data.observations)?data.observations.find(o=>o.value!=="."&&o.value!==""):null;
  return cacheSet(ck,{value:toNum(obs?.value),date:obs?.date||null},TTL.fred_d);
}
async function fredAll(id){
  const ck=`fredall_${id}`;const cc=cacheGet(ck);if(cc!==undefined)return cc;
  const url=`https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(id)}&api_key=${encodeURIComponent(FRED_KEY)}&file_type=json`;
  const data=await fetchJson(url);
  return cacheSet(ck,Array.isArray(data.observations)?data.observations:[],TTL.fred_m);
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

/* CRYPTO */
async function coinbase(pair){
  const ck=`cb_${pair}`;const cc=cacheGet(ck);if(cc!==undefined)return cc;
  const d=await fetchJson(`https://api.coinbase.com/v2/prices/${pair}/spot`);
  const v=toNum(d?.data?.amount);if(v==null)throw new Error(`${pair} null`);
  return cacheSet(ck,{value:v,ts:new Date().toISOString()},TTL.crypto);
}
async function btcDomFn(){
  const cc=cacheGet("btcdom");if(cc!==undefined)return cc;
  const d=await fetchJson("https://api.coingecko.com/api/v3/global");
  return cacheSet("btcdom",toNum(d?.data?.market_cap_percentage?.btc),TTL.yahoo);
}
async function eurusdFn(){
  const cc=cacheGet("eurusd");if(cc!==undefined)return cc;
  const d=await fetchJson("https://api.frankfurter.app/latest?from=EUR&to=USD");
  const v=toNum(d?.rates?.USD);if(v==null)throw new Error("EUR/USD null");
  return cacheSet("eurusd",{value:v,ts:new Date().toISOString()},TTL.yahoo);
}
async function fngFn(){
  const cc=cacheGet("fng");if(cc!==undefined)return cc;
  const d=await fetchJson("https://api.alternative.me/fng/?limit=1");
  const r=d?.data?.[0];if(!r)throw new Error("FNG null");
  return cacheSet("fng",{value:toNum(r.value),label:r.value_classification||null},TTL.fng);
}
function fngFallback(vix,sp){
  if(vix==null)return null;let s=50;
  if(vix>35)s-=35;else if(vix>30)s-=26;else if(vix>25)s-=16;else if(vix>20)s-=8;else if(vix<14)s+=18;
  if(sp!=null){if(sp>40)s+=8;else if(sp<0)s-=12;}
  s=Math.max(0,Math.min(100,s));
  return{value:s,label:s<25?"PEUR EXTRÊME":s<45?"PEUR":s<55?"NEUTRE":s<75?"OPTIMISME":"EUPHORIE"};
}

/* CREDIT */
async function creditSpreadsFn(){
  const cc=cacheGet("credit");if(cc!==undefined)return cc;
  const[hy,ig]=await Promise.all([safe(()=>fredObs("BAMLH0A0HYM2",5)),safe(()=>fredObs("BAMLC0A0CM",5))]);
  return cacheSet("credit",{hy:hy?.value,ig:ig?.value,ratio:(hy?.value&&ig?.value&&ig.value!==0)?hy.value/ig.value:null,date:hy?.date||null},TTL.fred_d);
}

/* DÉLINQUANCE — séries FRED actives vérifiées */
async function delinquencyFn(){
  const cc=cacheGet("delin_v3");if(cc!==undefined)return cc;
  // DRAUTONSA retiré. On utilise les séries actives confirmées.
  const[ccards,re,reloans,consumer,autoproxy]=await Promise.all([
    safe(()=>fredObs("DRCCLACBS",5)),   // Cartes crédit 90+j % ✅
    safe(()=>fredObs("DRSFRMACBS",5)),  // Immo résidentiel % ✅
    safe(()=>fredObs("DRSREACBS",5)),   // Real estate loans % ✅
    safe(()=>fredObs("DRCLACBS",5)),    // Consumer loans % ✅
    safe(()=>fredObs("DTCTHFNM",5))     // Tx croissance crédit conso (proxy auto)
  ]);
  // auto proxy : ne garder que si valeur plausible pour un taux de délinquance (0-10%)
  const autoRaw=autoproxy?.value;
  const autoVal=(autoRaw!=null&&autoRaw>0&&autoRaw<10)?autoRaw:null;
  return cacheSet("delin_v3",{
    creditCards:ccards?.value??null,autoLoans:autoVal,
    realEstate:re?.value??null,studentLoans:reloans?.value??null,
    commercialRe:consumer?.value??null,date:ccards?.date||re?.date||null
  },TTL.fred_m);
}

/* COMMODITÉS — Yahoo priorité absolue */
async function commoditiesFn(){
  const cc=cacheGet("commo_v3");if(cc!==undefined)return cc;
  const[yG,yS,yW,yB,yC,yN]=await Promise.all([
    safe(()=>yahooClose("GC=F")),safe(()=>yahooClose("SI=F")),safe(()=>yahooClose("CL=F")),
    safe(()=>yahooClose("BZ=F")),safe(()=>yahooClose("HG=F")),safe(()=>yahooClose("NG=F"))
  ]);
  const[fG,fS,fW,fB,fC,fN]=await Promise.all([
    safe(()=>fredObs("GOLDAMGBD228NLBM",5)),safe(()=>fredObs("SLVPRUSD",5)),
    safe(()=>fredObs("DCOILWTICO",5)),safe(()=>fredObs("DCOILBRENTEU",5)),
    safe(()=>fredObs("PCOPPUSDM",5)),safe(()=>fredObs("DHHNGSP",5))
  ]);
  const fgv=fG?.value;
  const fGn=fgv!=null?(fgv>5000&&fgv<500000?fgv/100:fgv):null;
  const pick=(y,f,range)=>inRange(y,range)??inRange(f,range)??null;
  const r={
    gold:{value:pick(yG,fGn,SANITY.gold),src:yG!=null?"Yahoo GC=F":"FRED"},
    silver:{value:pick(yS,fS?.value,SANITY.silver),src:yS!=null?"Yahoo SI=F":"FRED"},
    oil:{value:pick(yW,fW?.value,SANITY.oil),src:yW!=null?"Yahoo CL=F":"FRED"},
    brent:{value:pick(yB,fB?.value,SANITY.brent),src:yB!=null?"Yahoo BZ=F":"FRED"},
    copper:{value:pick(yC,fC?.value,SANITY.copper),src:yC!=null?"Yahoo HG=F":"FRED"},
    natgas:{value:pick(yN,fN?.value,SANITY.natgas),src:yN!=null?"Yahoo NG=F":"FRED"}
  };
  console.log("[COMMO] gold:",r.gold.value,"src:",r.gold.src,"silver:",r.silver.value,"oil:",r.oil.value);
  return cacheSet("commo_v3",r,TTL.yahoo);
}

/* DONNÉES RESEARCH (indicateurs avancés) */
async function researchFn(){
  const cc=cacheGet("research_v2");if(cc!==undefined)return cc;
  const[nfci,ted,m2,wei,conf,jolts]=await Promise.all([
    safe(()=>fredObs("NFCI",5)),      // Chicago Fed NFCI (conditions financières, 0=neutre, +tendu)
    safe(()=>fredObs("TEDRATE",5)),   // TED spread % (stress interbancaire)
    safe(()=>fredObs("M2SL",5)),      // M2 milliards USD
    safe(()=>fredObs("WEI",5)),       // NY Fed Weekly Economic Index
    safe(()=>fredObs("UMCSENT",5)),   // Conf. consommateur U Michigan
    safe(()=>fredObs("JTSJOL",5))     // JOLTS offres emploi (milliers)
  ]);
  return cacheSet("research_v2",{nfci,ted,m2,wei,conf,jolts},TTL.fred_d);
}

/* SECTEURS */
const ETFS=[
  {name:"Energie",sym:"XLE"},{name:"Santé",sym:"XLV"},{name:"Utilities",sym:"XLU"},
  {name:"Finance",sym:"XLF"},{name:"Industrie",sym:"XLI"},{name:"Matériaux",sym:"XLB"},
  {name:"Conso. disc.",sym:"XLY"},{name:"Tech",sym:"XLK"},{name:"Immo.",sym:"XLRE"},
  {name:"Conso. base",sym:"XLP"},{name:"Telecom",sym:"XLC"}
];
const UT_CFG={
  "1D":{range:"5d",interval:"1d"},"1W":{range:"1mo",interval:"1d"},"1M":{range:"1mo",interval:"1d"},
  "3M":{range:"3mo",interval:"1d"},"6M":{range:"6mo",interval:"1wk"},"1Y":{range:"1y",interval:"1mo"},"YTD":{range:"ytd",interval:"1d"}
};
async function secPerf(sym,ut){
  const cfg=UT_CFG[ut]||UT_CFG["1M"];
  const ck=`sec_${sym}_${ut}`;const cc=cacheGet(ck);if(cc!==undefined)return cc;
  const d=await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=${cfg.range}&interval=${cfg.interval}&includePrePost=false`);
  const c=d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
  if(!Array.isArray(c)||c.length<2)return cacheSet(ck,null,TTL.yahoo_sec);
  let first,last;
  if(ut==="1D"){const v=c.filter(x=>x!=null);if(v.length<2)return cacheSet(ck,null,TTL.yahoo_sec);last=v[v.length-1];first=v[v.length-2];}
  else{first=c.find(v=>v!=null);last=[...c].reverse().find(v=>v!=null);}
  if(!first||!last||first===0)return cacheSet(ck,null,TTL.yahoo_sec);
  return cacheSet(ck,((last/first)-1)*100,TTL.yahoo_sec);
}
async function allSectors(ut="1M"){
  const r=await Promise.all(ETFS.map(s=>safe(()=>secPerf(s.sym,ut))));
  return ETFS.map((s,i)=>({name:s.name,sym:s.sym,value:r[i]})).sort((a,b)=>(b.value??-99)-(a.value??-99));
}

/* RISK SCORE */
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
  if(gold!=null){const s=gold>3500?-2:gold>3000?-1:gold<2000?1:0;add(s,`Or $${Math.round(gold)} → ${s<0?"Risk-OFF (refuge)":"Neutre"}`);}
  if(copper!=null&&gold!=null&&gold>0){const cg=(copper/gold*1000);const s=cg>0.6?1:cg>0.4?0:-1;add(s,`Cu/Au ${cg.toFixed(2)} → ${s>0?"Risk-ON":s===0?"Neutre":"Risk-OFF"}`);}
  if(btc!=null){const s=btc>80000?1:btc>50000?0:-1;add(s,`BTC $${Math.round(btc/1000)}k → ${s>0?"Risk-ON":s===0?"Neutre":"Risk-OFF"}`);}
  if(cc!=null){const s=cc<2.5?1:cc<3.5?0:-1;add(s,`Délinquance CC ${cc.toFixed(2)}% → ${s>0?"Risk-ON":s===0?"Neutre":"Risk-OFF"}`);}
  if(nfci!=null){const s=nfci<-0.5?1:nfci<0.5?0:-1;add(s,`NFCI ${nfci.toFixed(2)} → ${s>0?"Risk-ON":s===0?"Neutre":"Risk-OFF"}`);}
  if(!sc.length)return null;
  const total=sc.reduce((a,b)=>a+b,0);
  const max=sc.length*2,min=sc.length*-3;
  const norm=Math.max(0,Math.min(100,Math.round(((total-min)/(max-min))*100)));
  const regime=norm>=65?"RISK-ON 🟢":norm>=50?"LÉGÈREMENT RISK-ON 🟡":norm>=35?"LÉGÈREMENT RISK-OFF 🟠":"RISK-OFF 🔴";
  const emoji=norm>=65?"🟢":norm>=50?"🟡":norm>=35?"🟠":"🔴";
  return{score:norm,regime,emoji,details:det,total};
}

/* LOCAL SUMMARY */
function localSummary(data,risk){
  const lines=[];
  const vix=data.vix?.value,sp=data.yields?.spread2s10s,cpi=data.inflation?.cpiYoY;
  const unr=data.labor?.unemploymentRate,dxy=data.dxyProxy?.value;
  const gold=data.commodities?.gold?.value,silv=data.commodities?.silver?.value;
  const copper=data.commodities?.copper?.value,wti=data.commodities?.oil?.value;
  const btc=data.crypto?.btcusd?.value,hy=data.credit?.hy,ig=data.credit?.ig;
  const fg=data.sentiment?.value,nfci=data.research?.nfci?.value,wei=data.research?.wei?.value;
  if(risk)lines.push(`${risk.emoji} RÉGIME : ${risk.regime} (${risk.score}/100).`);
  if(vix!=null)lines.push(vix>=30?`⚠️ VIX ${vix.toFixed(2)} — STRESS.`:vix>=20?`⚡ VIX ${vix.toFixed(2)} — modéré.`:`✅ VIX ${vix.toFixed(2)} — calme.`);
  if(sp!=null)lines.push(sp>0?`📈 2s10s +${sp.toFixed(0)}pb positive.`:`🔴 2s10s ${sp.toFixed(0)}pb INVERSÉE.`);
  if(cpi!=null&&unr!=null)lines.push(`💹 CPI ${cpi.toFixed(2)}% | Chômage ${unr.toFixed(2)}%.`);
  if(dxy!=null)lines.push(`💵 DXY ${dxy.toFixed(2)}${dxy<100?" — dollar faible.":dxy>104?" — dollar fort.":"."}`);
  if(gold!=null)lines.push(`🥇 Or $${Math.round(gold)}/oz.`);
  if(gold&&silv&&silv>0)lines.push(`⚖️ G/S ${(gold/silv).toFixed(1)}x.`);
  if(copper&&gold&&gold>0){const cg=copper/gold*1000;lines.push(`🔩 Cu/Au ${cg.toFixed(2)}${cg>0.5?" — risk-on signal.":" — risk-off signal."}`);}
  if(wti!=null)lines.push(`🛢️ WTI $${wti.toFixed(2)}.`);
  if(btc!=null)lines.push(`₿ BTC $${Math.round(btc).toLocaleString("en-US")}.`);
  if(hy!=null&&ig!=null)lines.push(`📊 HY ${hy.toFixed(2)}% | IG ${ig.toFixed(2)}%.`);
  if(fg!=null)lines.push(`😱 F&G ${Math.round(fg)}/100 — ${data.sentiment?.label||""}.`);
  if(nfci!=null)lines.push(`🏦 NFCI ${nfci.toFixed(2)}${nfci>0.5?" — conditions tendue.":nfci<-0.5?" — conditions souples.":" — conditions neutres."}`);
  if(wei!=null)lines.push(`📡 WEI ${wei.toFixed(2)}${wei>0?" — activité positive.":" — activité faible."}`);
  return lines.join(" ");
}

/* CLAUDE HAIKU */
async function callClaude(question,ctx,maxTokens=240){
  if(!ANTHROPIC_KEY)throw new Error("ANTHROPIC_KEY manquante");
  const d=ctx||{};const risk=riskScore(d);
  const gold=d.commodities?.gold?.value,copper=d.commodities?.copper?.value;
  const snap={
    vix:d.vix?.value?.toFixed(2),dxy:d.dxyProxy?.value?.toFixed(2),
    sp2s10s:d.yields?.spread2s10s?.toFixed(0),
    us2y:d.yields?.us2y?.toFixed(2),   // ← maintenant un vrai nombre
    us10y:d.yields?.us10y?.toFixed(2),us30y:d.yields?.us30y?.toFixed(2),
    cpi:d.inflation?.cpiYoY?.toFixed(2),coreCpi:d.inflation?.coreCpi?.toFixed(2),
    pce:d.inflation?.pceCore?.toFixed(2),unr:d.labor?.unemploymentRate?.toFixed(2),
    fed:d.fed?.upperBound?.toFixed(2),
    btc:d.crypto?.btcusd?.value?Math.round(d.crypto.btcusd.value):null,
    eth:d.crypto?.ethusd?Math.round(d.crypto.ethusd):null,
    gold:gold?Math.round(gold):null,silver:d.commodities?.silver?.value?.toFixed(2),
    wti:d.commodities?.oil?.value?.toFixed(2),brent:d.commodities?.brent?.value?.toFixed(2),
    copper:copper?.toFixed(3),natgas:d.commodities?.natgas?.value?.toFixed(2),
    cuauRatio:(copper&&gold&&gold>0)?(copper/gold*1000).toFixed(2):null,
    hy:d.credit?.hy?.toFixed(2),ig:d.credit?.ig?.toFixed(2),
    fg:d.sentiment?.value?Math.round(d.sentiment.value):null,fgLabel:d.sentiment?.label,
    cc:d.delinquency?.creditCards?.toFixed(2),auto:d.delinquency?.autoLoans?.toFixed(2),
    nfci:d.research?.nfci?.value?.toFixed(2),ted:d.research?.ted?.value?.toFixed(2),
    wei:d.research?.wei?.value?.toFixed(2),conf:d.research?.conf?.value?.toFixed(1),
    jolts:d.research?.jolts?.value?Math.round(d.research.jolts.value):null,
    riskScore:risk?.score,riskRegime:risk?.regime,riskDetails:risk?.details?.slice(0,5)
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
    /* Noms avec préfixe 'r' pour éviter tout conflit avec les valeurs extraites */
    const[rDxy,rVix,r1m,r3m,r2y,r10y,r30y,rUnr,rFed,
          cpiAll,coreCpiAll,pceCoreAll,
          rEur,rBtc,rEth,rBtcDom,rFng,rCredit,rDelin,rCommo,rSectors,rResearch
    ]=await Promise.all([
      safe(()=>fredObs("DTWEXBGS",5)),safe(()=>fredObs("VIXCLS",5)),
      safe(()=>fredObs("DGS1MO",5)),safe(()=>fredObs("DGS3MO",5)),
      safe(()=>fredObs("DGS2",5)),    // r2y = {value, date}
      safe(()=>fredObs("DGS10",5)),   // r10y = {value, date}
      safe(()=>fredObs("DGS30",5)),
      safe(()=>fredObs("UNRATE",5)),safe(()=>fredObs("DFEDTARU",5)),
      safe(()=>fredAll("CPIAUCSL"),[]),safe(()=>fredAll("CPILFESL"),[]),safe(()=>fredAll("PCEPILFE"),[]),
      safe(()=>eurusdFn()),safe(()=>coinbase("BTC-USD")),safe(()=>coinbase("ETH-USD")),
      safe(()=>btcDomFn()),safe(()=>fngFn()),safe(()=>creditSpreadsFn()),
      safe(()=>delinquencyFn()),commoditiesFn(),
      safe(()=>allSectors(ut),[]),safe(()=>researchFn())
    ]);

    /* ← BUG FIX us2y : extraire .value explicitement */
    const us1m=toNum(r1m?.value), us3m=toNum(r3m?.value);
    const us2y=toNum(r2y?.value);    // nombre, pas l'objet {value,date}
    const us10y=toNum(r10y?.value), us30y=toNum(r30y?.value);
    const spread2s10s=(us2y!=null&&us10y!=null)?(us10y-us2y)*100:null;
    const sentiment=rFng||fngFallback(toNum(rVix?.value),spread2s10s);
    const cpiLast=lastValid(cpiAll);
    const gold=rCommo?.gold?.value, copper=rCommo?.copper?.value;

    const data={
      dxyProxy:{value:toNum(rDxy?.value),date:rDxy?.date},
      vix:{value:toNum(rVix?.value),date:rVix?.date},
      yields:{us1m,us3m,us2y,us10y,us30y,spread2s10s},  // us2y = nombre ✅
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
    res.json({updatedAt:new Date().toISOString(),sources:{fred:"FRED St. Louis",market:"Yahoo · Coinbase · Frankfurter · Alt.me"},data});
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
  try{res.json({text:await callClaude(
    "Briefing d'ouverture : 1) Régime Risk-ON/OFF avec justification (utilise riskScore, riskDetails, cuauRatio, nfci, wei) 2) 3 points macro critiques aujourd'hui avec chiffres précis 3) Signal d'alerte ou opportunité notable.",
    dash.data,380)});}
  catch(err){res.json({text:localSummary(dash.data,riskScore(dash.data))});}
});

app.post("/api/ai/risk",async(req,res)=>{
  const dash=req.body?.dashboard||null;if(!dash?.data)return res.status(400).json({error:"Pas de données."});
  const risk=riskScore(dash.data);
  const cuau=dash.data?.derived?.copperGoldRatio;
  try{
    const text=await callClaude(
      `Analyse détaillée Risk-ON/Risk-OFF. Score composite: ${risk?.score}/100 (${risk?.regime}). Détails signaux: ${JSON.stringify(risk?.details)}. Ratio Cu/Au: ${cuau?.toFixed(2)}. NFCI: ${dash.data?.research?.nfci?.value?.toFixed(2)}. TED: ${dash.data?.research?.ted?.value?.toFixed(2)}. Explique: 1) Le régime dominant 2) Les signaux contradictoires 3) Implications par classe d'actifs (actions, taux, or, dollar, crypto, émergents).`,
      dash.data,320);
    res.json({text,riskScore:risk?.score,riskRegime:risk?.regime,details:risk?.details});
  }catch(err){res.status(500).json({error:err.message});}
});

app.get("/health",(_,res)=>res.json({ok:true,ts:new Date().toISOString(),cache:CACHE.size}));
app.get("*",(_,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`◆ TERMINAL MACRO v3.2 — port ${PORT}`));
