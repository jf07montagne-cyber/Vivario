/* Vivario — respiration.js (V3 PRO)
   - Presets: 4-0-6 / 4-2-6 / 5-0-5 / 4-4-4-4
   - Durée session (infini / 2 / 3 / 5 / 10)
   - Guide vocal (SpeechSynthesis, FR) + ✅ décompte vocal
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

  // ✅ Voix: gestion du décompte
  let voiceTimer = null;
  let lastSpokenSecond = null;

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

  function speak(text){
    if (!canSpeak()) return;
    try {
      // stop enchainements
      window.speechSynthesis.cancel();

      const u = new SpeechSynthesisUtterance(text);
      u.lang = "fr-FR";
      u.rate = 0.95;
      u.pitch = 1.0;
      u.volume = 1.0;

      // Essaie de choisir une voix FR si dispo
      const voices = window.speechSynthesis.getVoices?.() || [];
      const fr = voices.find(v => (v.lang || "").toLowerCase().startsWith("fr"));
      if (fr) u.voice = fr;

      window.speechSynthesis.speak(u);
    } catch {}
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

  function clearVoiceCountdown(){
    if (voiceTimer) clearInterval(voiceTimer);
    voiceTimer = null;
    lastSpokenSecond = null;
  }

  // ✅ Décompte vocal: annonce les secondes restantes
  function startVoiceCountdown(){
    clearVoiceCountdown();
    if (!canSpeak()) return;
    if (phase === "ready" || phase === "done") return;
    if (phaseDur <= 0) return;

    // on démarre en annonçant la phase + durée
    // (ex: "Inspire, 4")
    const firstWord =
      phase === "inhale" ? "Inspire" :
      phase === "exhale" ? "Expire" :
      "Bloque";
    speak(`${firstWord}. ${Math.ceil(phaseDur)}`);

    // puis on annonce 3..2..1 (ou plus si long)
    // cadence: 1 sec
    voiceTimer = setInterval(() => {
      if (!running || paused) return;

      const t = (performance.now() - phaseT0) / 1000;
      const left = Math.max(0, Math.ceil(phaseDur - t));

      // on évite de répéter
      if (left === lastSpokenSecond) return;

      // on parle à partir de 3 (ou toujours si tu veux)
      // Ici: si phase <=4 => on annonce tout (4,3,2,1)
      // si phase >4 => on annonce 3,2,1 seulement (plus “pro”, moins bavard)
      const announceAll = phaseDur <= 4.5;

      const shouldSpeak =
        (announceAll && left >= 1 && left <= Math.ceil(phaseDur)) ||
        (!announceAll && left >= 1 && left <= 3);

      if (shouldSpeak) {
        // Ne pas dire “0”
        speak(String(left));
        lastSpokenSecond = left;
      }
    }, 250);
  }

  function setPhase(ph, durSec){
    phase = ph;
    phaseDur = Math.max(0, durSec || 0);
    phaseT0 = performance.now();

    // classes visuelles (poumons & orbe)
    document.body.classList.toggle("breath-inhale", phase === "inhale");
    document.body.classList.toggle("breath-exhale", phase === "exhale");
    document.body.classList.toggle("breath-hold", (phase === "hold1" || phase === "hold2"));

    label.textContent = phaseLabel(phase);
    sub.textContent   = phaseHelp(phase);

    // feedback
    if (phase !== "ready" && phase !== "done") {
      vibrate(20);
      tick();
    }

    // timer initial
    if (phase === "ready") timer.textContent = "4–6";
    else if (phase === "done") timer.textContent = "✓";
    else timer.textContent = `${Math.ceil(phaseDur)}s`;

    // ✅ voix + décompte
    clearVoiceCountdown();

    if (phase === "inhale" || phase === "exhale" || phase === "hold1" || phase === "hold2") {
      startVoiceCountdown();
    } else if (phase === "done") {
      speak("C'est terminé. Reviens à un souffle naturel.");
    }
  }

  function getPhaseSequence(cfg){
    // ordre: inhale -> hold1 -> exhale -> hold2 -> repeat
    const seq = [
      { key: "inhale", dur: cfg.inhale },
      { key: "hold1",  dur: cfg.hold1 },
      { key: "exhale", dur: cfg.exhale },
      { key: "hold2",  dur: cfg.hold2 },
    ].filter(x => x.dur > 0);

    return seq.length ? seq : [{ key: "inhale", dur: 4 }, { key: "exhale", dur: 6 }];
  }

  // Progression visuelle (poumons & orbe)
  function computeScale(ph, tNorm){
    // inhale: scale monte
    // exhale: scale descend
    // hold: stable
    if (ph === "inhale") return 0.92 + 0.18 * tNorm;      // 0.92 -> 1.10
    if (ph === "exhale") return 1.10 - 0.18 * tNorm;      // 1.10 -> 0.92
    if (ph === "hold1" || ph === "hold2") return 1.10;    // maintient
    return 0.96;
  }

  function computeGlow(ph, tNorm){
    if (ph === "inhale") return 0.45 + 0.35 * tNorm; // 0.45 -> 0.80
    if (ph === "hold1" || ph === "hold2") return 0.78;
    if (ph === "exhale") return 0.80 - 0.35 * tNorm; // 0.80 -> 0.45
    return 0.45;
  }

  function updateLoop(){
    if (!running) return;

    // session duration end
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
    const t = (now - phaseT0) / 1000; // seconds into phase
    const tNorm = phaseDur > 0 ? clamp01(t / phaseDur) : 1;

    // Update timer
    if (phase !== "ready" && phase !== "done") {
      const left = Math.max(0, Math.ceil(phaseDur - t));
      timer.textContent = `${left}s`;
    }

    // Update visuals
    const scale = computeScale(phase, tNorm);
    const glow  = computeGlow(phase, tNorm);
    setCSSVars(scale, glow);

    // Phase transitions
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
    // reprendre depuis pause
    if (running && paused) {
      paused = false;
      setButtons();
      speak("Reprends");
      // relance phase propre
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

    // session limit
    sessionLimit = Number(selDuration?.value || "0") || 0;
    sessionT0 = performance.now();

    setButtons();

    const cfg = getCfg();
    const seq = getPhaseSequence(cfg);

    // Son souffle (breath_cycle.mp3)
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

    // init phase
    const first = seq[0];
    setPhase(first.key, first.dur);

    // initial visuals
    setCSSVars(0.96, 0.45);

    // start loop
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(updateLoop);
  }

  function pauseBreath(){
    if (!running) return;
    paused = !paused;
    setButtons();

    if (paused) {
      clearVoiceCountdown();
      speak("Pause");
    } else {
      // reprise phase propre
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

    clearVoiceCountdown();

    // reset UI
    if (fromAutoEnd) {
      setPhase("done", 0);
    } else {
      setPhase("ready", 0);
    }

    // reset visuals
    setCSSVars(0.96, 0.45);

    // stop breath sound
    try { window.VivarioSound?.stopBreathing?.(); } catch {}

    // stop voice
    try { window.speechSynthesis?.cancel?.(); } catch {}
  }

  // ---- Events
  document.addEventListener("DOMContentLoaded", () => {
    // preload voices list (some browsers need it)
    try { window.speechSynthesis?.getVoices?.(); } catch {}

    // initial
    setPhase("ready", 0);
    setCSSVars(0.96, 0.45);
    setButtons();

    btnStart.addEventListener("click", startBreath);
    btnPause.addEventListener("click", pauseBreath);
    btnStop.addEventListener("click", () => stopBreath(false));

    // Changing preset while running => restart clean on new preset
    selPreset?.addEventListener("change", () => {
      if (!running || paused) return;
      const cfg = getCfg();
      const seq = getPhaseSequence(cfg);
      const first = seq[0];
      setPhase(first.key, first.dur);
    });

    // si l'utilisateur coupe la voix pendant l'exercice => stoppe le décompte
    optVoice?.addEventListener("change", () => {
      if (!optVoice.checked) {
        clearVoiceCountdown();
        try { window.speechSynthesis?.cancel?.(); } catch {}
      } else {
        // relance décompte sur la phase courante
        if (running && !paused && phase !== "ready" && phase !== "done") startVoiceCountdown();
      }
    });

    // sécurité : stop si on quitte la page
    window.addEventListener("pagehide", () => stopBreath(false));
  });
})();