/* respiration.js — FINAL
   ✅ Voix synchronisée + décompte (3..2..1)
   ✅ mute ambiance pendant exercice si optMuteAmb
*/
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

  function muteBeforeBreath() {
    if (optMuteAmb && optMuteAmb.checked) {
      try { window.VivarioAmbience?.muteForBreath?.(true); } catch {}
    }
  }
  function restoreAfterBreath() {
    try { window.VivarioAmbience?.muteForBreath?.(false); } catch {}
  }

  function setUI(state) {
    if (state === "idle") {
      running = false; paused = false;
      btnStart && (btnStart.disabled = false);
      btnPause && (btnPause.disabled = true);
      btnStop  && (btnStop.disabled  = true);
      label && (label.textContent = "Prêt ?");
      timer && (timer.textContent = (selPreset?.value || "4-0-6").replaceAll("-", "–"));
      sub && (sub.textContent = "Appuie sur “Démarrer”.");
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
    const p = String(selPreset?.value || "4-0-6")
      .split("-")
      .map(n => parseInt(n, 10))
      .filter(n => Number.isFinite(n) && n >= 0);

    if (p.length === 3 && p[1] === 0) return [p[0], p[2]];
    return p;
  }

  function getDurationSec() {
    const v = parseInt(selDuration?.value || "0", 10);
    return Number.isFinite(v) ? v : 0;
  }

  let t0 = 0;
  let raf = 0;
  let elapsedSec = 0;

  let stageIndex = 0;
  let stageLeft = 0;
  let stages = [];

  let lastWholeSecond = -1;
  let stageAnnounced = false;

  function stageName(i) {
    if (stages.length === 2) return (i === 0 ? "Inspire" : "Expire");
    return (i === 0 ? "Inspire" : i === 1 ? "Bloque" : i === 2 ? "Expire" : "Bloque");
  }

  function applyBodyClass(i) {
    document.body.classList.remove("breath-inhale","breath-exhale","breath-hold");
    if (stages.length === 2) {
      document.body.classList.add(i === 0 ? "breath-inhale" : "breath-exhale");
    } else {
      document.body.classList.add(i === 0 ? "breath-inhale" : i === 2 ? "breath-exhale" : "breath-hold");
    }
  }

  function cueStage(alsoSpeakStage = true){
    const st = stageName(stageIndex);
    label && (label.textContent = st);
    sub && (sub.textContent = "Tu peux arrêter quand tu veux.");
    if (alsoSpeakStage){
      try {
        window.VivarioSound?.breathCue?.({
          stage: st,
          voice: !!optVoice?.checked,
          coachSoft: !!optCoach?.checked,
          vibrate: !!optVibrate?.checked,
          tick: !!optTick?.checked
        });
      } catch {}
    }
    stageAnnounced = true;
    lastWholeSecond = -1;
  }

  function cueCountdownIfNeeded(){
    if (!optVoice?.checked) return;
    const sec = Math.max(0, Math.ceil(stageLeft));
    if (sec === lastWholeSecond) return;
    lastWholeSecond = sec;

    if (sec <= 3 && sec >= 1){
      try {
        window.VivarioSound?.breathCue?.({
          stage: stageName(stageIndex),
          voice: true,
          coachSoft: !!optCoach?.checked,
          vibrate: false,
          tick: false,
          countdown: sec
        });
      } catch {}
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

    if (!stageAnnounced) cueStage(true);
    cueCountdownIfNeeded();

    if (stageLeft <= 0) {
      stageIndex = (stageIndex + 1) % stages.length;
      stageLeft = stages[stageIndex];
      applyBodyClass(stageIndex);
      cueStage(true);
    }

    timer && (timer.textContent = Math.max(0, Math.ceil(stageLeft)).toString());
    raf = requestAnimationFrame(tick);
  }

  async function start() {
    try { await window.VivarioSound?.unlock?.(); } catch {}

    muteBeforeBreath();
    setUI("running");

    elapsedSec = 0;
    stages = getPreset();
    if (stages.length < 2) stages = [4, 6];

    stageIndex = 0;
    stageLeft = stages[0];
    stageAnnounced = false;
    lastWholeSecond = -1;

    applyBodyClass(0);
    timer && (timer.textContent = Math.ceil(stageLeft).toString());

    try { window.VivarioSound?.startBreathing?.({ affectBreath:false, muteAmbienceWhileBreath:false }); } catch {}

    t0 = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }

  function pause() {
    if (!running) return;
    paused = !paused;
    btnPause && (btnPause.textContent = paused ? "▶ Reprendre" : "⏸ Pause");
    if (!paused) {
      stageAnnounced = false;
      t0 = performance.now();
      raf = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(raf);
    }
  }

  function stop() {
    cancelAnimationFrame(raf);
    setUI("idle");
    btnPause && (btnPause.textContent = "⏸ Pause");
    try { window.VivarioSound?.stopBreathing?.(); } catch {}
    restoreAfterBreath();
  }

  btnStart?.addEventListener("click", start);
  btnPause?.addEventListener("click", pause);
  btnStop?.addEventListener("click", stop);

  setUI("idle");
})();