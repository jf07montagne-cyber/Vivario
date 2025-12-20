/* Vivario — sound.js (V5.0 STABLE)
   - Bouton son bas droite + discret + auto-hide
   - Multi-ambiances (moods) + crossfade
   - Respiration: modulation volume + SFX inhale/exhale (breath_cycle.mp3)
   - Démarrage uniquement après geste utilisateur (mobile safe)
*/

(() => {
  const KEY_ON = "vivario_sound_on";

  // ✅ Chemins simples = ultra-stable sur GitHub Pages
  const TRACKS = {
    calm: "./ambiance.mp3",
    ocean: "./ambiance_ocean.mp3",
    focus: "./ambiance_focus.mp3",
    deep: "./ambiance_deep.mp3",
  };

  // SFX respiration (1 fichier court ou loop)
  const BREATH_SFX = "./breath_cycle.mp3";

  const DEFAULT_MOOD = "calm";

  // volumes
  const BASE_VOL = 0.60; // volume normal ambiance
  const BREATH_MIN = 0.22;
  const BREATH_MAX = 0.70;

  // crossfade
  const CROSSFADE_MS = 900;

  let a = null;            // ambiance active
  let b = null;            // ambiance crossfade
  let startedOnce = false;
  let currentMood = DEFAULT_MOOD;

  // respiration (volume)
  let breathTimer = null;
  let breathState = null;  // { inhale, exhale, hold, t0 }

  // respiration (SFX)
  let sfx = null;
  let sfxTimer = null;
  let sfxState = null;     // { inhale, exhale, hold, t0, offsetInhale, offsetExhale, vol }

  function isOn() {
    const v = localStorage.getItem(KEY_ON);
    return v === null ? true : v === "1";
  }
  function setOn(v) {
    localStorage.setItem(KEY_ON, v ? "1" : "0");
  }

  function makeAudio(src, { loop = true, volume = BASE_VOL } = {}) {
    const audio = new Audio(src);
    audio.loop = loop;
    audio.preload = "auto";
    audio.playsInline = true;
    audio.volume = volume;
    return audio;
  }

  function ensureAmbience() {
    if (a) return a;
    const src = TRACKS[currentMood] || TRACKS[DEFAULT_MOOD];
    a = makeAudio(src, { loop: true, volume: BASE_VOL });
    return a;
  }

  async function start(force = false) {
    if (!isOn() && !force) return false;

    const audio = ensureAmbience();
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
    if (a) {
      try { a.pause(); } catch {}
    }
    if (b) {
      try { b.pause(); } catch {}
      b = null;
    }
    stopBreathing();
    stopBreathSfx();
    updateUI();
  }

  async function toggle() {
    const next = !isOn();
    setOn(next);
    if (next) await start(true);
    else stop();
    updateUI();
  }

  // ✅ Crossfade entre ambiances
  async function crossfadeTo(nextMood, durationMs = CROSSFADE_MS) {
    currentMood = nextMood;

    // si OFF : on ne force pas
    if (!isOn()) {
      if (a) {
        try { a.pause(); } catch {}
        a = null;
      }
      updateUI();
      return;
    }

    const nextSrc = TRACKS[nextMood] || TRACKS[DEFAULT_MOOD];
    const cur = ensureAmbience();

    // déjà la même piste
    if (cur?.src && cur.src.includes(nextSrc)) {
      updateUI();
      return;
    }

    b = makeAudio(nextSrc, { loop: true, volume: 0 });

    try {
      await b.play();
      startedOnce = true;
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

      const vIn = BASE_VOL * t;
      const vOut = BASE_VOL * (1 - t);

      if (b) b.volume = vIn;
      if (cur) cur.volume = vOut;

      if (i >= steps) {
        clearInterval(fade);
        try { cur.pause(); } catch {}
        a = b;
        b = null;

        // réappliquer respiration volume si active
        if (breathState) applyBreathVolume();
        else if (a) a.volume = BASE_VOL;

        updateUI();
      }
    }, stepMs);
  }

  // -------------------------------
  // Respiration: volume "qui respire"
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

    if (a && !a.paused) a.volume = BASE_VOL;
  }

  function applyBreathVolume() {
    if (!breathState) return;
    if (!a || a.paused) return;

    const { inhale, exhale, hold, t0 } = breathState;
    const cycle = inhale + hold + exhale + hold;
    const t = ((performance.now() - t0) / 1000) % cycle;

    let v;
    if (t < inhale) {
      const p = t / inhale;
      v = BREATH_MIN + (BREATH_MAX - BREATH_MIN) * p;
    } else if (t < inhale + hold) {
      v = BREATH_MAX;
    } else if (t < inhale + hold + exhale) {
      const p = (t - inhale - hold) / exhale;
      v = BREATH_MAX - (BREATH_MAX - BREATH_MIN) * p;
    } else {
      v = BREATH_MIN;
    }

    a.volume = Math.max(0, Math.min(1, v));
  }

  // -------------------------------
  // Respiration: SFX inhale/exhale (breath_cycle.mp3)
  // -------------------------------
  function ensureSfx() {
    if (sfx) return sfx;
    sfx = makeAudio(BREATH_SFX, { loop: false, volume: 0.9 });
    return sfx;
  }

  function startBreathSfx({
    inhale = 4,
    exhale = 6,
    hold = 0,
    // offsets (en secondes) dans breath_cycle.mp3
    // -> inhale démarre à 0.0s, exhale démarre à 2.0s (à ajuster si besoin)
    offsetInhale = 0.0,
    offsetExhale = 2.0,
    vol = 0.9,
  } = {}) {
    sfxState = { inhale, exhale, hold, t0: performance.now(), offsetInhale, offsetExhale, vol };

    const audio = ensureSfx();
    audio.volume = vol;

    // cadence: on (re)joue le bon segment au bon moment
    if (sfxTimer) clearInterval(sfxTimer);
    sfxTimer = setInterval(tickBreathSfx, 80);

    // déclenche immédiatement inhale
    playSfxAt(offsetInhale, vol);
  }

  function stopBreathSfx() {
    sfxState = null;
    if (sfxTimer) clearInterval(sfxTimer);
    sfxTimer = null;

    if (sfx) {
      try { sfx.pause(); } catch {}
      try { sfx.currentTime = 0; } catch {}
    }
  }

  let lastPhase = null; // "inhale" | "exhale" | "hold_top" | "hold_bottom"
  function tickBreathSfx() {
    if (!sfxState) return;

    const { inhale, exhale, hold, t0, offsetInhale, offsetExhale, vol } = sfxState;
    const cycle = inhale + hold + exhale + hold;
    const t = ((performance.now() - t0) / 1000) % cycle;

    let phase;
    if (t < inhale) phase = "inhale";
    else if (t < inhale + hold) phase = "hold_top";
    else if (t < inhale + hold + exhale) phase = "exhale";
    else phase = "hold_bottom";

    if (phase !== lastPhase) {
      lastPhase = phase;
      if (phase === "inhale") playSfxAt(offsetInhale, vol);
      if (phase === "exhale") playSfxAt(offsetExhale, vol);
    }
  }

  function playSfxAt(sec, vol) {
    if (!isOn()) return;
    const audio = ensureSfx();
    audio.volume = vol;

    try {
      audio.pause();
      audio.currentTime = sec;
      audio.play().catch(() => {});
    } catch {}
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
      scheduleAutoHide();
    });

    document.body.appendChild(btn);

    ["pointerdown", "scroll"].forEach(ev => {
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
      await crossfadeTo(mood, CROSSFADE_MS);
    },
    // volume breathing
    startBreathing,
    stopBreathing,
    // SFX breathing
    startBreathSfx,
    stopBreathSfx,
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