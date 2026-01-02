/* =========================================================
   Vivario — respiration.js (v21)
   WebGL pseudo-mesh (icosphere + deformation + normal lighting)
   + particules 2D + son souffle + voix synchronisée
   Sans librairies externes.
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
     Elements (IDs compatibles avec ton respiration.html)
     - Ton HTML (confirmé) :
       rhythmSelect, optVoice, optCount, optTick, optVibe, optSoft, btnStart, btnStop
     - Fallback si tu as encore d'anciens IDs :
       selRhythm, optCountdown, optVibrate, optCoach
  --------------------------- */
  const glCanvas   = $("#glCanvas");
  const airCanvas  = $("#airCanvas");
  const btnStart   = $("#btnStart");
  const btnStop    = $("#btnStop");

  const selRhythm  = $("#rhythmSelect") || $("#selRhythm");
  const optVoice   = $("#optVoice");
  const optCountdown = $("#optCount") || $("#optCountdown");
  const optTick    = $("#optTick");
  const optVibrate = $("#optVibe") || $("#optVibrate");
  const optCoach   = $("#optSoft") || $("#optCoach");

  if (!glCanvas || !airCanvas || !btnStart || !btnStop || !selRhythm) {
    console.warn("[respiration.js] Éléments manquants. Vérifie les IDs: glCanvas, airCanvas, btnStart, btnStop, rhythmSelect/selRhythm.");
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

    // accepte aussi "4-0-6" etc. (ton HTML)
    rhythm: "4-0-6",

    // voix douce (validé chez toi)
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

  /* ---------------------------
     Bind toggles (NE TOUCHE PAS au comportement validé,
     juste remise en mapping correct IDs)
  --------------------------- */
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

  // garde valeur si l'option existe dans le select
  if ([...selRhythm.options].some(o => o.value === settings.rhythm)) {
    selRhythm.value = settings.rhythm;
  } else {
    // fallback : prend la valeur actuelle du HTML
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
    el.addEventListener("click", () => {
      if (!("checked" in el)) handler();
    });
  }

  bindToggle(optVoice, "voice");
  bindToggle(optCountdown, "countdown");
  bindToggle(optTick, "tick");
  bindToggle(optVibrate, "vibrate");
  bindToggle(optCoach, "coach");

  selRhythm.addEventListener("change", () => {
    settings.rhythm = selRhythm.value;
    saveSettings();
    if (running) restart(); // applique immédiatement le rythme en cours
  });

  /* ---------------------------
     Rythmes
     - Support:
       * valeurs HTML : "4-0-6", "4-4-6", "5-2-7", "6-2-8"
       * et anciens presets (si tu les utilises encore)
  --------------------------- */
  const RHYTHMS_PRESET = {
    calm_4_2_6: { inhale: 4, hold: 2, exhale: 6, label: "Calme (4-2-6)" },
    box_4_4_4:  { inhale: 4, hold: 4, exhale: 4, label: "Box (4-4-4)" },
    relax_5_0_7:{ inhale: 5, hold: 0, exhale: 7, label: "Relax (5-0-7)" },
    quick_3_0_4:{ inhale: 3, hold: 0, exhale: 4, label: "Rapide (3-0-4)" }
  };

  function parseRhythm(v) {
    // format "inhale-hold-exhale"
    const m = String(v || "").trim().match(/^(\d+)\s*-\s*(\d+)\s*-\s*(\d+)$/);
    if (m) {
      const inhale = parseInt(m[1], 10);
      const hold   = parseInt(m[2], 10);
      const exhale = parseInt(m[3], 10);
      if ([inhale, hold, exhale].every(Number.isFinite)) {
        return { inhale, hold, exhale, label: `${inhale}-${hold}-${exhale}` };
      }
    }
    // preset key
    if (RHYTHMS_PRESET[v]) return RHYTHMS_PRESET[v];
    // fallback
    return { inhale: 4, hold: 0, exhale: 6, label: "4-0-6" };
  }

  function getRhythm() {
    return parseRhythm(settings.rhythm);
  }

  /* ---------------------------
     Audio: souffle + tick (sans couper ambiance)
  --------------------------- */
  let audioCtx = null;
  let breathNoise = null; // {src, gain, filter}
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
     Voice (SpeechSynthesis) — synchronisée
     (ne change pas ce qui marche, juste conserve ton approche)
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

  function stopVoice() {
    try { window.speechSynthesis?.cancel?.(); } catch {}
  }

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
    const hold = r.hold * 1000;
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

    return { stage, p, breath01, air01, secLeft, stageDurMs: stageDur };
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
      else elSec.textContent = String(Math.max(1, info.secLeft)); // jamais 0
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

  /* ---------------------------
     WebGL pseudo-mesh (amélioré)
     -> ici on remet de vrais "poumons" visibles,
        sans toucher au moteur.
  --------------------------- */
  const gl = glCanvas.getContext("webgl", { antialias: true, alpha: true, premultipliedAlpha: true });
  if (!gl) {
    console.warn("[respiration.js] WebGL non disponible.");
  }

  function mat4Identity() {
    return new Float32Array([1,0,0,0,  0,1,0,0,  0,0,1,0,  0,0,0,1]);
  }
  function mat4Mul(a,b){
    const o = new Float32Array(16);
    for(let r=0;r<4;r++){
      for(let c=0;c<4;c++){
        o[r*4+c]=a[r*4+0]*b[0*4+c]+a[r*4+1]*b[1*4+c]+a[r*4+2]*b[2*4+c]+a[r*4+3]*b[3*4+c];
      }
    }
    return o;
  }
  function mat4Perspective(fovy, aspect, near, far){
    const f = 1.0/Math.tan(fovy/2);
    const nf = 1/(near-far);
    const o = new Float32Array(16);
    o[0]=f/aspect; o[1]=0; o[2]=0; o[3]=0;
    o[4]=0; o[5]=f; o[6]=0; o[7]=0;
    o[8]=0; o[9]=0; o[10]=(far+near)*nf; o[11]=-1;
    o[12]=0; o[13]=0; o[14]=(2*far*near)*nf; o[15]=0;
    return o;
  }
  function mat4Translate(x,y,z){
    const o = mat4Identity();
    o[12]=x; o[13]=y; o[14]=z;
    return o;
  }
  function mat4RotateY(a){
    const c=Math.cos(a), s=Math.sin(a);
    const o = mat4Identity();
    o[0]=c; o[2]=s;
    o[8]=-s; o[10]=c;
    return o;
  }
  function mat4RotateX(a){
    const c=Math.cos(a), s=Math.sin(a);
    const o = mat4Identity();
    o[5]=c; o[6]=-s;
    o[9]=s; o[10]=c;
    return o;
  }
  function vec3Normalize(x,y,z){
    const l=Math.hypot(x,y,z)||1;
    return [x/l,y/l,z/l];
  }

  function compileShader(type, src){
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn(gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
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
      console.warn(gl.getProgramInfoLog(p));
      gl.deleteProgram(p);
      return null;
    }
    return p;
  }

  // ✅ VS/FS améliorés : vraie silhouette "organe" + notch coeur + lobes + bumps
  const VS = `
    attribute vec3 aPos;
    attribute vec3 aNor;

    uniform mat4 uMVP;
    uniform mat4 uM;

    uniform float uBreath;
    uniform float uSide;     // -1.0 gauche, +1.0 droite
    uniform float uTime;     // seconds

    varying vec3 vN;
    varying vec3 vW;
    varying float vSss;

    // bruit rapide procédural
    float hash31(vec3 p){
      return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
    }

    void main(){
      // base unit sphere
      vec3 p = aPos;

      // shape anisotrope (poumon)
      float b = clamp(uBreath, 0.0, 1.0);
      float swell = 0.10 + 0.34 * b;

      // silhouette : plus haute, plus "ventrale"
      p.x *= 0.92;
      p.y *= 1.18;
      p.z *= 0.86;

      // lobes : ondulation douce
      float lobe = 0.05 * sin(p.y * 5.2 + uTime*0.8 + uSide*0.7);
      float rib  = 0.04 * sin(p.x * 6.1 + p.y*2.3 + uTime*0.6);
      float front= 0.04 * sin(p.z * 6.4 + p.y*1.7 - uTime*0.5);
      float bumps = 1.0 + lobe + rib + front;

      // expansion (breath)
      p *= (1.0 + swell) * bumps;

      // notch "coeur" côté interne (près du centre)
      // on creuse légèrement la partie interne avant
      float inner = 1.0 - smoothstep(0.05, 0.55, abs(p.x + uSide*0.18));
      float heart = inner * smoothstep(-0.35, 0.35, p.y) * smoothstep(-0.15, 0.55, p.z);
      p.x += uSide * (-0.18 * heart);

      // déplacement latéral (séparation des 2 poumons)
      p.x += uSide * 0.62;

      // normal approx (radial sur position déformée)
      vec3 n = normalize(p);

      // SSS factor
      vSss = 0.28 + 0.58 * b;

      // world
      vec4 w = uM * vec4(p, 1.0);
      vW = w.xyz;
      vN = normalize(mat3(uM) * n);

      gl_Position = uMVP * vec4(p, 1.0);
    }
  `;

  const FS = `
    precision mediump float;

    varying vec3 vN;
    varying vec3 vW;
    varying float vSss;

    uniform vec3 uCam;
    uniform vec3 uLightDir;
    uniform float uBreath;

    void main(){
      vec3 N = normalize(vN);
      vec3 L = normalize(uLightDir);
      vec3 V = normalize(uCam - vW);

      float ndl = max(dot(N,L), 0.0);
      float rim = pow(1.0 - max(dot(N,V), 0.0), 2.25);

      // base color (Vivario)
      float b = clamp(uBreath, 0.0, 1.0);
      vec3 base = mix(vec3(0.08,0.18,0.34), vec3(0.14,0.32,0.62), 0.42 + 0.58*b);

      // specular
      vec3 H = normalize(L + V);
      float spec = pow(max(dot(N,H),0.0), 52.0) * (0.20 + 0.32*b);

      // fake subsurface (plus fort quand surface pas éclairée)
      float sss = (0.16 + 0.36*vSss) * (0.65 - ndl);
      vec3 sssCol = vec3(0.22,0.52,0.88) * sss;

      vec3 col = base * (0.20 + 0.95*ndl) + sssCol + vec3(spec) + rim*vec3(0.22,0.52,0.92);

      // alpha "glassy"
      float a = 0.80;
      gl_FragColor = vec4(col, a);
    }
  `;

  let program = null;
  let bufPos = null, bufNor = null, bufIdx = null;
  let loc = {};
  let mesh = null;

  function icosphere(subdiv=2){
    const t = (1 + Math.sqrt(5)) / 2;
    let verts = [
      -1, t, 0,   1, t, 0,   -1,-t, 0,   1,-t, 0,
      0,-1, t,    0, 1, t,    0,-1,-t,   0, 1,-t,
      t, 0,-1,    t, 0, 1,   -t, 0,-1,  -t, 0, 1
    ].reduce((a,v,i)=>{ if(i%3===0)a.push([0,0,0]); a[a.length-1][i%3]=v; return a; }, []);

    verts = verts.map(v=>{
      const n = vec3Normalize(v[0],v[1],v[2]);
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
      const m = vec3Normalize((v1[0]+v2[0])/2, (v1[1]+v2[1])/2, (v1[2]+v2[2])/2);
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

  function initGL(){
    if (!gl) return;
    program = createProgram(VS, FS);
    mesh = icosphere(3); // dense mais OK mobile

    bufPos = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufPos);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.pos, gl.STATIC_DRAW);

    bufNor = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufNor);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.nor, gl.STATIC_DRAW);

    bufIdx = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufIdx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.idx, gl.STATIC_DRAW);

    loc.aPos = gl.getAttribLocation(program, "aPos");
    loc.aNor = gl.getAttribLocation(program, "aNor");
    loc.uMVP = gl.getUniformLocation(program, "uMVP");
    loc.uM   = gl.getUniformLocation(program, "uM");
    loc.uCam = gl.getUniformLocation(program, "uCam");
    loc.uLightDir = gl.getUniformLocation(program, "uLightDir");
    loc.uBreath = gl.getUniformLocation(program, "uBreath");
    loc.uSide  = gl.getUniformLocation(program, "uSide");
    loc.uTime  = gl.getUniformLocation(program, "uTime");

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
  }

  function resizeCanvases(){
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = glCanvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (glCanvas.width !== w || glCanvas.height !== h) {
      glCanvas.width = w; glCanvas.height = h;

      airCanvas.width = w; airCanvas.height = h;

      airCanvas.style.width = rect.width + "px";
      airCanvas.style.height = rect.height + "px";
      glCanvas.style.width = rect.width + "px";
      glCanvas.style.height = rect.height + "px";

      gl.viewport(0,0,w,h);
    }
  }

  function renderGL(info, tMs){
    if (!gl || !program) return;

    resizeCanvases();

    gl.clearColor(0,0,0,0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, bufPos);
    gl.enableVertexAttribArray(loc.aPos);
    gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, bufNor);
    gl.enableVertexAttribArray(loc.aNor);
    gl.vertexAttribPointer(loc.aNor, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufIdx);

    const w = glCanvas.width, h = glCanvas.height;
    const aspect = w / h;

    // camera / projection
    const cam = [0, 0.22, 2.75];
    const proj = mat4Perspective(0.78, aspect, 0.1, 30.0);

    // rotations très légères (pas de “woobly”)
    const rotY = mat4RotateY(Math.sin(tMs*0.00018)*0.14);
    const rotX = mat4RotateX(-0.06 + Math.sin(tMs*0.00015)*0.025);

    // monde (on recule un peu)
    const T = mat4Translate(0, -0.02, -0.65);
    const M = mat4Mul(T, mat4Mul(rotY, rotX));
    const MVP = mat4Mul(proj, M);

    // light dynamique subtile
    const light = vec3Normalize(-0.32, 0.70, 0.58);

    gl.uniform3f(loc.uCam, cam[0], cam[1], cam[2]);
    gl.uniform3f(loc.uLightDir, light[0], light[1], light[2]);
    gl.uniform1f(loc.uBreath, info.breath01);
    gl.uniform1f(loc.uTime, tMs * 0.001);

    gl.uniformMatrix4fv(loc.uM, false, M);
    gl.uniformMatrix4fv(loc.uMVP, false, MVP);

    // draw left then right (avec uSide)
    gl.uniform1f(loc.uSide, -1.0);
    gl.drawElements(gl.TRIANGLES, mesh.idx.length, gl.UNSIGNED_SHORT, 0);

    gl.uniform1f(loc.uSide, +1.0);
    gl.drawElements(gl.TRIANGLES, mesh.idx.length, gl.UNSIGNED_SHORT, 0);
  }

  /* ---------------------------
     Particules 2D (airCanvas)
  --------------------------- */
  const airCtx = airCanvas.getContext("2d");
  let particles = [];

  function resetParticles(){
    particles = [];
    const count = 120;
    for(let i=0;i<count;i++){
      particles.push({
        x: Math.random(),
        y: 1 + Math.random()*0.4,
        s: 0.6 + Math.random()*1.2,
        a: 0.15 + Math.random()*0.25,
        vx: (Math.random()*2-1)*0.04,
        vy: 0.10 + Math.random()*0.22
      });
    }
  }
  resetParticles();

  function drawParticles(info){
    const w = airCanvas.width, h = airCanvas.height;
    airCtx.clearRect(0,0,w,h);

    const breath01 = info.breath01;
    const stage = info.stage;

    const cx = 0.50*w;
    const baseY = 0.22*h;

    const intens = stage === "exhale" ? lerp(0.25, 1.0, 1-breath01) : lerp(0.10, 0.85, breath01);

    airCtx.globalCompositeOperation = "lighter";

    for(const p of particles){
      const dir = stage === "exhale" ? -1 : 1;
      p.y += (p.vy * intens) * dir * 0.006;
      p.x += p.vx * 0.006;

      if (p.y < -0.2) { p.y = 1.2; p.x = Math.random(); }
      if (p.y > 1.2)  { p.y = -0.2; p.x = Math.random(); }
      if (p.x < -0.1) p.x = 1.1;
      if (p.x > 1.1)  p.x = -0.1;

      const px = cx + (p.x-0.5)*0.30*w;
      const py = baseY + p.y*0.70*h;

      const r = p.s * (1.2 + 1.6*intens);
      const alpha = p.a * (0.6 + 1.1*intens);

      const grad = airCtx.createRadialGradient(px,py,0, px,py,r*10);
      grad.addColorStop(0, `rgba(210,245,255,${alpha})`);
      grad.addColorStop(1, `rgba(210,245,255,0)`);

      airCtx.fillStyle = grad;
      airCtx.beginPath();
      airCtx.arc(px,py,r*2.2,0,Math.PI*2);
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
    drawParticles(info);

    rafId = requestAnimationFrame(frame);
  }

  /* ---------------------------
     Start/Stop/Restart (gardé)
  --------------------------- */
  function start(){
    if (running) return;
    running = true;

    lastSecondSpoken = null;
    lastStageSpoken = null;

    try { ensureAudio(); audioCtx.resume?.(); } catch {}

    startBreathNoise();
    resetParticles();

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

    // ✅ on redessine un état "repos" (poumons visibles)
    if (gl && program) {
      const idleInfo = { breath01: 0.0, air01: 0.0, stage: "inhale", secLeft: 1 };
      renderGL(idleInfo, performance.now());
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
    if (!gl) return;
    resizeCanvases();
    // redraw idle if not running
    if (!running && program) {
      const idleInfo = { breath01: 0.0, air01: 0.0, stage: "inhale", secLeft: 1 };
      renderGL(idleInfo, performance.now());
    }
  });

  /* ---------------------------
     init GL + état initial
  --------------------------- */
  if (gl) {
    initGL();
    resizeCanvases();

    // ✅ poumons visibles dès le chargement
    const idleInfo = { breath01: 0.0, air01: 0.0, stage: "inhale", secLeft: 1 };
    renderGL(idleInfo, performance.now());
  }

  if (elStage) elStage.textContent = "Prêt";
  if (elSec) elSec.textContent = "—";
  if (elCoach) elCoach.textContent = "Quand tu veux : inspire… puis expire.";

})();