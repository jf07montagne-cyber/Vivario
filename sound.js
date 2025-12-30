/* Vivario — sound.js (v15 FINAL AUDIO FIX)
   ✅ Fallback multi-chemins (root/audio/assets/assets/audio)
   ✅ Si erreur de chargement -> switch auto vers autre chemin
   ✅ Bouton toujours fixed bas-droite (anti carré blanc)
   ✅ Unlock Android: WebAudio + play dans le handler
*/

(() => {
  const FILE_CANDIDATES = {
    calm:  ["ambiance.mp3", "audio/ambiance.mp3", "assets/ambiance.mp3", "assets/audio/ambiance.mp3"],
    ocean: ["ambiance_ocean.mp3", "audio/ambiance_ocean.mp3", "assets/ambiance_ocean.mp3", "assets/audio/ambiance_ocean.mp3"],
    focus: ["ambiance_focus.mp3", "audio/ambiance_focus.mp3", "assets/ambiance_focus.mp3", "assets/audio/ambiance_focus.mp3"],
    deep:  ["ambiance_deep.mp3", "audio/ambiance_deep.mp3", "assets/ambiance_deep.mp3", "assets/audio/ambiance_deep.mp3"],
    breath:["breath_cycle.mp3", "audio/breath_cycle.mp3", "assets/breath_cycle.mp3", "assets/audio/breath_cycle.mp3"]
  };

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
    tries: {}, // per key index
  });

  const toURL = (p) => new URL(p, location.href).href;

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
    ensureCtx();
    try{
      if (G.audioCtx && G.audioCtx.state === "suspended") await G.audioCtx.resume();
      if (G.audioCtx) {
        const buffer = G.audioCtx.createBuffer(1, 1, 22050);
        const src = G.audioCtx.createBufferSource();
        src.buffer = buffer;
        src.connect(G.audioCtx.destination);
        src.start(0);
      }
    }catch{}
    G.unlocked = true;
    return true;
  }

  function pickCandidate(key){
    const list = FILE_CANDIDATES[key] || [];
    const idx = (G.tries[key] ?? 0);
    return list[idx] || list[0] || null;
  }

  function bumpCandidate(key){
    const list = FILE_CANDIDATES[key] || [];
    const idx = (G.tries[key] ?? 0);
    const next = Math.min(idx + 1, Math.max(0, list.length - 1));
    G.tries[key] = next;
  }

  function resetCandidate(key){ G.tries[key] = 0; }

  function ensureAmbience(){
    if (G.ambienceAudio) return;
    G.ambienceAudio = new Audio();
    G.ambienceAudio.loop = true;
    G.ambienceAudio.volume = 0.18;
    G.ambienceAudio.preload = "auto";

    // si erreur => on change de chemin automatiquement
    G.ambienceAudio.addEventListener("error", () => {
      if (!G.ambienceOn) return;
      bumpCandidate(G.currentMood);
      const next = pickCandidate(G.currentMood);
      if (next) {
        G.ambienceAudio.src = toURL(next);
        try{ G.ambienceAudio.load(); }catch{}
        // tente de rejouer
        safePlay(G.ambienceAudio);
      }
    });
  }

  function ensureBreath(){
    if (G.breathAudio) return;
    G.breathAudio = new Audio();
    G.breathAudio.loop = true;
    G.breathAudio.volume = 0.35;
    G.breathAudio.preload = "auto";
  }

  async function safePlay(audio){
    try{
      if (!audio) return false;
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

  function getButton(){
    let btn = document.getElementById("ambienceToggle");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "ambienceToggle";
      btn.type = "button";
      btn.textContent = "🔇 Ambiance";
      document.body.appendChild(btn);
    }

    // ✅ style inline anti-carré-blanc / anti top-left
    btn.style.position = "fixed";
    btn.style.right = "14px";
    btn.style.bottom = "14px";
    btn.style.zIndex = "9999";
    btn.style.padding = "12px 16px";
    btn.style.borderRadius = "999px";
    btn.style.border = "1px solid rgba(255,255,255,.18)";
    btn.style.background = "rgba(255,255,255,.08)";
    btn.style.backdropFilter = "blur(10px)";
    btn.style.color = "#eaf1ff";
    btn.style.fontWeight = "700";
    btn.style.boxShadow = "0 10px 30px rgba(0,0,0,.25)";

    btn.setAttribute("aria-pressed", "false");
    return btn;
  }

  function setUI(on, btn){
    if (!btn) return;
    btn.textContent = on ? "🔊 Ambiance" : "🔇 Ambiance";
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.style.background = on ? "rgba(255,255,255,.14)" : "rgba(255,255,255,.08)";
  }

  async function applyMood(mood){
    G.currentMood = mood || "calm";
    localStorage.setItem(LS_MOOD, G.currentMood);

    ensureAmbience();
    resetCandidate(G.currentMood);

    const file = pickCandidate(G.currentMood);
    if (!file) return;

    const url = toURL(file);
    if (String(G.ambienceAudio.src || "") === url) return;

    const wasPlaying = G.ambienceOn && !G.ambienceAudio.paused;

    try{
      G.ambienceAudio.pause();
      G.ambienceAudio.src = url;
      G.ambienceAudio.load();
    }catch{}

    if (wasPlaying) await safePlay(G.ambienceAudio);
  }

  async function startAmbience(){
    await unlockAudioHard();
    ensureAmbience();

    G.ambienceOn = true;
    localStorage.setItem(LS_AMB_ON, "1");

    // ✅ si pas encore de src, on en met un
    if (!G.ambienceAudio.src) await applyMood(G.currentMood);

    let ok = await safePlay(G.ambienceAudio);

    // ✅ si échec (souvent 404) => on force fallback
    if (!ok) {
      for (let i = 0; i < 4 && !ok; i++){
        bumpCandidate(G.currentMood);
        const next = pickCandidate(G.currentMood);
        if (!next) break;
        G.ambienceAudio.src = toURL(next);
        try{ G.ambienceAudio.load(); }catch{}
        ok = await safePlay(G.ambienceAudio);
      }
    }

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
      const file = pickCandidate("breath");
      if (file) {
        G.breathAudio.src = toURL(file);
        try{ G.breathAudio.load(); }catch{}
      }
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

    if (btn.dataset.bound_v15 !== "1") {
      // ✅ play dans handler (Android aime ça)
      btn.addEventListener("click", async () => {
        await toggleAmbience(btn);
      });

      // ✅ unlock 1er tap n'importe où
      const unlockOnce = async () => {
        await unlockAudioHard();
        window.removeEventListener("pointerdown", unlockOnce, true);
        window.removeEventListener("touchstart", unlockOnce, true);
      };
      window.addEventListener("pointerdown", unlockOnce, true);
      window.addEventListener("touchstart", unlockOnce, true);

      btn.dataset.bound_v15 = "1";
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