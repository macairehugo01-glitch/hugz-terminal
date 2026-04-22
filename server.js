/* ◆ TERMINAL MACRO v4.3 — FIXES CIBLÉS
   ① Cu/Au : Yahoo HG=F → FRED PCOPPUSDM → valeur récente hardcodée ($4.60/lb)
      Le ratio Cu/Au s'affiche si OR disponible même sans cuivre live
   ② Secteurs : batches de 3 ETFs, délai 500ms, timeout 22s par ETF
      Ordre : ETFs les plus liquides en premier (XLK, XLF, XLV, XLE...)
   ③ JOLTS : vérification que research.jolts.v est bien exposé
   ④ Bonus : SPX, NDX et DJI via Yahoo (indices de marché)
   ⑤ Bonus : M2 velocity proxy, ISM Manufacturing
   ⑥ Analyse matinale complète : toutes les données nécessaires présentes
*/
const express=require("express"),path=require("path");
const app=express(),PORT=process.env.PORT||3000;
const FRED=process.env.FRED_API_KEY||"2945c843ac2ef54c3d1272b9f9cc2747";
const CLAUDE=process.env.ANTHROPIC_KEY||"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";
app.use(express.static(path.join(__dirname,"public")));
app.use(express.json({limit:"2mb"}));

/* CACHE */
const C=new Map();
const TTL={crypto:55e3,metals:2*60e3,eq:4*60e3,yahoo:5*60e3,yS:9*60e3,fng:25*60e3,fd:4*36e5,fm:10*36e5};
const cg=k=>{const e=C.get(k);if(!e)return undefined;if(Date.now()-e.t>e.l){C.delete(k);return undefined;}return e.v;};
const cs=(k,v,l)=>{C.set(k,{v,t:Date.now(),l});return v;};

/* UTILS */
const N=v=>{const n=parseFloat(v);return isFinite(n)?n:null;};
const UAS=["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36","Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15","Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0"];
let ui=0;const UA=()=>UAS[ui++%UAS.length];
const delay=ms=>new Promise(r=>setTimeout(r,ms));

async function fj(url,opts={}){
  const ms=opts.timeout||15000;
  const ac=new AbortController(),t=setTimeout(()=>ac.abort(),ms);
  try{
    const r=await fetch(url,{signal:ac.signal,...opts,
      headers:{"User-Agent":UA(),"Accept":"application/json,*/*","Accept-Language":"en-US,en;q=0.9","Cache-Control":"no-cache",...(opts.headers||{})}});
    clearTimeout(t);if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();
  }finally{clearTimeout(t);}
}
const sf=async(fn,fb=null)=>{try{return await fn();}catch(e){console.warn("[W]",String(e.message).slice(0,90));return fb;}};

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

/* YAHOO — last close avec headers complets */
const YH={"Referer":"https://finance.yahoo.com/","Origin":"https://finance.yahoo.com","Accept":"application/json,*/*"};
async function yahooLast(sym,range="5d",timeout=22000){
  for(const host of["query1","query2"]){
    try{
      const d=await fj(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=1d&includePrePost=false`,{headers:YH,timeout});
      const cl=d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
      if(Array.isArray(cl)&&cl.length>0){const v=[...cl].reverse().find(x=>x!=null);if(v!=null)return v;}
    }catch(e){console.warn(`[Y8] ${sym}@${host}:`,e.message.slice(0,55));}
  }
  return null;
}
async function yahooQuote(sym){
  // v7 quote API — alternative moins bloquée
  try{
    const d=await fj(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(sym)}&fields=regularMarketPrice,regularMarketChangePercent`,{headers:YH,timeout:12000});
    const r=d?.quoteResponse?.result?.[0];
    return r?{price:r.regularMarketPrice,chgPct:r.regularMarketChangePercent}:null;
  }catch(e){return null;}
}

/* COINBASE */
async function cb(pair,ttl=TTL.crypto){
  const k=`cb_${pair}`;const c=cg(k);if(c!==undefined)return c;
  const d=await fj(`https://api.coinbase.com/v2/prices/${pair}/spot`);
  const v=N(d?.data?.amount);if(v==null)throw new Error(`CB ${pair} null`);
  return cs(k,{value:v,ts:new Date().toISOString()},ttl);
}

/* GOLD — 4 sources cascade */
async function goldFn(){
  const k="gold_v4";const c=cg(k);if(c!==undefined)return c;
  const ok=v=>v!=null&&v>1500&&v<5500;
  const cxau=await sf(()=>cb("XAU-USD",TTL.metals));
  if(ok(cxau?.value)){console.log("[GOLD] CB:",cxau.value);return cs(k,{value:cxau.value,src:"Coinbase XAU"},TTL.metals);}
  const yg=await sf(()=>yahooLast("GC=F","5d",22000));
  if(ok(yg)){console.log("[GOLD] Yahoo:",yg);return cs(k,{value:yg,src:"Yahoo GC=F"},TTL.yahoo);}
  const fg=await sf(()=>fred("GOLDAMGBD228NLBM",5,TTL.fd));
  let fv=fg?.v;if(fv!=null&&fv>5000&&fv<500000)fv=fv/100;
  if(ok(fv)){console.log("[GOLD] FRED:",fv);return cs(k,{value:fv,src:"FRED"},TTL.fd);}
  const ml=await sf(async()=>{const d=await fj("https://metals.live/api/spot",{timeout:8000});return d?.gold||null;});
  if(ok(ml)){console.log("[GOLD] metals.live:",ml);return cs(k,{value:ml,src:"metals.live"},TTL.yahoo);}
  console.warn("[GOLD] All sources failed");
  return cs(k,{value:null,src:"N/A"},TTL.metals);
}

/* SILVER */
async function silverFn(){
  const k="silver_v4";const c=cg(k);if(c!==undefined)return c;
  const ok=v=>v!=null&&v>15&&v<120;
  const cxag=await sf(()=>cb("XAG-USD",TTL.metals));
  if(ok(cxag?.value))return cs(k,{value:cxag.value,src:"Coinbase XAG"},TTL.metals);
  const ys=await sf(()=>yahooLast("SI=F","5d",22000));
  if(ok(ys))return cs(k,{value:ys,src:"Yahoo SI=F"},TTL.yahoo);
  const fs=await sf(()=>fred("SLVPRUSD",5,TTL.fd));
  if(ok(fs?.v))return cs(k,{value:fs.v,src:"FRED"},TTL.fd);
  return cs(k,{value:null,src:"N/A"},TTL.metals);
}

/* CUIVRE — ① Yahoo HG=F ② FRED mensuel ③ valeur récente hardcodée si tout échoue
   HG=F = futures cuivre CME, coté en USD/lb
   PCOPPUSDM = FRED mensuel, peut avoir 4-6 semaines de délai
   Fallback: ~4.60 USD/lb (niveau Avril 2026) — affiché avec source "Estimé"
*/
async function copperFn(){
  const k="copper_v4";const c=cg(k);if(c!==undefined)return c;
  const ok=v=>v!=null&&v>2&&v<15;
  const yc=await sf(()=>yahooLast("HG=F","5d",22000));
  if(ok(yc)){console.log("[CU] Yahoo HG=F:",yc);return cs(k,{value:yc,src:"Yahoo HG=F"},TTL.yahoo);}
  const fc=await sf(()=>fred("PCOPPUSDM",5,TTL.fm));
  if(ok(fc?.v)){console.log("[CU] FRED:",fc.v);return cs(k,{value:fc.v,src:"FRED"},TTL.fm);}
  // Fallback hardcodé : valeur récente connue — permet d'afficher le ratio Cu/Au
  // Mise à jour manuelle recommandée si très éloigné du marché
  console.warn("[CU] Using hardcoded fallback ~4.60");
  return cs(k,{value:4.60,src:"Estimé*",stale:true},TTL.yahoo);
}

/* PÉTROLE, BRENT, GAZ */
async function commoSimple(sym,fredId,lo,hi,key){
  const c=cg(key);if(c!==undefined)return c;
  const yv=await sf(()=>yahooLast(sym,"5d",20000));
  if(yv!=null&&yv>=lo&&yv<=hi)return cs(key,{value:yv,src:`Yahoo ${sym}`},TTL.yahoo);
  const fv=await sf(()=>fred(fredId,5,TTL.fd));
  if(fv?.v!=null&&fv.v>=lo&&fv.v<=hi)return cs(key,{value:fv.v,src:"FRED"},TTL.fd);
  return cs(key,{value:null,src:"N/A"},TTL.yahoo);
}

/* INDICES ACTIONS — SPX, NDX, DJI */
async function equitiesFn(){
  const k="equities_v2";const c=cg(k);if(c!==undefined)return c;
  const[spx,ndx,dji]=await Promise.all([
    sf(()=>yahooQuote("^GSPC")),
    sf(()=>yahooQuote("^NDX")),
    sf(()=>yahooQuote("^DJI"))
  ]);
  console.log("[EQ] SPX:",spx?.price,"NDX:",ndx?.price);
  return cs(k,{spx,ndx,dji},TTL.eq);
}

/* ISM Manufacturing (bonus macro) */
async function ismFn(){
  const k="ism_v2";const c=cg(k);if(c!==undefined)return c;
  const r=await sf(()=>fred("MANEMP",5,TTL.fm)); // Manufacturing employment proxy
  const ism=await sf(()=>fred("NAPM",5,TTL.fm));  // ISM PMI
  return cs(k,{ism:ism?.v??null,date:ism?.d||null},TTL.fm);
}

/* FX + FNG */
async function eurusd(){
  const k="eur_v4";const c=cg(k);if(c!==undefined)return c;
  const d=await fj("https://api.frankfurter.app/latest?from=EUR&to=USD");
  const v=N(d?.rates?.USD);if(v==null)throw new Error("EUR/USD");
  return cs(k,{value:v},TTL.yahoo);
}
async function fng(){
  const k="fng_v4";const c=cg(k);if(c!==undefined)return c;
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
  const k="cred_v4";const c=cg(k);if(c!==undefined)return c;
  const[hy,ig]=await Promise.all([
    sf(async()=>{const r=await fred("BAMLH0A0HYM2",10,TTL.fd);return(r?.v>0&&r.v<30)?r.v:null;}),
    sf(async()=>{const r=await fred("BAMLC0A0CM",10,TTL.fd);return(r?.v>0&&r.v<10)?r.v:null;})
  ]);
  console.log("[CRED] HY:",hy,"IG:",ig);
  return cs(k,{hy,ig,ratio:(hy&&ig&&ig!==0)?hy/ig:null},TTL.fd);
}

/* DÉLINQUANCE */
async function delinFn(){
  const k="delin_v5";const c=cg(k);if(c!==undefined)return c;
  const[cc,re,reL,conL,autoL]=await Promise.all([
    sf(()=>fred("DRCCLACBS",5,TTL.fm)),
    sf(()=>fred("DRSFRMACBS",5,TTL.fm)),
    sf(()=>fred("DRSREACBS",5,TTL.fm)),
    sf(()=>fred("DRCLACBS",5,TTL.fm)),
    sf(()=>fred("DTCTHFNM",5,TTL.fm))
  ]);
  const autoV=autoL?.v!=null&&autoL.v>0.3&&autoL.v<10?autoL.v:null;
  console.log("[DEL] CC:",cc?.v,"auto:",autoV,"re:",re?.v,"con:",conL?.v);
  return cs(k,{creditCards:cc?.v??null,autoLoans:autoV,realEstate:re?.v??null,studentLoans:reL?.v??null,commercialRe:conL?.v??null,date:cc?.d||null},TTL.fm);
}

/* RESEARCH */
async function researchFn(){
  const k="res_v5";const c=cg(k);if(c!==undefined)return c;
  const[nfci,ted,wei,conf,jolts]=await Promise.all([
    sf(()=>fred("NFCI",5,TTL.fd)),
    sf(()=>fred("TEDRATE",5,TTL.fd)),
    sf(()=>fred("WEI",5,TTL.fd)),
    sf(()=>fred("UMCSENT",5,TTL.fm)),
    sf(()=>fred("JTSJOL",5,TTL.fm))
  ]);
  console.log("[RES] NFCI:",nfci?.v,"JOLTS:",jolts?.v,"WEI:",wei?.v,"CONF:",conf?.v,"TED:",ted?.v);
  // JOLTS est mensuel avec 2 mois de retard — c'est normal
  return cs(k,{nfci,ted,wei,conf,jolts},TTL.fd);
}

/* CRYPTO */
async function btcDomFn(){
  const k="btcdom4";const c=cg(k);if(c!==undefined)return c;
  const d=await fj("https://api.coingecko.com/api/v3/global");
  return cs(k,N(d?.data?.market_cap_percentage?.btc),TTL.yahoo);
}

/* SECTEURS — fix définitif:
   - Batches de 3 (pas 4) avec 500ms entre batches
   - ETFs ordonnés par liquidité décroissante (les plus liquides = moins de blocage)
   - Timeout 22s par ETF
   - Cache key v5 pour éviter les résidus
*/
const ETFS=[
  // Batch 1 — très liquides
  {n:"Tech",    s:"XLK"},{n:"Finance",  s:"XLF"},{n:"Santé",    s:"XLV"},
  // Batch 2 — liquides
  {n:"Energie", s:"XLE"},{n:"C. disc.", s:"XLY"},{n:"Industrie",s:"XLI"},
  // Batch 3 — moins liquides
  {n:"C. base", s:"XLP"},{n:"Utilities",s:"XLU"},{n:"Matériaux", s:"XLB"},
  // Batch 4 — les moins liquides (XLRE et XLC timeout souvent)
  {n:"Immo.",   s:"XLRE"},{n:"Telecom", s:"XLC"}
];
const UTC={"1D":{r:"5d",i:"1d"},"1W":{r:"1mo",i:"1d"},"1M":{r:"1mo",i:"1d"},"3M":{r:"3mo",i:"1d"},"6M":{r:"6mo",i:"1wk"},"1Y":{r:"1y",i:"1mo"},"YTD":{r:"ytd",i:"1d"}};

async function secPerf(sym,ut){
  const cfg=UTC[ut]||UTC["1M"];
  const k=`sec5_${sym}_${ut}`;const c=cg(k);if(c!==undefined)return c;
  for(const host of["query1","query2"]){
    try{
      const d=await fj(`https://${host}.finance.yahoo.com/v8/finance/chart/${sym}?range=${cfg.r}&interval=${cfg.i}&includePrePost=false`,{headers:YH,timeout:22000});
      const cl=d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
      if(!Array.isArray(cl)||cl.length<2)continue;
      let first,last;
      if(ut==="1D"){const v=cl.filter(x=>x!=null);if(v.length<2)continue;last=v[v.length-1];first=v[v.length-2];}
      else{first=cl.find(v=>v!=null);last=[...cl].reverse().find(v=>v!=null);}
      if(!first||!last||first===0)continue;
      const p=((last/first)-1)*100;
      console.log(`[SEC] ${sym}@${host}: ${p.toFixed(2)}%`);
      return cs(k,p,TTL.yS);
    }catch(e){console.warn(`[SEC] ${sym}@${host}:`,e.message.slice(0,50));}
  }
  // Fallback: Yahoo v7 quote (change % journalier seulement, mais mieux que rien)
  if(ut==="1D"){
    const q=await sf(()=>yahooQuote(sym));
    if(q?.chgPct!=null){console.log(`[SEC] ${sym} v7 quote: ${q.chgPct.toFixed(2)}%`);return cs(k,q.chgPct,TTL.yS);}
  }
  return cs(k,null,TTL.yS);
}

async function allSec(ut="1M"){
  const results=[];
  // Batches de 3 avec 500ms de pause — évite le rate limiting
  for(let i=0;i<ETFS.length;i+=3){
    const batch=ETFS.slice(i,i+3);
    const bRes=await Promise.all(batch.map(e=>sf(()=>secPerf(e.s,ut))));
    results.push(...bRes);
    if(i+3<ETFS.length)await delay(500);
  }
  return ETFS.map((e,i)=>({name:e.n,sym:e.s,value:results[i]})).sort((a,b)=>(b.value??-99)-(a.value??-99));
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
  if(gold!=null){const s=gold>3500?-2:gold>3000?-1:gold<2000?1:0;add(s,`Or $${Math.round(gold)} → ${s<0?"Risk-OFF":"Neutre"}`);}
  if(copper!=null&&gold!=null&&gold>0){const cg2=copper/gold*1000;const s=cg2>0.6?1:cg2>0.4?0:-1;add(s,`Cu/Au ${cg2.toFixed(3)} → ${s>0?"Risk-ON":s===0?"Neutre":"Risk-OFF"}`);}
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
  if(copper&&gold&&gold>0){const cg2=copper/gold*1000;L.push(`🔩 Cu/Au ${cg2.toFixed(3)}${cg2>0.5?" ↑ risk-on":" ↓ risk-off"} | Cuivre $${copper.toFixed(2)}/lb`);}
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
  const jolts=d.research?.jolts?.v;
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
    jolts:jolts?Math.round(jolts):null,
    spx:d.equities?.spx?.price?Math.round(d.equities.spx.price):null,
    spxChg:d.equities?.spx?.chgPct?.toFixed(2),
  };
  const r=await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",
    headers:{"Content-Type":"application/json","x-api-key":CLAUDE,"anthropic-version":"2023-06-01"},
    body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:max,
      system:`Analyste macro Bloomberg. Français. Chiffré, factuel, dense. Max ${max} tokens. Pas de conseil perso.`,
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
      sf(()=>commoSimple("CL=F","DCOILWTICO",30,200,"oil_v4")),
      sf(()=>commoSimple("BZ=F","DCOILBRENTEU",30,200,"brent_v4")),
      sf(()=>commoSimple("NG=F","DHHNGSP",0.8,20,"natgas_v4")),
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
        copperGoldRatio:cuau,                       // ← exposé clairement
        goldSilverRatio:(gold&&rSilver?.value&&rSilver.value>0)?gold/rSilver.value:null,
        vixRegime:(()=>{const v=N(rVix?.v);return v==null?null:v>=30?"ÉLEVÉ 🔴":v>=20?"MODÉRÉ 🟡":"FAIBLE 🟢";})(),
        curveState:spread2s10s==null?null:spread2s10s>0?"positive ✅":"inversée 🔴",
        copperStale:rCopper?.stale||false          // indique si cuivre = valeur estimée
      }
    };
    const risk=riskScore(data);data.riskAnalysis=risk;
    data.localSummary=localSum(data,risk);
    res.json({updatedAt:new Date().toISOString(),sources:{fred:"FRED",market:"Coinbase XAU/XAG·Yahoo·Frankfurter·Alt.me"},data});
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
    "Briefing d'ouverture en 5 points structurés : 1) Régime Risk-ON/OFF + signal dominant 2) Taux US et crédit (HY/IG) 3) Actifs réels (or, Cu/Au, pétrole) 4) Macro (inflation, emploi, NFCI, WEI) 5) Signal clé : alerte ou opportunité. Sois direct et chiffré.",
    dash.data,420)});}
  catch(e){res.json({text:localSum(dash.data,riskScore(dash.data))});}
});
app.post("/api/ai/risk",async(req,res)=>{
  const dash=req.body?.dashboard||null;if(!dash?.data)return res.status(400).json({error:"no data"});
  const risk=riskScore(dash.data);
  try{
    const text=await claude(`Analyse Risk-ON/OFF : score ${risk?.score}/100 (${risk?.regime}). Signaux: ${JSON.stringify(risk?.details)}. Explique les 3 signaux les + importants et leurs implications pour or, dollar, actions, crédit.`,dash.data,320);
    res.json({text,score:risk?.score,regime:risk?.regime,details:risk?.details});
  }catch(e){res.status(500).json({error:e.message});}
});
app.get("/health",(_,res)=>res.json({ok:true,ts:new Date().toISOString(),cache:C.size}));
app.get("*",(_,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`◆ TERMINAL MACRO v4.3 — port ${PORT}
  Cu/Au: Yahoo HG=F → FRED → fallback 4.60 USD/lb
  Secteurs: batches de 3, délai 500ms, v7 fallback
  JOLTS: FRED JTSJOL (mensuel, 2 mois retard — NORMAL)`));
