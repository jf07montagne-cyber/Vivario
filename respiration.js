/* Vivario — respiration.js (v14 SYNC COUNTDOWN)
   ✅ Décompte vocal synchronisé via timeouts (plus stable)
*/

(() => {
  const elLabel = document.getElementById("breathLabel");
  const elTimer = document.getElementById("breathTimer");
  const elSub   = document.getElementById("breathSub");

  const btnStart = document.getElementById("btnBreathStart");
  const btnPause = document.getElementById("btnBreathPause");
  const btnStop  = document.getElementById("btnBreathStop");

  const selPreset = document.getElementById("breathPreset");

  const optVoice   = document.getElementById("optVoice");
  const optCoach   = document.getElementById("optCoach");
  const optVibrate = document.getElementById("optVibrate");
  const optTick    = document.getElementById("optTick");
  const optMuteAmb = document.getElementById("optMuteAmb");

  let running = false;
  let paused = false;
  let ticker = null;

  let phase = "ready";
  let phaseEndsAt = 0;

  let countdownTO = [];

  function clearCountdown(){
    countdownTO.forEach(id => clearTimeout(id));
    countdownTO = [];
  }

  function speak(text, { cancel = true } = {}){
    try{
      if (!optVoice?.checked) return;
      if (!("speechSynthesis" in window)) return;
      if (cancel) window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "fr-FR";
      u.rate = optCoach?.checked ? 0.95 : 1.03;
      u.pitch = optCoach?.checked ? 1.02 : 1.0;
      u.volume = 1;
      window.speechSynthesis.speak(u);
    }catch{}
  }

  function vibrate(ms){
    try{ if (optVibrate?.checked && navigator.vibrate) navigator.vibrate(ms); }catch{}
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

  function scheduleCountdown(sec){
    clearCountdown();
    if (!optVoice?.checked) return;
    // 3..2..1 sur les 3 dernières secondes, calé sur phaseEndsAt
    for (let n = 3; n >= 1; n--){
      if (sec < n) continue;
      const ms = (sec - n) * 1000;
      countdownTO.push(setTimeout(() => {
        if (!running || paused) return;
        // pas de cancel agressif : mais on coupe si ça s’empile
        speak(String(n), { cancel: false });
      }, ms));
    }
  }

  function startPhase(name, sec, label, sub, spoken){
    phase = name;
    phaseEndsAt = performance.now() + sec * 1000;
    setHud(label, `${sec}s`, sub);
    speak(spoken, { cancel: true });
    vibrate(45);
    tick();
    scheduleCountdown(sec);
  }

  function nextPhase(preset){
    if (phase === "ready" || phase === "outHold") {
      return startPhase("in", preset.in, "Inspire", "Laisse l’air entrer.", optCoach?.checked ? "Inspire… tranquillement." : "Inspire.");
    }
    if (phase === "in") {
      if (preset.hold > 0) return startPhase("hold", preset.hold, "Bloque", "Garde l’air un instant.", optCoach?.checked ? "Garde… juste un instant." : "Bloque.");
      return startPhase("out", preset.out, "Expire", "Relâche doucement.", optCoach?.checked ? "Expire… doucement." : "Expire.");
    }
    if (phase === "hold") {
      return startPhase("out", preset.out, "Expire", "Relâche doucement.", optCoach?.checked ? "Expire… doucement." : "Expire.");
    }
    if (phase === "out") {
      if (preset.box && preset.hold2 > 0) return startPhase("outHold", preset.hold2, "Pause", "Petit temps neutre.", optCoach?.checked ? "Pause… et c’est bien." : "Pause.");
      return startPhase("in", preset.in, "Inspire", "Laisse l’air entrer.", optCoach?.checked ? "Inspire… tranquillement." : "Inspire.");
    }
  }

  function update(){
    if (!running || paused) return;
    const remaining = Math.max(0, (phaseEndsAt - performance.now()) / 1000);
    const sec = Math.ceil(remaining);
    if (elTimer) elTimer.textContent = `${sec}s`;
    if (remaining <= 0.03) nextPhase(parsePreset(selPreset?.value));
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
    ticker = setInterval(update, 120);
  }

  function pause(){
    if (!running) return;
    paused = !paused;

    if (paused) {
      clearCountdown();
      setHud("Pause", "—", "Reprends quand tu veux.");
      speak(optCoach?.checked ? "Pause… tu reprends quand tu veux." : "Pause.", { cancel: true });
      btnPause && (btnPause.textContent = "▶ Reprendre");
      window.VivarioSound?.stopBreathing?.();
    } else {
      btnPause && (btnPause.textContent = "⏸ Pause");
      window.VivarioSound?.startBreathing?.({ muteAmbienceWhileBreath: !!optMuteAmb?.checked, affectBreath: true });
      // re-schedule countdown with remaining
      const remaining = Math.max(0, (phaseEndsAt - performance.now()) / 1000);
      scheduleCountdown(Math.ceil(remaining));
    }
  }

  function stop(){
    running = false;
    paused = false;
    clearCountdown();
    if (ticker) clearInterval(ticker);
    ticker = null;

    btnStart && (btnStart.disabled = false);
    btnPause && (btnPause.disabled = true);
    btnStop  && (btnStop.disabled  = true);
    btnPause && (btnPause.textContent = "⏸ Pause");

    setHud("Terminé", "—", "Reviens à un souffle naturel.");
    speak(optCoach?.checked ? "C’est bien. Reviens à un souffle naturel." : "Terminé.", { cancel: true });
    window.VivarioSound?.stopBreathing?.();
    try{ window.speechSynthesis?.cancel(); }catch{}
  }

  btnStart && btnStart.addEventListener("click", start);
  btnPause && btnPause.addEventListener("click", pause);
  btnStop  && btnStop.addEventListener("click", stop);

  setHud("Prêt ?", "4–6", "Appuie sur “Démarrer”.");
})();