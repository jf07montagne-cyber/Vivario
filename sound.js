/* Vivario — sound.js (v2.0) — 0 MP3, 100% intégré (WebAudio)
   Ambiance "mer + vent" générée :
   - bruit rose + filtre (souffle)
   - LFO doux (vagues)
   - petit "hiss" très léger
   - Démarrage via bouton (obligatoire sur mobile)
*/

(() => {
  const KEY_ON  = "vivario_sound_on";
  const KEY_VOL = "vivario_sound_vol";

  const ui = {
    start:  () => document.getElementById("soundStart"),
    toggle: () => document.getElementById("soundToggle"),
    vol:    () => document.getElementById("soundVol"),
    dbg:    () => document.getElementById("soundDebug"),
  };

  let ctx = null;
  let master = null;

  // nodes
  let noiseSrc = null;      // BufferSource (loop)
  let noiseGain = null;
  let lowpass = null;

  let waveGain = null;      // amplitude modulation (vagues)
  let waveLFO = null;

  let hissSrc = null;       // bruit plus fin
  let hissGain = null;
  let hissHP = null;

  let started = false;      // nodes créés
  let playing = false;

  function getOn(){
    const v = localStorage.getItem(KEY_ON);
    return v === null ? true : v === "1";
  }
  function setOn(v){ localStorage.setItem(KEY_ON, v ? "1" : "0"); }

  function getVol(){
    const v = Number(localStorage.getItem(KEY_VOL));
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.35;
  }
  function setVol(v){ localStorage.setItem(KEY_VOL, String(Math.min(1, Math.max(0, v)))); }

  function setDebug(msg){
    const d = ui.dbg();
    if (d) d.textContent = msg || "";
  }

  function updateToggleLabel(){
    const t = ui.toggle();
    if (!t) return;
    const on = getOn();
    t.textContent = on ? (playing ? "🔊 Son : ON" : "🔊 Son : prêt") : "🔇 Son : OFF";
    t.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function ensureCtx(){
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = getVol();
    master.connect(ctx.destination);
    return ctx;
  }

  // --- bruit "rose" simple (plus doux que blanc)
  function makeNoiseBuffer(context, seconds = 4, type = "pink"){
    const sr = context.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = context.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);

    if (type === "white"){
      for (let i = 0; i < len; i++) out[i] = (Math.random() * 2 - 1);
      return buf;
    }

    // pink noise (filtre Paul Kellet)
    let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
    for (let i=0;i<len;i++){
      const white = Math.random()*2-1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      b6 = white * 0.115926;
      out[i] = pink * 0.12; // volume interne
    }
    return buf;
  }

  function buildGraph(){
    if (started) return;

    const c = ensureCtx();

    // --- base "vent/mer" (pink noise filtré)
    noiseSrc = c.createBufferSource();
    noiseSrc.buffer = makeNoiseBuffer(c, 4, "pink");
    noiseSrc.loop = true;

    lowpass = c.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 900; // douceur
    lowpass.Q.value = 0.7;

    noiseGain = c.createGain();
    noiseGain.gain.value = 0.18; // base

    // --- vagues (modulation lente)
    waveGain = c.createGain();
    waveGain.gain.value = 0.65; // profondeur des vagues

    waveLFO = c.createOscillator();
    waveLFO.type = "sine";
    waveLFO.frequency.value = 0.10; // ~10s par cycle

    const lfoGain = c.createGain();
    lfoGain.gain.value = 0.25; // amplitude modulation

    // LFO -> lfoGain -> waveGain.gain
    waveLFO.connect(lfoGain);
    lfoGain.connect(waveGain.gain);

    // --- petit "hiss" (aigu très léger)
    hissSrc = c.createBufferSource();
    hissSrc.buffer = makeNoiseBuffer(c, 3, "white");
    hissSrc.loop = true;

    hissHP = c.createBiquadFilter();
    hissHP.type = "highpass";
    hissHP.frequency.value = 2500;

    hissGain = c.createGain();
    hissGain.gain.value = 0.03;

    // --- routing
    noiseSrc.connect(lowpass);
    lowpass.connect(noiseGain);
    noiseGain.connect(waveGain);
    waveGain.connect(master);

    hissSrc.connect(hissHP);
    hissHP.connect(hissGain);
    hissGain.connect(master);

    // start
    noiseSrc.start();
    hissSrc.start();
    waveLFO.start();

    started = true;
  }

  async function startSound(){
    if (!getOn()){
      setDebug("Son OFF (active-le)");
      updateToggleLabel();
      return;
    }

    const c = ensureCtx();
    try{
      if (c.state === "suspended") await c.resume();
      buildGraph();
      playing = true;
      setDebug("✅ Ambiance démarrée");
      updateToggleLabel();
    }catch(e){
      playing = false;
      setDebug("❌ Bloqué : " + (e?.message || "inconnu"));
      updateToggleLabel();
    }
  }

  async function stopSound(){
    if (!ctx) return;
    try{
      await ctx.suspend();
    }catch{}
    playing = false;
    setDebug("⏸️ Ambiance arrêtée");
    updateToggleLabel();
  }

  function toggleSound(){
    const next = !getOn();
    setOn(next);
    if (next) startSound();
    else stopSound();
    updateToggleLabel();
  }

  function setVolume(v){
    setVol(v);
    if (master) master.gain.value = v;
    const slider = ui.vol();
    if (slider) slider.value = String(v);
  }

  document.addEventListener("DOMContentLoaded", () => {
    // init UI
    const slider = ui.vol();
    if (slider){
      slider.value = String(getVol());
      slider.addEventListener("input", () => setVolume(Number(slider.value)));
    }

    const btnStart = ui.start();
    if (btnStart){
      btnStart.addEventListener("click", () => startSound());
    }

    const btnToggle = ui.toggle();
    if (btnToggle){
      btnToggle.addEventListener("click", toggleSound);
    }

    setDebug("Appuie sur ▶️ Démarrer l’ambiance");
    updateToggleLabel();
  });
})();