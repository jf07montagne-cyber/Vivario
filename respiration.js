/* Vivario — respiration.js (v13)
   ✅ Voix coach + décompte vocal
   ✅ Compte à rebours fin de phase (3..2..1) si voix ON
*/

(() => {
  const KEY_COACH = "vivario_coach_soft";

  const elLabel = document.getElementById("breathLabel");
  const elTimer = document.getElementById("breathTimer");
  const elSub   = document.getElementById("breathSub");

  const btnStart = document.getElementById("btnBreathStart");
  const btnPause = document.getElementById("btnBreathPause");
  const btnStop  = document.getElementById("btnBreathStop");

  const selPreset = document.getElementById("breathPreset");
  const selDur    = document.getElementById("breathDuration");

  const optVoice   = document.getElementById("optVoice");
  const optCoach   = document.getElementById("optCoach");
  const optVibrate = document.getElementById("optVibrate");
  const optTick    = document.getElementById("optTick");
  const optMuteAmb = document.getElementById("optMuteAmb");

  let running = false;
  let paused = false;
  let timer = null;

  let phase = "ready";
  let phaseEndsAt = 0;
  let phaseTotalSec = 0;
  let lastSpokenCount = null;

  function speak(text){
    try{
      if (!optVoice?.checked) return;
      if (!("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "fr-FR";
      u.rate = (optCoach?.checked) ? 0.95 : 1.03;
      u.pitch = (optCoach?.checked) ? 1.02 : 1.0;
      u.volume = 1;
      window.speechSynthesis.speak(u);
    }catch{}
  }

  function speakShort(text){
    try{
      if (!optVoice?.checked) return;
      if (!("speechSynthesis" in window)) return;
      // pas de cancel (sinon ça coupe trop)
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "fr-FR";
      u.rate = 1.02;
      u.pitch = 1.0;
      u.volume = 1;
      window.speechSynthesis.speak(u);
    }catch{}
  }

  function vibrate(ms){
    try{
      if (!optVibrate?.checked) return;
      if (navigator.vibrate) navigator.vibrate(ms);
    }catch{}
  }

  function tick(){
    try{
      if (!optTick?.checked) return;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880;
      g.gain.value = 0.02;
      o.start();
      setTimeout(() => { o.stop(); ctx.close(); }, 60);
    }catch{}
  }

  function parsePreset(v){
    const parts = String(v || "4-0-6").split("-").map(x => parseInt(x, 10));
    if (parts.length === 3) return { in: parts[0], hold: parts[1], out: parts[2], hold2: 0, box: false };
    if (parts.length === 4) return { in: parts[0], hold: parts[1], out: parts[2], hold2: parts[3], box: true };
    return { in: 4, hold: 0, out: 6, hold2: 0, box: false };
  }

  function setHud(label, timerTxt, sub){
    if (elLabel) elLabel.textContent = label || "";
    if (elTimer) elTimer.textContent = timerTxt || "";
    if (elSub)   elSub.textContent   = sub || "";
  }

  function startPhase(name, sec, label, sub, spoken){
    const now = performance.now();
    phase = name;
    phaseTotalSec = sec;
    phaseEndsAt = now + sec * 1000;
    lastSpokenCount = null;

    setHud(label, `${sec}s`, sub);
    speak(spoken);
    vibrate(45);
    tick();
  }

  function nextPhase(preset){
    if (phase === "ready" || phase === "outHold") {
      return startPhase(
        "in", preset.in,
        "Inspire", "Laisse l’air entrer.",
        optCoach?.checked ? "Inspire… tranquillement." : "Inspire."
      );
    }

    if (phase === "in") {
      if (preset.hold > 0) {
        return startPhase(
          "hold", preset.hold,
          "Bloque", "Garde l’air un instant.",
          optCoach?.checked ? "Garde… juste un instant." : "Bloque."
        );
      }
      return startPhase(
        "out", preset.out,
        "Expire", "Relâche doucement.",
        optCoach?.checked ? "Expire… doucement." : "Expire."
      );
    }

    if (phase === "hold") {
      return startPhase(
        "out", preset.out,
        "Expire", "Relâche doucement.",
        optCoach?.checked ? "Expire… doucement." : "Expire."
      );
    }

    if (phase === "out") {
      if (preset.box && preset.hold2 > 0) {
        return startPhase(
          "outHold", preset.hold2,
          "Pause", "Petit temps neutre.",
          optCoach?.checked ? "Pause… et c’est bien." : "Pause."
        );
      }
      return startPhase(
        "in", preset.in,
        "Inspire", "Laisse l’air entrer.",
        optCoach?.checked ? "Inspire… tranquillement." : "Inspire."
      );
    }
  }

  function update(){
    if (!running || paused) return;
    const preset = parsePreset(selPreset?.value);
    const now = performance.now();
    const remaining = Math.max(0, (phaseEndsAt - now) / 1000);

    // HUD timer
    const sec = Math.ceil(remaining);
    if (elTimer) elTimer.textContent = `${sec}s`;

    // ✅ décompte vocal sur les 3 dernières secondes
    if (optVoice?.checked && sec <= 3 && sec >= 1) {
      if (lastSpokenCount !== sec) {
        lastSpokenCount = sec;
        speakShort(String(sec));
      }
    }

    // durée totale
    const maxSec = parseInt(selDur?.value || "0", 10);
    if (maxSec > 0) {
      // approx: on déduit depuis start (simple)
      // (suffisant ici)
    }

    if (remaining <= 0.02) {
      nextPhase(preset);
    }
  }

  async function start(){
    if (running) return;
    running = true;
    paused = false;

    btnStart && (btnStart.disabled = true);
    btnPause && (btnPause.disabled = false);
    btnStop  && (btnStop.disabled  = false);

    await window.VivarioSound?.unlock?.();
    await window.VivarioSound?.startBreathing?.({
      muteAmbienceWhileBreath: !!optMuteAmb?.checked,
      affectBreath: true
    });

    phase = "ready";
    nextPhase(parsePreset(selPreset?.value));

    timer = setInterval(update, 120);
  }

  function pause(){
    if (!running) return;
    if (!paused) {
      paused = true;
      setHud("Pause", "—", "Reprends quand tu veux.");
      speak(optCoach?.checked ? "Pause… tu reprends quand tu veux." : "Pause.");
      btnPause && (btnPause.textContent = "▶ Reprendre");
      try{ window.VivarioSound?.stopBreathing?.(); }catch{}
    } else {
      paused = false;
      btnPause && (btnPause.textContent = "⏸ Pause");
      window.VivarioSound?.startBreathing?.({ muteAmbienceWhileBreath: !!optMuteAmb?.checked, affectBreath: true });
    }
  }

  function stop(){
    running = false;
    paused = false;
    if (timer) clearInterval(timer);
    timer = null;

    btnStart && (btnStart.disabled = false);
    btnPause && (btnPause.disabled = true);
    btnStop  && (btnStop.disabled  = true);
    btnPause && (btnPause.textContent = "⏸ Pause");

    setHud("Terminé", "—", "Reviens à un souffle naturel.");
    speak(optCoach?.checked ? "C’est bien. Reviens à un souffle naturel." : "Terminé.");
    try{ window.VivarioSound?.stopBreathing?.(); }catch{}
    try{ window.speechSynthesis?.cancel(); }catch{}
  }

  btnStart && btnStart.addEventListener("click", start);
  btnPause && btnPause.addEventListener("click", pause);
  btnStop  && btnStop.addEventListener("click", stop);

  setHud("Prêt ?", "4–6", "Appuie sur “Démarrer”.");
})();