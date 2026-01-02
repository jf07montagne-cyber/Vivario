(() => {
  const stageLabel = document.getElementById("stageLabel");
  const secLabel   = document.getElementById("secLabel");
  const coachText  = document.getElementById("coachText");

  const btnStart   = document.getElementById("btnStart");
  const btnStop    = document.getElementById("btnStop");

  const rhythmSelect = document.getElementById("rhythmSelect");

  const optVoice = document.getElementById("optVoice");
  const optCount = document.getElementById("optCount");
  const optTick  = document.getElementById("optTick");
  const optVibe  = document.getElementById("optVibe");
  const optSoft  = document.getElementById("optSoft");

  const glCanvas = document.getElementById("glCanvas");
  const airCanvas = document.getElementById("airCanvas");

  let running = false;
  let raf = 0;

  let inhaleS = 4, holdS = 0, exhaleS = 6;

  let phase = "ready"; // inhale|hold|exhale
  let phaseStart = 0;  // performance.now
  let phaseDurMs = 1;

  let breath = 0; // 0..1
  let air = 0;    // 0..1

  let lastSec = null;
  let lastPhaseSpoken = "";

  // ====== audio souffle (web audio noise) ======
  let noiseSrc = null, noiseGain = null, noiseFilter = null;

  function clamp01(x){ return Math.max(0, Math.min(1, x)); }

  function setVars(){
    document.documentElement.style.setProperty("--breath", String(breath));
    document.documentElement.style.setProperty("--air", String(air));
  }

  function setBodyPhaseClass(p){
    document.body.classList.remove("breath-inhale","breath-hold","breath-exhale");
    if (p === "inhale") document.body.classList.add("breath-inhale");
    if (p === "hold") document.body.classList.add("breath-hold");
    if (p === "exhale") document.body.classList.add("breath-exhale");
  }

  function applyRhythm(){
    const val = String(rhythmSelect?.value || "4-0-6");
    const parts = val.split("-").map(n => parseInt(n,10));
    inhaleS = Number.isFinite(parts[0]) ? parts[0] : 4;
    holdS   = Number.isFinite(parts[1]) ? parts[1] : 0;
    exhaleS = Number.isFinite(parts[2]) ? parts[2] : 6;
  }

  function setUI(p, secLeft){
    if (p === "inhale"){
      stageLabel.textContent = "Inspire";
      coachText.textContent = "Inspire… doucement, sans forcer.";
    } else if (p === "hold"){
      stageLabel.textContent = "Garde";
      coachText.textContent = "Garde l’air… tranquille.";
    } else if (p === "exhale"){
      stageLabel.textContent = "Expire";
      coachText.textContent = "Expire… relâche, laisse partir.";
    } else {
      stageLabel.textContent = "Prêt";
      coachText.textContent = "Quand tu veux : inspire… puis expire.";
    }
    secLabel.textContent = (typeof secLeft === "number") ? String(secLeft) : "—";
  }

  function stopSpeech(){
    try{ window.speechSynthesis?.cancel?.(); }catch{}
  }

  function speakPhaseWord(p){
    const voiceOn = !!optVoice?.checked;
    const soft = !!optSoft?.checked;
    if (!voiceOn) return;

    // Inspire/Expire au moment exact du changement de phase
    if (p === "inhale") window.VivarioSound?.breathCue?.({ stage:"inspire", voice:true, coachSoft:soft, tick:false, vibrate:false });
    if (p === "exhale") window.VivarioSound?.breathCue?.({ stage:"expire", voice:true, coachSoft:soft, tick:false, vibrate:false });
    if (p === "hold")   window.VivarioSound?.breathCue?.({ stage:"bloque", voice:true, coachSoft:soft, tick:false, vibrate:false });
  }

  function tickSecond(p, secLeft){
    // ✅ ne jamais dire 0
    if (secLeft === 0) return;

    const voiceOn = !!optVoice?.checked;
    const countOn = !!optCount?.checked;
    const tickOn  = !!optTick?.checked;
    const vibeOn  = !!optVibe?.checked;
    const soft    = !!optSoft?.checked;

    if (tickOn) window.VivarioSound?.breathCue?.({ stage:p, voice:false, tick:true, vibrate:false });
    if (vibeOn) window.VivarioSound?.breathCue?.({ stage:p, voice:false, tick:false, vibrate:true });

    if (voiceOn && countOn){
      window.VivarioSound?.breathCue?.({ stage:p, voice:true, coachSoft:soft, tick:false, vibrate:false, countdown: secLeft });
    }
  }

  // ====== phase engine anti-dérive (synchro précise) ======
  function startPhase(p, seconds){
    phase = p;
    setBodyPhaseClass(p);
    phaseStart = performance.now();
    phaseDurMs = Math.max(1, seconds * 1000);
    lastSec = null;

    setUI(p, seconds);

    // dire Inspire/Expire (sans casser le décompte)
    if (running && lastPhaseSpoken !== p){
      lastPhaseSpoken = p;
      speakPhaseWord(p);
    }
  }

  function nextPhase(){
    if (phase === "inhale"){
      if (holdS > 0) startPhase("hold", holdS);
      else startPhase("exhale", exhaleS);
    } else if (phase === "hold"){
      startPhase("exhale", exhaleS);
    } else if (phase === "exhale"){
      startPhase("inhale", inhaleS);
    }
  }

  // ====== Canvas 2D particules (au-dessus) ======
  const ctx2d = airCanvas?.getContext?.("2d", { alpha:true });
  const parts2d = [];

  function resizeCanvas(){
    // IMPORTANT : les canvas sont en absolute => ne gonflent plus la page
    const parent = airCanvas?.parentElement;
    if (!parent) return;
    const r = parent.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    [airCanvas, glCanvas].forEach(c => {
      if (!c) return;
      c.width  = Math.max(1, Math.floor(r.width * dpr));
      c.height = Math.max(1, Math.floor(r.height * dpr));
      c.style.width = r.width + "px";
      c.style.height = r.height + "px";
    });

    if (ctx2d) ctx2d.setTransform(dpr,0,0,dpr,0,0);
    if (gl) gl.viewport(0,0, glCanvas.width, glCanvas.height);
  }

  function spawn2D(){
    if (!ctx2d) return;
    const w = airCanvas.clientWidth, h = airCanvas.clientHeight;
    parts2d.push({
      x: w*0.5 + (Math.random()-0.5)*w*0.06,
      y: h*0.22 + Math.random()*h*0.03,
      vx: (Math.random()-0.5)*0.25,
      vy: 0.8 + Math.random()*0.7,
      r: 1.4 + Math.random()*2.2,
      life: 1
    });
  }

  function draw2D(now){
    if (!ctx2d) return;
    const w = airCanvas.clientWidth, h = airCanvas.clientHeight;
    ctx2d.clearRect(0,0,w,h);

    if (running){
      const n = phase === "hold" ? 1 : 4;
      for (let i=0;i<n;i++) if (Math.random()<0.65) spawn2D();
    }

    const dir = (phase === "exhale") ? -1 : 1;
    const speed = running ? (0.55 + breath*1.35) : 0.15;
    const intensity = clamp01(0.18 + breath*0.82);

    for (let i=parts2d.length-1;i>=0;i--){
      const p = parts2d[i];
      p.x += p.vx*speed*dir;
      p.y += p.vy*speed*dir;
      p.life -= 0.010*speed;

      if (p.life<=0 || p.y<0 || p.y>h || p.x<-30 || p.x>w+30){
        parts2d.splice(i,1);
        continue;
      }

      ctx2d.globalAlpha = 0.55*intensity*p.life;
      ctx2d.beginPath();
      ctx2d.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx2d.fillStyle = "rgba(210,245,255,1)";
      ctx2d.fill();
      ctx2d.globalAlpha = 1;
    }
  }

  // ====== WebGL (fond profondeur + lumière) ======
  let gl = null, prog = null, buf = null;
  let uTime=null, uBreath=null, uRes=null, uDir=null;

  const VSH = `
    attribute vec2 p;
    varying vec2 v;
    void main(){
      v = (p+1.0)*0.5;
      gl_Position = vec4(p,0.0,1.0);
    }
  `;

  const FSH = `
    precision mediump float;
    varying vec2 v;
    uniform float t;
    uniform float b;
    uniform vec2 r;
    uniform float dir;

    float hash(vec2 p){
      p = fract(p*vec2(123.34, 456.21));
      p += dot(p, p+34.345);
      return fract(p.x*p.y);
    }

    float noise(vec2 p){
      vec2 i = floor(p);
      vec2 f = fract(p);
      float a = hash(i);
      float b1 = hash(i+vec2(1,0));
      float c = hash(i+vec2(0,1));
      float d = hash(i+vec2(1,1));
      vec2 u = f*f*(3.0-2.0*f);
      return mix(a,b1,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b1)*u.x*u.y;
    }

    void main(){
      vec2 uv = v;
      vec2 p = (uv-0.5);
      p.x *= r.x / r.y;

      // masque “zone poumons”
      float m = smoothstep(0.62, 0.10, length(p*vec2(1.0,0.85)));

      // profondeur (fog)
      float n = noise(uv*vec2(3.0,2.5) + vec2(0.0, t*0.08*dir));
      float n2 = noise(uv*vec2(9.0,7.0) + vec2(t*0.05, -t*0.03));
      float fog = (0.35*n + 0.65*n2);

      // lumière dynamique
      float glow = exp(-length(p-vec2(0.0, 0.05))*3.4);
      glow += exp(-length(p-vec2(0.0,-0.10))*4.2)*0.7;

      float intensity = (0.25 + 0.75*b);
      vec3 col = vec3(0.08,0.18,0.36) + vec3(0.18,0.34,0.60)*fog*0.55;
      col += vec3(0.45,0.65,0.90)*glow*0.22*intensity;

      float a = m*(0.38 + 0.45*fog)*intensity;
      gl_FragColor = vec4(col, a);
    }
  `;

  function compile(gl, type, src){
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  }

  function initWebGL(){
    try{
      gl = glCanvas.getContext("webgl", { premultipliedAlpha:true, alpha:true });
      if (!gl) return;

      const vs = compile(gl, gl.VERTEX_SHADER, VSH);
      const fs = compile(gl, gl.FRAGMENT_SHADER, FSH);
      prog = gl.createProgram();
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      gl.useProgram(prog);

      buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1,-1,  1,-1, -1, 1,
        -1, 1,  1,-1,  1, 1
      ]), gl.STATIC_DRAW);

      const loc = gl.getAttribLocation(prog, "p");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

      uTime = gl.getUniformLocation(prog, "t");
      uBreath = gl.getUniformLocation(prog, "b");
      uRes = gl.getUniformLocation(prog, "r");
      uDir = gl.getUniformLocation(prog, "dir");

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      return true;
    }catch{
      gl = null;
      return false;
    }
  }

  function drawWebGL(now){
    if (!gl || !prog) return;
    gl.useProgram(prog);

    gl.uniform1f(uTime, now*0.001);
    gl.uniform1f(uBreath, breath);
    gl.uniform2f(uRes, glCanvas.width, glCanvas.height);
    gl.uniform1f(uDir, (phase === "exhale") ? -1.0 : 1.0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  // ===== souffle sonore (léger, sans couper ambiance) =====
  function startBreathNoise(){
    try{
      const s = window.__VIVARIO_SOUND__;
      const ac = s?.audioCtx;
      if (!ac) return;

      if (noiseSrc) return;

      const len = ac.sampleRate; // 1 sec
      const buffer = ac.createBuffer(1, len, ac.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i=0;i<len;i++) data[i] = (Math.random()*2-1) * 0.35;

      noiseSrc = ac.createBufferSource();
      noiseSrc.buffer = buffer;
      noiseSrc.loop = true;

      noiseFilter = ac.createBiquadFilter();
      noiseFilter.type = "bandpass";
      noiseFilter.frequency.value = 650;
      noiseFilter.Q.value = 0.9;

      noiseGain = ac.createGain();
      noiseGain.gain.value = 0.0; // modulé en live

      noiseSrc.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ac.destination);
      noiseSrc.start();
    }catch{}
  }

  function stopBreathNoise(){
    try{
      if (noiseSrc){ noiseSrc.stop(); noiseSrc.disconnect(); }
    }catch{}
    try{
      noiseFilter?.disconnect?.();
      noiseGain?.disconnect?.();
    }catch{}
    noiseSrc = null; noiseGain = null; noiseFilter = null;
  }

  // ===== main loop =====
  function loop(now){
    if (running && phase !== "ready"){
      const elapsed = now - phaseStart;
      const t = clamp01(elapsed / phaseDurMs);
      const remaining = Math.max(0, phaseDurMs - elapsed);

      // ✅ secLeft stable & synchro (anti-dérive)
      // ex: au tout début -> inhaleS, puis descend
      const secLeft = Math.ceil(remaining / 1000);

      // update UI + tick only when changed
      if (lastSec !== secLeft){
        lastSec = secLeft;
        setUI(phase, secLeft);
        tickSecond(phase, secLeft);
      }

      // breath vars
      if (phase === "inhale"){ breath = t; }
      else if (phase === "hold"){ breath = 1; }
      else if (phase === "exhale"){ breath = 1 - t; }

      air = (air + (0.020 + 0.030*breath)) % 1;
      setVars();

      // souffle sonore modulé
      if (noiseGain){
        // inhale un peu plus léger, exhale un peu plus présent
        const base = 0.010; // très subtil
        const extra = 0.018 * breath;
        const dir = (phase === "exhale") ? 1.0 : 0.7;
        noiseGain.gain.value = base + extra*dir;
      }

      if (elapsed >= phaseDurMs - 4){ // petite marge
        nextPhase();
      }
    } else {
      breath *= 0.92;
      air *= 0.92;
      setVars();
      if (noiseGain) noiseGain.gain.value *= 0.92;
    }

    drawWebGL(now);
    draw2D(now);

    raf = requestAnimationFrame(loop);
  }

  async function start(){
    if (running) return;
    applyRhythm();
    running = true;

    lastSec = null;
    lastPhaseSpoken = "";

    try{ await window.VivarioSound?.unlock?.(); }catch{}

    startBreathNoise();

    startPhase("inhale", inhaleS);

    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function stop(){
    running = false;
    phase = "ready";
    setBodyPhaseClass("ready");
    setUI("ready", null);

    stopSpeech();
    stopBreathNoise();
  }

  function bind(){
    btnStart?.addEventListener("click", start);
    btnStop?.addEventListener("click", stop);

    rhythmSelect?.addEventListener("change", () => {
      applyRhythm();
      if (running){
        // redémarrage propre
        stop();
        start();
      }
    });

    // options appliquées en live (validé)
    optVoice?.addEventListener("change", () => { if (!optVoice.checked) stopSpeech(); });

    window.addEventListener("resize", resizeCanvas);
  }

  function init(){
    applyRhythm();
    setUI("ready", null);

    initWebGL();
    resizeCanvas();

    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);

    bind();
  }

  init();
})();