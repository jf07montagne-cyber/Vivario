/* Vivario — sound.js (V6.2 TEST6)
   - OFF par défaut
   - Multi-ambiances + crossfade
   - Respiration: breath_cycle.mp3 (sfx) (indépendant de l’ambiance)
   - ✅ FIX questionnaire: ensureStarted() + play sécurisé au clic
*/

(() => {
  const KEY_ON = "vivario_sound_on";
  const KEY_MOOD = "vivario_sound_mood";

  // Base robuste (GitHub Pages / sous-dossier OK)
  const BASE = new URL(".", document.currentScript?.src || window.location.href);

  const TRACKS = {
    calm:  new URL("ambiance.mp3", BASE).href,
    ocean: new URL("ambiance_ocean.mp3", BASE).href,
    focus: new URL("ambiance_focus.mp3", BASE).href,
    deep:  new URL("ambiance_deep.mp3", BASE).href,
  };

  const BREATH_TRACK = new URL("breath_cycle.mp3", BASE).href;

  const DEFAULT_MOOD = "calm";
  const BASE_VOL = 0.60;

  // respiration modulation (ambiance)
  const BREATH_MIN = 0.25;
  const BREATH_MAX = 0.70;

  // volume respiration
  const BREATH_SFX_VOL = 0.90;

  let a = null;         // ambiance active
  let b = null;         // ambiance crossfade
  let breathSfx = null; // respiration
  let startedOnce = false;

  let currentMood = (localStorage.getItem(KEY_MOOD) || DEFAULT_MOOD);
  if (!TRACKS[currentMood]) currentMood = DEFAULT_MOOD;

  let breathTimer = null;
  let breathState = null;
  let ambienceWasPlayingBeforeBreath = false;

  // ✅ unlock helper (iOS/Safari/Chrome strict)
  async function ensureStarted(){
    // on essaye de jouer/pause un son très brièvement (sans changer ON/OFF)
    try{
      const audio = ensureAudio();
      audio.muted = true;
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
      startedOnce = true;
      updateUI();
      return true;
    }catch{
      // pas grave : le vrai clic toggle fera un play
      return false;
    }
  }

  function isOn() {
    return localStorage.getItem(KEY_ON) === "1";
  }
  function setOn(v) {
    localStorage.setItem(KEY_ON, v ? "1" : "0");
  }
  function setMoodKey(m) {
    localStorage.setItem(KEY_MOOD, m);
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
      // ✅ sécurité : certains navigateurs exigent un geste => on tente quand même
      await audio.play();
      startedOnce = true;
      updateUI();
      return true;
    } catch {
      updateUI(true);
      return false;
    }
  }

  function stopAmbience() {
    if (a) { try { a.pause(); } catch {} }
    if (b) { try { b.pause(); } catch {} }
    updateUI();
  }

  async function toggle() {
    const next = !isOn();
    setOn(next);

    if (next) {
      // ✅ FIX : s’assurer qu’on a bien “débloqué” l’audio
      await ensureStarted();
      await startAmbience(true);
    } else {
      stopAmbience();
    }

    updateUI();
  }

  async function crossfadeTo(nextMood, durationMs = 900) {
    if (!nextMood || !TRACKS[nextMood]) nextMood = DEFAULT_MOOD;
    currentMood = nextMood;
    setMoodKey(nextMood);

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
      await ensureStarted();
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
    breathState = {
      inhale, exhale, hold,
      t0: performance.now(),
      affectAmbience,
      affectBreath,
      muteAmbienceWhileBreath
    };

    if (muteAmbienceWhileBreath) {
      ambienceWasPlayingBeforeBreath = !!(a && !a.paused);
      if (a && !a.paused) { try { a.pause(); } catch {} }
      if (b && !b.paused) { try { b.pause(); } catch {} }
    } else {
      if (affectAmbience && isOn()) await startAmbience(true);
    }

    if (affectBreath) {
      if (!breathSfx) breathSfx = makeBreathAudio();
      try {
        await ensureStarted();
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

    if (breathSfx) {
      try { breathSfx.pause(); } catch {}
      try { breathSfx.currentTime = 0; } catch {}
    }

    if (ambienceWasPlayingBeforeBreath && isOn()) {
      startAmbience(true);
    }

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
  // UI bouton flottant
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
    if (document.getElementById("soundToggle")) return;

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

    if (a && !a.paused) btn.textContent = "🔊 Ambiance";
    else if (needTap || !startedOnce) btn.textContent = "🔊 Activer";
    else btn.textContent = "🔊 Ambiance";
  }

  // API globale
  window.VivarioSound = {
    isOn,
    setOn,
    toggle,
    stopAmbience,
    ensureStarted,
    setMood: async (mood) => {
      await crossfadeTo(mood, 900);
    },
    startBreathing,
    stopBreathing,
    startAmbience: async () => startAmbience(true),
  };

  document.addEventListener("DOMContentLoaded", () => {
    buildUI();

    // ✅ unlock automatique au premier geste (utile surtout questionnaire)
    const unlockOnce = async () => {
      window.removeEventListener("pointerdown", unlockOnce);
      window.removeEventListener("touchstart", unlockOnce);
      await ensureStarted();
      if (isOn()) await startAmbience(true);
    };
    window.addEventListener("pointerdown", unlockOnce, { passive: true });
    window.addEventListener("touchstart", unlockOnce, { passive: true });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && isOn()) {
      startAmbience(true);
    }
  });
})();