/* Vivario — sound.js (V2.2 ULTRA FIABLE)
   - Démarre le son SEULEMENT après un geste utilisateur (obligatoire sur mobile)
   - Bouton ON/OFF + volume slider
   - Persistance localStorage
   - Fonction globale: window.VivarioSound.ensureStarted()
*/

(() => {
  const KEY_ON  = "vivario_sound_on";
  const KEY_VOL = "vivario_sound_vol";
  const SRC     = "./ambiance.mp3"; // fichier à la racine du dossier Vivario

  let audio = null;
  let startedOnce = false;

  function getOn() {
    const v = localStorage.getItem(KEY_ON);
    return v === null ? true : v === "1";
  }
  function setOn(v) { localStorage.setItem(KEY_ON, v ? "1" : "0"); }

  function getVol() {
    const v = Number(localStorage.getItem(KEY_VOL));
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.55; // volume par défaut + haut
  }
  function setVol(v) { localStorage.setItem(KEY_VOL, String(v)); }

  function ensureAudio() {
    if (audio) return audio;
    audio = new Audio(SRC);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = getVol();
    // iOS/Android friendliness
    audio.playsInline = true;
    return audio;
  }

  async function start(force = false) {
    const on = getOn();
    if (!on && !force) return false;

    const a = ensureAudio();
    a.volume = getVol();

    try {
      await a.play();
      startedOnce = true;
      updateUI();
      return true;
    } catch (e) {
      // autoplay bloqué = normal tant qu'il n'y a pas eu de geste utilisateur
      updateUI(true);
      return false;
    }
  }

  function stop() {
    if (!audio) return;
    try { audio.pause(); } catch {}
    updateUI();
  }

  function toggle() {
    const next = !getOn();
    setOn(next);
    if (next) start(true);
    else stop();
    updateUI();
  }

  function buildUI() {
    // bouton flottant
    const wrap = document.createElement("div");
    wrap.id = "soundWidget";
    wrap.style.position = "fixed";
    wrap.style.right = "14px";
    wrap.style.top = "14px";
    wrap.style.zIndex = "99999";
    wrap.style.display = "grid";
    wrap.style.gap = "8px";

    const btn = document.createElement("button");
    btn.id = "soundToggle";
    btn.type = "button";
    btn.style.border = "1px solid rgba(255,255,255,.14)";
    btn.style.background = "rgba(20,25,35,.55)";
    btn.style.backdropFilter = "blur(10px)";
    btn.style.color = "#fff";
    btn.style.padding = "10px 12px";
    btn.style.borderRadius = "999px";
    btn.style.fontSize = "14px";
    btn.style.cursor = "pointer";
    btn.style.boxShadow = "0 10px 30px rgba(0,0,0,.25)";
    btn.addEventListener("click", () => {
      // un click = geste utilisateur => tentative de play fiable
      toggle();
      start(true);
    });

    const slider = document.createElement("input");
    slider.id = "soundVol";
    slider.type = "range";
    slider.min = "0";
    slider.max = "1";
    slider.step = "0.01";
    slider.value = String(getVol());
    slider.style.width = "140px";
    slider.style.accentColor = "rgba(160,190,255,.95)";
    slider.style.background = "rgba(255,255,255,.12)";
    slider.style.borderRadius = "999px";

    slider.addEventListener("input", () => {
      const v = Number(slider.value);
      setVol(v);
      if (audio) audio.volume = v;
      // si l'utilisateur bouge le volume, on tente aussi de démarrer
      start(true);
      updateUI();
    });

    wrap.appendChild(btn);
    wrap.appendChild(slider);
    document.body.appendChild(wrap);

    updateUI();
  }

  function updateUI(needTap = false) {
    const btn = document.getElementById("soundToggle");
    const slider = document.getElementById("soundVol");
    if (!btn || !slider) return;

    slider.value = String(getVol());

    const on = getOn();
    const isPlaying = audio && !audio.paused;

    let txt = "";
    if (!on) txt = "🔇 Son OFF";
    else if (isPlaying) txt = "🔊 Son ON";
    else if (needTap || !startedOnce) txt = "🔊 Touchez pour lancer";
    else txt = "🔊 Son ON";

    btn.textContent = txt;
  }

  // 🔥 API globale pour démarrer depuis accueil (bouton Commencer)
  window.VivarioSound = {
    ensureStarted: async () => {
      // c'est appelé suite à un geste utilisateur => play devrait passer
      if (!getOn()) setOn(true);
      return await start(true);
    },
    stop: () => stop(),
    toggle: () => toggle(),
  };

  document.addEventListener("DOMContentLoaded", () => {
    buildUI();
    // On NE force PAS play ici (sinon mobile bloque)
    // On attend un geste utilisateur (commencer / bouton son / slider)
  });

  // Quand on revient sur l’onglet, si ON et déjà démarré, on retente.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && getOn()) {
      start(true);
    }
  });
})();