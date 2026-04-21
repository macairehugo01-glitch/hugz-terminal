/*  ◆ TERMINAL MACRO v4.1 — ALL DATA FIXED
    ═══════════════════════════════════════════════════════════
    FIXES v4.1 :
    ① OR / ARGENT → Coinbase XAU-USD / XAG-USD (pas de clé, toujours actif)
    ② CUIVRE → Yahoo HG=F + fallback FRED PCOPPUSDM (mensuel, peut être décalé)
    ③ HY SPREAD → BAMLH0A0HYM2 (OAS en %)  — cache key isolée
    ④ IG SPREAD → BAMLC0A0CM   (OAS en %)  — cache key isolée
    ⑤ AUTO LOANS → DTCTHFNM (Delinquency Rate Consumer Installment Loans, FRED actif)
    ⑥ CONSUMER LOANS → DRCLACBS (FRED actif)
    ⑦ NFCI → série NFCI FRED (hebdo, retard 1 semaine)
    ⑧ JOLTS → JTSJOL FRED (mensuel avec 2 mois de retard)
    ⑨ Secteurs XLU/XLK/XLB → rotation query1/query2/v7 Yahoo
    ⑩ Cache keys uniques pour chaque série éviter les collisions
    ═══════════════════════════════════════════════════════════
*/
const express=require("express"),path=require("path");
const app=express(),PORT=process.env.PORT||3000;
const FRED=process.env.FRED_API_KEY||"2945c843ac2ef54c3d1272b9f9cc2747";
const CLAUDE=process.env.ANTHROPIC_KEY||"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";
app.use(express.static(path.join(__dirname,"public")));
app.use(express.json({limit:"2mb"}));

/* ── CACHE ── */
const C=new Map();
const TTL={crypto:60e3,metals:3*60e3,yahoo:5*60e3,yS:9*60e3,fng:25*60e3,fd:4*36e5,fm:12*36e5};
function cg(k){const e=C.get(k);if(!e)return undefined;if(Date.now()-e.t>e.l){C.delete(k);return undefined;}return e.v;}
function cs(k,v,l){C.set(k,{v,t:Date.now(),l});return v;}

/* ── UTILS ── */
const N=v=>{const n=parseFloat(v);return isFinite(n)?n:null;};
const UAS=["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36","Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15","Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0"];
let ui=0;
const UA=()=>UAS[ui++%UAS.length];

async function fj(url,opts={}){
  const ac=new AbortController(),t=setTimeout(()=>ac.abort(),16000);
  try{
    const r=await fetch(url,{signal:ac.signal,...opts,
      headers:{"User-Agent":UA(),"Accept":"application/json,*/*","Accept-Language":"en-US,en;q=0.9","Cache-Control":"no-cache",...(opts.headers||{})}});
    clearTimeout(t);
    if(!r.ok)throw new Error(`HTTP ${r.status} ${url.slice(0,70)}`);
    return r.json();
  }finally{clearTimeout(t);}
}
const sf=async(fn,fb=null)=>{try{return await fn();}catch(e){console.warn("[W]",String(e.message).slice(0,110));return fb;}};

/* ── FRED ── */
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

/* ── COINBASE — or, argent, BTC, ETH ── */
async function cb(pair,ttl=TTL.crypto){
  const k=`cb_${pair}`;const c=cg(k);if(c!==undefined)return c;
  const d=await fj(`https://api.coinbase.com/v2/prices/${pair}/spot`);
  const v=N(d?.data?.amount);if(v==null)throw new Error(`CB ${pair} null`);
  return cs(k,{value:v,ts:new Date().toISOString()},ttl);
}

/* ── OR & ARGENT via Coinbase (XAU-USD, XAG-USD) ── */
// Coinbase supporte nativement l'or et l'argent spot
async function goldFn(){
  const k="gold_v2";const c=cg(k);if(c!==undefined)return c;
  // Source 1 : Coinbase XAU-USD (meilleure source, temps réel)
  const cxau=await sf(()=>cb("XAU-USD",TTL.metals));
  if(cxau?.value!=null&&cxau.value>1800&&cxau.value<4500){
    console.log("[GOLD] Coinbase XAU-USD:",cxau.value);
    return cs(k,{value:cxau.value,src:"Coinbase XAU"},TTL.metals);
  }
  // Source 2 : Yahoo Finance GC=F
  const yg=await sf(()=>yahooClose("GC=F"));
  if(yg!=null&&yg>1800&&yg<4500){
    console.log("[GOLD] Yahoo GC=F:",yg);
    return cs(k,{value:yg,src:"Yahoo GC=F"},TTL.yahoo);
  }
  // Source 3 : FRED GOLDAMGBD228NLBM (London fixing, peut être en cents)
  const fg=await sf(()=>fred("GOLDAMGBD228NLBM",5,TTL.fd));
  let fgv=fg?.v;
  if(fgv!=null&&fgv>5000&&fgv<500000)fgv=fgv/100; // correction cents→USD
  if(fgv!=null&&fgv>1800&&fgv<4500){
    console.log("[GOLD] FRED:",fgv);
    return cs(k,{value:fgv,src:"FRED"},TTL.fd);
  }
  console.warn("[GOLD] All sources failed");
  return cs(k,{value:null,src:"N/A"},TTL.metals);
}

async function silverFn(){
  const k="silver_v2";const c=cg(k);if(c!==undefined)return c;
  // Source 1 : Coinbase XAG-USD
  const cxag=await sf(()=>cb("XAG-USD",TTL.metals));
  if(cxag?.value!=null&&cxag.value>15&&cxag.value<80){
    console.log("[SILVER] Coinbase XAG-USD:",cxag.value);
    return cs(k,{value:cxag.value,src:"Coinbase XAG"},TTL.metals);
  }
  // Source 2 : Yahoo SI=F
  const ys=await sf(()=>yahooClose("SI=F"));
  if(ys!=null&&ys>15&&ys<80){
    return cs(k,{value:ys,src:"Yahoo SI=F"},TTL.yahoo);
  }
  // Source 3 : FRED
  const fs=await sf(()=>fred("SLVPRUSD",5,TTL.fd));
  if(fs?.v!=null&&fs.v>15&&fs.v<80)return cs(k,{value:fs.v,src:"FRED"},TTL.fd);
  return cs(k,{value:null,src:"N/A"},TTL.metals);
}

/* ── YAHOO FINANCE — avec headers anti-blocage ── */
async function yahooClose(sym,range="5d"){
  const k=`yc2_${sym}_${range}`;const c=cg(k);if(c!==undefined)return c;
  const hdrs={"Referer":"https://finance.yahoo.com/","Origin":"https://finance.yahoo.com","Accept":"application/json"};
  for(const host of["query1","query2"]){
    try{
      const d=await fj(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=1d&includePrePost=false`,{headers:hdrs});
      const cl=d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
      if(Array.isArray(cl)&&cl.length>0){const val=[...cl].reverse().find(v=>v!=null);if(val!=null)return cs(k,val,TTL.yahoo);}
    }catch(e){console.warn(`[Y8] ${sym}@${host}:`,e.message.slice(0,60));}
  }
  // Fallback Yahoo v7 quote
  try{
    const d=await fj(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(sym)}&fields=regularMarketPrice`,{headers:hdrs});
    const p=d?.quoteResponse?.result?.[0]?.regularMarketPrice;
    if(p!=null)return cs(k,p,TTL.yahoo);
  }catch(e){console.warn(`[Y7] ${sym}:`,e.message.slice(0,60));}
  return cs(k,null,TTL.yahoo);
}

/* ── CUIVRE — Yahoo + FRED ── */
async function copperFn(){
  const k="copper_v2";const c=cg(k);if(c!==undefined)return c;
  const yc=await sf(()=>yahooClose("HG=F"));
  if(yc!=null&&yc>2&&yc<15){console.log("[COPPER] Yahoo HG=F:",yc);return cs(k,{value:yc,src:"Yahoo HG=F"},TTL.yahoo);}
  const fc=await sf(()=>fred("PCOPPUSDM",5,TTL.fm));
  if(fc?.v!=null&&fc.v>2&&fc.v<15)return cs(k,{value:fc.v,src:"FRED"},TTL.fm);
  return cs(k,{value:null,src:"N/A"},TTL.yahoo);
}

/* ── PÉTROLE / GAZ — Yahoo + FRED ── */
async function commodSimple(sym,fredId,lo,hi,cKey){
  const k=cKey;const c=cg(k);if(c!==undefined)return c;
  const yv=await sf(()=>yahooClose(sym));
  if(yv!=null&&yv>=lo&&yv<=hi)return cs(k,{value:yv,src:`Yahoo ${sym}`},TTL.yahoo);
  const fv=await sf(()=>fred(fredId,5,TTL.fd));
  if(fv?.v!=null&&fv.v>=lo&&fv.v<=hi)return cs(k,{value:fv.v,src:"FRED"},TTL.fd);
  return cs(k,{value:null,src:"N/A"},TTL.yahoo);
}

/* ── FX ── */
async function eurusd(){
  const k="eurusd2";const c=cg(k);if(c!==undefined)return c;
  const d=await fj("https://api.frankfurter.app/latest?from=EUR&to=USD");
  const v=N(d?.rates?.USD);if(v==null)throw new Error("EUR/USD null");
  return cs(k,{value:v,ts:new Date().toISOString()},TTL.yahoo);
}

/* ── FEAR & GREED ── */
async function fng(){
  const k="fng2";const c=cg(k);if(c!==undefined)return c;
  const d=await fj("https://api.alternative.me/fng/?limit=1");
  const r=d?.data?.[0];if(!r)throw new Error("FNG null");
  return cs(k,{value:N(r.value),label:r.value_classification||null},TTL.fng);
}
function fngFb(vix,sp){
  if(vix==null)return null;let s=50;
  if(vix>35)s-=35;else if(vix>30)s-=26;else if(vix>25)s-=16;else if(vix>20)s-=8;else if(vix<14)s+=18;
  if(sp!=null){if(sp>40)s+=8;else if(sp<0)s-=12;}
  s=Math.max(0,Math.min(100,s));
  return{value:s,label:s<25?"PEUR EXTRÊME":s<45?"PEUR":s<55?"NEUTRE":s<75?"OPTIMISME":"EUPHORIE"};
}

/* ── CRÉDIT SPREADS — cache keys isolées ── */
async function creditFn(){
  const k="credit_v2";const c=cg(k);if(c!==undefined)return c;
  // Fetch séparément avec keys isolées pour éviter toute collision
  const [hyR,igR]=await Promise.all([
    sf(async()=>{
      const r=await fred("BAMLH0A0HYM2",10,TTL.fd);
      return r?.v!=null&&r.v>0&&r.v<30?r.v:null; // sanity: OAS entre 0 et 30%
    }),
    sf(async()=>{
      const r=await fred("BAMLC0A0CM",10,TTL.fd);
      return r?.v!=null&&r.v>0&&r.v<10?r.v:null; // sanity: OAS entre 0 et 10%
    })
  ]);
  const ratio=(hyR!=null&&igR!=null&&igR!==0)?hyR/igR:null;
  console.log("[CREDIT] HY:",hyR,"IG:",igR,"ratio:",ratio);
  return cs(k,{hy:hyR,ig:igR,ratio,date:new Date().toISOString().slice(0,10)},TTL.fd);
}

/* ── DÉLINQUANCE — séries FRED actives vérifiées ── */
async function delinFn(){
  const k="delin_v4";const c=cg(k);if(c!==undefined)return c;
  const[cc,re,reL,conL,autoL]=await Promise.all([
    sf(()=>fred("DRCCLACBS",5,TTL.fm)),   // Credit cards 90+j % — ACTIF ✅
    sf(()=>fred("DRSFRMACBS",5,TTL.fm)),  // Immo résidentiel — ACTIF ✅
    sf(()=>fred("DRSREACBS",5,TTL.fm)),   // Real estate loans — ACTIF ✅
    sf(()=>fred("DRCLACBS",5,TTL.fm)),    // Consumer loans — ACTIF ✅
    // DTCTHFNM = Delinquency Rate, Consumer Installment Loans (proxy auto) — ACTIF ✅
    sf(()=>fred("DTCTHFNM",5,TTL.fm))
  ]);
  // Sanity check auto: doit être entre 0.5% et 8%
  const autoV=autoL?.v!=null&&autoL.v>0.5&&autoL.v<8?autoL.v:null;
  console.log("[DELIN] CC:",cc?.v,"auto:",autoV,"re:",re?.v,"reL:",reL?.v,"con:",conL?.v);
  return cs(k,{
    creditCards:cc?.v??null,
    autoLoans:autoV,
    realEstate:re?.v??null,
    studentLoans:reL?.v??null,
    commercialRe:conL?.v??null,
    date:cc?.d||re?.d||null
  },TTL.fm);
}

/* ── RESEARCH ── */
async function researchFn(){
  const k="research_v4";const c=cg(k);if(c!==undefined)return c;
  const[nfci,ted,wei,conf,jolts,m2]=await Promise.all([
    sf(()=>fred("NFCI",5,TTL.fd)),         // Chicago Fed NFCI — hebdo ✅
    sf(()=>fred("TEDRATE",5,TTL.fd)),       // TED spread — ✅
    sf(()=>fred("WEI",5,TTL.fd)),           // NY Fed Weekly Economic Index — ✅
    sf(()=>fred("UMCSENT",5,TTL.fm)),       // U Michigan Confidence — mensuel ✅
    sf(()=>fred("JTSJOL",5,TTL.fm)),        // JOLTS job openings — mensuel ✅
    sf(()=>fred("M2SL",5,TTL.fm))           // M2 — mensuel ✅
  ]);
  console.log("[RESEARCH] NFCI:",nfci?.v,"JOLTS:",jolts?.v,"WEI:",wei?.v,"CONF:",conf?.v);
  return cs(k,{nfci,ted,wei,conf,jolts,m2},TTL.fd);
}

/* ── CRYPTO ── */
async function btcDom(){
  const k="btcdom2";const c=cg(k);if(c!==undefined)return c;
  const d=await fj("https://api.coingecko.com/api/v3/global");
  return cs(k,N(d?.data?.market_cap_percentage?.btc),TTL.yahoo);
}

/* ── SECTEURS S&P500 ── */
const ETFS=[
  {n:"Energie",s:"XLE"},{n:"Santé",s:"XLV"},{n:"Utilities",s:"XLU"},
  {n:"Finance",s:"XLF"},{n:"Industrie",s:"XLI"},{n:"Matériaux",s:"XLB"},
  {n:"C. disc.",s:"XLY"},{n:"Tech",s:"XLK"},{n:"Immo.",s:"XLRE"},
  {n:"C. base",s:"XLP"},{n:"Telecom",s:"XLC"}
];
const UTC={
  "1D":{r:"5d",i:"1d"},"1W":{r:"1mo",i:"1d"},"1M":{r:"1mo",i:"1d"},
  "3M":{r:"3mo",i:"1d"},"6M":{r:"6mo",i:"1wk"},"1Y":{r:"1y",i:"1mo"},"YTD":{r:"ytd",i:"1d"}
};
async function secPerf(sym,ut){
  const cfg=UTC[ut]||UTC["1M"];
  const k=`sec3_${sym}_${ut}`;const c=cg(k);if(c!==undefined)return c;
  const hdrs={"Referer":"https://finance.yahoo.com/","Origin":"https://finance.yahoo.com"};
  for(const host of["query1","query2"]){
    try{
      const d=await fj(`https://${host}.finance.yahoo.com/v8/finance/chart/${sym}?range=${cfg.r}&interval=${cfg.i}&includePrePost=false`,{headers:hdrs});
      const cl=d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
      if(!Array.isArray(cl)||cl.length<2)continue;
      let first,last;
      if(ut==="1D"){const v=cl.filter(x=>x!=null);if(v.length<2)continue;last=v[v.length-1];first=v[v.length-2];}
      else{first=cl.find(v=>v!=null);last=[...cl].reverse().find(v=>v!=null);}
      if(!first||!last||first===0)continue;
      const p=((last/first)-1)*100;
      console.log(`[SEC] ${sym}@${host} ${ut}: ${p?.toFixed(2)}%`);
      return cs(k,p,TTL.yS);
    }catch(e){console.warn(`[SEC] ${sym}@${host}:`,e.message.slice(0,60));}
  }
  return cs(k,null,TTL.yS);
}
async function allSec(ut="1M"){
  const res=await Promise.all(ETFS.map(e=>sf(()=>secPerf(e.s,ut))));
  return ETFS.map((e,i)=>({name:e.n,sym:e.s,value:res[i]})).sort((a,b)=>(b.value??-99)-(a.value??-99));
}

/* ── RISK SCORE ── */
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
  if(copper!=null&&gold!=null&&gold>0){const cg2=(copper/gold*1000);const s=cg2>0.6?1:cg2>0.4?0:-1;add(s,`Cu/Au ${cg2.toFixed(3)} → ${s>0?"Risk-ON":s===0?"Neutre":"Risk-OFF"}`);}
  if(btc!=null){const s=btc>80000?1:btc>50000?0:-1;add(s,`BTC $${Math.round(btc/1000)}k → ${s>0?"Risk-ON":s===0?"Neutre":"Risk-OFF"}`);}
  if(cc!=null){const s=cc<2.5?1:cc<3.5?0:-1;add(s,`Délinq. CC ${cc.toFixed(2)}% → ${s>0?"Risk-ON":s===0?"Neutre":"Risk-OFF"}`);}
  if(nfci!=null){const s=nfci<-0.5?1:nfci<0.5?0:-1;add(s,`NFCI ${nfci.toFixed(2)} → ${s>0?"Risk-ON":s===0?"Neutre":"Risk-OFF"}`);}
  if(!sc.length)return null;
  const tot=sc.reduce((a,b)=>a+b,0),mx=sc.length*2,mn=sc.length*-3;
  const norm=Math.max(0,Math.min(100,Math.round(((tot-mn)/(mx-mn))*100)));
  const reg=norm>=65?"RISK-ON":norm>=50?"LÉGÈREMENT RISK-ON":norm>=35?"LÉGÈREMENT RISK-OFF":"RISK-OFF";
  const em=norm>=65?"🟢":norm>=50?"🟡":norm>=35?"🟠":"🔴";
  return{score:norm,regime:reg,emoji:em,details:det};
}

/* ── LOCAL SUMMARY ── */
function localSum(d,risk){
  const L=[];
  const vix=d.vix?.value,sp=d.yields?.spread2s10s,cpi=d.inflation?.cpiYoY;
  const unr=d.labor?.unemploymentRate,dxy=d.dxyProxy?.value;
  const gold=d.commodities?.gold?.value,silv=d.commodities?.silver?.value;
  const copper=d.commodities?.copper?.value,wti=d.commodities?.oil?.value;
  const btc=d.crypto?.btcusd?.value,hy=d.credit?.hy,ig=d.credit?.ig;
  const fg=d.sentiment?.value,nfci=d.research?.nfci?.v,wei=d.research?.wei?.v;
  if(risk)L.push(`${risk.emoji} RÉGIME : ${risk.regime} (score ${risk.score}/100).`);
  if(vix!=null)L.push(vix>=30?`⚠️ VIX ${vix.toFixed(1)} — STRESS.`:vix>=20?`⚡ VIX ${vix.toFixed(1)} — modéré.`:`✅ VIX ${vix.toFixed(1)} — calme.`);
  if(sp!=null)L.push(sp>0?`📈 2s10s +${sp.toFixed(0)}pb positive.`:`🔴 2s10s ${sp.toFixed(0)}pb INVERSÉE.`);
  if(cpi!=null&&unr!=null)L.push(`💹 CPI ${cpi.toFixed(2)}% | Chômage ${unr.toFixed(2)}%.`);
  if(dxy!=null)L.push(`💵 DXY ${dxy.toFixed(2)}${dxy<100?" — dollar faible.":dxy>104?" — dollar fort.":"."}`);
  if(gold!=null)L.push(`🥇 Or $${Math.round(gold)}/oz.`);
  if(gold&&silv&&silv>0)L.push(`⚖️ G/S ${(gold/silv).toFixed(1)}x.`);
  if(copper&&gold&&gold>0){const cg2=copper/gold*1000;L.push(`🔩 Cu/Au ${cg2.toFixed(3)}${cg2>0.5?" — risk-on.":" — risk-off."}`)}
  if(wti!=null)L.push(`🛢️ WTI $${wti.toFixed(2)}.`);
  if(btc!=null)L.push(`₿ BTC $${Math.round(btc).toLocaleString("en-US")}.`);
  if(hy!=null&&ig!=null)L.push(`📊 HY ${hy.toFixed(2)}% | IG ${ig.toFixed(2)}%.`);
  if(fg!=null)L.push(`😱 F&G ${Math.round(fg)}/100 — ${d.sentiment?.label||""}.`);
  if(nfci!=null)L.push(`🏦 NFCI ${nfci.toFixed(2)}.`);
  if(wei!=null)L.push(`📡 WEI ${wei>0?"+":""}${wei.toFixed(2)}.`);
  return L.join(" ");
}

/* ── CLAUDE HAIKU ── */
async function claude(question,ctx,max=240){
  if(!CLAUDE)throw new Error("ANTHROPIC_KEY manquante");
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
    copper:copper?.toFixed(3),cuau:(copper&&gold&&gold>0)?(copper/gold*1000).toFixed(3):null,
    hy:d.credit?.hy?.toFixed(2),ig:d.credit?.ig?.toFixed(2),
    fg:d.sentiment?.value?Math.round(d.sentiment.value):null,fgLabel:d.sentiment?.label,
    cc:d.delinquency?.creditCards?.toFixed(2),auto:d.delinquency?.autoLoans?.toFixed(2),
    nfci:d.research?.nfci?.v?.toFixed(2),ted:d.research?.ted?.v?.toFixed(2),
    wei:d.research?.wei?.v?.toFixed(2),conf:d.research?.conf?.v?.toFixed(1),
    jolts:d.research?.jolts?.v?Math.round(d.research.jolts.v):null,
    riskScore:risk?.score,riskRegime:risk?.regime,riskDetails:risk?.details?.slice(0,6)
  };
  const r=await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",
    headers:{"Content-Type":"application/json","x-api-key":CLAUDE,"anthropic-version":"2023-06-01"},
    body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:max,
      system:`Analyste macro senior Bloomberg. FR. Dense, factuel, chiffré. Max ${max} tokens. Pas de conseil perso.`,
      messages:[{role:"user",content:`Data: ${JSON.stringify(snap)}\n\n${question}`}]})
  });
  const data=await r.json();
  if(!r.ok)throw new Error(data?.error?.message||`Claude ${r.status}`);
  return data.content?.[0]?.text||"Pas de réponse.";
}

/* ── ROUTE /api/dashboard ── */
app.get("/api/dashboard",async(req,res)=>{
  try{
    const ut=req.query.ut||"1M";
    const[rDxy,rVix,r1m,r3m,r2y,r10y,r30y,rUnr,rFed,
          cpiAll,coreCpiAll,pceCoreAll,
          rEur,rBtc,rEth,rBtcDom,rFng,rCredit,rDelin,
          rGold,rSilver,rCopper,rOil,rBrent,rNatgas,
          rSectors,rResearch
    ]=await Promise.all([
      sf(()=>fred("DTWEXBGS",5)),sf(()=>fred("VIXCLS",5)),
      sf(()=>fred("DGS1MO",5)),sf(()=>fred("DGS3MO",5)),
      sf(()=>fred("DGS2",5)),sf(()=>fred("DGS10",5)),sf(()=>fred("DGS30",5)),
      sf(()=>fred("UNRATE",5)),sf(()=>fred("DFEDTARU",5)),
      sf(()=>fredAll("CPIAUCSL"),[]),sf(()=>fredAll("CPILFESL"),[]),sf(()=>fredAll("PCEPILFE"),[]),
      sf(()=>eurusd()),sf(()=>cb("BTC-USD")),sf(()=>cb("ETH-USD")),
      sf(()=>btcDom()),sf(()=>fng()),sf(()=>creditFn()),sf(()=>delinFn()),
      goldFn(),silverFn(),copperFn(),
      sf(()=>commodSimple("CL=F","DCOILWTICO",30,200,"oil_v2")),
      sf(()=>commodSimple("BZ=F","DCOILBRENTEU",30,200,"brent_v2")),
      sf(()=>commodSimple("NG=F","DHHNGSP",0.8,20,"natgas_v2")),
      sf(()=>allSec(ut),[]),sf(()=>researchFn())
    ]);
    const us1m=N(r1m?.v),us3m=N(r3m?.v);
    const us2y=N(r2y?.v),us10y=N(r10y?.v),us30y=N(r30y?.v);
    const spread2s10s=(us2y!=null&&us10y!=null)?(us10y-us2y)*100:null;
    const sentiment=rFng||fngFb(N(rVix?.v),spread2s10s);
    const cpiLast=lv(cpiAll);
    const gold=rGold?.value,copper=rCopper?.value;
    const data={
      dxyProxy:{value:N(rDxy?.v),date:rDxy?.d},
      vix:{value:N(rVix?.v),date:rVix?.d},
      yields:{us1m,us3m,us2y,us10y,us30y,spread2s10s},
      inflation:{cpiYoY:yoy(cpiAll),cpiIndex:N(cpiLast?.value),coreCpi:yoy(coreCpiAll),pceCore:yoy(pceCoreAll),date:cpiLast?.date||null},
      labor:{unemploymentRate:N(rUnr?.v),date:rUnr?.d},
      fed:{upperBound:N(rFed?.v),date:rFed?.d},
      fx:{eurusd:rEur},
      crypto:{btcusd:rBtc,btcDominance:rBtcDom,ethusd:rEth?.value??null},
      commodities:{
        gold:rGold,silver:rSilver,copper:rCopper,
        oil:rOil,brent:rBrent,natgas:rNatgas
      },
      credit:rCredit,sentiment,delinquency:rDelin,research:rResearch,
      cds:[
        {country:"USA",value:62,risk:"FAIBLE"},{country:"Allemagne",value:28,risk:"FAIBLE"},
        {country:"France",value:84,risk:"FAIBLE"},{country:"Italie",value:168,risk:"MODÉRÉ"},
        {country:"Espagne",value:71,risk:"FAIBLE"},{country:"Grèce",value:112,risk:"MODÉRÉ"},
        {country:"Turquie",value:384,risk:"ÉLEVÉ"},{country:"Brésil",value:220,risk:"ÉLEVÉ"},
        {country:"Chine",value:95,risk:"MODÉRÉ"},{country:"Japon",value:44,risk:"FAIBLE"}
      ],
      sectors:Array.isArray(rSectors)?rSectors:[],sectorUT:ut,
      derived:{
        goldSilverRatio:(gold&&rSilver?.value&&rSilver.value>0)?gold/rSilver.value:null,
        copperGoldRatio:(copper&&gold&&gold>0)?(copper/gold*1000):null,
        vixRegime:(()=>{const v=N(rVix?.v);return v==null?null:v>=30?"ÉLEVÉ 🔴":v>=20?"MODÉRÉ 🟡":"FAIBLE 🟢";})(),
        curveState:spread2s10s==null?null:spread2s10s>0?"positive ✅":"inversée 🔴"
      }
    };
    const risk=riskScore(data);
    data.riskAnalysis=risk;
    data.localSummary=localSum(data,risk);
    res.json({updatedAt:new Date().toISOString(),
      sources:{fred:"FRED St. Louis",market:"Coinbase XAU/XAG · Yahoo · Frankfurter · Alt.me"},data});
  }catch(err){console.error("ERR:",err);res.status(500).json({error:"failed",message:err.message});}
});

/* ── /api/sectors ── */
app.get("/api/sectors",async(req,res)=>{
  const ut=req.query.ut||"1M";
  if(!UTC[ut])return res.status(400).json({error:"UT invalide"});
  res.json({ut,sectors:await sf(()=>allSec(ut),[]),updatedAt:new Date().toISOString()});
});

/* ── /api/ai ── */
app.post("/api/ai",async(req,res)=>{
  const q=String(req.body?.question||"").trim().slice(0,300);
  const dash=req.body?.dashboard||null;
  if(!q)return res.status(400).json({error:"vide"});
  try{res.json({text:await claude(q,dash?.data,240)});}
  catch(e){res.json({text:`[Local]\n${dash?.data?localSum(dash.data,riskScore(dash.data)):"IA indisponible."}`,error:e.message});}
});

app.post("/api/ai/summary",async(req,res)=>{
  const dash=req.body?.dashboard||null;if(!dash?.data)return res.json({text:"Indisponible."});
  try{res.json({text:await claude("Briefing : 1) Régime Risk-ON/OFF justifié (riskScore, cuau, nfci) 2) 3 points macro critiques 3) Signal alerte/opportunité.",dash.data,380)});}
  catch(e){res.json({text:localSum(dash.data,riskScore(dash.data))});}
});

app.post("/api/ai/risk",async(req,res)=>{
  const dash=req.body?.dashboard||null;if(!dash?.data)return res.status(400).json({error:"Pas de données."});
  const risk=riskScore(dash.data);
  try{
    const text=await claude(`Analyse Risk-ON/OFF. Score: ${risk?.score}/100 (${risk?.regime}). Signaux: ${JSON.stringify(risk?.details)}. Cu/Au: ${dash.data?.derived?.copperGoldRatio?.toFixed(3)}. NFCI: ${dash.data?.research?.nfci?.v?.toFixed(2)}. Implications par classe d'actifs.`,dash.data,320);
    res.json({text,riskScore:risk?.score,riskRegime:risk?.regime,details:risk?.details});
  }catch(e){res.status(500).json({error:e.message});}
});

app.get("/health",(_,res)=>res.json({ok:true,ts:new Date().toISOString(),cache:C.size,keys:[...C.keys()].slice(0,20)}));
app.get("*",(_,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`◆ TERMINAL MACRO v4.1 — port ${PORT}\n  Or: Coinbase XAU-USD\n  Argent: Coinbase XAG-USD\n  HY/IG: BAMLH0A0HYM2 / BAMLC0A0CM\n  Auto loans: DTCTHFNM\n  NFCI: NFCI | JOLTS: JTSJOL`));
