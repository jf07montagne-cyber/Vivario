(() => {
  // 4–0–6 par défaut (comme ton résultat)
  const INHALE = 4;
  const HOLD = 0;
  const EXHALE = 6;

  const phaseEl = document.getElementById("breathPhase");
  const timerEl = document.getElementById("breathTimer");
  const btnStart = document.getElementById("btnStart");
  const btnStop = document.getElementById("btnStop");

  let running = false;
  let raf = null;
  let t0 = 0;

  // cycle en secondes
  const CYCLE = INHALE + HOLD + EXHALE + HOLD;

  function setUI(phase, secLeft) {
    if (phaseEl) phaseEl.textContent = phase;
    if (timerEl) timerEl.textContent = (secLeft != null) ? `${secLeft} s` : "—";
  }

  function getPhase(t) {
    // t en [0..CYCLE)
    if (t < INHALE) return { phase: "Inspire", left: Math.ceil(INHALE - t) };
    if (t < INHALE + HOLD) return { phase: "Bloque", left: Math.ceil(INHALE + HOLD - t) };
    if (t < INHALE + HOLD + EXHALE) return { phase: "Expire", left: Math.ceil(INHALE + HOLD + EXHALE - t) };
    return { phase: "Bloque", left: Math.ceil(CYCLE - t) };
  }

  function loop() {
    if (!running) return;

    const now = performance.now();
    const t = ((now - t0) / 1000) % CYCLE;

    const p = getPhase(t);
    setUI(p.phase, p.left);

    raf = requestAnimationFrame(loop);
  }

  async function start() {
    if (running) return;
    running = true;
    t0 = performance.now();
    document.body.classList.add("breathing");

    // On lance le souffle (breath_cycle.mp3) et on coupe l'ambiance pendant l'exercice
    try {
      await window.VivarioSound?.startBreathing?.({
        inhale: INHALE,
        hold: HOLD,
        exhale: EXHALE,
        affectAmbience: false,
        affectBreath: true,
        muteAmbienceWhileBreath: true
      });
    } catch {}

    loop();
  }

  function stop() {
    running = false;
    document.body.classList.remove("breathing");
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    setUI("Prêt", null);

    try {
      window.VivarioSound?.stopBreathing?.();
    } catch {}
  }

  // sécurité : stop quand on quitte la page
  window.addEventListener("pagehide", stop);

  btnStart?.addEventListener("click", start);
  btnStop?.addEventListener("click", stop);

  // état initial
  setUI("Prêt", null);
})();