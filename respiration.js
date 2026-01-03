/* =========================================================
   Vivario — respiration.js (v27)
   FIX:
   - Cadrage WebGL (plus de débordement / zoom dans le cadre)
   - Silhouette "vrais poumons" (2 lobes + creux central + encoche haut)
   - Garde: UI/rythme/voix/boutons/canvases validés
   - Android-safe (WebGL1, pas de textures)
   ========================================================= */

(() => {
  "use strict";

  /* ---------------------------
     Helpers DOM
  --------------------------- */
  const $ = (sel) => document.querySelector(sel);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------------------------
     Elements
  --------------------------- */
  const glCanvas   = $("#glCanvas");
  const airCanvas  = $("#airCanvas");
  const btnStart   = $("#btnStart");
  const btnStop    = $("#btnStop");
  const selRhythm  = $("#rhythmSelect") || $("#selRhythm");

  const optVoice     = $("#optVoice");
  const optCountdown = $("#optCount") || $("#optCountdown");
  const optTick      = $("#optTick");
  const optVibrate   = $("#optVibe") || $("#optVibrate");
  const optCoach     = $("#optSoft") || $("#optCoach");

  if (!glCanvas || !airCanvas || !btnStart || !btnStop || !selRhythm) {
    console.warn("[respiration.js] Éléments manquants.");
    return;
  }

  /* ---------------------------
     Persistent settings
  --------------------------- */
  const LS_KEY = "vivario_breath_settings_v1";
  const defaultSettings = {
    voice: true,
    countdown: true,
    tick: true,
    vibrate: false,
    coach: true,
    rhythm: "4-0-6",
    voiceRate: 0.95,
    voicePitch: 1.05,
    voiceVolume: 0.95
  };

  function loadSettings() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return { ...defaultSettings };
      const obj = JSON.parse(raw);
      return { ...defaultSettings, ...obj };
    } catch {
      return { ...defaultSettings };
    }
  }
  function saveSettings() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch {}
  }
  let settings = loadSettings();

  function setToggle(el, val) {
    if (!el) return;
    if ("checked" in el) el.checked = !!val;
    el.classList.toggle("is-on", !!val);
    el.setAttribute("aria-pressed", String(!!val));
  }

  setToggle(optVoice, settings.voice);
  setToggle(optCountdown, settings.countdown);
  setToggle(optTick, settings.tick);
  setToggle(optVibrate, settings.vibrate);
  setToggle(optCoach, settings.coach);

  if ([...selRhythm.options].some(o => o.value === settings.rhythm)) {
    selRhythm.value = settings.rhythm;
  } else {
    settings.rhythm = selRhythm.value || settings.rhythm;
  }

  function bindToggle(el, key) {
    if (!el) return;
    const handler = () => {
      const val = ("checked" in el) ? el.checked : !settings[key];
      settings[key] = !!val;
      setToggle(el, settings[key]);
      saveSettings();
    };
    el.addEventListener("change", handler);
    el.addEventListener("click", () => { if (!("checked" in el)) handler(); });
  }

  bindToggle(optVoice, "voice");
  bindToggle(optCountdown, "countdown");
  bindToggle(optTick, "tick");
  bindToggle(optVibrate, "vibrate");
  bindToggle(optCoach, "coach");

  selRhythm.addEventListener("change", () => {
    settings.rhythm = selRhythm.value;
    saveSettings();
    if (running) restart();
  });

  /* ---------------------------
     Rythmes
  --------------------------- */
  function parseRhythm(v) {
    const m = String(v || "").trim().match(/^(\d+)\s*-\s*(\d+)\s*-\s*(\d+)$/);
    if (m) {
      const inhale = parseInt(m[1], 10);
      const hold   = parseInt(m[2], 10);
      const exhale = parseInt(m[3], 10);
      if ([inhale, hold, exhale].every(Number.isFinite)) return { inhale, hold, exhale };
    }
    return { inhale: 4, hold: 0, exhale: 6 };
  }
  function getRhythm() { return parseRhythm(settings.rhythm); }

  /* ---------------------------
     Audio: souffle + tick
  --------------------------- */
  let audioCtx = null;
  let breathNoise = null;
  let masterGain = null;

  function ensureAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.65;
    masterGain.connect(audioCtx.destination);
  }

  function startBreathNoise() {
    ensureAudio();
    if (breathNoise) return;

    const bufferSize = 2 * audioCtx.sampleRate;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const out = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) out[i] = Math.random() * 2 - 1;

    const src = audioCtx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;

    const filter = audioCtx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 900;
    filter.Q.value = 0.9;

    const gain = audioCtx.createGain();
    gain.gain.value = 0.0;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    src.start();

    breathNoise = { src, gain, filter };
  }

  function stopBreathNoise() {
    if (!breathNoise) return;
    try { breathNoise.src.stop(); } catch {}
    try { breathNoise.src.disconnect(); } catch {}
    try { breathNoise.gain.disconnect(); } catch {}
    try { breathNoise.filter.disconnect(); } catch {}
    breathNoise = null;
  }

  function playTick() {
    if (!settings.tick) return;
    ensureAudio();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.0001;

    osc.connect(gain);
    gain.connect(masterGain);

    const t = audioCtx.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.08, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.10);

    osc.start(t);
    osc.stop(t + 0.12);
  }

  function setBreathSound(stage, breath01) {
    if (!breathNoise) return;
    const base = 0.015;
    const amp = stage === "exhale"
      ? lerp(base, 0.08, breath01)
      : lerp(base, 0.06, breath01);

    breathNoise.gain.gain.setTargetAtTime(amp, audioCtx.currentTime, 0.06);

    const f = stage === "exhale"
      ? lerp(650, 1100, breath01)
      : lerp(750, 1400, breath01);

    breathNoise.filter.frequency.setTargetAtTime(f, audioCtx.currentTime, 0.06);
  }

  /* ---------------------------
     Voice
  --------------------------- */
  let chosenVoice = null;
  function pickSoftFemaleVoiceFR() {
    const voices = window.speechSynthesis?.getVoices?.() || [];
    const fr = voices.filter(v => (v.lang || "").toLowerCase().startsWith("fr"));
    const prefer = (list) => {
      const score = (v) => {
        const n = (v.name || "").toLowerCase();
        let s = 0;
        if (n.includes("female")) s += 4;
        if (n.includes("natural")) s += 3;
        if (n.includes("google")) s += 2;
        if (n.includes("microsoft")) s += 2;
        if (n.includes("audrey") || n.includes("julie") || n.includes("marie") || n.includes("amelie")) s += 3;
        if (n.includes("thomas") || n.includes("paul") || n.includes("antoine")) s -= 2;
        return s;
      };
      return list.slice().sort((a,b) => score(b)-score(a))[0] || null;
    };
    return prefer(fr) || prefer(voices) || null;
  }
  function ensureVoiceReady() {
    if (!window.speechSynthesis) return;
    chosenVoice = pickSoftFemaleVoiceFR();
  }
  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => ensureVoiceReady();
    ensureVoiceReady();
  }
  function speak(text) {
    if (!settings.voice) return;
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (chosenVoice) u.voice = chosenVoice;
    u.lang = (chosenVoice?.lang) || "fr-FR";
    u.rate = settings.voiceRate;
    u.pitch = settings.voicePitch;
    u.volume = settings.voiceVolume;
    window.speechSynthesis.speak(u);
  }
  function stopVoice() { try { window.speechSynthesis?.cancel?.(); } catch {} }

  /* ---------------------------
     Engine: cycle + synchro
  --------------------------- */
  let running = false;
  let rafId = 0;
  let tStart = 0;
  let lastSecondSpoken = null;
  let lastStageSpoken = null;

  const elStage = $(".breath-stage") || $("#stageLabel");
  const elSec   = $(".breath-sec")   || $("#secLabel");
  const elCoach = $(".breath-coach") || $("#coachText");

  function setCSSVars(breath01, air01) {
    document.documentElement.style.setProperty("--breath", String(breath01.toFixed(4)));
    document.documentElement.style.setProperty("--air", String(air01.toFixed(4)));
  }

  function getCycleInfo(tMs) {
    const r = getRhythm();
    const inhale = r.inhale * 1000;
    const hold   = r.hold   * 1000;
    const exhale = r.exhale * 1000;
    const total = inhale + hold + exhale;

    const t = ((tMs % total) + total) % total;

    let stage, stageT, stageDur;
    if (t < inhale) {
      stage = "inhale"; stageT = t; stageDur = inhale;
    } else if (t < inhale + hold) {
      stage = "hold"; stageT = t - inhale; stageDur = hold;
    } else {
      stage = "exhale"; stageT = t - inhale - hold; stageDur = exhale;
    }

    const p = stageDur > 0 ? clamp(stageT / stageDur, 0, 1) : 1;

    let breath01;
    if (stage === "inhale") breath01 = p * p * (3 - 2 * p);
    else if (stage === "hold") breath01 = 1;
    else breath01 = 1 - (p * p * (3 - 2 * p));

    const air01 = stage === "exhale" ? p : (stage === "inhale" ? (1 - p) : 0.3);
    const secLeft = stageDur > 0 ? Math.ceil((stageDur - stageT) / 1000) : 0;

    return { stage, p, breath01, air01, secLeft };
  }

  function stageLabel(stage) {
    if (stage === "inhale") return "Inspire";
    if (stage === "hold") return "Retiens";
    return "Expire";
  }

  function coachText(stage) {
    if (!settings.coach) return "";
    if (stage === "inhale") return "Inspire doucement… laisse l’air remplir le bas des poumons.";
    if (stage === "hold") return "Garde l’air un instant… relâche les épaules.";
    return "Expire lentement… comme un souffle chaud, très calme.";
  }

  function updateUI(info) {
    if (elStage) elStage.textContent = stageLabel(info.stage);
    if (elSec) {
      if (!settings.countdown) elSec.textContent = "—";
      else elSec.textContent = String(Math.max(1, info.secLeft));
    }
    if (elCoach) elCoach.textContent = coachText(info.stage) || "";
  }

  function maybeSpeak(info) {
    if (!settings.voice) return;

    const s = Math.max(1, info.secLeft);
    const stage = info.stage;
    const secondKey = `${stage}:${s}`;
    if (secondKey === lastSecondSpoken) return;

    playTick();
    if (settings.vibrate && navigator.vibrate) {
      try { navigator.vibrate(10); } catch {}
    }

    let phrase;
    if (stage !== lastStageSpoken) {
      phrase = `${stageLabel(stage)}… ${s}`;
      lastStageSpoken = stage;
    } else {
      phrase = `${s}`;
    }

    speak(phrase);
    lastSecondSpoken = secondKey;
  }

  /* =========================================================
     ✅ WEBGL — FIX CADRAGE + POUMONS RECONNAISSABLES
  ========================================================= */

  const DEBUG = /(?:\?|&)debug=1\b/.test(location.search);
  const visual = glCanvas.closest(".breath-visual") || glCanvas.parentElement;

  const dbg = document.createElement("div");
  dbg.style.cssText = [
    "position:absolute","left:10px","top:10px","z-index:9999",
    "padding:8px 10px","border-radius:12px",
    "background:rgba(0,0,0,.42)","border:1px solid rgba(255,255,255,.18)",
    "color:rgba(234,240,255,.95)",
    "font:600 12px/1.25 system-ui, -apple-system, Segoe UI, Roboto, Arial",
    "max-width:calc(100% - 20px)","white-space:pre-wrap","pointer-events:none"
  ].join(";");

  let dbgSticky = "";
  function dbgSet(text, sticky=false){
    if (!DEBUG) return;
    if (sticky) dbgSticky = text;
    dbg.textContent = dbgSticky ? (dbgSticky + "\n" + text) : text;
  }
  if (visual && DEBUG) {
    if (!visual.querySelector("[data-viv-debug='1']")) {
      dbg.dataset.vivDebug = "1";
      visual.appendChild(dbg);
    }
  }

  const gl = glCanvas.getContext("webgl", { antialias: true, alpha: true, premultipliedAlpha: true });
  if (!gl) dbgSet("❌ WebGL: indisponible", true);

  // Matrices column-major
  function m4() { return new Float32Array(16); }
  function m4Identity(out){
    out[0]=1; out[1]=0; out[2]=0; out[3]=0;
    out[4]=0; out[5]=1; out[6]=0; out[7]=0;
    out[8]=0; out[9]=0; out[10]=1; out[11]=0;
    out[12]=0; out[13]=0; out[14]=0; out[15]=1;
    return out;
  }
  function m4Mul(out, a, b){
    const a00=a[0],a01=a[1],a02=a[2],a03=a[3];
    const a10=a[4],a11=a[5],a12=a[6],a13=a[7];
    const a20=a[8],a21=a[9],a22=a[10],a23=a[11];
    const a30=a[12],a31=a[13],a32=a[14],a33=a[15];

    const b00=b[0],b01=b[1],b02=b[2],b03=b[3];
    const b10=b[4],b11=b[5],b12=b[6],b13=b[7];
    const b20=b[8],b21=b[9],b22=b[10],b23=b[11];
    const b30=b[12],b31=b[13],b32=b[14],b33=b[15];

    out[0]=a00*b00+a10*b01+a20*b02+a30*b03;
    out[1]=a01*b00+a11*b01+a21*b02+a31*b03;
    out[2]=a02*b00+a12*b01+a22*b02+a32*b03;
    out[3]=a03*b00+a13*b01+a23*b02+a33*b03;

    out[4]=a00*b10+a10*b11+a20*b12+a30*b13;
    out[5]=a01*b10+a11*b11+a21*b12+a31*b13;
    out[6]=a02*b10+a12*b11+a22*b12+a32*b13;
    out[7]=a03*b10+a13*b11+a23*b12+a33*b13;

    out[8]=a00*b20+a10*b21+a20*b22+a30*b23;
    out[9]=a01*b20+a11*b21+a21*b22+a31*b23;
    out[10]=a02*b20+a12*b21+a22*b22+a32*b23;
    out[11]=a03*b20+a13*b21+a23*b22+a33*b23;

    out[12]=a00*b30+a10*b31+a20*b32+a30*b33;
    out[13]=a01*b30+a11*b31+a21*b32+a31*b33;
    out[14]=a02*b30+a12*b31+a22*b32+a32*b33;
    out[15]=a03*b30+a13*b31+a23*b32+a33*b33;
    return out;
  }
  function m4Perspective(out, fovy, aspect, near, far){
    const f = 1/Math.tan(fovy/2);
    out[0]=f/aspect; out[1]=0; out[2]=0; out[3]=0;
    out[4]=0; out[5]=f; out[6]=0; out[7]=0;
    out[8]=0; out[9]=0; out[10]=(far+near)/(near-far); out[11]=-1;
    out[12]=0; out[13]=0; out[14]=(2*far*near)/(near-far); out[15]=0;
    return out;
  }
  function m4Translate(out, x,y,z){
    m4Identity(out);
    out[12]=x; out[13]=y; out[14]=z;
    return out;
  }
  function m4RotateY(out, a){
    m4Identity(out);
    const c=Math.cos(a), s=Math.sin(a);
    out[0]=c; out[2]=-s;
    out[8]=s; out[10]=c;
    return out;
  }
  function m4RotateX(out, a){
    m4Identity(out);
    const c=Math.cos(a), s=Math.sin(a);
    out[5]=c; out[6]=s;
    out[9]=-s; out[10]=c;
    return out;
  }
  function m4Scale(out, s){
    m4Identity(out);
    out[0]=s; out[5]=s; out[10]=s;
    return out;
  }
  function v3Normalize(x,y,z){
    const l = Math.hypot(x,y,z) || 1;
    return [x/l,y/l,z/l];
  }
  function m4LookAt(out, eye, target, up){
    const ex=eye[0], ey=eye[1], ez=eye[2];
    let zx = ex - target[0];
    let zy = ey - target[1];
    let zz = ez - target[2];
    const zn = v3Normalize(zx,zy,zz); zx=zn[0]; zy=zn[1]; zz=zn[2];

    let xx = up[1]*zz - up[2]*zy;
    let xy = up[2]*zx - up[0]*zz;
    let xz = up[0]*zy - up[1]*zx;
    const xn = v3Normalize(xx,xy,xz); xx=xn[0]; xy=xn[1]; xz=xn[2];

    const yx = zy*xz - zz*xy;
    const yy = zz*xx - zx*xz;
    const yz = zx*xy - zy*xx;

    out[0]=xx; out[1]=yx; out[2]=zx; out[3]=0;
    out[4]=xy; out[5]=yy; out[6]=zy; out[7]=0;
    out[8]=xz; out[9]=yz; out[10]=zz; out[11]=0;
    out[12]=-(xx*ex + xy*ey + xz*ez);
    out[13]=-(yx*ex + yy*ey + yz*ez);
    out[14]=-(zx*ex + zy*ey + zz*ez);
    out[15]=1;
    return out;
  }

  // --- precision: force same in VS+FS (Android)
  function fragHighpOK() {
    try {
      const fmt = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
      return !!fmt && fmt.precision > 0;
    } catch { return false; }
  }
  const FP = (gl && fragHighpOK()) ? "highp" : "mediump";
  const PREC = `precision ${FP} float;`;

  function compileShader(type, src){
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh) || "unknown";
      gl.deleteShader(sh);
      throw new Error(log);
    }
    return sh;
  }
  function createProgram(vsSrc, fsSrc){
    const vs = compileShader(gl.VERTEX_SHADER, vsSrc);
    const fs = compileShader(gl.FRAGMENT_SHADER, fsSrc);
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(p) || "unknown";
      gl.deleteProgram(p);
      throw new Error(log);
    }
    return p;
  }

  /* ============================
     SHADERS — poumons réalistes
     ============================ */

  const VS = `
    ${PREC}
    attribute vec3 aPos;
    attribute vec3 aNor;

    uniform mat4 uMVP;
    uniform mat4 uM;

    uniform float uBreath;
    uniform float uSide;
    uniform float uTime;

    uniform float uIsTube;   // 1.0 tubes, 0.0 lungs
    uniform float uInner;    // 1.0 inner layer

    varying vec3 vN;
    varying vec3 vW;
    varying float vTube;
    varying float vInner;
    varying float vSss;
    varying float vCurv;

    void main(){
      vec3 p = aPos;
      vec3 n = aNor;

      float b = clamp(uBreath, 0.0, 1.0);
      float bb = b*b*(3.0-2.0*b); // soft
      vTube = uIsTube;
      vInner = uInner;

      if (uIsTube < 0.5) {
        // ===== Base poumon depuis sphère -> silhouette "poumon" =====
        // Stretch global
        p.y *= 1.30;
        p.x *= 0.92;
        p.z *= 0.86;

        // Centre lobe (moins large pour éviter débordement)
        p.x += uSide * 0.52;

        // Cleft central (séparation entre poumons)
        float cleft = smoothstep(0.05, 0.40, abs(p.x));
        p.x *= (0.88 + 0.12*cleft);

        // Creux haut (zone trachée) : on "mange" le haut centre
        float top = smoothstep(0.35, 1.05, p.y);
        float topNotch = top * smoothstep(0.0, 0.55, 0.55 - abs(p.x));
        p.y -= 0.10 * topNotch;
        p.z -= 0.08 * topNotch;

        // Base arrondie (plus de volume en bas)
        float base = smoothstep(-1.1, -0.1, p.y);
        p.x *= (0.96 + 0.12*base);
        p.z *= (0.94 + 0.16*base);

        // Inflation respiration (douce, stable)
        float swell = 0.08 + 0.24*bb;

        // Reliefs organiques (plis subtils, pas de "gros polygones")
        float lobe = 0.040 * sin(p.y*4.6 + uTime*0.65 + uSide*0.9);
        float rib  = 0.030 * sin(p.x*6.0 + p.y*2.1 + uTime*0.45);
        float front= 0.025 * sin(p.z*6.1 + p.y*1.8 - uTime*0.35);

        float bumps = 1.0 + lobe + rib + front;
        vCurv = bumps;

        p *= (1.0 + swell) * bumps;

        // Encoche coeur (gauche)
        float innerC = 1.0 - smoothstep(0.05, 0.55, abs(p.x + uSide*0.14));
        float heart = innerC * smoothstep(-0.40, 0.25, p.y) * smoothstep(-0.20, 0.50, p.z);
        p.x += uSide * (-0.14 * heart);

        // couche interne un peu plus petite
        if (uInner > 0.5) p *= 0.964;

        // normale approx
        n = normalize(p);

        vSss = (0.30 + 0.50*bb) + (uInner > 0.5 ? 0.14 : 0.0);
      } else {
        // ===== Tubes: pulse léger =====
        float pulse = 0.008 * sin(uTime*1.8) + 0.016*bb;
        p *= (1.0 + pulse);
        vCurv = 1.0;
        vSss = 0.18 + 0.20*bb;
      }

      vec4 w = uM * vec4(p, 1.0);
      vW = w.xyz;
      vN = normalize(mat3(uM) * n);

      gl_Position = uMVP * vec4(p, 1.0);
    }
  `;

  const FS = `
    ${PREC}
    varying vec3 vN;
    varying vec3 vW;
    varying float vTube;
    varying float vInner;
    varying float vSss;
    varying float vCurv;

    uniform vec3 uCam;
    uniform vec3 uLightDir;
    uniform float uBreath;
    uniform float uOxy;

    float hash3(vec3 p){
      p = fract(p * 0.3183099 + vec3(0.1,0.2,0.3));
      p *= 17.0;
      return fract(p.x*p.y*p.z*(p.x+p.y+p.z));
    }
    float vnoise(vec3 p){
      vec3 i = floor(p);
      vec3 f = fract(p);
      f = f*f*(3.0-2.0*f);
      float n000 = hash3(i + vec3(0,0,0));
      float n100 = hash3(i + vec3(1,0,0));
      float n010 = hash3(i + vec3(0,1,0));
      float n110 = hash3(i + vec3(1,1,0));
      float n001 = hash3(i + vec3(0,0,1));
      float n101 = hash3(i + vec3(1,0,1));
      float n011 = hash3(i + vec3(0,1,1));
      float n111 = hash3(i + vec3(1,1,1));
      float nx00 = mix(n000,n100,f.x);
      float nx10 = mix(n010,n110,f.x);
      float nx01 = mix(n001,n101,f.x);
      float nx11 = mix(n011,n111,f.x);
      float nxy0 = mix(nx00,nx10,f.y);
      float nxy1 = mix(nx01,nx11,f.y);
      return mix(nxy0,nxy1,f.z);
    }

    void main(){
      vec3 N = normalize(vN);
      vec3 L = normalize(uLightDir);
      vec3 V = normalize(uCam - vW);

      float ndl = max(dot(N,L), 0.0);
      float rim = pow(1.0 - max(dot(N,V), 0.0), 2.25);

      float oxy = clamp(uOxy, 0.0, 1.0);

      vec3 deox = vec3(0.06,0.13,0.28);
      vec3 ox   = vec3(0.16,0.44,0.82);

      vec3 baseLung  = mix(deox, ox, 0.30 + 0.70*oxy);
      vec3 baseInner = mix(deox*1.10, ox*1.05, 0.40 + 0.60*oxy);
      vec3 baseTube  = mix(vec3(0.50,0.78,1.00), vec3(0.74,0.95,1.00), 0.25 + 0.75*oxy);

      vec3 base = baseLung;
      float alpha = 0.86;

      if (vTube > 0.5) { base = baseTube; alpha = 0.62; }
      else if (vInner > 0.5) { base = baseInner; alpha = 0.66; }

      // veines procédurales (subtiles)
      vec3 p = vW * 2.2;
      float n1 = vnoise(p * 1.6);
      float n2 = vnoise(p * 3.0 + vec3(2.1,1.3,0.7));
      float veins = smoothstep(0.64, 0.92, n1*0.65 + n2*0.45);

      float veinStrength = (0.05 + 0.10*oxy) * (0.75 + 0.25*rim) * (0.70 + 0.30*(vCurv-0.95));
      vec3 veinCol = vec3(0.18,0.52,0.95) * veinStrength * veins;

      // spec soft
      vec3 H = normalize(L + V);
      float spec = pow(max(dot(N,H),0.0), 54.0) * (0.10 + 0.26*oxy);

      // SSS simple (backlight)
      float back = max(dot(-L, N), 0.0);
      float sss = (0.10 + 0.34*vSss) * (0.45 + 0.55*back) * (0.55 + 0.45*oxy);
      vec3 sssCol = vec3(0.16,0.48,0.95) * sss;

      float diffuse = 0.22 + 0.92*ndl;
      vec3 col = base * diffuse + sssCol + vec3(spec) + rim*vec3(0.20,0.55,0.98) + veinCol;

      // micro grain ultra léger
      float g = (vnoise(vW*8.0 + vec3(0.0, 0.0, oxy*3.0)) - 0.5) * 0.018;
      col += g;

      gl_FragColor = vec4(col, alpha);
    }
  `;

  // Mesh helpers
  function createMesh(gl, pos, nor, idx){
    const mesh = {
      bPos: gl.createBuffer(),
      bNor: gl.createBuffer(),
      bIdx: gl.createBuffer(),
      count: idx.length
    };
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.bPos);
    gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.bNor);
    gl.bufferData(gl.ARRAY_BUFFER, nor, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.bIdx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    return mesh;
  }

  function icosphere(subdiv=4){
    const t = (1 + Math.sqrt(5)) / 2;
    let verts = [
      -1, t, 0,   1, t, 0,   -1,-t, 0,   1,-t, 0,
      0,-1, t,    0, 1, t,    0,-1,-t,   0, 1,-t,
      t, 0,-1,    t, 0, 1,   -t, 0,-1,  -t, 0, 1
    ].reduce((a,v,i)=>{ if(i%3===0)a.push([0,0,0]); a[a.length-1][i%3]=v; return a; }, []);
    verts = verts.map(v => {
      const n = v3Normalize(v[0],v[1],v[2]);
      return [n[0],n[1],n[2]];
    });

    let faces = [
      [0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],
      [1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
      [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],
      [4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]
    ];

    const midCache = new Map();
    const key = (a,b)=> a<b ? `${a}_${b}` : `${b}_${a}`;
    function midpoint(a,b){
      const k = key(a,b);
      if (midCache.has(k)) return midCache.get(k);
      const v1 = verts[a], v2 = verts[b];
      const m = v3Normalize((v1[0]+v2[0])/2, (v1[1]+v2[1])/2, (v1[2]+v2[2])/2);
      const idx = verts.length;
      verts.push([m[0],m[1],m[2]]);
      midCache.set(k, idx);
      return idx;
    }

    for(let s=0;s<subdiv;s++){
      const next = [];
      for(const f of faces){
        const [a,b,c]=f;
        const ab=midpoint(a,b);
        const bc=midpoint(b,c);
        const ca=midpoint(c,a);
        next.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]);
      }
      faces = next;
    }

    const pos = new Float32Array(verts.length*3);
    const nor = new Float32Array(verts.length*3);
    for(let i=0;i<verts.length;i++){
      pos[i*3+0]=verts[i][0];
      pos[i*3+1]=verts[i][1];
      pos[i*3+2]=verts[i][2];
      nor[i*3+0]=verts[i][0];
      nor[i*3+1]=verts[i][1];
      nor[i*3+2]=verts[i][2];
    }

    const idx = new Uint16Array(faces.length*3);
    for(let i=0;i<faces.length;i++){
      idx[i*3+0]=faces[i][0];
      idx[i*3+1]=faces[i][1];
      idx[i*3+2]=faces[i][2];
    }

    return { pos, nor, idx };
  }

  function tubeMesh(path, radius=0.06, radialSeg=16){
    const rings = path.length;
    const verts = [];
    const nors = [];
    const idxs = [];

    function sub(a,b){ return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
    function add(a,b){ return [a[0]+b[0], a[1]+b[1], a[2]+b[2]]; }
    function mul(a,s){ return [a[0]*s, a[1]*s, a[2]*s]; }
    function cross(a,b){ return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
    function norm(a){ const l=Math.hypot(a[0],a[1],a[2])||1; return [a[0]/l,a[1]/l,a[2]/l]; }

    let up = [0,1,0];

    for(let i=0;i<rings;i++){
      const p = path[i];
      const pPrev = path[Math.max(0,i-1)];
      const pNext = path[Math.min(rings-1,i+1)];
      const t = norm(sub(pNext, pPrev));

      let n = cross(up, t);
      if (Math.hypot(n[0],n[1],n[2]) < 1e-4) {
        up = [1,0,0];
        n = cross(up, t);
      }
      n = norm(n);
      let b = norm(cross(t, n));
      up = b;

      for(let j=0;j<radialSeg;j++){
        const a = (j / radialSeg) * Math.PI*2;
        const ca = Math.cos(a), sa = Math.sin(a);
        const dir = norm(add(mul(n, ca), mul(b, sa)));
        const v = add(p, mul(dir, radius));
        verts.push(v[0],v[1],v[2]);
        nors.push(dir[0],dir[1],dir[2]);
      }
    }

    for(let i=0;i<rings-1;i++){
      for(let j=0;j<radialSeg;j++){
        const a = i*radialSeg + j;
        const b = i*radialSeg + ((j+1)%radialSeg);
        const c = (i+1)*radialSeg + j;
        const d = (i+1)*radialSeg + ((j+1)%radialSeg);
        idxs.push(a,c,b);
        idxs.push(b,c,d);
      }
    }

    return {
      pos: new Float32Array(verts),
      nor: new Float32Array(nors),
      idx: new Uint16Array(idxs)
    };
  }

  function mergeMeshes(a,b){
    const pos = new Float32Array(a.pos.length + b.pos.length);
    pos.set(a.pos, 0);
    pos.set(b.pos, a.pos.length);

    const nor = new Float32Array(a.nor.length + b.nor.length);
    nor.set(a.nor, 0);
    nor.set(b.nor, a.nor.length);

    const idx = new Uint16Array(a.idx.length + b.idx.length);
    idx.set(a.idx, 0);

    const off = (a.pos.length/3);
    for(let i=0;i<b.idx.length;i++){
      idx[a.idx.length+i] = b.idx[i] + off;
    }
    return { pos, nor, idx };
  }

  let program = null;
  let loc = {};
  let lungMesh = null;
  let tubeMeshAll = null;

  // oxy lissé
  let oxySmooth = 0.0;

  function resizeCanvases(){
    if (!gl) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = glCanvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));

    if (glCanvas.width !== w || glCanvas.height !== h) {
      glCanvas.width = w; glCanvas.height = h;
      airCanvas.width = w; airCanvas.height = h;

      glCanvas.style.width = rect.width + "px";
      glCanvas.style.height = rect.height + "px";
      airCanvas.style.width = rect.width + "px";
      airCanvas.style.height = rect.height + "px";

      gl.viewport(0,0,w,h);
    }

    if (DEBUG) {
      dbgSet(
        `✅ WebGL: OK (${FP})\nCanvas: ${w}×${h} (dpr ${dpr.toFixed(2)})\nProgram: ${program ? "OK" : "—"}\nMesh: ${lungMesh ? "OK" : "—"} / Tubes: ${tubeMeshAll ? "OK" : "—"}`
      );
    }
  }

  function bindMesh(mesh){
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.bPos);
    gl.enableVertexAttribArray(loc.aPos);
    gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.bNor);
    gl.enableVertexAttribArray(loc.aNor);
    gl.vertexAttribPointer(loc.aNor, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.bIdx);
  }

  function initGL(){
    if (!gl) return;

    try {
      program = createProgram(VS, FS);
    } catch (e) {
      dbgSet("❌ Shader/Program KO\n" + ((e && e.message) ? e.message : String(e)), true);
      program = null;
      return;
    }

    loc.aPos = gl.getAttribLocation(program, "aPos");
    loc.aNor = gl.getAttribLocation(program, "aNor");
    loc.uMVP = gl.getUniformLocation(program, "uMVP");
    loc.uM   = gl.getUniformLocation(program, "uM");
    loc.uCam = gl.getUniformLocation(program, "uCam");
    loc.uLightDir = gl.getUniformLocation(program, "uLightDir");
    loc.uBreath = gl.getUniformLocation(program, "uBreath");
    loc.uSide   = gl.getUniformLocation(program, "uSide");
    loc.uTime   = gl.getUniformLocation(program, "uTime");
    loc.uIsTube = gl.getUniformLocation(program, "uIsTube");
    loc.uInner  = gl.getUniformLocation(program, "uInner");
    loc.uOxy    = gl.getUniformLocation(program, "uOxy");

    // lungs mesh
    const ico = icosphere(4);
    lungMesh = createMesh(gl, ico.pos, ico.nor, ico.idx);

    // tubes (inchangé dans l’esprit, léger upgrade ok)
    const tr = [
      [0.00,  0.86, 0.13],
      [0.00,  0.63, 0.11],
      [0.00,  0.40, 0.08],
      [0.00,  0.17, 0.04],
    ];

    const leftMain = [
      [0.00,  0.17, 0.04],
      [-0.20, 0.06, 0.04],
      [-0.36,-0.06, 0.04],
      [-0.52,-0.22, 0.02],
    ];
    const rightMain = [
      [0.00,  0.17, 0.04],
      [0.20,  0.06, 0.04],
      [0.36, -0.06, 0.04],
      [0.52, -0.22, 0.02],
    ];

    const leftUp = [
      [-0.28,  0.02, 0.04],
      [-0.42,  0.10, 0.03],
      [-0.56,  0.16, 0.01],
    ];
    const leftDown = [
      [-0.34,-0.10, 0.04],
      [-0.48,-0.20, 0.03],
      [-0.62,-0.34, 0.01],
    ];
    const rightUp = [
      [0.28,  0.02, 0.04],
      [0.42,  0.10, 0.03],
      [0.56,  0.16, 0.01],
    ];
    const rightDown = [
      [0.34,-0.10, 0.04],
      [0.48,-0.20, 0.03],
      [0.62,-0.34, 0.01],
    ];

    const t1  = tubeMesh(tr,       0.070, 18);
    const t2  = tubeMesh(leftMain, 0.052, 16);
    const t3  = tubeMesh(rightMain,0.052, 16);

    const t4  = tubeMesh(leftUp,   0.035, 14);
    const t5  = tubeMesh(leftDown, 0.034, 14);
    const t6  = tubeMesh(rightUp,  0.035, 14);
    const t7  = tubeMesh(rightDown,0.034, 14);

    let merged = mergeMeshes(t1,t2);
    merged = mergeMeshes(merged,t3);
    merged = mergeMeshes(merged,t4);
    merged = mergeMeshes(merged,t5);
    merged = mergeMeshes(merged,t6);
    merged = mergeMeshes(merged,t7);

    tubeMeshAll = createMesh(gl, merged.pos, merged.nor, merged.idx);

    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  function renderGL(info, nowMs){
    if (!gl || !program || !lungMesh || !tubeMeshAll) return;

    resizeCanvases();

    gl.clearColor(0,0,0,0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(program);

    const w = glCanvas.width, h = glCanvas.height;
    const aspect = w / h;

    // ✅ FIX CADRAGE: caméra + scale dynamique selon aspect
    // - évite débordement sur mobiles (cadre plus "carré")
    const cam = [0, 0.24, 3.35];
    const target = [0, 0.12, 0];
    const up = [0,1,0];

    const P = m4(); m4Perspective(P, 0.78, aspect, 0.1, 40.0);
    const V = m4(); m4LookAt(V, cam, target, up);

    const RY = m4(); m4RotateY(RY, Math.sin(nowMs*0.00018)*0.12);
    const RX = m4(); m4RotateX(RX, -0.04 + Math.sin(nowMs*0.00015)*0.018);

    // scale auto: si cadre très "étroit", on réduit un peu plus
    const fit = clamp(0.92 - (0.18 * Math.max(0, 1.0 - aspect)), 0.78, 0.92);
    const S = m4(); m4Scale(S, fit);

    // position un peu plus bas et plus loin pour rester dans le cadre
    const T  = m4(); m4Translate(T, 0, -0.20, -0.55);

    const Mrot = m4(); m4Mul(Mrot, RY, RX);
    const MS = m4(); m4Mul(MS, S, Mrot);
    const M  = m4(); m4Mul(M, T, MS);

    const PV = m4(); m4Mul(PV, P, V);
    const MVP = m4(); m4Mul(MVP, PV, M);

    const light = v3Normalize(-0.35, 0.72, 0.55);

    // oxy: suit le volume (baisse à l’expiration), lissé
    const oxyTarget = clamp(info.breath01, 0, 1);
    oxySmooth = lerp(oxySmooth, oxyTarget, 0.06);

    gl.uniformMatrix4fv(loc.uM, false, M);
    gl.uniformMatrix4fv(loc.uMVP, false, MVP);
    gl.uniform3f(loc.uCam, cam[0], cam[1], cam[2]);
    gl.uniform3f(loc.uLightDir, light[0], light[1], light[2]);
    gl.uniform1f(loc.uBreath, info.breath01);
    gl.uniform1f(loc.uTime, nowMs * 0.001);
    gl.uniform1f(loc.uOxy, oxySmooth);

    // 1) Tubes
    gl.uniform1f(loc.uIsTube, 1.0);
    gl.uniform1f(loc.uInner, 0.0);
    gl.uniform1f(loc.uSide, 0.0);
    bindMesh(tubeMeshAll);
    gl.drawElements(gl.TRIANGLES, tubeMeshAll.count, gl.UNSIGNED_SHORT, 0);

    // 2) Poumons couche interne
    gl.uniform1f(loc.uIsTube, 0.0);
    gl.uniform1f(loc.uInner, 1.0);
    bindMesh(lungMesh);

    gl.uniform1f(loc.uSide, -1.0);
    gl.drawElements(gl.TRIANGLES, lungMesh.count, gl.UNSIGNED_SHORT, 0);
    gl.uniform1f(loc.uSide, +1.0);
    gl.drawElements(gl.TRIANGLES, lungMesh.count, gl.UNSIGNED_SHORT, 0);

    // 3) Poumons couche externe
    gl.uniform1f(loc.uInner, 0.0);
    gl.uniform1f(loc.uSide, -1.0);
    gl.drawElements(gl.TRIANGLES, lungMesh.count, gl.UNSIGNED_SHORT, 0);
    gl.uniform1f(loc.uSide, +1.0);
    gl.drawElements(gl.TRIANGLES, lungMesh.count, gl.UNSIGNED_SHORT, 0);
  }

  /* ---------------------------
     Alvéoles / particules 2D (inchangé globalement)
     -> on les garde (cadrées), elles ne débordent pas du canvas
  --------------------------- */
  const airCtx = airCanvas.getContext("2d");
  let alveoli = [];

  function resetAlveoli(){
    alveoli = [];
    const count = 160;
    for(let i=0;i<count;i++){
      const side = Math.random() < 0.5 ? -1 : 1;
      const u = Math.random();
      const v = Math.random();
      const r = Math.sqrt(u);
      const a = v * Math.PI * 2;

      alveoli.push({
        side,
        r,
        a,
        z: Math.random(),
        seed: Math.random()*1000,
        size: 0.8 + Math.random()*1.6,
        glow: 0.10 + Math.random()*0.22
      });
    }
  }
  resetAlveoli();

  function drawAlveoli(info, nowMs){
    const w = airCanvas.width, h = airCanvas.height;
    airCtx.clearRect(0,0,w,h);

    const b = info.breath01;
    const oxy = oxySmooth;

    const cxL = 0.44*w;
    const cxR = 0.56*w;
    const cy  = 0.54*h;

    const rx = lerp(0.16, 0.20, b) * w;
    const ry = lerp(0.20, 0.25, b) * h;

    airCtx.globalCompositeOperation = "lighter";

    for(const p of alveoli){
      const wob = 0.010 * Math.sin(nowMs*0.0012 + p.seed);
      const wob2= 0.008 * Math.cos(nowMs*0.0010 + p.seed*0.7);

      const rr = p.r * (0.78 + 0.30*b);
      const x0 = (p.side < 0 ? cxL : cxR);

      let x = x0 + Math.cos(p.a + wob) * rr * rx;
      let y = cy + Math.sin(p.a + wob2) * rr * ry;

      const depth = 0.55 + 0.45*p.z;
      const size = p.size * (1.1 + 1.2*b) * depth;
      const alpha = p.glow * (0.55 + 0.75*oxy) * (0.60 + 0.40*b) * (0.70 + 0.30*depth);

      const R = size * 10.0;
      const grad = airCtx.createRadialGradient(x,y,0, x,y,R);
      grad.addColorStop(0, `rgba(220,250,255,${alpha})`);
      grad.addColorStop(1, `rgba(220,250,255,0)`);

      airCtx.fillStyle = grad;
      airCtx.beginPath();
      airCtx.arc(x,y,size*2.0,0,Math.PI*2);
      airCtx.fill();

      airCtx.fillStyle = `rgba(235,255,255,${alpha*0.55})`;
      airCtx.beginPath();
      airCtx.arc(x,y,size*0.55,0,Math.PI*2);
      airCtx.fill();
    }

    airCtx.globalCompositeOperation = "source-over";
  }

  /* ---------------------------
     Loop
  --------------------------- */
  function frame(now){
    if (!running) return;

    const t = now - tStart;
    const info = getCycleInfo(t);

    setCSSVars(info.breath01, info.air01);
    updateUI(info);
    maybeSpeak(info);

    if (audioCtx && breathNoise) setBreathSound(info.stage, info.breath01);

    renderGL(info, now);
    drawAlveoli(info, now);

    rafId = requestAnimationFrame(frame);
  }

  /* ---------------------------
     Start/Stop/Restart
  --------------------------- */
  function start(){
    if (running) return;
    running = true;

    lastSecondSpoken = null;
    lastStageSpoken = null;

    try { ensureAudio(); audioCtx.resume?.(); } catch {}

    startBreathNoise();
    resetAlveoli();

    tStart = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  function stop(){
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;

    stopBreathNoise();
    stopVoice();

    if (elStage) elStage.textContent = "Prêt";
    if (elSec) elSec.textContent = "—";
    if (elCoach) elCoach.textContent = "Quand tu veux : inspire… puis expire.";

    setCSSVars(0, 0);

    if (airCtx) airCtx.clearRect(0,0,airCanvas.width, airCanvas.height);
    if (gl) {
      gl.clearColor(0,0,0,0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }

    if (gl && program) {
      oxySmooth = 0.0;
      renderGL({ breath01: 0.0, air01: 0.0, stage: "inhale", secLeft: 1 }, performance.now());
      drawAlveoli({ breath01: 0.0, air01: 0.0, stage: "inhale", secLeft: 1 }, performance.now());
    }
  }

  function restart(){
    const wasRunning = running;
    if (wasRunning) stop();
    setTimeout(() => { if (wasRunning) start(); }, 40);
  }

  btnStart.addEventListener("click", () => start());
  btnStop.addEventListener("click", () => stop());

  window.addEventListener("resize", () => {
    resizeCanvases();
    if (!running && gl && program) {
      renderGL({ breath01: 0.0, air01: 0.0, stage: "inhale", secLeft: 1 }, performance.now());
      drawAlveoli({ breath01: 0.0, air01: 0.0, stage: "inhale", secLeft: 1 }, performance.now());
    }
  });

  // init GL + état initial visible
  if (gl) {
    initGL();
    resizeCanvases();
    if (program) {
      oxySmooth = 0.0;
      renderGL({ breath01: 0.0, air01: 0.0, stage: "inhale", secLeft: 1 }, performance.now());
      drawAlveoli({ breath01: 0.0, air01: 0.0, stage: "inhale", secLeft: 1 }, performance.now());
    }
  }

  if (elStage) elStage.textContent = "Prêt";
  if (elSec) elSec.textContent = "—";
  if (elCoach) elCoach.textContent = "Quand tu veux : inspire… puis expire.";
})();