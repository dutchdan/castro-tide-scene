"use strict";
/* CastroTide v2 — data layer.
   Tide parsing + Madrid wall-clock helpers ported VERBATIM from
   reference/castro-tides-old/app.js (validated in production there). */

/* ================= configuration ================= */
const TIDE_URL = "https://www.tideschart.com/Spain/Cantabria/Provincia-de-Cantabria/Castro--Urdiales/";
const LAT = 43.2517, LON = -4.0619;          // Castro-Urdiales (Cantabria)
const TZ  = "Europe/Madrid";                  // tide times + sun times are local
const TIDE_REFRESH_MS   = 10 * 60 * 1000;
const WEATHER_REFRESH_MS= 15 * 1000 * 60;

/* ================= Madrid wall-clock helpers ================= */
// All tide logic runs on Spain local (Europe/Madrid) wall time, because the
// published tide times are for Castro-Urdiales. The viewer's own timezone is
// irrelevant — the clock shown here is always Castro-Urdiales local time.
function madridParts(d = new Date()){
  const p = {};
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false
  }).formatToParts(d).forEach(x => p[x.type] = x.value);
  return { y:+p.year, mo:+p.month, d:+p.day, h:(+p.hour)%24, mi:+p.minute, s:+p.second };
}
// Current Madrid UTC offset in ms (negative when Madrid is ahead of UTC).
function madridOffsetMs(now = new Date()){
  const p = madridParts(now);
  return now.getTime() - Date.UTC(p.y, p.mo-1, p.d, p.h, p.mi, p.s);
}
// Madrid wall-clock -> true epoch ms (valid unless a DST switch falls between "now" and the event).
function wallToEpoch(y, mo, d, h, mi, offset){ return Date.UTC(y, mo-1, d, h, mi) + offset; }

/* ================= tide table parsing ================= */

// ==PARSE-START==
// Parses the server-rendered tide table out of a tideschart.com page.
// Returns events: [{y,mo,d,hh,mi,h,type}] sorted by time (Madrid wall clock).
function parseTideHtml(html, today){ // today = {y,mo,d} Madrid date of "today"
  const rows = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = rowRe.exec(html))){
    if (m[1].includes("fv-tide-day") && m[1].includes("fv-tide-time")) rows.push(m[1]);
  }
  const todayIdx = rows.findIndex(r => r.includes("fv-tide-today"));
  const base = todayIdx >= 0 ? todayIdx : 0;

  const events = [];
  rows.forEach((row, i) => {
    const off = i - base; // row offset in days from Madrid "today"
    const dd = new Date(Date.UTC(today.y, today.mo-1, today.d + off));
    const y = dd.getUTCFullYear(), mo = dd.getUTCMonth()+1, day = dd.getUTCDate();

    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
    let c;
    while ((c = cellRe.exec(row))){
      const td = c[1];
      if (!td.includes("fv-tide-time")) continue; // skip sun/moon columns
      const tm = /datetime="(\d{2}):(\d{2})"/.exec(td);
      if (!tm) continue;
      let h = null;
      const hm = /class="fv-tide-height">[\s\S]*?>(\s*)([-+]?\d+(?:[.,]\d+)?)\s*m/.exec(td);
      if (hm) h = parseFloat(hm[2].replace(",", "."));
      let type = null;
      const al = /aria-label="(High|Low)\s+tide"/.exec(td);
      if (al) type = al[1] === "High" ? "high" : "low";
      events.push({ y, mo, d:day, hh:+tm[1], mi:+tm[2], h, type });
    }
  });

  // sort + de-duplicate
  const key = e => Date.UTC(e.y, e.mo-1, e.d, e.hh, e.mi);
  events.sort((a,b) => key(a) - key(b));
  const out = [];
  for (const e of events){
    if (!out.length || key(e) !== key(out[out.length-1])) out.push(e);
  }

  // fill missing types by alternation (events strictly alternate high/low)
  let prevType = null;
  for (let i = out.length - 1; i >= 0 && !prevType; i--) if (out[i].type) prevType = out[i].type;
  const other = t => t === "high" ? "low" : "high";
  let lastKnown = null;
  for (const e of out){
    if (e.type){ lastKnown = e.type; continue; }
    // find next known type and walk backwards is overkill — use alternation from nearest known
    const j = out.indexOf(e);
    let ref = null, dir = -1;
    for (let k = j-1; k >= 0 && !ref; k--) if (out[k].type) { ref = out[k].type; }
    if (!ref){ for (let k = j+1; k < out.length && !ref; k++) if (out[k].type) { ref = out[k].type; dir = 1; } }
    const dist = ref ? Math.abs((dir === -1 ? j-1 : j+1) - (dir === -1 ? out.findIndex(x=>x.type===ref && x!==e) : out.findIndex(x=>x.type===ref))) : 0;
    e.type = (dist % 2 === 0) ? ref : other(ref);
  }
  return out;
}
// ==PARSE-END==

/* ================= tide model ================= */
let EVENTS = [];      // [{t: epochMs, h, type}]
let TIDE_OK = false;
let lastTideFetch = 0;

function buildEvents(parsed){
  const offset = madridOffsetMs();
  return parsed.map(e => ({
    t: wallToEpoch(e.y, e.mo, e.d, e.hh, e.mi, offset),
    h: e.h, type: e.type,
    label: `${String(e.hh).padStart(2,"0")}:${String(e.mi).padStart(2,"0")}`
  }));
}

// Smooth tide height between two consecutive extrema (cosine — zero slope at both ends).
function tideAt(t){
  if (!EVENTS.length) return null;
  if (t < EVENTS[0].t || t > EVENTS[EVENTS.length-1].t) return null;
  for (let i = 0; i < EVENTS.length - 1; i++){
    const a = EVENTS[i], b = EVENTS[i+1];
    if (t >= a.t && t <= b.t){
      const f = (b.t === a.t) ? 0 : (t - a.t) / (b.t - a.t);
      const mid = (a.h + b.h) / 2, amp = (b.h - a.h) / 2;
      return { h: mid - amp * Math.cos(Math.PI * f), rising: b.h > a.h };
    }
  }
  return null;
}

function nextEventAfter(t){
  for (const e of EVENTS) if (e.t > t) return e;
  return null;
}
/* ================= rain / weather state ================= */
const WX = {
  ok:false, airTemp:null, seaTemp:null, cloudCover:0, windKmh:0,
  rainFactor:0, rainingNow:false,
  sunrise:0, sunset:0,        // today's Madrid epochs (ms)
  nightStart:0, nightEnd:0    // current night window (sunset -> next sunrise)
};
const RAIN_CODES = new Set([51,53,55,61,63,65,71,73,75,80,81,82,85,86,95,96,99]);

function fmtDur(ms){ // spec §3.3: "3h 12min" / "47min"
  const m = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(m / 60), r = m % 60;
  return h > 0 ? `${h}h ${String(r).padStart(2,"0")}min` : `${r}min`;
}

/* ================= localStorage cache (offline / refresh-failure fallback) ==== */
function saveCache(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
function loadCache(k){ try{ return JSON.parse(localStorage.getItem(k)); }catch(e){ return null; } }

/* ================= fetching ================= */
async function fetchTides(){
  const res = await fetch(TIDE_URL, { headers: { "Accept": "text/html" } });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const html = await res.text();
  const today = madridParts(new Date());
  const parsed = parseTideHtml(html, today);
  if (parsed.length < 4) throw new Error("tide table not found in page");
  EVENTS = buildEvents(parsed);
  TIDE_OK = true;
  lastTideFetch = Date.now();
  saveCache("ct_tides", EVENTS);
}

function toEpochLocal(iso, off){ // "2026-10-18T08:33" (Madrid wall time) -> epoch ms
  const [dp, tp] = iso.split("T");
  const [y, mo, d] = dp.split("-").map(Number);
  const [h, mi] = tp.split(":").map(Number);
  return wallToEpoch(y, mo, d, h, mi, off);
}

async function fetchWeather(){
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
    `&current=temperature_2m,cloud_cover,wind_speed_10m,weather_code` +
    `&daily=sunrise,sunset&hourly=precipitation_probability,weather_code` +
    `&past_days=1&forecast_days=2&timezone=Europe%2FMadrid`;
  const res = await fetch(u);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const j = await res.json();
  const c = j.current, d = j.daily;
  WX.airTemp     = c.temperature_2m ?? null;
  WX.cloudCover  = c.cloud_cover ?? 0;
  WX.windKmh     = c.wind_speed_10m ?? 0;
  WX.rainingNow  = RAIN_CODES.has(c.weather_code);

  // rain forecast risk: max precip probability / rain code over current + next 3 h
  const p = madridParts();
  const key = `${p.y}-${String(p.mo).padStart(2,"0")}-${String(p.d).padStart(2,"0")}T${String(p.h).padStart(2,"0")}:00`;
  let idx = j.hourly.time.indexOf(key);
  if (idx < 0){ for (let i = j.hourly.time.length - 1; i >= 0; i--){ if (j.hourly.time[i] <= key){ idx = i; break; } } }
  if (idx < 0) idx = 0;
  let maxP = 0;
  for (let i = idx; i <= idx + 3 && i < j.hourly.time.length; i++){
    maxP = Math.max(maxP, j.hourly.precipitation_probability[i] ?? 0);
    if (RAIN_CODES.has(j.hourly.weather_code[i])) maxP = Math.max(maxP, 60);
  }
  const risk = Math.min(1, maxP / 100);
  WX.rainFactor = WX.rainingNow ? Math.max(0.85, risk) : risk;

  // sun windows: daily rows = [yesterday, today, tomorrow] (past_days=1)
  const off = madridOffsetMs();
  const dateKey = `${p.y}-${String(p.mo).padStart(2,"0")}-${String(p.d).padStart(2,"0")}`;
  let ti = d.time.indexOf(dateKey); if (ti < 0) ti = 0;
  WX.sunrise = toEpochLocal(d.sunrise[ti], off);
  WX.sunset  = toEpochLocal(d.sunset[ti], off);
  const now = Date.now();
  if (now < WX.sunrise){
    const pi = Math.max(0, ti - 1);
    WX.nightStart = toEpochLocal(d.sunset[pi], off); WX.nightEnd = WX.sunrise;
  } else if (now >= WX.sunset){
    const ni = Math.min(d.time.length - 1, ti + 1);
    WX.nightStart = WX.sunset; WX.nightEnd = toEpochLocal(d.sunrise[ni], off);
  }
  WX.ok = true;
  saveCache("ct_wx", WX);
}

async function fetchSea(){
  const u = `https://marine-api.open-meteo.com/v1/marine?latitude=${LAT}&longitude=${LON}` +
            `&current=sea_surface_temperature&timezone=Europe%2FMadrid`;
  const res = await fetch(u);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const j = await res.json();
  WX.seaTemp = j.current.sea_surface_temperature ?? null;
}

/* ================= orchestration (last-good-data policy, same as v1) ======= */
async function refreshTides(){
  try { await fetchTides(); }
  catch(err){
    if (!TIDE_OK){ const c = loadCache("ct_tides"); if (c){ EVENTS = c; TIDE_OK = true; } }
  }
}
async function refreshWeather(){
  try { await fetchWeather(); }
  catch(e){ const c = loadCache("ct_wx"); if (c) Object.assign(WX, c); }
  try { await fetchSea(); } catch(e){}
}

function init(){
  refreshTides();
  refreshWeather();
  setInterval(() => { if (Date.now() - lastTideFetch > TIDE_REFRESH_MS) refreshTides(); }, 60 * 1000);
  setInterval(refreshWeather, WEATHER_REFRESH_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden){
      if (Date.now() - lastTideFetch > TIDE_REFRESH_MS) refreshTides();
      refreshWeather();
    }
  });
}

window.DATA = {
  tideAt, nextEventAfter, fmtDur,
  events: () => EVENTS,
  tideOk: () => TIDE_OK,
  wx: WX
};

init();

/* ================= service worker ================= */
if ("serviceWorker" in navigator){
  window.addEventListener("load", function(){
    navigator.serviceWorker.register("sw.js").catch(function(err){
      console.warn("Service worker registration failed:", err);
    });
  });
}
