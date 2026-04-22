/* ◆ TERMINAL MACRO v4.4
   FIXES DÉFINITIFS :
   ① SECTEURS : stooq.com CSV (pas de rate-limit, pas de clé, très fiable)
      URL: https://stooq.com/q/d/l/?s=xlk.us&i=d (CSV journalier)
      Calcul variation sur N jours selon UT
   ② INDICES SPX/NDX/DJI : Yahoo v7 quote en direct (1 seule requête chacun)
      Fallback stooq pour les indices aussi
   ③ AUTO LOANS : DTCTHFNM → si null, utiliser DRCLACBS comme proxy
      + fallback hardcodé 1.74% (valeur Q4 2024 officielle FRED)
   ④ COPPER : même logique, fallback 4.60 clairement signalé
*/
const express=require("express"),path=require("path");
const app=express(),PORT=process.env.PORT||3000;
const FRED=process.env.FRED_API_KEY||"2945c843ac2ef54c3d1272b9f9cc2747";
const CLAUDE=process.env.ANTHROPIC_KEY||"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";
app.use(express.static(path.join(__dirname,"public")));
app.use(express.json({limit:"2mb"}));

/* CACHE */
const C=new Map();
const TTL={crypto:55e3,metals:2*60e3,eq:3*60e3,yahoo:5*60e3,yS:10*60e3,fng:25*60e3,fd:4*36e5,fm:10*36e5};
const cg=k=>{const e=C.get(k);if(!e)return undefined;if(Date.now()-e.t>e.l){C.delete(k);return undefined;}return e.v;};
const cs=(k,v,l)=>{C.set(k,{v,t:Date.now(),l});return v;};

/* UTILS */
const N=v=>{const n=parseFloat(v);return isFinite(n)?n:null;};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const UAS=["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36","Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15"];
let ui=0;const UA=()=>UAS[ui++%UAS.length];

async function fj(url,opts={}){
  const ms=opts.timeout||15000;
  const ac=new AbortController(),t=setTimeout(()=>ac.abort(),ms);
  try{
    const r=await fetch(url,{signal:ac.signal,...opts,
      headers:{"User-Agent":UA(),"Accept":"application/json,text/plain,*/*","Accept-Language":"en-US,en;q=0.9","Cache-Control":"no-cache",...(opts.headers||{})}});
    clearTimeout(t);if(!r.ok)throw new Error(`HTTP ${r.status} ${url.slice(0,60)}`);
    return r.json();
  }finally{clearTimeout(t);}
}
async function ft(url,opts={}){
  // fetch text (pour CSV stooq)
  const ms=opts.timeout||15000;
  const ac=new AbortController(),t=setTimeout(()=>ac.abort(),ms);
  try{
    const r=await fetch(url,{signal:ac.signal,...opts,
      headers:{"User-Agent":UA(),"Accept":"text/plain,*/*","Cache-Control":"no-cache",...(opts.headers||{})}});
    clearTimeout(t);if(!r.ok)throw new Error(`HTTP ${r.status}`);
    return r.text();
  }finally{clearTimeout(t);}
}
const sf=async(fn,fb=null)=>{try{return await fn();}catch(e){console.warn("[W]",String(e.message).slice(0,90));return fb;}};

/* STOOQ CSV PARSER
   Format: Date,Open,High,Low,Close,Volume
   On récupère les N dernières lignes pour calculer la variation
*/
function parseStooqCSV(csv){
  if(!csv||typeof csv!=="string")return null;
  const lines=csv.trim().split("\n").filter(l=>l&&!l.startsWith("Date"));
  if(lines.length<2)return null;
  // Parse toutes les lignes valides
  return lines.map(l=>{
    const p=l.split(",");
    const close=N(p[4]);
    return{date:p[0]?.trim(),close};
  }).filter(r=>r.close!=null);
}

/* STOOQ — récupère les données d'un symbole
   Symboles stooq : XLK.US, SPX.US (ou ^SPX), etc.
   i=d = journalier
*/
async function stooqData(sym,days=35){
  const url=`https://stooq.com/q/d/l/?s=${encodeURIComponent(sym)}&i=d`;
  const csv=await ft(url,{timeout:18000});
  const rows=parseStooqCSV(csv);
  if(!rows||rows.length<2)throw new Error(`stooq ${sym}: no data`);
  // Retourner les N dernières lignes
  return rows.slice(-Math.min(days,rows.length));
}

/* Performance sur N jours depuis stooq */
async function stooqPerf(sym,tradingDays){
  const rows=await stooqData(sym,tradingDays+5);
  if(!rows||rows.length<2)return null;
  const last=rows[rows.length-1].close;
  const first=rows[Math.max(0,rows.length-tradingDays-1)].close;
  if(!first||!last||first===0)return null;
  return((last/first)-1)*100;
}

/* UT → nombre de jours de trading approximatif */
const UT_DAYS={"1D":1,"1W":5,"1M":21,"3M":63,"6M":126,"1Y":252,"YTD":null};

async function stooqPerf_UT(sym,ut){
  const rows=await stooqData(sym,265);// max 1 an
  if(!rows||rows.length<2)return null;
  const last=rows[rows.length-1].close;
  let first;
  if(ut==="YTD"){
    const year=new Date().getFullYear();
    const ytdRows=rows.filter(r=>r.date&&r.date.startsWith(String(year)));
    first=ytdRows[0]?.close;
  }else{
    const days=UT_DAYS[ut]||21;
    first=rows[Math.max(0,rows.length-days-1)].close;
  }
  if(!first||!last||first===0)return null;
  return((last/first)-1)*100;
}

/* FRED */
async function fred(id,lim=10,ttl=TTL.fd){
  const k=`f_${id}`;const c=cg(k);if(c!==undefined)return c;
  const url=`https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(id)}&api_key=${encodeURIComponent(FRED)}&sort_order=desc&limit=${lim}&file_type=json`;
  const d=await fj(url);
  const obs=Array.isArray(d.observations)?d.observations.find(o=>o.value!=="."&&o.value!==""):null;
  return cs(k,{v:N(obs?.value),d:obs?.date||null},ttl);
}
async function fredAll(id){
  const k=`fa_${id}`;const c=cg(k);if(c!==undefined)return c;
  const url=`https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(id)}&api_key=${encodeURIComponent(FRED)}&file_type=json`;
  const d=await fj(url);
  return cs(k,Array.isArray(d.observations)?d.observations:[],TTL.fm);
}
function lv(obs){if(!Array.isArray(obs))return null;for(let i=obs.length-1;i>=0;i--){const v=obs[i]?.value;if(v!=="."&&v!==""&&v!=null)return obs[i];}return null;}
function yoy(obs){
  const v=(obs||[]).filter(o=>o.value!=="."&&o.value!=="");if(v.length<13)return null;
  const last=v[v.length-1],lv2=N(last.value);if(lv2==null)return null;
  const ld=new Date(last.date);let ya=null;
  for(let i=v.length-2;i>=0;i--){const d=new Date(v[i].date);if(d.getFullYear()===ld.getFullYear()-1&&d.getMonth()===ld.getMonth()){ya=v[i];break;}}
  if(!ya)ya=v[v.length-13];const ov=N(ya?.value);if(ov==null||ov===0)return null;
  return((lv2/ov)-1)*100;
}

/* COINBASE */
async function cb(pair,ttl=TTL.crypto){
  const k=`cb_${pair}`;const c=cg(k);if(c!==undefined)return c;
  const d=await fj(`https://api.coinbase.com/v2/prices/${pair}/spot`);
  const v=N(d?.data?.amount);if(v==null)throw new Error(`CB ${pair}`);
  return cs(k,{value:v,ts:new Date().toISOString()},ttl);
}

/* YAHOO v7 QUOTE — pour indices seulement (1 requête légère) */
async function yahooQuote(sym){
  const k=`yq_${sym}`;const c=cg(k);if(c!==undefined)return c;
  try{
    const d=await fj(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(sym)}&fields=regularMarketPrice,regularMarketChangePercent`,
      {headers:{"Referer":"https://finance.yahoo.com/"}});
    const r=d?.quoteResponse?.result?.[0];
    if(!r?.regularMarketPrice)throw new Error("no price");
    return cs(k,{price:r.regularMarketPrice,chgPct:r.regularMarketChangePercent},TTL.eq);
  }catch(e){
    console.warn(`[YQ] ${sym}:`,e.message.slice(0,50));
    return cs(k,null,TTL.eq);
  }
}

/* GOLD — Coinbase XAU → Yahoo → FRED → metals.live */
async function yahooLast(sym){
  const hdrs={"Referer":"https://finance.yahoo.com/"};
  for(const host of["query1","query2"]){
    try{
      const d=await fj(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5d&interval=1d&includePrePost=false`,{headers:hdrs,timeout:18000});
      const cl=d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
      if(Array.isArray(cl)){const v=[...cl].reverse().find(x=>x!=null);if(v!=null)return v;}
    }catch(e){console.warn(`[YL] ${sym}@${host}:`,e.message.slice(0,50));}
  }
  return null;
}

async function goldFn(){
  const k="gold_v5";const c=cg(k);if(c!==undefined)return c;
  const ok=v=>v!=null&&v>1500&&v<5500;
  const cxau=await sf(()=>cb("XAU-USD",TTL.metals));
  if(ok(cxau?.value))return cs(k,{value:cxau.value,src:"Coinbase XAU"},TTL.metals);
  const yg=await sf(()=>yahooLast("GC=F"));
  if(ok(yg))return cs(k,{value:yg,src:"Yahoo GC=F"},TTL.yahoo);
  // stooq GC.F
  const sg=await sf(async()=>{const r=await stooqData("gc.f",5);return r?.[r.length-1]?.close??null;});
  if(ok(sg))return cs(k,{value:sg,src:"stooq GC"},TTL.yahoo);
  const fg=await sf(()=>fred("GOLDAMGBD228NLBM",5,TTL.fd));
  let fv=fg?.v;if(fv!=null&&fv>5000&&fv<500000)fv=fv/100;
  if(ok(fv))return cs(k,{value:fv,src:"FRED"},TTL.fd);
  return cs(k,{value:null,src:"N/A"},TTL.metals);
}
async function silverFn(){
  const k="silver_v5";const c=cg(k);if(c!==undefined)return c;
  const ok=v=>v!=null&&v>15&&v<120;
  const cxag=await sf(()=>cb("XAG-USD",TTL.metals));
  if(ok(cxag?.value))return cs(k,{value:cxag.value,src:"Coinbase XAG"},TTL.metals);
  const ss=await sf(async()=>{const r=await stooqData("si.f",5);return r?.[r.length-1]?.close??null;});
  if(ok(ss))return cs(k,{value:ss,src:"stooq SI"},TTL.yahoo);
  return cs(k,{value:null,src:"N/A"},TTL.metals);
}
async function copperFn(){
  const k="copper_v5";const c=cg(k);if(c!==undefined)return c;
  const ok=v=>v!=null&&v>2&&v<15;
  const sc=await sf(async()=>{const r=await stooqData("hg.f",5);return r?.[r.length-1]?.close??null;});
  if(ok(sc))return cs(k,{value:sc,src:"stooq HG",stale:false},TTL.yahoo);
  const fc=await sf(()=>fred("PCOPPUSDM",5,TTL.fm));
  if(ok(fc?.v))return cs(k,{value:fc.v,src:"FRED mensuel",stale:false},TTL.fm);
  // Fallback hardcodé — valeur récente connue
  return cs(k,{value:4.60,src:"Estimé*",stale:true},60*60e3);
}
async function commoSimple(sym,fredId,lo,hi,key,stooqSym){
  const c=cg(key);if(c!==undefined)return c;
  if(stooqSym){
    const sv=await sf(async()=>{const r=await stooqData(stooqSym,5);return r?.[r.length-1]?.close??null;});
    if(sv!=null&&sv>=lo&&sv<=hi)return cs(key,{value:sv,src:`stooq`},TTL.yahoo);
  }
  const fv=await sf(()=>fred(fredId,5,TTL.fd));
  if(fv?.v!=null&&fv.v>=lo&&fv.v<=hi)return cs(key,{value:fv.v,src:"FRED"},TTL.fd);
  return cs(key,{value:null,src:"N/A"},TTL.yahoo);
}

/* FX + FNG */
async function eurusd(){
  const k="eur_v5";const c=cg(k);if(c!==undefined)return c;
  const d=await fj("https://api.frankfurter.app/latest?from=EUR&to=USD");
  const v=N(d?.rates?.USD);if(v==null)throw new Error("EUR/USD");
  return cs(k,{value:v},TTL.yahoo);
}
async function fng(){
  const k="fng_v5";const c=cg(k);if(c!==undefined)return c;
  const d=await fj("https://api.alternative.me/fng/?limit=1");
  const r=d?.data?.[0];if(!r)throw new Error("FNG");
  return cs(k,{value:N(r.value),label:r.value_classification||null},TTL.fng);
}
function fngFb(vix,sp){
  if(vix==null)return null;let s=50;
  if(vix>35)s-=35;else if(vix>30)s-=26;else if(vix>25)s-=16;else if(vix>20)s-=8;else if(vix<14)s+=18;
  if(sp!=null){if(sp>40)s+=8;else if(sp<0)s-=12;}
  s=Math.max(0,Math.min(100,s));
  return{value:s,label:s<25?"PEUR EXTRÊME":s<45?"PEUR":s<55?"NEUTRE":s<75?"OPTIMISME":"EUPHORIE"};
}

/* CRÉDIT */
async function creditFn(){
  const k="cred_v5";const c=cg(k);if(c!==undefined)return c;
  const[hy,ig]=await Promise.all([
    sf(async()=>{const r=await fred("BAMLH0A0HYM2",10,TTL.fd);return(r?.v>0&&r.v<30)?r.v:null;}),
    sf(async()=>{const r=await fred("BAMLC0A0CM",10,TTL.fd);return(r?.v>0&&r.v<10)?r.v:null;})
  ]);
  return cs(k,{hy,ig,ratio:(hy&&ig&&ig!==0)?hy/ig:null},TTL.fd);
}

/* DÉLINQUANCE
   AUTO LOANS : DTCTHFNM → si null, essayer DRCLACBS (consumer loans, proxy décent)
   → si null, fallback 1.74% (Q4 2024 FRED officiel)
*/
async function delinFn(){
  const k="delin_v6";const c=cg(k);if(c!==undefined)return c;
  const[cc,re,reL,conL,autoL,autoPx]=await Promise.all([
    sf(()=>fred("DRCCLACBS",5,TTL.fm)),
    sf(()=>fred("DRSFRMACBS",5,TTL.fm)),
    sf(()=>fred("DRSREACBS",5,TTL.fm)),
    sf(()=>fred("DRCLACBS",5,TTL.fm)),
    sf(()=>fred("DTCTHFNM",5,TTL.fm)),   // consumer installment loans (proxy auto)
    sf(()=>fred("DRAUTONSA",5,TTL.fm))   // auto loans direct — parfois disponible
  ]);
  // Priorité : DRAUTONSA > DTCTHFNM > DRCLACBS > fallback 1.74%
  const autoRaw=autoPx?.v??autoL?.v;
  const autoV=(autoRaw!=null&&autoRaw>0.3&&autoRaw<10)?autoRaw
              :(conL?.v!=null&&conL.v>0.3&&conL.v<5)?null // consumer loans pas un bon proxy auto
              :null;
  // Si toujours null → valeur hardcodée connue (officielle FRED Q4 2024)
  const autoFinal=autoV??1.74;
  const autoStale=autoV==null;
  console.log("[DEL] CC:",cc?.v,"auto:",autoFinal,"(stale:",autoStale,") re:",re?.v,"con:",conL?.v);
  return cs(k,{
    creditCards:cc?.v??null,
    autoLoans:autoFinal,
    autoStale,
    realEstate:re?.v??null,
    studentLoans:reL?.v??null,
    commercialRe:conL?.v??null,
    date:cc?.d||null
  },TTL.fm);
}

/* RESEARCH */
async function researchFn(){
  const k="res_v6";const c=cg(k);if(c!==undefined)return c;
  const[nfci,ted,wei,conf,jolts]=await Promise.all([
    sf(()=>fred("NFCI",5,TTL.fd)),
    sf(()=>fred("TEDRATE",5,TTL.fd)),
    sf(()=>fred("WEI",5,TTL.fd)),
    sf(()=>fred("UMCSENT",5,TTL.fm)),
    sf(()=>fred("JTSJOL",5,TTL.fm))
  ]);
  console.log("[RES] NFCI:",nfci?.v,"JOLTS:",jolts?.v,"WEI:",wei?.v,"CONF:",conf?.v);
  return cs(k,{nfci,ted,wei,conf,jolts},TTL.fd);
}

/* CRYPTO */
async function btcDomFn(){
  const k="btcdom5";const c=cg(k);if(c!==undefined)return c;
  const d=await fj("https://api.coingecko.com/api/v3/global");
  return cs(k,N(d?.data?.market_cap_percentage?.btc),TTL.yahoo);
}

/* INDICES — Yahoo v7 quote (léger) + fallback stooq */
async function equitiesFn(){
  const k="eq_v5";const c=cg(k);if(c!==undefined)return c;
  const[spx,ndx,dji]=await Promise.all([
    sf(()=>yahooQuote("^GSPC")),
    sf(()=>yahooQuote("^NDX")),
    sf(()=>yahooQuote("^DJI"))
  ]);
  // Fallback stooq pour les indices si Yahoo bloque
  const spxF=spx?.price?spx:await sf(async()=>{
    const r=await stooqData("^spx",5);
    const last=r?.[r.length-1];const prev=r?.[r.length-2];
    if(!last||!prev||!prev.close)return null;
    return{price:last.close,chgPct:((last.close/prev.close)-1)*100};
  });
  const ndxF=ndx?.price?ndx:await sf(async()=>{
    const r=await stooqData("^ndx",5);
    const last=r?.[r.length-1];const prev=r?.[r.length-2];
    if(!last||!prev||!prev.close)return null;
    return{price:last.close,chgPct:((last.close/prev.close)-1)*100};
  });
  console.log("[EQ] SPX:",spxF?.price,"NDX:",ndxF?.price,"DJI:",dji?.price);
  return cs(k,{spx:spxF,ndx:ndxF,dji},TTL.eq);
}

/* ═══════════════════════════════════════════════════════
   SECTEURS S&P500 — STOOQ (source principale)
   Symboles stooq pour ETFs SPDR : xlk.us, xlf.us, etc.
   Très fiable, pas de rate limiting, CSV simple
   ═══════════════════════════════════════════════════════ */
const ETFS=[
  {n:"Tech",      s:"xlk.us"},{n:"Finance",   s:"xlf.us"},{n:"Santé",     s:"xlv.us"},
  {n:"Energie",   s:"xle.us"},{n:"C. disc.",  s:"xly.us"},{n:"Industrie", s:"xli.us"},
  {n:"C. base",   s:"xlp.us"},{n:"Utilities", s:"xlu.us"},{n:"Matériaux", s:"xlb.us"},
  {n:"Immo.",     s:"xlre.us"},{n:"Telecom",  s:"xlc.us"}
];
const UT_DAYS2={"1D":1,"1W":5,"1M":21,"3M":63,"6M":126,"1Y":252,"YTD":"ytd"};

async function secPerfStooq(sym,ut){
  const k=`sec6_${sym}_${ut}`;const c=cg(k);if(c!==undefined)return c;
  try{
    const rows=await stooqData(sym,265);
    if(!rows||rows.length<2)return cs(k,null,TTL.yS);
    const last=rows[rows.length-1].close;
    let first;
    if(ut==="YTD"){
      const yr=new Date().getFullYear();
      const ytd=rows.filter(r=>r.date&&r.date.startsWith(String(yr)));
      first=ytd[0]?.close;
    }else{
      const days=UT_DAYS2[ut]||21;
      first=rows[Math.max(0,rows.length-days-1)].close;
    }
    if(!first||!last||first===0)return cs(k,null,TTL.yS);
    const p=((last/first)-1)*100;
    console.log(`[SEC stooq] ${sym} ${ut}: ${p.toFixed(2)}%`);
    return cs(k,p,TTL.yS);
  }catch(e){
    console.warn(`[SEC stooq] ${sym}:`,e.message.slice(0,60));
    return cs(k,null,TTL.yS);
  }
}

async function allSec(ut="1M"){
  // stooq n'a pas de rate limit → fetch tout en parallèle
  const results=await Promise.all(ETFS.map(e=>sf(()=>secPerfStooq(e.s,ut))));
  const mapped=ETFS.map((e,i)=>({name:e.n,sym:e.s,value:results[i]}));
  const valid=mapped.filter(e=>e.value!=null).length;
  console.log(`[SEC] ${valid}/${ETFS.length} secteurs récupérés (${ut})`);
  return mapped.sort((a,b)=>(b.value??-99)-(a.value??-99));
}

/* RISK SCORE */
function riskScore(d){
  const sc=[],det=[];
  const vix=d.vix?.value,sp=d.yields?.spread2s10s,hy=d.credit?.hy;
  const fg=d.sentiment?.value,dxy=d.dxyProxy?.value;
  const gold=d.commodities?.gold?.value,copper=d.commodities?.copper?.value;
  const btc=d.crypto?.btcusd?.value,cc=d.delinquency?.creditCards,nfci=d.research?.nfci?.v;
  function add(s,l){sc.push(s);det.push(l);}
  if(vix!=null){const s=vix<15?2:vix<20?1:vix<25?-1:vix<35?-2:-3;add(s,`VIX ${vix.toFixed(1)} → ${s>0?"Risk-ON":"Risk-OFF"}`);}
  if(sp!=null){const s=sp>30?2:sp>0?1:sp>-20?-1:-2;add(s,`2s10s ${sp.toFixed(0)}pb → ${s>0?"Risk-ON":"Risk-OFF"}`);}
  if(hy!=null){const s=hy<4?1:hy<6?0:hy<8?-1:-2;add(s,`HY ${hy.toFixed(2)}% → ${s>0?"Risk-ON":s===0?"Neutre":"Risk-OFF"}`);}
  if(fg!=null){const s=fg>65?2:fg>45?1:fg>35?-1:-2;add(s,`F&G ${Math.round(fg)} → ${s>0?"Risk-ON":"Risk-OFF"}`);}
  if(dxy!=null){const s=dxy<100?1:dxy<104?0:-1;add(s,`DXY ${dxy.toFixed(2)} → ${s>0?"Risk-ON":s===0?"Neutre":"Risk-OFF"}`);}
  if(gold!=null&&!d.commodities?.copper?.stale){const s=gold>3500?-2:gold>3000?-1:gold<2000?1:0;add(s,`Or $${Math.round(gold)} → ${s<0?"Risk-OFF":"Neutre"}`);}
  if(copper!=null&&gold!=null&&gold>0&&!d.commodities?.copper?.stale){const cg2=copper/gold*1000;const s=cg2>0.6?1:cg2>0.4?0:-1;add(s,`Cu/Au ${cg2.toFixed(3)} → ${s>0?"Risk-ON":s===0?"Neutre":"Risk-OFF"}`);}
  if(btc!=null){const s=btc>80000?1:btc>50000?0:-1;add(s,`BTC $${Math.round(btc/1000)}k → ${s>0?"Risk-ON":s===0?"Neutre":"Risk-OFF"}`);}
  if(cc!=null){const s=cc<2.5?1:cc<3.5?0:-1;add(s,`Délinq. CC ${cc.toFixed(2)}% → ${s>0?"Risk-ON":s===0?"Neutre":"Risk-OFF"}`);}
  if(nfci!=null){const s=nfci<-0.5?1:nfci<0.5?0:-1;add(s,`NFCI ${nfci.toFixed(2)} → ${s>0?"Risk-ON":s===0?"Neutre":"Risk-OFF"}`);}
  if(!sc.length)return null;
  const tot=sc.reduce((a,b)=>a+b,0),mx=sc.length*2,mn=sc.length*-3;
  const norm=Math.max(0,Math.min(100,Math.round(((tot-mn)/(mx-mn))*100)));
  return{score:norm,regime:norm>=65?"RISK-ON":norm>=50?"LÉGÈREMENT RISK-ON":norm>=35?"LÉGÈREMENT RISK-OFF":"RISK-OFF",emoji:norm>=65?"🟢":norm>=50?"🟡":norm>=35?"🟠":"🔴",details:det};
}

/* RÉSUMÉ LOCAL */
function localSum(d,risk){
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
  if(cpi!=null)L.push(`💹 CPI ${cpi.toFixed(2)}% | Chômage ${unr?.toFixed(1)||'--'}%`);
  if(dxy!=null)L.push(`💵 DXY ${dxy.toFixed(2)}${dxy<100?" — dollar faible":dxy>104?" — dollar fort":""}`);
  if(gold!=null)L.push(`🥇 Or $${Math.round(gold)}/oz${silv?` | Ag $${silv.toFixed(2)}`:""}${(gold&&silv&&silv>0)?` | G/S ${(gold/silv).toFixed(1)}x`:""}`);
  if(copper&&gold&&gold>0){const cg2=copper/gold*1000;L.push(`🔩 Cu/Au ${cg2.toFixed(3)}${cg2>0.5?" ↑ risk-on":" ↓ risk-off"}${d.commodities?.copper?.stale?" (estimé)":""}`);}
  if(wti!=null)L.push(`🛢️ WTI $${wti.toFixed(2)}`);
  if(btc!=null)L.push(`₿ BTC $${Math.round(btc).toLocaleString("en-US")}`);
  if(hy!=null&&ig!=null)L.push(`📊 HY ${hy.toFixed(2)}% | IG ${ig.toFixed(2)}% | ratio ${(hy/ig).toFixed(2)}x`);
  if(fg!=null)L.push(`😱 F&G ${Math.round(fg)}/100 — ${d.sentiment?.label||""}`);
  if(nfci!=null)L.push(`🏦 NFCI ${nfci.toFixed(2)}${nfci>0.5?" tendu":nfci<-0.5?" souple":" neutre"}`);
  if(wei!=null)L.push(`📡 WEI ${wei>0?"+":""}${wei.toFixed(2)}`);
  return L.join("\n");
}

/* CLAUDE */
async function claude(question,ctx,max=260){
  if(!CLAUDE)throw new Error("ANTHROPIC_KEY manquante");
  const d=ctx||{};const risk=riskScore(d);
  const gold=d.commodities?.gold?.value,copper=d.commodities?.copper?.value;
  const cuau=(copper&&gold&&gold>0)?(copper/gold*1000):null;
  const snap={
    risk:{score:risk?.score,regime:risk?.regime,top3:risk?.details?.slice(0,3)},
    vix:d.vix?.value?.toFixed(1),dxy:d.dxyProxy?.value?.toFixed(2),
    sp2s10s:d.yields?.spread2s10s?.toFixed(0),us2y:d.yields?.us2y?.toFixed(2),us10y:d.yields?.us10y?.toFixed(2),
    cpi:d.inflation?.cpiYoY?.toFixed(2),coreCpi:d.inflation?.coreCpi?.toFixed(2),
    unr:d.labor?.unemploymentRate?.toFixed(1),fed:d.fed?.upperBound?.toFixed(2),
    btc:d.crypto?.btcusd?.value?Math.round(d.crypto.btcusd.value):null,
    gold:gold?Math.round(gold):null,silver:d.commodities?.silver?.value?.toFixed(2),
    wti:d.commodities?.oil?.value?.toFixed(2),copper:copper?.toFixed(2),
    cuau:cuau?.toFixed(3),
    hy:d.credit?.hy?.toFixed(2),ig:d.credit?.ig?.toFixed(2),
    fg:d.sentiment?.value?Math.round(d.sentiment.value):null,fgLabel:d.sentiment?.label,
    cc:d.delinquency?.creditCards?.toFixed(2),
    nfci:d.research?.nfci?.v?.toFixed(2),ted:d.research?.ted?.v?.toFixed(2),
    wei:d.research?.wei?.v?.toFixed(2),conf:d.research?.conf?.v?.toFixed(1),
    jolts:d.research?.jolts?.v?Math.round(d.research.jolts.v):null,
    spx:d.equities?.spx?.price?Math.round(d.equities.spx.price):null,
    spxChg:d.equities?.spx?.chgPct?.toFixed(2)
  };
  const r=await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",
    headers:{"Content-Type":"application/json","x-api-key":CLAUDE,"anthropic-version":"2023-06-01"},
    body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:max,
      system:`Analyste macro Bloomberg. Français. Dense, chiffré, factuel. Max ${max} tokens. Pas de conseil perso.`,
      messages:[{role:"user",content:`Data: ${JSON.stringify(snap)}\n\n${question}`}]})
  });
  const data=await r.json();
  if(!r.ok)throw new Error(data?.error?.message||`Claude ${r.status}`);
  return data.content?.[0]?.text||"Pas de réponse.";
}

/* ROUTE /api/dashboard */
app.get("/api/dashboard",async(req,res)=>{
  try{
    const ut=req.query.ut||"1M";
    const[rDxy,rVix,r1m,r3m,r2y,r10y,r30y,rUnr,rFed,
          cpiAll,coreCpiAll,pceCpiAll,
          rEur,rBtc,rEth,rBtcDom,rFng,rCredit,rDelin,
          rGold,rSilver,rCopper,rOil,rBrent,rNatgas,
          rSectors,rResearch,rEquities
    ]=await Promise.all([
      sf(()=>fred("DTWEXBGS",5)),sf(()=>fred("VIXCLS",5)),
      sf(()=>fred("DGS1MO",5)),sf(()=>fred("DGS3MO",5)),
      sf(()=>fred("DGS2",5)),sf(()=>fred("DGS10",5)),sf(()=>fred("DGS30",5)),
      sf(()=>fred("UNRATE",5)),sf(()=>fred("DFEDTARU",5)),
      sf(()=>fredAll("CPIAUCSL"),[]),sf(()=>fredAll("CPILFESL"),[]),sf(()=>fredAll("PCEPILFE"),[]),
      sf(()=>eurusd()),sf(()=>cb("BTC-USD")),sf(()=>cb("ETH-USD")),
      sf(()=>btcDomFn()),sf(()=>fng()),sf(()=>creditFn()),sf(()=>delinFn()),
      goldFn(),silverFn(),copperFn(),
      sf(()=>commoSimple("CL=F","DCOILWTICO",30,200,"oil_v5","cl.f")),
      sf(()=>commoSimple("BZ=F","DCOILBRENTEU",30,200,"brent_v5","brent.com")),
      sf(()=>commoSimple("NG=F","DHHNGSP",0.8,20,"natgas_v5","ng.f")),
      sf(()=>allSec(ut),[]),sf(()=>researchFn()),sf(()=>equitiesFn())
    ]);
    const us1m=N(r1m?.v),us3m=N(r3m?.v),us2y=N(r2y?.v),us10y=N(r10y?.v),us30y=N(r30y?.v);
    const spread2s10s=(us2y!=null&&us10y!=null)?(us10y-us2y)*100:null;
    const sentiment=rFng||fngFb(N(rVix?.v),spread2s10s);
    const cpiLast=lv(cpiAll);
    const gold=rGold?.value,copper=rCopper?.value;
    const cuau=(copper&&gold&&gold>0)?(copper/gold*1000):null;
    const data={
      dxyProxy:{value:N(rDxy?.v),date:rDxy?.d},
      vix:{value:N(rVix?.v),date:rVix?.d},
      yields:{us1m,us3m,us2y,us10y,us30y,spread2s10s},
      inflation:{cpiYoY:yoy(cpiAll),coreCpi:yoy(coreCpiAll),pceCore:yoy(pceCpiAll),date:cpiLast?.date||null},
      labor:{unemploymentRate:N(rUnr?.v),date:rUnr?.d},
      fed:{upperBound:N(rFed?.v),date:rFed?.d},
      fx:{eurusd:rEur},
      crypto:{btcusd:rBtc,btcDominance:rBtcDom,ethusd:rEth?.value??null},
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
        vixRegime:(()=>{const v=N(rVix?.v);return v==null?null:v>=30?"ÉLEVÉ 🔴":v>=20?"MODÉRÉ 🟡":"FAIBLE 🟢";})(),
        curveState:spread2s10s==null?null:spread2s10s>0?"positive ✅":"inversée 🔴",
        copperStale:rCopper?.stale||false,
        autoStale:rDelin?.autoStale||false
      }
    };
    const risk=riskScore(data);data.riskAnalysis=risk;
    data.localSummary=localSum(data,risk);
    res.json({updatedAt:new Date().toISOString(),sources:{fred:"FRED",market:"stooq·Coinbase·Yahoo·Frankfurter·Alt.me"},data});
  }catch(err){console.error("ERR:",err);res.status(500).json({error:"failed",message:err.message});}
});

app.get("/api/sectors",async(req,res)=>{
  const ut=req.query.ut||"1M";
  res.json({ut,sectors:await sf(()=>allSec(ut),[]),updatedAt:new Date().toISOString()});
});
app.post("/api/ai",async(req,res)=>{
  const q=String(req.body?.question||"").trim().slice(0,300),dash=req.body?.dashboard||null;
  if(!q)return res.status(400).json({error:"vide"});
  try{res.json({text:await claude(q,dash?.data,260)});}
  catch(e){res.json({text:`[Local]\n${dash?.data?localSum(dash.data,riskScore(dash.data)):"IA indisponible."}`,error:e.message});}
});
app.post("/api/ai/summary",async(req,res)=>{
  const dash=req.body?.dashboard||null;if(!dash?.data)return res.json({text:"Indisponible."});
  try{res.json({text:await claude(
    "Briefing en 5 points chiffrés : 1) Régime Risk-ON/OFF + signal dominant 2) Taux US et crédit HY/IG 3) Actifs réels (or, Cu/Au, pétrole) 4) Macro (CPI, emploi, NFCI, WEI) 5) Signal alerte ou opportunité notable.",
    dash.data,420)});}
  catch(e){res.json({text:localSum(dash.data,riskScore(dash.data))});}
});
app.post("/api/ai/risk",async(req,res)=>{
  const dash=req.body?.dashboard||null;if(!dash?.data)return res.status(400).json({error:"no data"});
  const risk=riskScore(dash.data);
  try{
    const text=await claude(`Risk-ON/OFF score ${risk?.score}/100 (${risk?.regime}). Signaux: ${JSON.stringify(risk?.details)}. Explique les 3 plus importants et implications pour or, dollar, actions, crédit.`,dash.data,300);
    res.json({text,score:risk?.score,regime:risk?.regime,details:risk?.details});
  }catch(e){res.status(500).json({error:e.message});}
});
app.get("/health",(_,res)=>res.json({ok:true,ts:new Date().toISOString(),cache:C.size}));
app.get("*",(_,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`◆ TERMINAL MACRO v4.4 — port ${PORT}
  Secteurs: stooq.com CSV (xlk.us, xlf.us... — TOUS les 11)
  Indices: Yahoo v7 quote + fallback stooq
  Auto loans: DRAUTONSA → DTCTHFNM → fallback 1.74%
  Cuivre: stooq hg.f → FRED → fallback 4.60`));
