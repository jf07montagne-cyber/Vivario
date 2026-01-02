/* Vivario — sound.js (v18)
   ✅ Ne gère PAS l’ambiance (c’est ambiance.js)
   ✅ Fournit breathCue() : voix + tick + vibration synchronisés
   ✅ Voix plus douce + anti-coupure (stage + countdown)
   ✅ unlock robuste Android/iOS
*/
(() => {
  const LS_MOOD = "vivario_mood";

  const G = (window.__VIVARIO_SOUND__ ||= {
    audioCtx: null,
    unlocked: false,
    currentMood: localStorage.getItem(LS_MOOD) || "calm",
    lastSpokenSecond: -1,
    stageLockUntil: 0,     // évite que le décompte coupe la phrase "Inspire/Expire"
    voiceReady: false
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

  function beep(freq = 880, durMs = 40, vol = 0.055){
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

  function pickFrenchVoice(){
    try{
      if (!("speechSynthesis" in window)) return null;
      const voices = window.speechSynthesis.getVoices?.() || [];
      if (!voices.length) return null;

      // Priorité : fr-FR, voix douce (souvent Google/Android TTS)
      const fr = voices.filter(v => (v.lang || "").toLowerCase().startsWith("fr"));
      const prefer =
        fr.find(v => /female|femme/i.test(v.name)) ||
        fr.find(v => /google/i.test(v.name)) ||
        fr.find(v => /france|français|francais/i.test(v.name)) ||
        fr[0] ||
        voices[0];

      return prefer || null;
    }catch{
      return null;
    }
  }

  function speak(text, { interrupt = true } = {}){
    try{
      if (!("speechSynthesis" in window)) return;
      if (!text) return;

      // IMPORTANT : ne pas annuler les chiffres (sinon ça saute)
      if (interrupt) window.speechSynthesis.cancel();

      const u = new SpeechSynthesisUtterance(String(text));
      u.lang = "fr-FR";

      // voix plus douce
      u.rate  = 0.96;
      u.pitch = 1.08;
      u.volume = 1;

      const v = pickFrenchVoice();
      if (v) u.voice = v;

      window.speechSynthesis.speak(u);
    }catch{}
  }

  function breathCue({ stage, voice, coachSoft, vibrate, tick, countdown, isStageStart }){
    if (tick) beep(880, 35, 0.055);
    if (vibrate && navigator.vibrate){
      try { navigator.vibrate(16); } catch {}
    }
    if (!voice) return;

    const soft = !!coachSoft;
    const now = Date.now();

    // 1) annonce de phase (Inspire/Expire/Bloque)
    if (isStageStart && stage){
      const s = String(stage || "").toLowerCase();
      let phrase = "";

      if (s.includes("inspire")) phrase = soft ? "On inspire… doucement." : "Inspire.";
      else if (s.includes("bloque")) phrase = soft ? "On garde l’air… encore un peu." : "Bloque.";
      else if (s.includes("expire")) phrase = soft ? "On expire… relâche." : "Expire.";
      else phrase = soft ? "On continue." : "Continue.";

      // on bloque le décompte un court instant pour éviter qu'il coupe la phrase
      G.stageLockUntil = now + 700;
      G.lastSpokenSecond = -1;
      speak(phrase, { interrupt:true });
      return;
    }

    // 2) décompte (chiffres) — sans couper la synthèse
    if (typeof countdown === "number" && Number.isFinite(countdown)){
      if (now < (G.stageLockUntil || 0)) return; // évite la coupure
      if (countdown === G.lastSpokenSecond) return;
      G.lastSpokenSecond = countdown;
      speak(String(countdown), { interrupt:false });
      return;
    }
  }

  function initPage(){
    setMood(localStorage.getItem(LS_MOOD) || G.currentMood || "calm");

    const unlockOnce = async () => {
      await unlock();
      window.removeEventListener("pointerdown", unlockOnce, true);
      window.removeEventListener("touchstart", unlockOnce, true);
    };
    window.addEventListener("pointerdown", unlockOnce, true);
    window.addEventListener("touchstart", unlockOnce, true);

    // warm-up voix (certaines versions Android chargent les voix après coup)
    try{
      if ("speechSynthesis" in window){
        window.speechSynthesis.getVoices?.();
        window.speechSynthesis.onvoiceschanged = () => { G.voiceReady = true; };
      }
    }catch{}
  }

  window.VivarioSound = {
    unlock,
    setMood,
    toggleAmbience,
    breathCue
  };

  document.addEventListener("DOMContentLoaded", initPage);
  window.addEventListener("pageshow", initPage);
})();