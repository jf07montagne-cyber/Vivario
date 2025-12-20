/* Vivario — sound.js (V4.0 PRO)
   - Bouton son bas droite + discret + auto-hide
   - Multi-ambiances (moods) + crossfade
   - Sync respiration (modulation de volume)
   - Démarrage uniquement après geste utilisateur
*/

(() => {
  const KEY_ON  = "vivario_sound_on";

  // Base robuste (fonctionne même si Vivario est dans un sous-dossier GitHub Pages)
  const BASE = new URL(".", document.currentScript?.src || window.location.href);

  // 🔁 Mets ici tes fichiers (dans le MÊME dossier que sound.js, ou adapte les chemins)
  const TRACKS = {
    calm:  new URL("ambiance.mp3", BASE).href,        // ton ambiance principale actuelle
    ocean: new URL("ambiance_ocean.mp3", BASE).href,  // optionnel
    focus: new URL("ambiance_focus.mp3", BASE).href,  // optionnel
    deep:  new URL("ambiance_deep.mp3", BASE).href,   // optionnel
  };

  const DEFAULT_MOOD = "calm";

  // volumes
  const BASE_VOL = 0.60;       // volume “normal”
  const BREATH_MIN = 0.25;     // volume bas en expiration
  const BREATH_MAX = 0.70;     // volume haut en inspiration

  let a = null;                // audio actif
  let b = null;                // audio pour crossfade
  let startedOnce = false;
  let currentMood = DEFAULT_MOOD;

  // respiration
  let breathTimer = null;
  let breathState = null;      // { inhale, exhale, hold, t0 }

  function isOn() {
    const v = localStorage.getItem(KEY_ON);
    return v === null ? true : v === "1";
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

  function ensureAudio() {
    if (a) return a;
    const src = TRACKS[currentMood] || TRACKS[DEFAULT_MOOD];
    a = makeAudio(src);
    return a;
  }

  async function start(force = false) {
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

  function stop() {
    if (!a) return;
    try { a.pause(); } catch {}
    updateUI();
  }

  async function toggle() {
    const next = !isOn();
    setOn(next);
    if (next) await start(true);
    else stop();
    updateUI();
  }

  // ✅ Crossfade propre entre 2 ambiances
  async function crossfadeTo(nextMood, durationMs = 900) {
    currentMood = nextMood;

    // si OFF, on ne force pas
    if (!isOn()) {
      // on change juste le src “virtuellement”
      if (a) {
        try { a.pause(); } catch {}
        a = null;
      }
      updateUI();
      return;
    }

    const nextSrc = TRACKS[nextMood] || TRACKS[DEFAULT_MOOD];
    const cur = ensureAudio();

    // Si c’est déjà la même piste (ou quasi), on ne fait rien
    if (cur?.src && cur.src.includes(nextSrc)) {
      updateUI();
      return;
    }

    // prépare la piste B
    b = makeAudio(nextSrc);
    b.volume = 0;

    try {
      await b.play();
    } catch {
      // si bloqué, on attend le prochain geste utilisateur
      updateUI(true);
      return;
    }

    // fade
    const steps = 18;
    const stepMs = Math.max(20, Math.floor(durationMs / steps));
    let i = 0;

    const fade = setInterval(() => {
      i++;
      const t = i / steps;
      const vIn = BASE_VOL * t;
      const vOut = BASE_VOL * (1 - t);

      if (b) b.volume = vIn;
      if (cur) cur.volume = vOut;

      if (i >= steps) {
        clearInterval(fade);

        // swap
        try { cur.pause(); } catch {}
        a = b;
        b = null;

        // réapplique respiration si active
        if (breathState) applyBreathVolume();
        else if (a) a.volume = BASE_VOL;

        updateUI();
      }
    }, stepMs);
  }

  // -------------------------------
  // Respiration: volume qui "respire"
  // -------------------------------
  function startBreathing({ inhale = 4, exhale = 6, hold = 0 } = {}) {
    breathState = { inhale, exhale, hold, t0: performance.now() };

    if (breathTimer) clearInterval(breathTimer);
    breathTimer = setInterval(applyBreathVolume, 60);

    applyBreathVolume();
  }

  function stopBreathing() {
    breathState = null;
    if (breathTimer) clearInterval(breathTimer);
    breathTimer = null;

    // retourne au volume normal
    if (a && !a.paused) a.volume = BASE_VOL;
  }

  function applyBreathVolume() {
    if (!breathState) return;
    const audio = a;
    if (!audio || audio.paused) return;

    const { inhale, exhale, hold, t0 } = breathState;
    const cycle = inhale + hold + exhale + hold;
    const t = ((performance.now() - t0) / 1000) % cycle;

    let v;
    if (t < inhale) {
      // inspiration : monte
      const p = t / inhale;
      v = BREATH_MIN + (BREATH_MAX - BREATH_MIN) * p;
    } else if (t < inhale + hold) {
      // hold haut
      v = BREATH_MAX;
    } else if (t < inhale + hold + exhale) {
      // expiration : descend
      const p = (t - inhale - hold) / exhale;
      v = BREATH_MAX - (BREATH_MAX - BREATH_MIN) * p;
    } else {
      // hold bas
      v = BREATH_MIN;
    }

    audio.volume = Math.max(0, Math.min(1, v));
  }

  // -------------------------------
  // UI: bouton bas droite + auto-hide
  // -------------------------------
  let hideTimer = null;

  function scheduleAutoHide() {
    clearTimeout(hideTimer);
    const btn = document.getElementById("soundToggle");
    if (!btn) return;
    btn.style.opacity = "1";

    hideTimer = setTimeout(() => {
      btn.style.opacity = "0.35";
    }, 3000);
  }

  function buildUI() {
    const btn = document.createElement("button");
    btn.id = "soundToggle";
    btn.type = "button";

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
      await start(true);
      scheduleAutoHide();
    });

    document.body.appendChild(btn);

    // réveille l’opacité au toucher / scroll
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
      btn.textContent = "🔇 Son";
      return;
    }

    if (a && !a.paused) {
      btn.textContent = "🔊 Son";
    } else if (needTap || !startedOnce) {
      btn.textContent = "🔊 Activer";
    } else {
      btn.textContent = "🔊 Son";
    }
  }

  // ✅ API globale
  window.VivarioSound = {
    ensureStarted: async () => {
      if (!isOn()) setOn(true);
      return await start(true);
    },
    toggle,
    stop,
    setMood: async (mood) => {
      if (!mood || !TRACKS[mood]) mood = DEFAULT_MOOD;
      await crossfadeTo(mood, 900);
    },
    startBreathing,
    stopBreathing,
  };

  document.addEventListener("DOMContentLoaded", () => {
    buildUI();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && isOn()) {
      start(true);
    }
  });
})();