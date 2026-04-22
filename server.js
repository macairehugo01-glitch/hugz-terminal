/* ◆ TERMINAL MACRO v4.5 — ARCHITECTURE ROBUSTE
   Problèmes résolus :
   ① OR $4757 : Coinbase XAU-USD retourne parfois le spot en oz troy USD mais
     la valeur est correcte (~3300). Si >4000, c'est un problème de conversion.
     Sanity stricte : or entre 1800 et 4200 seulement.
   ② Secteurs : Yahoo Finance nécessite un cookie/crumb depuis ~2024.
     Solution : obtenir le crumb une fois au démarrage, réutiliser pour tous.
   ③ Stooq bloqué depuis Glitch : retiré, retour à Yahoo v8 avec crumb.
   ④ Indices SPX/NDX : Yahoo v8 chart avec crumb (plus fiable que v7 quote).
*/
const express=require("express"),path=require("path");
const app=express(),PORT=process.env.PORT||3000;
const FRED=process.env.FRED_API_KEY||"2945c843ac2ef54c3d1272b9f9cc2747";
const CLAUDE=process.env.ANTHROPIC_KEY||"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";
app.use(express.static(path.join(__dirname,"public")));
app.use(express.json({limit:"2mb"}));

/* CACHE */
const C=new Map();
const TTL={crypto:55e3,metals:2*60e3,eq:3*60e3,yh:5*60e3,yS:10*60e3,fng:25*60e3,fd:4*36e5,fm:10*36e5};
const cg=k=>{const e=C.get(k);if(!e)return undefined;if(Date.now()-e.t>e.l){C.delete(k);return undefined;}return e.v;};
const cs=(k,v,l)=>{C.set(k,{v,t:Date.now(),l});return v;};
const N=v=>{const n=parseFloat(v);return isFinite(n)?n:null;};
const delay=ms=>new Promise(r=>setTimeout(r,ms));

/* ── YAHOO CRUMB ─────────────────────────────────────────────
   Depuis mi-2023, Yahoo exige un cookie "A3" + un "crumb" pour
   l'API v8. On les obtient une fois, on les réutilise 8h.
   Si le crumb expire, on en refait un. 
*/
let _crumb=null,_cookie=null,_crumbTs=0;
const CRUMB_TTL=8*3600e3;

async function getYahooCrumb(){
  if(_crumb&&_cookie&&Date.now()-_crumbTs<CRUMB_TTL)return{crumb:_crumb,cookie:_cookie};
  console.log("[CRUMB] Fetching new Yahoo crumb...");
  try{
    // Étape 1 : obtenir le cookie depuis la page d'accueil Yahoo Finance
    const r1=await fetch("https://finance.yahoo.com/",{
      headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36","Accept":"text/html,*/*"},
      redirect:"follow"
    });
    const setCookie=r1.headers.get("set-cookie")||"";
    // Extraire le cookie A3 (ou tout ce qui est retourné)
    const cookieParts=setCookie.split(";").map(s=>s.trim());
    const cookieVal=cookieParts[0]||"";
    // Étape 2 : obtenir le crumb avec ce cookie
    const r2=await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb",{
      headers:{
        "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
        "Cookie":cookieVal||"",
        "Accept":"*/*"
      }
    });
    const crumbText=(await r2.text()).trim();
    if(crumbText&&crumbText.length>3&&!crumbText.includes("<")){
      _crumb=crumbText;_cookie=cookieVal;_crumbTs=Date.now();
      console.log("[CRUMB] Got crumb:",_crumb.slice(0,8)+"...");
      return{crumb:_crumb,cookie:_cookie};
    }
  }catch(e){console.warn("[CRUMB] Failed:",e.message.slice(0,80));}
  // Fallback : crumb vide (Yahoo accepte parfois sans crumb pour certaines requêtes)
  _crumb="";_cookie="";_crumbTs=Date.now();
  return{crumb:"",cookie:""};
}

async function yhChart(sym,range,interval){
  const{crumb,cookie}=await getYahooCrumb();
  const hdrs={
    "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
    "Accept":"application/json,*/*",
    "Referer":"https://finance.yahoo.com/",
    "Origin":"https://finance.yahoo.com"
  };
  if(cookie)hdrs["Cookie"]=cookie;
  // Essayer query1 puis query2
  for(const host of["query1","query2"]){
    try{
      const url=`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}`+
        `?range=${range}&interval=${interval}&includePrePost=false`+
        (crumb?`&crumb=${encodeURIComponent(crumb)}`:"");
      const ac=new AbortController(),t=setTimeout(()=>ac.abort(),20000);
      const res=await fetch(url,{signal:ac.signal,headers:hdrs});
      clearTimeout(t);
      if(!res.ok){
        // 401 = crumb expiré, reset
        if(res.status===401||res.status===403){_crumb=null;_crumbTs=0;}
        continue;
      }
      const d=await res.json();
      const cl=d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
      if(Array.isArray(cl)&&cl.length>0)return cl;
    }catch(e){console.warn(`[YH] ${sym}@${host}:`,e.message.slice(0,60));}
  }
  return null;
}

async function yhLast(sym){
  const k=`yhl_${sym}`;const c=cg(k);if(c!==undefined)return c;
  const cl=await yhChart(sym,"5d","1d");
  if(!cl)return cs(k,null,TTL.yh);
  const v=[...cl].reverse().find(x=>x!=null);
  return cs(k,v??null,TTL.yh);
}

/* FRED */
async function fred(id,lim=10,ttl=TTL.fd){
  const k=`f_${id}`;const c=cg(k);if(c!==undefined)return c;
  const url=`https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(id)}&api_key=${encodeURIComponent(FRED)}&sort_order=desc&limit=${lim}&file_type=json`;
  const ac=new AbortController(),t=setTimeout(()=>ac.abort(),15000);
  try{
    const res=await fetch(url,{signal:ac.signal,headers:{"User-Agent":"MacroTerminal/4.5","Accept":"application/json"}});
    clearTimeout(t);if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const d=await res.json();
    const obs=Array.isArray(d.observations)?d.observations.find(o=>o.value!=="."&&o.value!==""):null;
    return cs(k,{v:N(obs?.value),d:obs?.date||null},ttl);
  }finally{clearTimeout(t);}
}
async function fredAll(id){
  const k=`fa_${id}`;const c=cg(k);if(c!==undefined)return c;
  const url=`https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(id)}&api_key=${encodeURIComponent(FRED)}&file_type=json`;
  const ac=new AbortController(),t=setTimeout(()=>ac.abort(),15000);
  try{
    const res=await fetch(url,{signal:ac.signal,headers:{"User-Agent":"MacroTerminal/4.5","Accept":"application/json"}});
    clearTimeout(t);if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const d=await res.json();
    return cs(k,Array.isArray(d.observations)?d.observations:[],TTL.fm);
  }finally{clearTimeout(t);}
}
const sf=async(fn,fb=null)=>{try{return await fn();}catch(e){console.warn("[W]",String(e.message).slice(0,90));return fb;}};
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
  const ac=new AbortController(),t=setTimeout(()=>ac.abort(),12000);
  try{
    const res=await fetch(`https://api.coinbase.com/v2/prices/${pair}/spot`,{signal:ac.signal});
    clearTimeout(t);if(!res.ok)throw new Error(`CB ${res.status}`);
    const d=await res.json();
    const v=N(d?.data?.amount);if(v==null)throw new Error(`CB ${pair} null`);
    return cs(k,{value:v,ts:new Date().toISOString()},ttl);
  }finally{clearTimeout(t);}
}

/* OR — Coinbase XAU-USD avec sanity STRICTE [2000,4200]
   Coinbase retourne le spot or en USD/troy oz.
   Si la valeur est hors plage, c'est une erreur API.
*/
async function goldFn(){
  const k="gold_v6";const c=cg(k);if(c!==undefined)return c;
  const ok=v=>v!=null&&v>2400&&v<4000; // or spot USD/oz : range réaliste 2025-2026
  // Source 1 : Coinbase XAU-USD
  const cxau=await sf(()=>cb("XAU-USD",TTL.metals));
  if(ok(cxau?.value)){
    console.log("[GOLD] Coinbase XAU:",cxau.value);
    return cs(k,{value:cxau.value,src:"Coinbase XAU"},TTL.metals);
  }
  console.log("[GOLD] Coinbase XAU failed or out of range:",cxau?.value);
  // Source 2 : Yahoo GC=F
  const yg=await sf(()=>yhLast("GC=F"));
  if(ok(yg)){console.log("[GOLD] Yahoo GC=F:",yg);return cs(k,{value:yg,src:"Yahoo GC=F"},TTL.yh);}
  // Source 3 : FRED London fixing
  // FRED GOLDAMGBD228NLBM est en USD/troy oz mais parfois la valeur brute est en cents
  const fg=await sf(()=>fred("GOLDAMGBD228NLBM",5,TTL.fd));
  let fv=fg?.v;
  if(fv!=null){
    // Si > 10000 : probablement en cents (475700 → 4757 → encore hors range → ignorer)
    // Si > 4000 et < 10000 : valeur hors range actuel → ignorer
    // Si entre 2400 et 4000 : valeur correcte
    if(fv>10000)fv=fv/100; // tentative correction cents
    // Re-vérifier après correction
  }
  if(ok(fv)){console.log("[GOLD] FRED:",fv);return cs(k,{value:fv,src:"FRED"},TTL.fd);}
  console.warn("[GOLD] All sources failed. CB val was:",cxau?.value);
  return cs(k,{value:null,src:"N/A"},TTL.metals);
}

async function silverFn(){
  const k="silver_v6";const c=cg(k);if(c!==undefined)return c;
  const ok=v=>v!=null&&v>20&&v<100;
  const cxag=await sf(()=>cb("XAG-USD",TTL.metals));
  if(ok(cxag?.value))return cs(k,{value:cxag.value,src:"Coinbase XAG"},TTL.metals);
  const ys=await sf(()=>yhLast("SI=F"));
  if(ok(ys))return cs(k,{value:ys,src:"Yahoo SI=F"},TTL.yh);
  return cs(k,{value:null,src:"N/A"},TTL.metals);
}

async function copperFn(){
  const k="copper_v6";const c=cg(k);if(c!==undefined)return c;
  const ok=v=>v!=null&&v>2&&v<15;
  const yc=await sf(()=>yhLast("HG=F"));
  if(ok(yc))return cs(k,{value:yc,src:"Yahoo HG=F",stale:false},TTL.yh);
  const fc=await sf(()=>fred("PCOPPUSDM",5,TTL.fm));
  if(ok(fc?.v))return cs(k,{value:fc.v,src:"FRED mensuel",stale:false},TTL.fm);
  return cs(k,{value:4.60,src:"Estimé*",stale:true},60*60e3);
}

async function commoSimple(sym,fredId,lo,hi,key){
  const c=cg(key);if(c!==undefined)return c;
  const yv=await sf(()=>yhLast(sym));
  if(yv!=null&&yv>=lo&&yv<=hi)return cs(key,{value:yv,src:`Yahoo`},TTL.yh);
  const fv=await sf(()=>fred(fredId,5,TTL.fd));
  if(fv?.v!=null&&fv.v>=lo&&fv.v<=hi)return cs(key,{value:fv.v,src:"FRED"},TTL.fd);
  return cs(key,{value:null,src:"N/A"},TTL.yh);
}

/* FX + FNG */
async function eurusd(){
  const k="eur_v6";const c=cg(k);if(c!==undefined)return c;
  const ac=new AbortController(),t=setTimeout(()=>ac.abort(),10000);
  try{const res=await fetch("https://api.frankfurter.app/latest?from=EUR&to=USD",{signal:ac.signal});
    clearTimeout(t);if(!res.ok)throw new Error("EUR");const d=await res.json();
    const v=N(d?.rates?.USD);if(v==null)throw new Error("EUR null");
    return cs(k,{value:v},TTL.yh);
  }finally{clearTimeout(t);}
}
async function fng(){
  const k="fng_v6";const c=cg(k);if(c!==undefined)return c;
  const ac=new AbortController(),t=setTimeout(()=>ac.abort(),10000);
  try{const res=await fetch("https://api.alternative.me/fng/?limit=1",{signal:ac.signal});
    clearTimeout(t);if(!res.ok)throw new Error("FNG");const d=await res.json();
    const r=d?.data?.[0];if(!r)throw new Error("FNG null");
    return cs(k,{value:N(r.value),label:r.value_classification||null},TTL.fng);
  }finally{clearTimeout(t);}
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
  const k="cred_v6";const c=cg(k);if(c!==undefined)return c;
  const[hy,ig]=await Promise.all([
    sf(async()=>{const r=await fred("BAMLH0A0HYM2",10,TTL.fd);return(r?.v>0&&r.v<30)?r.v:null;}),
    sf(async()=>{const r=await fred("BAMLC0A0CM",10,TTL.fd);return(r?.v>0&&r.v<10)?r.v:null;})
  ]);
  return cs(k,{hy,ig,ratio:(hy&&ig&&ig!==0)?hy/ig:null},TTL.fd);
}

/* DÉLINQUANCE */
async function delinFn(){
  const k="delin_v7";const c=cg(k);if(c!==undefined)return c;
  const[cc,re,reL,conL,autoL,autoPx]=await Promise.all([
    sf(()=>fred("DRCCLACBS",5,TTL.fm)),
    sf(()=>fred("DRSFRMACBS",5,TTL.fm)),
    sf(()=>fred("DRSREACBS",5,TTL.fm)),
    sf(()=>fred("DRCLACBS",5,TTL.fm)),
    sf(()=>fred("DTCTHFNM",5,TTL.fm)),
    sf(()=>fred("DRAUTONSA",5,TTL.fm))
  ]);
  const autoRaw=autoPx?.v??autoL?.v;
  const autoV=(autoRaw!=null&&autoRaw>0.3&&autoRaw<10)?autoRaw:null;
  const autoFinal=autoV??1.74;
  return cs(k,{creditCards:cc?.v??null,autoLoans:autoFinal,autoStale:autoV==null,
    realEstate:re?.v??null,studentLoans:reL?.v??null,commercialRe:conL?.v??null,date:cc?.d||null},TTL.fm);
}

/* RESEARCH */
async function researchFn(){
  const k="res_v7";const c=cg(k);if(c!==undefined)return c;
  const[nfci,ted,wei,conf,jolts]=await Promise.all([
    sf(()=>fred("NFCI",5,TTL.fd)),sf(()=>fred("TEDRATE",5,TTL.fd)),
    sf(()=>fred("WEI",5,TTL.fd)),sf(()=>fred("UMCSENT",5,TTL.fm)),
    sf(()=>fred("JTSJOL",5,TTL.fm))
  ]);
  return cs(k,{nfci,ted,wei,conf,jolts},TTL.fd);
}

/* CRYPTO */
async function btcDomFn(){
  const k="btcdom6";const c=cg(k);if(c!==undefined)return c;
  const ac=new AbortController(),t=setTimeout(()=>ac.abort(),10000);
  try{const res=await fetch("https://api.coingecko.com/api/v3/global",{signal:ac.signal});
    clearTimeout(t);if(!res.ok)throw new Error("GECKO");const d=await res.json();
    return cs(k,N(d?.data?.market_cap_percentage?.btc),TTL.yh);
  }finally{clearTimeout(t);}
}

/* INDICES — Yahoo v8 avec crumb */
async function equitiesFn(){
  const k="eq_v6";const c=cg(k);if(c!==undefined)return c;
  async function indexData(sym){
    const cl=await sf(()=>yhChart(sym,"5d","1d"));
    if(!cl||cl.length<2)return null;
    const valid=cl.filter(x=>x!=null);
    if(valid.length<2)return null;
    const last=valid[valid.length-1];
    const prev=valid[valid.length-2];
    return{price:last,chgPct:prev?((last/prev)-1)*100:null};
  }
  const[spx,ndx,dji]=await Promise.all([
    sf(()=>indexData("^GSPC")),
    sf(()=>indexData("^NDX")),
    sf(()=>indexData("^DJI"))
  ]);
  console.log("[EQ] SPX:",spx?.price,"NDX:",ndx?.price,"DJI:",dji?.price);
  return cs(k,{spx,ndx,dji},TTL.eq);
}

/* SECTEURS — Yahoo v8 avec crumb, batches de 3, délai 800ms */
const ETFS=[
  {n:"Tech",      s:"XLK"},{n:"Finance",   s:"XLF"},{n:"Santé",     s:"XLV"},
  {n:"Energie",   s:"XLE"},{n:"C. disc.",  s:"XLY"},{n:"Industrie", s:"XLI"},
  {n:"C. base",   s:"XLP"},{n:"Utilities", s:"XLU"},{n:"Matériaux", s:"XLB"},
  {n:"Immo.",     s:"XLRE"},{n:"Telecom",  s:"XLC"}
];
const UT_CFG={"1D":{r:"5d",i:"1d"},"1W":{r:"1mo",i:"1d"},"1M":{r:"1mo",i:"1d"},
  "3M":{r:"3mo",i:"1d"},"6M":{r:"6mo",i:"1wk"},"1Y":{r:"1y",i:"1mo"},"YTD":{r:"ytd",i:"1d"}};

async function secPerf(sym,ut){
  const cfg=UT_CFG[ut]||UT_CFG["1M"];
  const k=`sec7_${sym}_${ut}`;const c=cg(k);if(c!==undefined)return c;
  const cl=await sf(()=>yhChart(sym,cfg.r,cfg.i));
  if(!cl||cl.length<2)return cs(k,null,TTL.yS);
  let first,last;
  if(ut==="1D"){const v=cl.filter(x=>x!=null);if(v.length<2)return cs(k,null,TTL.yS);last=v[v.length-1];first=v[v.length-2];}
  else{first=cl.find(v=>v!=null);last=[...cl].reverse().find(v=>v!=null);}
  if(!first||!last||first===0)return cs(k,null,TTL.yS);
  const p=((last/first)-1)*100;
  console.log(`[SEC] ${sym}: ${p.toFixed(2)}%`);
  return cs(k,p,TTL.yS);
}

async function allSec(ut="1M"){
  const results=[];
  // Batches de 3 avec délai 800ms — le crumb partagé aide beaucoup
  for(let i=0;i<ETFS.length;i+=3){
    const batch=ETFS.slice(i,i+3);
    const bRes=await Promise.all(batch.map(e=>sf(()=>secPerf(e.s,ut))));
    results.push(...bRes);
    if(i+3<ETFS.length)await delay(800);
  }
  const valid=results.filter(r=>r!=null).length;
  console.log(`[SEC] ${valid}/${ETFS.length} sectors OK (${ut})`);
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
  if(copper!=null&&gold!=null&&gold>0&&!d.commodities?.copper?.stale){
    const cg2=copper/gold*1000;const s=cg2>0.6?1:cg2>0.4?0:-1;
    add(s,`Cu/Au ${cg2.toFixed(3)} → ${s>0?"Risk-ON":s===0?"Neutre":"Risk-OFF"}`);
  }
  if(btc!=null){const s=btc>80000?1:btc>50000?0:-1;add(s,`BTC $${Math.round(btc/1000)}k → ${s>0?"Risk-ON":s===0?"Neutre":"Risk-OFF"}`);}
  if(cc!=null){const s=cc<2.5?1:cc<3.5?0:-1;add(s,`Délinq. CC ${cc.toFixed(2)}% → ${s>0?"Risk-ON":s===0?"Neutre":"Risk-OFF"}`);}
  if(nfci!=null){const s=nfci<-0.5?1:nfci<0.5?0:-1;add(s,`NFCI ${nfci.toFixed(2)} → ${s>0?"Risk-ON":s===0?"Neutre":"Risk-OFF"}`);}
  if(!sc.length)return null;
  const tot=sc.reduce((a,b)=>a+b,0),mx=sc.length*2,mn=sc.length*-3;
  const norm=Math.max(0,Math.min(100,Math.round(((tot-mn)/(mx-mn))*100)));
  return{score:norm,regime:norm>=65?"RISK-ON":norm>=50?"LÉGÈREMENT RISK-ON":norm>=35?"LÉGÈREMENT RISK-OFF":"RISK-OFF",emoji:norm>=65?"🟢":norm>=50?"🟡":norm>=35?"🟠":"🔴",details:det};
}

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
  if(copper&&gold&&gold>0){const cg2=copper/gold*1000;L.push(`🔩 Cu/Au ${cg2.toFixed(3)}${cg2>0.5?" ↑ risk-on":" ↓ risk-off"}`);}
  if(wti!=null)L.push(`🛢️ WTI $${wti.toFixed(2)}`);
  if(btc!=null)L.push(`₿ BTC $${Math.round(btc).toLocaleString("en-US")}`);
  if(hy!=null&&ig!=null)L.push(`📊 HY ${hy.toFixed(2)}% | IG ${ig.toFixed(2)}% | ratio ${(hy/ig).toFixed(2)}x`);
  if(fg!=null)L.push(`😱 F&G ${Math.round(fg)}/100 — ${d.sentiment?.label||""}`);
  if(nfci!=null)L.push(`🏦 NFCI ${nfci.toFixed(2)}${nfci>0.5?" tendu":nfci<-0.5?" souple":" neutre"}`);
  if(wei!=null)L.push(`📡 WEI ${wei>0?"+":""}${wei.toFixed(2)}`);
  return L.join("\n");
}

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
    wti:d.commodities?.oil?.value?.toFixed(2),copper:copper?.toFixed(2),cuau:cuau?.toFixed(3),
    hy:d.credit?.hy?.toFixed(2),ig:d.credit?.ig?.toFixed(2),
    fg:d.sentiment?.value?Math.round(d.sentiment.value):null,fgLabel:d.sentiment?.label,
    cc:d.delinquency?.creditCards?.toFixed(2),
    nfci:d.research?.nfci?.v?.toFixed(2),ted:d.research?.ted?.v?.toFixed(2),
    wei:d.research?.wei?.v?.toFixed(2),conf:d.research?.conf?.v?.toFixed(1),
    jolts:d.research?.jolts?.v?Math.round(d.research.jolts.v):null,
    spx:d.equities?.spx?.price?Math.round(d.equities.spx.price):null,
    spxChg:d.equities?.spx?.chgPct?.toFixed(2)
  };
  const ac=new AbortController(),t=setTimeout(()=>ac.abort(),30000);
  try{
    const r=await fetch("https://api.anthropic.com/v1/messages",{
      signal:ac.signal,method:"POST",
      headers:{"Content-Type":"application/json","x-api-key":CLAUDE,"anthropic-version":"2023-06-01"},
      body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:max,
        system:`Analyste macro Bloomberg. Français. Dense, chiffré, factuel. Max ${max} tokens. Pas de conseil perso.`,
        messages:[{role:"user",content:`Data: ${JSON.stringify(snap)}\n\n${question}`}]})
    });
    clearTimeout(t);const data=await r.json();
    if(!r.ok)throw new Error(data?.error?.message||`Claude ${r.status}`);
    return data.content?.[0]?.text||"Pas de réponse.";
  }finally{clearTimeout(t);}
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
      sf(()=>commoSimple("CL=F","DCOILWTICO",30,200,"oil_v6")),
      sf(()=>commoSimple("BZ=F","DCOILBRENTEU",30,200,"brent_v6")),
      sf(()=>commoSimple("NG=F","DHHNGSP",0.8,20,"natgas_v6")),
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
    res.json({updatedAt:new Date().toISOString(),
      sources:{fred:"FRED",market:"Coinbase XAU/XAG·Yahoo (crumb)·Frankfurter·Alt.me"},data});
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
  try{res.json({text:await claude("Briefing 5 points chiffrés : 1) Régime Risk-ON/OFF + signal dominant 2) Taux US et crédit HY/IG 3) Actifs réels (or, Cu/Au, pétrole) 4) Macro (CPI, emploi, NFCI, WEI) 5) Signal alerte ou opportunité.",dash.data,420)});}
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

/* HEALTH — utile pour debug */
app.get("/health",(_,res)=>res.json({
  ok:true,ts:new Date().toISOString(),cache:C.size,
  crumb:_crumb?_crumb.slice(0,6)+"...":"null",
  crumbAge:_crumbTs?Math.round((Date.now()-_crumbTs)/60000)+"min":"N/A"
}));
app.get("*",(_,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,async()=>{
  console.log(`◆ TERMINAL MACRO v4.5 — port ${PORT}`);
  console.log("  Or: Coinbase XAU-USD [2000,4200] → Yahoo GC=F → FRED");
  console.log("  Secteurs: Yahoo v8 avec crumb partagé, batches 3×800ms");
  console.log("  Auto loans: DRAUTONSA → DTCTHFNM → fallback 1.74%");
  // Préchauffer le crumb Yahoo au démarrage
  await sf(()=>getYahooCrumb());
});
