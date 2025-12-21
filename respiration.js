/* Vivario — respiration.js (V2)
   - Cycle 4s inspire / 6s expire (infini)
   - Orbe au 1er plan via CSS
   - Texte guidé + compte à rebours
   - Audio souffle via VivarioSound.startBreathing()
*/

(() => {
  const inhale = 4;
  const exhale = 6;

  const label = document.getElementById("breathLabel");
  const timer = document.getElementById("breathTimer");
  const sub   = document.getElementById("breathSub");

  const btnStart = document.getElementById("btnBreathStart");
  const btnStop  = document.getElementById("btnBreathStop");

  // Sécurité : si la page n’a pas les bons IDs, on ne fait rien
  if (!label || !timer || !sub || !btnStart || !btnStop) return;

  let running = false;
  let phase = "inhale"; // inhale | exhale
  let tLeft = inhale;
  let tick = null;

  function setUIState(isRunning){
    running = isRunning;
    document.body.classList.toggle("breath-running", running);
    if (!running) document.body.classList.remove("breath-exhale");
    btnStart.disabled = running;
    btnStop.disabled = !running;
  }

  function renderPhase(){
    if (phase === "inhale") {
      document.body.classList.remove("breath-exhale");
      label.textContent = "Inspire";
      sub.textContent = "Laisse l’air entrer doucement.";
      tLeft = inhale;
    } else {
      document.body.classList.add("breath-exhale");
      label.textContent = "Expire";
      sub.textContent = "Relâche, sans forcer.";
      tLeft = exhale;
    }
    timer.textContent = `${tLeft}s`;
  }

  function renderTick(){
    timer.textContent = `${tLeft}s`;
  }

  function startLoop(){
    if (tick) clearInterval(tick);

    phase = "inhale";
    renderPhase();

    tick = setInterval(() => {
      if (!running) return;

      tLeft -= 1;
      if (tLeft <= 0) {
        phase = (phase === "inhale") ? "exhale" : "inhale";
        renderPhase();
      } else {
        renderTick();
      }
    }, 1000);
  }

  async function startBreath(){
    if (running) return;
    setUIState(true);

    // Lance le souffle audio (breath_cycle.mp3)
    try {
      await window.VivarioSound?.startBreathing?.({
        inhale,
        exhale,
        hold: 0,
        affectAmbience: false,
        affectBreath: true,
        muteAmbienceWhileBreath: true
      });
    } catch {}

    startLoop();
  }

  function stopBreath(){
    if (!running) return;
    setUIState(false);

    if (tick) clearInterval(tick);
    tick = null;

    label.textContent = "Prêt ?";
    timer.textContent = "4–6";
    sub.textContent = "Appuie sur “Démarrer”.";

    try { window.VivarioSound?.stopBreathing?.(); } catch {}
  }

  document.addEventListener("DOMContentLoaded", () => {
    setUIState(false);

    btnStart.addEventListener("click", startBreath);
    btnStop.addEventListener("click", stopBreath);

    // stop si on quitte / met en arrière-plan
    window.addEventListener("pagehide", stopBreath);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") stopBreath();
    });
  });
})();