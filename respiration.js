/* Vivario — respiration.js (v12)
   ✅ Voix coach réparée (SpeechSynthesis depuis le bouton Démarrer)
   ✅ Respect option "Couper l’ambiance pendant l’exercice"
   ✅ Compat Android: pas de voix auto au load, uniquement après geste utilisateur
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
  let t0 = 0;
  let elapsed = 0;
  let timer = null;

  let phase = "ready";
  let phaseEndsAt = 0;

  function coachMode(){
    const soft = (localStorage.getItem(KEY_COACH) === "1");
    return soft ? "soft" : "neutral";
  }

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

  function vibrate(ms){
    try{
      if (!optVibrate?.checked) return;
      if (navigator.vibrate) navigator.vibrate(ms);
    }catch{}
  }

  function tick(){
    try{
      if (!optTick?.checked) return;
      // petit tick via WebAudio simple
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

  function formatRemaining(sec){
    sec = Math.max(0, Math.ceil(sec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m ? `${m}:${String(s).padStart(2,"0")}` : `${s}s`;
  }

  function nextPhase(preset){
    const now = performance.now();
    if (phase === "ready" || phase === "outHold") {
      phase = "in";
      phaseEndsAt = now + preset.in * 1000;
      setHud("Inspire", `${preset.in}s`, "Laisse l’air entrer.");
      speak(optCoach?.checked ? "Inspire… tranquillement." : "Inspire.");
      vibrate(50); tick();
      return;
    }
    if (phase === "in") {
      if (preset.hold > 0) {
        phase = "hold";
        phaseEndsAt = now + preset.hold * 1000;
        setHud("Bloque", `${preset.hold}s`, "Garde l’air un instant.");
        speak(optCoach?.checked ? "Garde… juste un instant." : "Bloque.");
        vibrate(35); tick();
      } else {
        phase = "out";
        phaseEndsAt = now + preset.out * 1000;
        setHud("Expire", `${preset.out}s`, "Relâche doucement.");
        speak(optCoach?.checked ? "Expire… doucement." : "Expire.");
        vibrate(50); tick();
      }
      return;
    }
    if (phase === "hold") {
      phase = "out";
      phaseEndsAt = now + preset.out * 1000;
      setHud("Expire", `${preset.out}s`, "Relâche doucement.");
      speak(optCoach?.checked ? "Expire… doucement." : "Expire.");
      vibrate(50); tick();
      return;
    }
    if (phase === "out") {
      if (preset.box && preset.hold2 > 0) {
        phase = "outHold";
        phaseEndsAt = now + preset.hold2 * 1000;
        setHud("Pause", `${preset.hold2}s`, "Petit temps neutre.");
        speak(optCoach?.checked ? "Pause… et c’est bien." : "Pause.");
        vibrate(35); tick();
      } else {
        phase = "in";
        phaseEndsAt = now + preset.in * 1000;
        setHud("Inspire", `${preset.in}s`, "Laisse l’air entrer.");
        speak(optCoach?.checked ? "Inspire… tranquillement." : "Inspire.");
        vibrate(50); tick();
      }
      return;
    }
  }

  function update(){
    if (!running || paused) return;

    const preset = parsePreset(selPreset?.value);
    const now = performance.now();
    const remaining = (phaseEndsAt - now) / 1000;

    // durée totale
    const maxSec = parseInt(selDur?.value || "0", 10);
    if (maxSec > 0) {
      const totalElapsed = (now - t0) / 1000;
      if (totalElapsed >= maxSec) {
        stop();
        return;
      }
    }

    if (remaining <= 0.02) {
      nextPhase(preset);
      return;
    }

    // timer HUD
    const sec = Math.max(0, Math.ceil(remaining));
    if (elTimer) elTimer.textContent = `${sec}s`;
  }

  async function start(){
    if (running) return;

    running = true;
    paused = false;
    t0 = performance.now();
    elapsed = 0;

    btnStart && (btnStart.disabled = true);
    btnPause && (btnPause.disabled = false);
    btnStop  && (btnStop.disabled  = false);

    // coupe ambiance si option
    const muteAmb = !!optMuteAmb?.checked;
    await window.VivarioSound?.startBreathing?.({
      muteAmbienceWhileBreath: muteAmb,
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
      elapsed += performance.now() - t0;
      setHud("Pause", "—", "Reprends quand tu veux.");
      speak(optCoach?.checked ? "Pause… tu reprends quand tu veux." : "Pause.");
      btnPause && (btnPause.textContent = "▶ Reprendre");
      try{ window.speechSynthesis?.cancel(); }catch{}
      try{ window.VivarioSound?.stopBreathing?.(); }catch{}
    } else {
      paused = false;
      t0 = performance.now();
      btnPause && (btnPause.textContent = "⏸ Pause");
      // relance son respiration (sans relancer ambiance)
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

  // init HUD
  setHud("Prêt ?", "4–6", "Appuie sur “Démarrer”.");
})();