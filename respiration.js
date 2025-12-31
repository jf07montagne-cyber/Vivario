/* respiration.js — FIX: coupe l’ambiance pendant l’exercice si optMuteAmb coché */
(() => {
  const btnStart = document.getElementById("btnBreathStart");
  const btnPause = document.getElementById("btnBreathPause");
  const btnStop  = document.getElementById("btnBreathStop");

  const label = document.getElementById("breathLabel");
  const timer = document.getElementById("breathTimer");
  const sub   = document.getElementById("breathSub");

  const selPreset   = document.getElementById("breathPreset");
  const selDuration = document.getElementById("breathDuration");

  const optVoice   = document.getElementById("optVoice");
  const optCoach   = document.getElementById("optCoach");
  const optVibrate = document.getElementById("optVibrate");
  const optTick    = document.getElementById("optTick");
  const optMuteAmb = document.getElementById("optMuteAmb");

  let running = false;
  let paused  = false;

  // --- ✅ Ambiance mute/restore (le cœur du fix)
  function muteBeforeBreath() {
    if (optMuteAmb && optMuteAmb.checked) {
      try { window.VivarioAmbience?.muteForBreath?.(true); } catch {}
    }
  }
  function restoreAfterBreath() {
    try { window.VivarioAmbience?.muteForBreath?.(false); } catch {}
  }

  // Helpers
  function setUI(state) {
    if (state === "idle") {
      running = false; paused = false;
      btnStart && (btnStart.disabled = false);
      btnPause && (btnPause.disabled = true);
      btnStop  && (btnStop.disabled  = true);
      if (label) label.textContent = "Prêt ?";
      if (timer) timer.textContent = selPreset?.value?.replaceAll("-", "–") || "4–0–6";
      if (sub) sub.textContent = "Appuie sur “Démarrer”.";
      document.body.classList.remove("breath-inhale","breath-exhale","breath-hold");
    }
    if (state === "running") {
      running = true; paused = false;
      btnStart && (btnStart.disabled = true);
      btnPause && (btnPause.disabled = false);
      btnStop  && (btnStop.disabled  = false);
    }
    if (state === "paused") {
      running = true; paused = true;
      btnStart && (btnStart.disabled = true);
      btnPause && (btnPause.disabled = false);
      btnStop  && (btnStop.disabled  = false);
    }
  }

  function getPreset() {
    // format "4-0-6" ou "4-4-4-4"
    const p = String(selPreset?.value || "4-0-6").split("-").map(n => parseInt(n, 10));
    return p.filter(n => Number.isFinite(n) && n >= 0);
  }
  function getDurationSec() {
    const v = parseInt(selDuration?.value || "0", 10);
    return Number.isFinite(v) ? v : 0;
  }

  // --- moteur simple (si tu as déjà un moteur plus avancé, garde-le)
  let t0 = 0;
  let raf = 0;
  let elapsedSec = 0;
  let stageIndex = 0; // 0 inhale, 1 hold1, 2 exhale, 3 hold2
  let stageLeft = 0;
  let stages = [];

  function stageName(i) {
    if (stages.length === 3) return (i === 0 ? "Inspire" : (i === 1 ? "Expire" : "Expire"));
    return (i === 0 ? "Inspire" : i === 1 ? "Bloque" : i === 2 ? "Expire" : "Bloque");
  }

  function applyBodyClass(i) {
    document.body.classList.remove("breath-inhale","breath-exhale","breath-hold");
    if (stages.length === 3) {
      // 4-0-6 => inhale / exhale (pas de hold)
      document.body.classList.add(i === 0 ? "breath-inhale" : "breath-exhale");
    } else {
      document.body.classList.add(i === 0 ? "breath-inhale" : i === 2 ? "breath-exhale" : "breath-hold");
    }
  }

  function tick(now) {
    if (!running || paused) return;

    const dt = (now - t0) / 1000;
    t0 = now;

    elapsedSec += dt;
    stageLeft -= dt;

    const durMax = getDurationSec();
    if (durMax > 0 && elapsedSec >= durMax) {
      stop();
      return;
    }

    if (stageLeft <= 0) {
      stageIndex = (stageIndex + 1) % stages.length;
      stageLeft = stages[stageIndex];
      applyBodyClass(stageIndex);

      if (label) label.textContent = stageName(stageIndex);
      if (sub) sub.textContent = "Tu peux arrêter quand tu veux.";
      // voix/vibration si tu as déjà dans sound.js
      try {
        window.VivarioSound?.breathCue?.({
          stage: stageName(stageIndex),
          voice: !!optVoice?.checked,
          coachSoft: !!optCoach?.checked,
          vibrate: !!optVibrate?.checked,
          tick: !!optTick?.checked
        });
      } catch {}
    }

    if (timer) timer.textContent = Math.max(0, Math.ceil(stageLeft)).toString();
    raf = requestAnimationFrame(tick);
  }

  function start() {
    // ✅ coupe ambiance si demandé
    muteBeforeBreath();

    setUI("running");
    elapsedSec = 0;

    stages = getPreset();
    if (stages.length === 3) {
      // 4-0-6 -> on enlève le "0" du milieu
      stages = [stages[0], stages[2]];
    }
    if (stages.length < 2) stages = [4, 6];

    stageIndex = 0;
    stageLeft = stages[0];

    applyBodyClass(0);

    if (label) label.textContent = "Inspire";
    if (sub) sub.textContent = "Tu peux arrêter quand tu veux.";
    if (timer) timer.textContent = Math.ceil(stageLeft).toString();

    // si ton sound.js a un mode breathing, on le lance
    try { window.VivarioSound?.startBreathing?.({ affectBreath:true, muteAmbienceWhileBreath:false }); } catch {}

    t0 = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }

  function pause() {
    if (!running) return;
    paused = !paused;
    if (btnPause) btnPause.textContent = paused ? "▶ Reprendre" : "⏸ Pause";
    if (!paused) {
      t0 = performance.now();
      raf = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(raf);
    }
  }

  function stop() {
    cancelAnimationFrame(raf);
    setUI("idle");
    if (btnPause) btnPause.textContent = "⏸ Pause";

    try { window.VivarioSound?.stopBreathing?.(); } catch {}

    // ✅ remet l’ambiance comme avant
    restoreAfterBreath();
  }

  // Bind
  btnStart?.addEventListener("click", start);
  btnPause?.addEventListener("click", pause);
  btnStop?.addEventListener("click", stop);

  // init UI
  setUI("idle");
})();