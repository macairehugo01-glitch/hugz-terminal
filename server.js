/* ◆ TERMINAL MACRO v5.0 — RAILWAY STABLE
   Architecture basée sur les APIs confirmées accessibles depuis Railway :
   ✅ FRED (api.stlouisfed.org) — toujours accessible
   ✅ Coinbase (api.coinbase.com) — accessible, mais on force USD
   ✅ Frankfurter (api.frankfurter.app) — accessible
   ✅ Alternative.me (api.alternative.me) — accessible
   ✅ Yahoo Finance — accessible avec crumb

   FIXES v5.0 :
   ① Or : Coinbase XAU-USD forcé en USD via header Accept-Language: en-US
      + sanity élargie [2000, 5000] pour couvrir les fluctuations
      + FRED GOLDAMGBD228NLBM comme source principale si Coinbase hors range
   ② Indices SPX/NDX/DJI : Yahoo v8 crumb, avec crumb préchauffé au boot
   ③ Secteurs : Yahoo v8 crumb, batches 3×800ms, cache 10min
   ④ Cu/Au : affiché même si cuivre = estimé, clairement signalé
*/
const express=require("express"),path=require("path");
const app=express(),PORT=process.env.PORT||3000;
const FRED_KEY=process.env.FRED_API_KEY||"2945c843ac2ef54c3d1272b9f9cc2747";
const CLAUDE_KEY=process.env.ANTHROPIC_KEY||"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";
app.use(express.static(path.join(__dirname,"public")));
app.use(express.json({limit:"2mb"}));

/* ═══════════════════════════════════════════
   CACHE
═══════════════════════════════════════════ */
const CACHE=new Map();
function cacheGet(k){
  const e=CACHE.get(k);
  if(!e)return undefined;
  if(Date.now()-e.t>e.ttl){CACHE.delete(k);return undefined;}
  return e.v;
}
function cacheSet(k,v,ttl){CACHE.set(k,{v,t:Date.now(),ttl});return v;}

const TTL={
  metals:  3*60*1000,    // 3 min
  crypto:  60*1000,      // 1 min
  equity:  3*60*1000,    // 3 min
  sector: 10*60*1000,    // 10 min
  yahoo:   5*60*1000,    // 5 min
  fng:    25*60*1000,    // 25 min
  fred_d:  4*3600*1000,  // 4 h (données quotidiennes FRED)
  fred_m: 12*3600*1000   // 12 h (données mensuelles FRED)
};

/* ═══════════════════════════════════════════
   UTILS
═══════════════════════════════════════════ */
const toNum=v=>{const n=parseFloat(v);return isFinite(n)?n:null;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function safe(fn,fallback=null){
  try{return await fn();}
  catch(e){console.warn(`[SAFE] ${e.message?.slice(0,100)}`);return fallback;}
}

// Fetch avec timeout
async function fetchJSON(url,opts={}){
  const ms=opts.timeout||16000;
  const ac=new AbortController();
  const timer=setTimeout(()=>ac.abort(),ms);
  try{
    const res=await fetch(url,{
      signal:ac.signal,
      ...opts,
      headers:{
        "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
        "Accept":"application/json,*/*",
        "Accept-Language":"en-US,en;q=0.9",
        "Cache-Control":"no-cache",
        ...(opts.headers||{})
      }
    });
    clearTimeout(timer);
    if(!res.ok)throw new Error(`HTTP ${res.status} — ${url.slice(0,60)}`);
    return await res.json();
  }finally{
    clearTimeout(timer);
  }
}

/* ═══════════════════════════════════════════
   YAHOO FINANCE — CRUMB SYSTEM
═══════════════════════════════════════════ */
let _crumb=null,_cookie=null,_crumbAge=0;
const CRUMB_TTL=6*3600*1000; // 6h

async function refreshCrumb(){
  console.log("[CRUMB] Refreshing Yahoo crumb...");
  try{
    // Étape 1 : cookie
    const r1=await fetch("https://finance.yahoo.com/",{
      headers:{
        "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
        "Accept":"text/html,*/*",
        "Accept-Language":"en-US,en;q=0.9"
      },
      redirect:"follow"
    });
    const rawCookie=r1.headers.get("set-cookie")||"";
    const cookieStr=rawCookie.split(";")[0]||"";

    // Étape 2 : crumb
    const r2=await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb",{
      headers:{
        "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
        "Accept":"*/*",
        "Accept-Language":"en-US,en;q=0.9",
        "Referer":"https://finance.yahoo.com/",
        ...(cookieStr?{"Cookie":cookieStr}:{})
      }
    });
    const crumbText=(await r2.text()).trim();
    if(crumbText&&crumbText.length>=3&&!crumbText.startsWith("<")){
      _crumb=crumbText;_cookie=cookieStr;_crumbAge=Date.now();
      console.log(`[CRUMB] OK: ${_crumb.slice(0,8)}... cookie: ${_cookie.slice(0,20)}...`);
      return true;
    }
  }catch(e){console.warn("[CRUMB] Error:",e.message?.slice(0,80));}
  _crumb="";_cookie="";_crumbAge=Date.now();
  console.warn("[CRUMB] Failed — using empty crumb");
  return false;
}

async function getCrumb(){
  if(!_crumb&&!_crumbAge||Date.now()-_crumbAge>CRUMB_TTL)await refreshCrumb();
  return{crumb:_crumb||"",cookie:_cookie||""};
}

async function yahooChart(sym,range,interval,timeout=22000){
  const{crumb,cookie}=await getCrumb();
  const params=new URLSearchParams({range,interval,includePrePost:"false"});
  if(crumb)params.set("crumb",crumb);
  const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?${params}`;
  const hdrs={
    "Referer":"https://finance.yahoo.com/",
    "Accept":"application/json,*/*",
    "Accept-Language":"en-US,en;q=0.9"
  };
  if(cookie)hdrs["Cookie"]=cookie;

  for(const host of["query1","query2"]){
    try{
      const u=url.replace("query1",host);
      const d=await fetchJSON(u,{headers:hdrs,timeout});
      if(d?.chart?.error?.code==="Unauthorized"){_crumb=null;_crumbAge=0;break;}
      const closes=d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
      if(Array.isArray(closes)&&closes.length>0)return closes;
    }catch(e){console.warn(`[YH] ${sym}@${host}: ${e.message?.slice(0,60)}`);}
  }
  // crumb invalide → refresh et retry une fois
  if(_crumb){
    console.log(`[YH] Crumb refresh retry for ${sym}...`);
    await refreshCrumb();
    const{crumb:c2,cookie:ck2}=await getCrumb();
    const params2=new URLSearchParams({range,interval,includePrePost:"false"});
    if(c2)params2.set("crumb",c2);
    const hdrs2={"Referer":"https://finance.yahoo.com/","Accept":"application/json,*/*"};
    if(ck2)hdrs2["Cookie"]=ck2;
    try{
      const d=await fetchJSON(
        `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?${params2}`,
        {headers:hdrs2,timeout}
      );
      const closes=d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
      if(Array.isArray(closes)&&closes.length>0)return closes;
    }catch(e){console.warn(`[YH] retry ${sym}: ${e.message?.slice(0,50)}`);}
  }
  return null;
}

async function yahooLast(sym){
  const k=`yhl5_${sym}`;const c=cacheGet(k);if(c!==undefined)return c;
  const closes=await yahooChart(sym,"5d","1d");
  if(!closes)return cacheSet(k,null,TTL.yahoo);
  const v=[...closes].reverse().find(x=>x!=null)??null;
  return cacheSet(k,v,TTL.yahoo);
}

/* ═══════════════════════════════════════════
   FRED
═══════════════════════════════════════════ */
async function fredObs(id,lim=10,ttl=TTL.fred_d){
  const k=`f5_${id}`;const c=cacheGet(k);if(c!==undefined)return c;
  const url=`https://api.stlouisfed.org/fred/series/observations`+
    `?series_id=${encodeURIComponent(id)}&api_key=${encodeURIComponent(FRED_KEY)}`+
    `&sort_order=desc&limit=${lim}&file_type=json`;
  const d=await fetchJSON(url,{timeout:15000});
  const obs=Array.isArray(d?.observations)?d.observations.find(o=>o.value!=="."&&o.value!==""):null;
  return cacheSet(k,{v:toNum(obs?.value),d:obs?.date||null},ttl);
}
async function fredAll(id){
  const k=`fa5_${id}`;const c=cacheGet(k);if(c!==undefined)return c;
  const url=`https://api.stlouisfed.org/fred/series/observations`+
    `?series_id=${encodeURIComponent(id)}&api_key=${encodeURIComponent(FRED_KEY)}&file_type=json`;
  const d=await fetchJSON(url,{timeout:15000});
  return cacheSet(k,Array.isArray(d?.observations)?d.observations:[],TTL.fred_m);
}
function lastValid(obs){
  if(!Array.isArray(obs))return null;
  for(let i=obs.length-1;i>=0;i--){
    const v=obs[i]?.value;if(v!=="."&&v!==""&&v!=null)return obs[i];
  }return null;
}
function calcYoY(obs){
  const v=(obs||[]).filter(o=>o.value!=="."&&o.value!=="");
  if(v.length<13)return null;
  const last=v[v.length-1],lv=toNum(last.value);if(lv==null)return null;
  const ld=new Date(last.date);let ya=null;
  for(let i=v.length-2;i>=0;i--){
    const d=new Date(v[i].date);
    if(d.getFullYear()===ld.getFullYear()-1&&d.getMonth()===ld.getMonth()){ya=v[i];break;}
  }
  if(!ya)ya=v[v.length-13];
  const ov=toNum(ya?.value);if(ov==null||ov===0)return null;
  return((lv/ov)-1)*100;
}

/* ═══════════════════════════════════════════
   OR, ARGENT, CUIVRE
   Stratégie : FRED en 1er (le plus fiable depuis Railway)
   Coinbase en 2ème, Yahoo en 3ème
═══════════════════════════════════════════ */
async function goldFn(){
  const k="gold5";const c=cacheGet(k);if(c!==undefined)return c;
  // FRED GOLDAMGBD228NLBM — London PM fixing, USD/troy oz
  // Cette série est fiable et retourne une valeur récente (lag 1-2 jours)
  const fg=await safe(()=>fredObs("GOLDAMGBD228NLBM",5,TTL.fred_d));
  if(fg?.v!=null&&fg.v>2000&&fg.v<5000){
    console.log("[GOLD] FRED:",fg.v,"date:",fg.d);
    return cacheSet(k,{value:fg.v,src:"FRED London",date:fg.d},TTL.fred_d);
  }
  // Coinbase XAU-USD — forcer USD avec headers
  const cxau=await safe(async()=>{
    const d=await fetchJSON("https://api.coinbase.com/v2/prices/XAU-USD/spot",{
      headers:{"Accept-Language":"en-US","CB-VERSION":"2016-02-18"},
      timeout:12000
    });
    return toNum(d?.data?.amount);
  });
  if(cxau!=null&&cxau>2000&&cxau<5000){
    console.log("[GOLD] Coinbase:",cxau);
    return cacheSet(k,{value:cxau,src:"Coinbase XAU"},TTL.metals);
  }
  // Yahoo GC=F
  const yg=await safe(()=>yahooLast("GC=F"));
  if(yg!=null&&yg>2000&&yg<5000){
    console.log("[GOLD] Yahoo GC=F:",yg);
    return cacheSet(k,{value:yg,src:"Yahoo GC=F"},TTL.yahoo);
  }
  console.warn("[GOLD] All sources failed — FRED:",fg?.v,"CB:",cxau,"YH:",yg);
  return cacheSet(k,{value:null,src:"N/A"},TTL.metals);
}

async function silverFn(){
  const k="silver5";const c=cacheGet(k);if(c!==undefined)return c;
  // Coinbase XAG-USD
  const cxag=await safe(async()=>{
    const d=await fetchJSON("https://api.coinbase.com/v2/prices/XAG-USD/spot",{
      headers:{"Accept-Language":"en-US","CB-VERSION":"2016-02-18"},timeout:12000
    });
    return toNum(d?.data?.amount);
  });
  if(cxag!=null&&cxag>20&&cxag<120)return cacheSet(k,{value:cxag,src:"Coinbase XAG"},TTL.metals);
  const ys=await safe(()=>yahooLast("SI=F"));
  if(ys!=null&&ys>20&&ys<120)return cacheSet(k,{value:ys,src:"Yahoo SI=F"},TTL.yahoo);
  return cacheSet(k,{value:null,src:"N/A"},TTL.metals);
}

async function copperFn(){
  const k="copper5";const c=cacheGet(k);if(c!==undefined)return c;
  // Yahoo HG=F
  const yc=await safe(()=>yahooLast("HG=F"));
  if(yc!=null&&yc>2&&yc<15)return cacheSet(k,{value:yc,src:"Yahoo HG=F",stale:false},TTL.yahoo);
  // FRED mensuel
  const fc=await safe(()=>fredObs("PCOPPUSDM",5,TTL.fred_m));
  if(fc?.v!=null&&fc.v>2&&fc.v<15)return cacheSet(k,{value:fc.v,src:"FRED mensuel",stale:false},TTL.fred_m);
  // Fallback connu
  return cacheSet(k,{value:4.60,src:"Estimé*",stale:true},TTL.metals);
}

async function commo(sym,fredId,lo,hi,key){
  const c=cacheGet(key);if(c!==undefined)return c;
  const yv=await safe(()=>yahooLast(sym));
  if(yv!=null&&yv>=lo&&yv<=hi)return cacheSet(key,{value:yv,src:"Yahoo"},TTL.yahoo);
  const fv=await safe(()=>fredObs(fredId,5,TTL.fred_d));
  if(fv?.v!=null&&fv.v>=lo&&fv.v<=hi)return cacheSet(key,{value:fv.v,src:"FRED"},TTL.fred_d);
  return cacheSet(key,{value:null,src:"N/A"},TTL.yahoo);
}

/* ═══════════════════════════════════════════
   FX, FNG, CRÉDIT, DÉLINQUANCE, RESEARCH
═══════════════════════════════════════════ */
async function eurusdFn(){
  const k="eur5";const c=cacheGet(k);if(c!==undefined)return c;
  const d=await fetchJSON("https://api.frankfurter.app/latest?from=EUR&to=USD",{timeout:10000});
  const v=toNum(d?.rates?.USD);if(v==null)throw new Error("EUR/USD null");
  return cacheSet(k,{value:v},TTL.yahoo);
}
async function fngFn(){
  const k="fng5";const c=cacheGet(k);if(c!==undefined)return c;
  const d=await fetchJSON("https://api.alternative.me/fng/?limit=1",{timeout:10000});
  const r=d?.data?.[0];if(!r)throw new Error("FNG null");
  return cacheSet(k,{value:toNum(r.value),label:r.value_classification||null},TTL.fng);
}
function fngFallback(vix,sp){
  if(vix==null)return null;
  let s=50;
  if(vix>35)s-=35;else if(vix>30)s-=26;else if(vix>25)s-=16;else if(vix>20)s-=8;else if(vix<14)s+=18;
  if(sp!=null){if(sp>40)s+=8;else if(sp<0)s-=12;}
  s=Math.max(0,Math.min(100,s));
  const label=s<25?"PEUR EXTRÊME":s<45?"PEUR":s<55?"NEUTRE":s<75?"OPTIMISME":"EUPHORIE";
  return{value:s,label};
}
async function creditFn(){
  const k="cred5";const c=cacheGet(k);if(c!==undefined)return c;
  const[hy,ig]=await Promise.all([
    safe(async()=>{const r=await fredObs("BAMLH0A0HYM2",10,TTL.fred_d);return(r?.v>0&&r.v<30)?r.v:null;}),
    safe(async()=>{const r=await fredObs("BAMLC0A0CM",10,TTL.fred_d);return(r?.v>0&&r.v<10)?r.v:null;})
  ]);
  return cacheSet(k,{hy,ig,ratio:(hy&&ig&&ig!==0)?hy/ig:null},TTL.fred_d);
}
async function delinFn(){
  const k="delin5";const c=cacheGet(k);if(c!==undefined)return c;
  const[cc,re,reL,conL,autoL,autoAlt]=await Promise.all([
    safe(()=>fredObs("DRCCLACBS",5,TTL.fred_m)),
    safe(()=>fredObs("DRSFRMACBS",5,TTL.fred_m)),
    safe(()=>fredObs("DRSREACBS",5,TTL.fred_m)),
    safe(()=>fredObs("DRCLACBS",5,TTL.fred_m)),
    safe(()=>fredObs("DTCTHFNM",5,TTL.fred_m)),
    safe(()=>fredObs("DRAUTONSA",5,TTL.fred_m))
  ]);
  const autoRaw=autoAlt?.v??autoL?.v;
  const autoV=(autoRaw!=null&&autoRaw>0.3&&autoRaw<10)?autoRaw:null;
  return cacheSet(k,{
    creditCards:cc?.v??null,autoLoans:autoV??1.74,autoStale:autoV==null,
    realEstate:re?.v??null,studentLoans:reL?.v??null,commercialRe:conL?.v??null,
    date:cc?.d||null
  },TTL.fred_m);
}
async function researchFn(){
  const k="res5";const c=cacheGet(k);if(c!==undefined)return c;
  const[nfci,ted,wei,conf,jolts]=await Promise.all([
    safe(()=>fredObs("NFCI",5,TTL.fred_d)),safe(()=>fredObs("TEDRATE",5,TTL.fred_d)),
    safe(()=>fredObs("WEI",5,TTL.fred_d)),safe(()=>fredObs("UMCSENT",5,TTL.fred_m)),
    safe(()=>fredObs("JTSJOL",5,TTL.fred_m))
  ]);
  console.log("[RES] NFCI:",nfci?.v,"TED:",ted?.v,"WEI:",wei?.v,"CONF:",conf?.v,"JOLTS:",jolts?.v);
  return cacheSet(k,{nfci,ted,wei,conf,jolts},TTL.fred_d);
}
async function btcDomFn(){
  const k="btcd5";const c=cacheGet(k);if(c!==undefined)return c;
  const d=await fetchJSON("https://api.coingecko.com/api/v3/global",{timeout:10000});
  return cacheSet(k,toNum(d?.data?.market_cap_percentage?.btc),TTL.yahoo);
}

/* ═══════════════════════════════════════════
   INDICES BOURSIERS — Yahoo v8 + crumb
═══════════════════════════════════════════ */
async function equitiesFn(){
  const k="eq5";const c=cacheGet(k);if(c!==undefined)return c;
  async function idx(sym){
    const closes=await safe(()=>yahooChart(sym,"5d","1d",20000));
    if(!closes||closes.length<2)return null;
    const valid=closes.filter(x=>x!=null);
    if(valid.length<2)return null;
    const last=valid[valid.length-1],prev=valid[valid.length-2];
    return{price:last,chgPct:prev?((last/prev)-1)*100:null};
  }
  const[spx,ndx,dji]=await Promise.all([
    safe(()=>idx("^GSPC")),safe(()=>idx("^NDX")),safe(()=>idx("^DJI"))
  ]);
  console.log("[EQ] SPX:",spx?.price?.toFixed(0),"NDX:",ndx?.price?.toFixed(0),"DJI:",dji?.price?.toFixed(0));
  return cacheSet(k,{spx,ndx,dji},TTL.equity);
}

/* ═══════════════════════════════════════════
   SECTEURS — Yahoo v8 + crumb, batches 3×800ms
═══════════════════════════════════════════ */
const ETFS=[
  {n:"Tech",     s:"XLK"},{n:"Finance",  s:"XLF"},{n:"Santé",    s:"XLV"},
  {n:"Energie",  s:"XLE"},{n:"C. disc.", s:"XLY"},{n:"Industrie",s:"XLI"},
  {n:"C. base",  s:"XLP"},{n:"Utilities",s:"XLU"},{n:"Matériaux",s:"XLB"},
  {n:"Immo.",    s:"XLRE"},{n:"Telecom", s:"XLC"}
];
const UTC={
  "1D":{r:"5d",i:"1d"},"1W":{r:"1mo",i:"1d"},"1M":{r:"1mo",i:"1d"},
  "3M":{r:"3mo",i:"1d"},"6M":{r:"6mo",i:"1wk"},"1Y":{r:"1y",i:"1mo"},"YTD":{r:"ytd",i:"1d"}
};

async function sectorPerf(sym,ut){
  const cfg=UTC[ut]||UTC["1M"];
  const k=`s5_${sym}_${ut}`;const c=cacheGet(k);if(c!==undefined)return c;
  const closes=await safe(()=>yahooChart(sym,cfg.r,cfg.i,22000));
  if(!closes||closes.length<2)return cacheSet(k,null,TTL.sector);
  let first,last;
  if(ut==="1D"){
    const v=closes.filter(x=>x!=null);if(v.length<2)return cacheSet(k,null,TTL.sector);
    last=v[v.length-1];first=v[v.length-2];
  }else{
    first=closes.find(v=>v!=null);
    last=[...closes].reverse().find(v=>v!=null);
  }
  if(!first||!last||first===0)return cacheSet(k,null,TTL.sector);
  const p=((last/first)-1)*100;
  console.log(`[SEC] ${sym}: ${p.toFixed(2)}%`);
  return cacheSet(k,p,TTL.sector);
}

async function allSectors(ut="1M"){
  const results=[];
  for(let i=0;i<ETFS.length;i+=3){
    const batch=ETFS.slice(i,i+3);
    const batchRes=await Promise.all(batch.map(e=>safe(()=>sectorPerf(e.s,ut))));
    results.push(...batchRes);
    if(i+3<ETFS.length)await sleep(800);
  }
  const ok=results.filter(r=>r!=null).length;
  console.log(`[SEC] ${ok}/${ETFS.length} OK (${ut})`);
  return ETFS.map((e,i)=>({name:e.n,sym:e.s,value:results[i]}))
             .sort((a,b)=>(b.value??-99)-(a.value??-99));
}

/* ═══════════════════════════════════════════
   RISK SCORE
═══════════════════════════════════════════ */
function calcRisk(d){
  const sc=[],det=[];
  const vix=d.vix?.value,sp=d.yields?.spread2s10s,hy=d.credit?.hy;
  const fg=d.sentiment?.value,dxy=d.dxyProxy?.value;
  const gold=d.commodities?.gold?.value,copper=d.commodities?.copper?.value;
  const btc=d.crypto?.btcusd?.value,cc=d.delinquency?.creditCards;
  const nfci=d.research?.nfci?.v,cuStale=d.derived?.copperStale;
  function add(s,l){sc.push(s);det.push(l);}
  if(vix!=null){const s=vix<15?2:vix<20?1:vix<25?-1:vix<35?-2:-3;add(s,`VIX ${vix.toFixed(1)} → ${s>0?"Risk-ON":"Risk-OFF"}`);}
  if(sp!=null){const s=sp>30?2:sp>0?1:sp>-20?-1:-2;add(s,`2s10s ${sp.toFixed(0)}pb → ${s>0?"Risk-ON":"Risk-OFF"}`);}
  if(hy!=null){const s=hy<4?1:hy<6?0:hy<8?-1:-2;add(s,`HY ${hy.toFixed(2)}% → ${s>0?"Risk-ON":s===0?"Neutre":"Risk-OFF"}`);}
  if(fg!=null){const s=fg>65?2:fg>45?1:fg>35?-1:-2;add(s,`F&G ${Math.round(fg)} → ${s>0?"Risk-ON":"Risk-OFF"}`);}
  if(dxy!=null){const s=dxy<100?1:dxy<104?0:-1;add(s,`DXY ${dxy.toFixed(2)} → ${s>0?"Risk-ON":s===0?"Neutre":"Risk-OFF"}`);}
  if(gold!=null){const s=gold>3500?-2:gold>3000?-1:gold<2000?1:0;add(s,`Or $${Math.round(gold)} → ${s<0?"Risk-OFF":"Neutre"}`);}
  if(copper!=null&&gold!=null&&gold>0&&!cuStale){
    const cg=copper/gold*1000;const s=cg>0.6?1:cg>0.4?0:-1;
    add(s,`Cu/Au ${cg.toFixed(3)} → ${s>0?"Risk-ON":s===0?"Neutre":"Risk-OFF"}`);
  }
  if(btc!=null){const s=btc>80000?1:btc>50000?0:-1;add(s,`BTC $${Math.round(btc/1000)}k → ${s>0?"Risk-ON":s===0?"Neutre":"Risk-OFF"}`);}
  if(cc!=null){const s=cc<2.5?1:cc<3.5?0:-1;add(s,`Délinq. CC ${cc.toFixed(2)}% → ${s>0?"Risk-ON":s===0?"Neutre":"Risk-OFF"}`);}
  if(nfci!=null){const s=nfci<-0.5?1:nfci<0.5?0:-1;add(s,`NFCI ${nfci.toFixed(2)} → ${s>0?"Risk-ON":s===0?"Neutre":"Risk-OFF"}`);}
  if(!sc.length)return null;
  const tot=sc.reduce((a,b)=>a+b,0),mx=sc.length*2,mn=sc.length*-3;
  const norm=Math.max(0,Math.min(100,Math.round(((tot-mn)/(mx-mn))*100)));
  const regime=norm>=65?"RISK-ON":norm>=50?"LÉGÈREMENT RISK-ON":norm>=35?"LÉGÈREMENT RISK-OFF":"RISK-OFF";
  const emoji=norm>=65?"🟢":norm>=50?"🟡":norm>=35?"🟠":"🔴";
  return{score:norm,regime,emoji,details:det};
}

function buildSummary(d,risk){
  const L=[];
  const vix=d.vix?.value,sp=d.yields?.spread2s10s,cpi=d.inflation?.cpiYoY;
  const unr=d.labor?.unemploymentRate,dxy=d.dxyProxy?.value;
  const gold=d.commodities?.gold?.value,silv=d.commodities?.silver?.value;
  const copper=d.commodities?.copper?.value,wti=d.commodities?.oil?.value;
  const btc=d.crypto?.btcusd?.value,hy=d.credit?.hy,ig=d.credit?.ig;
  const fg=d.sentiment?.value,nfci=d.research?.nfci?.v,wei=d.research?.wei?.v;
  if(risk)L.push(`${risk.emoji} ${risk.regime} — score ${risk.score}/100`);
  if(vix!=null)L.push(vix>=30?`⚠️ VIX ${vix.toFixed(1)} STRESS`:vix>=20?`⚡ VIX ${vix.toFixed(1)} modéré`:`✅ VIX ${vix.toFixed(1)} calme`);
  if(sp!=null)L.push(sp>0?`📈 2s10s +${sp.toFixed(0)}pb positive`:`🔴 2s10s ${sp.toFixed(0)}pb INVERSÉE`);
  if(cpi!=null)L.push(`💹 CPI ${cpi.toFixed(2)}% | Chômage ${unr?.toFixed(1)||"--"}%`);
  if(dxy!=null)L.push(`💵 DXY ${dxy.toFixed(2)}${dxy<100?" — dollar faible":dxy>104?" — dollar fort":""}`);
  if(gold!=null)L.push(`🥇 Or $${Math.round(gold)}/oz${silv?` | Ag $${silv.toFixed(2)}`:""}${(gold&&silv&&silv>0)?` | G/S ${(gold/silv).toFixed(1)}x`:""}`);
  if(copper&&gold&&gold>0){const cg=copper/gold*1000;L.push(`🔩 Cu/Au ${cg.toFixed(3)}${cg>0.5?" ↑ risk-on":" ↓ risk-off"}`);}
  if(wti!=null)L.push(`🛢️ WTI $${wti.toFixed(2)}`);
  if(btc!=null)L.push(`₿ BTC $${Math.round(btc).toLocaleString("en-US")}`);
  if(hy!=null&&ig!=null)L.push(`📊 HY ${hy.toFixed(2)}% | IG ${ig.toFixed(2)}%`);
  if(fg!=null)L.push(`😱 F&G ${Math.round(fg)}/100 — ${d.sentiment?.label||""}`);
  if(nfci!=null)L.push(`🏦 NFCI ${nfci.toFixed(2)}`);
  if(wei!=null)L.push(`📡 WEI ${wei>0?"+":""}${wei.toFixed(2)}`);
  return L.join("\n");
}

/* ═══════════════════════════════════════════
   CLAUDE HAIKU
═══════════════════════════════════════════ */
async function callClaude(question,ctx,maxTokens=260){
  if(!CLAUDE_KEY)throw new Error("ANTHROPIC_KEY manquante");
  const d=ctx||{},risk=calcRisk(d);
  const gold=d.commodities?.gold?.value,copper=d.commodities?.copper?.value;
  const snap={
    risk:{score:risk?.score,regime:risk?.regime,top3:risk?.details?.slice(0,3)},
    vix:d.vix?.value?.toFixed(1),dxy:d.dxyProxy?.value?.toFixed(2),
    sp2s10s:d.yields?.spread2s10s?.toFixed(0),
    us2y:d.yields?.us2y?.toFixed(2),us10y:d.yields?.us10y?.toFixed(2),
    cpi:d.inflation?.cpiYoY?.toFixed(2),coreCpi:d.inflation?.coreCpi?.toFixed(2),
    unr:d.labor?.unemploymentRate?.toFixed(1),fed:d.fed?.upperBound?.toFixed(2),
    btc:d.crypto?.btcusd?.value?Math.round(d.crypto.btcusd.value):null,
    gold:gold?Math.round(gold):null,silver:d.commodities?.silver?.value?.toFixed(2),
    wti:d.commodities?.oil?.value?.toFixed(2),copper:copper?.toFixed(2),
    cuau:(copper&&gold&&gold>0)?(copper/gold*1000).toFixed(3):null,
    hy:d.credit?.hy?.toFixed(2),ig:d.credit?.ig?.toFixed(2),
    fg:d.sentiment?.value?Math.round(d.sentiment.value):null,
    fgLabel:d.sentiment?.label,
    cc:d.delinquency?.creditCards?.toFixed(2),
    nfci:d.research?.nfci?.v?.toFixed(2),ted:d.research?.ted?.v?.toFixed(2),
    wei:d.research?.wei?.v?.toFixed(2),conf:d.research?.conf?.v?.toFixed(1),
    jolts:d.research?.jolts?.v?Math.round(d.research.jolts.v):null,
    spx:d.equities?.spx?.price?Math.round(d.equities.spx.price):null,
    spxChg:d.equities?.spx?.chgPct?.toFixed(2)
  };
  const res=await fetchJSON("https://api.anthropic.com/v1/messages",{
    method:"POST",
    headers:{"Content-Type":"application/json","x-api-key":CLAUDE_KEY,"anthropic-version":"2023-06-01"},
    body:JSON.stringify({
      model:"claude-haiku-4-5-20251001",max_tokens:maxTokens,
      system:`Analyste macro Bloomberg. Français. Dense, chiffré, factuel. Max ${maxTokens} tokens. Pas de conseil perso.`,
      messages:[{role:"user",content:`Data: ${JSON.stringify(snap)}\n\n${question}`}]
    }),
    timeout:30000
  });
  return res.content?.[0]?.text||"Pas de réponse.";
}

/* ═══════════════════════════════════════════
   ROUTES
═══════════════════════════════════════════ */
app.get("/api/dashboard",async(req,res)=>{
  try{
    const ut=req.query.ut||"1M";
    const[rDxy,rVix,r1m,r3m,r2y,r10y,r30y,rUnr,rFed,
          cpiAll,coreCpiAll,pceCpiAll,
          rEur,rBtc,rEth,rBtcDom,rFng,rCredit,rDelin,
          rGold,rSilver,rCopper,rOil,rBrent,rNatgas,
          rSectors,rResearch,rEquities
    ]=await Promise.all([
      safe(()=>fredObs("DTWEXBGS",5)),safe(()=>fredObs("VIXCLS",5)),
      safe(()=>fredObs("DGS1MO",5)),safe(()=>fredObs("DGS3MO",5)),
      safe(()=>fredObs("DGS2",5)),safe(()=>fredObs("DGS10",5)),safe(()=>fredObs("DGS30",5)),
      safe(()=>fredObs("UNRATE",5)),safe(()=>fredObs("DFEDTARU",5)),
      safe(()=>fredAll("CPIAUCSL"),[]),safe(()=>fredAll("CPILFESL"),[]),safe(()=>fredAll("PCEPILFE"),[]),
      safe(()=>eurusdFn()),
      safe(async()=>{const d=await fetchJSON("https://api.coinbase.com/v2/prices/BTC-USD/spot",{timeout:12000});return{value:toNum(d?.data?.amount),ts:new Date().toISOString()};}),
      safe(async()=>{const d=await fetchJSON("https://api.coinbase.com/v2/prices/ETH-USD/spot",{timeout:12000});return toNum(d?.data?.amount);}),
      safe(()=>btcDomFn()),safe(()=>fngFn()),safe(()=>creditFn()),safe(()=>delinFn()),
      goldFn(),silverFn(),copperFn(),
      safe(()=>commo("CL=F","DCOILWTICO",30,200,"oil5")),
      safe(()=>commo("BZ=F","DCOILBRENTEU",30,200,"brent5")),
      safe(()=>commo("NG=F","DHHNGSP",0.8,20,"natgas5")),
      safe(()=>allSectors(ut),[]),safe(()=>researchFn()),safe(()=>equitiesFn())
    ]);

    const us1m=toNum(r1m?.v),us3m=toNum(r3m?.v);
    const us2y=toNum(r2y?.v),us10y=toNum(r10y?.v),us30y=toNum(r30y?.v);
    const spread2s10s=(us2y!=null&&us10y!=null)?(us10y-us2y)*100:null;
    const sentiment=rFng||fngFallback(toNum(rVix?.v),spread2s10s);
    const cpiLast=lastValid(cpiAll);
    const gold=rGold?.value,copper=rCopper?.value;
    const cuau=(copper&&gold&&gold>0)?(copper/gold*1000):null;

    const data={
      dxyProxy:{value:toNum(rDxy?.v),date:rDxy?.d},
      vix:{value:toNum(rVix?.v),date:rVix?.d},
      yields:{us1m,us3m,us2y,us10y,us30y,spread2s10s},
      inflation:{cpiYoY:calcYoY(cpiAll),coreCpi:calcYoY(coreCpiAll),pceCore:calcYoY(pceCpiAll),date:cpiLast?.date||null},
      labor:{unemploymentRate:toNum(rUnr?.v),date:rUnr?.d},
      fed:{upperBound:toNum(rFed?.v),date:rFed?.d},
      fx:{eurusd:rEur},
      crypto:{btcusd:rBtc,btcDominance:rBtcDom,ethusd:typeof rEth==="number"?rEth:rEth?.value??null},
      commodities:{gold:rGold,silver:rSilver,copper:rCopper,oil:rOil,brent:rBrent,natgas:rNatgas},
      credit:rCredit,sentiment,delinquency:rDelin,research:rResearch,equities:rEquities,
      cds:[
        {c:"USA",v:62,r:"FAIBLE"},{c:"Allemagne",v:28,r:"FAIBLE"},{c:"France",v:84,r:"FAIBLE"},
        {c:"Italie",v:168,r:"MODÉRÉ"},{c:"Espagne",v:71,r:"FAIBLE"},{c:"Grèce",v:112,r:"MODÉRÉ"},
        {c:"Turquie",v:384,r:"ÉLEVÉ"},{c:"Brésil",v:220,r:"ÉLEVÉ"},{c:"Chine",v:95,r:"MODÉRÉ"},{c:"Japon",v:44,r:"FAIBLE"}
      ],
      sectors:Array.isArray(rSectors)?rSectors:[],sectorUT:ut,
      derived:{
        copperGoldRatio:cuau,
        goldSilverRatio:(gold&&rSilver?.value&&rSilver.value>0)?gold/rSilver.value:null,
        vixRegime:(()=>{const v=toNum(rVix?.v);return v==null?null:v>=30?"ÉLEVÉ 🔴":v>=20?"MODÉRÉ 🟡":"FAIBLE 🟢";})(),
        curveState:spread2s10s==null?null:spread2s10s>0?"positive ✅":"inversée 🔴",
        copperStale:rCopper?.stale||false,
        autoStale:rDelin?.autoStale||false
      }
    };
    const risk=calcRisk(data);
    data.riskAnalysis=risk;
    data.localSummary=buildSummary(data,risk);
    res.json({updatedAt:new Date().toISOString(),sources:{fred:"FRED St. Louis",market:"Coinbase·Yahoo(crumb)·Frankfurter·Alt.me"},data});
  }catch(err){
    console.error("DASHBOARD ERROR:",err);
    res.status(500).json({error:"failed",message:err.message});
  }
});

app.get("/api/sectors",async(req,res)=>{
  const ut=req.query.ut||"1M";
  res.json({ut,sectors:await safe(()=>allSectors(ut),[]),updatedAt:new Date().toISOString()});
});

/* ═══════════════════════════════════════════════════════
   JOURNAL D'ANALYSES — Articles en Markdown
   ─────────────────────────────────────────────────────
   Structure : dossier articles/ à la racine du projet
   Chaque article = un fichier .md avec frontmatter YAML :

   ---
   title: Mon analyse du marché
   date: 2026-05-18
   category: Macro
   tags: [Fed, inflation, or]
   cover: /articles/images/mon-image.jpg
   excerpt: Résumé court affiché dans la liste
   ---

   Contenu de l'article en Markdown...

   Pour ajouter un article :
   1. Créer articles/2026-05-18-mon-titre.md
   2. Git add + commit + push → Railway redéploie
   3. L'article apparaît automatiquement
═══════════════════════════════════════════════════════ */
const fs=require("fs");
const fsP=require("fs").promises;
const ARTICLES_DIR=path.join(__dirname,"articles");

// Crée le dossier articles/ s'il n'existe pas
if(!fs.existsSync(ARTICLES_DIR))fs.mkdirSync(ARTICLES_DIR,{recursive:true});
if(!fs.existsSync(path.join(ARTICLES_DIR,"images")))
  fs.mkdirSync(path.join(ARTICLES_DIR,"images"),{recursive:true});

// Parser frontmatter YAML minimal (sans dépendance externe)
function parseFrontmatter(content){
  const match=content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if(!match)return{meta:{},body:content};
  const meta={};
  match[1].split("\n").forEach(line=>{
    const m=line.match(/^(\w+):\s*(.+)$/);
    if(!m)return;
    const[,k,v]=m;
    // Tableaux [a, b, c]
    if(v.startsWith("[")&&v.endsWith("]")){
      meta[k]=v.slice(1,-1).split(",").map(s=>s.trim().replace(/['"]/g,""));
    }else{
      meta[k]=v.replace(/^['"]|['"]$/g,"").trim();
    }
  });
  return{meta,body:match[2].trim()};
}

// Convertir Markdown basique en HTML (sans dépendance)
function mdToHtml(md){
  return md
    // Titres
    .replace(/^#### (.+)$/gm,"<h4>$1</h4>")
    .replace(/^### (.+)$/gm,"<h3>$1</h3>")
    .replace(/^## (.+)$/gm,"<h2>$1</h2>")
    .replace(/^# (.+)$/gm,"<h1>$1</h1>")
    // Gras + italique
    .replace(/\*\*\*(.+?)\*\*\*/g,"<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>")
    .replace(/\*(.+?)\*/g,"<em>$1</em>")
    // Code inline
    .replace(/`([^`]+)`/g,"<code>$1</code>")
    // Liens
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank">$1</a>')
    // Images
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g,'<img src="$2" alt="$1" loading="lazy">')
    // Séparateurs
    .replace(/^---$/gm,"<hr>")
    // Blockquotes
    .replace(/^> (.+)$/gm,"<blockquote>$1</blockquote>")
    // Listes
    .replace(/^\- (.+)$/gm,"<li>$1</li>")
    .replace(/^(\d+)\. (.+)$/gm,"<li>$2</li>")
    // Paragraphes (double saut de ligne)
    .split(/\n\n+/)
    .map(block=>{
      if(/^<(h[1-4]|blockquote|hr|ul|ol|li|img)/.test(block.trim()))return block;
      if(block.trim().startsWith("<li>"))return`<ul>${block}</ul>`;
      return block.trim()?`<p>${block.replace(/\n/g,"<br>")}</p>`:"";
    })
    .join("\n");
}

// Lire tous les articles (liste)
async function getArticlesList(){
  const k="articles_list";const cached=cacheGet(k);
  if(cached!==undefined)return cached;
  try{
    const files=await fsP.readdir(ARTICLES_DIR);
    const mdFiles=files.filter(f=>f.endsWith(".md")).sort().reverse(); // plus récent en premier
    const articles=[];
    for(const file of mdFiles){
      const content=await fsP.readFile(path.join(ARTICLES_DIR,file),"utf8");
      const{meta}=parseFrontmatter(content);
      const slug=file.replace(/\.md$/,"");
      if(meta.title){
        articles.push({
          slug,
          title:meta.title||slug,
          date:meta.date||"",
          category:meta.category||"Analyse",
          tags:meta.tags||[],
          cover:meta.cover||null,
          excerpt:meta.excerpt||"",
        });
      }
    }
    return cacheSet(k,articles,5*60*1000); // Cache 5min
  }catch(e){
    console.warn("[ARTICLES]",e.message);
    return[];
  }
}

// Lire un article complet
async function getArticle(slug){
  // Sécurité : pas de path traversal
  const safe_slug=slug.replace(/[^a-zA-Z0-9\-_]/g,"");
  const file=path.join(ARTICLES_DIR,safe_slug+".md");
  if(!fs.existsSync(file))return null;
  const content=await fsP.readFile(file,"utf8");
  const{meta,body}=parseFrontmatter(content);
  return{
    slug:safe_slug,
    title:meta.title||safe_slug,
    date:meta.date||"",
    category:meta.category||"Analyse",
    tags:meta.tags||[],
    cover:meta.cover||null,
    excerpt:meta.excerpt||"",
    html:mdToHtml(body),
    readTime:Math.max(1,Math.round(body.split(/\s+/).length/200)), // ~200 mots/min
  };
}

// Servir les images des articles
app.use("/articles/images",express.static(path.join(ARTICLES_DIR,"images")));

/* ── NEWSLETTER — stockage local /data/newsletter.json ── */
const NL_FILE=path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH||__dirname,"newsletter.json");

function loadEmails(){
  try{
    if(!fs.existsSync(NL_FILE))return[];
    return JSON.parse(fs.readFileSync(NL_FILE,"utf8"));
  }catch{return[];}
}
function saveEmails(list){
  try{fs.writeFileSync(NL_FILE,JSON.stringify(list,null,2),"utf8");}catch{}
}

// POST /api/newsletter — enregistrer un email
app.post("/api/newsletter",async(req,res)=>{
  const email=(req.body?.email||"").trim().toLowerCase();
  if(!email||!email.includes("@")||!email.includes("."))
    return res.status(400).json({error:"Email invalide"});
  const list=loadEmails();
  if(list.find(e=>e.email===email))
    return res.json({ok:true,message:"Déjà inscrit"});
  list.push({email,date:new Date().toISOString(),source:req.body?.source||"popup"});
  saveEmails(list);
  console.log(`[NL] Nouvel inscrit : ${email} (total: ${list.length})`);
  res.json({ok:true,message:"Inscrit",total:list.length});
});

// GET /api/newsletter — liste des emails (usage interne)
app.get("/api/newsletter",async(req,res)=>{
  const list=loadEmails();
  res.json({ok:true,count:list.length,emails:list});
});



// Route : liste des articles
app.get("/api/articles",async(req,res)=>{
  const articles=await getArticlesList();
  res.json({ok:true,count:articles.length,articles});
});

// Route : article individuel
app.get("/api/articles/:slug",async(req,res)=>{
  const article=await getArticle(req.params.slug);
  if(!article)return res.status(404).json({error:"Article non trouvé"});
  res.json({ok:true,article});
});

// Invalider le cache articles (appelé après un redéploiement)
app.post("/api/articles/refresh",(_,res)=>{
  CACHE.delete("articles_list");
  res.json({ok:true,message:"Cache articles vidé"});
});

/* ═══════════════════════════════════════════════════════
   NEWSLETTER — Stockage emails dans /data/newsletter.json
   GET  /api/newsletter       → liste des inscrits (usage interne)
   POST /api/newsletter       → inscription
   DELETE /api/newsletter/:email → désinscription
═══════════════════════════════════════════════════════ */
const DATA_DIR  = process.env.RAILWAY_VOLUME_MOUNT_PATH||"/data";
const NL_FILE   = path.join(DATA_DIR,"newsletter.json");

function loadEmails(){
  try{
    if(!fs.existsSync(DATA_DIR))fs.mkdirSync(DATA_DIR,{recursive:true});
    if(!fs.existsSync(NL_FILE))return[];
    return JSON.parse(fs.readFileSync(NL_FILE,"utf8"));
  }catch{return[];}
}
function saveEmails(list){
  try{
    if(!fs.existsSync(DATA_DIR))fs.mkdirSync(DATA_DIR,{recursive:true});
    fs.writeFileSync(NL_FILE,JSON.stringify(list,null,2),"utf8");
  }catch(e){console.error("[NL] Save error:",e.message);}
}

// Inscription
app.post("/api/newsletter",async(req,res)=>{
  const email=String(req.body?.email||"").trim().toLowerCase();
  if(!email||!email.includes("@")||!email.includes("."))
    return res.status(400).json({ok:false,error:"Email invalide"});

  const list=loadEmails();
  const exists=list.find(e=>e.email===email);
  if(exists)return res.json({ok:true,message:"Déjà inscrit",already:true});

  list.push({
    email,
    date:new Date().toISOString(),
    source:"popup"
  });
  saveEmails(list);
  console.log(`[NL] Nouvel inscrit: ${email} (total: ${list.length})`);
  res.json({ok:true,message:"Inscription confirmée",total:list.length});
});

// Liste inscrits (protégée par clé admin)
app.get("/api/newsletter",async(req,res)=>{
  const key=req.query.key||"";
  const adminKey=process.env.ADMIN_KEY||"hugomacaire2026";
  if(key!==adminKey)return res.status(401).json({error:"Non autorisé"});
  const list=loadEmails();
  res.json({ok:true,count:list.length,emails:list});
});

// Export CSV des inscrits
app.get("/api/newsletter/export",async(req,res)=>{
  const key=req.query.key||"";
  const adminKey=process.env.ADMIN_KEY||"hugomacaire2026";
  if(key!==adminKey)return res.status(401).json({error:"Non autorisé"});
  const list=loadEmails();
  const csv=["email,date,source",...list.map(e=>`${e.email},${e.date},${e.source||""}`)].join("\n");
  res.setHeader("Content-Type","text/csv");
  res.setHeader("Content-Disposition",`attachment;filename="newsletter-${new Date().toISOString().slice(0,10)}.csv"`);
  res.send(csv);
});

// Désinscription
app.delete("/api/newsletter/:email",async(req,res)=>{
  const email=decodeURIComponent(req.params.email).toLowerCase();
  const list=loadEmails().filter(e=>e.email!==email);
  saveEmails(list);
  res.json({ok:true,message:"Désinscrit"});
});


  const q=String(req.body?.question||"").trim().slice(0,300);
  const dash=req.body?.dashboard||null;
  if(!q)return res.status(400).json({error:"vide"});
  try{res.json({text:await callClaude(q,dash?.data,260)});}
  catch(e){res.json({text:`[Local]\n${dash?.data?buildSummary(dash.data,calcRisk(dash.data)):"IA indisponible."}`,error:e.message});}
});

app.post("/api/ai/summary",async(req,res)=>{
  const dash=req.body?.dashboard||null;
  if(!dash?.data)return res.json({text:"Indisponible."});
  try{res.json({text:await callClaude(
    "Briefing 5 points chiffrés : 1) Régime Risk-ON/OFF + signal dominant 2) Taux US et crédit HY/IG 3) Actifs réels (or, Cu/Au, pétrole) 4) Macro (CPI, emploi, NFCI, WEI) 5) Signal alerte ou opportunité notable.",
    dash.data,420)});}
  catch(e){res.json({text:buildSummary(dash.data,calcRisk(dash.data))});}
});

app.post("/api/ai/risk",async(req,res)=>{
  const dash=req.body?.dashboard||null;
  if(!dash?.data)return res.status(400).json({error:"no data"});
  const risk=calcRisk(dash.data);
  try{
    const text=await callClaude(
      `Risk-ON/OFF score ${risk?.score}/100 (${risk?.regime}). Signaux: ${JSON.stringify(risk?.details)}. Top 3 signaux + implications pour or, dollar, actions, crédit.`,
      dash.data,300);
    res.json({text,score:risk?.score,regime:risk?.regime,details:risk?.details});
  }catch(e){res.status(500).json({error:e.message});}
});

app.get("/health",(_,res)=>res.json({
  ok:true,ts:new Date().toISOString(),cache:CACHE.size,
  crumb:_crumb?`${_crumb.slice(0,6)}... (${Math.round((Date.now()-_crumbAge)/60000)}min)`:"null",
  telegram:{
    configured:!!(process.env.TELEGRAM_BOT_TOKEN&&process.env.TELEGRAM_CHAT_ID),
    nextSend:_nextTelegramSend?new Date(_nextTelegramSend).toISOString():"not scheduled",
    intervalDays:TELEGRAM_INTERVAL_DAYS
  }
}));

/* ═══════════════════════════════════════════════════════
   TELEGRAM BRIEFING
   Variables d'environnement Railway à configurer :
     TELEGRAM_BOT_TOKEN = token donné par @BotFather
     TELEGRAM_CHAT_ID   = ID du canal ou de ton compte
     TELEGRAM_INTERVAL_DAYS = 2 ou 3 (défaut: 2)

   Comment obtenir ces valeurs :
   1. Parle à @BotFather sur Telegram → /newbot → copie le token
   2. Ajoute le bot à ton canal et donne-lui le droit d'écrire
   3. Récupère le chat_id : envoie un message dans le canal,
      puis visite https://api.telegram.org/bot<TOKEN>/getUpdates
      → cherche "chat":{"id": -100XXXXXXXXX}
═══════════════════════════════════════════════════════ */
const TG_TOKEN =process.env.TELEGRAM_BOT_TOKEN||"";
const TG_CHAT  =process.env.TELEGRAM_CHAT_ID||"";
const TELEGRAM_INTERVAL_DAYS=parseInt(process.env.TELEGRAM_INTERVAL_DAYS||"2",10);

/* Formater le briefing en Markdown Telegram */
function buildTelegramMessage(data,risk){
  const d=data;
  const f=(v,dec=2)=>v==null?"N/D":(+v).toFixed(dec);
  const pct=(v)=>v==null?"N/D":f(v)+'%';
  const usd=(v,d=0)=>v==null?"N/D":'$'+Math.round(v).toLocaleString('en-US');
  const now=new Date();
  const dateStr=now.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

  const vix=d.vix?.value;
  const sp=d.yields?.spread2s10s;
  const hy=d.credit?.hy,ig=d.credit?.ig;
  const gold=d.commodities?.gold?.value;
  const copper=d.commodities?.copper?.value;
  const cuau=d.derived?.copperGoldRatio;
  const wti=d.commodities?.oil?.value;
  const btc=d.crypto?.btcusd?.value;
  const cpi=d.inflation?.cpiYoY;
  const nfci=d.research?.nfci?.v;
  const wei=d.research?.wei?.v;
  const conf=d.research?.conf?.v;
  const jolts=d.research?.jolts?.v;
  const dxy=d.dxyProxy?.value;
  const fg=d.sentiment?.value;
  const unr=d.labor?.unemploymentRate;

  // En-tête
  let msg=`◆ *BRIEFING MACRO* — ${dateStr}\n`;
  msg+=`━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Régime
  msg+=`${risk?.emoji} *RÉGIME : ${risk?.regime}*\n`;
  msg+=`Score composite : *${risk?.score}/100*\n\n`;

  // 1. Conditions de marché
  msg+=`📊 *CONDITIONS DE MARCHÉ*\n`;
  msg+=`• VIX : ${f(vix)} ${vix>=30?'🔴 stress élevé':vix>=20?'🟡 modéré':'🟢 calme'}\n`;
  msg+=`• DXY : ${f(dxy,2)} ${dxy<100?'🟢 dollar faible':dxy>104?'🔴 dollar fort':'⚪ neutre'}\n`;
  msg+=`• Fear & Greed : ${fg!=null?Math.round(fg)+'/100 — '+(d.sentiment?.label||''):'N/D'}\n`;
  msg+=`• NFCI : ${f(nfci,2)} ${nfci>0.5?'🔴 conditions tendues':nfci<-0.5?'🟢 conditions souples':'⚪ neutre'}\n\n`;

  // 2. Taux et courbe
  msg+=`📈 *TAUX US & CRÉDIT*\n`;
  msg+=`• Courbe 2s10s : ${sp!=null?f(sp,0)+' pb':' N/D'} ${sp>=0?'✅ normale':'🔴 INVERSÉE'}\n`;
  msg+=`• US 2A : ${pct(d.yields?.us2y)} | US 10A : ${pct(d.yields?.us10y)}\n`;
  msg+=`• HY Spread : ${pct(hy)} ${hy>5.5?'🔴 tension crédit':hy>4?'🟡 surveiller':'🟢 normal'}\n`;
  msg+=`• IG Spread : ${pct(ig)} | Ratio HY/IG : ${hy&&ig?f(hy/ig,2)+'x':'N/D'}\n`;
  msg+=`• Fed Funds : ${pct(d.fed?.upperBound)}\n\n`;

  // 3. Actifs réels
  msg+=`🪙 *ACTIFS RÉELS*\n`;
  msg+=`• Or : ${gold?usd(gold):'N/D'}/oz\n`;
  msg+=`• Argent : ${d.commodities?.silver?.value?'$'+f(d.commodities.silver.value,2):'N/D'}/oz`;
  if(gold&&d.commodities?.silver?.value)msg+=` | G/S : ${f(gold/d.commodities.silver.value,1)}x`;
  msg+=`\n`;
  msg+=`• Cuivre : ${copper?'$'+f(copper,2):'N/D'}/lb${d.derived?.copperStale?' \\*estimé':''}\n`;
  msg+=`• Cu/Au ratio : *${cuau?f(cuau,3):'N/D'}* ${cuau>0.55?'🟢 risk-on':cuau>0.4?'🟡 neutre':'🔴 risk-off'}\n`;
  msg+=`• WTI : ${wti?'$'+f(wti,2):'N/D'}/bbl\n`;
  msg+=`• BTC : ${btc?usd(btc):'N/D'}\n\n`;

  // 4. Macro
  msg+=`📡 *MACRO ÉCONOMIQUE*\n`;
  msg+=`• CPI YoY : ${pct(cpi)} | Chômage : ${pct(unr,1)}\n`;
  msg+=`• WEI (NY Fed) : ${wei!=null?f(wei,2):' N/D'} ${wei>1?'🟢 solide':wei>-1?'🟡 modéré':'🔴 faible'}\n`;
  msg+=`• Conf. Michigan : ${conf!=null?f(conf,1):'N/D'}/100 ${conf>85?'🟢':conf<70?'🔴':''}\n`;
  if(jolts!=null)msg+=`• JOLTS emploi : ${Math.round(jolts).toLocaleString('fr-FR')}k offres\n`;
  msg+=`\n`;

  // 5. Secteurs top/flop
  const sectors=(d.sectors||[]).filter(s=>s.value!=null);
  if(sectors.length>0){
    const top=sectors.slice(0,3);
    const flop=[...sectors].reverse().slice(0,2);
    msg+=`📊 *SECTEURS S&P 500*\n`;
    msg+=`Top : ${top.map(s=>`${s.name} ${s.value>=0?'+':''}${f(s.value)}%`).join(' • ')}\n`;
    msg+=`Flop : ${flop.map(s=>`${s.name} ${f(s.value)}%`).join(' • ')}\n\n`;
  }

  // 6. Signaux risk détaillés
  if(risk?.details?.length){
    msg+=`⚡ *SIGNAUX RISK-ON/OFF*\n`;
    risk.details.forEach(det=>{
      const p=det.split('→');
      const signal=(p[1]||'').trim();
      const icon=signal.includes('Risk-ON')?'🟢':signal.includes('Risk-OFF')?'🔴':'⚪';
      msg+=`${icon} ${(p[0]||det).trim()}\n`;
    });
    msg+='\n';
  }

  // Footer
  msg+=`━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg+=`_Terminal Macro — données informatives uniquement_`;

  return msg;
}

/* Envoyer sur Telegram */
async function sendTelegram(text,chatId){
  const chat=chatId||TG_CHAT;
  if(!TG_TOKEN||!chat){
    throw new Error("TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID manquant dans les variables Railway");
  }
  // Telegram limite à 4096 caractères par message
  const chunks=[];
  let remaining=text;
  while(remaining.length>0){
    chunks.push(remaining.slice(0,4096));
    remaining=remaining.slice(4096);
  }
  for(const chunk of chunks){
    const res=await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        chat_id:chat,
        text:chunk,
        parse_mode:"Markdown",
        disable_web_page_preview:true
      })
    });
    const result=await res.json();
    if(!result.ok)throw new Error(`Telegram API: ${result.description||result.error_code}`);
  }
  console.log(`[TG] Message envoyé → chat ${chat} (${text.length} chars)`);
  return{ok:true,chars:text.length,chunks:chunks.length};
}

/* Route manuelle : POST /api/telegram/send */
app.post("/api/telegram/send",async(req,res)=>{
  const dash=req.body?.dashboard||null;
  const chatId=req.body?.chatId||TG_CHAT; // optionnel : override le chat
  if(!dash?.data)return res.status(400).json({error:"Pas de données dashboard"});
  if(!TG_TOKEN)return res.status(400).json({
    error:"TELEGRAM_BOT_TOKEN non configuré",
    help:"Ajouter TELEGRAM_BOT_TOKEN et TELEGRAM_CHAT_ID dans les variables Railway"
  });
  try{
    const risk=calcRisk(dash.data);
    // Générer l'analyse IA complète pour le briefing Telegram
    let aiText="";
    try{
      aiText=await callClaude(
        "Briefing Telegram 5 points concis et chiffrés : 1) Régime Risk-ON/OFF + raison dominante 2) Taux US et crédit 3) Actifs réels (or, Cu/Au, pétrole) 4) Macro (CPI, chômage, NFCI, WEI) 5) Signal d'alerte ou opportunité. Sois direct, dense, sans intro ni conclusion génériques.",
        dash.data,380);
    }catch(e){
      aiText=buildSummary(dash.data,risk);
    }
    // Construire le message Telegram structuré
    const structuredMsg=buildTelegramMessage(dash.data,risk);
    const fullMsg=structuredMsg+"\n\n🤖 *Analyse IA*\n"+aiText;
    const result=await sendTelegram(fullMsg,chatId);
    res.json({ok:true,...result,preview:fullMsg.slice(0,200)+"..."});
  }catch(e){
    console.error("[TG] Send error:",e.message);
    res.status(500).json({error:e.message,help:"Vérifier TELEGRAM_BOT_TOKEN et TELEGRAM_CHAT_ID"});
  }
});

/* Route test : GET /api/telegram/test */
app.get("/api/telegram/test",async(req,res)=>{
  if(!TG_TOKEN||!TG_CHAT){
    return res.status(400).json({
      configured:false,
      error:"Variables manquantes",
      needed:["TELEGRAM_BOT_TOKEN","TELEGRAM_CHAT_ID"],
      help:[
        "1. Parle à @BotFather sur Telegram → /newbot → copie le token",
        "2. Ajoute le bot à ton canal (admin)",
        "3. Envoie un message dans le canal, puis visite :",
        "   https://api.telegram.org/bot<TON_TOKEN>/getUpdates",
        "   → cherche 'chat':{'id': -100XXXXXXXXX}",
        "4. Ajoute les variables dans Railway : Settings → Variables"
      ]
    });
  }
  try{
    await sendTelegram("◆ *Terminal Macro* — Test de connexion ✅\nBriefings automatiques configurés.",null);
    res.json({ok:true,token:TG_TOKEN.slice(0,8)+"...",chat:TG_CHAT,intervalDays:TELEGRAM_INTERVAL_DAYS});
  }catch(e){
    res.status(500).json({ok:false,error:e.message});
  }
});

/* ═══════════════════════════════════════════════════════
   SCHEDULER AUTOMATIQUE — toutes les N jours
   Envoie le briefing à l'heure configurée (défaut : 8h00)
   Variable : TELEGRAM_SEND_HOUR (défaut: 8)
═══════════════════════════════════════════════════════ */
let _nextTelegramSend=0;
const SEND_HOUR=parseInt(process.env.TELEGRAM_SEND_HOUR||"8",10);

function scheduleNextSend(){
  const now=new Date();
  const next=new Date();
  next.setDate(next.getDate()+TELEGRAM_INTERVAL_DAYS);
  next.setHours(SEND_HOUR,0,0,0);
  _nextTelegramSend=next.getTime();
  const ms=_nextTelegramSend-now.getTime();
  console.log(`[TG] Prochain envoi : ${next.toISOString()} (dans ${Math.round(ms/3600000)}h)`);
  return ms;
}

async function autoSendBriefing(){
  if(!TG_TOKEN||!TG_CHAT){
    console.log("[TG] Scheduler désactivé (variables Telegram non configurées)");
    return;
  }
  console.log("[TG] Envoi automatique du briefing...");
  try{
    // Récupérer les données fraîches
    const dashRes=await fetch(`http://localhost:${PORT}/api/dashboard`);
    const dashData=await dashRes.json();
    const risk=calcRisk(dashData.data);
    let aiText="";
    try{
      aiText=await callClaude(
        "Briefing Telegram 5 points concis et chiffrés : 1) Régime Risk-ON/OFF + raison dominante 2) Taux US et crédit 3) Actifs réels (or, Cu/Au, pétrole) 4) Macro (CPI, chômage, NFCI, WEI) 5) Signal alerte ou opportunité.",
        dashData.data,380);
    }catch(e){aiText=buildSummary(dashData.data,risk);}
    const msg=buildTelegramMessage(dashData.data,risk)+"\n\n🤖 *Analyse IA*\n"+aiText;
    await sendTelegram(msg,null);
    console.log("[TG] ✅ Briefing automatique envoyé");
  }catch(e){
    console.error("[TG] Erreur envoi auto:",e.message);
  }
  // Planifier le prochain envoi
  const nextMs=scheduleNextSend();
  setTimeout(autoSendBriefing,nextMs);
}

/* ═══════════════════════════════════════════════════════════════
   MODULE REDDIT SENTIMENT
   ─────────────────────────────────────────────────────────────
   Scrape les subreddits financiers toutes les 4h (configurable)
   Analyse le sentiment avec Claude Haiku
   Stocke le résultat en cache, exposé via /api/sentiment

   Subreddits ciblés :
     MACRO  : r/investing, r/economics, r/MacroEconomics
     RETAIL : r/wallstreetbets, r/stocks
     CONSOM : r/personalfinance
     CRYPTO : r/CryptoCurrency, r/Bitcoin

   Variables Railway (optionnelles) :
     REDDIT_CLIENT_ID     → app ID Reddit (API officielle)
     REDDIT_CLIENT_SECRET → secret Reddit
     REDDIT_USERNAME      → ton compte Reddit
     REDDIT_PASSWORD      → mot de passe Reddit
     SENTIMENT_INTERVAL_H → fréquence en heures (défaut: 4)

   Sans clés Reddit → mode "public JSON" (pas d'auth, rate-limité)
   Avec clés Reddit → OAuth2, 60 req/min, bien plus fiable
═══════════════════════════════════════════════════════════════ */

const SENTIMENT_INTERVAL_H = parseInt(process.env.SENTIMENT_INTERVAL_H||"4",10);
const REDDIT_CLIENT_ID     = process.env.REDDIT_CLIENT_ID||"";
const REDDIT_CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET||"";
const REDDIT_USER          = process.env.REDDIT_USERNAME||"";
const REDDIT_PASS          = process.env.REDDIT_PASSWORD||"";

// Cache sentiment (4h par défaut)
let _sentimentCache = null;
let _sentimentTs    = 0;
let _redditToken    = null;
let _redditTokenTs  = 0;

// Subreddits par catégorie
const SUBREDDITS = {
  macro:  ["investing","economics","MacroEconomics"],
  retail: ["wallstreetbets","stocks"],
  conso:  ["personalfinance"],
  crypto: ["CryptoCurrency","Bitcoin"],
};

// Tous en liste plate
const ALL_SUBS = Object.values(SUBREDDITS).flat();

/* ── Auth Reddit OAuth2 ─────────────────────────────────── */
async function getRedditToken(){
  if(!REDDIT_CLIENT_ID||!REDDIT_CLIENT_SECRET)return null;
  // Token valide 1h, on le réutilise
  if(_redditToken&&Date.now()-_redditTokenTs<55*60*1000)return _redditToken;
  try{
    const creds=Buffer.from(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`).toString("base64");
    const body=new URLSearchParams({
      grant_type:"password",
      username:REDDIT_USER,
      password:REDDIT_PASS
    });
    const r=await fetch("https://www.reddit.com/api/v1/access_token",{
      method:"POST",
      headers:{
        "Authorization":`Basic ${creds}`,
        "Content-Type":"application/x-www-form-urlencoded",
        "User-Agent":"MacroTerminal/5.0 (by /u/"+REDDIT_USER+")"
      },
      body:body.toString()
    });
    const d=await r.json();
    if(d.access_token){
      _redditToken=d.access_token;
      _redditTokenTs=Date.now();
      console.log("[REDDIT] Token OAuth2 obtenu");
      return _redditToken;
    }
  }catch(e){console.warn("[REDDIT] Auth failed:",e.message);}
  return null;
}

/* ── Fetch posts d'un subreddit ─────────────────────────── */
async function fetchSubreddit(sub, limit=25){
  const token=await getRedditToken();
  const baseUrl=token
    ? `https://oauth.reddit.com/r/${sub}/hot`
    : `https://www.reddit.com/r/${sub}/hot.json`;
  const headers={
    "User-Agent":"MacroTerminal/5.0",
    ...(token?{"Authorization":`Bearer ${token}`}:{})
  };
  try{
    const ac=new AbortController();
    const t=setTimeout(()=>ac.abort(),12000);
    const r=await fetch(`${baseUrl}.json?limit=${limit}&t=day`,{headers,signal:ac.signal});
    clearTimeout(t);
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const d=await r.json();
    const posts=d?.data?.children||[];
    // Extraire titre + score + nb comments + top flair
    return posts
      .filter(p=>p.data&&!p.data.stickied)
      .map(p=>({
        title:   p.data.title?.slice(0,200)||"",
        score:   p.data.score||0,
        comments:p.data.num_comments||0,
        flair:   p.data.link_flair_text||"",
        sub:     sub,
        url:     p.data.permalink||""
      }))
      .filter(p=>p.score>10); // Filtrer le bruit (posts sans engagement)
  }catch(e){
    console.warn(`[REDDIT] r/${sub} failed:`,e.message.slice(0,60));
    return [];
  }
}

/* ── Analyse sentiment par Claude Haiku ─────────────────── */
async function analyzeWithClaude(posts, category){
  if(!posts.length)return null;
  if(!CLAUDE_KEY)return null;

  // Préparer le texte — top 20 posts par engagement
  const sorted=posts
    .sort((a,b)=>(b.score+b.comments*2)-(a.score+a.comments*2))
    .slice(0,20);

  const textBlock=sorted.map((p,i)=>
    `[${i+1}] r/${p.sub} (${p.score} pts, ${p.comments} cmts): "${p.title}"`
  ).join("\n");

  const prompt=`Tu es un analyste de sentiment de marché financier.
Voici les ${sorted.length} posts Reddit les plus engagés du moment sur la finance (catégorie: ${category}) :

${textBlock}

Analyse le sentiment global et réponds UNIQUEMENT en JSON valide, sans markdown :
{
  "score": <nombre entre -100 (panique totale) et +100 (euphorie totale)>,
  "label": <"Très baissier"|"Baissier"|"Légèrement baissier"|"Neutre"|"Légèrement haussier"|"Haussier"|"Très haussier">,
  "themes": [<3 thèmes dominants en français, max 4 mots chacun>],
  "top_concern": <la principale inquiétude ou opportunité détectée, 1 phrase max>,
  "conviction": <"faible"|"modérée"|"forte">,
  "posts_analyzed": ${sorted.length}
}`;

  try{
    const ac=new AbortController();
    const t=setTimeout(()=>ac.abort(),25000);
    const r=await fetch("https://api.anthropic.com/v1/messages",{
      signal:ac.signal,
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "x-api-key":CLAUDE_KEY,
        "anthropic-version":"2023-06-01"
      },
      body:JSON.stringify({
        model:"claude-haiku-4-5-20251001",
        max_tokens:300,
        messages:[{role:"user",content:prompt}]
      })
    });
    clearTimeout(t);
    const data=await r.json();
    if(!r.ok)throw new Error(data?.error?.message||`Claude ${r.status}`);
    const text=data.content?.[0]?.text||"{}";
    // Nettoyer le JSON (enlever éventuels backticks)
    const clean=text.replace(/```json?|```/g,"").trim();
    return JSON.parse(clean);
  }catch(e){
    console.warn(`[REDDIT] Claude analysis failed (${category}):`,e.message.slice(0,80));
    return null;
  }
}

/* ── Fonction principale : collecte + analyse ───────────── */
async function runSentimentAnalysis(){
  console.log("[REDDIT] Démarrage analyse sentiment...");
  const start=Date.now();

  // 1. Fetch tous les subreddits en parallèle (par catégorie)
  const results={};
  const allPosts=[];

  for(const[cat,subs] of Object.entries(SUBREDDITS)){
    const catPosts=[];
    // Batches de 2 pour éviter le rate limiting
    for(let i=0;i<subs.length;i+=2){
      const batch=subs.slice(i,i+2);
      const fetched=await Promise.all(batch.map(s=>fetchSubreddit(s,20)));
      catPosts.push(...fetched.flat());
      if(i+2<subs.length)await new Promise(r=>setTimeout(r,1500));
    }
    results[cat]=catPosts;
    allPosts.push(...catPosts);
    console.log(`[REDDIT] r/${cat}: ${catPosts.length} posts collectés`);
  }

  // 2. Analyse Claude Haiku par catégorie + global
  // Séquentiel pour éviter de surcharger l'API
  const analyses={};

  // Global (tous les posts ensemble)
  const globalAnalysis=await analyzeWithClaude(allPosts,"finance globale");
  if(globalAnalysis)analyses.global=globalAnalysis;
  await new Promise(r=>setTimeout(r,800));

  // Par catégorie si assez de posts
  for(const[cat,posts] of Object.entries(results)){
    if(posts.length>=5){
      const a=await analyzeWithClaude(posts,cat);
      if(a)analyses[cat]=a;
      await new Promise(r=>setTimeout(r,600));
    }
  }

  // 3. Score composite pondéré
  // macro x0.35, retail x0.25, conso x0.20, crypto x0.20
  const weights={macro:0.35,retail:0.25,conso:0.20,crypto:0.20};
  let weightedScore=null;
  let totalWeight=0;
  for(const[cat,w] of Object.entries(weights)){
    if(analyses[cat]?.score!=null){
      weightedScore=(weightedScore||0)+analyses[cat].score*w;
      totalWeight+=w;
    }
  }
  if(totalWeight>0&&weightedScore!=null)weightedScore=Math.round(weightedScore/totalWeight);

  // 4. Top posts globaux (les plus engagés)
  const topPosts=allPosts
    .sort((a,b)=>(b.score+b.comments*3)-(a.score+a.comments*3))
    .slice(0,5)
    .map(p=>({title:p.title,sub:p.sub,score:p.score,comments:p.comments}));

  const sentiment={
    updatedAt:new Date().toISOString(),
    fetchDurationMs:Date.now()-start,
    postsCollected:allPosts.length,
    compositeScore:weightedScore,          // -100 à +100
    compositeLabel:scoreToLabel(weightedScore),
    byCategory:analyses,
    topPosts,
    nextUpdate:new Date(Date.now()+SENTIMENT_INTERVAL_H*3600*1000).toISOString()
  };

  _sentimentCache=sentiment;
  _sentimentTs=Date.now();
  console.log(`[REDDIT] ✅ Analyse terminée en ${Math.round((Date.now()-start)/1000)}s`);
  console.log(`[REDDIT] Score composite: ${weightedScore} — ${sentiment.compositeLabel}`);
  console.log(`[REDDIT] Posts analysés: ${allPosts.length} sur ${ALL_SUBS.length} subreddits`);
  return sentiment;
}

function scoreToLabel(score){
  if(score==null)return "N/D";
  if(score<=-60)return "Panique";
  if(score<=-30)return "Baissier";
  if(score<=-10)return "Légèrement baissier";
  if(score<=10) return "Neutre";
  if(score<=30) return "Légèrement haussier";
  if(score<=60) return "Haussier";
  return "Euphorique";
}

/* ── Scheduler toutes les N heures ─────────────────────── */
async function scheduleSentiment(){
  try{await runSentimentAnalysis();}
  catch(e){console.error("[REDDIT] Erreur scheduler:",e.message);}
  setTimeout(scheduleSentiment, SENTIMENT_INTERVAL_H*3600*1000);
}

/* ── Route API ──────────────────────────────────────────── */
app.get("/api/sentiment",async(req,res)=>{
  // Forcer refresh si demandé (?refresh=1) ou cache expiré
  const expired=Date.now()-_sentimentTs>SENTIMENT_INTERVAL_H*3600*1000;
  if((req.query.refresh==="1"||expired)&&!_sentimentCache){
    // Lancer en background, retourner placeholder
    scheduleSentiment().catch(()=>{});
    return res.json({
      status:"loading",
      message:`Première analyse en cours... (${SENTIMENT_INTERVAL_H}h d'intervalle)`,
      compositeScore:null,
      compositeLabel:"Calcul en cours",
      updatedAt:null
    });
  }
  if(!_sentimentCache){
    return res.json({status:"not_ready",compositeScore:null,compositeLabel:"N/D"});
  }
  res.json({status:"ok",..._sentimentCache});
});

// Route pour forcer un refresh manuel
app.post("/api/sentiment/refresh",async(req,res)=>{
  res.json({ok:true,message:"Analyse Reddit lancée en arrière-plan..."});
  try{await runSentimentAnalysis();}catch(e){console.error("[REDDIT]",e.message);}
});

// Route journal
app.get("/journal",(_,res)=>res.sendFile(path.join(__dirname,"public","journal.html")));
app.get("/journal/*",(_,res)=>res.sendFile(path.join(__dirname,"public","journal.html")));

app.get("*",(_,res)=>res.sendFile(path.join(__dirname,"public","index.html")));

app.listen(PORT,async()=>{
  console.log(`◆ TERMINAL MACRO v5.0 — port ${PORT}`);
  console.log(`  Or: FRED GOLDAMGBD228NLBM [2000,5000] → Coinbase XAU-USD → Yahoo GC=F`);
  console.log(`  Secteurs: Yahoo v8 crumb, batches 3×800ms`);
  console.log(`  Auto loans: DRAUTONSA → DTCTHFNM → fallback 1.74%`);
  console.log("  Warming up Yahoo crumb...");
  await safe(()=>refreshCrumb());
  console.log(`  Crumb: ${_crumb?_crumb.slice(0,8)+"...":"FAILED"}`);

  // Démarrer le scheduler Telegram
  if(TG_TOKEN&&TG_CHAT){
    console.log(`[TG] ✅ Bot configuré — envoi toutes les ${TELEGRAM_INTERVAL_DAYS}j à ${SEND_HOUR}h00`);
    const firstMs=scheduleNextSend();
    setTimeout(autoSendBriefing,firstMs);
  }else{
    console.log("[TG] ⚠️  Telegram non configuré — ajouter TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID dans Railway");
  }

  // Démarrer le scheduler Reddit Sentiment (délai 30s pour laisser le serveur se stabiliser)
  console.log(`[REDDIT] 🔄 Scheduler sentiment démarré — intervalle ${SENTIMENT_INTERVAL_H}h`);
  console.log(`[REDDIT] Subreddits: ${ALL_SUBS.join(", ")}`);
  if(REDDIT_CLIENT_ID){
    console.log(`[REDDIT] Mode OAuth2 (clés configurées)`);
  }else{
    console.log(`[REDDIT] Mode public JSON (sans clés — ajouter REDDIT_CLIENT_ID pour plus de fiabilité)`);
  }
  setTimeout(scheduleSentiment, 30*1000); // Premier run 30s après démarrage
});

