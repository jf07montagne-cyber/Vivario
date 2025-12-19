/* Vivario — sound.js (v1.2 BOOST) : audio mobile fiable + toggle + boost volume (Gain) */
(() => {
  const KEY_ON  = "vivario_sound_on";
  const KEY_VOL = "vivario_sound_vol";

  // IMPORTANT : le fichier doit être à la racine et s'appeler EXACTEMENT comme ça
  const AUDIO_SRC = "./ambiance.mp3";

  // état
  let audioEl = null;
  let ctx = null;
  let sourceNode = null;
  let gainNode = null;

  let armed = false;     // en attente d’un geste utilisateur (mobile)
  let isPlaying = false;

  // --- helpers storage
  function getOn() {
    const v = localStorage.getItem(KEY_ON);
    return v === null ? true : v === "1"; // par défaut ON
  }
  function setOn(v) { localStorage.setItem(KEY_ON, v ? "1" : "0"); }

  function getVol() {
    const v = Number(localStorage.getItem(KEY_VOL));
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.6;
  }
  function setVol(v) { localStorage.setItem(KEY_VOL, String(v)); }

  // --- audio graph
  function ensureAudioEl() {
    if (audioEl) return audioEl;
    audioEl = document.createElement("audio");
    audioEl.src = AUDIO_SRC;
    audioEl.loop = true;
    audioEl.preload = "auto";
    audioEl.crossOrigin = "anonymous"; // safe (même en local)
    audioEl.playsInline = true;        // iOS/Android friendly
    document.body.appendChild(audioEl);
    audioEl.style.display = "none";
    return audioEl;
  }

  function ensureAudioContext() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;

    ctx = new AC();
    gainNode = ctx.createGain();

    // BOOST : si ton mp3 est quasi silencieux, on amplifie (2.8 = x2.8)
    // Tu peux monter jusqu’à 4.0 si besoin, mais attention à la saturation.
    const BOOST = 2.8;

    // volume utilisateur 0..1, multiplié par BOOST
    gainNode.gain.value = Math.max(0, Math.min(1, getVol())) * BOOST;
    gainNode.connect(ctx.destination);

    const el = ensureAudioEl();
    sourceNode = ctx.createMediaElementSource(el);
    sourceNode.connect(gainNode);

    return ctx;
  }

  function setGainFromVol() {
    if (!gainNode) return;
    const BOOST = 2.8;
    gainNode.gain.value = Math.max(0, Math.min(1, getVol())) * BOOST;
  }

  async function play() {
    if (!getOn()) return;

    const el = ensureAudioEl();
    const ac = ensureAudioContext();

    try {
      // mobile: il faut souvent reprendre le contexte au premier geste
      if (ac && ac.state === "suspended") await ac.resume();

      setGainFromVol();
      await el.play();
      isPlaying = true;
      armed = false;
      updateUI();
    } catch (e) {
      // autoplay bloqué => on attend un geste utilisateur
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

  // --- UI bouton (injecté si absent)
  function getBtn() { return document.getElementById("soundToggle"); }

  function ensureButton() {
    let btn = getBtn();
    if (btn) return btn;

    btn = document.createElement("button");
    btn.id = "soundToggle";
    btn.type = "button";
    btn.style.position = "fixed";
    btn.style.right = "14px";
    btn.style.top = "14px";
    btn.style.zIndex = "9999";
    btn.style.border = "1px solid rgba(255,255,255,.14)";
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

    btn.addEventListener("click", async () => {
      toggle();
      // si on vient d’allumer, on tente direct de démarrer
      if (getOn()) await play();
    });

    document.body.appendChild(btn);
    return btn;
  }

  function updateUI() {
    const btn = getBtn();
    if (!btn) return;

    const on = getOn();
    const icon = on ? "🔊" : "🔇";

    let label = "Son : OFF";
    if (on) {
      if (isPlaying) label = "Son : ON";
      else if (armed) label = "Touchez pour démarrer";
      else label = "Son : ON";
    }

    btn.textContent = `${icon} ${label}`;
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  // --- arm on first user gesture
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
    if (document.visibilityState === "visible" && getOn()) play();
  });

  // init
  document.addEventListener("DOMContentLoaded", () => {
    ensureButton();
    updateUI();

    // tente de jouer (si bloqué => “Touchez pour démarrer”)
    play();
    armOnFirstUserGesture();
  });
})();