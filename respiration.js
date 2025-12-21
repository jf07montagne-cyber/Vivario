/* Vivario — respiration.js (V6 PRO)
   - Toujours synchro (anti-décalage) : voix planifiée sur les secondes
   - Pré-compte 3..2..1 avant de démarrer le cycle
   - Coach doux dosé (pas trop fréquent) + intonation plus naturelle
   - Option "Coach doux" (optCoach) + option "Guide vocal" (optVoice)
   - Le visuel (CSS vars --bscale/--bglow) reste smooth
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
  const optCoach    = document.getElementById("optCoach");
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

  let phase = "ready"; // ready | pre | inhale | hold1 | exhale | hold2 | done
  let phaseT0 = 0;
  let phaseDur = 0;

  let sessionT0 = 0;
  let sessionLimit = 0; // seconds (0 = infini)

  let raf = null;

  // audio tick
  let audioCtx = null;

  // voice sync
  let voicePrimed = false;
  let speakTimeouts = [];
  let phaseToken = 0;

  // coach cadence
  let cycleCount = 0;           // cycles complets
  let inhaleCount = 0;          // inspirations
  let lastCoachAt = -999;       // timestamp session seconds
  const COACH_MIN_GAP = 18;     // secondes min entre 2 phrases coach (dosage)

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

  function speak(text, { interrupt = false, rate = 1.03, pitch = 1.0 } = {}){
    if (!canSpeak()) return;
    try {
      if (interrupt) window.speechSynthesis.cancel();

      const u = new SpeechSynthesisUtterance(String(text));
      u.lang = "fr-FR";
      u.rate = rate;
      u.pitch = pitch;
      u.volume = 1.0;

      const fr = getFrenchVoice();
      if (fr) u.voice = fr;

      window.speechSynthesis.speak(u);
    } catch {}
  }

  function primeVoiceOnce(){
    if (!canSpeak() || voicePrimed) return;
    voicePrimed = true;
    try { speak(" ", { interrupt: true }); } catch {}
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
    if (ph === "pre") return "On démarre";
    if (ph === "done") return "Terminé";
    return "Prêt ?";
  }

  function phaseHelp(ph){
    if (ph === "inhale") return "Laisse l’air entrer doucement.";
    if (ph === "exhale") return "Relâche, sans forcer.";
    if (ph === "hold1" || ph === "hold2") return "Garde juste un instant.";
    if (ph === "pre") return "Place-toi confortablement.";
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

  function sessionSeconds(){
    return (performance.now() - sessionT0) / 1000;
  }

  function maybeCoachPhrase(phaseKey){
    if (!optCoach?.checked) return "";
    const t = sessionSeconds();

    if (t - lastCoachAt < COACH_MIN_GAP) return "";

    // phrases courtes + pas intrusives
    const phrasesInhale = [
      "Très bien… doucement.",
      "Ok… prends ton temps.",
      "C’est parfait, continue comme ça."
    ];
    const phrasesExhale = [
      "Relâche… laisse partir.",
      "Laisse les épaules descendre.",
      "Expire lentement…"
    ];
    const phrasesHold = [
      "Juste une petite pause.",
      "Reste tranquille…"
    ];

    // dosage : coach 1 fois sur ~3 inspirations (et surtout au début)
    let pick = "";
    if (phaseKey === "inhale" && (inhaleCount <= 2 || inhaleCount % 3 === 0)) {
      pick = phrasesInhale[(inhaleCount + 1) % phrasesInhale.length];
    } else if (phaseKey === "exhale" && (inhaleCount <= 2 || inhaleCount % 3 === 0)) {
      pick = phrasesExhale[(inhaleCount + 2) % phrasesExhale.length];
    } else if ((phaseKey === "hold1" || phaseKey === "hold2") && inhaleCount % 4 === 0) {
      pick = phrasesHold[(inhaleCount + 3) % phrasesHold.length];
    }

    if (pick) lastCoachAt = t;
    return pick ? (pick + " ") : "";
  }

  function scheduleVoiceCountdownForPhase(ph, durSec, token){
    clearSpeakTimers();
    if (!canSpeak()) return;
    if (durSec <= 0) return;

    const word =
      ph === "inhale" ? "Inspire" :
      ph === "exhale" ? "Expire" :
      "Bloque";

    const startSay = Math.max(1, Math.round(durSec));

    // ✅ coach doux éventuel (dosé)
    const coach = maybeCoachPhrase(ph);

    // phrase plus naturelle (intonation légère)
    speak(`${coach}${word}. ${startSay}.`, { interrupt: true, rate: 1.02, pitch: 1.0 });

    // compte à rebours pile sur les secondes
    for (let n = startSay - 1; n >= 1; n--) {
      const delayMs = (startSay - n) * 1000;
      const id = setTimeout(() => {
        if (!running || paused) return;
        if (token !== phaseToken) return;
        if (phase !== ph) return;
        speak(String(n), { interrupt: true, rate: 1.04, pitch: 1.0 });
      }, delayMs);

      speakTimeouts.push(id);
    }
  }

  function schedulePreCount(token){
    clearSpeakTimers();
    if (!canSpeak()) return;

    // “On démarre… 3…2…1…”
    speak("On démarre…", { interrupt: true, rate: 1.02, pitch: 1.0 });

    [3,2,1].forEach((n, i) => {
      const id = setTimeout(() => {
        if (!running || paused) return;
        if (token !== phaseToken) return;
        if (phase !== "pre") return;
        speak(String(n), { interrupt: true, rate: 1.05, pitch: 1.0 });
      }, (i + 1) * 1000);
      speakTimeouts.push(id);
    });
  }

  function computeScale(ph, tNorm){
    if (ph === "inhale") return 0.92 + 0.18 * tNorm;
    if (ph === "exhale") return 1.10 - 0.18 * tNorm;
    if (ph === "hold1" || ph === "hold2") return 1.10;
    if (ph === "pre") return 0.96;
    return 0.96;
  }

  function computeGlow(ph, tNorm){
    if (ph === "inhale") return 0.45 + 0.35 * tNorm;
    if (ph === "hold1" || ph === "hold2") return 0.78;
    if (ph === "exhale") return 0.80 - 0.35 * tNorm;
    if (ph === "pre") return 0.55;
    return 0.45;
  }

  function setPhase(ph, durSec){
    phaseToken++;
    const myToken = phaseToken;

    phase = ph;
    phaseDur = Math.max(0, Number(durSec || 0));
    phaseT0 = performance.now();

    if (phase === "inhale") inhaleCount++;

    document.body.classList.toggle("breath-inhale", phase === "inhale");
    document.body.classList.toggle("breath-exhale", phase === "exhale");
    document.body.classList.toggle("breath-hold", (phase === "hold1" || phase === "hold2"));
    document.body.classList.toggle("breath-pre", phase === "pre");

    label.textContent = phaseLabel(phase);
    sub.textContent   = phaseHelp(phase);

    if (phase !== "ready" && phase !== "done") {
      vibrate(16);
      tick();
    }

    if (phase === "ready") timer.textContent = "4–6";
    else if (phase === "done") timer.textContent = "✓";
    else if (phase === "pre") timer.textContent = "3…";
    else timer.textContent = `${Math.ceil(phaseDur)}s`;

    clearSpeakTimers();

    if (phase === "pre") {
      schedulePreCount(myToken);
      return;
    }

    if (phase === "inhale" || phase === "exhale" || phase === "hold1" || phase === "hold2") {
      scheduleVoiceCountdownForPhase(phase, phaseDur, myToken);
    } else if (phase === "done") {
      if (canSpeak()) speak("Terminé. Reviens à un souffle naturel.", { interrupt: true, rate: 1.02 });
    }
  }

  function updateLoop(){
    if (!running) return;

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

    if (phase === "pre") {
      const left = Math.max(0, 3 - Math.floor(t));
      timer.textContent = left > 0 ? `${left}…` : "✓";
    } else if (phase !== "ready" && phase !== "done") {
      const left = Math.max(0, Math.ceil(phaseDur - t));
      timer.textContent = `${left}s`;
    }

    setCSSVars(computeScale(phase, tNorm), computeGlow(phase, tNorm));

    // transition phase
    if (phase !== "ready" && phase !== "done" && t >= phaseDur) {
      const cfg = getCfg();
      const seq = getPhaseSequence(cfg);

      if (phase === "pre") {
        const first = seq[0];
        setPhase(first.key, first.dur);
      } else {
        const idx = seq.findIndex(x => x.key === phase);
        const next = (idx >= 0) ? seq[(idx + 1) % seq.length] : seq[0];

        // compter un cycle complet à la fin de hold2 (ou exhale si pas de hold2)
        if (phase === "hold2" || (phase === "exhale" && !seq.some(s => s.key === "hold2"))) {
          cycleCount++;
        }

        setPhase(next.key, next.dur);
      }
    }

    raf = requestAnimationFrame(updateLoop);
  }

  async function startBreath(){
    primeVoiceOnce();

    if (running && paused) {
      paused = false;
      setButtons();
      if (canSpeak()) speak("On reprend.", { interrupt: true, rate: 1.02 });

      // resynchronise: on relance la phase courante depuis zéro pour éviter décalage
      const cfg = getCfg();
      const seq = getPhaseSequence(cfg);
      const cur = (phase === "pre") ? { key:"pre", dur:3 } : (seq.find(x => x.key === phase) || seq[0]);
      setPhase(cur.key, cur.dur);

      raf = requestAnimationFrame(updateLoop);
      return;
    }
    if (running) return;

    running = true;
    paused = false;
    inhaleCount = 0;
    cycleCount = 0;
    lastCoachAt = -999;

    document.body.classList.add("breath-running");

    sessionLimit = Number(selDuration?.value || "0") || 0;
    sessionT0 = performance.now();
    setButtons();

    const cfg = getCfg();

    // souffle audio (breath_cycle.mp3 via sound.js)
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

    // ✅ Pré-compte (3s)
    setPhase("pre", 3);

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
      if (canSpeak()) speak("Pause.", { interrupt: true, rate: 1.02 });
    } else {
      if (canSpeak()) speak("Reprise.", { interrupt: true, rate: 1.02 });

      // re-sync: relance phase actuelle à 0
      const cfg = getCfg();
      const seq = getPhaseSequence(cfg);
      const cur = (phase === "pre") ? { key:"pre", dur:3 } : (seq.find(x => x.key === phase) || seq[0]);
      setPhase(cur.key, cur.dur);

      raf = requestAnimationFrame(updateLoop);
    }
  }

  function stopBreath(fromAutoEnd = false){
    running = false;
    paused = false;

    document.body.classList.remove("breath-running","breath-inhale","breath-exhale","breath-hold","breath-pre");
    setButtons();

    if (raf) cancelAnimationFrame(raf);
    raf = null;

    clearSpeakTimers();
    try { window.speechSynthesis?.cancel?.(); } catch {}

    setCSSVars(0.96, 0.45);
    setPhase(fromAutoEnd ? "done" : "ready", 0);

    try { window.VivarioSound?.stopBreathing?.(); } catch {}
  }

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
      // restart cycle cleanly
      setPhase("pre", 3);
    });

    optVoice?.addEventListener("change", () => {
      clearSpeakTimers();
      try { window.speechSynthesis?.cancel?.(); } catch {}
    });

    window.addEventListener("pagehide", () => stopBreath(false));
  });
})();