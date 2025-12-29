/* Vivario — sound.js (v14 UNLOCK HARD)
   ✅ Son OK dès la 1ère page (Android Chrome)
   - Débloque via WebAudio buffer silencieux (fiable)
   - Puis seulement lance les MP3
   - Bouton unique #ambienceToggle
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
    unlocked: false,
    unlockInFlight: false
  });

  const abs = (file) => new URL(file, location.href).href;

  function ensureCtx(){
    try{
      if (!G.audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) G.audioCtx = new Ctx();
      }
    }catch{}
  }

  async function unlockAudioHard(){
    if (G.unlocked) return true;
    if (G.unlockInFlight) return true;
    G.unlockInFlight = true;

    ensureCtx();

    try{
      if (G.audioCtx && G.audioCtx.state === "suspended") {
        await G.audioCtx.resume();
      }

      // Buffer silencieux 20ms
      if (G.audioCtx) {
        const buffer = G.audioCtx.createBuffer(1, 1, 22050);
        const src = G.audioCtx.createBufferSource();
        src.buffer = buffer;
        src.connect(G.audioCtx.destination);
        src.start(0);
      }
    } catch {}

    // On considère unlock OK (même si certains phones ignorent, on est sur geste utilisateur)
    G.unlocked = true;
    G.unlockInFlight = false;
    return true;
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
      try{ audio.load(); }catch{}
      const p = audio.play();
      if (p && typeof p.then === "function") await p;
      return true;
    } catch {
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
    let btn = document.getElementById("ambienceToggle") || document.querySelector(".ambience-toggle");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "ambienceToggle";
      btn.type = "button";
      btn.className = "btn ghost ambience-toggle";
      document.body.appendChild(btn);
    }
    btn.id = "ambienceToggle";
    btn.classList.add("btn", "ghost", "ambience-toggle");
    return btn;
  }

  async function applyMood(mood){
    G.currentMood = mood || "calm";
    localStorage.setItem(LS_MOOD, G.currentMood);

    ensureAmbience();

    const nextFile = abs(FILES[G.currentMood] || FILES.calm);
    if (String(G.ambienceAudio.src || "") === nextFile) return;

    const wasPlaying = G.ambienceOn && !G.ambienceAudio.paused;

    try{
      G.ambienceAudio.pause();
      G.ambienceAudio.src = nextFile;
      G.ambienceAudio.load();
    }catch{}

    if (wasPlaying) await safePlay(G.ambienceAudio);
  }

  async function startAmbience(){
    await unlockAudioHard();
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
    await unlockAudioHard();
    if (G.ambienceOn) stopAmbience();
    else await startAmbience();
    setUI(G.ambienceOn, btn);
  }

  async function startBreathing(opts = {}){
    const { muteAmbienceWhileBreath = true, affectBreath = true } = opts;
    await unlockAudioHard();

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

    if (btn.dataset.bound_v14 !== "1") {
      btn.addEventListener("click", async () => {
        await toggleAmbience(btn);
      });

      // ✅ unlock sur n'importe quel tap (1 fois)
      const unlockOnce = async () => {
        await unlockAudioHard();
        window.removeEventListener("pointerdown", unlockOnce, true);
        window.removeEventListener("touchstart", unlockOnce, true);
      };
      window.addEventListener("pointerdown", unlockOnce, true);
      window.addEventListener("touchstart", unlockOnce, true);

      btn.dataset.bound_v14 = "1";
    }
  }

  window.VivarioSound = {
    setMood: (m) => applyMood(m),
    toggleAmbience: () => toggleAmbience(document.getElementById("ambienceToggle")),
    startBreathing,
    stopBreathing,
    isAmbienceOn: () => G.ambienceOn,
    unlock: () => unlockAudioHard()
  };

  document.addEventListener("DOMContentLoaded", initPage);
  window.addEventListener("pageshow", initPage);
})();