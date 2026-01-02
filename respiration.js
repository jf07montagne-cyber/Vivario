/* Vivario — respiration.js (v18 WAOUH)
   ✅ Stop réel (timers + rAF + voix + tick + vib)
   ✅ Options (voix / décompte / tick / vibration / coach doux) fonctionnelles
   ✅ Rythme change réellement via select
   ✅ Voix : Inspire/Expire/Garde + décompte, synchronisé
   ✅ Visuel piloté par CSS vars --breath (0..1) et --air (0..1)
   ✅ N'impacte AUCUNE autre page
*/
(() => {
  const LS = {
    rhythm: "vivario_breath_rhythm",
    voice: "vivario_breath_voice",
    count: "vivario_breath_count",
    tick: "vivario_breath_tick",
    vib: "vivario_breath_vibrate",
    soft: "vivario_breath_soft"
  };

  // DOM
  const $ = (sel) => document.querySelector(sel);
  const elStage = $("#breathStage");
  const elSec   = $("#breathSec");
  const elCoach = $("#breathCoach");

  const selRhythm = $("#rhythmSel");

  const optVoice = $("#optVoice");
  const optCount = $("#optCount");
  const optTick  = $("#optTick");
  const optVib   = $("#optVibrate");
  const optSoft  = $("#optCoachSoft");

  const btnStart = $("#btnStart");
  const btnStop  = $("#btnStop");

  // Safety guard: only run on respiration page
  if (!document.body.classList.contains("page-breath")) return;

  // ---- State
  const state = {
    running: false,
    phaseIndex: 0,
    phaseStartMs: 0,
    lastWholeSecond: null,
    rafId: 0,
    tickTimer: 0,
    voicePrimed: false
  };

  // ---- Config (defaults)
  const defaults = {
    rhythm: "4-2-6",
    voice: true,
    count: true,
    tick: true,
    vib: false,
    soft: true
  };

  function readBool(key, def){
    const v = localStorage.getItem(key);
    if (v === null) return def;
    return v === "1";
  }
  function writeBool(key, val){
    localStorage.setItem(key, val ? "1" : "0");
  }

  function loadSettings(){
    const rhythm = localStorage.getItem(LS.rhythm) || defaults.rhythm;
    const voice = readBool(LS.voice, defaults.voice);
    const count = readBool(LS.count, defaults.count);
    const tick  = readBool(LS.tick, defaults.tick);
    const vib   = readBool(LS.vib, defaults.vib);
    const soft  = readBool(LS.soft, defaults.soft);
    return { rhythm, voice, count, tick, vib, soft };
  }

  function applySettingsToUI(s){
    if (selRhythm) selRhythm.value = s.rhythm;
    if (optVoice)  optVoice.checked = !!s.voice;
    if (optCount)  optCount.checked = !!s.count;
    if (optTick)   optTick.checked  = !!s.tick;
    if (optVib)    optVib.checked   = !!s.vib;
    if (optSoft)   optSoft.checked  = !!s.soft;
  }

  function parseRhythm(str){
    // "4-2-6" => [4,2,6]
    const parts = String(str || "").split("-").map(n => parseInt(n, 10)).filter(n => Number.isFinite(n) && n >= 0);
    if (parts.length !== 3) return [4,2,6];
    return parts;
  }

  // ---- Voice (female-ish preference, best effort)
  function pickFrenchVoice(){
    try{
      const all = window.speechSynthesis?.getVoices?.() || [];
      const fr = all.filter(v => String(v.lang||"").toLowerCase().startsWith("fr"));
      if (!fr.length) return null;

      const prefer = [
        "amélie","amelie","audrey","denise","julie","claire","sylvie","celine","caroline",
        "microsoft", "google", "female"
      ];

      // score voices by preferred keywords
      let best = fr[0], bestScore = -1;
      for (const v of fr){
        const name = String(v.name||"").toLowerCase();
        let score = 0;
        for (const k of prefer){
          if (name.includes(k)) score += 2;
        }
        // prefer non-compact voices sometimes
        if (String(v.name||"").toLowerCase().includes("natural")) score += 1;
        if (score > bestScore){
          bestScore = score;
          best = v;
        }
      }
      return best || fr[0];
    }catch{
      return null;
    }
  }

  function speak(text, { soft=true } = {}){
    if (!text) return;
    if (!window.speechSynthesis) return;

    try{
      window.speechSynthesis.cancel();

      const u = new SpeechSynthesisUtterance(String(text));
      u.lang = "fr-FR";

      // plus doux
      u.rate  = soft ? 0.92 : 0.98;
      u.pitch = soft ? 1.08 : 1.0;
      u.volume = 1.0;

      const v = pickFrenchVoice();
      if (v) u.voice = v;

      window.speechSynthesis.speak(u);
    }catch{}
  }

  function cancelVoice(){
    try{ window.speechSynthesis?.cancel?.(); }catch{}
  }

  // ---- Haptics / tick
  function vibrate(ms=18){
    if (!navigator.vibrate) return;
    try{ navigator.vibrate(ms); }catch{}
  }

  // Prefer using VivarioSound.breathCue if present (keeps your existing audio behavior)
  function doTick(enabled){
    if (!enabled) return;
    try{
      // small tick
      window.VivarioSound?.breathCue?.({ tick:true, voice:false, vibrate:false });
      return;
    }catch{}
    // fallback: none (we keep silent rather than breaking)
  }

  function doVibe(enabled){
    if (!enabled) return;
    vibrate(18);
  }

  // ---- Visual vars
  function setVars(breath01, air01){
    const b = Math.max(0, Math.min(1, breath01));
    const a = Math.max(0, Math.min(1, air01));
    document.documentElement.style.setProperty("--breath", String(b));
    document.documentElement.style.setProperty("--air", String(a));
  }

  function setBodyPhaseClass(phase){
    document.body.classList.remove("breath-inhale","breath-hold","breath-exhale");
    if (phase === "inhale") document.body.classList.add("breath-inhale");
    if (phase === "hold")   document.body.classList.add("breath-hold");
    if (phase === "exhale") document.body.classList.add("breath-exhale");
  }

  // ---- Timeline
  function buildPhases(rhythm){
    const [inh, hold, ex] = parseRhythm(rhythm);
    return [
      { key:"inhale", label:"Inspire",  seconds: inh, coach:(soft)=> soft ? "Inspire doucement… remplis l’air, sans forcer." : "Inspire." },
      { key:"hold",   label:"Garde",    seconds: hold, coach:(soft)=> soft ? "Garde l’air… juste un instant, c’est ok." : "Garde." },
      { key:"exhale", label:"Expire",   seconds: ex, coach:(soft)=> soft ? "Expire lentement… relâche les épaules." : "Expire." }
    ].filter(p => p.seconds > 0); // if hold=0 etc
  }

  function setCoachText(phase, soft){
    if (!elCoach) return;
    elCoach.innerHTML = phase.coach(soft);
  }

  function setStageText(txt){
    if (elStage) elStage.textContent = txt || "";
  }

  function setSecondText(txt){
    if (elSec) elSec.textContent = txt || "—";
  }

  // ---- Core controls
  function hardStop(){
    state.running = false;

    // timers
    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.rafId = 0;

    if (state.tickTimer) clearInterval(state.tickTimer);
    state.tickTimer = 0;

    // voice
    cancelVoice();

    // reset ui/vars
    setVars(0, 0);
    document.body.classList.remove("breath-inhale","breath-hold","breath-exhale");
    state.lastWholeSecond = null;

    setStageText("Prêt");
    setSecondText("—");
    if (elCoach) elCoach.innerHTML = "Appuie sur <b>Démarrer</b>. Laisse juste ton souffle suivre le rythme.";

    // button label
    if (btnStart) btnStart.textContent = "▶ Démarrer";
  }

  function start(){
    // ensure audio unlocked (Android/iOS)
    try{ window.VivarioSound?.unlock?.(); }catch{}

    state.running = true;
    state.phaseIndex = 0;
    state.phaseStartMs = performance.now();
    state.lastWholeSecond = null;

    if (btnStart) btnStart.textContent = "⟳ Recommencer";
    runLoop(true);
  }

  function restart(){
    hardStop();
    start();
  }

  function toggleStart(){
    if (!state.running){
      start();
    }else{
      restart();
    }
  }

  function nextPhase(phases){
    state.phaseIndex = (state.phaseIndex + 1) % phases.length;
    state.phaseStartMs = performance.now();
    state.lastWholeSecond = null;
  }

  function phaseProgress(now, phaseSeconds){
    const dur = Math.max(0.001, phaseSeconds) * 1000;
    const t = (now - state.phaseStartMs) / dur;
    return Math.max(0, Math.min(1, t));
  }

  function runLoop(justStarted=false){
    const settings = loadSettings();
    const phases = buildPhases(settings.rhythm);
    if (!phases.length){
      setStageText("Rythme invalide");
      return;
    }

    // if justStarted, start tick interval once
    if (justStarted){
      if (state.tickTimer) clearInterval(state.tickTimer);
      state.tickTimer = setInterval(() => {
        // tick once per second only while running
        if (!state.running) return;
        doTick(loadSettings().tick);
      }, 1000);
    }

    const step = (now) => {
      if (!state.running) return;

      const s = loadSettings();
      const phs = buildPhases(s.rhythm);

      // current phase
      const phase = phs[state.phaseIndex] || phs[0];
      const p = phaseProgress(now, phase.seconds);

      // phase class
      setBodyPhaseClass(phase.key);

      // visuals: breath curve
      // inhale: 0->1, hold: 1, exhale: 1->0
      let breath = 0;
      if (phase.key === "inhale") breath = easeInOut(p);
      else if (phase.key === "hold") breath = 1;
      else if (phase.key === "exhale") breath = 1 - easeInOut(p);

      // airflow (0..1) more when moving (inhale/exhale), little during hold
      let air = 0;
      if (phase.key === "hold") air = 0.05;
      else air = p; // progress indicates motion direction via CSS dash offset

      setVars(breath, air);

      // seconds left
      const total = phase.seconds;
      const elapsed = Math.floor((now - state.phaseStartMs) / 1000);
      const left = Math.max(0, total - elapsed);

      setStageText(phase.label);
      setCoachText(phase, s.soft);
      setSecondText(String(left));

      // voice scheduling (synchronised on whole seconds)
      const whole = Math.floor((now - state.phaseStartMs) / 1000);

      // When phase starts: speak the cue (Inspire/Expire/Garde)
      if (whole === 0 && state.lastWholeSecond !== 0){
        if (s.voice){
          // say cue softly
          speak(s.soft ? `${phase.label}…` : `${phase.label}.`, { soft: s.soft });
        }
        if (s.vib) doVibe(true);
      }

      // countdown: speak numbers on each second boundary (1..)
      if (whole !== state.lastWholeSecond){
        state.lastWholeSecond = whole;

        if (s.voice && s.count){
          // speak number after a tiny delay so it doesn't collide with the cue word
          const toSay = String(left);
          setTimeout(() => {
            // still running + still same phase window
            if (!state.running) return;
            speak(toSay, { soft: s.soft });
          }, whole === 0 ? 420 : 0);
        }
      }

      // phase end
      if (p >= 1){
        nextPhase(phs);
        state.phaseStartMs = now;
        state.lastWholeSecond = null;
      }

      state.rafId = requestAnimationFrame(step);
    };

    state.rafId = requestAnimationFrame(step);
  }

  // nice easing
  function easeInOut(t){
    return t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2;
  }

  // ---- Bind UI
  function bind(){
    const s = loadSettings();
    applySettingsToUI(s);

    // Persist changes + apply live
    selRhythm?.addEventListener("change", () => {
      localStorage.setItem(LS.rhythm, selRhythm.value);
      // if running, keep smooth: restart for perfect sync
      if (state.running) restart();
    });

    optVoice?.addEventListener("change", () => {
      writeBool(LS.voice, optVoice.checked);
      if (!optVoice.checked) cancelVoice();
    });

    optCount?.addEventListener("change", () => {
      writeBool(LS.count, optCount.checked);
      // no restart needed
    });

    optTick?.addEventListener("change", () => {
      writeBool(LS.tick, optTick.checked);
    });

    optVib?.addEventListener("change", () => {
      writeBool(LS.vib, optVib.checked);
    });

    optSoft?.addEventListener("change", () => {
      writeBool(LS.soft, optSoft.checked);
      // restart so voice parameters update immediately
      if (state.running) restart();
    });

    btnStart?.addEventListener("click", toggleStart);

    // STOP must stop everything
    btnStop?.addEventListener("click", () => {
      hardStop();
    });

    // Stop if page hidden (prevents “voice lost”)
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) hardStop();
    });

    // Ensure voices list is populated on some browsers
    try{
      window.speechSynthesis?.addEventListener?.("voiceschanged", () => {});
    }catch{}
  }

  // init
  bind();
  setVars(0,0);
})();