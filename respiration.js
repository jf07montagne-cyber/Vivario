/* Vivario — respiration.js (V1)
   - Cycle 4s inspire / 6s expire (infini)
   - Orbe visible au 1er plan
   - Texte guidé + compte à rebours
   - Audio: souffle via VivarioSound.startBreathing()
*/

(() => {
  const inhale = 4;
  const exhale = 6;

  const label = document.getElementById("breathLabel");
  const timer = document.getElementById("breathTimer");
  const sub = document.getElementById("breathSub");

  const btnStart = document.getElementById("btnBreathStart");
  const btnStop = document.getElementById("btnBreathStop");

  let running = false;
  let phase = "inhale"; // inhale | exhale
  let tLeft = inhale;
  let tick = null;

  function setUIState(isRunning){
    running = isRunning;
    document.body.classList.toggle("breath-running", running);
    // reset exhale class au stop
    if (!running) document.body.classList.remove("breath-exhale");
    btnStart.disabled = running;
    btnStop.disabled = !running;
  }

  // ✅ MODIF: inhale/exhale change une classe pour l'orbe
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
    setUIState(true);

    // ✅ Lance le souffle (breath_cycle.mp3)
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
    setUIState(false);

    if (tick) clearInterval(tick);
    tick = null;

    label.textContent = "Prêt ?";
    timer.textContent = "4–6";
    sub.textContent = "Appuie sur “Commencer”.";

    try { window.VivarioSound?.stopBreathing?.(); } catch {}
  }

  document.addEventListener("DOMContentLoaded", () => {
    setUIState(false);

    btnStart.addEventListener("click", startBreath);
    btnStop.addEventListener("click", stopBreath);

    // sécurité : stop si on quitte la page
    window.addEventListener("pagehide", stopBreath);
  });
})();