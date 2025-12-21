/* Vivario — respiration.js (V4 PRO)
   - Presets: 4-0-6 / 4-2-6 / 5-0-5 / 4-4-4-4
   - Durée session (infini / 2 / 3 / 5 / 10)
   - Guide vocal (SpeechSynthesis, FR) ✅ avec décompte (toutes les secondes)
   - Vibration (option)
   - Tick (WebAudio, option)
   - Visuel poumons + orbe piloté par CSS variables (smooth)
   - Audio souffle: VivarioSound.startBreathing(breath_cycle.mp3)
*/

(() => {
  // ---- DOM
  const stage = document.getElementById("breathStage");
  const label = document.getElementById("breathLabel");
  const timer = document.getElementById("breathTimer");
  const sub   = document.getElementById("breathSub");

  const btnStart = document.getElementById("btnBreathStart");
  const btnPause = document.getElementById("btnBreathPause");
  const btnStop  = document.getElementById("btnBreathStop");

  const selPreset   = document.getElementById("breathPreset");
  const selDuration = document.getElementById("breathDuration");

  const optVoice    = document.getElementById("optVoice");
  const optVibrate  = document.getElementById("optVibrate");
  const optTick     = document.getElementById("optTick");
  const optMuteAmb  = document.getElementById("optMuteAmb");

  // ---- Presets (sec)
  const PRESETS = {
    "4-0-6":     { inhale: 4, hold1: 0, exhale: 6, hold2: 0, name: "4–0–6" },
    "4-2-6":     { inhale: 4, hold1: 2, exhale: 6, hold2: 0, name: "4–2–6" },
    "5-0-5":     { inhale: 5, hold1: 0, exhale: 5, hold2: 0, name: "5–0–5" },
    "4-4-4-4":   { inhale: 4, hold1: 4, exhale: 4, hold2: 4, name: "4–4–4–4" },
  };

  // ---- State
  let running = false;
  let paused = false;

  let phase = "ready"; // ready | inhale | hold1 | exhale | hold2 | done
  let phaseT0 = 0;     // perf.now at phase start
  let phaseDur = 0;    // seconds

  let sessionT0 = 0;   // perf.now at start
  let sessionLimit = 0;// seconds, 0 = infini
  let raf = null;

  // tick audio
  let audioCtx = null;

  // ✅ Voix: timers (pour éviter le cancel qui casse le décompte)
  let speakTimeouts = [];
  let voicePrimed = false;

  // -------- Utils
  const clamp01 = (n) => Math.max(0, Math.min(1, n));

  function getCfg(){
    const key = selPreset?.value || "4-0-6";
    return PRESETS[key] || PRESETS["4-0-6"];
  }

  function setCSSVars(scale, glow){
    if (!stage) return;
    stage.style.setProperty("--bscale", String(scale));
    stage.style.setProperty("--bglow", String(glow));
  }

  function setButtons(){
    btnStart.disabled = running && !paused;
    btnPause.disabled = !running;
    btnStop.disabled  = !running;
    btnPause.textContent = paused ? "▶ Reprendre" : "⏸ Pause";
  }

  function canSpeak(){
    return !!(optVoice?.checked && ("speechSynthesis" in window));
  }

  function getFrenchVoice(){
    try {
      const voices = window.speechSynthesis.getVoices?.() || [];
      const fr = voices.find(v => (v.lang || "").toLowerCase().startsWith("fr"));
      return fr || null;
    } catch {
      return null;
    }
  }

  // ✅ speak "propre" : interrupt = true => on coupe et on parle tout de suite (début de phase)
  // interrupt = false => on n'annule PAS (pour laisser prononcer les chiffres)
  function speak(text, { interrupt = false } = {}){
    if (!canSpeak()) return;
    try {
      if (interrupt) window.speechSynthesis.cancel();

      const u = new SpeechSynthesisUtterance(String(text));
      u.lang = "fr-FR";
      u.rate = 1.02;   // plus naturel
      u.pitch = 1.0;
      u.volume = 1.0;

      const fr = getFrenchVoice();
      if (fr) u.voice = fr;

      window.speechSynthesis.speak(u);
    } catch {}
  }

  // ✅ Certains Android ont besoin d'une "prime" après le tap utilisateur
  function primeVoiceOnce(){
    if (!canSpeak() || voicePrimed) return;
    voicePrimed = true;
    try {
      // Utterance ultra courte, non gênante
      speak(" ", { interrupt: true });
    } catch {}
  }

  function clearSpeakTimers(){
    speakTimeouts.forEach(id => clearTimeout(id));
    speakTimeouts = [];
  }

  function scheduleVoiceForPhase(ph, durSec){
    clearSpeakTimers();
    if (!canSpeak()) return;
    if (durSec <= 0) return;

    // petite phrase plus naturelle
    let intro = "";
    if (ph === "inhale") intro = "Inspire…";
    else if (ph === "exhale") intro = "Expire… doucement…";
    else intro = "Bloque…";

    // on annonce l'intro tout de suite (on interromp la phase précédente)
    speak(intro, { interrupt: true });

    // ✅ Décompte: toutes les secondes restantes (dur, dur-1, ... 1)
    // On commence à 1 seconde après le début de la phase, pour être calé sur le visuel
    // Exemple 6s: annonce 6 (optionnel) puis 5..1
    // Ici: on dit TOUS les chiffres, y compris le premier
    const startSay = Math.ceil(durSec);

    // dire "durée" tout de suite (ex: "6")
    // (sans interrupt, pour ne pas couper "Expire…")
    speak(String(startSay), { interrupt: false });

    for (let n = startSay - 1; n >= 1; n--) {
      const delayMs = (startSay - n) * 1000; // 1s,2s,3s...
      const id = setTimeout(() => {
        if (!running || paused) return;
        // pas de cancel -> sinon on coupe les chiffres
        speak(String(n), { interrupt: false });
      }, delayMs);
      speakTimeouts.push(id);
    }
  }

  function vibrate(ms){
    if (!optVibrate?.checked) return;
    if (!navigator.vibrate) return;
    try { navigator.vibrate(ms); } catch {}
  }

  function tick(){
    if (!optTick?.checked) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const t = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(880, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t);
      o.stop(t + 0.14);
    } catch {}
  }

  function phaseLabel(ph){
    if (ph === "inhale") return "Inspire";
    if (ph === "exhale") return "Expire";
    if (ph === "hold1" || ph === "hold2") return "Bloque";
    if (ph === "done") return "Terminé";
    return "Prêt ?";
  }

  function phaseHelp(ph){
    if (ph === "inhale") return "Laisse l’air entrer doucement.";
    if (ph === "exhale") return "Relâche, sans forcer.";
    if (ph === "hold1" || ph === "hold2") return "Garde juste un instant.";
    if (ph === "done") return "Reviens à un souffle naturel.";
    return "Appuie sur “Démarrer”.";
  }

  function setPhase(ph, durSec){
    phase = ph;
    phaseDur = Math.max(0, durSec || 0);
    phaseT0 = performance.now();

    // classes visuelles
    document.body.classList.toggle("breath-inhale", phase === "inhale");
    document.body.classList.toggle("breath-exhale", phase === "exhale");
    document.body.classList.toggle("breath-hold", (phase === "hold1" || phase === "hold2"));

    label.textContent = phaseLabel(phase);
    sub.textContent   = phaseHelp(phase);

    // feedback
    if (phase !== "ready" && phase !== "done") {
      vibrate(18);
      tick();
    }

    // timer initial
    if (phase === "ready") timer.textContent = "4–6";
    else if (phase === "done") timer.textContent = "✓";
    else timer.textContent = `${Math.ceil(phaseDur)}s`;

    // ✅ voix + décompte (ici!)
    clearSpeakTimers();
    if (phase === "inhale" || phase === "exhale" || phase === "hold1" || phase === "hold2") {
      scheduleVoiceForPhase(phase, phaseDur);
    } else if (phase === "done") {
      if (canSpeak()) speak("C'est terminé. Reviens à un souffle naturel.", { interrupt: true });
    }
  }

  function getPhaseSequence(cfg){
    const seq = [
      { key: "inhale", dur: cfg.inhale },
      { key: "hold1",  dur: cfg.hold1 },
      { key: "exhale", dur: cfg.exhale },
      { key: "hold2",  dur: cfg.hold2 },
    ].filter(x => x.dur > 0);

    return seq.length ? seq : [{ key: "inhale", dur: 4 }, { key: "exhale", dur: 6 }];
  }

  // visuel
  function computeScale(ph, tNorm){
    if (ph === "inhale") return 0.92 + 0.18 * tNorm; // 0.92 -> 1.10
    if (ph === "exhale") return 1.10 - 0.18 * tNorm; // 1.10 -> 0.92
    if (ph === "hold1" || ph === "hold2") return 1.10;
    return 0.96;
  }

  function computeGlow(ph, tNorm){
    if (ph === "inhale") return 0.45 + 0.35 * tNorm;
    if (ph === "hold1" || ph === "hold2") return 0.78;
    if (ph === "exhale") return 0.80 - 0.35 * tNorm;
    return 0.45;
  }

  function updateLoop(){
    if (!running) return;

    // fin de session si durée choisie
    if (sessionLimit > 0) {
      const elapsedSession = (performance.now() - sessionT0) / 1000;
      if (elapsedSession >= sessionLimit) {
        stopBreath(true);
        return;
      }
    }

    if (paused) {
      raf = requestAnimationFrame(updateLoop);
      return;
    }

    const now = performance.now();
    const t = (now - phaseT0) / 1000;
    const tNorm = phaseDur > 0 ? clamp01(t / phaseDur) : 1;

    // timer
    if (phase !== "ready" && phase !== "done") {
      const left = Math.max(0, Math.ceil(phaseDur - t));
      timer.textContent = `${left}s`;
    }

    // visuel
    setCSSVars(computeScale(phase, tNorm), computeGlow(phase, tNorm));

    // transition de phase
    if (phase !== "ready" && phase !== "done" && t >= phaseDur) {
      const cfg = getCfg();
      const seq = getPhaseSequence(cfg);
      const idx = seq.findIndex(x => x.key === phase);
      const next = (idx >= 0) ? seq[(idx + 1) % seq.length] : seq[0];
      setPhase(next.key, next.dur);
    }

    raf = requestAnimationFrame(updateLoop);
  }

  async function startBreath(){
    // prime voice after user gesture
    primeVoiceOnce();

    // reprise
    if (running && paused) {
      paused = false;
      setButtons();
      if (canSpeak()) speak("On reprend.", { interrupt: true });

      const cfg = getCfg();
      const seq = getPhaseSequence(cfg);
      const cur = seq.find(x => x.key === phase) || seq[0];
      setPhase(cur.key, cur.dur);

      raf = requestAnimationFrame(updateLoop);
      return;
    }
    if (running) return;

    running = true;
    paused = false;
    document.body.classList.add("breath-running");

    sessionLimit = Number(selDuration?.value || "0") || 0;
    sessionT0 = performance.now();
    setButtons();

    const cfg = getCfg();
    const seq = getPhaseSequence(cfg);

    // souffle (breath_cycle.mp3)
    try {
      await window.VivarioSound?.startBreathing?.({
        inhale: cfg.inhale,
        exhale: cfg.exhale,
        hold: cfg.hold1 || 0,
        affectAmbience: false,
        affectBreath: true,
        muteAmbienceWhileBreath: !!optMuteAmb?.checked
      });
    } catch {}

    // init
    setCSSVars(0.96, 0.45);
    const first = seq[0];
    setPhase(first.key, first.dur);

    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(updateLoop);
  }

  function pauseBreath(){
    if (!running) return;
    paused = !paused;
    setButtons();

    if (paused) {
      clearSpeakTimers();
      try { window.speechSynthesis?.pause?.(); } catch {}
      if (canSpeak()) speak("Pause.", { interrupt: true });
    } else {
      try { window.speechSynthesis?.resume?.(); } catch {}
      const cfg = getCfg();
      const seq = getPhaseSequence(cfg);
      const cur = seq.find(x => x.key === phase) || seq[0];
      setPhase(cur.key, cur.dur);
      raf = requestAnimationFrame(updateLoop);
    }
  }

  function stopBreath(fromAutoEnd = false){
    running = false;
    paused = false;

    document.body.classList.remove("breath-running","breath-inhale","breath-exhale","breath-hold");
    setButtons();

    if (raf) cancelAnimationFrame(raf);
    raf = null;

    clearSpeakTimers();

    if (fromAutoEnd) setPhase("done", 0);
    else setPhase("ready", 0);

    setCSSVars(0.96, 0.45);

    try { window.VivarioSound?.stopBreathing?.(); } catch {}

    try { window.speechSynthesis?.cancel?.(); } catch {}
  }

  // ---- Events
  document.addEventListener("DOMContentLoaded", () => {
    // preload voices list
    try { window.speechSynthesis?.getVoices?.(); } catch {}

    setPhase("ready", 0);
    setCSSVars(0.96, 0.45);
    setButtons();

    btnStart.addEventListener("click", startBreath);
    btnPause.addEventListener("click", pauseBreath);
    btnStop.addEventListener("click", () => stopBreath(false));

    selPreset?.addEventListener("change", () => {
      if (!running || paused) return;
      const cfg = getCfg();
      const seq = getPhaseSequence(cfg);
      const first = seq[0];
      setPhase(first.key, first.dur);
    });

    optVoice?.addEventListener("change", () => {
      clearSpeakTimers();
      try { window.speechSynthesis?.cancel?.(); } catch {}
    });

    window.addEventListener("pagehide", () => stopBreath(false));
  });
})();