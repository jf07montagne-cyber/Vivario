/* Vivario — sound.js (v1.1+) : audio fiable mobile + toggle + persistance */
(() => {
  const KEY_ON = "vivario_sound_on";
  const KEY_VOL = "vivario_sound_vol";
  const AUDIO_SRC = "ambiance.mp3"; // placé à la racine du site

  // état
  let audio = null;
  let armed = false;       // on attend un geste utilisateur
  let isPlaying = false;

  function getOn() {
    const v = localStorage.getItem(KEY_ON);
    // par défaut ON
    return v === null ? true : v === "1";
  }
  function setOn(v) {
    localStorage.setItem(KEY_ON, v ? "1" : "0");
  }

  function getVol() {
    const v = Number(localStorage.getItem(KEY_VOL));
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.35;
  }
  function setVol(v) {
    localStorage.setItem(KEY_VOL, String(v));
  }

  function ensureAudio() {
    if (audio) return audio;
    audio = new Audio(AUDIO_SRC);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = getVol();
    return audio;
  }

  async function play() {
    if (!getOn()) return;
    const a = ensureAudio();
    try {
      await a.play();
      isPlaying = true;
      updateUI();
    } catch (e) {
      // autoplay bloqué -> on reste "armé"
      armed = true;
      updateUI();
    }
  }

  function pause() {
    if (!audio) return;
    try { audio.pause(); } catch {}
    isPlaying = false;
    updateUI();
  }

  function toggle() {
    const next = !getOn();
    setOn(next);
    if (next) {
      play(); // tente de relancer
    } else {
      pause();
    }
    updateUI();
  }

  // UI : si un bouton existe, on l’utilise, sinon on injecte un petit bouton flottant
  function getBtn() {
    return document.getElementById("soundToggle");
  }

  function ensureButton() {
    let btn = getBtn();
    if (btn) {
      btn.addEventListener("click", toggle);
      return btn;
    }

    btn = document.createElement("button");
    btn.id = "soundToggle";
    btn.type = "button";
    btn.style.position = "fixed";
    btn.style.right = "14px";
    btn.style.bottom = "14px";
    btn.style.zIndex = "9999";
    btn.style.border = "1px solid rgba(255,255,255,.12)";
    btn.style.background = "rgba(20,25,35,.55)";
    btn.style.backdropFilter = "blur(10px)";
    btn.style.color = "#fff";
    btn.style.padding = "10px 12px";
    btn.style.borderRadius = "14px";
    btn.style.fontSize = "14px";
    btn.style.display = "flex";
    btn.style.alignItems = "center";
    btn.style.gap = "8px";
    btn.style.cursor = "pointer";
    btn.style.boxShadow = "0 10px 30px rgba(0,0,0,.25)";

    btn.addEventListener("click", toggle);
    document.body.appendChild(btn);
    return btn;
  }

  function updateUI() {
    const btn = getBtn();
    if (!btn) return;

    const on = getOn();
    const icon = on ? "🔊" : "🔇";
    const label = on
      ? (isPlaying ? "Son : ON" : (armed ? "Touchez pour démarrer" : "Son : ON"))
      : "Son : OFF";

    btn.textContent = `${icon} ${label}`;
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  // Démarrage fiable : on tente play, sinon on attend le premier geste utilisateur
  function armOnFirstUserGesture() {
    if (armOnFirstUserGesture._installed) return;
    armOnFirstUserGesture._installed = true;

    const handler = async () => {
      if (!getOn()) return;
      await play();
      armed = false;
      updateUI();

      window.removeEventListener("pointerdown", handler, true);
      window.removeEventListener("touchstart", handler, true);
      window.removeEventListener("click", handler, true);     // ✅ ajout
      window.removeEventListener("keydown", handler, true);
    };

    window.addEventListener("pointerdown", handler, true);
    window.addEventListener("touchstart", handler, true);
    window.addEventListener("click", handler, true);          // ✅ ajout
    window.addEventListener("keydown", handler, true);
  }

  // Si l’onglet revient visible, on relance si ON
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      if (getOn()) play();
    }
  });

  // init
  document.addEventListener("DOMContentLoaded", () => {
    ensureButton();
    updateUI();

    // tente de jouer (si bloqué → armé)
    play();
    armOnFirstUserGesture();
  });
})();