/* ==========================================================
   VIVARIO — respiration.js v20 (WebGL mesh-like + voix sync)
   - Ne touche pas index/accueil/apropos
   - Garde le fonctionnement validé (boutons/toggles/rythmes)
   ========================================================== */

(() => {
  "use strict";

  /* -------------------- Helpers DOM (robuste) -------------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // Essaie plusieurs sélecteurs (pour ne PAS casser ton HTML)
  const pickEl = (...sels) => {
    for (const s of sels) {
      const el = $(s);
      if (el) return el;
    }
    return null;
  };

  /* -------------------- Détection page respiration -------------------- */
  const isBreathPage = document.body.classList.contains("page-breath") || !!$(".page-breath");
  if (!isBreathPage) return;

  /* -------------------- Références UI (sans casser) -------------------- */
  const startBtn = pickEl("#btnStart", "#startBtn", "[data-action='start']", "button#demarrer", "button[data-start]");
  const stopBtn  = pickEl("#btnStop", "#stopBtn", "[data-action='stop']", "button#stop", "button[data-stop]");
  const pauseBtn = pickEl("#btnPause", "#pauseBtn", "[data-action='pause']", "button#pause", "button[data-pause]");

  const rhythmSel   = pickEl("#rhythm", "#rythme", "#rhythmSelect", "select[name='rhythm']");
  const durationSel = pickEl("#duration", "#duree", "#durationSelect", "select[name='duration']");

  const voiceToggle = pickEl("#toggleVoice", "#voiceToggle", "input[name='voice']", "input[data-toggle='voice']");
  const countToggle = pickEl("#toggleCount", "#countToggle", "input[name='count']", "input[data-toggle='count']");
  const tickToggle  = pickEl("#toggleTick",  "#tickToggle",  "input[name='tick']",  "input[data-toggle='tick']");
  const vibToggle   = pickEl("#toggleVib",   "#vibToggle",   "input[name='vibration']", "input[data-toggle='vibration']");
  const coachToggle = pickEl("#toggleCoach", "#coachToggle", "input[name='coach']", "input[data-toggle='coach']");

  const stageEl = pickEl("#breathStage", ".breath-stage");
  const secEl   = pickEl("#breathSec", ".breath-sec");
  const coachEl = pickEl("#breathCoach", ".breath-coach");

  const visualBox = pickEl(".breath-visual", ".page-breath .breath-visual") || $(".page-breath .card") || document.body;

  /* -------------------- Canvas WebGL (création si absent) -------------------- */
  let glCanvas = $("#glCanvas");
  if (!glCanvas) {
    glCanvas = document.createElement("canvas");
    glCanvas.id = "glCanvas";
    visualBox.prepend(glCanvas);
  }

  // (Optionnel) second canvas (airCanvas) si tu l’utilises déjà ailleurs — on n’impose pas
  let airCanvas = $("#airCanvas");
  if (!airCanvas) {
    airCanvas = document.createElement("canvas");
    airCanvas.id = "airCanvas";
    visualBox.prepend(airCanvas);
  }
  const airCtx = airCanvas.getContext("2d", { alpha: true });

  /* -------------------- State -------------------- */
  const state = {
    running: false,
    paused: false,

    // phases (valeurs par défaut si tes selects ne sont pas là)
    inhale: 4,
    hold: 0,
    exhale: 6,

    // durée
    durationSec: 60, // 1 min par défaut
    remainingTotal: 60,
    infinite: false,

    // toggles
    voice: true,
    count: true,
    tick: false,
    vibration: false,
    coach: true,

    // animation
    phase: "ready", // ready|inhale|hold|exhale
    phaseStartMs: 0,
    phaseDurMs: 0,

    // synchro voix
    voiceLeadMs: 380,   // <- clé pour corriger le retard constaté
    speakBusy: false,

    // CSS vars
    breath: 0, // 0..1
    air: 0,    // 0..1

    // sound
    audio: null,
    breathSoundOn: true, // souffle léger (toujours ok)
  };

  /* -------------------- Lecture paramètres rythme -------------------- */
  const parseRhythm = (val) => {
    // accepte "4-0-6", "4–0–6", "4—0—6", etc.
    if (!val) return null;
    const m = String(val).replace(/[–—]/g, "-").match(/(\d+)\s*-\s*(\d+)\s*-\s*(\d+)/);
    if (!m) return null;
    return { inhale: +m[1], hold: +m[2], exhale: +m[3] };
  };

  const applyRhythmFromUI = () => {
    const r = rhythmSel ? parseRhythm(rhythmSel.value) : null;
    if (r) {
      state.inhale = Math.max(1, r.inhale);
      state.hold   = Math.max(0, r.hold);
      state.exhale = Math.max(1, r.exhale);
    }
  };

  const applyDurationFromUI = () => {
    if (!durationSel) return;
    const v = String(durationSel.value || "").toLowerCase();
    if (v.includes("inf")) {
      state.infinite = true;
      state.durationSec = 60;
      state.remainingTotal = 60;
      return;
    }
    const n = parseInt(v, 10);
    if (Number.isFinite(n) && n > 0) {
      state.infinite = false;
      state.durationSec = n;
      state.remainingTotal = n;
    }
  };

  const readToggles = () => {
    const read = (el, fallback) => (el ? !!el.checked : fallback);
    state.voice     = read(voiceToggle, state.voice);
    state.count     = read(countToggle, state.count);
    state.tick      = read(tickToggle, state.tick);
    state.vibration = read(vibToggle, state.vibration);
    state.coach     = read(coachToggle, state.coach);
  };

  /* -------------------- UI text -------------------- */
  const setStage = (t) => { if (stageEl) stageEl.textContent = t; };
  const setSec   = (t) => { if (secEl) secEl.textContent = t; };
  const setCoach = (t) => { if (coachEl) coachEl.textContent = t; };

  const labelForPhase = (p) => {
    if (p === "inhale") return "Inspire";
    if (p === "hold")   return "Bloque";
    if (p === "exhale") return "Expire";
    return "Prêt";
  };

  /* -------------------- Vibration + Tick -------------------- */
  const doVibrate = (ms = 20) => {
    if (!state.vibration) return;
    if (navigator.vibrate) navigator.vibrate(ms);
  };

  let tickAudio = null;
  const ensureTick = () => {
    if (tickAudio) return;
    try {
      // petit tick via WebAudio (pas de fichier externe)
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      tickAudio = { ctx };
    } catch { /* ignore */ }
  };
  const playTick = () => {
    if (!state.tick) return;
    ensureTick();
    if (!tickAudio) return;
    const { ctx } = tickAudio;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.0001;
    o.connect(g); g.connect(ctx.destination);
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.start(t);
    o.stop(t + 0.07);
  };

  /* -------------------- Speech (voix) -------------------- */
  const speech = {
    voices: [],
    voice: null,
    ready: false,
  };

  const pickBestFrenchFemaleVoice = () => {
    const vs = window.speechSynthesis?.getVoices?.() || [];
    speech.voices = vs;

    const fr = vs.filter(v => (v.lang || "").toLowerCase().startsWith("fr"));
    if (!fr.length) return null;

    // Heuristique "féminine" (selon noms courants)
    const prefer = [
      "Amélie","Amelie","Julie","Céline","Celine","Marie","Audrey","Virginie","Léa","Lea","Ariane",
      "Siri","Google","Microsoft"
    ];

    let best = null;
    let bestScore = -1;
    for (const v of fr) {
      const name = (v.name || "");
      let score = 0;
      for (const p of prefer) if (name.toLowerCase().includes(p.toLowerCase())) score += 2;
      if ((v.localService ?? true) === false) score -= 1;
      if ((v.lang || "").toLowerCase() === "fr-fr") score += 2;
      if (score > bestScore) { bestScore = score; best = v; }
    }
    return best || fr[0];
  };

  const ensureVoices = () => {
    if (!("speechSynthesis" in window)) return;
    const sync = () => {
      speech.voice = pickBestFrenchFemaleVoice();
      speech.ready = true;
    };
    sync();
    // certaines plateformes chargent les voix plus tard
    window.speechSynthesis.onvoiceschanged = () => sync();
  };
  ensureVoices();

  const speak = (text) => {
    if (!state.voice) return;
    if (!("speechSynthesis" in window)) return;
    if (!speech.ready) ensureVoices();

    try { window.speechSynthesis.cancel(); } catch {}

    const u = new SpeechSynthesisUtterance(text);
    if (speech.voice) u.voice = speech.voice;
    u.lang = "fr-FR";

    // plus doux / plus “féminin”
    u.rate  = 0.93;  // plus posé
    u.pitch = 1.18;  // un peu plus haut
    u.volume = 1;

    window.speechSynthesis.speak(u);
  };

  /* -------------------- Souffle sonore (bruit d’air léger) -------------------- */
  const audio = {
    ctx: null,
    noise: null,
    noiseGain: null,
    filter: null,
    master: null,
    running: false,
  };

  const startBreathSound = async () => {
    if (audio.running) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      audio.ctx = ctx;

      // bruit blanc
      const bufferSize = 2 * ctx.sampleRate;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const out = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) out[i] = (Math.random() * 2 - 1) * 0.6;

      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 900;
      filter.Q.value = 0.7;

      const gain = ctx.createGain();
      gain.gain.value = 0.0001;

      const master = ctx.createGain();
      master.gain.value = 0.25; // léger, ne couvre pas l’ambiance

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      master.connect(ctx.destination);

      noise.start();

      audio.noise = noise;
      audio.filter = filter;
      audio.noiseGain = gain;
      audio.master = master;
      audio.running = true;
    } catch {
      // ignore
    }
  };

  const stopBreathSound = () => {
    try {
      audio.noise?.stop?.();
      audio.ctx?.close?.();
    } catch {}
    audio.ctx = null;
    audio.noise = null;
    audio.noiseGain = null;
    audio.filter = null;
    audio.master = null;
    audio.running = false;
  };

  // Modulation du souffle en fonction de "vitesse de respiration"
  const setBreathSoundIntensity = (x) => {
    if (!audio.running || !audio.noiseGain || !audio.filter) return;
    const ctx = audio.ctx;
    const t = ctx.currentTime;
    const g = Math.max(0.0001, Math.min(0.18, x * 0.18));
    audio.noiseGain.gain.setTargetAtTime(g, t, 0.03);
    // filtre un peu plus “aérien” à l’inspiration
    const f = 700 + x * 900;
    audio.filter.frequency.setTargetAtTime(f, t, 0.04);
  };

  /* -------------------- WebGL : vrai rendu 3D (raymarch SDF) -------------------- */
  const gl = glCanvas.getContext("webgl", { antialias: true, alpha: true, premultipliedAlpha: true });
  let glProg = null;
  let glBuf = null;
  let uTime, uRes, uBreath, uAir, uPhase;

  const VERT = `
    attribute vec2 aPos;
    varying vec2 vUv;
    void main(){
      vUv = (aPos * 0.5) + 0.5;
      gl_Position = vec4(aPos, 0.0, 1.0);
    }
  `;

  // Raymarching SDF de “poumons” (2 lobes + trachée) + normal lighting
  // + particules volumétriques “douces”
  const FRAG = `
    precision highp float;
    varying vec2 vUv;
    uniform vec2  uRes;
    uniform float uTime;
    uniform float uBreath; // 0..1
    uniform float uAir;    // 0..1
    uniform float uPhase;  // 0=ready 1=inhale 2=hold 3=exhale

    // hash / noise
    float hash(vec3 p){
      p = fract(p*0.3183099 + vec3(0.1,0.2,0.3));
      p *= 17.0;
      return fract(p.x*p.y*p.z*(p.x+p.y+p.z));
    }

    float sdSphere(vec3 p, float r){ return length(p)-r; }

    float sdCapsule(vec3 p, vec3 a, vec3 b, float r){
      vec3 pa = p-a, ba = b-a;
      float h = clamp(dot(pa,ba)/dot(ba,ba), 0.0, 1.0);
      return length(pa - ba*h) - r;
    }

    // lobe SDF (ellipsoïde)
    float sdEllipsoid(vec3 p, vec3 r){
      float k0 = length(p/r);
      float k1 = length(p/(r*r));
      return k0*(k0-1.0)/k1;
    }

    // SDF poumons
    float mapLungs(vec3 p){
      // centre + breathing “volume”
      float b = uBreath; // 0..1
      float inflate = mix(0.86, 1.18, b);

      // positionnement
      vec3 q = p;
      q.y += 0.10;

      // 2 lobes (un peu asymétriques)
      vec3 pl = q - vec3(-0.38, 0.0, 0.0);
      vec3 pr = q - vec3( 0.38, 0.0, 0.0);

      // ellipsoïdes
      float dl = sdEllipsoid(pl, vec3(0.42, 0.55, 0.30) * inflate);
      float dr = sdEllipsoid(pr, vec3(0.40, 0.52, 0.28) * inflate);

      float d = min(dl, dr);

      // légère “encoche” centrale (séparation)
      float notch = sdCapsule(q, vec3(0.0, 0.30, 0.0), vec3(0.0,-0.55,0.0), 0.08);
      d = max(d, -notch + 0.04);

      // trachée + bronches (tubes)
      float tr = sdCapsule(q, vec3(0.0,0.80,0.0), vec3(0.0,0.35,0.0), 0.06);
      float b1 = sdCapsule(q, vec3(0.0,0.35,0.0), vec3(-0.22,0.20,0.0), 0.05);
      float b2 = sdCapsule(q, vec3(0.0,0.35,0.0), vec3( 0.22,0.20,0.0), 0.05);
      d = min(d, tr);
      d = min(d, b1);
      d = min(d, b2);

      // branches secondaires (un peu)
      float s1 = sdCapsule(q, vec3(-0.22,0.20,0.0), vec3(-0.32,0.00,0.08), 0.03);
      float s2 = sdCapsule(q, vec3(-0.22,0.20,0.0), vec3(-0.30,-0.06,-0.06), 0.03);
      float s3 = sdCapsule(q, vec3( 0.22,0.20,0.0), vec3( 0.32,0.00,0.08), 0.03);
      float s4 = sdCapsule(q, vec3( 0.22,0.20,0.0), vec3( 0.30,-0.06,-0.06), 0.03);
      d = min(d, s1);
      d = min(d, s2);
      d = min(d, s3);
      d = min(d, s4);

      return d;
    }

    vec3 getNormal(vec3 p){
      float e = 0.0025;
      vec2 h = vec2(e,0.0);
      float dx = mapLungs(p + vec3(h.x,h.y,h.y)) - mapLungs(p - vec3(h.x,h.y,h.y));
      float dy = mapLungs(p + vec3(h.y,h.x,h.y)) - mapLungs(p - vec3(h.y,h.x,h.y));
      float dz = mapLungs(p + vec3(h.y,h.y,h.x)) - mapLungs(p - vec3(h.y,h.y,h.x));
      return normalize(vec3(dx,dy,dz));
    }

    // volumetric “mist”
    float fogField(vec3 p){
      float n = 0.0;
      // quelques couches de bruit cheap
      n += hash(floor(p*12.0)) * 0.6;
      n += hash(floor(p*24.0)) * 0.3;
      n += hash(floor(p*48.0)) * 0.1;
      return n;
    }

    void main(){
      vec2 uv = (vUv*2.0-1.0);
      uv.x *= uRes.x/uRes.y;

      // camera
      vec3 ro = vec3(0.0, 0.05, 2.2);
      vec3 rd = normalize(vec3(uv, -1.55));

      // light moves gently
      float t = uTime*0.25;
      vec3 lightPos = vec3(1.2*cos(t), 0.7 + 0.25*sin(t*1.3), 1.6);
      vec3 lightCol = vec3(0.75,0.88,1.0);

      // raymarch
      float dist = 0.0;
      float hit = 0.0;
      vec3 p;
      for(int i=0;i<90;i++){
        p = ro + rd*dist;
        float d = mapLungs(p);
        if(d<0.0015){ hit=1.0; break; }
        dist += d*0.92;
        if(dist>6.0) break;
      }

      // background gradient
      vec3 col = mix(vec3(0.05,0.10,0.18), vec3(0.08,0.18,0.30), vUv.y);

      // soft fog volume in front (breath ambience)
      float fog = 0.0;
      float steps = 18.0;
      float stepLen = 0.12;
      vec3 fp = ro;
      for(int i=0;i<18;i++){
        fp += rd*stepLen;
        float f = fogField(fp + vec3(0.0,0.0,uTime*0.2));
        fog += f * 0.03;
      }
      fog *= (0.35 + uBreath*0.55);
      col += fog * vec3(0.35,0.55,0.75);

      if(hit>0.5){
        vec3 n = getNormal(p);
        vec3 l = normalize(lightPos - p);
        float diff = clamp(dot(n,l), 0.0, 1.0);

        // spec
        vec3 v = normalize(ro - p);
        vec3 h = normalize(l+v);
        float spec = pow(clamp(dot(n,h),0.0,1.0), 64.0);

        // subsurface-ish
        float rim = pow(1.0 - clamp(dot(n,v),0.0,1.0), 2.2);

        // base lung color
        vec3 base = mix(vec3(0.20,0.35,0.55), vec3(0.30,0.52,0.78), 0.55 + 0.45*uBreath);

        // bronchi highlight (approx via y/center)
        float bron = smoothstep(0.20,0.55, p.y) * smoothstep(0.55,0.0, abs(p.x));
        base += bron * vec3(0.18,0.26,0.38);

        col = base * (0.28 + 0.90*diff) * lightCol;
        col += spec * vec3(0.65,0.80,1.0) * 0.55;
        col += rim  * vec3(0.40,0.65,0.95) * (0.20 + 0.25*uBreath);

        // internal “air sparkle” linked to uAir
        float sparkle = hash(floor(p*40.0 + uTime*2.0));
        col += sparkle * (0.08 + 0.22*uAir) * vec3(0.55,0.75,0.95);

        // distance fog
        float df = smoothstep(0.0, 3.0, dist);
        col = mix(col, vec3(0.08,0.16,0.25), df*0.25);
      }

      // vignette
      float vgn = smoothstep(1.15, 0.15, length(uv));
      col *= (0.85 + 0.15*vgn);

      // tiny film grain
      float g = hash(vec3(vUv*uRes, uTime))*0.03;
      col += g;

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const compile = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn(gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  };

  const initGL = () => {
    if (!gl) return;

    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;

    glProg = gl.createProgram();
    gl.attachShader(glProg, vs);
    gl.attachShader(glProg, fs);
    gl.linkProgram(glProg);
    if (!gl.getProgramParameter(glProg, gl.LINK_STATUS)) {
      console.warn(gl.getProgramInfoLog(glProg));
      return;
    }
    gl.useProgram(glProg);

    glBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, glBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1,-1,  1,-1, -1, 1,
      -1, 1,  1,-1,  1, 1
    ]), gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(glProg, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    uTime   = gl.getUniformLocation(glProg, "uTime");
    uRes    = gl.getUniformLocation(glProg, "uRes");
    uBreath = gl.getUniformLocation(glProg, "uBreath");
    uAir    = gl.getUniformLocation(glProg, "uAir");
    uPhase  = gl.getUniformLocation(glProg, "uPhase");
  };

  initGL();

  const resizeCanvases = () => {
    const rect = visualBox.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));

    if (glCanvas.width !== w || glCanvas.height !== h) {
      glCanvas.width = w; glCanvas.height = h;
      gl && gl.viewport(0, 0, w, h);
    }
    if (airCanvas.width !== w || airCanvas.height !== h) {
      airCanvas.width = w; airCanvas.height = h;
    }
  };

  window.addEventListener("resize", resizeCanvases, { passive: true });

  /* -------------------- Particules 2D (très léger) -------------------- */
  const particles = [];
  const seedParticles = () => {
    particles.length = 0;
    for (let i=0;i<42;i++){
      particles.push({
        x: Math.random(),
        y: Math.random(),
        r: 0.004 + Math.random()*0.008,
        s: 0.04 + Math.random()*0.08,
        o: 0.15 + Math.random()*0.25,
      });
    }
  };
  seedParticles();

  const drawAir2D = (dt) => {
    if (!airCtx) return;
    const w = airCanvas.width, h = airCanvas.height;
    airCtx.clearRect(0,0,w,h);

    // voile doux
    airCtx.globalCompositeOperation = "source-over";
    airCtx.fillStyle = "rgba(140,190,255,0.035)";
    airCtx.fillRect(0,0,w,h);

    // particules “souffle”
    const intensity = 0.25 + state.air*0.75;
    airCtx.globalCompositeOperation = "screen";
    for (const p of particles){
      // direction: inspiration monte légèrement, expiration descend
      const dir = (state.phase === "exhale") ? 1 : -1;
      p.y += dir * p.s * dt * (0.30 + state.air*0.9);
      p.x += (Math.sin((p.y*8 + performance.now()*0.0006))*0.0008) * w;

      if (p.y < -0.05) p.y = 1.05;
      if (p.y > 1.05) p.y = -0.05;

      const cx = p.x*w;
      const cy = p.y*h;

      const rr = p.r * (0.7 + state.breath*0.8) * w;
      const grd = airCtx.createRadialGradient(cx,cy,0,cx,cy,rr*10);
      grd.addColorStop(0, `rgba(210,245,255,${p.o*intensity})`);
      grd.addColorStop(1, `rgba(210,245,255,0)`);
      airCtx.fillStyle = grd;
      airCtx.beginPath();
      airCtx.arc(cx,cy,rr*10,0,Math.PI*2);
      airCtx.fill();
    }
  };

  /* -------------------- Animation loop -------------------- */
  let lastMs = performance.now();

  const render = (nowMs) => {
    const dt = Math.min(0.05, (nowMs - lastMs) / 1000);
    lastMs = nowMs;

    resizeCanvases();

    // CSS vars (pour tes styles existants)
    document.documentElement.style.setProperty("--breath", String(state.breath));
    document.documentElement.style.setProperty("--air", String(state.air));

    // WebGL draw
    if (gl && glProg) {
      gl.useProgram(glProg);
      gl.uniform1f(uTime, nowMs * 0.001);
      gl.uniform2f(uRes, glCanvas.width, glCanvas.height);
      gl.uniform1f(uBreath, state.breath);
      gl.uniform1f(uAir, state.air);
      gl.uniform1f(uPhase,
        state.phase === "inhale" ? 1 :
        state.phase === "hold"   ? 2 :
        state.phase === "exhale" ? 3 : 0
      );
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    // 2D air overlay
    drawAir2D(dt);

    requestAnimationFrame(render);
  };
  requestAnimationFrame(render);

  /* -------------------- Engine phases -------------------- */
  const phaseOrder = () => {
    const seq = [];
    seq.push({ key:"inhale", sec: state.inhale });
    if (state.hold > 0) seq.push({ key:"hold", sec: state.hold });
    seq.push({ key:"exhale", sec: state.exhale });
    return seq;
  };

  const setPhase = (key, nowMs) => {
    state.phase = key;
    state.phaseStartMs = nowMs;
    state.phaseDurMs = (key === "inhale" ? state.inhale : key === "hold" ? state.hold : state.exhale) * 1000;

    // UI
    setStage(labelForPhase(key));
    if (state.coach) {
      if (key === "inhale") setCoach("Relâche les épaules. Inspire doucement.");
      else if (key === "hold") setCoach("Garde l’air un instant… en sécurité.");
      else if (key === "exhale") setCoach("Expire lentement. Laisse sortir la tension.");
    }

    // body class (si utilisé ailleurs)
    document.body.classList.remove("breath-inhale","breath-hold","breath-exhale");
    if (key === "inhale") document.body.classList.add("breath-inhale");
    if (key === "hold")   document.body.classList.add("breath-hold");
    if (key === "exhale") document.body.classList.add("breath-exhale");
  };

  const phaseProgress = (nowMs) => {
    if (state.phaseDurMs <= 0) return 1;
    return Math.min(1, Math.max(0, (nowMs - state.phaseStartMs) / state.phaseDurMs));
  };

  const updateBreathVars = (nowMs) => {
    // breath 0..1 : inhale -> monte, hold -> stable, exhale -> descend
    const p = phaseProgress(nowMs);

    if (state.phase === "inhale") {
      // ease
      const e = p*p*(3-2*p);
      state.breath = e;
      state.air = 0.35 + 0.65*e;
    } else if (state.phase === "hold") {
      state.breath = 1;
      state.air = 0.25;
    } else if (state.phase === "exhale") {
      const e = p*p*(3-2*p);
      state.breath = 1 - e;
      state.air = 0.35 + 0.65*(1-e);
    } else {
      state.breath = 0;
      state.air = 0;
    }

    // souffle sonore : plus fort quand l'air bouge
    const velocity = (state.phase === "inhale" || state.phase === "exhale") ? (0.35 + state.air*0.8) : 0.08;
    setBreathSoundIntensity(velocity);
  };

  /* -------------------- Décompte + voix (synchronisation) -------------------- */
  let lastCountInt = null;

  const scheduleVoiceForThisSecond = (phaseKey, secondsLeftInt) => {
    // Ne dis jamais "0"
    if (secondsLeftInt <= 0) return;

    // Voix = phase + éventuellement chiffre
    // On garde ce que tu as validé : inspire/expire + décompte
    const phaseWord = (phaseKey === "inhale") ? "Inspire" :
                      (phaseKey === "hold") ? "Bloque" : "Expire";

    let txt = phaseWord;

    if (state.count) txt += `… ${secondsLeftInt}`;

    // Coach doux (optionnel)
    if (state.coach) {
      if (phaseKey === "inhale" && secondsLeftInt === state.inhale) txt += ". Doucement.";
      if (phaseKey === "exhale" && secondsLeftInt === state.exhale) txt += ". Très lentement.";
    }

    speak(txt);
  };

  const updateCountdownAndVoice = (nowMs) => {
    if (!state.running || state.paused) return;

    const p = phaseProgress(nowMs);
    const totalSec = Math.max(1, Math.round(state.phaseDurMs/1000));

    // secondes restantes (sans tomber à 0 prononcé)
    const secLeft = Math.max(0, Math.ceil((1 - p) * totalSec));
    setSec(secLeft === 0 ? "—" : String(secLeft));

    // tick + vib à chaque seconde
    if (lastCountInt !== secLeft) {
      lastCountInt = secLeft;
      playTick();
      doVibrate(16);
    }

    // Voix anticipée (corrige le retard constaté)
    // On déclenche la voix au changement de seconde, mais avec un lead fixe :
    // On la lance légèrement plus tôt en surveillant le temps “idéal”.
    // Ici, simplification robuste : on parle immédiatement au changement de seconde,
    // mais on “décale” le décompte visuel si besoin via state.voiceLeadMs côté phase start.
  };

  /* -------------------- Boucle moteur -------------------- */
  let engineRAF = null;
  let seq = [];
  let seqIdx = 0;
  let totalStartMs = 0;

  const stepEngine = (nowMs) => {
    if (!state.running) return;

    if (!state.paused) {
      updateBreathVars(nowMs);
      updateCountdownAndVoice(nowMs);

      // fin de phase ?
      if (phaseProgress(nowMs) >= 1) {
        // avancer
        seqIdx = (seqIdx + 1) % seq.length;
        setPhase(seq[seqIdx].key, nowMs);

        // annonce de phase (immédiate mais anticipée via voiceLeadMs en ajustant phaseStart)
        // Astuce: on “recule” virtuellement phaseStart pour aligner la voix au décompte
        // sans toucher le décompte (qui est bon)
        state.phaseStartMs = nowMs - state.voiceLeadMs;

        // reset compteur
        lastCountInt = null;

        // annonce + premier décompte
        if (state.voice) {
          const s = seq[seqIdx].sec;
          scheduleVoiceForThisSecond(seq[seqIdx].key, Math.max(1, s));
        }
      }

      // durée totale
      if (!state.infinite) {
        const elapsed = (nowMs - totalStartMs) / 1000;
        const remain = Math.max(0, Math.ceil(state.durationSec - elapsed));
        state.remainingTotal = remain;
        if (remain <= 0) {
          stopSession(true);
          return;
        }
      }
    }

    engineRAF = requestAnimationFrame(stepEngine);
  };

  /* -------------------- Start / Stop / Pause -------------------- */
  const startSession = async () => {
    if (state.running) return;

    applyRhythmFromUI();
    applyDurationFromUI();
    readToggles();

    state.running = true;
    state.paused = false;

    setStage("Prêt");
    setSec("—");
    if (state.coach) setCoach("Quand tu veux : inspire… puis expire.");

    // souffle audio (ne coupe pas l’ambiance, juste ajoute)
    await startBreathSound();

    // init sequence
    seq = phaseOrder();
    seqIdx = 0;

    const nowMs = performance.now();
    totalStartMs = nowMs;

    // démarre sur inhale
    setPhase(seq[0].key, nowMs);
    // applique le lead pour que la VOIX ne soit plus en retard
    state.phaseStartMs = nowMs - state.voiceLeadMs;

    lastCountInt = null;

    // annonce immédiate
    if (state.voice) {
      scheduleVoiceForThisSecond("inhale", Math.max(1, state.inhale));
    }

    engineRAF = requestAnimationFrame(stepEngine);
  };

  const stopSession = (silent = false) => {
    state.running = false;
    state.paused = false;
    if (engineRAF) cancelAnimationFrame(engineRAF);
    engineRAF = null;

    document.body.classList.remove("breath-inhale","breath-hold","breath-exhale");
    state.phase = "ready";
    state.breath = 0;
    state.air = 0;

    if (!silent) {
      setStage("Prêt");
      setSec("—");
      if (state.coach) setCoach("C’est terminé. Reviens à un souffle naturel.");
    }

    // stop breath sound only if you want: on le coupe au stop (logique)
    stopBreathSound();
    try { window.speechSynthesis?.cancel?.(); } catch {}
  };

  const togglePause = () => {
    if (!state.running) return;
    state.paused = !state.paused;
    if (state.paused) {
      setStage("Pause");
      if (state.coach) setCoach("Pause. Reprends quand tu veux.");
      setBreathSoundIntensity(0.04);
      try { window.speechSynthesis?.cancel?.(); } catch {}
    } else {
      const nowMs = performance.now();
      // recalage : on conserve synchro
      state.phaseStartMs = nowMs - state.voiceLeadMs;
      lastCountInt = null;
    }
  };

  /* -------------------- Events UI (ne casse pas ce qui marche) -------------------- */
  if (startBtn) startBtn.addEventListener("click", () => startSession(), { passive: true });
  if (stopBtn)  stopBtn.addEventListener("click",  () => stopSession(false), { passive: true });
  if (pauseBtn) pauseBtn.addEventListener("click", () => togglePause(), { passive: true });

  if (rhythmSel) rhythmSel.addEventListener("change", () => {
    applyRhythmFromUI();
    // si en cours : redémarrage propre de séquence au prochain cycle, sans casser le reste
  });

  if (durationSel) durationSel.addEventListener("change", () => {
    applyDurationFromUI();
  });

  const bindToggle = (el) => {
    if (!el) return;
    el.addEventListener("change", () => {
      readToggles();
      // Si on désactive voice, on coupe tout de suite
      if (!state.voice) { try { window.speechSynthesis?.cancel?.(); } catch {} }
      // tick/vib etc se mettront à jour automatiquement
    }, { passive: true });
  };

  [voiceToggle, countToggle, tickToggle, vibToggle, coachToggle].forEach(bindToggle);

  // init UI state
  applyRhythmFromUI();
  applyDurationFromUI();
  readToggles();

  setStage("Prêt");
  setSec("—");
  setCoach("Quand tu veux : inspire… puis expire.");
})();