<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>◆ Terminal Macro</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#03070e;--p:#060c18;--p2:#07101f;--p3:#080f1c;
  --b:#152030;--b2:#0c1828;--b3:#09121e;
  --tx:#ccd9ee;--mu:#4a6080;--mu2:#283848;
  --acc:#f59e0b;--acc2:#d97706;
  --g:#10b981;--g2:#059669;
  --r:#ef4444;--r2:#dc2626;
  --y:#f59e0b;--bl:#3b82f6;--tl:#14b8a6;
}
html,body{background:var(--bg);color:var(--tx);font-family:'SF Mono',Consolas,Monaco,'Courier New',monospace;font-size:11px;overflow-x:hidden}

/* ══ TOPBAR ══ */
.top{height:38px;background:var(--p);border-bottom:1px solid var(--b);display:flex;align-items:center;justify-content:space-between;padding:0 14px;position:sticky;top:0;z-index:100;box-shadow:0 2px 16px rgba(0,0,0,.6)}
.logo{color:var(--acc);font-size:14px;font-weight:700;letter-spacing:3px;text-shadow:0 0 16px rgba(245,158,11,.35)}
.lpill{display:flex;align-items:center;gap:4px;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.25);padding:2px 7px;border-radius:2px}
.ldot{width:5px;height:5px;background:var(--g);border-radius:50%;animation:gp 2s ease infinite}
@keyframes gp{0%,100%{opacity:1;box-shadow:0 0 4px var(--g)}50%{opacity:.3}}
.ltext{color:var(--g);font-size:9px;letter-spacing:1px}
.clk{color:var(--bl);font-size:11px;letter-spacing:1px;font-variant-numeric:tabular-nums}
.sess{font-size:9px;padding:2px 7px;border-radius:2px}
.s-open{background:rgba(16,185,129,.12);color:var(--g);border:1px solid rgba(16,185,129,.25)}
.s-cl{background:rgba(74,96,128,.1);color:var(--mu);border:1px solid var(--b2)}
.s-ext{background:rgba(245,158,11,.1);color:var(--y);border:1px solid rgba(245,158,11,.25)}
.top-r{display:flex;align-items:center;gap:7px}
.tbtn{background:transparent;border:1px solid var(--b);color:var(--mu);padding:3px 9px;font-size:10px;cursor:pointer;font-family:inherit;transition:all .18s;border-radius:2px}
.tbtn:hover{border-color:var(--acc);color:var(--acc)}
.tbtn.ta{border-color:var(--acc2);color:var(--acc);background:rgba(245,158,11,.07)}

/* ══ TICKER ══ */
.tkr{height:26px;background:#020407;border-bottom:1px solid var(--b2);overflow:hidden;display:flex;align-items:center;position:relative}
.tkr::before,.tkr::after{content:'';position:absolute;top:0;bottom:0;width:24px;z-index:2;pointer-events:none}
.tkr::before{left:0;background:linear-gradient(90deg,#020407,transparent)}
.tkr::after{right:0;background:linear-gradient(-90deg,#020407,transparent)}
.ttr{display:flex;white-space:nowrap;animation:sc 70s linear infinite}
.ttr:hover{animation-play-state:paused}
@keyframes sc{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
.ti{display:inline-flex;align-items:center;gap:4px;padding:0 14px;border-right:1px solid var(--b2);flex-shrink:0}
.ti-s{color:var(--mu);font-size:9px}.ti-v{color:var(--tx);font-weight:700;font-size:10px}

/* ══ SIGNAL BAR — le + important en haut ══ */
.signal-bar{
  background:var(--p2);border-bottom:1px solid var(--b);
  display:grid;grid-template-columns:280px 1fr auto;
  align-items:stretch;min-height:72px;
}
.sb-risk{padding:10px 16px;border-right:1px solid var(--b);display:flex;flex-direction:column;justify-content:center}
.sb-risk-regime{font-size:15px;font-weight:700;letter-spacing:.5px;line-height:1}
.sb-risk-sub{font-size:10px;color:var(--mu);margin-top:3px}
.sb-risk-bar{display:flex;align-items:center;gap:6px;margin-top:6px}
.sbt{flex:1;height:5px;background:var(--b);border-radius:3px;overflow:hidden}
.sbf{height:100%;border-radius:3px;transition:width .8s ease}

.sb-metrics{display:flex;align-items:center;padding:0 16px;gap:0;flex:1;overflow-x:auto;scrollbar-width:none}
.sb-metrics::-webkit-scrollbar{display:none}
.sbm{display:flex;flex-direction:column;align-items:center;padding:0 14px;border-right:1px solid var(--b2);min-width:74px;flex-shrink:0}
.sbm:last-child{border-right:none}
.sbm-l{font-size:8px;color:var(--mu);text-transform:uppercase;letter-spacing:.8px;margin-bottom:3px}
.sbm-v{font-size:14px;font-weight:700;line-height:1}
.sbm-s{font-size:8px;color:var(--mu);margin-top:2px}

.sb-ai{width:220px;padding:10px 14px;border-left:1px solid var(--b);display:flex;flex-direction:column;justify-content:space-between;background:var(--p3)}
.sb-ai-label{font-size:8px;color:var(--acc);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px}
.sb-ai-text{font-size:9px;color:#9ab8d4;line-height:1.55;flex:1}
.sb-ai-btn{background:var(--acc);border:none;color:#000;font-size:9px;font-weight:700;padding:4px 8px;cursor:pointer;font-family:inherit;border-radius:2px;margin-top:5px;width:100%;transition:background .18s;text-align:center}
.sb-ai-btn:hover{background:var(--acc2)}

/* ══ ALERT BAR ══ */
.abar{height:26px;background:rgba(2,4,8,.9);border-bottom:1px solid var(--b2);display:flex;align-items:center;gap:5px;padding:0 14px;overflow-x:auto;scrollbar-width:none}
.abar::-webkit-scrollbar{display:none}
.abl{color:var(--acc);font-size:9px;letter-spacing:1.5px;flex-shrink:0}
.ac{display:inline-flex;align-items:center;padding:1px 7px;border-radius:2px;border:1px solid;font-size:9px;flex-shrink:0;white-space:nowrap}
.ac-r{background:rgba(239,68,68,.07);border-color:rgba(239,68,68,.28);color:#fca5a5}
.ac-y{background:rgba(245,158,11,.07);border-color:rgba(245,158,11,.28);color:#fcd34d}
.ac-g{background:rgba(16,185,129,.07);border-color:rgba(16,185,129,.28);color:#6ee7b7}
.ac-b{background:rgba(59,130,246,.07);border-color:rgba(59,130,246,.28);color:#93c5fd}

/* ══ BODY GRID — 4 colonnes ══ */
.body-grid{
  display:grid;
  grid-template-columns:220px 1fr 1fr 240px;
  grid-template-rows:auto auto auto;
  gap:1px;background:var(--b2);
  min-height:calc(100vh - 162px);
}

/* Panels */
.panel{background:var(--p);padding:10px 12px}
.panel.col-left{grid-column:1;grid-row:1/4;background:var(--p)}
.panel.col-right{grid-column:4;grid-row:1/4;background:var(--p)}
.ph{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--b2)}
.ph-t{font-size:9px;letter-spacing:1.8px;text-transform:uppercase;color:var(--acc);font-weight:600}
.ph-s{font-size:8px;color:var(--mu)}

/* Data rows */
.dr{display:flex;justify-content:space-between;align-items:center;padding:3.5px 0;border-bottom:1px solid var(--b2)}
.dr:last-child{border-bottom:none}
.dl{color:#5a7898;font-size:10px}
.dv{font-weight:700;font-size:10px;color:var(--tx)}
.sep{height:1px;background:var(--b2);margin:6px 0}

/* Héros */
.hpair{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:8px}
.htri{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-bottom:8px}
.hero{background:var(--p2);border:1px solid var(--b);padding:7px 9px;border-radius:2px}
.hero-l{font-size:7px;color:var(--mu);text-transform:uppercase;letter-spacing:.8px;margin-bottom:3px}
.hero-v{font-size:18px;font-weight:700;letter-spacing:-.5px;line-height:1}
.hero-s{font-size:9px;color:var(--mu);margin-top:2px}

/* Colors */
.g{color:var(--g)}.r{color:var(--r)}.y{color:var(--y)}.b{color:var(--bl)}.t{color:var(--tl)}.mu{color:var(--mu)}

/* Yield curve */
.ys{width:100%;height:70px;display:block;margin-bottom:6px}

/* Gauges */
.gr{display:flex;align-items:center;gap:6px;padding:3px 0}
.gl{width:86px;color:#5a7898;font-size:9px;flex-shrink:0}
.gt{flex:1;height:4px;background:var(--b);border-radius:2px;overflow:hidden}
.gf{height:100%;border-radius:2px;transition:width .8s ease}
.gv{width:38px;text-align:right;font-weight:700;font-size:10px;flex-shrink:0}

/* Risk details dans sidebar */
.rdet{display:flex;justify-content:space-between;font-size:9px;padding:2px 0;border-bottom:1px solid var(--b2)}
.rdet:last-child{border-bottom:none}
.rdi{color:#5a7898}.rds{font-weight:700}

/* Secteurs */
.utbar{display:flex;gap:3px;margin-bottom:7px;flex-wrap:wrap}
.ubtn{background:transparent;border:1px solid var(--b);color:var(--mu);padding:2px 7px;font-size:9px;cursor:pointer;font-family:inherit;transition:all .15s;border-radius:2px}
.ubtn:hover,.ubtn.active{border-color:var(--acc);color:var(--acc);background:rgba(245,158,11,.07)}
.sec-g{display:grid;grid-template-columns:1fr 1fr;gap:0 10px}
.secr{display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid var(--b2)}
.secr:last-child{border-bottom:none}
.secn{width:62px;color:#5a7898;font-size:9px;flex-shrink:0}
.secb{flex:1;height:3px;background:var(--b);border-radius:2px;overflow:hidden}
.secf{height:100%;border-radius:2px;transition:width .6s ease}
.secv{width:42px;text-align:right;font-weight:700;font-size:10px;flex-shrink:0}

/* Research cards — horizontal dans la grille */
.rcs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:6px}
.rc{background:var(--p2);border:1px solid var(--b);border-radius:2px;padding:8px 10px;position:relative;overflow:hidden}
.rc::before{content:'';position:absolute;top:0;left:0;right:0;height:2px}
.rc-g::before{background:var(--g)}.rc-r::before{background:var(--r)}.rc-y::before{background:var(--y)}.rc-b::before{background:var(--bl)}.rc-t::before{background:var(--tl)}.rc-n::before{background:var(--mu)}
.rc-l{font-size:8px;color:var(--mu);text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px}
.rc-v{font-size:18px;font-weight:700;letter-spacing:-.3px}
.rc-s{font-size:9px;color:var(--mu);margin-top:2px;line-height:1.35}
.rc-bar{height:2px;background:var(--b);border-radius:2px;overflow:hidden;margin-top:5px}
.rc-bf{height:100%;border-radius:2px;transition:width .8s ease}

/* FG */
.fgw{display:flex;align-items:center;gap:10px;margin-bottom:8px}

/* CDS */
.cds-r{display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid var(--b2)}
.cds-r:last-child{border-bottom:none}
.cds-c{color:#5a7898;font-size:10px}.cds-v{font-weight:700;font-size:10px}
.cds-t{font-size:8px;padding:1px 5px;border-radius:1px;border:1px solid}
.ct-l{color:var(--g);border-color:rgba(16,185,129,.35)}
.ct-m{color:var(--y);border-color:rgba(245,158,11,.35)}
.ct-h{color:var(--r);border-color:rgba(239,68,68,.35)}

/* AI panel */
.aiout{background:var(--p2);border:1px solid var(--b);border-left:2px solid var(--acc);border-radius:0 2px 2px 0;padding:9px 10px;font-size:10px;line-height:1.72;color:#aac4dc;min-height:72px;white-space:pre-wrap;margin-bottom:7px}
.airow{display:flex;gap:5px;margin-bottom:6px}
.aiinp{flex:1;background:#020407;border:1px solid var(--b);color:var(--tx);padding:6px 9px;font-family:inherit;font-size:10px;outline:none;border-radius:2px}
.aiinp:focus{border-color:var(--acc)}
.aibtn{background:var(--acc);border:none;color:#000;padding:6px 12px;cursor:pointer;font-family:inherit;font-size:10px;font-weight:700;border-radius:2px;white-space:nowrap;transition:background .18s}
.aibtn:hover{background:var(--acc2)}.aibtn:disabled{opacity:.4;cursor:not-allowed}
.qrow{display:flex;gap:3px;flex-wrap:wrap}
.qb{background:transparent;border:1px solid var(--b);color:var(--mu);padding:2px 6px;font-size:9px;cursor:pointer;font-family:inherit;transition:all .15s;border-radius:2px}
.qb:hover{border-color:var(--acc);color:var(--acc)}
.ql{border-color:rgba(16,185,129,.35);color:var(--g)}
.ql:hover{background:rgba(16,185,129,.07)}
.tokinfo{font-size:8px;color:var(--mu2);text-align:right;margin-top:3px}

/* MORNING */
#morning{position:fixed;inset:0;z-index:200;background:rgba(2,4,8,.96);display:flex;align-items:center;justify-content:center;animation:fi .3s ease}
@keyframes fi{from{opacity:0}to{opacity:1}}
.mcard{width:min(680px,95vw);background:var(--p);border:1px solid var(--acc);border-radius:3px;box-shadow:0 0 60px rgba(245,158,11,.12)}
.mhead{background:#050d1c;border-bottom:1px solid var(--acc);padding:14px 18px;display:flex;justify-content:space-between;align-items:center}
.mh1{color:var(--acc);font-size:13px;letter-spacing:2.5px;font-weight:700}
.mh2{color:var(--mu);font-size:9px;margin-top:2px}
.mbody{padding:16px 18px;max-height:72vh;overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--b2) transparent}

/* Morning KPIs en grille 3x2 */
.mkpis{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:14px}
.mkpi{background:var(--p2);border:1px solid var(--b);border-radius:2px;padding:7px 9px}
.mkpi-l{font-size:8px;color:var(--mu);text-transform:uppercase;letter-spacing:.8px;margin-bottom:3px}
.mkpi-v{font-size:16px;font-weight:700}
.mkpi-s{font-size:8px;color:var(--mu);margin-top:2px}

/* Morning summary — structuré */
.msumm{background:var(--p2);border:1px solid var(--b);border-left:2px solid var(--acc);border-radius:0 2px 2px 0;padding:10px 12px;font-size:10px;line-height:1.75;color:#aac4dc;white-space:pre-wrap;margin-bottom:10px}
.malerts{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px}
.mfooter{padding:12px 18px;border-top:1px solid var(--b2)}
.mclose{background:var(--acc);border:none;color:#000;padding:9px 0;font-family:inherit;font-size:11px;font-weight:700;cursor:pointer;width:100%;border-radius:2px;letter-spacing:1px;transition:background .18s}
.mclose:hover{background:var(--acc2)}

.spin{display:inline-block;width:9px;height:9px;border:1.5px solid var(--b);border-top-color:var(--acc);border-radius:50%;animation:sp .7s linear infinite;margin-right:5px;vertical-align:middle}
@keyframes sp{to{transform:rotate(360deg)}}
.skel{color:var(--mu2);animation:sk .8s ease infinite}
@keyframes sk{0%,100%{opacity:.4}50%{opacity:.8}}

/* FOOTER */
.footer{background:var(--p);border-top:1px solid var(--b);padding:5px 14px;font-size:9px;color:var(--mu);display:flex;justify-content:space-between}

::-webkit-scrollbar{width:3px;height:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--b);border-radius:2px}

@media(max-width:1300px){
  .body-grid{grid-template-columns:200px 1fr 1fr 220px}
  .rcs{grid-template-columns:1fr 1fr}
  .signal-bar{grid-template-columns:240px 1fr auto}
  .sb-ai{width:180px}
}
@media(max-width:900px){
  .body-grid{grid-template-columns:1fr}
  .panel.col-left,.panel.col-right{grid-column:1;grid-row:auto}
  .signal-bar{grid-template-columns:1fr}
  .sb-ai{width:100%;border-left:none;border-top:1px solid var(--b)}
}
</style>
</head>
<body>

<!-- MORNING MODAL -->
<div id="morning">
 <div class="mcard">
  <div class="mhead">
   <div><div class="mh1">◆ BRIEFING D'OUVERTURE</div><div class="mh2" id="m-date">--</div></div>
   <div class="lpill"><span class="ldot"></span><span class="ltext">LIVE</span></div>
  </div>
  <div class="mbody">
   <!-- KPIs clés -->
   <div class="mkpis">
    <div class="mkpi"><div class="mkpi-l">VIX</div><div class="mkpi-v skel" id="mk-vix">--</div><div class="mkpi-s" id="mk-vix-s">--</div></div>
    <div class="mkpi"><div class="mkpi-l">Gold XAU</div><div class="mkpi-v y skel" id="mk-gold">--</div><div class="mkpi-s">Coinbase XAU</div></div>
    <div class="mkpi"><div class="mkpi-l">BTC</div><div class="mkpi-v g skel" id="mk-btc">--</div><div class="mkpi-s">Coinbase</div></div>
    <div class="mkpi"><div class="mkpi-l">US10Y</div><div class="mkpi-v skel" id="mk-10y">--</div><div class="mkpi-s">FRED</div></div>
    <div class="mkpi"><div class="mkpi-l">Cu/Au</div><div class="mkpi-v t skel" id="mk-cuau">--</div><div class="mkpi-s">baromètre macro</div></div>
    <div class="mkpi"><div class="mkpi-l">DXY</div><div class="mkpi-v skel" id="mk-dxy">--</div><div class="mkpi-s">dollar index</div></div>
   </div>
   <!-- Alertes -->
   <div class="malerts" id="m-alerts"></div>
   <!-- Analyse IA structurée -->
   <div style="font-size:8px;color:var(--acc);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:6px">🤖 Analyse IA — Claude Haiku</div>
   <div class="msumm" id="m-ai"><span class="spin"></span>Analyse en cours...</div>
  </div>
  <div class="mfooter"><button class="mclose" onclick="closeMorning()">OUVRIR LE TERMINAL →</button></div>
 </div>
</div>

<!-- TOPBAR -->
<div class="top">
 <div style="display:flex;align-items:center;gap:10px">
  <span class="logo">◆ TERMINAL</span>
  <div class="lpill"><span class="ldot"></span><span class="ltext">LIVE</span></div>
  <span class="clk" id="clock">--:--:-- NY</span>
  <span id="sess" class="sess s-cl">--</span>
 </div>
 <div class="top-r">
  <span style="font-size:8px;color:var(--mu)">CB XAU/XAG · YAHOO · FRED · ALT.ME</span>
  <button class="tbtn ta" onclick="showMorning()">☀ BRIEFING</button>
  <button class="tbtn" onclick="loadDash()">⟳</button>
  <span style="font-size:9px;color:var(--mu2)" id="lupd">--</span>
 </div>
</div>

<!-- TICKER -->
<div class="tkr">
 <div class="ttr">
  <div class="ti"><span class="ti-s">GOLD</span><span class="ti-v" id="tk-gold">--</span></div>
  <div class="ti"><span class="ti-s">SILVER</span><span class="ti-v" id="tk-ag">--</span></div>
  <div class="ti"><span class="ti-s">BTC</span><span class="ti-v" id="tk-btc">--</span></div>
  <div class="ti"><span class="ti-s">WTI</span><span class="ti-v" id="tk-wti">--</span></div>
  <div class="ti"><span class="ti-s">Cu/Au</span><span class="ti-v" id="tk-ca">--</span></div>
  <div class="ti"><span class="ti-s">DXY</span><span class="ti-v" id="tk-dxy">--</span></div>
  <div class="ti"><span class="ti-s">VIX</span><span class="ti-v" id="tk-vix">--</span></div>
  <div class="ti"><span class="ti-s">US2Y</span><span class="ti-v" id="tk-2y">--</span></div>
  <div class="ti"><span class="ti-s">US10Y</span><span class="ti-v" id="tk-10y">--</span></div>
  <div class="ti"><span class="ti-s">2s10s</span><span class="ti-v" id="tk-sp">--</span></div>
  <div class="ti"><span class="ti-s">HY OAS</span><span class="ti-v" id="tk-hy">--</span></div>
  <div class="ti"><span class="ti-s">NFCI</span><span class="ti-v" id="tk-nfci">--</span></div>
  <div class="ti"><span class="ti-s">CPI</span><span class="ti-v" id="tk-cpi">--</span></div>
  <!-- dup -->
  <div class="ti"><span class="ti-s">GOLD</span><span class="ti-v" id="tk-gold2">--</span></div>
  <div class="ti"><span class="ti-s">SILVER</span><span class="ti-v" id="tk-ag2">--</span></div>
  <div class="ti"><span class="ti-s">BTC</span><span class="ti-v" id="tk-btc2">--</span></div>
  <div class="ti"><span class="ti-s">WTI</span><span class="ti-v" id="tk-wti2">--</span></div>
  <div class="ti"><span class="ti-s">Cu/Au</span><span class="ti-v" id="tk-ca2">--</span></div>
  <div class="ti"><span class="ti-s">DXY</span><span class="ti-v" id="tk-dxy2">--</span></div>
  <div class="ti"><span class="ti-s">VIX</span><span class="ti-v" id="tk-vix2">--</span></div>
  <div class="ti"><span class="ti-s">US2Y</span><span class="ti-v" id="tk-2y2">--</span></div>
  <div class="ti"><span class="ti-s">US10Y</span><span class="ti-v" id="tk-10y2">--</span></div>
  <div class="ti"><span class="ti-s">2s10s</span><span class="ti-v" id="tk-sp2">--</span></div>
  <div class="ti"><span class="ti-s">HY OAS</span><span class="ti-v" id="tk-hy2">--</span></div>
  <div class="ti"><span class="ti-s">NFCI</span><span class="ti-v" id="tk-nfci2">--</span></div>
  <div class="ti"><span class="ti-s">CPI</span><span class="ti-v" id="tk-cpi2">--</span></div>
 </div>
</div>

<!-- ═══ SIGNAL BAR — Zone 1 : le résumé du marché en 1 ligne ═══ -->
<div class="signal-bar">
 <!-- Risk-ON/OFF — 1 seul affichage ici -->
 <div class="sb-risk">
  <div class="sb-risk-regime" id="sb-regime">CALCUL...</div>
  <div class="sb-risk-sub" id="sb-sub">Score -- / 100</div>
  <div class="sb-risk-bar">
   <span style="font-size:8px;color:var(--r)">OFF</span>
   <div class="sbt"><div class="sbf" id="sb-bar" style="width:0%"></div></div>
   <span style="font-size:8px;color:var(--g)">ON</span>
   <span style="font-size:10px;font-weight:700;width:28px;text-align:right;color:var(--mu)" id="sb-num">--</span>
  </div>
 </div>

 <!-- Métriques clés sur 1 ligne -->
 <div class="sb-metrics">
  <div class="sbm"><div class="sbm-l">VIX</div><div class="sbm-v" id="sb-vix">--</div><div class="sbm-s" id="sb-vix-s">--</div></div>
  <div class="sbm"><div class="sbm-l">DXY</div><div class="sbm-v" id="sb-dxy">--</div><div class="sbm-s" id="sb-dxy-s">dollar</div></div>
  <div class="sbm"><div class="sbm-l">GOLD</div><div class="sbm-v y" id="sb-gold">--</div><div class="sbm-s" id="sb-gold-s">XAU/oz</div></div>
  <div class="sbm"><div class="sbm-l">2s10s</div><div class="sbm-v" id="sb-sp">--</div><div class="sbm-s" id="sb-sp-s">courbe</div></div>
  <div class="sbm"><div class="sbm-l">HY OAS</div><div class="sbm-v" id="sb-hy">--</div><div class="sbm-s">crédit</div></div>
  <div class="sbm"><div class="sbm-l">Cu/Au</div><div class="sbm-v t" id="sb-ca">--</div><div class="sbm-s" id="sb-ca-s">baromètre</div></div>
  <div class="sbm"><div class="sbm-l">NFCI</div><div class="sbm-v" id="sb-nfci">--</div><div class="sbm-s" id="sb-nfci-s">cond. fin.</div></div>
  <div class="sbm"><div class="sbm-l">F&G</div><div class="sbm-v" id="sb-fg">--</div><div class="sbm-s" id="sb-fg-s">sentiment</div></div>
  <div class="sbm"><div class="sbm-l">CPI</div><div class="sbm-v y" id="sb-cpi">--</div><div class="sbm-s">inflation</div></div>
  <div class="sbm"><div class="sbm-l">WEI</div><div class="sbm-v" id="sb-wei">--</div><div class="sbm-s">activité</div></div>
 </div>

 <!-- Mini AI summary -->
 <div class="sb-ai">
  <div>
   <div class="sb-ai-label">◆ Résumé IA</div>
   <div class="sb-ai-text" id="sb-aisumm">Chargement...</div>
  </div>
  <button class="sb-ai-btn" onclick="showMorning()">BRIEFING COMPLET →</button>
 </div>
</div>

<!-- ALERT BAR -->
<div class="abar"><span class="abl">⚡</span><span id="alert-items"></span></div>

<!-- ═══ BODY GRID — Zone 2 : données détaillées ═══ -->
<div class="body-grid">

 <!-- COL GAUCHE : Taux + Crédit + Délinquance + CDS -->
 <div class="panel col-left" style="overflow-y:auto;max-height:calc(100vh - 200px)">

  <div class="ph"><span class="ph-t">Taux US</span><span class="ph-s">FRED</span></div>
  <svg class="ys" viewBox="0 0 240 70">
   <line x1="0" y1="58" x2="240" y2="58" stroke="var(--b2)" stroke-width=".7"/>
   <line x1="0" y1="40" x2="240" y2="40" stroke="var(--b2)" stroke-width=".7"/>
   <line x1="0" y1="22" x2="240" y2="22" stroke="var(--b2)" stroke-width=".7"/>
   <polyline fill="none" stroke="var(--mu2)" stroke-width="1" stroke-dasharray="3,2" points="8,54 32,46 58,36 84,30 110,24 148,22 190,20 232,19"/>
   <polyline fill="none" stroke="var(--g)" stroke-width="2" id="ypoly" points="8,46 32,50 58,51 84,49 110,43 148,38 190,34 232,32"/>
   <text x="6" y="68" fill="var(--mu2)" font-size="7">1M</text>
   <text x="28" y="68" fill="var(--mu2)" font-size="7">3M</text>
   <text x="54" y="68" fill="var(--mu2)" font-size="7">2A</text>
   <text x="106" y="68" fill="var(--mu2)" font-size="7">5A</text>
   <text x="186" y="68" fill="var(--mu2)" font-size="7">10A</text>
   <text x="224" y="68" fill="var(--mu2)" font-size="7">30A</text>
  </svg>
  <div class="dr"><span class="dl">1 mois</span><span class="dv" id="us1m">--</span></div>
  <div class="dr"><span class="dl">2 ans</span><span class="dv" id="us2y">--</span></div>
  <div class="dr"><span class="dl">10 ans</span><span class="dv" id="us10y">--</span></div>
  <div class="dr"><span class="dl">30 ans</span><span class="dv" id="us30y">--</span></div>
  <div class="dr"><span class="dl">Spread 2s10s</span><span class="dv" id="sp-val">--</span></div>
  <div class="dr"><span class="dl">État courbe</span><span class="dv" id="c-state">--</span></div>
  <div class="dr"><span class="dl">Fed Funds</span><span class="dv" id="fed">--</span></div>

  <div class="sep"></div>
  <div class="ph" style="margin-bottom:6px"><span class="ph-t">Crédit</span><span class="ph-s">FRED BAML</span></div>
  <div class="dr"><span class="dl">HY Spread OAS %</span><span class="dv" id="hy-v">--</span></div>
  <div class="dr"><span class="dl">IG Spread OAS %</span><span class="dv" id="ig-v">--</span></div>
  <div class="dr"><span class="dl">Ratio HY/IG</span><span class="dv" id="cr-ratio">--</span></div>
  <div class="dr"><span class="dl">EUR/USD</span><span class="dv" id="eurusd">--</span></div>

  <div class="sep"></div>
  <div class="ph" style="margin-bottom:6px"><span class="ph-t">Délinquance</span><span class="ph-s">FRED</span></div>
  <div class="gr"><span class="gl">Cartes crédit</span><div class="gt"><div class="gf" id="g-cc" style="background:var(--r);width:0%"></div></div><span class="gv r" id="gv-cc">--</span></div>
  <div class="gr"><span class="gl">Auto loans</span><div class="gt"><div class="gf" id="g-au" style="background:var(--y);width:0%"></div></div><span class="gv y" id="gv-au">--</span></div>
  <div class="gr"><span class="gl">Immo rés.</span><div class="gt"><div class="gf" id="g-re" style="background:var(--g);width:0%"></div></div><span class="gv g" id="gv-re">--</span></div>
  <div class="gr"><span class="gl">Real est. loans</span><div class="gt"><div class="gf" id="g-rl" style="background:var(--r);width:0%"></div></div><span class="gv r" id="gv-rl">--</span></div>
  <div class="gr"><span class="gl">Consumer loans</span><div class="gt"><div class="gf" id="g-cl" style="background:var(--y);width:0%"></div></div><span class="gv y" id="gv-cl">--</span></div>
  <div class="dr" style="margin-top:4px"><span class="dl">Chômage</span><span class="dv" id="unrate">--</span></div>

  <div class="sep"></div>
  <div class="ph" style="margin-bottom:6px"><span class="ph-t">CDS Souverains</span><span class="ph-s">5A</span></div>
  <div id="cds-w"></div>
 </div>

 <!-- COL 2 : Or / Refuges + Inflation + Risk details -->
 <div style="display:flex;flex-direction:column;gap:1px;background:var(--b2)">

  <!-- Or & refuges -->
  <div class="panel">
   <div class="ph"><span class="ph-t">Or & Refuges</span><span class="ph-s">Coinbase XAU/XAG</span></div>
   <div class="hpair">
    <div class="hero"><div class="hero-l">GOLD XAU/USD</div><div class="hero-v y" id="gold-big">--</div><div class="hero-s" id="gold-src">Coinbase XAU</div></div>
    <div class="hero"><div class="hero-l">BTC/USD</div><div class="hero-v g" id="btc-big">--</div><div class="hero-s" id="btc-ts">Coinbase</div></div>
   </div>
   <div class="dr"><span class="dl">Silver XAG/USD</span><span class="dv" id="ag-v">--</span></div>
   <div class="dr"><span class="dl">Gold/Silver Ratio</span><span class="dv" id="gsr">--</span></div>
   <div class="dr"><span class="dl">ETH/USD</span><span class="dv" id="eth-v">--</span></div>
   <div class="dr"><span class="dl">BTC Dominance</span><span class="dv" id="btcd">--</span></div>
  </div>

  <!-- Inflation -->
  <div class="panel">
   <div class="ph"><span class="ph-t">Inflation USA</span><span class="ph-s" id="cpi-date">FRED</span></div>
   <div class="htri">
    <div class="hero"><div class="hero-l" style="font-size:7px">CPI YOY</div><div class="hero-v y" id="cpi-v" style="font-size:16px">--</div></div>
    <div class="hero"><div class="hero-l" style="font-size:7px">CORE CPI</div><div class="hero-v y" id="core-cpi" style="font-size:16px">--</div></div>
    <div class="hero"><div class="hero-l" style="font-size:7px">PCE CORE</div><div class="hero-v y" id="pce-core" style="font-size:16px">--</div></div>
   </div>
   <div class="dr"><span class="dl">Conf. U. Michigan</span><span class="dv" id="conf-v">--</span></div>
   <div class="dr"><span class="dl">JOLTS emploi (k)</span><span class="dv" id="jolts-v">--</span></div>
  </div>

  <!-- Risk signals details -->
  <div class="panel" style="flex:1">
   <div class="ph"><span class="ph-t">Signaux Risk-ON/OFF</span><span class="ph-s" id="risk-score-txt">-- signaux</span></div>
   <div id="risk-dets" style="font-size:9px"></div>
   <button class="qb ql" style="margin-top:8px;width:100%;padding:4px;text-align:center;font-size:9px" onclick="askRisk()">◆ Analyse détaillée IA ↗</button>
  </div>
 </div>

 <!-- COL 3 : Commodités + Research + Secteurs -->
 <div style="display:flex;flex-direction:column;gap:1px;background:var(--b2)">

  <!-- Commodités -->
  <div class="panel">
   <div class="ph"><span class="ph-t">Commodités</span><span class="ph-s">Yahoo · FRED</span></div>
   <div class="hpair">
    <div class="hero"><div class="hero-l">WTI $/bbl</div><div class="hero-v" id="wti-big">--</div><div class="hero-s" id="wti-src">--</div></div>
    <div class="hero"><div class="hero-l">Cuivre $/lb</div><div class="hero-v t" id="cu-big">--</div><div class="hero-s" id="cu-src">--</div></div>
   </div>
   <div class="dr"><span class="dl">Brent $/bbl</span><span class="dv" id="brent-v">--</span></div>
   <div class="dr"><span class="dl">Nat. Gas $/MMBtu</span><span class="dv" id="gas-v">--</span></div>
   <div class="dr"><span class="dl">Cu/Au Ratio</span><span class="dv t" id="ca-v">--</span></div>
   <div class="dr"><span class="dl">G/S Ratio</span><span class="dv" id="gs-v">--</span></div>
  </div>

  <!-- Research compact -->
  <div class="panel">
   <div class="ph"><span class="ph-t">Indicateurs Research</span><span class="ph-s">FRED</span></div>
   <div class="rcs" style="grid-template-columns:1fr 1fr 1fr">
    <div class="rc rc-n" id="rc-nfci"><div class="rc-l">🏦 NFCI</div><div class="rc-v" id="r-nfci">--</div><div class="rc-s" id="r-nfci-s">cond. fin.</div></div>
    <div class="rc rc-n" id="rc-ted"><div class="rc-l">💧 TED</div><div class="rc-v" id="r-ted">--</div><div class="rc-s" id="r-ted-s">interbancaire</div></div>
    <div class="rc rc-n" id="rc-wei"><div class="rc-l">📡 WEI</div><div class="rc-v" id="r-wei">--</div><div class="rc-s" id="r-wei-s">activité</div></div>
   </div>
   <div class="dr"><span class="dl">🏦 NFCI</span><span class="dv" id="nfci-v">--</span></div>
   <div class="dr"><span class="dl">💧 TED Spread %</span><span class="dv" id="ted-v">--</span></div>
   <div class="dr"><span class="dl">📡 WEI (NY Fed)</span><span class="dv" id="wei-v">--</span></div>
   <div class="dr"><span class="dl">👤 Conf. Michigan</span><span class="dv" id="conf-v2">--</span></div>
   <div class="dr"><span class="dl">💼 JOLTS (k)</span><span class="dv" id="jolts-v2">--</span></div>
  </div>

  <!-- Secteurs -->
  <div class="panel" style="flex:1">
   <div class="ph"><span class="ph-t">Secteurs S&P 500</span><span class="ph-s" id="sec-tag">1M · ETFs XL*</span></div>
   <div class="utbar">
    <button class="ubtn" data-ut="1D" onclick="changeUT('1D')">1J</button>
    <button class="ubtn" data-ut="1W" onclick="changeUT('1W')">1S</button>
    <button class="ubtn active" data-ut="1M" onclick="changeUT('1M')">1M</button>
    <button class="ubtn" data-ut="3M" onclick="changeUT('3M')">3M</button>
    <button class="ubtn" data-ut="6M" onclick="changeUT('6M')">6M</button>
    <button class="ubtn" data-ut="1Y" onclick="changeUT('1Y')">1A</button>
    <button class="ubtn" data-ut="YTD" onclick="changeUT('YTD')">YTD</button>
   </div>
   <div id="sec-w"><div class="skel" style="font-size:10px;padding:6px 0">Chargement...</div></div>
  </div>
 </div>

 <!-- COL DROITE : FG + Sentiment + AI complet -->
 <div class="panel col-right" style="overflow-y:auto;max-height:calc(100vh - 200px)">

  <!-- Fear & Greed -->
  <div class="ph"><span class="ph-t">Sentiment</span><span class="ph-s">Alt.me</span></div>
  <div class="fgw">
   <svg viewBox="0 0 90 56" style="width:86px;height:56px;flex-shrink:0">
    <path d="M8,50 A37,37 0 0,1 82,50" fill="none" stroke="var(--b)" stroke-width="10"/>
    <path d="M8,50 A37,37 0 0,1 82,50" fill="none" stroke="url(#fgg)" stroke-width="10"/>
    <defs><linearGradient id="fgg" x1="0%" y1="0%" x2="100%" y2="0%">
     <stop offset="0%" stop-color="#ef4444"/><stop offset="30%" stop-color="#f59e0b"/>
     <stop offset="70%" stop-color="#84cc16"/><stop offset="100%" stop-color="#10b981"/>
    </linearGradient></defs>
    <line id="fgn" x1="45" y1="50" x2="20" y2="26" stroke="white" stroke-width="2" stroke-linecap="round"/>
    <circle cx="45" cy="50" r="4" fill="white"/>
    <text id="fgnum" x="45" y="40" text-anchor="middle" fill="var(--y)" font-size="12" font-weight="700">--</text>
    <text id="fglbl" x="45" y="49" text-anchor="middle" fill="var(--y)" font-size="5">--</text>
   </svg>
   <div style="flex:1">
    <div class="dr"><span class="dl">Score</span><span class="dv" id="fg-inline">--</span></div>
    <div class="dr"><span class="dl">Niveau</span><span class="dv" id="fg-lbl">--</span></div>
   </div>
  </div>

  <div class="sep"></div>
  <div class="ph" style="margin-bottom:6px"><span class="ph-t">Risque & FX</span></div>
  <div class="dr"><span class="dl">DXY Proxy</span><span class="dv" id="dxy-v">--</span></div>
  <div class="dr"><span class="dl">VIX CBOE</span><span class="dv" id="vix-v">--</span></div>
  <div class="dr"><span class="dl">Régime VIX</span><span class="dv" id="vix-reg">--</span></div>
  <div class="dr"><span class="dl">EUR/USD</span><span class="dv" id="eurusd2">--</span></div>

  <div class="sep"></div>
  <!-- AI Panel -->
  <div class="ph"><span class="ph-t">Analyse IA</span><span class="ph-s">Claude Haiku</span></div>
  <div class="aiout" id="aiout">Initialisation...</div>
  <div class="airow">
   <input id="aiinp" class="aiinp" placeholder="Question macro..." maxlength="280"/>
   <button id="aibtn" class="aibtn" onclick="sendAI()">↗</button>
  </div>
  <div class="qrow" style="margin-bottom:4px">
   <button class="qb ql" onclick="sendRisk()">⚡ Risk ?</button>
   <button class="qb" onclick="qa('Cu/Au et NFCI : régime macro actuel')">Cu/Au ↗</button>
   <button class="qb" onclick="qa('Taux 2A/10A et crédit HY : implications')">Taux ↗</button>
  </div>
  <div class="qrow">
   <button class="qb" onclick="qa('Risque récession : 2s10s, WEI, JOLTS')">Récession ↗</button>
   <button class="qb" onclick="qa('Or vs dollar : dynamique actuelle')">Or/DXY ↗</button>
  </div>
  <div class="tokinfo" id="tokinfo">Haiku ~$0.001/analyse</div>
 </div>

</div>

<div class="footer">
 <span id="fstatus">Initialisation...</span>
 <span>Or: Coinbase XAU → Yahoo → FRED · Auto: DTCTHFNM · HY: BAMLH0A0HYM2 · v4.2</span>
</div>

<script>
"use strict";
let dash=null,curUT="1M",aiN=0;
const DAY=`mac_v42_${new Date().toDateString()}`;
const UTL={"1D":"1J","1W":"1S","1M":"1M","3M":"3M","6M":"6M","1Y":"1A","YTD":"YTD"};

const $=id=>document.getElementById(id);
function set(id,v){const e=$(id);if(e)e.textContent=(v??'--');}
function fmt(v,d=2){if(v==null||isNaN(+v))return'--';return(+v).toLocaleString('fr-FR',{minimumFractionDigits:d,maximumFractionDigits:d});}
function fP(v,d=2){return v==null?'--':fmt(v,d)+'%';}
function fPb(v){return v==null?'--':(v>0?'+':'')+fmt(v,0)+' pb';}
function fU(v,d=0){return v==null?'--':'$'+fmt(v,d);}
function tk(ids,v){ids.forEach(id=>set(id,v));}
function clr(el,ok,warn){if(!el||ok==null)return;el.style.color=ok?'var(--g)':warn?'var(--y)':'var(--r)';}

// CLOCK
function clk(){
  const ny=new Date(new Date().toLocaleString('en-US',{timeZone:'America/New_York'}));
  set('clock',`${String(ny.getHours()).padStart(2,'0')}:${String(ny.getMinutes()).padStart(2,'0')}:${String(ny.getSeconds()).padStart(2,'0')} NY`);
  const m=ny.getHours()*60+ny.getMinutes(),day=ny.getDay();
  const el=$('sess');if(!el)return;
  if(day===0||day===6){el.textContent='WEEKEND';el.className='sess s-cl';}
  else if(m>=570&&m<960){el.textContent='● NYSE OUVERT';el.className='sess s-open';}
  else if((m>=540&&m<570)||(m>=960&&m<1020)){el.textContent='◐ EXTENDED';el.className='sess s-ext';}
  else{el.textContent='○ NYSE FERMÉ';el.className='sess s-cl';}
}
clk();setInterval(clk,1000);

// FG NEEDLE
function moveFG(s){
  const n=$('fgn');if(!n||s==null)return;
  const a=-165+(s/100)*150,r=a*Math.PI/180;
  n.setAttribute('x2',(45+Math.cos(r)*28).toFixed(1));
  n.setAttribute('y2',(50+Math.sin(r)*28).toFixed(1));
}

// YIELD CURVE
function drawYield(y){
  const p=$('ypoly');if(!p)return;
  const vals=[y.us1m,y.us3m,y.us2y,y.us10y,y.us30y];
  if(vals.some(v=>v==null))return;
  const mn=Math.min(...vals)-.3,mx=Math.max(...vals)+.3,rng=mx-mn||1;
  const xs=[8,32,58,190,232];
  const toY=v=>56-((v-mn)/rng)*46;
  p.setAttribute('points',vals.map((v,i)=>`${xs[i]},${toY(v).toFixed(1)}`).join(' '));
  p.setAttribute('stroke',y.spread2s10s>=0?'var(--g)':'var(--r)');
}

// GAUGE
function gauge(fid,vid,val,max){
  const f=$(fid);if(f&&val!=null)f.style.width=Math.max(4,Math.min(100,(val/max)*100))+'%';
  set(vid,val!=null?fP(val):'N/D');
}

// RISK — affiché dans signal bar ET dans sidebar (détails), PAS dans morning
function renderRisk(risk){
  if(!risk)return;
  const{score,regime,details}=risk;
  const color=score>=65?'var(--g)':score>=50?'var(--y)':score>=35?'#f97316':'var(--r)';

  // Signal bar
  const sr=$('sb-regime');if(sr){sr.textContent=risk.emoji+' '+regime;sr.style.color=color;}
  set('sb-sub',`Score ${score}/100 · ${details?.length||0} signaux`);
  const bar=$('sb-bar');if(bar){bar.style.width=score+'%';bar.style.background=color;}
  const num=$('sb-num');if(num){num.textContent=score;num.style.color=color;}

  // Détails dans col 2
  const dets=$('risk-dets');
  if(dets&&Array.isArray(details)){
    dets.innerHTML=details.map(d=>{
      const p=d.split('→'),on=d.includes('Risk-ON'),off=d.includes('Risk-OFF');
      const cls=on?'g':off?'r':'y';
      return `<div class="rdet"><span class="rdi">${p[0]?.trim()||d}</span><span class="rds ${cls}">${p[1]?.trim()||''}</span></div>`;
    }).join('');
    const st=$('risk-score-txt');if(st)st.textContent=`${score}/100 · ${details.length} signaux`;
  }
}

// RESEARCH CARDS
function renderResearch(res,derived){
  const cuau=derived?.copperGoldRatio;
  const nfci=res?.nfci?.v,ted=res?.ted?.v,wei=res?.wei?.v;
  const conf=res?.conf?.v,jolts=res?.jolts?.v;

  // Signal bar
  if(nfci!=null){set('sb-nfci',fmt(nfci,2));const el=$('sb-nfci-s');if(el)el.textContent=nfci>0.5?'tendu':nfci<-0.5?'souple':'neutre';}
  if(wei!=null){const wv=(wei>=0?'+':'')+fmt(wei,2);set('sb-wei',wv);}
  if(cuau!=null){
    set('sb-ca',cuau.toFixed(3));
    const el=$('sb-ca-s');if(el)el.textContent=cuau>0.55?'risk-on':cuau>0.4?'neutre':'risk-off';
    tk(['tk-ca','tk-ca2'],cuau.toFixed(3));
  }

  // Research cards
  if(nfci!=null){
    const e=$('r-nfci');if(e){e.textContent=fmt(nfci,2);e.className='rc-v '+(nfci>0.5?'r':nfci<-0.5?'g':'y');}
    set('r-nfci-s',nfci>0.5?'🔴 Tendu':nfci<-0.5?'🟢 Souple':'🟡 Neutre');
    const rc=$('rc-nfci');if(rc)rc.className='rc '+(nfci>0.5?'rc-r':nfci<-0.5?'rc-g':'rc-y');
    set('nfci-v',fmt(nfci,2)+(nfci>0.5?' ⚠':''));
  }else{set('r-nfci','N/D');set('nfci-v','N/D');}

  if(ted!=null){
    const e=$('r-ted');if(e){e.textContent=fmt(ted,2)+'%';e.className='rc-v '+(ted>1?'r':ted>0.5?'y':'g');}
    set('r-ted-s',ted>1?'🔴 Stress':ted>0.5?'🟡 Modéré':'🟢 Normal');
    const rc=$('rc-ted');if(rc)rc.className='rc '+(ted>1?'rc-r':ted>0.5?'rc-y':'rc-g');
    set('ted-v',fmt(ted,2)+'%');
  }else{set('r-ted','N/D');set('ted-v','N/D');}

  if(wei!=null){
    const e=$('r-wei');if(e){e.textContent=(wei>=0?'+':'')+fmt(wei,2);e.className='rc-v '+(wei>1?'g':wei>-1?'y':'r');}
    set('r-wei-s',wei>1?'🟢 Solide':wei>-1?'🟡 Modéré':'🔴 Faible');
    const rc=$('rc-wei');if(rc)rc.className='rc '+(wei>1?'rc-g':wei>-1?'rc-y':'rc-r');
    set('wei-v',(wei>=0?'+':'')+fmt(wei,2));
  }else{set('r-wei','N/D');set('wei-v','N/D');}

  if(conf!=null){set('conf-v',fmt(conf,1));set('conf-v2',fmt(conf,1));}else{set('conf-v','N/D');set('conf-v2','N/D');}
  if(jolts!=null){
    const jv=Math.round(jolts).toLocaleString('fr-FR')+'k';
    set('jolts-v',jv);set('jolts-v2',jv);
  }else{set('jolts-v','N/D');set('jolts-v2','N/D');}
}

// ALERTS
function buildAlerts(d){
  const A=[];
  const vix=d.vix?.value,sp=d.yields?.spread2s10s,gold=d.commodities?.gold?.value;
  const hy=d.credit?.hy,fg=d.sentiment?.value,cpi=d.inflation?.cpiYoY;
  const dxy=d.dxyProxy?.value,risk=d.riskAnalysis,cuau=d.derived?.copperGoldRatio;
  const nfci=d.research?.nfci?.v,ted=d.research?.ted?.v;
  if(risk){const cl=risk.score>=65?'ac-g':risk.score>=35?'ac-y':'ac-r';A.push({cl,t:`${risk.emoji} ${risk.regime} (${risk.score}/100)`});}
  if(vix!=null&&vix>=30)A.push({cl:'ac-r',t:`VIX ${vix.toFixed(1)} — stress élevé`});
  if(sp!=null&&sp<0)A.push({cl:'ac-r',t:`Courbe inversée ${fPb(sp)}`});
  else if(sp!=null&&sp>40)A.push({cl:'ac-g',t:`Courbe +${sp.toFixed(0)}pb`});
  if(dxy!=null&&dxy<100)A.push({cl:'ac-y',t:`DXY ${dxy.toFixed(2)} — dollar faible`});
  if(gold!=null&&gold>3200)A.push({cl:'ac-y',t:`Or $${Math.round(gold)} — élevé`});
  if(cuau!=null&&cuau<0.35)A.push({cl:'ac-r',t:`Cu/Au ${cuau.toFixed(3)} — risk-off signal`});
  else if(cuau!=null&&cuau>0.6)A.push({cl:'ac-g',t:`Cu/Au ${cuau.toFixed(3)} — risk-on`});
  if(nfci!=null&&nfci>0.7)A.push({cl:'ac-r',t:`NFCI ${nfci.toFixed(2)} — cond. tendues`});
  if(ted!=null&&ted>0.8)A.push({cl:'ac-r',t:`TED ${ted.toFixed(2)}% — stress bancaire`});
  if(hy!=null&&hy>5.5)A.push({cl:'ac-r',t:`HY ${hy.toFixed(2)}% — tension crédit`});
  if(fg!=null&&fg<25)A.push({cl:'ac-r',t:`F&G ${Math.round(fg)} — peur extrême`});
  else if(fg!=null&&fg>75)A.push({cl:'ac-g',t:`F&G ${Math.round(fg)} — euphorie`});
  if(cpi!=null&&cpi>3.5)A.push({cl:'ac-y',t:`CPI ${cpi.toFixed(2)}% — inflation élevée`});
  if(!A.length)A.push({cl:'ac-b',t:'Marchés stables — aucune alerte'});
  const el=$('alert-items');
  if(el)el.innerHTML=A.map(a=>`<span class="ac ${a.cl}">${a.t}</span>`).join('');
  return A;
}

// SECTORS
function renderSectors(sectors){
  const w=$('sec-w');if(!w)return;
  if(!Array.isArray(sectors)||!sectors.length){
    w.innerHTML=`<div style="color:var(--mu);font-size:10px;padding:6px 0">Yahoo Finance indisponible — réessai dans 5 min.</div>`;return;
  }
  const maxA=Math.max(...sectors.map(s=>Math.abs(s.value??0)),0.5);
  w.innerHTML=`<div class="sec-g">${sectors.map(s=>{
    const v=s.value,pct=v==null?0:Math.max(4,(Math.abs(v)/maxA)*100);
    const clr2=v==null?'var(--mu)':v>=0?'var(--g)':'var(--r)';
    const cls=v==null?'mu':v>=0?'g':'r';
    const lbl=v==null?'N/D':(v>=0?'+':'')+fmt(v,2)+'%';
    return `<div class="secr"><span class="secn">${s.name}</span><div class="secb"><div class="secf" style="width:${pct.toFixed(1)}%;background:${clr2}"></div></div><span class="secv ${cls}">${lbl}</span></div>`;
  }).join('')}</div>`;
}
async function changeUT(ut){
  curUT=ut;
  document.querySelectorAll('.ubtn').forEach(b=>b.classList.toggle('active',b.dataset.ut===ut));
  set('sec-tag',(UTL[ut]||ut)+' · ETFs XL*');
  const w=$('sec-w');if(w)w.innerHTML=`<div class="skel" style="font-size:10px;padding:6px 0">Chargement ${UTL[ut]||ut}...</div>`;
  try{const r=await fetch(`/api/sectors?ut=${ut}`);const d=await r.json();renderSectors(d.sectors||[]);}
  catch{if(w)w.innerHTML=`<div style="color:var(--r);font-size:10px">Erreur Yahoo Finance.</div>`;}
}

// CDS
function renderCDS(cds){
  const w=$('cds-w');if(!w||!Array.isArray(cds))return;
  w.innerHTML=cds.map(c=>{
    const cl=c.r==='ÉLEVÉ'?'ct-h':c.r==='MODÉRÉ'?'ct-m':'ct-l';
    return `<div class="cds-r"><span class="cds-c">${c.c}</span><span class="cds-v">${fmt(c.v,0)} pb</span><span class="cds-t ${cl}">${c.r}</span></div>`;
  }).join('');
}

// LOAD
async function loadDash(){
  set('fstatus','⟳ Chargement...');
  try{
    const res=await fetch(`/api/dashboard?ut=${curUT}`);
    const json=await res.json();
    if(!res.ok)throw new Error(json.message||'Erreur');
    dash=json;const d=json.data;

    // Signal bar métriques
    const vix=d.vix?.value,fg=d.sentiment?.value;
    const y=d.yields||{};

    // VIX
    set('sb-vix',fmt(vix,2));
    const svixs=$('sb-vix-s');if(svixs)svixs.textContent=d.derived?.vixRegime?.split(' ')[0]||'--';

    // DXY
    set('sb-dxy',fmt(d.dxyProxy?.value,2));
    const sdxys=$('sb-dxy-s');if(sdxys){const v=d.dxyProxy?.value;sdxys.textContent=v<100?'faible':v>104?'fort':'neutre';}

    // Gold
    const gold=d.commodities?.gold?.value,goldOk=gold!=null&&gold>1500&&gold<5000;
    set('sb-gold',goldOk?fU(gold,0):'--');
    const sgs=$('sb-gold-s');if(sgs)sgs.textContent=d.commodities?.gold?.src||'--';

    // Spread
    set('sb-sp',fPb(y.spread2s10s));
    const ssp=$('sb-sp-s');if(ssp){const s=y.spread2s10s;ssp.textContent=s==null?'--':s>0?'positive':'INVERSÉE';if(ssp)ssp.style.color=s>=0?'var(--g)':'var(--r)';}

    // HY
    set('sb-hy',d.credit?.hy?fP(d.credit.hy):'--');

    // F&G
    set('sb-fg',fg!=null?Math.round(fg):'--');
    const sfgs=$('sb-fg-s');if(sfgs)sfgs.textContent=d.sentiment?.label||'--';

    // CPI
    set('sb-cpi',fP(d.inflation?.cpiYoY));

    // Risk
    renderRisk(d.riskAnalysis);

    // Summary IA local immédiat dans signal bar
    set('sb-aisumm',d.localSummary?.split('\n').slice(0,3).join(' · ')||'Données chargées.');

    // Taux
    set('us1m',fP(y.us1m));set('us2y',fP(y.us2y));set('us10y',fP(y.us10y));set('us30y',fP(y.us30y));
    const spEl=$('sp-val');if(spEl){spEl.textContent=fPb(y.spread2s10s);spEl.className='dv '+(y.spread2s10s>=0?'g':'r');}
    set('c-state',d.derived?.curveState||'--');set('fed',fP(d.fed?.upperBound));
    drawYield(y);

    // Crédit
    const hy=d.credit?.hy,ig=d.credit?.ig;
    set('hy-v',hy?fP(hy):'--');set('ig-v',ig?fP(ig):'--');
    set('cr-ratio',d.credit?.ratio?fmt(d.credit.ratio,2)+'x':'--');
    set('eurusd',fmt(d.fx?.eurusd?.value,4));set('eurusd2',fmt(d.fx?.eurusd?.value,4));

    // Délinquance
    const dl=d.delinquency||{};
    gauge('g-cc','gv-cc',dl.creditCards,4.5);gauge('g-au','gv-au',dl.autoLoans,3.0);
    gauge('g-re','gv-re',dl.realEstate,3.0);gauge('g-rl','gv-rl',dl.studentLoans,12.0);
    gauge('g-cl','gv-cl',dl.commercialRe,4.0);
    set('unrate',fP(d.labor?.unemploymentRate));

    // Or & refuges
    const silv=d.commodities?.silver?.value,btc=d.crypto?.btcusd?.value;
    set('gold-big',goldOk?fU(gold,0):gold?`$${Math.round(gold)} ⚠`:'--');
    set('gold-src',d.commodities?.gold?.src||'Coinbase XAU');
    set('btc-big',btc?fU(btc,0):'--');
    set('btc-ts',d.crypto?.btcusd?.ts?new Date(d.crypto.btcusd.ts).toLocaleTimeString('fr-FR'):'Coinbase');
    set('ag-v',silv?fU(silv,2):'--');
    const gsr=(goldOk&&silv&&silv>0)?gold/silv:null;
    set('gsr',gsr?fmt(gsr,1)+'x':'--');set('gs-v',gsr?fmt(gsr,1)+'x':'--');
    set('eth-v',d.crypto?.ethusd?fU(d.crypto.ethusd,0):'--');
    set('btcd',d.crypto?.btcDominance?fP(d.crypto.btcDominance,1):'--');

    // Inflation
    set('cpi-v',fP(d.inflation?.cpiYoY));set('core-cpi',fP(d.inflation?.coreCpi));
    set('pce-core',fP(d.inflation?.pceCore));set('cpi-date','FRED · '+(d.inflation?.date||'--'));

    // Sentiment
    set('fg-inline',fg!=null?Math.round(fg):'--');set('fg-lbl',d.sentiment?.label||'--');moveFG(fg);

    // DXY/VIX sidebar
    set('dxy-v',fmt(d.dxyProxy?.value,2));set('vix-v',fmt(vix,2));set('vix-reg',d.derived?.vixRegime||'--');

    // Commodités
    const cop=d.commodities?.copper?.value,wti=d.commodities?.oil?.value;
    set('wti-big',wti?fU(wti,2):'--');set('wti-src',d.commodities?.oil?.src||'--');
    set('cu-big',cop?fU(cop,3):'--');set('cu-src',d.commodities?.copper?.src||'--');
    set('brent-v',d.commodities?.brent?.value?fU(d.commodities.brent.value,2):'--');
    set('gas-v',d.commodities?.natgas?.value?fU(d.commodities.natgas.value,2):'--');
    const cuau=d.derived?.copperGoldRatio;
    set('ca-v',cuau?cuau.toFixed(3):'--');

    // Research
    renderResearch(d.research,d.derived);

    // CDS & Secteurs
    renderCDS(d.cds||[]);renderSectors(d.sectors||[]);

    // AI résumé local
    set('aiout',d.localSummary||'Posez une question...');

    // Ticker
    tk(['tk-gold','tk-gold2'],goldOk?fU(gold,0):'--');
    tk(['tk-ag','tk-ag2'],silv?fU(silv,2):'--');
    tk(['tk-btc','tk-btc2'],btc?fU(btc,0):'--');
    tk(['tk-wti','tk-wti2'],wti?fU(wti,2):'--');
    tk(['tk-dxy','tk-dxy2'],fmt(d.dxyProxy?.value,2));
    tk(['tk-vix','tk-vix2'],fmt(vix,2));
    tk(['tk-2y','tk-2y2'],fP(y.us2y));tk(['tk-10y','tk-10y2'],fP(y.us10y));
    tk(['tk-sp','tk-sp2'],fPb(y.spread2s10s));
    tk(['tk-hy','tk-hy2'],hy?fP(hy):'--');
    tk(['tk-nfci','tk-nfci2'],d.research?.nfci?.v!=null?fmt(d.research.nfci.v,2):'--');
    tk(['tk-cpi','tk-cpi2'],fP(d.inflation?.cpiYoY));

    // Alertes
    buildAlerts(d);

    // Morning (1x/jour) — SANS le score risk (déjà dans signal bar)
    if(!sessionStorage.getItem(DAY)){populateMorning(d);fetchMorningSummary();}

    set('fstatus',`✓ ${new Date(json.updatedAt).toLocaleTimeString('fr-FR')} — ${json.sources?.market}`);
    set('lupd',new Date(json.updatedAt).toLocaleTimeString('fr-FR'));
  }catch(err){set('fstatus',`⚠ ${err.message}`);console.error(err);}
}

// MORNING — simple et sans doublon risk
function populateMorning(d){
  const now=new Date();
  set('m-date',now.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}));
  const gold=d.commodities?.gold?.value,goldOk=gold>1500&&gold<5000;
  const vix=d.vix?.value,btc=d.crypto?.btcusd?.value,cuau=d.derived?.copperGoldRatio;
  const ve=$('mk-vix');if(ve){ve.textContent=fmt(vix,2);ve.className='mkpi-v '+(vix==null?'':(vix>=30?'r':vix>=20?'y':'g'));}
  set('mk-vix-s',vix!=null?(vix>=30?'⚠ stress élevé':vix>=20?'modéré':'marchés calmes'):'--');
  set('mk-gold',goldOk?fU(gold,0):'--');
  set('mk-btc',btc?fU(btc,0):'--');
  set('mk-10y',fP(d.yields?.us10y));
  const ce=$('mk-cuau');if(ce){ce.textContent=cuau?cuau.toFixed(3):'--';ce.className='mkpi-v '+(cuau==null?'':cuau>0.55?'g':cuau>0.4?'y':'r');}
  set('mk-dxy',fmt(d.dxyProxy?.value,2));
  // Alertes seulement
  const A=buildAlerts(d);
  const ad=$('m-alerts');if(ad)ad.innerHTML=A.map(a=>`<span class="ac ${a.cl}">${a.t}</span>`).join('');
}
async function fetchMorningSummary(){
  if(!dash)return;set('m-ai','⟳ Analyse en cours...');
  try{
    const r=await fetch('/api/ai/summary',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dashboard:dash})});
    const d=await r.json();set('m-ai',d.text||'Indisponible.');
  }catch{set('m-ai',dash?.data?.localSummary||'IA indisponible.');}
}
function showMorning(){const o=$('morning');if(o)o.style.display='flex';if(dash){populateMorning(dash.data);fetchMorningSummary();}}
function closeMorning(){const o=$('morning');if(o)o.style.display='none';sessionStorage.setItem(DAY,'1');}

// AI
async function callAI(q){
  const btn=$('aibtn');if(btn)btn.disabled=true;
  set('aiout','⟳ Analyse...');
  try{
    const r=await fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q,dashboard:dash})});
    const d=await r.json();set('aiout',d.text||'Pas de réponse.');
    aiN++;set('tokinfo',`~$0.001 · ${aiN} appel${aiN>1?'s':''}`);
  }catch(e){set('aiout','⚠ '+e.message);}
  finally{if(btn)btn.disabled=false;}
}
function sendAI(){const q=($('aiinp')?.value||'').trim();if(q){$('aiinp').value='';callAI(q);}}
function qa(q){$('aiinp').value=q;callAI(q);}
function sendRisk(){callAI("Selon tous les indicateurs (VIX, 2s10s, HY, F&G, DXY, Or, Cu/Au, BTC, NFCI, TED, WEI, CC), le marché est RISK-ON ou RISK-OFF ? Justifie les 3 signaux les plus importants et conclus en 1 phrase.");}
async function askRisk(){
  set('aiout','⟳ Analyse Risk...');
  try{
    const r=await fetch('/api/ai/risk',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dashboard:dash})});
    const d=await r.json();set('aiout',d.text||'--');aiN++;set('tokinfo',`~$0.001 · ${aiN} appels`);
  }catch(e){set('aiout','⚠ '+e.message);}
}

document.addEventListener('DOMContentLoaded',()=>{
  $('aiinp')?.addEventListener('keydown',e=>{if(e.key==='Enter')sendAI();});
  $('morning')?.addEventListener('click',e=>{if(e.target===$('morning'))closeMorning();});
});

loadDash();
setInterval(loadDash,5*60*1000);
</script>
</body>
</html>
