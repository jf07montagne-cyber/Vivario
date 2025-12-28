/* Vivario — sound.js (v9)
   - Singleton: empêche les doublons UI + init multiple
   - Bouton Ambiance unique (réutilise un bouton existant si présent)
   - API: window.VivarioSound.setMood / toggleAmbience / startBreathing / stopBreathing
*/

(() => {
  // ✅ singleton global (évite double exécution si sound.js est inclus 2 fois)
  if (window.__VIVARIO_SOUND_V9__) return;
  window.__VIVARIO_SOUND_V9__ = true;

  const AMBIENCE_DEFAULT = "ambiance_mer_vent_doux.wav";
  const BREATH_DEFAULT = "breath_cycle.mp3";

  // Si tu as plusieurs ambiances par mood, mets-les ici.
  // Sinon, tout retombe sur AMBIENCE_DEFAULT.
  const MOOD_MAP = {
    calm: AMBIENCE_DEFAULT,
    ocean: AMBIENCE_DEFAULT,
    focus: AMBIENCE_DEFAULT,
    deep: AMBIENCE_DEFAULT
  };

  const LS_AMB_ON = "vivario_sound_on";
  const LS_MOOD = "vivario_mood";

  let ambienceAudio = null;
  let breathAudio = null;

  let ambienceOn = false;
  let currentMood = localStorage.getItem(LS_MOOD) || "calm";

  // Option: quand on fait l’exercice, couper l’ambiance
  let ambienceMutedByBreath = false;

  function ensureAmbience() {
    if (ambienceAudio) return;
    ambienceAudio = new Audio(MOOD_MAP[currentMood] || AMBIENCE_DEFAULT);
    ambienceAudio.loop = true;
    ambienceAudio.volume = 0.18;
  }

  function ensureBreath() {
    if (breathAudio) return;
    breathAudio = new Audio(BREATH_DEFAULT);
    breathAudio.loop = true;
    breathAudio.volume = 0.35;
  }

  async function safePlay(audio) {
    try {
      const p = audio.play();
      if (p && typeof p.then === "function") await p;
      return true;
    } catch (e) {
      return false;
    }
  }

  function safePause(audio) {
    try { audio.pause(); } catch {}
  }

  function setAmbienceUI(on, btn) {
    if (!btn) return;
    // texte simple + stable
    btn.textContent = on ? "🔊 Ambiance" : "🔇 Ambiance";
    btn.classList.toggle("is-on", !!on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function findOrCreateAmbienceButton() {
    // 1) Si un bouton existe déjà dans tes pages, on le réutilise
    //    (donc pas de doublon)
    let btn =
      document.getElementById("vivarioAmbienceBtn") ||
      document.querySelector(".ambience-toggle") ||
      document.querySelector("[data-ambience-toggle='1']");

    if (btn) {
      // Si c'est un lien <a>, on le transforme en bouton sans casser le style
      if (btn.tagName.toLowerCase() === "a") {
        btn.setAttribute("href", "javascript:void(0)");
        btn.setAttribute("role", "button");
      }
      btn.id = "vivarioAmbienceBtn";
      btn.classList.add("btn", "ghost", "ambience-toggle");
      btn.dataset.ambienceToggle = "1";
      return btn;
    }

    // 2) Sinon on crée un bouton flottant
    btn = document.createElement("button");
    btn.id = "vivarioAmbienceBtn";
    btn.className = "btn ghost ambience-toggle";
    btn.type = "button";
    btn.dataset.ambienceToggle = "1";

    // position fixed (si tu préfères dans ton HTML, garde juste la classe)
    btn.style.position = "fixed";
    btn.style.right = "14px";
    btn.style.bottom = "16px";
    btn.style.zIndex = "9999";
    btn.style.backdropFilter = "blur(8px)";
    btn.style.borderColor = "rgba(255,255,255,.14)";
    btn.style.background = "rgba(255,255,255,.06)";

    document.body.appendChild(btn);
    return btn;
  }

  async function applyMood(mood) {
    currentMood = mood || "calm";
    localStorage.setItem(LS_MOOD, currentMood);

    const nextFile = MOOD_MAP[currentMood] || AMBIENCE_DEFAULT;

    // si pas encore init, ok
    ensureAmbience();

    // si le fichier est identique, rien à faire
    if (ambienceAudio.src && ambienceAudio.src.includes(nextFile)) return;

    const wasPlaying = ambienceOn && !ambienceAudio.paused;

    // remplace la source proprement
    try {
      ambienceAudio.pause();
      ambienceAudio.src = nextFile;
      ambienceAudio.load();
    } catch {}

    // relance si besoin
    if (wasPlaying) {
      await safePlay(ambienceAudio);
    }
  }

  async function startAmbience() {
    ensureAmbience();
    ambienceOn = true;
    localStorage.setItem(LS_AMB_ON, "1");
    const ok = await safePlay(ambienceAudio);
    // si le navigateur bloque (pas de gesture), on repasse OFF
    if (!ok) {
      ambienceOn = false;
      localStorage.setItem(LS_AMB_ON, "0");
      safePause(ambienceAudio);
    }
    return ok;
  }

  function stopAmbience() {
    ensureAmbience();
    ambienceOn = false;
    localStorage.setItem(LS_AMB_ON, "0");
    safePause(ambienceAudio);
  }

  async function toggleAmbience(btnRef) {
    if (ambienceOn) stopAmbience();
    else await startAmbience();
    setAmbienceUI(ambienceOn, btnRef || document.getElementById("vivarioAmbienceBtn"));
  }

  // --- Breathing audio helpers (utilisé par respiration.js)
  async function startBreathing(opts = {}) {
    const {
      affectAmbience = false,
      affectBreath = true,
      muteAmbienceWhileBreath = true
    } = opts;

    if (muteAmbienceWhileBreath && ambienceOn) {
      ambienceMutedByBreath = true;
      stopAmbience();
    } else {
      ambienceMutedByBreath = false;
    }

    if (affectBreath) {
      ensureBreath();
      await safePlay(breathAudio);
    }

    if (affectAmbience && !ambienceOn) {
      // optionnel: relancer ambiance
      await startAmbience();
    }
  }

  function stopBreathing() {
    if (breathAudio) safePause(breathAudio);

    // si on a coupé l’ambiance pour la respiration → on la remet
    if (ambienceMutedByBreath) {
      ambienceMutedByBreath = false;
      // on ne relance pas automatiquement si l’utilisateur l’avait coupée
      // ici on relance car on l’avait coupée nous-même
      startAmbience().then(() => {
        const btn = document.getElementById("vivarioAmbienceBtn");
        setAmbienceUI(ambienceOn, btn);
      });
    }
  }

  // --- Init UI
  function init() {
    // état sauvegardé
    ambienceOn = localStorage.getItem(LS_AMB_ON) === "1";

    // applique mood sauvé
    applyMood(currentMood);

    // bouton unique
    const btn = findOrCreateAmbienceButton();
    setAmbienceUI(ambienceOn, btn);

    // bind unique (évite multiples listeners)
    if (!btn.dataset.bound) {
      btn.addEventListener("click", () => toggleAmbience(btn));
      btn.dataset.bound = "1";
    }

    // ne pas auto-play : le navigateur bloque souvent
    // mais si user avait déjà activé et que le navigateur autorise, on tente
    if (ambienceOn) {
      startAmbience().then(() => setAmbienceUI(ambienceOn, btn));
    }
  }

  // expose API
  window.VivarioSound = {
    setMood: (m) => applyMood(m),
    toggleAmbience: () => toggleAmbience(document.getElementById("vivarioAmbienceBtn")),
    startBreathing,
    stopBreathing,
    isAmbienceOn: () => ambienceOn
  };

  document.addEventListener("DOMContentLoaded", init);
})();