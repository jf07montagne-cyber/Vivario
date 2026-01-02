/* =========================================================
   Vivario — respiration.js (v20)
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
     Elements (IDs attendus)
  --------------------------- */
  const glCanvas = $("#glCanvas");
  const airCanvas = $("#airCanvas");
  const btnStart = $("#btnStart");
  const btnStop  = $("#btnStop");
  const selRhythm = $("#selRhythm");

  const optVoice = $("#optVoice");
  const optCountdown = $("#optCountdown");
  const optTick = $("#optTick");
  const optVibrate = $("#optVibrate");
  const optCoach = $("#optCoach");

  if (!glCanvas || !airCanvas || !btnStart || !btnStop || !selRhythm) {
    console.warn("[respiration.js] عناصر manquants. Vérifie les IDs: glCanvas, airCanvas, btnStart, btnStop, selRhythm.");
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
    rhythm: "calm_4_2_6", // inhale_hold_exhale
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
     Bind toggles (remet les fonctions)
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
  selRhythm.value = settings.rhythm;

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
      // si c'est un bouton custom sans checkbox
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
  --------------------------- */
  const RHYTHMS = {
    calm_4_2_6: { inhale: 4, hold: 2, exhale: 6, label: "Calme (4-2-6)" },
    box_4_4_4:  { inhale: 4, hold: 4, exhale: 4, label: "Box (4-4-4)" },
    relax_5_0_7:{ inhale: 5, hold: 0, exhale: 7, label: "Relax (5-0-7)" },
    quick_3_0_4:{ inhale: 3, hold: 0, exhale: 4, label: "Rapide (3-0-4)" }
  };
  function getRhythm() {
    return RHYTHMS[settings.rhythm] || RHYTHMS.calm_4_2_6;
  }

  /* ---------------------------
     Audio: souffle + tick (sans couper ambiance)
  --------------------------- */
  let audioCtx = null;
  let breathNoise = null; // {src, gain, filter}
  let tickOsc = null;     // {osc, gain}
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

    // White noise buffer
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
    // souffle léger synchronisé au cycle
    if (!breathNoise) return;
    // amplitude
    const base = 0.015;
    const amp = stage === "exhale"
      ? lerp(base, 0.08, breath01)      // exhale plus audible
      : lerp(base, 0.06, breath01);     // inhale
    breathNoise.gain.gain.setTargetAtTime(amp, audioCtx.currentTime, 0.06);

    // filtre
    const f = stage === "exhale"
      ? lerp(650, 1100, breath01)
      : lerp(750, 1400, breath01);
    breathNoise.filter.frequency.setTargetAtTime(f, audioCtx.currentTime, 0.06);
  }

  /* ---------------------------
     Voice (SpeechSynthesis) — synchronisée
  --------------------------- */
  let chosenVoice = null;
  function pickSoftFemaleVoiceFR() {
    const voices = window.speechSynthesis?.getVoices?.() || [];
    // On vise une voix FR féminine si possible, sinon FR, sinon la meilleure dispo.
    const fr = voices.filter(v => (v.lang || "").toLowerCase().startsWith("fr"));
    const prefer = (list) => {
      // heuristiques noms "female": pas fiable, mais on favorise "Google", "Microsoft", "Natural"
      const score = (v) => {
        const n = (v.name || "").toLowerCase();
        let s = 0;
        if (n.includes("female")) s += 4;
        if (n.includes("natural")) s += 3;
        if (n.includes("google")) s += 2;
        if (n.includes("microsoft")) s += 2;
        if (n.includes("audrey") || n.includes("julie") || n.includes("marie")) s += 3;
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
  // Certains navigateurs chargent les voix async
  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => ensureVoiceReady();
    ensureVoiceReady();
  }

  function speak(text) {
    if (!settings.voice) return;
    if (!window.speechSynthesis) return;
    // stop ce qui reste en file (évite décalage)
    window.speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(text);
    if (chosenVoice) u.voice = chosenVoice;
    u.lang = (chosenVoice?.lang) || "fr-FR";
    u.rate = settings.voiceRate;     // plus doux = un peu plus lent
    u.pitch = settings.voicePitch;   // plus féminin
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

  // clock
  let tStart = 0;          // ms
  let tPauseOffset = 0;    // ms
  let lastSecondSpoken = null;
  let lastStageSpoken = null;

  // UI (si présents)
  const elStage = $(".breath-stage");
  const elSec = $(".breath-sec");
  const elCoach = $(".breath-coach");

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

    // breath (0..1): ease in/out
    let breath01;
    if (stage === "inhale") breath01 = p * p * (3 - 2 * p); // smoothstep
    else if (stage === "hold") breath01 = 1;
    else breath01 = 1 - (p * p * (3 - 2 * p));

    // air: vitesse perçue (plus pendant exhale)
    const air01 = stage === "exhale" ? p : (stage === "inhale" ? (1 - p) : 0.3);

    // remaining seconds (arrondi vers le haut, pas de "0")
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
      if (!settings.countdown) {
        elSec.textContent = "—";
      } else {
        elSec.textContent = String(Math.max(1, info.secLeft)); // jamais 0 à l’écran
      }
    }
    if (elCoach) {
      const txt = coachText(info.stage);
      elCoach.textContent = txt || "";
    }
  }

  function maybeSpeak(info) {
    if (!settings.voice) return;

    // on parle seulement sur changement de seconde visible (évite décalage)
    const s = Math.max(1, info.secLeft); // pas de 0
    const stage = info.stage;

    const secondKey = `${stage}:${s}`;
    if (secondKey === lastSecondSpoken) return;

    // tick et vibration au "tic" de la seconde
    playTick();
    if (settings.vibrate && navigator.vibrate) {
      try { navigator.vibrate(10); } catch {}
    }

    // phrase: garder Inspire/Expire + décompte (sans 0)
    // On répète le mot de phase au début de la phase, puis uniquement le chiffre.
    let phrase;
    if (stage !== lastStageSpoken) {
      phrase = `${stageLabel(stage)}… ${s}`;
      lastStageSpoken = stage;
    } else {
      phrase = `${s}`;
    }

    // coach doux très léger (optionnel)
    if (settings.coach && stage !== "hold" && s === Math.max(1, getCycleInfo(performance.now() - tStart).secLeft)) {
      // on ne surcharge pas : la phrase courte suffit
    }

    speak(phrase);
    lastSecondSpoken = secondKey;
  }

  /* ---------------------------
     WebGL pseudo-mesh: icosphere
  --------------------------- */
  const gl = glCanvas.getContext("webgl", { antialias: true, alpha: true, premultipliedAlpha: true });
  if (!gl) {
    console.warn("[respiration.js] WebGL non disponible.");
  }

  // Minimal mat4
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

  const VS = `
    attribute vec3 aPos;
    attribute vec3 aNor;

    uniform mat4 uMVP;
    uniform mat4 uM;
    uniform float uBreath;

    varying vec3 vN;
    varying vec3 vW;
    varying float vSss;

    void main(){
      // world position
      vec4 w = uM * vec4(aPos, 1.0);
      vW = w.xyz;

      // normal
      vN = mat3(uM) * aNor;

      // fake subsurface factor (stronger when expanded)
      vSss = 0.25 + 0.55 * uBreath;

      gl_Position = uMVP * vec4(aPos, 1.0);
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
      float rim = pow(1.0 - max(dot(N,V), 0.0), 2.2);

      // base color (bleuté "vivario")
      vec3 base = mix(vec3(0.10,0.22,0.40), vec3(0.16,0.34,0.62), 0.45 + 0.55*uBreath);

      // specular
      vec3 H = normalize(L + V);
      float spec = pow(max(dot(N,H),0.0), 48.0) * (0.25 + 0.35*uBreath);

      // fake subsurface (SSS)
      float sss = (0.18 + 0.35*vSss) * (0.6 - ndl);
      vec3 sssCol = vec3(0.25,0.55,0.85) * sss;

      vec3 col = base * (0.18 + 0.95*ndl) + sssCol + vec3(spec) + rim*vec3(0.25,0.55,0.9);

      // alpha glassy
      float a = 0.78;
      gl_FragColor = vec4(col, a);
    }
  `;

  let program = null;
  let bufPos = null, bufNor = null, bufIdx = null;
  let loc = {};
  let mesh = null;

  function icosphere(subdiv=2){
    // base icosahedron
    const t = (1 + Math.sqrt(5)) / 2;
    let verts = [
      -1, t, 0,   1, t, 0,   -1,-t, 0,   1,-t, 0,
      0,-1, t,    0, 1, t,    0,-1,-t,   0, 1,-t,
      t, 0,-1,    t, 0, 1,   -t, 0,-1,  -t, 0, 1
    ].reduce((a,v,i)=>{ if(i%3===0)a.push([0,0,0]); a[a.length-1][i%3]=v; return a; }, []);
    // normalize
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

    // flatten
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
    return { pos, nor, idx, vertCount: verts.length, triCount: faces.length };
  }

  function initGL(){
    if (!gl) return;
    program = createProgram(VS, FS);
    mesh = icosphere(3); // assez dense, mais OK mobile

    bufPos = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufPos);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.pos, gl.DYNAMIC_DRAW);

    bufNor = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufNor);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.nor, gl.DYNAMIC_DRAW);

    bufIdx = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufIdx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.idx, gl.STATIC_DRAW);

    loc.aPos = gl.getAttribLocation(program, "aPos");
    loc.aNor = gl.getAttribLocation(program, "aNor");
    loc.uMVP = gl.getUniformLocation(program, "uMVP");
    loc.uM = gl.getUniformLocation(program, "uM");
    loc.uCam = gl.getUniformLocation(program, "uCam");
    loc.uLightDir = gl.getUniformLocation(program, "uLightDir");
    loc.uBreath = gl.getUniformLocation(program, "uBreath");

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
  }

  function deformLungVertices(breath01){
    // Déformation simple mais "organe" : scale anisotrope + bosses procédurales
    // On modifie positions/normales dynamiquement (DYNAMIC_DRAW).
    const p = mesh.pos;
    const n = mesh.nor;

    const swell = lerp(0.06, 0.22, breath01); // gonflement
    const sx = 1.0 + swell*0.55;
    const sy = 1.0 + swell*0.85;
    const sz = 1.0 + swell*0.40;

    // petites bosses “tissu” (subtil)
    for(let i=0;i<p.length;i+=3){
      const x = n[i+0];
      const y = n[i+1];
      const z = n[i+2];

      const bumps = 1.0 + 0.03*Math.sin(6.0*x + 4.0*y + 5.0*z + breath01*2.2);

      p[i+0] = x * sx * bumps;
      p[i+1] = y * sy * bumps;
      p[i+2] = z * sz * bumps;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, bufPos);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, p);

    // normales approx = normales d’origine (suffisant ici)
    gl.bindBuffer(gl.ARRAY_BUFFER, bufNor);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, n);
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

    // zone trachée / bronches (centre)
    const cx = 0.50*w;
    const baseY = 0.22*h;

    // intensité
    const intens = stage === "exhale" ? lerp(0.25, 1.0, 1-breath01) : lerp(0.10, 0.85, breath01);

    airCtx.globalCompositeOperation = "lighter";

    for(const p of particles){
      // mouvement : inhale descend un peu, exhale monte
      const dir = stage === "exhale" ? -1 : 1;
      p.y += (p.vy * intens) * dir * 0.006;
      p.x += p.vx * 0.006;

      // wrap
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
     Render WebGL lungs
  --------------------------- */
  function renderGL(info, tMs){
    if (!gl || !program) return;

    resizeCanvases();

    gl.clearColor(0,0,0,0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // deform sphere
    deformLungVertices(info.breath01);

    gl.useProgram(program);

    // attributes
    gl.bindBuffer(gl.ARRAY_BUFFER, bufPos);
    gl.enableVertexAttribArray(loc.aPos);
    gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, bufNor);
    gl.enableVertexAttribArray(loc.aNor);
    gl.vertexAttribPointer(loc.aNor, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufIdx);

    const w = glCanvas.width, h = glCanvas.height;
    const aspect = w / h;

    // camera
    const cam = [0, 0.25, 2.45];
    const proj = mat4Perspective(0.72, aspect, 0.1, 20.0);

    // animation rotation légère
    const rotY = mat4RotateY(Math.sin(tMs*0.0002)*0.18);
    const rotX = mat4RotateX(-0.06 + Math.sin(tMs*0.00017)*0.03);

    // light
    const light = vec3Normalize(-0.35, 0.65, 0.55);

    gl.uniform3f(loc.uCam, cam[0], cam[1], cam[2]);
    gl.uniform3f(loc.uLightDir, light[0], light[1], light[2]);
    gl.uniform1f(loc.uBreath, info.breath01);

    function drawLung(side){
      // side: -1 gauche, +1 droite
      // On transforme l’icosphere pour donner forme de “lobe”:
      const tx = side * 0.55;
      const ty = 0.02;
      const tz = 0.0;

      // matrice monde: translate + rotation
      const T = mat4Translate(tx, ty, tz);
      const M = mat4Mul(T, mat4Mul(rotY, rotX));

      // MVP
      const MVP = mat4Mul(proj, M);

      gl.uniformMatrix4fv(loc.uM, false, M);
      gl.uniformMatrix4fv(loc.uMVP, false, MVP);

      gl.drawElements(gl.TRIANGLES, mesh.idx.length, gl.UNSIGNED_SHORT, 0);
    }

    // draw two lungs
    drawLung(-1);
    drawLung(+1);
  }

  /* ---------------------------
     Loop
  --------------------------- */
  function frame(now){
    if (!running) return;

    const t = now - tStart;
    const info = getCycleInfo(t);

    // css vars for any remaining svg/visuals
    setCSSVars(info.breath01, info.air01);

    // UI + voice
    updateUI(info);
    maybeSpeak(info);

    // audio souffle
    if (audioCtx && breathNoise) setBreathSound(info.stage, info.breath01);

    // render
    renderGL(info, now);
    drawParticles(info);

    rafId = requestAnimationFrame(frame);
  }

  /* ---------------------------
     Start/Stop/Restart
  --------------------------- */
  function start(){
    if (running) return;
    running = true;

    // reset speech keys to avoid “retard”
    lastSecondSpoken = null;
    lastStageSpoken = null;

    // resume audio on user gesture
    if (settings.tick || settings.voice || true) {
      try { ensureAudio(); audioCtx.resume?.(); } catch {}
    }

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

    // UI neutral
    if (elStage) elStage.textContent = "Prêt";
    if (elSec) elSec.textContent = "—";
    if (elCoach) elCoach.textContent = "Quand tu veux : inspire… puis expire.";

    setCSSVars(0, 0);
    // clear canvases
    if (airCtx) airCtx.clearRect(0,0,airCanvas.width, airCanvas.height);
    if (gl) {
      gl.clearColor(0,0,0,0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }
  }

  function restart(){
    // conserve start/stop validés
    const wasRunning = running;
    if (wasRunning) stop();
    // petit délai pour éviter speech queue
    setTimeout(() => { if (wasRunning) start(); }, 40);
  }

  btnStart.addEventListener("click", () => start());
  btnStop.addEventListener("click", () => stop());

  // resize
  window.addEventListener("resize", () => {
    if (!gl) return;
    resizeCanvases();
  });

  // init GL
  if (gl) {
    initGL();
    resizeCanvases();
  }

  // état initial UI
  if (elStage) elStage.textContent = "Prêt";
  if (elSec) elSec.textContent = "—";
  if (elCoach) elCoach.textContent = "Quand tu veux : inspire… puis expire.";

})();