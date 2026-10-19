
const fs=require("fs");
const ev=JSON.parse(fs.readFileSync("C:/Users/danie/events.json","utf8"));
global.localStorage={_d:{ct_tides:JSON.stringify(ev)},getItem(k){return this._d[k]??null},setItem(k,v){this._d[k]=v},removeItem(k){delete this._d[k]}};
global.window={location:{origin:"http://x"},fetch:()=>Promise.reject(new Error("no net")),localStorage,addEventListener(){},matchMedia:()=>({matches:false}),navigator:{}};
global.fetch=global.window.fetch;
global.navigator={};
global.document={addEventListener(){},readyState:"complete",getElementById:()=>null,visibilityState:"visible"};
new Function(fs.readFileSync("data.js","utf8"))();   // init() runs, fetch fails, falls back to ct_tides cache
setTimeout(()=>{
  const D=global.window.DATA;
  console.log("tideOk:",D.tideOk(),"events:",D.events().length);
  const Y_LO=0.86,Y_HI=0.70;
  let bad=0;
  for(const e of ev){
    const r=D.tideAt(e.t);
    if(!r) continue;
    const want=e.type==="High"?1:0;
    if(Math.abs(r.phase-want)>1e-6){bad++;console.log("MISMATCH",e.type,e.label,r.phase);}
  }
  for(let i=0;i<ev.length-1;i++){
    const mid=(ev[i].t+ev[i+1].t)/2, r=D.tideAt(mid);
    if(r&&Math.abs(r.phase-0.5)>1e-6){bad++;console.log("MID MISMATCH",ev[i].label,"->",ev[i+1].label,r.phase);}
  }
  for(const e of ev.slice(0,6)){
    const r=D.tideAt(e.t);
    console.log(e.label,e.type,e.h+"m","phase="+r.phase.toFixed(2),"y="+(Y_LO+(Y_HI-Y_LO)*r.phase)*100+"%H","rising="+r.rising);
  }
  const r=D.tideAt((ev[0].t+ev[1].t)/2);
  console.log("midpoint",ev[0].label+"->low? "+ev[0].type,"phase="+r.phase.toFixed(2),"y="+(Y_LO+(Y_HI-Y_LO)*r.phase)*100+"%H");
  console.log(bad===0?"ALL PHASE CHECKS PASS":bad+" FAILURES");
},200);
