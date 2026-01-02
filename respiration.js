(() => {
  const LS = {
    rhythm: "vivario_breath_rhythm",
    duration: "vivario_breath_duration",
    voice: "vivario_breath_voice",
    coach: "vivario_breath_coachsoft",
    cutAmb: "vivario_breath_cutamb",
  };

  const elStage = document.getElementById("stageLabel");
  const elSec = document.getElementById("secLabel");
  const elCoach = document.getElementById("coachLine");

  const btnStart = document.getElementById("btnStart");
  const btnPause = document.getElementById("btnPause");
  const btnStop  = document.getElementById("btnStop");

  const selRhythm = document.getElementById("selRhythm");
  const selDuration = document.getElementById("selDuration");
  const chkVoice = document.getElementById("chkVoice");
  const chkCoachSoft = document.getElementById("chkCoachSoft");
  const chkCutAmb = document.getElementById("chkCutAmb");

  const A = () => (window.VivarioAmbience || window.VivarioAmbiance);
  const S = () => window.VivarioSound;

  // ===== helpers =====
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const setBodyStage = (k) => {
    document.body.classList.remove("breath-inhale", "breath-hold", "breath-exhale");
    document.body.classList.add("breath-" + k);
  };

  function setCoachLine(stageKey, secLeft) {
    const soft = !!chkCoachSoft.checked;
    let t = "";
    if (stageKey === "inhale") t = soft ? "Inspire tranquillement. Épaules relâchées." : "Inspire.";
    else if (stageKey === "hold") t = soft ? "Garde l’air un instant. Sans forcer." : "Bloque.";
    else if (stageKey === "exhale") t = soft ? "Expire… relâche. Laisse sortir." : "Expire.";
    else t = soft ? "On continue." : "Continue.";
    if (typeof secLeft === "number") t += ` (${secLeft}s)`;
    elCoach.textContent = t;
  }

  function parseRhythm(str) {
    const s = String(str || "4-0-6").trim();
    if (s === "4-4-4-4") return [
      { key: "inhale", label: "Inspire", seconds: 4 },
      { key: "hold",   label: "Garde",   seconds: 4 },
      { key: "exhale", label: "Expire",  seconds: 4 },
      { key: "hold",   label: "Garde",   seconds: 4 },
    ];
    const parts = s.split("-").map(n => Math.max(0, parseInt(n, 10) || 0));
    const inh = parts[0] || 4;
    const hold = parts[1] || 0;
    const exh = parts[2] || 6;
    const out = [
      { key: "inhale", label: "Inspire", seconds: inh },
    ];
    if (hold > 0) out.push({ key: "hold", label: "Garde", seconds: hold });
    out.push({ key: "exhale", label: "Expire", seconds: exh });
    return out;
  }

  function loadPrefs() {
    const r = localStorage.getItem(LS.rhythm) || "4-0-6";
    const d = localStorage.getItem(LS.duration) || "inf";
    const v = localStorage.getItem(LS.voice);
    const c = localStorage.getItem(LS.coach);
    const a = localStorage.getItem(LS.cutAmb);

    selRhythm.value = r;
    selDuration.value = d;

    chkVoice.checked = (v === null) ? true : (v === "1");
    chkCoachSoft.checked = (c === null) ? true : (c === "1");
    chkCutAmb.checked = (a === null) ? true : (a === "1");
  }

  function savePrefs() {
    localStorage.setItem(LS.rhythm, selRhythm.value);
    localStorage.setItem(LS.duration, selDuration.value);
    localStorage.setItem(LS.voice, chkVoice.checked ? "1" : "0");
    localStorage.setItem(LS.coach, chkCoachSoft.checked ? "1" : "0");
    localStorage.setItem(LS.cutAmb, chkCutAmb.checked ? "1" : "0");
  }

  // ===== engine synchro =====
  let running = false;
  let paused = false;

  let stages = parseRhythm("4-0-6");
  let stageIndex = 0;

  // horloge
  let t0 = 0;            // perf.now() au démarrage
  let pauseAt = 0;       // perf.now() pause
  let pausedTotal = 0;   // total pause ms

  // scheduling (voix)
  let lastSecondSpoken = null;
  let lastStageSpokenKey = null;
  let nextSecondBoundaryMs = null;

  // ambiance
  let ambienceWasOn = false;

  function durationSeconds() {
    const v = selDuration.value;
    if (v === "inf") return Infinity;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : Infinity;
  }

  function cycleSecondsTotal() {
    return stages.reduce((a, s) => a + (s.seconds || 0), 0);
  }

  function elapsedMs(now) {
    return now - t0 - pausedTotal;
  }

  function setBreathVar(val01) {
    // variable CSS pilotant gonflement + flux
    document.documentElement.style.setProperty("--breath", String(clamp01(val01)));
  }

  function setAirVar(x) {
    document.documentElement.style.setProperty("--air", String(x));
  }

  function speakStage(stageKey) {
    if (!chkVoice.checked) return;
    // phrase (inspire/expire/garde)
    S()?.breathCue?.({
      stage: stageKey,
      voice: true,
      coachSoft: chkCoachSoft.checked,
      vibrate: false,
      tick: false
    });
  }

  function speakCountdown(n) {
    if (!chkVoice.checked) return;
    // nombre (décompte)
    S()?.breathCue?.({
      stage: "countdown",
      voice: true,
      coachSoft: chkCoachSoft.checked,
      vibrate: false,
      tick: false,
      countdown: n
    });
  }

  function tickSecond() {
    // petit tick + vibration légère optionnelle (ici juste tick)
    S()?.breathCue?.({
      stage: "tick",
      voice: false,
      coachSoft: chkCoachSoft.checked,
      vibrate: false,
      tick: true
    });
  }

  function currentStageAt(tSec) {
    // retourne {index, stage, stageStartSec, stageEndSec}
    let acc = 0;
    for (let i = 0; i < stages.length; i++) {
      const dur = stages[i].seconds || 0;
      const start = acc;
      const end = acc + dur;
      if (tSec >= start && tSec < end) {
        return { index: i, stage: stages[i], startSec: start, endSec: end };
      }
      acc = end;
    }
    // si pile à la fin -> retourne dernier
    const last = stages[stages.length - 1];
    const total = cycleSecondsTotal();
    return { index: stages.length - 1, stage: last, startSec: total - (last?.seconds || 0), endSec: total };
  }

  function setUI(stageKey, label, secLeft) {
    elStage.textContent = label || "—";
    elSec.textContent = (typeof secLeft === "number") ? String(secLeft) : "—";
    setCoachLine(stageKey, secLeft);
  }

  function computeBreathValue(stageKey, prog01) {
    // prog01 = progression dans l’étape (0->1)
    if (stageKey === "inhale") return prog01;          // 0 -> 1
    if (stageKey === "hold") return 1;                 // 1
    if (stageKey === "exhale") return 1 - prog01;      // 1 -> 0
    return 0;
  }

  function stopAll(hard = true) {
    running = false;
    paused = false;

    setBodyStage("inhale");
    setBreathVar(0);
    setAirVar(0);

    stageIndex = 0;
    lastSecondSpoken = null;
    lastStageSpokenKey = null;
    nextSecondBoundaryMs = null;

    elStage.textContent = "Prêt";
    elSec.textContent = "—";
    elCoach.textContent = "Quand tu veux. Appuie sur Démarrer.";

    // restaurer ambiance si on l’avait coupée
    if (hard && chkCutAmb.checked && ambienceWasOn) {
      try { A()?.toggle?.(); } catch {}
    }
    ambienceWasOn = false;
  }

  function pause() {
    if (!running || paused) return;
    paused = true;
    pauseAt = performance.now();
    elCoach.textContent = "Pause. Quand tu es prêt, relance Démarrer.";
  }

  function resume() {
    if (!running || !paused) return;
    paused = false;
    const now = performance.now();
    pausedTotal += (now - pauseAt);
  }

  function start() {
    savePrefs();
    stages = parseRhythm(selRhythm.value);
    stageIndex = 0;

    running = true;
    paused = false;
    pausedTotal = 0;

    t0 = performance.now();

    lastSecondSpoken = null;
    lastStageSpokenKey = null;
    nextSecondBoundaryMs = null;

    // coupe ambiance si demandé
    ambienceWasOn = false;
    if (chkCutAmb.checked) {
      try {
        const isOn = !!A()?.isOn?.();
        ambienceWasOn = isOn;
        if (isOn) A()?.toggle?.();
      } catch {}
    }

    // unlock audio
    try { S()?.unlock?.(); } catch {}

    // démarrage visuel immédiat
    setBodyStage("inhale");
    setBreathVar(0);
    setAirVar(0);

    // annonce du premier stage au tout début
    speakStage("inhale");
  }

  // boucle principale: synchro sans dérive
  const LOOKAHEAD_MS = 170; // déclenchement voix légèrement avant la “seconde”
  function loop() {
    requestAnimationFrame(loop);
    if (!running || paused) return;

    const now = performance.now();
    const t = elapsedMs(now) / 1000;

    // stop si durée finie
    const maxDur = durationSeconds();
    if (Number.isFinite(maxDur) && t >= maxDur) {
      stopAll(true);
      return;
    }

    const cycleTotal = cycleSecondsTotal();
    const tInCycle = (cycleTotal > 0) ? (t % cycleTotal) : 0;

    const info = currentStageAt(tInCycle);
    const st = info.stage;
    const stageKey = st.key;
    const label = st.label;

    // progression dans étape
    const dur = Math.max(0.001, st.seconds || 1);
    const stageT = tInCycle - info.startSec;
    const prog01 = clamp01(stageT / dur);

    // breath var (gonflement/dégonflement synchronisé)
    const breath = computeBreathValue(stageKey, prog01);
    setBreathVar(breath);

    // air var (flux visible synchronisé)
    // on fait “couler” plus vite à l’inspire, et inversé à l’expire
    const airBase = (t * 1.1);
    setAirVar(stageKey === "exhale" ? -airBase : airBase);

    // classe body
    setBodyStage(stageKey);

    // secondes restantes (affichage + décompte)
    const secLeft = Math.max(0, Math.ceil((info.endSec - tInCycle) - 1e-9));
    setUI(stageKey, label, secLeft);

    // annonce de stage (une seule fois par transition)
    if (lastStageSpokenKey !== stageKey) {
      lastStageSpokenKey = stageKey;
      speakStage(stageKey);
      // reset countdown mémoire sur changement d’étape
      lastSecondSpoken = null;
      nextSecondBoundaryMs = null;
    }

    // scheduling “seconde” : on déclenche le chiffre au bon moment (avec lookahead)
    // On calcule la prochaine frontière de seconde dans l’étape courante.
    // Exemple: si secLeft=5, la prochaine frontière est quand on passera à 4.
    const stageEndMs = t0 + pausedTotal + (info.endSec * 1000);
    // frontière quand il restera (secLeft-1)
    const boundaryMs = stageEndMs - (Math.max(0, secLeft - 1) * 1000);

    if (nextSecondBoundaryMs === null || Math.abs(nextSecondBoundaryMs - boundaryMs) > 30) {
      nextSecondBoundaryMs = boundaryMs;
    }

    // déclenchement anticipé
    const shouldFire = (now + LOOKAHEAD_MS) >= nextSecondBoundaryMs;
    if (shouldFire) {
      // on parle 1 fois par valeur de seconde
      if (lastSecondSpoken !== secLeft) {
        lastSecondSpoken = secLeft;
        // tick discret + chiffre (si >0)
        tickSecond();
        if (secLeft > 0) speakCountdown(secLeft);
      }
      // prépare la frontière suivante
      nextSecondBoundaryMs += 1000;
    }
  }

  // ===== binds =====
  function bind() {
    loadPrefs();

    selRhythm.addEventListener("change", savePrefs);
    selDuration.addEventListener("change", savePrefs);
    chkVoice.addEventListener("change", savePrefs);
    chkCoachSoft.addEventListener("change", savePrefs);
    chkCutAmb.addEventListener("change", savePrefs);

    btnStart.addEventListener("click", () => {
      if (!running) start();
      else if (paused) resume();
    });

    btnPause.addEventListener("click", () => pause());
    btnStop.addEventListener("click", () => stopAll(true));

    // petit unlock si l’utilisateur touche ailleurs
    window.addEventListener("pointerdown", () => { try { S()?.unlock?.(); } catch {} }, { passive:true });
    window.addEventListener("touchstart", () => { try { S()?.unlock?.(); } catch {} }, { passive:true });
  }

  bind();
  loop();
})();