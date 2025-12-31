/* Vivario — sound.js (v15 FIX)
   ✅ Si ambiance.js est présent => sound.js NE GÈRE PLUS l’ambiance (évite conflit bouton/sons)
   ✅ Délègue setMood/toggle à VivarioAmbience
   ✅ Respiration: muteForBreath via VivarioAmbience (au lieu de stop audio global)
   ✅ Garde l’unlock + breath_cycle
*/

(() => {
  const FILE_CANDIDATES = {
    breath:["breath_cycle.mp3", "audio/breath_cycle.mp3", "assets/breath_cycle.mp3", "assets/audio/breath_cycle.mp3"]
  };

  const LS_MOOD   = "vivario_mood";

  const G = (window.__VIVARIO_SOUND__ ||= {
    breathAudio: null,
    currentMood: localStorage.getItem(LS_MOOD) || "calm",
    audioCtx: null,
    unlocked: false,
    tries: {}
  });

  const hasAmbienceModule = () => !!(window.VivarioAmbience || window.VivarioAmbiance);

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

  // -------------------------
  // Ambiance delegation (IMPORTANT)
  // -------------------------
  function mapMoodToTrackName(mood){
    // adapte si tu veux
    const m = String(mood || "calm").toLowerCase();
    if (m === "ocean") return "Océan";
    if (m === "focus") return "Forêt";
    if (m === "deep")  return "Forêt";
    return "Calme";
  }

  async function setMood(mood){
    G.currentMood = mood || "calm";
    localStorage.setItem(LS_MOOD, G.currentMood);

    // si ambiance.js présent, on choisit juste le track
    if (hasAmbienceModule()){
      const A = window.VivarioAmbience || window.VivarioAmbiance;
      try{
        A?.setTrackByName?.(mapMoodToTrackName(G.currentMood));
      }catch{}
      return;
    }
  }

  async function toggleAmbience(){
    // Délégation complète
    if (hasAmbienceModule()){
      try{ (window.VivarioAmbience || window.VivarioAmbiance)?.toggle?.(); } catch {}
      return;
    }
  }

  // -------------------------
  // Respiration (breath_cycle)
  // -------------------------
  async function startBreathing(opts = {}){
    const { muteAmbienceWhileBreath = true, affectBreath = true } = opts;
    await unlockAudioHard();

    // ✅ mute ambiance via ambiance.js (au lieu de tout casser)
    if (muteAmbienceWhileBreath && hasAmbienceModule()){
      try{ (window.VivarioAmbience || window.VivarioAmbiance)?.muteForBreath?.(true); } catch {}
    }

    if (affectBreath) {
      ensureBreath();
      const file = pickCandidate("breath");
      if (file) {
        G.breathAudio.src = toURL(file);
        try{ G.breathAudio.load(); }catch{}
      }

      let ok = await safePlay(G.breathAudio);
      if (!ok){
        // fallback chemins
        for (let i=0; i<3 && !ok; i++){
          bumpCandidate("breath");
          const next = pickCandidate("breath");
          if (!next) break;
          G.breathAudio.src = toURL(next);
          try{ G.breathAudio.load(); }catch{}
          ok = await safePlay(G.breathAudio);
        }
      }
    }
  }

  function stopBreathing(){
    if (G.breathAudio) safePause(G.breathAudio);

    // restore ambiance
    if (hasAmbienceModule()){
      try{ (window.VivarioAmbience || window.VivarioAmbiance)?.muteForBreath?.(false); } catch {}
    }
  }

  function initPage(){
    // garde mood en sync (ambiance.js choisira le track)
    setMood(localStorage.getItem(LS_MOOD) || G.currentMood || "calm");

    // unlock 1er tap n'importe où
    const unlockOnce = async () => {
      await unlockAudioHard();
      window.removeEventListener("pointerdown", unlockOnce, true);
      window.removeEventListener("touchstart", unlockOnce, true);
    };
    window.addEventListener("pointerdown", unlockOnce, true);
    window.addEventListener("touchstart", unlockOnce, true);
  }

  window.VivarioSound = {
    setMood,
    toggleAmbience,
    startBreathing,
    stopBreathing,
    unlock: () => unlockAudioHard()
  };

  document.addEventListener("DOMContentLoaded", initPage);
  window.addEventListener("pageshow", initPage);
})();