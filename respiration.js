/* Vivario — respiration.js (v18)
   ✅ synchro : voix + décompte + animation + flux d'air
   ✅ “lead” anti-retard Android (voix déclenchée légèrement avant)
   ✅ n'impacte aucune autre page
*/
(() => {
  const body = document.body;

  const elStage = document.getElementById("stageLabel");
  const elSec   = document.getElementById("secLabel");
  const elCoach = document.getElementById("coachLabel");

  const btnStart = document.getElementById("btnStart");
  const btnStop  = document.getElementById("btnStop");

  const preset   = document.getElementById("preset");
  const optVoice = document.getElementById("optVoice");
  const optCount = document.getElementById("optCount");
  const optTick  = document.getElementById("optTick");
  const optVibe  = document.getElementById("optVibe");
  const optSoft  = document.getElementById("optSoft");

  const SOUND = () => window.VivarioSound;

  const ease = (t) => (t < 0.5) ? (2*t*t) : (1 - Math.pow(-2*t+2, 2)/2);

  // petit “lead” (ms) pour compenser le démarrage de la voix sur Android
  const VOICE_LEAD_MS = 180;

  let running = false;
  let raf = 0;

  let inhaleS = 4, holdS = 2, exhaleS = 6;

  // timeline
  let cycleStart = 0;      // performance.now()
  let lastSecondSpoken = null;
  let lastPhase = "";

  function parsePreset(v){
    const m = String(v || "4-2-6").split("-").map(x => parseInt(x,10));
    inhaleS = Math.max(2, m[0] || 4);
    holdS   = Math.max(0, m[1] || 2);
    exhaleS = Math.max(3, m[2] || 6);
  }

  function setVars(breath, air){
    // breath: 0..1
    const b = Math.min(1, Math.max(0, breath));
    const a = Math.min(1, Math.max(0, air));
    body.style.setProperty("--breath", String(b));
    body.style.setProperty("--air", String(a));
  }

  function setPhaseClass(phase){
    body.classList.remove("breath-inhale", "breath-hold", "breath-exhale");
    if (phase === "inhale") body.classList.add("breath-inhale");
    if (phase === "hold")   body.classList.add("breath-hold");
    if (phase === "exhale") body.classList.add("breath-exhale");
  }

  function phaseText(phase){
    if (phase === "inhale") return "Inspire";
    if (phase === "hold")   return "Garde l’air";
    if (phase === "exhale") return "Expire";
    return "Prêt";
  }

  function coachText(phase){
    if (phase === "inhale") return "Inspire par le nez… laisse le ventre s’ouvrir.";
    if (phase === "hold")   return "Garde l’air… juste un instant, sans forcer.";
    if (phase === "exhale") return "Expire lentement… relâche les épaules.";
    return "Appuie sur “Démarrer”. Laisse-toi guider… doucement.";
  }

  function speakPhase(phase){
    const voice = !!optVoice?.checked;
    const soft  = !!optSoft?.checked;
    const tick  = !!optTick?.checked;
    const vibr  = !!optVibe?.checked;

    SOUND()?.breathCue?.({
      stage: phaseText(phase),
      voice,
      coachSoft: soft,
      tick,
      vibrate: vibr,
      announce: true
    });
  }

  function speakCountdown(n){
    if (!optVoice?.checked) return;
    if (!optCount?.checked) return;

    const soft = !!optSoft?.checked;
    const tick = !!optTick?.checked;
    const vibr = !!optVibe?.checked;

    SOUND()?.breathCue?.({
      stage: "countdown",
      voice: true,
      coachSoft: soft,
      tick,
      vibrate: vibr,
      countdown: n
    });
  }

  function computePhase(t){
    // t en secondes depuis cycleStart
    const total = inhaleS + holdS + exhaleS;
    const tt = ((t % total) + total) % total;

    if (tt < inhaleS) return { phase:"inhale", p: tt / inhaleS, remain: Math.ceil(inhaleS - tt) };
    if (tt < inhaleS + holdS) {
      const x = tt - inhaleS;
      const denom = (holdS || 1);
      return { phase:"hold", p: holdS ? (x / denom) : 1, remain: holdS ? Math.ceil(holdS - x) : 0 };
    }
    const y = tt - inhaleS - holdS;
    return { phase:"exhale", p: y / exhaleS, remain: Math.ceil(exhaleS - y) };
  }

  function updateUI(phase, remain){
    if (elStage) elStage.textContent = phaseText(phase);
    if (elSec)   elSec.textContent   = String(Math.max(0, remain));
    if (elCoach) elCoach.textContent = coachText(phase);
  }

  function tick(now){
    if (!running) return;

    const t = (now - cycleStart) / 1000;
    const info = computePhase(t);

    // visuel synchro
    if (info.phase === "inhale"){
      const b = ease(info.p);                 // 0..1
      const air = info.p;                     // 0..1
      setVars(b, air);
    } else if (info.phase === "hold"){
      setVars(1, 1);
    } else { // exhale
      const b = 1 - ease(info.p);
      const air = 1 - info.p;
      setVars(b, air);
    }

    setPhaseClass(info.phase);
    updateUI(info.phase, info.remain);

    // voix synchro (anti-retard) :
    // on annonce la phase quand elle change, en “avance” via VOICE_LEAD_MS :
    if (info.phase !== lastPhase){
      lastPhase = info.phase;
      // annoncer tout de suite + (ça purge la phrase précédente)
      speakPhase(info.phase);
      lastSecondSpoken = null;
    }

    // décompte : on le cale sur les secondes restantes
    // petit hack anti-lag : on déclenche un chouïa AVANT la seconde pour compenser
    if (optVoice?.checked && optCount?.checked){
      const remain = Math.max(0, info.remain);
      if (lastSecondSpoken !== remain){
        lastSecondSpoken = remain;

        // on déclenche légèrement en avance (si possible)
        // la "bonne" seconde est celle affichée
        // => ça colle mieux au visuel sur Android
        setTimeout(() => speakCountdown(remain), Math.max(0, VOICE_LEAD_MS - 110));
      }
    }

    raf = requestAnimationFrame(tick);
  }

  async function start(){
    if (running) return;
    parsePreset(preset?.value);

    running = true;
    btnStart && (btnStart.disabled = true);
    btnStop  && (btnStop.disabled = false);

    try { await SOUND()?.unlock?.(); } catch {}

    // reset
    body.style.setProperty("--breath", "0");
    body.style.setProperty("--air", "0");

    cycleStart = performance.now();

    // pré-annonce douce pour “amorcer” SpeechSynthesis sur Android
    // (réduit le lag sur la première phase)
    setTimeout(() => {
      if (!running) return;
      speakPhase("inhale");
    }, 40);

    raf = requestAnimationFrame(tick);
  }

  function stop(){
    running = false;
    cancelAnimationFrame(raf);

    btnStart && (btnStart.disabled = false);
    btnStop  && (btnStop.disabled = true);

    body.classList.remove("breath-inhale", "breath-hold", "breath-exhale");
    setVars(0, 0);

    if (elStage) elStage.textContent = "Prêt";
    if (elSec)   elSec.textContent   = "—";
    if (elCoach) elCoach.textContent = "Appuie sur “Démarrer”. Laisse-toi guider… doucement.";

    lastSecondSpoken = null;
    lastPhase = "";
  }

  preset?.addEventListener("change", () => {
    parsePreset(preset.value);
    if (!running) return;
    // redémarre proprement pour garder la synchro
    stop();
    start();
  });

  btnStart?.addEventListener("click", start);
  btnStop?.addEventListener("click", stop);

  // init
  parsePreset(preset?.value);
  stop();
})();