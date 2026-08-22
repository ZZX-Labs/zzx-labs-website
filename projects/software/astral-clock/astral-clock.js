(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const YEAR_S = 31557600;
  const bodyOrder = ["earth","moon","mars","ganymede"];
  const state = {
    bodies: AstralBodies.bodies,
    timer: null
  };

  function allBodies() {
    return Object.values(state.bodies);
  }

  function body(id) {
    return state.bodies[id];
  }

  function fillSelect(select, value) {
    select.replaceChildren();
    for (const b of allBodies()) {
      const o = document.createElement("option");
      o.value = b.id;
      o.textContent = b.name;
      select.appendChild(o);
    }
    if (value && state.bodies[value]) select.value = value;
  }

  function fillAllSelects() {
    fillSelect($("convert-from"), "earth");
    fillSelect($("convert-to"), "mars");
    fillSelect($("drift-a"), "earth");
    fillSelect($("drift-b"), "moon");
    fillSelect($("signal-from"), "earth");
    fillSelect($("signal-to"), "mars");
  }

  function formatClock(ms) {
    const d = new Date(ms);
    return d.toISOString().replace("T"," ").replace("Z"," UTC");
  }

  function updateLive() {
    const now = Date.now();
    for (const id of bodyOrder) {
      const b = body(id);
      const ms = id === "earth" ? now : AstralTimeModel.earthMsToBodyMs(now, b);
      $(`clock-${id}`).textContent = formatClock(ms);
      const offset = id === "earth" ? 0 : AstralTimeModel.offsetVsEarthSeconds(now, b);
      $(`offset-${id}`).textContent = AstralTimeModel.formatDuration(offset);
      $(`rate-${id}`).textContent = AstralTimeModel.relativeRate(b).toFixed(12);
    }
  }

  function localInputNow() {
    const d = new Date();
    const local = new Date(d.getTime() - d.getTimezoneOffset()*60000);
    return local.toISOString().slice(0,23);
  }

  function convert() {
    const from = body($("convert-from").value);
    const to = body($("convert-to").value);
    const raw = $("convert-time").value;
    if (!raw) throw new Error("Choose a source date/time.");

    const sourceMs = new Date(raw).getTime();
    if (!Number.isFinite(sourceMs)) throw new Error("Invalid source time.");

    const targetMs = AstralTimeModel.convertMs(sourceMs, from, to);
    const earthMs = from.id === "earth"
      ? sourceMs
      : AstralTimeModel.bodyMsToEarthMs(sourceMs, from);

    const sourceRate = AstralTimeModel.relativeRate(from);
    const targetRate = AstralTimeModel.relativeRate(to);

    $("convert-result").innerHTML =
      `<strong>${from.name} → ${to.name}</strong>\n` +
      `Source clock: ${AstralTimeModel.iso(sourceMs)}\n` +
      `Earth coordinate: ${AstralTimeModel.iso(earthMs)}\n` +
      `Target clock: ${AstralTimeModel.iso(targetMs)}\n` +
      `Relative rate source: ${sourceRate.toFixed(15)}\n` +
      `Relative rate target: ${targetRate.toFixed(15)}`;
  }

  function drawDriftCanvas(a,b,duration) {
    const canvas = $("drift-canvas");
    const ctx = canvas.getContext("2d");
    const dpr = Math.max(1, Math.min(2, devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(320, Math.round(rect.width));
    const h = Math.max(260, Math.round(rect.height || 320));
    canvas.width = Math.round(w*dpr);
    canvas.height = Math.round(h*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);

    ctx.fillStyle = "#050505";
    ctx.fillRect(0,0,w,h);
    ctx.strokeStyle = "rgba(255,255,255,.04)";
    ctx.lineWidth = 1;
    for (let x=0;x<=w;x+=50) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
    for (let y=0;y<=h;y+=40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }

    const pad = 42;
    const total = AstralTimeModel.driftSeconds(a,b,duration);
    const maxAbs = Math.max(Math.abs(total), 1e-12);
    const mid = h/2;

    ctx.strokeStyle = "#343434";
    ctx.beginPath();
    ctx.moveTo(pad,mid);
    ctx.lineTo(w-pad,mid);
    ctx.stroke();

    ctx.strokeStyle = "#c0d674";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const points = 120;
    for (let i=0;i<=points;i++) {
      const t = duration * i/points;
      const drift = AstralTimeModel.driftSeconds(a,b,t);
      const x = pad + (w-pad*2)*i/points;
      const y = mid - (drift/maxAbs)*(h*.36);
      if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();

    ctx.fillStyle = "#e6a42b";
    ctx.font = '11px "IBM Plex Mono", monospace';
    ctx.fillText(`${a.name} - ${b.name}`, pad, 18);
    ctx.fillStyle = "#969696";
    ctx.fillText(`final drift ${AstralTimeModel.formatDuration(total)}`, pad, h-12);
  }

  function calculateDrift() {
    const a = body($("drift-a").value);
    const b = body($("drift-b").value);
    const duration = Number($("drift-duration").value);
    const ra = AstralTimeModel.relativeRate(a);
    const rb = AstralTimeModel.relativeRate(b);
    const diff = ra-rb;
    const total = diff*duration;

    $("drift-rate-a").textContent = ra.toFixed(15);
    $("drift-rate-b").textContent = rb.toFixed(15);
    $("drift-rate-diff").textContent = diff.toExponential(6);
    $("drift-total").textContent = AstralTimeModel.formatDuration(total);

    drawDriftCanvas(a,b,duration);
  }

  function loadSignalPreset() {
    const a = $("signal-from").value;
    const b = $("signal-to").value;
    $("signal-distance").value = String(Math.round(AstralBodies.representativeDistance(a,b)));
  }

  function calculateSignal() {
    const a = body($("signal-from").value);
    const b = body($("signal-to").value);
    const distance = Number($("signal-distance").value);
    if (!(distance >= 0)) throw new Error("Distance must be non-negative.");

    const one = AstralTimeModel.lightTimeSeconds(distance);
    $("signal-distance-out").textContent = `${distance.toLocaleString()} km`;
    $("signal-oneway").textContent = AstralTimeModel.formatDuration(one);
    $("signal-roundtrip").textContent = AstralTimeModel.formatDuration(one*2);
    $("signal-result").innerHTML =
      `<strong>${a.name} → ${b.name}</strong>\n` +
      `Path distance: ${distance.toLocaleString()} km\n` +
      `One-way light time: ${one.toFixed(9)} s\n` +
      `Round-trip light time: ${(one*2).toFixed(9)} s\n` +
      `This excludes routing, atmospheric, processing, Shapiro, and ephemeris corrections.`;
  }

  function drawSimulation(years) {
    const canvas = $("sim-canvas");
    const ctx = canvas.getContext("2d");
    const dpr = Math.max(1, Math.min(2, devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(320,Math.round(rect.width));
    const h = Math.max(260,Math.round(rect.height || 320));
    canvas.width = Math.round(w*dpr);
    canvas.height = Math.round(h*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.fillStyle="#050505";
    ctx.fillRect(0,0,w,h);

    const pad=44;
    const series = ["moon","mars","ganymede"].map(id => ({
      id,
      body:body(id),
      final:AstralTimeModel.driftSeconds(body(id),body("earth"),years*YEAR_S)
    }));
    const maxAbs=Math.max(1e-12,...series.map(s=>Math.abs(s.final)));
    const mid=h/2;

    ctx.strokeStyle="rgba(255,255,255,.04)";
    for(let x=0;x<=w;x+=50){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
    for(let y=0;y<=h;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}

    const styles=["#c0d674","#e6a42b","#aabf9a"];
    series.forEach((s,idx)=>{
      ctx.strokeStyle=styles[idx];
      ctx.lineWidth=2;
      ctx.beginPath();
      const points=100;
      for(let i=0;i<=points;i++){
        const tYears=years*i/points;
        const drift=AstralTimeModel.driftSeconds(s.body,body("earth"),tYears*YEAR_S);
        const x=pad+(w-pad*2)*i/points;
        const y=mid-(drift/maxAbs)*(h*.36);
        if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.stroke();
      ctx.fillStyle=styles[idx];
      ctx.font='10px "IBM Plex Mono", monospace';
      ctx.fillText(s.body.name,pad+idx*95,16);
    });
  }

  function updateSimulation() {
    const years = Number($("sim-years").value);
    $("sim-years-label").textContent = `${years.toFixed(1)} years`;
    $("sim-earth").textContent = `${years.toFixed(1)} years`;

    for (const id of ["moon","mars","ganymede"]) {
      const drift = AstralTimeModel.driftSeconds(body(id),body("earth"),years*YEAR_S);
      $(`sim-${id}`).textContent = AstralTimeModel.formatDuration(drift);
    }
    drawSimulation(years);
  }

  function renderBodies() {
    const tbody = $("body-table");
    tbody.replaceChildren();
    for (const b of allBodies()) {
      const c = AstralTimeModel.rateComponents(b);
      const tr = document.createElement("tr");
      const values = [
        b.name,
        Number(b.massKg).toExponential(6),
        Number(b.radiusKm).toLocaleString(),
        c.rotationVelocityKmS.toFixed(6),
        Number(b.externalVelocityKmS).toFixed(6)
      ];
      values.forEach((v,i)=>{
        const td=document.createElement("td");
        if(i===0){const code=document.createElement("code");code.textContent=v;td.appendChild(code);}
        else td.textContent=v;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
  }

  function addCustomBody() {
    const b = {
      id: "custom",
      name: $("custom-name").value.trim() || "Custom Body",
      massKg: Number($("custom-mass").value),
      radiusKm: Number($("custom-radius").value),
      rotationHours: Number($("custom-rotation").value),
      externalVelocityKmS: Number($("custom-orbit-v").value),
      representativeDistanceKm: Number($("custom-distance").value),
      parent: "custom"
    };

    if (!(b.massKg >= 0) || !(b.radiusKm > 0) || !(b.rotationHours > 0) || !(b.externalVelocityKmS >= 0)) {
      throw new Error("Custom-body physical parameters are invalid.");
    }

    state.bodies.custom = b;
    const c = AstralTimeModel.rateComponents(b);

    fillAllSelects();
    renderBodies();

    $("custom-result").innerHTML =
      `<strong>${b.name}</strong>\n` +
      `Modeled rate: ${c.rate.toFixed(15)}\n` +
      `Relative to Earth: ${AstralTimeModel.relativeRate(b).toFixed(15)}\n` +
      `Surface rotation speed: ${c.rotationVelocityKmS.toFixed(6)} km/s\n` +
      `Gravity term: ${c.gravityTerm.toExponential(6)}\n` +
      `Velocity term: ${c.velocityTerm.toExponential(6)}`;
  }

  function bind(id,event,fn) {
    $(id)?.addEventListener(event, e => {
      try { fn(e); }
      catch (err) {
        console.error(err);
        const target =
          id.startsWith("convert") ? $("convert-result") :
          id.startsWith("signal") ? $("signal-result") :
          id.startsWith("custom") ? $("custom-result") :
          null;
        if (target) target.textContent = `ERROR: ${err.message}`;
      }
    });
  }

  function exposeApi() {
    window.AstralClock = Object.freeze({
      version: "0.1.0-alpha-web",
      bodies() { return allBodies().map(x => ({...x})); },
      rate(bodyId) {
        const b = body(bodyId);
        if (!b) throw new Error("Unknown body.");
        return AstralTimeModel.rateComponents(b);
      },
      relativeRate(bodyId) {
        const b = body(bodyId);
        if (!b) throw new Error("Unknown body.");
        return AstralTimeModel.relativeRate(b);
      },
      convert(timestampMs, fromId, toId) {
        const a=body(fromId),b=body(toId);
        if(!a||!b)throw new Error("Unknown body.");
        return AstralTimeModel.convertMs(timestampMs,a,b);
      },
      driftSeconds(aId,bId,durationSeconds) {
        const a=body(aId),b=body(bId);
        if(!a||!b)throw new Error("Unknown body.");
        return AstralTimeModel.driftSeconds(a,b,durationSeconds);
      },
      signalDelaySeconds(distanceKm) {
        return AstralTimeModel.lightTimeSeconds(distanceKm);
      },
      addCustomBody(params) {
        state.bodies.custom={id:"custom",name:params.name||"Custom Body",...params};
        fillAllSelects();renderBodies();
        return {...state.bodies.custom};
      },
      getState() {
        return {
          epochMs:AstralTimeModel.EPOCH_MS,
          reference:"earth",
          bodies:Object.keys(state.bodies)
        };
      }
    });
  }

  fillAllSelects();
  renderBodies();
  updateLive();
  $("convert-time").value = localInputNow();
  loadSignalPreset();
  calculateDrift();
  updateSimulation();

  bind("convert-now","click",()=>{$("convert-time").value=localInputNow();});
  bind("convert-run","click",convert);
  bind("convert-swap","click",()=>{
    const a=$("convert-from").value;
    $("convert-from").value=$("convert-to").value;
    $("convert-to").value=a;
  });
  bind("drift-run","click",calculateDrift);
  bind("signal-preset","click",loadSignalPreset);
  bind("signal-run","click",calculateSignal);
  bind("signal-from","change",loadSignalPreset);
  bind("signal-to","change",loadSignalPreset);
  bind("sim-years","input",updateSimulation);
  bind("custom-add","click",addCustomBody);

  state.timer = setInterval(updateLive,100);
  window.addEventListener("beforeunload",()=>clearInterval(state.timer));

  exposeApi();
  window.ZZXHooks?.emit("astral-clock:ready",{version:"0.1.0-alpha-web"});
})();
