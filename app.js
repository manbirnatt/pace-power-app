/* Pace & Power: offline workout logger with GitHub sync */
(function(){
"use strict";
const P = window.PROGRAM;
const DAYS = P.DAYS, PH = P.PH;
const TRAIN_DAYS = DAYS.filter(d => d.items && !d.optional).map(d => d.id); // 5 planned per week
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const view = document.getElementById("view");

/* ---------- storage ---------- */
function load(k, def){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; }catch(e){ return def; } }
function save(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
let data = load("ppa-data", null) || {sessions:{}, body:{}, settings:{startDate:"2026-09-28", updatedAt:0}};
data.sessions = data.sessions || {}; data.body = data.body || {}; data.settings = data.settings || {startDate:"2026-09-28", updatedAt:0};
let cfg = load("ppa-cfg", {owner:"manbirnatt", repo:"pace-power-data", token:"", lastSync:0, err:""});
let dirty = load("ppa-dirty", false);
function persist(){ save("ppa-data", data); dirty = true; save("ppa-dirty", true); scheduleSync(); }
try{ navigator.storage && navigator.storage.persist && navigator.storage.persist(); }catch(e){}

/* ---------- dates ---------- */
function iso(d){ return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function parseISO(s){ const p = String(s).split("-"); return new Date(+p[0], +p[1]-1, +p[2]); }
function start(){ const d = parseISO(data.settings.startDate || "2026-09-28"); return isNaN(d) ? parseISO("2026-09-28") : d; }
function addDays(d, n){ const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function fmt(d){ return MON[d.getMonth()]+" "+d.getDate(); }
function slotDate(w, di){ return addDays(start(), w*7 + di); }
function todaySlot(){
  const t = new Date(); t.setHours(0,0,0,0);
  const diff = Math.round((t - start())/86400000);
  if(diff < 0) return {w:0, d:0};
  if(diff >= 56) return {w:7, d:6};
  return {w:Math.floor(diff/7), d:diff%7};
}

/* ---------- program helpers ---------- */
function pick(it, w){
  let v = it.n;
  if(Array.isArray(v)) v = v.length === 8 ? v[w] : v[w % v.length];
  if(typeof v === "string") v = {n:v};
  const d = v.d || (it.d ? it.d[w] : (P.DOSE[it.t] ? P.DOSE[it.t][w] : ""));
  return {n:v.n, d:d || "", tip:v.tip || it.tip || ""};
}
function parseDose(d){
  const m = /(\d+)\s*×\s*(\d+)(?:\s*[–-]\s*(\d+))?\s*(s\b|m\b)?/.exec(d || "");
  if(!m) return {sets:1, reps:"", unit:"reps"};
  return {sets:+m[1], reps:m[3] || m[2], unit: m[4] === "s" ? "sec" : m[4] === "m" ? "m" : "reps"};
}
function restSecs(r){
  const m = /(\d+)(?:[–-](\d+))?\s*(min|s)/.exec(r || "");
  if(!m) return 0;
  return (+m[1]) * (m[3] === "min" ? 60 : 1);
}
function itemsFor(day, w){ return (day.items || []).filter(it => !(it.from !== undefined && w < it.from)); }
function key(w, dayId){ return "w"+w+"-"+dayId; }

/* ---------- session data ---------- */
function getSession(k){ const s = data.sessions[k]; return s && !s.deleted ? s : null; }
function ensureSession(w, day){
  const k = key(w, day.id);
  if(!data.sessions[k] || data.sessions[k].deleted){
    data.sessions[k] = {id:k, week:w, day:day.id, date:null, ex:{}, knee:null, notes:"", done:false, updatedAt:Date.now()};
  }
  return data.sessions[k];
}
function touch(s){ s.updatedAt = Date.now(); if(!s.date) s.date = iso(new Date()); persist(); }
function sessionsSorted(){
  return Object.values(data.sessions).filter(s => !s.deleted && s.date).sort((a,b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.updatedAt - b.updatedAt);
}
function topSet(ex){
  const sets = (ex && ex.sets || []).filter(x => x.ok);
  if(!sets.length) return null;
  let best = null;
  sets.forEach(x => {
    const w = parseFloat(x.w) || 0, r = parseFloat(x.r) || 0;
    if(!best || w > best.w || (w === best.w && r > best.r)) best = {w:w, r:r};
  });
  return best;
}
function lastTime(name, exceptKey){
  const list = sessionsSorted().filter(s => s.id !== exceptKey && s.ex && s.ex[name] && topSet(s.ex[name]));
  if(!list.length) return null;
  const s = list[list.length-1];
  return {s:s, top:topSet(s.ex[name]), unit:s.ex[name].unit || "reps"};
}
function unitLabel(u){ return u === "sec" ? "s" : u === "m" ? "m" : "reps"; }
function describeTop(t, unit){
  if(!t) return "";
  const r = t.r ? (unit === "reps" ? " × "+t.r : " × "+t.r+" "+unitLabel(unit)) : "";
  return (t.w ? t.w+" lb" : "Bodyweight") + r;
}

/* ---------- UI state ---------- */
let tab = "today";
let cur = todaySlot();
let planWeek = cur.w;
let chartPick = null;

function esc(s){ return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }
function toast(msg){
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
}

/* ---------- Today ---------- */
function renderToday(){
  const w = cur.w, day = DAYS[cur.d], date = slotDate(w, cur.d), ph = PH[w];
  const s = getSession(key(w, day.id));
  let h = '<div class="nav"><button class="round" data-act="prev" aria-label="Previous day">‹</button>'+
    '<div class="mid"><div class="eyebrow">Week '+(w+1)+' · '+day.dow+' '+fmt(date)+'</div></div>'+
    '<button class="round" data-act="next" aria-label="Next day">›</button></div>';
  h += '<div class="hero"><div><span class="pill '+ph.key+'">'+esc(ph.n)+'</span>'+(s && s.done ? ' <span class="pill done">✓ Done</span>' : '')+'</div>'+
    '<h2>'+esc(day.title)+'</h2>';
  if(day.off){
    h += '<p class="muted">Rest day. Walk 30–45 minutes and do the 5-minute stretch (Guide tab). If you bowl in nets, today or Sunday is the best day for it.</p></div>';
    view.innerHTML = h; return;
  }
  if(day.optional){
    const skip = (w === 3 || w === 7);
    h += '<p class="muted">'+(skip ? 'Skip this week. Rest is part of the plan. Just do the 5-minute stretch.' : 'Optional. Only if you feel good: 20–30 min easy on the bike, incline walk or ski erg, then the 5-minute stretch.')+'</p></div>';
    if(!skip) h += '<button class="btn '+(s && s.done ? 'line' : 'turf')+'" data-act="finish">'+(s && s.done ? 'Mark not done' : 'Mark done')+'</button>';
    view.innerHTML = h; return;
  }
  h += '<p class="muted">'+esc(day.focus)+'</p></div>';
  h += '<div class="card small"><b>Warm-up:</b> 5 min ski erg or bike, easy.'+(day.knee ? ' Wall sit 2×30 s for the knee.' : '')+' Then 2 light sets of the first exercise.</div>';
  itemsFor(day, w).forEach((it, i) => {
    const x = pick(it, w), pd = parseDose(x.d), rest = P.REST[it.t] || "";
    const ex = s && s.ex[x.n];
    const lt = lastTime(x.n, key(w, day.id));
    const n = Math.max(pd.sets, ex && ex.sets ? ex.sets.length : 0);
    const wLabel = it.t === "ski" ? "watts" : "lb";
    const phW = it.t === "ski" ? "watts" : (lt && lt.top && lt.top.w ? lt.top.w : "BW");
    h += '<section class="card exc'+(it.t === "power" ? ' power' : '')+'" data-name="'+esc(x.n)+'" data-unit="'+pd.unit+'" data-rest="'+restSecs(rest)+'" data-target="'+esc(pd.reps)+'">'+
      '<div class="exh"><span class="num">'+(i+1)+'</span><div><h3>'+esc(x.n)+(it.t === "power" ? ' <span class="pill p2">Optional</span>' : '')+'</h3>'+
      '<div class="meta">Target <b>'+esc(x.d)+'</b>'+(rest && rest !== "Built in" ? ' · Rest '+esc(rest) : '')+'</div>'+
      (lt ? '<div class="last">Last: '+esc(describeTop(lt.top, lt.unit))+'</div>' : '')+'</div></div>'+
      (x.tip ? '<details><summary>How to do it</summary><p>'+esc(x.tip)+'</p></details>' : '')+
      '<div class="sets">';
    for(let k=0; k<n; k++){
      const st = ex && ex.sets && ex.sets[k] || {};
      h += '<div class="set'+(st.ok ? ' is' : '')+'" data-i="'+k+'"><span class="sn">'+(k+1)+'</span>'+
        '<div class="fld"><input inputmode="decimal" data-f="w" value="'+esc(st.w)+'" placeholder="'+esc(phW)+'" aria-label="Set '+(k+1)+' '+wLabel+'"><span>'+wLabel+'</span></div>'+
        '<div class="fld"><input inputmode="decimal" data-f="r" value="'+esc(st.r)+'" placeholder="'+esc(pd.reps)+'" aria-label="Set '+(k+1)+' '+unitLabel(pd.unit)+'"><span>'+unitLabel(pd.unit)+'</span></div>'+
        '<button class="ok" data-act="ok" aria-label="Set '+(k+1)+' done">✓</button></div>';
    }
    h += '</div><div class="rowbtns"><button class="ghost" data-act="addset">+ Add set</button></div></section>';
  });
  const knee = s ? s.knee : null;
  h += '<div class="card"><h3>Left knee today</h3><div class="muted small">0 = no pain · 3 = fine · 6+ = stop leg work</div><div class="scale">';
  for(let v=0; v<=10; v++) h += '<button class="'+(v<=3?'g':v<=5?'a':'r')+(knee === v ? ' on' : '')+'" data-act="knee" data-v="'+v+'">'+v+'</button>';
  h += '</div><textarea id="notes" placeholder="Notes (how it felt, anything to change)">'+esc(s ? s.notes : "")+'</textarea></div>';
  h += '<button class="btn '+(s && s.done ? 'line' : 'turf')+'" data-act="finish">'+(s && s.done ? 'Session done ✓ (tap to undo)' : 'Finish session')+'</button>';
  view.innerHTML = h;
}

function onTodayClick(e){
  const b = e.target.closest("[data-act]"); if(!b) return;
  const act = b.dataset.act, w = cur.w, day = DAYS[cur.d];
  if(act === "prev" || act === "next"){
    let idx = w*7 + cur.d + (act === "next" ? 1 : -1);
    idx = Math.max(0, Math.min(55, idx)); cur = {w:Math.floor(idx/7), d:idx%7}; stopTimer(); render(); window.scrollTo(0,0); return;
  }
  const s = ensureSession(w, day);
  if(act === "knee"){ s.knee = +b.dataset.v; touch(s); render(); return; }
  if(act === "finish"){
    s.done = !s.done; touch(s);
    if(s.done){ stopTimer(); toast("Session saved. Nice work."); syncNow(); }
    render(); return;
  }
  const card = b.closest(".exc"); if(!card) return;
  const name = card.dataset.name, unit = card.dataset.unit;
  const ex = s.ex[name] || (s.ex[name] = {unit:unit, sets:[]});
  ex.unit = unit;
  if(act === "addset"){ ex.sets.push({w:"", r:"", ok:false}); touch(s); render(); return; }
  if(act === "ok"){
    const row = b.closest(".set"), i = +row.dataset.i;
    while(ex.sets.length <= i) ex.sets.push({w:"", r:"", ok:false});
    const st = ex.sets[i];
    const wIn = row.querySelector('[data-f="w"]'), rIn = row.querySelector('[data-f="r"]');
    st.ok = !st.ok;
    if(st.ok){
      if(wIn.value === "" && wIn.placeholder && !isNaN(parseFloat(wIn.placeholder))) wIn.value = wIn.placeholder;
      if(rIn.value === "" && rIn.placeholder) rIn.value = rIn.placeholder;
      st.w = wIn.value; st.r = rIn.value;
      const rs = +card.dataset.rest; if(rs) startTimer(rs, name);
      // carry weight into the next empty set
      const next = row.nextElementSibling;
      if(next && st.w){ const nw = next.querySelector('[data-f="w"]'); if(nw && !nw.value) nw.placeholder = st.w; }
    }
    row.classList.toggle("is", st.ok);
    touch(s);
  }
}
function onTodayInput(e){
  const inp = e.target;
  if(inp.id === "notes"){ const s = ensureSession(cur.w, DAYS[cur.d]); s.notes = inp.value; touch(s); return; }
  if(!inp.dataset.f) return;
  const card = inp.closest(".exc"), row = inp.closest(".set"); if(!card || !row) return;
  const s = ensureSession(cur.w, DAYS[cur.d]), name = card.dataset.name;
  const ex = s.ex[name] || (s.ex[name] = {unit:card.dataset.unit, sets:[]});
  const i = +row.dataset.i; while(ex.sets.length <= i) ex.sets.push({w:"", r:"", ok:false});
  ex.sets[i][inp.dataset.f] = inp.value.trim();
  touch(s);
}

/* ---------- rest timer ---------- */
const timerEl = document.getElementById("timer");
let timerEnd = 0, timerInt = null;
function startTimer(secs, name){
  timerEnd = Date.now() + secs*1000; timerEl.hidden = false; timerEl.classList.remove("go");
  timerEl.dataset.name = name; tick(); clearInterval(timerInt); timerInt = setInterval(tick, 500);
}
function tick(){
  const left = Math.ceil((timerEnd - Date.now())/1000);
  if(left <= 0){
    timerEl.classList.add("go");
    timerEl.innerHTML = '<span class="t">GO</span><span class="l">Rest done. Next set of '+esc(timerEl.dataset.name)+'.</span><span class="small">✕</span>';
    if(left < -20) stopTimer();
    return;
  }
  const m = Math.floor(left/60), sec = String(left%60).padStart(2,"0");
  timerEl.innerHTML = '<span class="t">'+m+':'+sec+'</span><span class="l">Rest</span><span class="small">Tap to skip</span>';
}
function stopTimer(){ clearInterval(timerInt); timerEl.hidden = true; }
timerEl.addEventListener("click", stopTimer);

/* ---------- Plan ---------- */
function renderPlan(){
  let h = '<div class="hero"><h2>8-week plan</h2><p class="muted small">Starts '+fmt(start())+'. Tap a day to open it.</p></div><div class="weeks">';
  PH.forEach((p, i) => { h += '<button class="'+p.key+(i === planWeek ? ' on' : '')+'" data-w="'+i+'">'+(i+1)+'</button>'; });
  const p = PH[planWeek];
  h += '</div><div class="card"><div><span class="pill '+p.key+'">Week '+(planWeek+1)+' · '+esc(p.n)+'</span></div><p class="small muted" style="margin:8px 0 4px">'+esc(p.focus)+'</p>';
  DAYS.forEach((d, di) => {
    const s = getSession(key(planWeek, d.id));
    const list = d.items ? itemsFor(d, planWeek).map(it => { const x = pick(it, planWeek); return '<li>'+esc(x.n)+' <span style="white-space:nowrap">· '+esc(x.d)+'</span></li>'; }).join("") : '';
    h += '<div class="dayrow" data-go="'+di+'"><div><div class="d">'+d.dow+'</div><div class="small muted">'+fmt(slotDate(planWeek, di))+'</div></div>'+
      '<div><b>'+esc(d.title)+'</b>'+(list ? '<ul>'+list+'</ul>' : '<div class="small muted">'+esc(d.sub)+'</div>')+'</div>'+
      '<div>'+(s && s.done ? '<span class="pill done">✓</span>' : '')+'</div></div>';
  });
  h += '</div>';
  view.innerHTML = h;
}

/* ---------- Progress ---------- */
function exerciseSeries(name){
  const pts = [];
  sessionsSorted().forEach(s => {
    const ex = s.ex && s.ex[name]; const t = topSet(ex);
    if(t) pts.push({date:s.date, w:t.w, r:t.r, unit:ex.unit || "reps"});
  });
  return pts;
}
function lineChart(pts, opt){
  // pts: [{x:label, y:number, cap:string}] ; single series, one axis
  const W = Math.max(280, Math.min(680, (view.clientWidth || 340) - 30)), H = 170, L = 36, R = 12, T = 12, B = 26;
  if(!pts.length) return '<div class="empty">'+esc(opt.empty || "No data yet.")+'</div>';
  let yMin = opt.yMin !== undefined ? opt.yMin : Math.min.apply(null, pts.map(p => p.y));
  let yMax = opt.yMax !== undefined ? opt.yMax : Math.max.apply(null, pts.map(p => p.y));
  if(opt.yMin === undefined){ const pad = Math.max(5, (yMax - yMin) * 0.15); yMin = Math.max(0, Math.floor((yMin - pad)/5)*5); yMax = Math.ceil((yMax + pad)/5)*5; }
  if(yMax === yMin) yMax = yMin + 10;
  const n = pts.length, xs = i => n === 1 ? L + (W-L-R)/2 : L + i*(W-L-R)/(n-1), ys = v => T + (1 - (v - yMin)/(yMax - yMin))*(H-T-B);
  const ticks = []; const step = opt.step || niceStep((yMax - yMin)/4);
  for(let v = Math.ceil(yMin/step)*step; v <= yMax + 1e-9; v += step) ticks.push(v);
  let s = '<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(opt.label)+'">';
  if(opt.bands) opt.bands.forEach(b => { s += '<rect x="'+L+'" y="'+ys(b.to)+'" width="'+(W-L-R)+'" height="'+(ys(b.from)-ys(b.to))+'" fill="'+b.fill+'" opacity=".5"/>'; });
  ticks.forEach(v => { s += '<line x1="'+L+'" x2="'+(W-R)+'" y1="'+ys(v)+'" y2="'+ys(v)+'" stroke="var(--rule)" stroke-width="1"/><text x="'+(L-6)+'" y="'+(ys(v)+4)+'" text-anchor="end" font-size="11" fill="var(--muted)">'+v+'</text>'; });
  const labIdx = n <= 4 ? pts.map((_, i) => i) : [0, Math.floor((n-1)/2), n-1];
  labIdx.forEach(i => { s += '<text x="'+xs(i)+'" y="'+(H-6)+'" text-anchor="'+(n === 1 ? 'middle' : i === 0 ? 'start' : i === n-1 ? 'end' : 'middle')+'" font-size="11" fill="var(--muted)">'+esc(pts[i].x)+'</text>'; });
  if(n > 1) s += '<polyline fill="none" stroke="'+opt.color+'" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="'+pts.map((p, i) => xs(i)+','+ys(p.y)).join(" ")+'"/>';
  pts.forEach((p, i) => {
    const last = i === n-1;
    s += '<circle cx="'+xs(i)+'" cy="'+ys(p.y)+'" r="'+(last ? 5 : 4)+'" fill="'+(last ? opt.color : 'var(--surface)')+'" stroke="'+opt.color+'" stroke-width="2"/>'+
      '<circle class="hit" data-cap="'+esc(p.cap)+'" cx="'+xs(i)+'" cy="'+ys(p.y)+'" r="16" fill="transparent" style="cursor:pointer"/>';
  });
  s += '</svg>';
  return s + '<div class="cap">'+esc(pts[n-1].cap)+'</div>';
}
function niceStep(raw){ const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9)))); const f = raw/p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
function shortDate(isoStr){ const d = parseISO(isoStr); return fmt(d); }

function renderProgress(){
  const all = sessionsSorted();
  const done = Object.values(data.sessions).filter(s => !s.deleted && s.done && TRAIN_DAYS.indexOf(s.day) >= 0).length;
  const tw = todaySlot().w;
  const weekDone = TRAIN_DAYS.filter(id => { const s = getSession(key(tw, id)); return s && s.done; }).length;
  let h = '<div class="hero"><h2>Progress</h2></div><div class="tiles">'+
    '<div class="tile"><div class="v">'+done+'<span class="muted" style="font-size:18px"> / 40</span></div><div class="k">Sessions done</div></div>'+
    '<div class="tile"><div class="v">'+weekDone+'<span class="muted" style="font-size:18px"> / 5</span></div><div class="k">This week (week '+(tw+1)+')</div></div></div>';
  // exercise chart
  const names = {}; all.forEach(s => Object.keys(s.ex || {}).forEach(n => { if(topSet(s.ex[n])) names[n] = (names[n] || 0) + 1; }));
  const nameList = Object.keys(names).sort();
  if(!chartPick || nameList.indexOf(chartPick) < 0){
    const mains = ["Bench press","Trap bar deadlift","Trap bar deadlift (high handles)","Barbell box squat","Landmine squat","Lat pulldown","Pull-up (band-assisted if needed)"];
    chartPick = mains.find(n => nameList.indexOf(n) >= 0) || nameList[0] || null;
  }
  h += '<div class="card"><h3>Lift progress</h3>';
  if(!nameList.length){ h += '<div class="empty">Log a few sets on the Today tab and your charts show up here.</div>'; }
  else{
    h += '<label class="f">Exercise<select id="exPick">'+nameList.map(n => '<option'+(n === chartPick ? ' selected' : '')+'>'+esc(n)+'</option>').join("")+'</select></label>';
    const ser = exerciseSeries(chartPick);
    const useW = ser.some(p => p.w > 0);
    const pts = ser.map(p => ({x:shortDate(p.date), y:useW ? p.w : p.r, cap:shortDate(p.date)+' · '+describeTop({w:p.w, r:p.r}, p.unit)}));
    h += '<div class="chart" id="exChart">'+lineChart(pts, {color:"var(--turf)", label:chartPick+(useW ? " top set weight" : " best set"), empty:"No sets logged yet."})+'</div>';
    h += '<div class="small muted">'+(useW ? 'Heaviest set each session, in lb.' : 'Best set each session ('+unitLabel(ser[0] ? ser[0].unit : "reps")+').')+' Tap a point for details.</div>';
    if(ser.length){
      h += '<table class="hist">'+ser.slice().reverse().slice(0,8).map(p => '<tr><td>'+shortDate(p.date)+'</td><td>'+esc(describeTop({w:p.w, r:p.r}, p.unit))+'</td></tr>').join("")+'</table>';
    }
  }
  h += '</div>';
  // knee chart
  const kp = all.filter(s => s.knee !== null && s.knee !== undefined).map(s => ({x:shortDate(s.date), y:s.knee, cap:shortDate(s.date)+' · '+(DAYS.find(d => d.id === s.day) || {}).title+' · knee '+s.knee+'/10'}));
  h += '<div class="card"><h3>Left knee</h3><div class="chart" id="kneeChart">'+lineChart(kp, {color:"var(--ink)", yMin:0, yMax:10, step:2, label:"Knee pain by session", empty:"Rate your knee at the end of each session.",
       bands:[{from:0,to:3,fill:"var(--turf-soft)"},{from:3,to:5,fill:"var(--clay-soft)"},{from:5,to:10,fill:"var(--ball-soft)"}]})+'</div>'+
       '<div class="small muted">Green 0–3 is fine. Amber 4–5: go lighter. Red: stop leg work.</div></div>';
  // bodyweight
  const bw = Object.values(data.body).filter(b => !b.deleted).sort((a,b) => a.date < b.date ? -1 : 1);
  h += '<div class="card"><h3>Bodyweight</h3><div style="display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:8px"><input class="in" id="bwIn" inputmode="decimal" placeholder="e.g. 212"><button class="btn" style="width:auto;padding:0 18px" data-act="bw">Log</button></div>'+
    '<div class="chart" id="bwChart">'+lineChart(bw.map(b => ({x:shortDate(b.date), y:b.lb, cap:shortDate(b.date)+' · '+b.lb+' lb'})), {color:"var(--ball)", label:"Bodyweight", empty:"Log your weight once a week, same time of day."})+'</div></div>';
  view.innerHTML = h;
}
function onProgressClick(e){
  const hit = e.target.closest(".hit");
  if(hit){ const cap = hit.closest(".chart").querySelector(".cap"); if(cap) cap.textContent = hit.dataset.cap; return; }
  const b = e.target.closest("[data-act='bw']");
  if(b){
    const v = parseFloat(document.getElementById("bwIn").value);
    if(!v || v < 80 || v > 500){ toast("Enter your weight in lb."); return; }
    const d = iso(new Date());
    data.body[d] = {id:d, date:d, lb:v, updatedAt:Date.now()}; persist(); render(); toast("Bodyweight logged.");
  }
}

/* ---------- Guide ---------- */
function renderGuide(){ view.innerHTML = '<div class="hero"><h2>Guide</h2></div>' + document.getElementById("guideTpl").innerHTML; }

/* ---------- Settings sheet ---------- */
function openSettings(){
  const sh = document.createElement("div"); sh.className = "sheet";
  sh.innerHTML = '<div class="panel stack">'+
    '<div style="display:flex;align-items:center"><h2 style="flex:1">Settings</h2><button class="round" data-x="1" aria-label="Close">✕</button></div>'+
    '<div class="card"><h3>Program</h3><label class="f">Week 1 starts (Monday)<input class="in" type="date" id="sStart" value="'+esc(data.settings.startDate)+'"></label>'+
    '<p class="small muted" style="margin-top:8px">Program version '+esc(P.version)+'. It updates automatically when you open the app online.</p></div>'+
    '<div class="card"><h3>Sync</h3><p class="small muted" style="margin:4px 0 0">Your log is saved on this device. When online, it syncs to <b>log.json</b> in your private GitHub repo, so your phone and PC stay in step.</p>'+
    '<label class="f">GitHub username<input class="in" id="sOwner" autocapitalize="off" autocorrect="off" value="'+esc(cfg.owner)+'"></label>'+
    '<label class="f">Private data repo<input class="in" id="sRepo" autocapitalize="off" autocorrect="off" value="'+esc(cfg.repo)+'"></label>'+
    '<label class="f">Access token<input class="in" id="sToken" type="password" autocapitalize="off" autocorrect="off" placeholder="github_pat_…" value="'+esc(cfg.token)+'"></label>'+
    '<p class="small muted" style="margin-top:6px">Last sync: '+(cfg.lastSync ? new Date(cfg.lastSync).toLocaleString() : 'never')+(cfg.err ? '<br><span style="color:var(--ball)">'+esc(cfg.err)+'</span>' : '')+'</p>'+
    '<button class="btn turf" data-save="1" style="margin-top:8px">Save &amp; sync now</button></div>'+
    '<div class="card"><h3>Backup</h3><p class="small muted" style="margin:4px 0 8px">A copy of your full log as a file, in case you ever need it.</p>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn line" data-export="1">Export</button><label class="btn line" style="text-align:center">Import<input type="file" id="sImport" accept="application/json,.json" hidden></label></div></div>'+
    '</div>';
  document.body.appendChild(sh);
  sh.addEventListener("click", async e => {
    if(e.target === sh || e.target.closest("[data-x]")){ sh.remove(); return; }
    if(e.target.closest("[data-save]")){
      const sd = document.getElementById("sStart").value;
      if(sd && sd !== data.settings.startDate){ data.settings.startDate = sd; data.settings.updatedAt = Date.now(); persist(); cur = todaySlot(); planWeek = cur.w; }
      cfg.owner = document.getElementById("sOwner").value.trim();
      cfg.repo = document.getElementById("sRepo").value.trim();
      cfg.token = document.getElementById("sToken").value.trim();
      save("ppa-cfg", cfg); sh.remove(); render(); await syncNow(true); return;
    }
    if(e.target.closest("[data-export]")) exportData();
  });
  sh.querySelector("#sImport").addEventListener("change", ev => {
    const f = ev.target.files[0]; if(!f) return;
    const rd = new FileReader();
    rd.onload = () => { try{ const inc = JSON.parse(rd.result); data = merge(data, inc); persist(); sh.remove(); render(); toast("Backup imported and merged."); }catch(err){ toast("That file isn't a Pace & Power backup."); } };
    rd.readAsText(f);
  });
}
function exportData(){
  const txt = JSON.stringify(data, null, 1), name = "pace-power-log-"+iso(new Date())+".json";
  try{
    const file = new File([txt], name, {type:"application/json"});
    if(navigator.canShare && navigator.canShare({files:[file]})){ navigator.share({files:[file], title:name}).catch(() => {}); return; }
  }catch(e){}
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([txt], {type:"application/json"})); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ---------- merge + sync ---------- */
function mergeMap(a, b){
  const out = {}; a = a || {}; b = b || {};
  Object.keys(a).concat(Object.keys(b)).forEach(k => {
    const x = a[k], y = b[k];
    out[k] = !x ? y : !y ? x : ((y.updatedAt || 0) > (x.updatedAt || 0) ? y : x);
  });
  return out;
}
function merge(local, remote){
  if(!remote) return local;
  const ls = local.settings || {}, rs = remote.settings || {};
  return {
    sessions: mergeMap(local.sessions, remote.sessions),
    body: mergeMap(local.body, remote.body),
    settings: (rs.updatedAt || 0) > (ls.updatedAt || 0) ? rs : ls
  };
}
function stable(o){
  if(Array.isArray(o)) return "["+o.map(stable).join(",")+"]";
  if(o && typeof o === "object") return "{"+Object.keys(o).sort().map(k => JSON.stringify(k)+":"+stable(o[k])).join(",")+"}";
  return JSON.stringify(o);
}
function b64enc(str){ const bytes = new TextEncoder().encode(str); let bin = ""; for(let i=0; i<bytes.length; i+=0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i+0x8000)); return btoa(bin); }
function b64dec(b64){ const bin = atob(b64.replace(/\s/g, "")); const bytes = new Uint8Array(bin.length); for(let i=0; i<bin.length; i++) bytes[i] = bin.charCodeAt(i); return new TextDecoder().decode(bytes); }

const statusEl = document.getElementById("syncStatus");
function showStatus(){
  if(!cfg.token){ statusEl.textContent = "Sync off"; statusEl.className = "sync"; return; }
  if(cfg.err){ statusEl.textContent = "Sync issue"; statusEl.className = "sync err"; return; }
  if(!navigator.onLine){ statusEl.textContent = dirty ? "Offline · saved on phone" : "Offline"; statusEl.className = "sync"; return; }
  statusEl.textContent = dirty ? "Not synced yet" : (cfg.lastSync ? "Synced " + new Date(cfg.lastSync).toLocaleTimeString([], {hour:"numeric", minute:"2-digit"}) : ""); statusEl.className = "sync";
}
let syncing = false, syncTimer = null;
function scheduleSync(){ showStatus(); clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow(), 15000); }
async function syncNow(manual){
  showStatus();
  if(syncing || !cfg.token || !cfg.owner || !cfg.repo) return;
  if(!navigator.onLine){ if(manual) toast("You're offline. Your log is saved and will sync later."); return; }
  syncing = true; statusEl.textContent = "Syncing…";
  const url = "https://api.github.com/repos/"+encodeURIComponent(cfg.owner)+"/"+encodeURIComponent(cfg.repo)+"/contents/log.json";
  const hd = {"Authorization":"Bearer "+cfg.token, "Accept":"application/vnd.github+json", "X-GitHub-Api-Version":"2022-11-28"};
  try{
    for(let attempt = 0; attempt < 3; attempt++){
      const r = await fetch(url+"?ts="+Date.now(), {headers:hd, cache:"no-store"});
      let remote = null, sha;
      if(r.status === 200){ const j = await r.json(); sha = j.sha; remote = JSON.parse(b64dec(j.content)); }
      else if(r.status === 401) throw new Error("GitHub rejected the token. Check it in Settings.");
      else if(r.status === 404){ /* no file yet, or no access */ }
      else if(r.status === 403) throw new Error("The token doesn't have access to this repo.");
      else throw new Error("GitHub error "+r.status+". Will retry later.");
      const merged = merge(data, remote);
      data = merged; save("ppa-data", data);
      if(remote && stable(remote) === stable(merged)){ break; }
      const body = {message:"Log update "+new Date().toISOString(), content:b64enc(JSON.stringify(merged, null, 1))};
      if(sha) body.sha = sha;
      const p = await fetch(url, {method:"PUT", headers:Object.assign({"Content-Type":"application/json"}, hd), body:JSON.stringify(body)});
      if(p.ok) break;
      if(p.status === 409 || p.status === 422) continue;
      if(p.status === 404) throw new Error("Repo not found. Check the username, repo name and token access.");
      if(p.status === 403) throw new Error("The token can't write to this repo. Give it Contents: Read and write.");
      throw new Error("GitHub error "+p.status+". Will retry later.");
    }
    cfg.lastSync = Date.now(); cfg.err = ""; dirty = false; save("ppa-dirty", false);
    if(manual) toast("Synced.");
    if(tab !== "today") render();
  }catch(err){
    cfg.err = err.message || "Sync failed. Will retry later.";
    if(manual) toast(cfg.err);
  }finally{
    save("ppa-cfg", cfg); syncing = false; showStatus();
  }
}
window.addEventListener("online", () => syncNow());
window.addEventListener("offline", showStatus);
document.addEventListener("visibilitychange", () => { if(document.visibilityState === "hidden" && dirty) syncNow(); if(document.visibilityState === "visible") syncNow(); });

/* ---------- render / tabs ---------- */
function render(){
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
  if(tab === "today") renderToday();
  else if(tab === "plan") renderPlan();
  else if(tab === "progress") renderProgress();
  else renderGuide();
  showStatus();
}
document.getElementById("tabs").addEventListener("click", e => {
  const b = e.target.closest("[data-tab]"); if(!b) return;
  tab = b.dataset.tab; if(tab === "today") cur = cur || todaySlot(); render(); window.scrollTo(0,0);
});
view.addEventListener("click", e => {
  if(tab === "today") onTodayClick(e);
  else if(tab === "plan"){ const wb = e.target.closest("[data-w]"); if(wb){ planWeek = +wb.dataset.w; render(); return; }
    const go = e.target.closest("[data-go]"); if(go){ cur = {w:planWeek, d:+go.dataset.go}; tab = "today"; render(); window.scrollTo(0,0); } }
  else if(tab === "progress") onProgressClick(e);
});
view.addEventListener("input", e => { if(tab === "today") onTodayInput(e); });
view.addEventListener("change", e => { if(e.target.id === "exPick"){ chartPick = e.target.value; render(); } });
document.getElementById("gear").addEventListener("click", openSettings);

/* ---------- boot ---------- */
if("serviceWorker" in navigator && location.protocol !== "file:"){ navigator.serviceWorker.register("sw.js").catch(() => {}); }
const seen = load("ppa-progver", null);
if(seen && seen !== P.version) setTimeout(() => toast("Program updated."), 600);
save("ppa-progver", P.version);
render();
setTimeout(() => syncNow(), 800);
window.__ppa = {merge:merge, parseDose:parseDose, stable:stable};
})();
