/* Vivario — sound.js (FINAL v1.1)
   - Audio fiable mobile (autoplay -> arm on gesture)
   - Toggle persistant
   - BOOST léger via WebAudio (gain) pour les mp3 trop faibles
*/
(() => {
  const KEY_ON  = "vivario_sound_on";
  const KEY_VOL = "vivario_sound_vol";
  const KEY_GAIN = "vivario_sound_gain";

  const AUDIO_SRC = "ambiance.mp3"; // à la racine

  // état
  let audioEl = null;
  let ctx = null;
  let sourceNode = null;
  let gainNode = null;

  let armed = false;
  let isPlaying = false;

  function getOn() {
    const v = localStorage.getItem(KEY_ON);
    return v === null ? true : v === "1";
  }
  function setOn(v) { localStorage.setItem(KEY_ON, v ? "1" : "0"); }

  function getVol() {
    const v = Number(localStorage.getItem(KEY_VOL));
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.6;
  }
  function setVol(v) { localStorage.setItem(KEY_VOL, String(v)); }

  // Boost logiciel (1.0 = normal). On met 2.2 par défaut si mp3 faible.
  function getGain() {
    const v = Number(localStorage.getItem(KEY_GAIN));
    return Number.isFinite(v) ? Math.min(4, Math.max(0.5, v)) : 2.2;
  }
  function setGain(v) { localStorage.setItem(KEY_GAIN, String(v)); }

  function ensureAudioEl() {
    if (audioEl) return audioEl;
    audioEl = new Audio(AUDIO_SRC);
    audioEl.loop = true;
    audioEl.preload = "auto";
    audioEl.volume = getVol();
    return audioEl;
  }

  function ensureWebAudio() {
    // WebAudio = permet d’augmenter le niveau sonore (gain)
    if (ctx) return;

    const el = ensureAudioEl();
    ctx = new (window.AudioContext || window.webkitAudioContext)();

    sourceNode = ctx.createMediaElementSource(el);
    gainNode = ctx.createGain();
    gainNode.gain.value = getGain();

    sourceNode.connect(gainNode);
    gainNode.connect(ctx.destination);
  }

  async function play() {
    if (!getOn()) return;

    const el = ensureAudioEl();
    try {
      ensureWebAudio();

      // Sur mobile : parfois le contexte est "suspended" tant qu'il n'y a pas de geste
      if (ctx && ctx.state === "suspended") {
        await ctx.resume();
      }

      await el.play();
      isPlaying = true;
      armed = false;
      updateUI();
    } catch (e) {
      armed = true;
      isPlaying = false;
      updateUI();
    }
  }

  function pause() {
    if (!audioEl) return;
    try { audioEl.pause(); } catch {}
    isPlaying = false;
    updateUI();
  }

  function toggle() {
    const next = !getOn();
    setOn(next);
    if (next) play();
    else pause();
    updateUI();
  }

  function getBtn() { return document.getElementById("soundToggle"); }

  function ensureButton() {
    let btn = getBtn();
    if (btn) return btn;

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
    const label = !on
      ? "Son : OFF"
      : (isPlaying ? "Son : ON" : (armed ? "Touchez l’écran pour démarrer" : "Son : ON"));

    btn.textContent = `${icon} ${label}`;
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function armOnFirstUserGesture() {
    if (armOnFirstUserGesture._installed) return;
    armOnFirstUserGesture._installed = true;

    const handler = async () => {
      if (!getOn()) return;
      await play();
      window.removeEventListener("pointerdown", handler, true);
      window.removeEventListener("touchstart", handler, true);
      window.removeEventListener("keydown", handler, true);
    };

    window.addEventListener("pointerdown", handler, true);
    window.addEventListener("touchstart", handler, true);
    window.addEventListener("keydown", handler, true);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      if (getOn()) play();
    }
  });

  document.addEventListener("DOMContentLoaded", () => {
    ensureButton();
    updateUI();
    play();
    armOnFirstUserGesture();
  });
})();