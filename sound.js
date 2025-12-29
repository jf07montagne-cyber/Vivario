/* Vivario — sound.js (v13 HARD FIX)
   ✅ Déblocage audio Android (AudioContext.resume + unlock sur click)
   ✅ URLs absolues (évite 404 silencieux sur GitHub Pages)
   ✅ Bouton unique (réutilise #ambienceToggle si présent, sinon le crée)
   ✅ Pas d'autoplay au chargement (zéro freeze)
*/

(() => {
  const FILES = {
    calm:  "ambiance.mp3",
    ocean: "ambiance_ocean.mp3",
    focus: "ambiance_focus.mp3",
    deep:  "ambiance_deep.mp3"
  };
  const BREATH_DEFAULT = "breath_cycle.mp3";

  const LS_AMB_ON = "vivario_sound_on";
  const LS_MOOD   = "vivario_mood";

  const G = (window.__VIVARIO_SOUND__ ||= {
    ambienceAudio: null,
    breathAudio: null,
    ambienceOn: false,
    currentMood: localStorage.getItem(LS_MOOD) || "calm",
    ambienceMutedByBreath: false,
    audioCtx: null,
    unlocked: false
  });

  function abs(file){
    return new URL(file, location.href).href;
  }

  function ensureAudioContext(){
    try{
      if (!G.audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) G.audioCtx = new Ctx();
      }
    }catch{}
  }

  async function unlockAudio(){
    if (G.unlocked) return true;
    ensureAudioContext();

    try{
      if (G.audioCtx && G.audioCtx.state === "suspended") {
        await G.audioCtx.resume();
      }
    }catch{}

    // “Silent play” trick
    try{
      const a = new Audio();
      a.src = abs(FILES.calm);
      a.volume = 0.0001;
      a.loop = false;
      a.preload = "auto";
      await a.play();
      a.pause();
      G.unlocked = true;
      return true;
    } catch {
      // Même si ça échoue, on tentera play() au click
      G.unlocked = true;
      return false;
    }
  }

  function ensureAmbience(){
    if (G.ambienceAudio) return;
    G.ambienceAudio = new Audio(abs(FILES[G.currentMood] || FILES.calm));
    G.ambienceAudio.loop = true;
    G.ambienceAudio.volume = 0.18;
    G.ambienceAudio.preload = "auto";
  }

  function ensureBreath(){
    if (G.breathAudio) return;
    G.breathAudio = new Audio(abs(BREATH_DEFAULT));
    G.breathAudio.loop = true;
    G.breathAudio.volume = 0.35;
    G.breathAudio.preload = "auto";
  }

  async function safePlay(audio){
    try{
      if (!audio) return false;
      // Force load (évite certains Android)
      try { audio.load(); } catch {}
      const p = audio.play();
      if (p && typeof p.then === "function") await p;
      return true;
    }catch{
      return false;
    }
  }

  function safePause(audio){
    try{ audio.pause(); }catch{}
  }

  function setUI(on, btn){
    if (!btn) return;
    btn.textContent = on ? "🔊 Ambiance" : "🔇 Ambiance";
    btn.classList.toggle("is-on", !!on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function getButton(){
    // On privilégie ton bouton HTML si tu l’as mis
    let btn =
      document.getElementById("ambienceToggle") ||
      document.getElementById("vivarioAmbienceBtn") ||
      document.querySelector(".ambience-toggle");

    if (!btn) {
      btn = document.createElement("button");
      btn.id = "ambienceToggle";
      btn.type = "button";
      btn.className = "btn ghost ambience-toggle";
      document.body.appendChild(btn);
    }

    btn.id = "ambienceToggle";
    btn.classList.add("btn", "ghost", "ambience-toggle");
    btn.dataset.ambienceToggle = "1";
    return btn;
  }

  async function applyMood(mood){
    G.currentMood = mood || "calm";
    localStorage.setItem(LS_MOOD, G.currentMood);

    ensureAmbience();

    const nextFile = abs(FILES[G.currentMood] || FILES.calm);
    const src = String(G.ambienceAudio.src || "");
    if (src === nextFile) return;

    const wasPlaying = G.ambienceOn && !G.ambienceAudio.paused;

    try{
      G.ambienceAudio.pause();
      G.ambienceAudio.src = nextFile;
      G.ambienceAudio.load();
    }catch{}

    if (wasPlaying) await safePlay(G.ambienceAudio);
  }

  async function startAmbience(){
    await unlockAudio();
    ensureAmbience();

    G.ambienceOn = true;
    localStorage.setItem(LS_AMB_ON, "1");

    const ok = await safePlay(G.ambienceAudio);
    if (!ok) {
      G.ambienceOn = false;
      localStorage.setItem(LS_AMB_ON, "0");
      safePause(G.ambienceAudio);
    }
    return ok;
  }

  function stopAmbience(){
    ensureAmbience();
    G.ambienceOn = false;
    localStorage.setItem(LS_AMB_ON, "0");
    safePause(G.ambienceAudio);
  }

  async function toggleAmbience(btn){
    await unlockAudio();
    if (G.ambienceOn) stopAmbience();
    else await startAmbience();
    setUI(G.ambienceOn, btn);
  }

  async function startBreathing(opts = {}){
    const { muteAmbienceWhileBreath = true, affectBreath = true } = opts;

    await unlockAudio();

    if (muteAmbienceWhileBreath && G.ambienceOn) {
      G.ambienceMutedByBreath = true;
      stopAmbience();
    } else {
      G.ambienceMutedByBreath = false;
    }

    if (affectBreath) {
      ensureBreath();
      await safePlay(G.breathAudio);
    }
  }

  function stopBreathing(){
    if (G.breathAudio) safePause(G.breathAudio);

    if (G.ambienceMutedByBreath) {
      G.ambienceMutedByBreath = false;
      startAmbience().then(() => {
        const btn = document.getElementById("ambienceToggle");
        setUI(G.ambienceOn, btn);
      });
    }
  }

  function initPage(){
    G.ambienceOn = localStorage.getItem(LS_AMB_ON) === "1";
    G.currentMood = localStorage.getItem(LS_MOOD) || G.currentMood || "calm";

    applyMood(G.currentMood);

    const btn = getButton();
    setUI(G.ambienceOn, btn);

    if (btn.dataset.bound_v13 !== "1") {
      btn.addEventListener("click", async () => {
        await toggleAmbience(btn);
      });
      // unlock aussi sur 1er touch/click n’importe où
      const unlockOnce = async () => {
        await unlockAudio();
        window.removeEventListener("pointerdown", unlockOnce, { passive: true });
        window.removeEventListener("touchstart", unlockOnce, { passive: true });
      };
      window.addEventListener("pointerdown", unlockOnce, { passive: true });
      window.addEventListener("touchstart", unlockOnce, { passive: true });

      btn.dataset.bound_v13 = "1";
    }
  }

  window.VivarioSound = {
    setMood: (m) => applyMood(m),
    toggleAmbience: () => toggleAmbience(document.getElementById("ambienceToggle")),
    startBreathing,
    stopBreathing,
    isAmbienceOn: () => G.ambienceOn
  };

  document.addEventListener("DOMContentLoaded", initPage);
  window.addEventListener("pageshow", initPage);
})();