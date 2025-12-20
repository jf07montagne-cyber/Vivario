/* Vivario — sound.js (V6.0 FIX)
   - OFF par défaut (ambiance optionnelle)
   - Multi-ambiances + crossfade
   - Respiration:
      - breath_cycle.mp3 (son respiration)
      - option: couper l’ambiance pendant l’exercice (recommandé)
   - Démarrage uniquement après geste utilisateur
*/

(() => {
  const KEY_ON  = "vivario_sound_on";

  // Base robuste (GitHub Pages / sous-dossier OK)
  const BASE = new URL(".", document.currentScript?.src || window.location.href);

  // Ambiances (même dossier que sound.js)
  const TRACKS = {
    calm:  new URL("ambiance.mp3", BASE).href,
    ocean: new URL("ambiance_ocean.mp3", BASE).href,
    focus: new URL("ambiance_focus.mp3", BASE).href,
    deep:  new URL("ambiance_deep.mp3", BASE).href,
  };

  // Respiration (même dossier)
  const BREATH_TRACK = new URL("breath_cycle.mp3", BASE).href;

  const DEFAULT_MOOD = "calm";

  // volumes ambiance
  const BASE_VOL = 0.60;
  const BREATH_MIN = 0.25;
  const BREATH_MAX = 0.70;

  // volume respiration
  const BREATH_SFX_VOL = 0.90;

  let a = null;         // ambiance active
  let b = null;         // ambiance crossfade
  let breathSfx = null; // respiration
  let startedOnce = false;
  let currentMood = DEFAULT_MOOD;

  // respiration modulation
  let breathTimer = null;
  let breathState = null; // { inhale, exhale, hold, t0, affectAmbience, affectBreath, muteAmbienceWhileBreath }

  // pour remettre l’ambiance après respiration
  let ambienceWasPlayingBeforeBreath = false;

  function isOn() {
    const v = localStorage.getItem(KEY_ON);
    // ✅ OFF par défaut
    return v === "1";
  }
  function setOn(v) {
    localStorage.setItem(KEY_ON, v ? "1" : "0");
  }

  function makeAudio(src) {
    const audio = new Audio(src);
    audio.loop = true;
    audio.preload = "auto";
    audio.playsInline = true;
    audio.volume = BASE_VOL;
    return audio;
  }

  function makeBreathAudio() {
    const audio = new Audio(BREATH_TRACK);
    audio.loop = true;
    audio.preload = "auto";
    audio.playsInline = true;
    audio.volume = BREATH_SFX_VOL;
    return audio;
  }

  function ensureAudio() {
    if (a) return a;
    const src = TRACKS[currentMood] || TRACKS[DEFAULT_MOOD];
    a = makeAudio(src);
    return a;
  }

  async function startAmbience(force = false) {
    if (!isOn() && !force) return false;
    const audio = ensureAudio();
    try {
      await audio.play();
      startedOnce = true;
      updateUI();
      return true;
    } catch {
      updateUI(true);
      return false;
    }
  }

  function stopAll() {
    if (a) { try { a.pause(); } catch {} }
    if (b) { try { b.pause(); } catch {} }
    if (breathSfx) { try { breathSfx.pause(); } catch {} }
    updateUI();
  }

  async function toggle() {
    const next = !isOn();
    setOn(next);
    if (next) await startAmbience(true);
    else stopAll();
    updateUI();
  }

  // Crossfade ambiance
  async function crossfadeTo(nextMood, durationMs = 900) {
    currentMood = nextMood;

    if (!isOn()) {
      if (a) { try { a.pause(); } catch {} a = null; }
      if (b) { try { b.pause(); } catch {} b = null; }
      updateUI();
      return;
    }

    const nextSrc = TRACKS[nextMood] || TRACKS[DEFAULT_MOOD];
    const cur = ensureAudio();

    if (cur?.src && cur.src.includes(nextSrc)) {
      updateUI();
      return;
    }

    b = makeAudio(nextSrc);
    b.volume = 0;

    try {
      await b.play();
    } catch {
      updateUI(true);
      return;
    }

    const steps = 18;
    const stepMs = Math.max(20, Math.floor(durationMs / steps));
    let i = 0;

    const fade = setInterval(() => {
      i++;
      const t = i / steps;

      if (b) b.volume = BASE_VOL * t;
      if (cur) cur.volume = BASE_VOL * (1 - t);

      if (i >= steps) {
        clearInterval(fade);

        try { cur.pause(); } catch {}
        a = b;
        b = null;

        if (breathState?.affectAmbience) applyBreathVolume();
        else if (a) a.volume = BASE_VOL;

        updateUI();
      }
    }, stepMs);
  }

  // -------------------------
  // Respiration
  // -------------------------
  async function startBreathing({
    inhale = 4,
    exhale = 6,
    hold = 0,
    affectAmbience = false,
    affectBreath = true,
    muteAmbienceWhileBreath = true
  } = {}) {
    // ✅ pendant la respiration : on veut entendre quelque chose même si ambiance OFF
    // Donc on "autorise" temporairement le son (sans démarrer l’ambiance si on ne veut pas)
    if (!isOn()) setOn(true);

    breathState = {
      inhale, exhale, hold,
      t0: performance.now(),
      affectAmbience,
      affectBreath,
      muteAmbienceWhileBreath
    };

    // Option: couper l’ambiance pendant l’exercice
    if (muteAmbienceWhileBreath) {
      ambienceWasPlayingBeforeBreath = !!(a && !a.paused);
      if (a && !a.paused) {
        try { a.pause(); } catch {}
      }
      if (b && !b.paused) {
        try { b.pause(); } catch {}
      }
    } else {
      // Si on veut que l’ambiance respire aussi
      if (affectAmbience) await startAmbience(true);
    }

    // Son respiration
    if (affectBreath) {
      if (!breathSfx) breathSfx = makeBreathAudio();
      try {
        await breathSfx.play();
      } catch {
        updateUI(true);
      }
    }

    if (breathTimer) clearInterval(breathTimer);
    breathTimer = setInterval(applyBreathVolume, 60);
    applyBreathVolume();
  }

  function stopBreathing() {
    breathState = null;

    if (breathTimer) clearInterval(breathTimer);
    breathTimer = null;

    // Stop souffle
    if (breathSfx) {
      try { breathSfx.pause(); } catch {}
      try { breathSfx.currentTime = 0; } catch {}
    }

    // Remet l’ambiance comme avant (si elle tournait avant)
    if (ambienceWasPlayingBeforeBreath) {
      startAmbience(true);
    }

    // Reset volume ambiance
    if (a && !a.paused) a.volume = BASE_VOL;
  }

  function applyBreathVolume() {
    if (!breathState) return;
    if (!breathState.affectAmbience) return;

    const audio = a;
    if (!audio || audio.paused) return;

    const { inhale, exhale, hold, t0 } = breathState;
    const cycle = inhale + hold + exhale + hold;
    const t = ((performance.now() - t0) / 1000) % cycle;

    let v;
    if (t < inhale) {
      v = BREATH_MIN + (BREATH_MAX - BREATH_MIN) * (t / inhale);
    } else if (t < inhale + hold) {
      v = BREATH_MAX;
    } else if (t < inhale + hold + exhale) {
      const p = (t - inhale - hold) / exhale;
      v = BREATH_MAX - (BREATH_MAX - BREATH_MIN) * p;
    } else {
      v = BREATH_MIN;
    }

    audio.volume = Math.max(0, Math.min(1, v));
  }

  // -------------------------
  // UI bouton
  // -------------------------
  let hideTimer = null;

  function scheduleAutoHide() {
    clearTimeout(hideTimer);
    const btn = document.getElementById("soundToggle");
    if (!btn) return;
    btn.style.opacity = "1";
    hideTimer = setTimeout(() => (btn.style.opacity = "0.35"), 3000);
  }

  function buildUI() {
    const btn = document.createElement("button");
    btn.id = "soundToggle";
    btn.type = "button";

    // Bas droite (comme tu as)
    btn.style.position = "fixed";
    btn.style.right = "14px";
    btn.style.bottom = "14px";
    btn.style.zIndex = "99999";
    btn.style.border = "1px solid rgba(255,255,255,.14)";
    btn.style.background = "rgba(20,25,35,.55)";
    btn.style.backdropFilter = "blur(10px)";
    btn.style.color = "#fff";
    btn.style.padding = "10px 12px";
    btn.style.borderRadius = "999px";
    btn.style.fontSize = "13px";
    btn.style.cursor = "pointer";
    btn.style.boxShadow = "0 10px 30px rgba(0,0,0,.25)";
    btn.style.transition = "opacity .25s ease, transform .1s ease";

    btn.addEventListener("click", async () => {
      btn.style.transform = "scale(.98)";
      setTimeout(() => (btn.style.transform = "scale(1)"), 80);
      await toggle();
      await startAmbience(true);
      scheduleAutoHide();
    });

    document.body.appendChild(btn);

    ["pointerdown","scroll"].forEach(ev => {
      window.addEventListener(ev, scheduleAutoHide, { passive: true });
    });

    updateUI();
    scheduleAutoHide();
  }

  function updateUI(needTap = false) {
    const btn = document.getElementById("soundToggle");
    if (!btn) return;

    if (!isOn()) {
      btn.textContent = "🔇 Ambiance";
      return;
    }

    if (a && !a.paused) {
      btn.textContent = "🔊 Ambiance";
    } else if (needTap || !startedOnce) {
      btn.textContent = "🔊 Activer";
    } else {
      btn.textContent = "🔊 Ambiance";
    }
  }

  // API globale
  window.VivarioSound = {
    isOn,
    setOn,
    toggle,
    stopAll,
    setMood: async (mood) => {
      if (!mood || !TRACKS[mood]) mood = DEFAULT_MOOD;
      await crossfadeTo(mood, 900);
    },
    startBreathing,
    stopBreathing,
    startAmbience: async () => startAmbience(true),
  };

  document.addEventListener("DOMContentLoaded", () => {
    buildUI();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && isOn()) {
      startAmbience(true);
    }
  });
})();