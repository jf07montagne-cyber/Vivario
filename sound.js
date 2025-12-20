/* Vivario — sound.js (V3.0 FINAL CLEAN)
   - Son d’ambiance fiable mobile
   - Démarre uniquement après geste utilisateur
   - Bouton ON / OFF discret
   - AUCUN slider de volume
*/

(() => {
  const KEY_ON = "vivario_sound_on";
  const SRC = "./ambiance.mp3";

  let audio = null;
  let startedOnce = false;

  function isOn() {
    const v = localStorage.getItem(KEY_ON);
    return v === null ? true : v === "1";
  }

  function setOn(v) {
    localStorage.setItem(KEY_ON, v ? "1" : "0");
  }

  function ensureAudio() {
    if (audio) return audio;

    audio = new Audio(SRC);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0.6;
    audio.playsInline = true;

    return audio;
  }

  async function start(force = false) {
    if (!isOn() && !force) return false;

    const a = ensureAudio();

    try {
      await a.play();
      startedOnce = true;
      updateUI();
      return true;
    } catch {
      updateUI(true);
      return false;
    }
  }

  function stop() {
    if (!audio) return;
    try { audio.pause(); } catch {}
    updateUI();
  }

  async function toggle() {
    const next = !isOn();
    setOn(next);
    if (next) await start(true);
    else stop();
  }

  function buildUI() {
    const btn = document.createElement("button");
    btn.id = "soundToggle";
    btn.type = "button";

    btn.style.position = "fixed";
    btn.style.right = "14px";
    btn.style.top = "14px";
    btn.style.zIndex = "99999";
    btn.style.border = "1px solid rgba(255,255,255,.14)";
    btn.style.background = "rgba(20,25,35,.55)";
    btn.style.backdropFilter = "blur(10px)";
    btn.style.color = "#fff";
    btn.style.padding = "10px 14px";
    btn.style.borderRadius = "999px";
    btn.style.fontSize = "14px";
    btn.style.cursor = "pointer";
    btn.style.boxShadow = "0 10px 30px rgba(0,0,0,.25)";

    btn.addEventListener("click", async () => {
      await toggle();
      await start(true);
    });

    document.body.appendChild(btn);
    updateUI();
  }

  function updateUI(needTap = false) {
    const btn = document.getElementById("soundToggle");
    if (!btn) return;

    if (!isOn()) {
      btn.textContent = "🔇 Son OFF";
      return;
    }

    if (audio && !audio.paused) {
      btn.textContent = "🔊 Son ON";
    } else if (needTap || !startedOnce) {
      btn.textContent = "🔊 Activer le son";
    } else {
      btn.textContent = "🔊 Son ON";
    }
  }

  // API publique
  window.VivarioSound = {
    ensureStarted: async () => {
      if (!isOn()) setOn(true);
      return await start(true);
    },
    stop,
    toggle
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