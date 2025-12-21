/* Vivario — respiration.js (V5 SYNC)
   - Cycle (preset) inhale/hold/exhale/hold
   - Visuel = CSS vars --bscale / --bglow (smooth) + classes inhale/exhale/hold
   - Audio souffle via VivarioSound.startBreathing()
   - VOIX synchronisée: chiffres prononcés pile sur les secondes (anti-décalage)
   - Option "Coach doux" (vocal) sans casser le décompte
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
  const optCoach    = document.getElementById("optCoach");     // ✅ nouveau
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

  let sessionT0 = 0;
  let sessionLimit = 0; // seconds (0 = infini)

  let raf = null;

  // audio tick
  let audioCtx = null;

  // voice sync
  let voicePrimed = false;
  let speakTimeouts = [];
  let phaseToken = 0;     // ✅ annule les anciens timers quand on change de phase
  let inhaleCount = 0;    // ✅ pour coach doux (toutes les 3 inspirations)

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
    if (!btnStart || !btnPause || !btnStop) return;
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

  // interrupt=true => cancel + speak now (pour coller pile au timing)
  function speak(text, { interrupt = false } = {}){
    if (!canSpeak()) return;
    try {
      if (interrupt) window.speechSynthesis.cancel();

      const u = new SpeechSynthesisUtterance(String(text));
      u.lang = "fr-FR";
      u.rate = 1.03; // naturel
      u.pitch = 1.0;
      u.volume = 1.0;

      const fr = getFrenchVoice();
      if (fr) u.voice = fr;

      window.speechSynthesis.speak(u);
    } catch {}
  }

  function primeVoiceOnce(){
    if (!canSpeak() || voicePrimed) return;
    voicePrimed = true;
    try {
      // Utterance ultra courte pour "débloquer" SpeechSynthesis après geste user
      speak(" ", { interrupt: true });
    } catch {}
  }

  function clearSpeakTimers(){
    speakTimeouts.forEach(id => clearTimeout(id));
    speakTimeouts = [];
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

  function getPhaseSequence(cfg){
    const seq = [
      { key: "inhale", dur: cfg.inhale },
      { key: "hold1",  dur: cfg.hold1 },
      { key: "exhale", dur: cfg.exhale },
      { key: "hold2",  dur: cfg.hold2 },
    ].filter(x => x.dur > 0);

    return seq.length ? seq : [{ key: "inhale", dur: 4 }, { key: "exhale", dur: 6 }];
  }

  // ----- VOIX SYNCHRO (anti-décalage)
  function scheduleVoiceCountdownForPhase(ph, durSec, token){
    clearSpeakTimers();
    if (!canSpeak()) return;
    if (durSec <= 0) return;

    // Coach doux: petite phrase très courte, rarement (toutes les 3 inspirations)
    const coachOn = !!optCoach?.checked;
    const coachPrefix =
      (coachOn && ph === "inhale" && (inhaleCount % 3 === 0))
        ? "Très bien. "
        : "";

    const word =
      ph === "inhale" ? "Inspire" :
      ph === "exhale" ? "Expire" :
      "Bloque";

    const startSay = Math.max(1, Math.round(durSec));

    // ✅ Phrase de départ = mot + premier chiffre (court => tient dans <1s)
    // interrupt true: on s'aligne immédiatement au changement de phase
    speak(`${coachPrefix}${word}, ${startSay}.`, { interrupt: true });

    // ✅ Puis chiffres sur chaque seconde EXACTE, et on "force" l'instant:
    // à chaque tick, on cancel ce qui reste et on prononce le chiffre.
    for (let n = startSay - 1; n >= 1; n--) {
      const delayMs = (startSay - n) * 1000; // 1s, 2s, 3s...
      const id = setTimeout(() => {
        if (!running || paused) return;
        if (token !== phaseToken) return;     // phase a changé
        if (phase !== ph) return;

        // ✅ clé: interrupt true pour éviter la file d'attente (décalage)
        speak(String(n), { interrupt: true });
      }, delayMs);

      speakTimeouts.push(id);
    }
  }

  // ----- Visuel
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

  function setPhase(ph, durSec){
    phaseToken++;
    const myToken = phaseToken;

    phase = ph;
    phaseDur = Math.max(0, Number(durSec || 0));
    phaseT0 = performance.now();

    // count inspirations (for coach)
    if (phase === "inhale") inhaleCount++;

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

    // ✅ voix + décompte synchro
    clearSpeakTimers();
    if (phase === "inhale" || phase === "exhale" || phase === "hold1" || phase === "hold2") {
      scheduleVoiceCountdownForPhase(phase, phaseDur, myToken);
    } else if (phase === "done") {
      if (canSpeak()) speak("Terminé. Reviens à un souffle naturel.", { interrupt: true });
    }
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

    // timer: ceil => change exactement au passage des secondes
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
    inhaleCount = 0;

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
      try { window.speechSynthesis?.cancel?.(); } catch {}
      if (canSpeak()) speak("Pause.", { interrupt: true });
    } else {
      if (canSpeak()) speak("Reprise.", { interrupt: true });
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
    try { window.speechSynthesis?.cancel?.(); } catch {}

    setCSSVars(0.96, 0.45);
    setPhase(fromAutoEnd ? "done" : "ready", 0);

    try { window.VivarioSound?.stopBreathing?.(); } catch {}
  }

  // ---- Events
  document.addEventListener("DOMContentLoaded", () => {
    try { window.speechSynthesis?.getVoices?.(); } catch {}

    setPhase("ready", 0);
    setCSSVars(0.96, 0.45);
    setButtons();

    btnStart?.addEventListener("click", startBreath);
    btnPause?.addEventListener("click", pauseBreath);
    btnStop?.addEventListener("click", () => stopBreath(false));

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