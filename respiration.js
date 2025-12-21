/* Vivario — respiration.js (V2)
   - Stage central : orbe + texte superposé
   - 4s Inspire / 6s Expire (infini)
   - Classes CSS: breath-running + breath-exhale
   - Audio souffle: VivarioSound.startBreathing()
*/

(() => {
  const inhale = 4;
  const exhale = 6;

  const label = document.getElementById("breathLabel");
  const timer = document.getElementById("breathTimer");
  const sub   = document.getElementById("breathSub");

  const btnStart = document.getElementById("btnBreathStart");
  const btnStop  = document.getElementById("btnBreathStop");

  let running = false;
  let phase = "inhale"; // inhale | exhale
  let tLeft = inhale;
  let tick = null;

  function setRunning(on){
    running = on;
    document.body.classList.toggle("breath-running", running);
    if (!running) document.body.classList.remove("breath-exhale");

    btnStart.disabled = running;
    btnStop.disabled = !running;
  }

  function setPhase(p){
    phase = p;

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

  function startLoop(){
    if (tick) clearInterval(tick);
    setPhase("inhale");

    tick = setInterval(() => {
      if (!running) return;

      tLeft -= 1;
      if (tLeft <= 0) {
        setPhase(phase === "inhale" ? "exhale" : "inhale");
      } else {
        timer.textContent = `${tLeft}s`;
      }
    }, 1000);
  }

  async function startBreath(){
    setRunning(true);

    // souffle audio (breath_cycle.mp3)
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
    setRunning(false);

    if (tick) clearInterval(tick);
    tick = null;

    label.textContent = "Prêt ?";
    timer.textContent = "4–6";
    sub.textContent = "Appuie sur “Démarrer”.";

    try { window.VivarioSound?.stopBreathing?.(); } catch {}
  }

  document.addEventListener("DOMContentLoaded", () => {
    setRunning(false);

    btnStart.addEventListener("click", startBreath);
    btnStop.addEventListener("click", stopBreath);

    // sécurité : stop si on quitte la page
    window.addEventListener("pagehide", stopBreath);
  });
})();