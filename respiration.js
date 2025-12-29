/* Vivario — respiration.js (v3 STABLE)
   - Cycle preset (inhale/hold/exhale/hold2)
   - Visuel synchronisé (classes body)
   - Timer précis (tick aligné)
   - Pause/Resume
   - Audio souffle via VivarioSound.startBreathing()
   - Option: couper ambiance pendant l’exercice
*/

(() => {
  const label = document.getElementById("breathLabel");
  const timer = document.getElementById("breathTimer");
  const sub   = document.getElementById("breathSub");

  const btnStart = document.getElementById("btnBreathStart");
  const btnPause = document.getElementById("btnBreathPause");
  const btnStop  = document.getElementById("btnBreathStop");

  const selPreset = document.getElementById("breathPreset");
  const selDur = document.getElementById("breathDuration");

  const optVoice = document.getElementById("optVoice");
  const optCoach = document.getElementById("optCoach");
  const optVibrate = document.getElementById("optVibrate");
  const optTick = document.getElementById("optTick");
  const optMuteAmb = document.getElementById("optMuteAmb");

  let running = false;
  let paused = false;

  let phases = []; // [{k, s}]
  let phaseIndex = 0;
  let tLeft = 0;

  let endAt = 0;   // timestamp ms pour countdown stable
  let tick = null;

  // durée globale (0 = infini)
  let sessionEndAt = 0;

  function parsePreset(v){
    // "4-0-6" => inhale-hold-exhale
    // "4-4-4-4" => box breathing (inhale-hold-exhale-hold2)
    const parts = String(v || "4-0-6").split("-").map(x => Math.max(0, parseInt(x, 10) || 0));
    if (parts.length === 3) return { inhale: parts[0], hold: parts[1], exhale: parts[2], hold2: 0 };
    if (parts.length === 4) return { inhale: parts[0], hold: parts[1], exhale: parts[2], hold2: parts[3] };
    return { inhale: 4, hold: 0, exhale: 6, hold2: 0 };
  }

  function buildPhases(p){
    const out = [];
    out.push({ k: "inhale", s: Math.max(1, p.inhale || 4) });
    if ((p.hold || 0) > 0) out.push({ k: "hold", s: p.hold });
    out.push({ k: "exhale", s: Math.max(1, p.exhale || 6) });
    if ((p.hold2 || 0) > 0) out.push({ k: "hold2", s: p.hold2 });
    return out;
  }

  function setUIState(isRunning, isPaused){
    running = isRunning;
    paused = !!isPaused;

    document.body.classList.toggle("breath-running", running);
    document.body.classList.toggle("breath-paused", paused);

    btnStart.disabled = running && !paused;
    btnPause.disabled = !running;
    btnStop.disabled  = !running;

    btnPause.textContent = paused ? "▶ Reprendre" : "⏸ Pause";
  }

  function phaseText(k){
    if (k === "inhale") return { t: "Inspire", s: "Laisse l’air entrer doucement." };
    if (k === "hold" || k === "hold2") return { t: "Bloque", s: "Garde un instant, sans forcer." };
    return { t: "Expire", s: "Relâche, tranquillement." };
  }

  function applyPhaseClass(k){
    document.body.classList.remove("breath-inhale", "breath-exhale", "breath-hold");
    if (k === "inhale") document.body.classList.add("breath-inhale");
    else if (k === "exhale") document.body.classList.add("breath-exhale");
    else document.body.classList.add("breath-hold");
  }

  function renderPhase(){
    const ph = phases[phaseIndex];
    if (!ph) return;

    const txt = phaseText(ph.k);
    label.textContent = txt.t;
    sub.textContent = txt.s;

    applyPhaseClass(ph.k);

    tLeft = ph.s;
    timer.textContent = `${tLeft}s`;

    // vibration au changement de phase (léger)
    if (optVibrate?.checked) {
      try { navigator.vibrate?.(ph.k === "exhale" ? 25 : 15); } catch {}
    }
  }

  function setCountdown(seconds){
    tLeft = Math.max(0, Math.round(seconds));
    timer.textContent = `${tLeft}s`;
  }

  function nextPhase(){
    phaseIndex = (phaseIndex + 1) % phases.length;
    renderPhase();
    endAt = Date.now() + (phases[phaseIndex].s * 1000);
  }

  function stopAllTimers(){
    if (tick) clearInterval(tick);
    tick = null;
  }

  function shouldEndSession(){
    return sessionEndAt > 0 && Date.now() >= sessionEndAt;
  }

  async function startBreath(){
    const preset = parsePreset(selPreset?.value);
    phases = buildPhases(preset);
    phaseIndex = 0;

    // durée session
    const durSec = parseInt(selDur?.value || "0", 10) || 0;
    sessionEndAt = durSec > 0 ? (Date.now() + durSec * 1000) : 0;

    setUIState(true, false);

    // Audio souffle (et coupe ambiance si demandé)
    try {
      await window.VivarioSound?.startBreathing?.({
        muteAmbienceWhileBreath: !!optMuteAmb?.checked,
        affectBreath: true
      });
    } catch {}

    renderPhase();
    endAt = Date.now() + (phases[phaseIndex].s * 1000);

    stopAllTimers();
    tick = setInterval(() => {
      if (!running || paused) return;

      if (shouldEndSession()) {
        stopBreath();
        return;
      }

      const leftMs = endAt - Date.now();
      const left = Math.ceil(leftMs / 1000);

      if (left <= 0) {
        nextPhase();
        return;
      }

      setCountdown(left);

      // tick optionnel
      if (optTick?.checked && left <= 3) {
        // léger “tick” haptique (sans son)
        if (optVibrate?.checked) {
          try { navigator.vibrate?.(10); } catch {}
        }
      }
    }, 120);
  }

  function togglePause(){
    if (!running) return;

    if (!paused) {
      paused = true;
      setUIState(true, true);
      return;
    }

    // Reprendre: recalculer endAt à partir du tLeft actuel
    paused = false;
    setUIState(true, false);
    endAt = Date.now() + (tLeft * 1000);
  }

  function stopBreath(){
    setUIState(false, false);
    stopAllTimers();

    document.body.classList.remove("breath-inhale", "breath-exhale", "breath-hold");

    label.textContent = "Prêt ?";
    timer.textContent = "4–6";
    sub.textContent = "Appuie sur “Démarrer”.";

    try { window.VivarioSound?.stopBreathing?.(); } catch {}
  }

  document.addEventListener("DOMContentLoaded", () => {
    setUIState(false, false);

    btnStart?.addEventListener("click", startBreath);
    btnPause?.addEventListener("click", togglePause);
    btnStop?.addEventListener("click", stopBreath);

    window.addEventListener("pagehide", stopBreath);
  });
})();