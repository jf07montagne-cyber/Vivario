(() => {
  // ===== DOM =====
  const stageLabel = document.getElementById("stageLabel");
  const secLabel   = document.getElementById("secLabel");
  const coachText  = document.getElementById("coachText");

  const btnStart   = document.getElementById("btnStart");
  const btnStop    = document.getElementById("btnStop");

  const rhythmSelect = document.getElementById("rhythmSelect");

  const optVoice = document.getElementById("optVoice");
  const optCount = document.getElementById("optCount");
  const optTick  = document.getElementById("optTick");
  const optVibe  = document.getElementById("optVibe");
  const optSoft  = document.getElementById("optSoft");

  const canvas = document.getElementById("airCanvas");
  const ctx2d = canvas?.getContext?.("2d", { alpha: true });

  // ===== State =====
  let running = false;
  let timers = [];
  let raf = 0;

  // phase state
  let phase = "ready"; // inhale | hold | exhale | ready
  let tPhaseStart = 0;
  let phaseDurationMs = 0;

  // cadence
  let inhaleS = 4, holdS = 0, exhaleS = 6;

  // visual vars
  let breath = 0; // 0..1
  let air = 0;    // 0..1 (used as dashoffset driver)
  let airDir = 1; // + inhale, - exhale

  // voice timing guard
  let lastSpokenPhase = "";
  let lastSpokenSecond = null;

  // ===== helpers =====
  const clamp01 = (x) => Math.max(0, Math.min(1, x));

  function setCSSVars() {
    document.documentElement.style.setProperty("--breath", String(breath));
    document.documentElement.style.setProperty("--air", String(air));
  }

  function setBodyPhaseClass(p) {
    document.body.classList.remove("breath-inhale", "breath-hold", "breath-exhale");
    if (p === "inhale") document.body.classList.add("breath-inhale");
    if (p === "hold")   document.body.classList.add("breath-hold");
    if (p === "exhale") document.body.classList.add("breath-exhale");
  }

  function clearAllTimers() {
    timers.forEach(id => clearTimeout(id));
    timers = [];
  }

  function stopSpeech() {
    try { window.speechSynthesis?.cancel?.(); } catch {}
  }

  function speakPhaseWord(p) {
    // dit Inspire / Expire au moment du changement de phase (sans casser le décompte)
    const voiceOn = !!optVoice?.checked;
    const soft = !!optSoft?.checked;
    if (!voiceOn) return;

    if (p === "inhale") {
      window.VivarioSound?.breathCue?.({ stage: "inspire", voice: true, coachSoft: soft, tick: false, vibrate: false });
    } else if (p === "exhale") {
      window.VivarioSound?.breathCue?.({ stage: "expire", voice: true, coachSoft: soft, tick: false, vibrate: false });
    } else if (p === "hold") {
      // optionnel : très court et doux
      window.VivarioSound?.breathCue?.({ stage: "bloque", voice: true, coachSoft: soft, tick: false, vibrate: false });
    }
  }

  function tickSecond(p, secLeft) {
    // Décompte + tick + vibration, synchro sur la seconde
    const voiceOn = !!optVoice?.checked;
    const countOn = !!optCount?.checked;
    const tickOn  = !!optTick?.checked;
    const vibeOn  = !!optVibe?.checked;
    const soft    = !!optSoft?.checked;

    // éviter répétitions si navigateur “double fire”
    const key = `${p}:${secLeft}`;
    if (lastSpokenSecond === key) return;
    lastSpokenSecond = key;

    // tick/vibration
    if (tickOn) {
      window.VivarioSound?.breathCue?.({ stage: p, voice: false, tick: true, vibrate: false });
    }
    if (vibeOn) {
      window.VivarioSound?.breathCue?.({ stage: p, voice: false, tick: false, vibrate: true });
    }

    // voix (décompte) — sans casser la synchro
    if (voiceOn && countOn && typeof secLeft === "number") {
      window.VivarioSound?.breathCue?.({
        stage: p,
        voice: true,
        coachSoft: soft,
        tick: false,
        vibrate: false,
        countdown: secLeft
      });
    }
  }

  function applyRhythmFromSelect() {
    const val = String(rhythmSelect?.value || "4-0-6");
    const parts = val.split("-").map(n => parseInt(n, 10));
    inhaleS = Number.isFinite(parts[0]) ? parts[0] : 4;
    holdS   = Number.isFinite(parts[1]) ? parts[1] : 0;
    exhaleS = Number.isFinite(parts[2]) ? parts[2] : 6;
  }

  function setUIForPhase(p, secLeft) {
    if (!stageLabel || !secLabel) return;

    if (p === "inhale") {
      stageLabel.textContent = "Inspire";
      coachText.textContent = "Inspire par le nez… laisse l’air remplir doucement.";
    } else if (p === "hold") {
      stageLabel.textContent = "Garde";
      coachText.textContent = "Garde l’air… juste un instant, sans forcer.";
    } else if (p === "exhale") {
      stageLabel.textContent = "Expire";
      coachText.textContent = "Expire lentement… relâche la pression.";
    } else {
      stageLabel.textContent = "Prêt";
      coachText.textContent = "Quand tu veux : inspire… puis expire. Laisse ton corps suivre.";
    }

    secLabel.textContent = (typeof secLeft === "number") ? String(secLeft) : "—";
  }

  // ===== timeline engine (synchro solide) =====
  function runPhase(p, seconds) {
    phase = p;
    setBodyPhaseClass(p);

    tPhaseStart = performance.now();
    phaseDurationMs = Math.max(1, seconds * 1000);

    // announce phase word once
    if (running && lastSpokenPhase !== p) {
      lastSpokenPhase = p;
      speakPhaseWord(p);
    }

    // set direction
    if (p === "inhale") airDir = 1;
    if (p === "exhale") airDir = -1;
    if (p === "hold")   airDir = 0;

    // initial UI + tick at start
    setUIForPhase(p, seconds);
    tickSecond(p, seconds);

    // per-second ticks (aligned)
    for (let s = seconds - 1; s >= 0; s--) {
      const id = setTimeout(() => {
        if (!running) return;
        setUIForPhase(p, s);
        tickSecond(p, s);
      }, (seconds - s) * 1000);
      timers.push(id);
    }

    // next
    const endId = setTimeout(() => {
      if (!running) return;

      if (p === "inhale") {
        if (holdS > 0) runPhase("hold", holdS);
        else runPhase("exhale", exhaleS);
      } else if (p === "hold") {
        runPhase("exhale", exhaleS);
      } else if (p === "exhale") {
        // loop
        runPhase("inhale", inhaleS);
      }
    }, seconds * 1000);

    timers.push(endId);
  }

  // ===== “3D” canvas airflow =====
  const particles = [];
  function resizeCanvas() {
    if (!canvas || !ctx2d) return;
    const rect = canvas.parentElement?.getBoundingClientRect?.();
    if (!rect) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width  = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function spawnParticle() {
    if (!ctx2d || !canvas) return;
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;

    // spawn near top center (trachée)
    const x = w * (0.50 + (Math.random() - 0.5) * 0.06);
    const y = h * (0.18 + Math.random() * 0.03);

    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 0.25,
      vy: 0.8 + Math.random() * 0.6,
      r:  1.2 + Math.random() * 2.2,
      life: 1,
      drift: (Math.random() - 0.5) * 0.9
    });
  }

  function drawCanvas(now) {
    if (!ctx2d || !canvas) return;

    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;

    ctx2d.clearRect(0, 0, w, h);

    // intensity
    const intensity = clamp01(0.15 + breath * 0.85);

    // soft glow
    ctx2d.globalAlpha = 0.18 * intensity;
    ctx2d.beginPath();
    ctx2d.ellipse(w * 0.5, h * 0.52, w * 0.45, h * 0.38, 0, 0, Math.PI * 2);
    ctx2d.fillStyle = "rgba(170,225,255,1)";
    ctx2d.fill();
    ctx2d.globalAlpha = 1;

    // spawn more during inhale/exhale
    const target = running ? (phase === "hold" ? 1 : 3) : 0;
    for (let i = 0; i < target; i++) {
      if (Math.random() < 0.65) spawnParticle();
    }

    // update particles
    const dir = (phase === "exhale") ? -1 : 1;
    const speedMul = running ? (0.7 + breath * 1.25) : 0.2;

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];

      // route: split left/right after mid
      const split = (p.y > h * 0.38);
      const branchSide = (p.x < w * 0.5) ? -1 : 1;

      const curve = split ? branchSide * 0.55 : 0;
      p.vx += (curve * 0.012) + (Math.sin(now / 900 + p.drift) * 0.004);
      p.vy += 0.003;

      // move (reverse on exhale)
      p.x += p.vx * speedMul * dir;
      p.y += p.vy * speedMul * dir;

      p.life -= 0.010 * speedMul;
      if (p.life <= 0 || p.y < h * 0.10 || p.y > h * 0.90 || p.x < -20 || p.x > w + 20) {
        particles.splice(i, 1);
        continue;
      }

      const a = 0.55 * intensity * p.life;
      ctx2d.globalAlpha = a;
      ctx2d.beginPath();
      ctx2d.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx2d.fillStyle = "rgba(210,245,255,1)";
      ctx2d.fill();
      ctx2d.globalAlpha = 1;
    }
  }

  // ===== animation loop sync vars =====
  function animate(now) {
    if (!running) {
      // idle breathe (tiny)
      breath = breath * 0.92;
      air = air * 0.92;
      setCSSVars();
      drawCanvas(now);
      raf = requestAnimationFrame(animate);
      return;
    }

    // phase progress
    const t = clamp01((now - tPhaseStart) / phaseDurationMs);

    if (phase === "inhale") {
      // smooth in
      breath = t;
      air = (air + 0.030 * (0.6 + t)) % 1;
    } else if (phase === "hold") {
      breath = 1;
      air = (air + 0.006) % 1;
    } else if (phase === "exhale") {
      breath = 1 - t;
      air = (air + 0.030 * (0.6 + (1 - t))) % 1;
    }

    setCSSVars();
    drawCanvas(now);
    raf = requestAnimationFrame(animate);
  }

  // ===== controls =====
  async function start() {
    if (running) return;
    applyRhythmFromSelect();

    running = true;
    lastSpokenPhase = "";
    lastSpokenSecond = null;

    try { await window.VivarioSound?.unlock?.(); } catch {}
    // ne coupe pas l’ambiance : on laisse ambiance.js gérer
    // (si ton ambiance se coupe encore, ce sera dans ambiance.js, pas ici)

    clearAllTimers();
    runPhase("inhale", inhaleS);

    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(animate);
  }

  function stop() {
    running = false;
    clearAllTimers();
    stopSpeech();
    phase = "ready";
    setBodyPhaseClass("ready");
    setUIForPhase("ready", null);

    // reset vars smoothly
    breath = 0;
    air = 0;
    setCSSVars();
  }

  function bind() {
    btnStart?.addEventListener("click", start);
    btnStop?.addEventListener("click", stop);

    rhythmSelect?.addEventListener("change", () => {
      applyRhythmFromSelect();
      // si running, on redémarre proprement au prochain cycle
      if (running) {
        stop();
        start();
      } else {
        setUIForPhase("ready", null);
      }
    });

    // options : si tu changes, ça doit avoir un effet immédiat
    // (on ne redémarre pas, juste on applique au prochain tick)
    [optVoice, optCount, optTick, optVibe, optSoft].forEach(el => {
      el?.addEventListener("change", () => {
        // si voix décochée : stop speech immédiat
        if (el === optVoice && !optVoice.checked) stopSpeech();
      });
    });

    window.addEventListener("resize", () => {
      resizeCanvas();
    });
  }

  function init() {
    applyRhythmFromSelect();
    setUIForPhase("ready", null);

    // canvas sizing
    resizeCanvas();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(animate);

    bind();
  }

  init();
})();