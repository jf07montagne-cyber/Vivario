/* Vivario — sound.js (ULTRA FIABLE)
   - Audio mobile: démarre au 1er geste utilisateur (toujours)
   - Toggle ON/OFF persistant
   - Volume persistant
   - BOOST réglable x1 / x2 / x3 (utile si mp3 "quasi silencieux")
*/
(() => {
  const KEY_ON   = "vivario_sound_on";
  const KEY_VOL  = "vivario_sound_vol";
  const KEY_GAIN = "vivario_sound_gain";

  const AUDIO_SRC = "ambiance.mp3"; // à la racine

  let audioEl = null;
  let ctx = null;
  let srcNode = null;
  let gainNode = null;

  let armed = true;      // on exige un geste utilisateur pour être 100% fiable
  let isPlaying = false;

  // -------- prefs
  function getOn() {
    const v = localStorage.getItem(KEY_ON);
    return v === null ? true : v === "1";
  }
  function setOn(v) { localStorage.setItem(KEY_ON, v ? "1" : "0"); }

  function getVol() {
    const v = Number(localStorage.getItem(KEY_VOL));
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.8;
  }
  function setVol(v) { localStorage.setItem(KEY_VOL, String(v)); }

  // Boost par défaut x2 (car ton fichier est très faible)
  function getGain() {
    const v = Number(localStorage.getItem(KEY_GAIN));
    return Number.isFinite(v) ? Math.min(3, Math.max(1, v)) : 2;
  }
  function setGain(v) { localStorage.setItem(KEY_GAIN, String(v)); }

  // -------- audio init
  function ensureAudioEl() {
    if (audioEl) return audioEl;
    audioEl = new Audio(AUDIO_SRC);
    audioEl.loop = true;
    audioEl.preload = "auto";
    audioEl.volume = getVol();
    return audioEl;
  }

  function ensureWebAudio() {
    if (ctx) return;
    const el = ensureAudioEl();

    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return; // vieux navigateurs

    ctx = new AC();
    srcNode = ctx.createMediaElementSource(el);
    gainNode = ctx.createGain();
    gainNode.gain.value = getGain();

    srcNode.connect(gainNode);
    gainNode.connect(ctx.destination);
  }

  async function reallyStartPlayback() {
    if (!getOn()) return;
    const el = ensureAudioEl();
    ensureWebAudio();

    // resume contexte au geste utilisateur
    if (ctx && ctx.state === "suspended") {
      await ctx.resume();
    }

    await el.play();
    isPlaying = true;
    armed = false;
    updateUI();
  }

  function stopPlayback() {
    if (!audioEl) return;
    try { audioEl.pause(); } catch {}
    isPlaying = false;
    updateUI();
  }

  async function play() {
    // si pas encore “débloqué” par geste utilisateur : on attend
    if (armed) { updateUI(); return; }
    try { await reallyStartPlayback(); } catch { updateUI(); }
  }

  function toggle() {
    const next = !getOn();
    setOn(next);
    if (!next) stopPlayback();
    else play();
    updateUI();
  }

  // -------- UI
  function getBtn() { return document.getElementById("soundToggle"); }
  function getBoostBtn() { return document.getElementById("soundBoost"); }

  function ensureButtons() {
    // bouton principal
    let btn = getBtn();
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "soundToggle";
      btn.type = "button";
      btn.style.position = "fixed";
      btn.style.right = "14px";
      btn.style.bottom = "14px";
      btn.style.zIndex = "9999";
      btn.style.border = "1px solid rgba(255,255,255,.12)";
      btn.style.background = "rgba(20,25,35,.60)";
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
    }

    // bouton boost
    let b = getBoostBtn();
    if (!b) {
      b = document.createElement("button");
      b.id = "soundBoost";
      b.type = "button";
      b.style.position = "fixed";
      b.style.right = "14px";
      b.style.bottom = "58px";
      b.style.zIndex = "9999";
      b.style.border = "1px solid rgba(255,255,255,.12)";
      b.style.background = "rgba(20,25,35,.45)";
      b.style.backdropFilter = "blur(10px)";
      b.style.color = "#fff";
      b.style.padding = "10px 12px";
      b.style.borderRadius = "14px";
      b.style.fontSize = "13px";
      b.style.cursor = "pointer";
      b.style.boxShadow = "0 10px 30px rgba(0,0,0,.18)";

      b.addEventListener("click", () => {
        const g = getGain();
        const next = g === 1 ? 2 : (g === 2 ? 3 : 1);
        setGain(next);
        if (gainNode) gainNode.gain.value = next;
        updateUI();
      });

      document.body.appendChild(b);
    }
  }

  function updateUI() {
    const btn = getBtn();
    const b = getBoostBtn();
    if (!btn || !b) return;

    const on = getOn();
    const icon = on ? "🔊" : "🔇";

    let label = "";
    if (!on) label = "Son : OFF";
    else if (armed) label = "Touchez l’écran pour démarrer";
    else label = isPlaying ? "Son : ON" : "Son prêt";

    btn.textContent = `${icon} ${label}`;
    btn.setAttribute("aria-pressed", on ? "true" : "false");

    b.textContent = `🔁 Boost x${getGain()}`;
    b.style.display = on ? "block" : "none";
  }

  // -------- unlock au premier geste utilisateur (100% fiable)
  function unlockOnFirstGesture() {
    if (unlockOnFirstGesture._installed) return;
    unlockOnFirstGesture._installed = true;

    const handler = async () => {
      if (!getOn()) return;

      try {
        await reallyStartPlayback();
      } catch (e) {
        // si encore bloqué, on réessaiera au prochain geste
      }
    };

    // capture = true -> plus fiable sur mobile
    window.addEventListener("pointerdown", handler, true);
    window.addEventListener("touchstart", handler, true);
    window.addEventListener("keydown", handler, true);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      // on relance si déjà débloqué
      if (getOn() && !armed) play();
    }
  });

  document.addEventListener("DOMContentLoaded", () => {
    ensureAudioEl();
    ensureButtons();
    updateUI();
    unlockOnFirstGesture();

    // on n’essaie pas d’autoplay "agressif" -> on attend le premier geste (fiabilité)
    // mais si déjà débloqué (par exemple l’utilisateur a déjà touché sur une autre page),
    // on tente de jouer
    play();
  });
})();