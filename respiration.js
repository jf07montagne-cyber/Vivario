/* Vivario — respiration.js (v18)
   ✅ Synchronise: visuel (CSS vars) + voix + décompte
   ✅ Anti-sauts: timing basé sur performance.now() (pas setInterval)
   ✅ N'impacte pas index/accueil/apropos
*/
(() => {
  const $ = (id) => document.getElementById(id);

  const elStage = $("stageTxt");
  const elSec   = $("secTxt");
  const elCoach = $("coachTxt");

  const btnStart = $("btnStart");
  const btnPause = $("btnPause");
  const btnStop  = $("btnStop");

  const selRhythm   = $("selRhythm");
  const selDuration = $("selDuration");

  const chkVoice   = $("chkVoice");
  const chkSoft    = $("chkSoft");
  const chkMuteAmb = $("chkMuteAmb");
  const chkTick    = $("chkTick");
  const chkVibe    = $("chkVibe");

  const body = document.body;

  // Animation vars
  function setBreathVars(breath01, air01){
    // bornes
    const b = Math.max(0, Math.min(1, breath01));
    const a = Math.max(0, Math.min(1, air01));
    body.style.setProperty("--breath", String(b.toFixed(4)));
    body.style.setProperty("--air", String(a.toFixed(4)));
  }

  function parseRhythm(v){
    const parts = String(v || "4-0-6").split("-").map(n => Math.max(0, parseInt(n, 10) || 0));
    const inhale = parts[0] ?? 4;
    const hold   = parts[1] ?? 0;
    const exhale = parts[2] ?? 6;
    return { inhale, hold, exhale };
  }

  function phaseList(r){
    const list = [
      { key:"inhale", label:"Inspire", sec:r.inhale },
      { key:"hold",   label:"Bloque",  sec:r.hold },
      { key:"exhale", label:"Expire",  sec:r.exhale }
    ].filter(p => p.sec > 0 || p.key !== "hold"); // on garde hold seulement si >0
    return list;
  }

  let running = false;
  let paused = false;

  let startAt = 0;      // perf.now
  let pauseAt = 0;
  let pauseTotal = 0;

  let phases = [];
  let phaseIndex = 0;
  let phaseStart = 0;   // perf.now
  let phaseEnd = 0;

  let durationLimitSec = Infinity;

  let lastSecondSpoken = null; // pour décompte
  let rafId = 0;

  function setBodyClass(k){
    body.classList.remove("breath-inhale", "breath-hold", "breath-exhale");
    if (k === "inhale") body.classList.add("breath-inhale");
    if (k === "hold")   body.classList.add("breath-hold");
    if (k === "exhale") body.classList.add("breath-exhale");
  }

  function sayStageStart(phase){
    try{
      window.VivarioSound?.breathCue?.({
        stage: phase.label,
        voice: !!chkVoice?.checked,
        coachSoft: !!chkSoft?.checked,
        vibrate: !!chkVibe?.checked,
        tick: !!chkTick?.checked,
        isStageStart: true
      });
    }catch{}
  }

  function sayCountdown(n){
    try{
      window.VivarioSound?.breathCue?.({
        countdown: n,
        voice: !!chkVoice?.checked,
        coachSoft: !!chkSoft?.checked,
        vibrate: false,
        tick: !!chkTick?.checked
      });
    }catch{}
  }

  function coachTextFor(phaseKey){
    const soft = !!chkSoft?.checked;
    if (phaseKey === "inhale") return soft ? "Inspire… laisse l’air entrer, tranquillement." : "Inspire.";
    if (phaseKey === "hold")   return soft ? "Garde l’air… juste un instant, sans tension." : "Bloque.";
    if (phaseKey === "exhale") return soft ? "Expire… relâche les épaules, tout doucement." : "Expire.";
    return soft ? "On continue, à ton rythme." : "Continue.";
  }

  function updateUI(phase, remaining){
    if (elStage) elStage.textContent = phase ? phase.label : "Prêt";
    if (elSec) elSec.textContent = (typeof remaining === "number") ? String(remaining) : "—";
    if (elCoach) elCoach.textContent = phase ? coachTextFor(phase.key) : "Pose-toi. On va respirer ensemble, tranquillement.";
  }

  function applyAmbienceMute(active){
    // si l'utilisateur a coché "Couper l’ambiance..."
    if (!chkMuteAmb?.checked) return;
    try{
      // on coupe seulement pendant active=true, et on remet après
      if (active) window.VivarioAmbience?.stop?.();
      else window.VivarioAmbience?.resume?.();
    }catch{}
  }

  // fallback si ambiance.js expose toggle seulement
  function applyAmbienceMuteFallback(active){
    if (!chkMuteAmb?.checked) return;
    try{
      // si c'est actif et ambiance ON -> toggle OFF
      const isOn = !!window.VivarioAmbience?.isOn?.();
      if (active && isOn) window.VivarioAmbience?.toggle?.();
    }catch{}
  }

  function start(){
    if (running) return;
    running = true;
    paused = false;

    const r = parseRhythm(selRhythm?.value);
    phases = phaseList(r);
    phaseIndex = 0;

    const dur = String(selDuration?.value || "inf");
    durationLimitSec = (dur === "inf") ? Infinity : Math.max(10, parseInt(dur, 10) || 60);

    startAt = performance.now();
    pauseTotal = 0;

    // phase init
    const p = phases[0];
    phaseStart = performance.now();
    phaseEnd = phaseStart + (p.sec * 1000);

    lastSecondSpoken = null;

    setBodyClass(p.key);
    sayStageStart(p);
    updateUI(p, p.sec);

    applyAmbienceMute(true);
    applyAmbienceMuteFallback(true);

    loop();
  }

  function pause(){
    if (!running) return;
    if (!paused){
      paused = true;
      pauseAt = performance.now();
      cancelAnimationFrame(rafId);
      rafId = 0;
      if (elCoach) elCoach.textContent = "Pause. Reprends quand tu veux, sans te presser.";
    } else {
      // resume
      const now = performance.now();
      pauseTotal += (now - pauseAt);
      paused = false;
      loop();
    }
  }

  function stop(){
    running = false;
    paused = false;
    cancelAnimationFrame(rafId);
    rafId = 0;

    body.classList.remove("breath-inhale", "breath-hold", "breath-exhale");
    setBreathVars(0, 0);

    updateUI(null, null);

    applyAmbienceMute(false);
    // si pas de resume dispo, l'utilisateur peut relancer avec le bouton ambiance
  }

  function nextPhase(now){
    phaseIndex = (phaseIndex + 1) % phases.length;
    const p = phases[phaseIndex];
    phaseStart = now;
    phaseEnd = now + (p.sec * 1000);
    lastSecondSpoken = null;

    setBodyClass(p.key);
    sayStageStart(p);
    updateUI(p, p.sec);
  }

  function loop(){
    rafId = requestAnimationFrame(tick);
  }

  function tick(){
    if (!running || paused) return;

    const now = performance.now();
    const elapsedSec = (now - startAt - pauseTotal) / 1000;

    // stop par durée
    if (elapsedSec >= durationLimitSec){
      stop();
      return;
    }

    const phase = phases[phaseIndex];
    const phaseDur = Math.max(0.001, phase.sec);
    const t = (now - phaseStart) / (phaseDur * 1000);
    const clamped = Math.max(0, Math.min(1, t));

    // breath (0..1) + air (0..1) synchronisés par phase
    let breath = 0;
    let air = 0;

    if (phase.key === "inhale"){
      // ease in-out plus “marqué”
      breath = 0.02 + 0.98 * (0.5 - 0.5 * Math.cos(Math.PI * clamped));
      air = clamped;
    } else if (phase.key === "hold"){
      breath = 1;
      air = 1;
    } else { // exhale
      breath = 0.02 + 0.98 * (0.5 + 0.5 * Math.cos(Math.PI * clamped)); // descend
      air = 1 - clamped;
    }

    setBreathVars(breath, air);

    // remaining seconds
    const remainingMs = Math.max(0, phaseEnd - now);
    const remaining = Math.max(0, Math.ceil(remainingMs / 1000));

    updateUI(phase, remaining);

    // décompte vocal (sans couper l'annonce de phase)
    if (remaining !== lastSecondSpoken){
      lastSecondSpoken = remaining;
      if (remaining > 0) sayCountdown(remaining);
    }

    // phase finie
    if (now >= phaseEnd){
      nextPhase(now);
    }

    rafId = requestAnimationFrame(tick);
  }

  // bindings
  btnStart?.addEventListener("click", async () => {
    try{ await window.VivarioSound?.unlock?.(); }catch{}
    start();
  });

  btnPause?.addEventListener("click", pause);
  btnStop?.addEventListener("click", stop);

  // reset text when rhythm changes (sans lancer)
  selRhythm?.addEventListener("change", () => {
    if (!running){
      const r = parseRhythm(selRhythm.value);
      updateUI({ label:"Prêt", key:"" }, r.inhale);
      if (elCoach) elCoach.textContent = "Pose-toi. Quand tu veux, tu peux démarrer.";
      setBreathVars(0, 0);
    }
  });

  // init
  updateUI(null, null);
  setBreathVars(0, 0);

})();