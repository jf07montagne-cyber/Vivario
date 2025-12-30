// ambiance.js (robuste + compatible ui.js)
(() => {
  const KEY = "vivario:ambienceMuted"; // true = muté
  const TRACK_KEY = "vivario:ambienceTrack"; // optionnel si tu veux choisir une piste
  const DEFAULT_TRACK = "ambiance.mp3";

  let audio = null;
  let muted = (localStorage.getItem(KEY) === "true");

  function getTrack() {
    return localStorage.getItem(TRACK_KEY) || DEFAULT_TRACK;
  }

  function ensureAudio() {
    if (audio) return audio;
    audio = new Audio(getTrack());
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = muted ? 0 : 0.9;
    return audio;
  }

  async function safePlay() {
    try {
      const a = ensureAudio();
      // iOS/Android: play ne marche qu’après une interaction
      await a.play();
    } catch (e) {
      // silencieux: on attend un geste utilisateur
    }
  }

  function setMuted(nextMuted) {
    muted = !!nextMuted;
    localStorage.setItem(KEY, muted ? "true" : "false");
    const a = ensureAudio();
    a.volume = muted ? 0 : 0.9;
    if (!muted) safePlay();
  }

  function toggle() {
    setMuted(!muted);
    return muted;
  }

  function isMuted() {
    return muted;
  }

  // Re-sync si une autre page/onglet modifie l'état
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    muted = (localStorage.getItem(KEY) === "true");
    if (audio) audio.volume = muted ? 0 : 0.9;
    if (!muted) safePlay();
  });

  // Reprise si l’app revient au premier plan
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !muted) safePlay();
  });

  // Débloque le play dès le premier tap/click
  const unlock = () => {
    if (!muted) safePlay();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("touchstart", unlock);
    window.removeEventListener("mousedown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("touchstart", unlock, { once: true });
  window.addEventListener("mousedown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });

  // API pour ui.js
  window.setAmbienceMuted = setMuted;
  window.toggleAmbience = toggle;
  window.isAmbienceMuted = isMuted;

  // Auto-init
  ensureAudio();
  if (!muted) safePlay();
})();