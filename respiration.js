/* Vivario — respiration.js (v17)
   Objectifs:
   ✅ poumons + animation respiration bien visible (CSS via body classes)
   ✅ flux d’air plus agréable/visible (SVG + classes)
   ✅ voix plus fiable (moins de “sauts” Android) + annonce Inspire/Expire/Bloque + décompte
   ✅ esthétique + textes coach plus doux
   ✅ ne touche PAS index/accueil/apropos
*/
(() => {
  const $ = (id) => document.getElementById(id);

  const btnStart = $("btnStart");
  const btnPause = $("btnPause");
  const btnStop  = $("btnStop");

  const stageLabel = $("stageLabel");
  const secLabel   = $("secLabel");
  const coachLine  = $("coachLine");

  const selRhythm  = $("selRhythm");
  const selDuration= $("selDuration");

  const chkVoice   = $("chkVoice");
  const chkSoft    = $("chkSoft");
  const chkMuteAmb = $("chkMuteAmb");
  const chkVibe    = $("chkVibe");
  const chkTick    = $("chkTick");

  const LS = {
    RHYTHM: "vivario_breath_rhythm",
    DUR: "vivario_breath_duration",
    VOICE: "vivario_breath_voice",
    SOFT: "vivario_breath_soft",
    MUTE: "vivario_breath_mute_amb",
    VIBE: "vivario_breath_vibe",
    TICK: "vivario_breath_tick"
  };

  // ---------- Voix (plus robuste Android) ----------
  // On évite de cancel à chaque seconde (ça “saute” sur Samsung/Chrome),
  // et on limite la file d’attente.
  function speakSafe(text, { soft = true } = {}) {
    try {
      if (!("speechSynthesis" in window)) return;
      const synth = window.speechSynthesis;

      // Nettoyage si la queue gonfle (sécurité)
      // (on évite de cancel tout le temps, mais on purge si nécessaire)
      const pending = (synth.pending ? 1 : 0) + (synth.speaking ? 1 : 0);
      if (pending > 1) {
        synth.cancel();
      }

      const u = new SpeechSynthesisUtterance(String(text));
      u.lang = "fr-FR";
      u.rate = soft ? 0.95 : 1.0;
      u.pitch = soft ? 1.08 : 1.0;
      u.volume = 1.0;

      synth.speak(u);
    } catch {}
  }

  // tick + vibration (on réutilise ton sound.js sans sa voix)
  function cueTickVibe() {
    try {
      window.VivarioSound?.breathCue?.({
        stage: "tick",
        voice: false,
        coachSoft: chkSoft.checked,
        vibrate: chkVibe.checked,
        tick: chkTick.checked
      });
    } catch {}
  }

  async function unlockAudio() {
    try { await window.VivarioSound?.unlock?.(); } catch {}
  }

  // ---------- Ambiance ----------
  function ambienceIsOn() {
    // On lit l’état affiché par le bouton (créé par ambiance.js) si présent
    const b = document.querySelector(".ambience-toggle-mini");
    if (!b) return false;
    return b.classList.contains("is-on");
  }

  async function setAmbience(on) {
    // ambiance.js gère toggle; on force par “toggle si pas dans l’état voulu”
    try {
      const currently = ambienceIsOn();
      if (!!on !== currently) {
        await unlockAudio();
        window.VivarioSound?.toggleAmbience?.();
      }
    } catch {}
  }

  // ---------- Cycle respiration ----------
  let timer = null;
  let running = false;
  let paused = false;

  let phases = []; // [{name, seconds}]
  let phaseIndex = 0;
  let remaining = 0;

  let totalLeft = Infinity; // durée totale en secondes, ou Infinity

  let lastSpokenSecond = null;

  function parseRhythm(val) {
    const parts = String(val || "4-0-6").split("-").map(n => parseInt(n, 10));
    const inhale = Math.max(1, parts[0] || 4);
    const hold   = Math.max(0, parts[1] || 0);
    const exhale = Math.max(1, parts[2] || 6);
    return { inhale, hold, exhale };
  }

  function buildPhases() {
    const { inhale, hold, exhale } = parseRhythm(selRhythm.value);
    const arr = [
      { name: "inspire", seconds: inhale },
    ];
    if (hold > 0) arr.push({ name: "bloque", seconds: hold });
    arr.push({ name: "expire", seconds: exhale });
    return arr;
  }

  function setBodyStage(name) {
    document.body.classList.remove("breath-inhale", "breath-hold", "breath-exhale", "breath-idle");
    if (name === "inspire") document.body.classList.add("breath-inhale");
    else if (name === "bloque") document.body.classList.add("breath-hold");
    else if (name === "expire") document.body.classList.add("breath-exhale");
    else document.body.classList.add("breath-idle");
  }

  function labelStage(name) {
    if (name === "inspire") return "Inspire";
    if (name === "bloque") return "Bloque";
    if (name === "expire") return "Expire";
    return "Prêt";
  }

  function coachSentence(name, sec) {
    const soft = chkSoft.checked;

    // Phrases très courtes pour rester clean + rassurant
    if (name === "inspire") {
      if (sec <= 1) return soft ? "Encore un peu… l’air entre." : "Encore un peu.";
      return soft ? "Inspire… doucement." : "Inspire.";
    }
    if (name === "bloque") {
      if (sec <= 1) return soft ? "Et tu relâches bientôt…" : "Bientôt.";
      return soft ? "Garde l’air… sans forcer." : "Bloque.";
    }
    if (name === "expire") {
      if (sec <= 1) return soft ? "Relâche… c’est bon." : "Relâche.";
      return soft ? "Expire… relâche." : "Expire.";
    }
    return "Tu peux démarrer quand tu veux.";
  }

  function speakStageStart(name) {
    if (!chkVoice.checked) return;
    const soft = chkSoft.checked;

    if (name === "inspire") speakSafe(soft ? "Inspire… doucement." : "Inspire.", { soft });
    else if (name === "bloque") speakSafe(soft ? "Garde l’air… encore un peu." : "Bloque.", { soft });
    else if (name === "expire") speakSafe(soft ? "Expire… relâche." : "Expire.", { soft });
  }

  function speakCountdown(sec) {
    if (!chkVoice.checked) return;
    // Si la synthèse est déjà en train de parler, on ne force pas (sinon ça “saute”).
    try {
      const synth = window.speechSynthesis;
      if (synth && synth.speaking) return;
    } catch {}
    speakSafe(String(sec), { soft: chkSoft.checked });
  }

  function render() {
    const phase = phases[phaseIndex] || { name: "idle", seconds: 0 };
    const name = phase.name;

    stageLabel.textContent = labelStage(name);
    secLabel.textContent = running ? String(remaining) : "—";
    coachLine.textContent = running ? coachSentence(name, remaining) : "Tu peux démarrer quand tu veux.";

    setBodyStage(name);

    // bouton Start/Pause
    btnStart.textContent = running ? "⟲ Reprendre" : "▶ Démarrer";
    btnPause.disabled = !running;
    btnStop.disabled = !running;
  }

  function nextPhase() {
    phaseIndex = (phaseIndex + 1) % phases.length;
    remaining = phases[phaseIndex].seconds;
    lastSpokenSecond = null;

    speakStageStart(phases[phaseIndex].name);
    render();
  }

  function stopAll() {
    running = false;
    paused = false;
    phaseIndex = 0;
    phases = buildPhases();
    remaining = phases[0].seconds;
    totalLeft = Infinity;
    lastSpokenSecond = null;

    if (timer) { clearInterval(timer); timer = null; }

    // On remet l’ambiance si elle avait été coupée
    if (chkMuteAmb.checked) setAmbience(true);

    setBodyStage("idle");
    render();
  }

  function tick() {
    if (!running || paused) return;

    if (totalLeft !== Infinity) {
      totalLeft -= 1;
      if (totalLeft <= 0) {
        stopAll();
        return;
      }
    }

    // tick + vibration (à chaque seconde)
    cueTickVibe();

    // countdown voix (sans se battre avec synth)
    if (lastSpokenSecond !== remaining) {
      lastSpokenSecond = remaining;
      speakCountdown(remaining);
    }

    remaining -= 1;

    if (remaining <= 0) {
      nextPhase();
      return;
    }

    render();
  }

  async function start() {
    await unlockAudio();

    phases = buildPhases();
    phaseIndex = 0;
    remaining = phases[0].seconds;

    // Durée
    const d = selDuration.value;
    totalLeft = (d === "infinite") ? Infinity : Math.max(10, parseInt(d, 10) || 60);

    running = true;
    paused = false;

    // Couper ambiance pendant exercice
    if (chkMuteAmb.checked) {
      // on coupe si ON
      await setAmbience(false);
    }

    // annonce de départ
    speakStageStart(phases[0].name);
    render();

    if (timer) clearInterval(timer);
    timer = setInterval(tick, 1000);
  }

  function pauseToggle() {
    if (!running) return;
    paused = !paused;

    if (paused) {
      coachLine.textContent = "Pause. Reprends quand tu veux.";
      setBodyStage("idle");
      render();
    } else {
      // Reprise: ré-annonce le stage pour relancer proprement
      speakStageStart(phases[phaseIndex].name);
      render();
    }
  }

  // ---------- Persist settings ----------
  function loadSettings() {
    try {
      const r = localStorage.getItem(LS.RHYTHM);
      const d = localStorage.getItem(LS.DUR);
      const v = localStorage.getItem(LS.VOICE);
      const s = localStorage.getItem(LS.SOFT);
      const m = localStorage.getItem(LS.MUTE);
      const vb= localStorage.getItem(LS.VIBE);
      const t = localStorage.getItem(LS.TICK);

      if (r) selRhythm.value = r;
      if (d) selDuration.value = d;

      if (v !== null) chkVoice.checked = (v === "1");
      if (s !== null) chkSoft.checked  = (s === "1");
      if (m !== null) chkMuteAmb.checked = (m === "1");
      if (vb !== null) chkVibe.checked = (vb === "1");
      if (t !== null) chkTick.checked  = (t === "1");
    } catch {}
  }

  function saveSettings() {
    try {
      localStorage.setItem(LS.RHYTHM, selRhythm.value);
      localStorage.setItem(LS.DUR, selDuration.value);
      localStorage.setItem(LS.VOICE, chkVoice.checked ? "1" : "0");
      localStorage.setItem(LS.SOFT, chkSoft.checked ? "1" : "0");
      localStorage.setItem(LS.MUTE, chkMuteAmb.checked ? "1" : "0");
      localStorage.setItem(LS.VIBE, chkVibe.checked ? "1" : "0");
      localStorage.setItem(LS.TICK, chkTick.checked ? "1" : "0");
    } catch {}
  }

  // ---------- Bind ----------
  function bind() {
    btnStart?.addEventListener("click", async () => {
      if (!running) return start();
      if (running && paused) { paused = false; speakStageStart(phases[phaseIndex].name); return; }
      // si déjà en cours: redémarrer propre
      stopAll();
      start();
    });

    btnPause?.addEventListener("click", pauseToggle);
    btnStop?.addEventListener("click", stopAll);

    [selRhythm, selDuration, chkVoice, chkSoft, chkMuteAmb, chkVibe, chkTick].forEach(el => {
      el?.addEventListener("change", () => {
        saveSettings();
        // Si on change le rythme pendant lecture: on ne casse pas, on applique au prochain stop/restart.
        if (!running) {
          phases = buildPhases();
          remaining = phases[0].seconds;
          render();
        }
      });
    });

    // sécurité: si on quitte la page, on rétablit ambiance
    window.addEventListener("pagehide", () => {
      try { if (chkMuteAmb.checked) setAmbience(true); } catch {}
    });
  }

  function init() {
    loadSettings();
    phases = buildPhases();
    remaining = phases[0].seconds;

    setBodyStage("idle");
    render();
    bind();
  }

  init();
})();