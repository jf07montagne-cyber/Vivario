/* Vivario — sound.js (FINAL)
   ✅ Ne gère PAS l’ambiance (c’est ambiance.js)
   ✅ Fournit breathCue() : voix + tick + vibration synchronisés
   ✅ breath_cycle.mp3 (si tu veux un fond respiratoire)
   ✅ unlock robuste Android/iOS
*/
(() => {
  const LS_MOOD = "vivario_mood";

  const G = (window.__VIVARIO_SOUND__ ||= {
    audioCtx: null,
    unlocked: false,
    breathAudio: null,
    currentMood: localStorage.getItem(LS_MOOD) || "calm",
    lastSpokenSecond: -1
  });

  const A = () => (window.VivarioAmbience || window.VivarioAmbiance);

  function ensureCtx(){
    try{
      if (!G.audioCtx){
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) G.audioCtx = new Ctx();
      }
    }catch{}
  }

  async function unlock(){
    if (G.unlocked) return true;
    ensureCtx();
    try{
      if (G.audioCtx && G.audioCtx.state === "suspended") await G.audioCtx.resume();
      if (G.audioCtx){
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

  // ---------- mood -> track ----------
  function mapMoodToTrackName(mood){
    const m = String(mood || "calm").toLowerCase();
    if (m === "ocean") return "Océan";
    if (m === "focus") return "Focus";
    if (m === "deep")  return "Deep";
    return "Calme";
  }

  async function setMood(mood){
    G.currentMood = mood || "calm";
    localStorage.setItem(LS_MOOD, G.currentMood);
    try { A()?.setTrackByName?.(mapMoodToTrackName(G.currentMood)); } catch {}
  }

  async function toggleAmbience(){
    try { A()?.toggle?.(); } catch {}
  }

  // ---------- breath_cycle optional ----------
  function ensureBreathAudio(){
    if (G.breathAudio) return;
    G.breathAudio = new Audio();
    G.breathAudio.loop = true;
    G.breathAudio.preload = "auto";
    G.breathAudio.volume = 0.30;
    G.breathAudio.src = new URL("breath_cycle.mp3", location.href).href;
  }

  async function startBreathing(opts = {}){
    const { muteAmbienceWhileBreath = true, affectBreath = true } = opts;
    await unlock();

    if (muteAmbienceWhileBreath){
      try { A()?.muteForBreath?.(true); } catch {}
    }

    if (affectBreath){
      ensureBreathAudio();
      try { await G.breathAudio.play(); } catch {}
    }
  }

  function stopBreathing(){
    try { G.breathAudio?.pause?.(); } catch {}
    try { A()?.muteForBreath?.(false); } catch {}
  }

  // ---------- tick (petit "bip") ----------
  function beep(freq = 880, durMs = 40, vol = 0.06){
    ensureCtx();
    if (!G.audioCtx) return;
    try{
      const ctx = G.audioCtx;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = freq;
      g.gain.value = vol;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      setTimeout(() => { try{ o.stop(); }catch{} }, durMs);
    }catch{}
  }

  // ---------- speech ----------
  function speak(text){
    try{
      if (!("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel(); // important pour éviter chevauchement
      const u = new SpeechSynthesisUtterance(String(text));
      u.lang = "fr-FR";
      u.rate = 1.0;
      u.pitch = 1.0;
      window.speechSynthesis.speak(u);
    }catch{}
  }

  // stage cue (appelé par respiration.js)
  function breathCue({ stage, voice, coachSoft, vibrate, tick, countdown }){
    // tick
    if (tick) beep(880, 35, 0.06);

    // vibration
    if (vibrate && navigator.vibrate){
      try { navigator.vibrate(18); } catch {}
    }

    // voix
    if (!voice) return;

    const s = String(stage || "").toLowerCase();
    const soft = !!coachSoft;

    // si on nous donne un countdown => priorité au nombre
    if (typeof countdown === "number" && Number.isFinite(countdown)){
      // parle seulement une fois par seconde (anti spam)
      if (countdown === G.lastSpokenSecond) return;
      G.lastSpokenSecond = countdown;
      speak(String(countdown));
      return;
    }

    G.lastSpokenSecond = -1;

    let phrase = "";
    if (s.includes("inspire")) phrase = soft ? "Inspire… doucement." : "Inspire.";
    else if (s.includes("bloque")) phrase = soft ? "Garde l’air… encore un peu." : "Bloque.";
    else if (s.includes("expire")) phrase = soft ? "Expire… relâche." : "Expire.";
    else phrase = soft ? "On continue." : "Continue.";

    speak(phrase);
  }

  function initPage(){
    // sync mood -> track
    setMood(localStorage.getItem(LS_MOOD) || G.currentMood || "calm");

    const unlockOnce = async () => {
      await unlock();
      window.removeEventListener("pointerdown", unlockOnce, true);
      window.removeEventListener("touchstart", unlockOnce, true);
    };
    window.addEventListener("pointerdown", unlockOnce, true);
    window.addEventListener("touchstart", unlockOnce, true);
  }

  window.VivarioSound = {
    unlock,
    setMood,
    toggleAmbience,
    startBreathing,
    stopBreathing,
    breathCue
  };

  document.addEventListener("DOMContentLoaded", initPage);
  window.addEventListener("pageshow", initPage);
})();