/* Vivario — sound.js (V2.3 ULTRA FIABLE)
   - Démarre le son SEULEMENT après un geste utilisateur (obligatoire sur mobile)
   - Widget: bouton ON/OFF + volume slider
   - Persistance localStorage
   - API: window.VivarioSound.ensureStarted()
   - Debug: indique clairement si le fichier mp3 est introuvable / erreur audio
*/

(() => {
  const KEY_ON  = "vivario_sound_on";
  const KEY_VOL = "vivario_sound_vol";

  // ✅ IMPORTANT : fichier dans le même dossier que sound.js
  const SRC = "./ambiance.mp3";

  let audio = null;
  let startedOnce = false;
  let lastError = "";

  function getOn() {
    const v = localStorage.getItem(KEY_ON);
    return v === null ? true : v === "1";
  }
  function setOn(v) { localStorage.setItem(KEY_ON, v ? "1" : "0"); }

  function getVol() {
    const v = Number(localStorage.getItem(KEY_VOL));
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.55;
  }
  function setVol(v) { localStorage.setItem(KEY_VOL, String(v)); }

  function ensureAudio() {
    if (audio) return audio;

    audio = new Audio(SRC);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = getVol();
    audio.playsInline = true;

    // ✅ feedback erreurs
    audio.addEventListener("error", () => {
      // 4 = MEDIA_ERR_SRC_NOT_SUPPORTED (souvent mauvais mime ou fichier non accessible)
      lastError = "Erreur audio : fichier introuvable ou non supporté.";
      updateUI(true);
    });

    audio.addEventListener("playing", () => {
      lastError = "";
      updateUI();
    });

    audio.addEventListener("pause", () => updateUI());
    return audio;
  }

  function waitCanPlay(a, timeoutMs = 1500) {
    return new Promise((resolve) => {
      let done = false;

      const ok = () => {
        if (done) return;
        done = true;
        cleanup();
        resolve(true);
      };

      const ko = () => {
        if (done) return;
        done = true;
        cleanup();
        resolve(false);
      };

      const cleanup = () => {
        a.removeEventListener("canplay", ok);
        a.removeEventListener("canplaythrough", ok);
      };

      a.addEventListener("canplay", ok, { once: true });
      a.addEventListener("canplaythrough", ok, { once: true });

      // fallback timeout (on n'empêche pas play si canplay ne vient pas)
      setTimeout(ko, timeoutMs);
    });
  }

  async function start(force = false) {
    const on = getOn();
    if (!on && !force) return false;

    const a = ensureAudio();
    a.volume = getVol();

    try {
      // ✅ certains mobiles aiment bien un load() avant
      a.load();
      await waitCanPlay(a, 1200);

      await a.play();
      startedOnce = true;
      lastError = "";
      updateUI();
      return true;
    } catch (e) {
      // autoplay bloqué = normal si pas de geste utilisateur
      // ou erreur (mais on garde un message si c'est une vraie erreur)
      if (String(e?.name || "").toLowerCase().includes("notallowed")) {
        lastError = "";
      } else if (!lastError) {
        lastError = "Lecture bloquée ou erreur audio.";
      }
      updateUI(true);
      return false;
    }
  }

  function stop() {
    if (!audio) return;
    try { audio.pause(); } catch {}
    updateUI();
  }

  async function setEnabled(enabled) {
    setOn(enabled);
    if (!enabled) {
      stop();
      return;
    }
    await start(true);
    updateUI();
  }

  function buildUI() {
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

    // ✅ IMPORTANT : pas de double action
    btn.addEventListener("click", async () => {
      const next = !getOn();
      await setEnabled(next);
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

    slider.addEventListener("input", async () => {
      const v = Number(slider.value);
      setVol(v);
      if (audio) audio.volume = v;

      // si ON, on retente de démarrer (geste utilisateur)
      if (getOn()) await start(true);
      updateUI();
    });

    const msg = document.createElement("div");
    msg.id = "soundMsg";
    msg.style.fontSize = "12px";
    msg.style.opacity = "0.85";
    msg.style.color = "#fff";
    msg.style.textAlign = "right";
    msg.style.paddingRight = "6px";

    wrap.appendChild(btn);
    wrap.appendChild(slider);
    wrap.appendChild(msg);
    document.body.appendChild(wrap);

    updateUI();
  }

  function updateUI(needTap = false) {
    const btn = document.getElementById("soundToggle");
    const slider = document.getElementById("soundVol");
    const msg = document.getElementById("soundMsg");
    if (!btn || !slider || !msg) return;

    slider.value = String(getVol());

    const on = getOn();
    const isPlaying = audio && !audio.paused;

    let txt = "";
    if (!on) txt = "🔇 Son OFF";
    else if (isPlaying) txt = "🔊 Son ON";
    else if (needTap || !startedOnce) txt = "🔊 Touchez pour lancer";
    else txt = "🔊 Son ON";

    btn.textContent = txt;

    // message d'état discret
    if (lastError) msg.textContent = lastError;
    else msg.textContent = "";
  }

  // ✅ API globale
  window.VivarioSound = {
    ensureStarted: async () => {
      // Appelé après un geste utilisateur (ex: "Commencer")
      if (!getOn()) setOn(true);
      return await start(true);
    },
    stop: () => stop(),
    enable: async () => setEnabled(true),
    disable: async () => setEnabled(false),
    toggle: async () => setEnabled(!getOn()),
  };

  document.addEventListener("DOMContentLoaded", () => {
    buildUI();
    // pas d'autoplay ici (mobile)
  });

  document.addEventListener("visibilitychange", () => {
    // quand on revient, si ON on retente (pas bloquant)
    if (document.visibilityState === "visible" && getOn()) {
      start(true);
    }
  });
})();