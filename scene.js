"use strict";
/* CastroTide v2 — animated SVG scene (SPEC.md §3/§4).
   Portrait viewBox 400x867 (9:19.5). Single RAF loop; data read from window.DATA. */

const NS = "http://www.w3.org/2000/svg";
const svg = document.getElementById("scene");

/* Fill the viewport exactly: viewBox aspect follows the real screen aspect,
   so `meet` never letterboxes on any phone. All geometry is % of H. */
const W = 400;
let H = Math.round(W * (window.innerHeight / window.innerWidth));
H = Math.max(680, Math.min(1120, H));              // sane portrait range
svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

// big viewport change (rotation, URL-bar collapse) → rebuild at new aspect
let rsT;
function recheckAspect(){
  clearTimeout(rsT);
  rsT = setTimeout(() => {
    const nh = Math.max(680, Math.min(1120, Math.round(W * innerHeight / innerWidth)));
    if (Math.abs(nh - H) > 60) location.reload();
  }, 500);
}
addEventListener("resize", recheckAspect);
addEventListener("orientationchange", recheckAspect);

const PI = Math.PI, TAU = 2 * PI;

function el(name, attrs, parent){
  const n = document.createElementNS(NS, name);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  (parent || svg).appendChild(n);
  return n;
}

/* ---------- palette (SPEC §4, mockup-sampled) ---------- */
const PAL = {
  day:   { sky:[189,232,242], wf:[91,123,216],  wb:[110,131,201], sand:[245,243,200] },
  night: { sky:[46,58,92],    wf:[36,50,92],    wb:[45,58,100],   sand:[108,110,96]  },
  peach:[238,196,168], cloudDay:[252,252,252], cloudGray:[138,147,166],
  cloudNight:[120,126,148], sun:[247,215,123], moon:[237,237,245], coral:"#F6B8A0"
};
const mix  = (a,b,t) => a.map((v,i) => Math.round(v + (b[i]-v) * t));
const rgb  = c => `rgb(${c[0]},${c[1]},${c[2]})`;

/* ---------- geometry (SPEC §3) ---------- */
const Y_HI = 0.31 * H, Y_LO = 0.86 * H;       // waterline y at f=1 (high, higher on screen) / f=0 (low)
const sandY = x => 0.92*H - 0.015*H*Math.cos(TAU*(x/W - 0.35));   // §3.2 sand arc
const SUN_X0 = 0.08*W, SUN_X1 = 0.92*W;
const SUN_R = 32, MOON_R = 24;                       // 2x the v2.0 sizes
// whole disk stays within top 25%: lowest center = 25%H - r (at horizon ends),
// apex center = 15.7%H so the disc top (apex - r) clears the title/air-temp header
const orbCy = (r, p) => (0.25*H - r) - (0.25*H - r - 0.165*H) * Math.sin(PI*p);

/* ---------- scene graph (draw order) ---------- */
const skyRect   = el("rect", { x:0, y:0, width:W, height:H });
const sunC      = el("circle", { r:SUN_R,  id:"sun"  });
const moonC     = el("circle", { r:MOON_R, id:"moon" });
const cloudsG   = el("g", {});
const backWaveP = el("path", {});
const waterP    = el("path", {});
const fishG     = el("g", {});
const sandP     = el("path", {});

const titleT = el("text", { x:W/2, y:40, "text-anchor":"middle", "font-size":19,
                            "font-weight":600, "letter-spacing":4, fill:"#fff" });
titleT.textContent = "Castro-Urdiales";
const airT = el("text", { x:20, y:106, "font-size":42, fill:"#fff" });
const seaT = el("text", { x:20, y:sandY(30)-32, "font-size":34, fill:"rgba(255,255,255,.95)" });
const CNT_X = 0.94*W, CNT_Y = 0.5*H;
const cntT = el("text", { x:CNT_X, y:CNT_Y+10, "text-anchor":"end", "font-size":28, fill:"#fff" });
const arrowG = el("g", {});
const arrowP = el("path", { d:"M0 -16 l 12 20 l -24 0 Z", id:"arrow",
                             fill:"rgba(255,255,255,.95)" }, arrowG);

/* sand (static curve) */
(function(){
  let d = `M0 ${sandY(0).toFixed(1)}`;
  for (let x = 25; x <= W; x += 25) d += ` L${x} ${sandY(x).toFixed(1)}`;
  sandP.setAttribute("d", d + ` L${W} ${H} L0 ${H} Z`);
})();

/* ---------- clouds (SPEC §3.6) ---------- */
const clouds = [];
function makeCloud(){
  const g = el("g", { fill: rgb(PAL.cloudDay) }, cloudsG);   // pre-fill: never flash black
  const w = 46 + Math.random()*38;
  const n = 3 + (Math.random() < 0.4 ? 1 : 0);
  for (let i = 0; i < n; i++){
    el("ellipse", { cx:(i-(n-1)/2)*w*0.26, cy:(i%2?-5:0), rx:w*0.30, ry:w*0.145 }, g);
  }
  const c = { g, x:Math.random()*W, y:(0.08+Math.random()*0.19)*H, mult:0.8+Math.random()*0.4 };
  clouds.push(c); return c;
}
function targetClouds(){ return Math.round((window.DATA.wx.cloudCover || 0) / 100 * 6); }
function syncClouds(){
  const n = targetClouds();
  while (clouds.length < n) makeCloud();
  while (clouds.length > n){ clouds.pop().g.remove(); }
}

/* ---------- fish (SPEC §3.7: #1 always, #2 at 50% per page load) ---------- */
const fishes = [];
function makeFish(){
  const g = el("g", {}, fishG);
  const tail = el("path", { d:"M-11 0 l -9 -7 l 0 14 Z", fill:PAL.coral }, g);
  el("ellipse", { rx:14, ry:8, fill:PAL.coral }, g);
  el("circle", { cx:7, cy:-2, r:1.6, fill:"#4a3b52" }, g);
  const f = { g, tail,
    x:Math.random()*W, y:0.5*(Y_LO + sandY(W/2)),
    head:(Math.random()<0.5?0:PI) + (Math.random()-0.5),
    spd:8 + Math.random()*12,               // 2–5 % W per second
    age:Math.random()*10, face:1 };
  fishes.push(f); return f;
}
makeFish();
if (Math.random() < 0.5) makeFish();

function updateFish(f, dt){
  f.age += dt;
  f.head += (Math.random() - 0.5) * 1.8 * dt;                    // slow wander
  if (Math.random() < 0.04 * dt) f.head = f.head > 0 ? PI - f.head : -f.head; // occasional U-turn
  f.x += Math.cos(f.head) * f.spd * dt;
  f.y += Math.sin(f.head) * f.spd * 0.5 * dt;
  if (f.x < -25) f.x = W + 25; if (f.x > W + 25) f.x = -25;     // horizontal wrap
  // keep inside water band at current waterline/sand (evaluated at fish x)
  const top = waterY + 0.12 * (sandY(f.x) - waterY);
  const bot = sandY(f.x) - 0.10 * (sandY(f.x) - waterY);
  if (f.y < top){ f.y = top; if (Math.sin(f.head) < 0) f.head = -f.head; }
  if (f.y > bot){ f.y = bot; if (Math.sin(f.head) > 0) f.head = -f.head; }
  f.face = Math.cos(f.head) >= 0 ? 1 : -1;
  f.g.setAttribute("transform", `translate(${f.x.toFixed(1)} ${f.y.toFixed(1)}) scale(${f.face} 1)`);
  f.tail.setAttribute("transform", `rotate(${(8*Math.sin(4*PI*f.age)).toFixed(1)} -10 0)`);
}

/* ---------- day/night schedule (SPEC §3.5) ---------- */
function daylight(now, sr, ss){
  const R = 30 * 60000;
  if (!sr || !ss) return 1;
  if (now < sr - R || now > ss + R) return 0;
  if (now < sr + R) return (now - (sr - R)) / (2*R);
  if (now > ss - R) return ((ss + R) - now) / (2*R);
  return 1;
}

/* ---------- animation state ---------- */
let waterY = 0.5 * (Y_HI + Y_LO);
let waterTarget = waterY;
let windFrac = 0, rainFactor = 0;

function waveTop(baseY, t, ph){
  // simple broad swell: two soft crests across the width, like the sand arc
  const a = 9 * (1 + 0.2*windFrac);
  let d = "";
  for (let x = 0; x <= W; x += 8){
    const y = baseY + a * Math.sin(TAU*(x/(0.5*W) - (t+ph)/6));
    d += (x === 0 ? "M" : " L") + x + " " + y.toFixed(1);
  }
  return d;
}

let lastTick = 0, lastFrame = performance.now();

function tick(){ // once per second: data-driven values
  const now = Date.now(), wx = window.DATA.wx;
  // waterline target from TIME phase between extrema (§3.1)
  const cur = window.DATA.tideAt(now);
  /* Every low tide → phase 0 (y=86 %H), every high tide → phase 1 (y=31 %H),
     independent of absolute height, so even small tidal ranges use the full
     55 % swing. */
  const f = cur ? cur.phase : 0.5;
  waterTarget = Y_LO + (Y_HI - Y_LO) * f;   // f=0 low → low on screen (86 %), f=1 high → 31 %
  windFrac = Math.min(1, Math.max(0, (wx.windKmh || 0) / 100));
  rainFactor = wx.rainFactor || 0;

  // day/night colors
  const d = daylight(now, wx.sunrise, wx.sunset);
  const tw = (d > 0 && d < 1) ? 1 - Math.abs(d - 0.5) * 2 : 0;
  const skyFill = rgb(mix(mix(PAL.night.sky, PAL.day.sky, d), PAL.peach, tw*0.4));
  skyRect.setAttribute("fill", skyFill);
  document.body.style.background = skyFill; // letterbox bars on non-portrait screens match sky
  waterP.setAttribute("fill", rgb(mix(PAL.night.wf, PAL.day.wf, d)));
  backWaveP.setAttribute("fill", rgb(mix(PAL.night.wb, PAL.day.wb, d)));
  sandP.setAttribute("fill", rgb(mix(PAL.night.sand, PAL.day.sand, d)));
  const cloudFill = rgb(mix(PAL.cloudNight, mix(PAL.cloudDay, PAL.cloudGray, rainFactor), d));
  for (const c of clouds) c.g.setAttribute("fill", cloudFill);
  syncClouds();

  // sun & moon arcs (§3.4)
  let sunP = null, moonP = null;
  if (wx.sunrise && wx.sunset && now >= wx.sunrise && now < wx.sunset)
    sunP = (now - wx.sunrise) / (wx.sunset - wx.sunrise);
  else if (wx.nightEnd > wx.nightStart && now >= wx.nightStart && now < wx.nightEnd)
    moonP = (now - wx.nightStart) / (wx.nightEnd - wx.nightStart);
  if (sunP != null){
    sunC.setAttribute("cx", (SUN_X0 + (SUN_X1-SUN_X0)*sunP).toFixed(1));
    sunC.setAttribute("cy", orbCy(SUN_R, sunP).toFixed(1));
    sunC.setAttribute("fill", rgb(PAL.sun)); sunC.style.opacity = 1;
  } else sunC.style.opacity = 0;
  if (moonP != null){
    moonC.setAttribute("cx", (SUN_X0 + (SUN_X1-SUN_X0)*moonP).toFixed(1));
    moonC.setAttribute("cy", orbCy(MOON_R, moonP).toFixed(1));
    moonC.setAttribute("fill", rgb(PAL.moon)); moonC.style.opacity = 1;
  } else moonC.style.opacity = 0;

  // labels & countdown (§3.3, §3.8) — countdown only, no tide height text
  airT.textContent = (wx.airTemp != null ? wx.airTemp.toFixed(1) : "–") + " °C";
  seaT.textContent = (wx.seaTemp != null ? wx.seaTemp.toFixed(1) : "–") + " °C";
  const nxt = window.DATA.nextEventAfter(now);
  cntT.textContent = nxt ? window.DATA.fmtDur(nxt.t - now) : "";
  const falling = !(cur && cur.rising);
  const halfW = (cntT.getComputedTextLength() || 100) / 2;
  arrowG.setAttribute("transform",
    `translate(${CNT_X - halfW} ${falling ? CNT_Y + 46 : CNT_Y - 40})`);
  arrowP.classList.toggle("falling", falling); // rotate points it down
}

function frame(ms){
  const dt = Math.min(0.05, (ms - lastFrame) / 1000); lastFrame = ms;
  const t = ms / 1000;
  if (ms - lastTick > 1000){ lastTick = ms; tick(); }

  // ease waterline (~1 s) so refreshes never jump
  waterY += (waterTarget - waterY) * (1 - Math.exp(-2.2 * dt));

  // waterline + back wave (§3.2)
  waterP.setAttribute("d", waveTop(waterY, t, 0) + ` L${W} ${H} L0 ${H} Z`);
  backWaveP.setAttribute("d", waveTop(waterY - 10, t, 1.5) + ` L${W} ${H} L0 ${H} Z`);

  // clouds drift left→right, wrap (SPEC §3.6)
  const vxBase = windFrac * W / 45; // 100 km/h -> full width in ~45 s
  for (const c of clouds){
    c.x += vxBase * c.mult * dt;
    if (c.x > W + 110) c.x = -110;
    c.g.setAttribute("transform", `translate(${c.x.toFixed(1)} ${c.y.toFixed(1)})`);
  }
  for (const f of fishes) updateFish(f, dt);
  requestAnimationFrame(frame);
}

tick();

// don't animate/render until first data load has settled (splash hides the rest)
let started = false;
function start(){
  if (started) return; started = true;
  const sp = document.getElementById("splash");
  if (sp){ sp.classList.add("hide"); setTimeout(() => sp.remove(), 600); }
  requestAnimationFrame(frame);
}
if (window.DATA.onReady) window.DATA.onReady(start);
setTimeout(start, 6000);   // never leave the splash up forever on a dead network
