/* Vivario — sound.js (v18)
   ✅ Ambiance gérée par ambiance.js
   ✅ breathCue() : voix + tick + vibration synchronisés
   ✅ voix + queue : moins de retard / moins de coupures
*/
(() => {
  const LS_MOOD = "vivario_mood";

  const G = (window.__VIVARIO_SOUND__ ||= {
    audioCtx: null,
    unlocked: false,
    currentMood: localStorage.getItem(LS_MOOD) || "calm",
    lastSpokenSecond: null,
    lastStage: "",
    voices: [],
    voicesReady: false
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

  function refreshVoices(){
    try{
      if (!("speechSynthesis" in window)) return;
      const list = window.speechSynthesis.getVoices?.() || [];
      if (list && list.length){
        G.voices = list;
        G.voicesReady = true;
      }
    }catch{}
  }

  function pickFrenchVoice(){
    const voices = G.voices || [];
    if (!voices.length) return null;

    // priorité fr-FR
    let v = voices.find(x => String(x.lang||"").toLowerCase().startsWith("fr-fr"));
    if (v) return v;

    // sinon fr-*
    v = voices.find(x => String(x.lang||"").toLowerCase().startsWith("fr"));
    if (v) return v;

    return null;
  }

  function softSpeak(text, { soft=true, forceCancel=false } = {}){
    try{
      if (!("speechSynthesis" in window)) return;

      // évite la "queue infinie"
      const q = window.speechSynthesis;
      if (forceCancel) q.cancel();
      // si trop de choses en attente => on purge
      // (sinon ça crée du retard sur Android)
      // @ts-ignore
      const pending = q.pending || q.speaking;
      // on ne peut pas lire la longueur de queue partout, donc on purge si speaking + on relance
      if (!forceCancel && pending && String(text).length > 0){
        // on ne cancel pas systématiquement, mais si on voit que ça "s'accumule"
        // on laisse passer (respiration.js est déjà calé)
      }

      const u = new SpeechSynthesisUtterance(String(text));
      u.lang = "fr-FR";

      const v = pickFrenchVoice();
      if (v) u.voice = v;

      // ton plus doux
      u.rate  = soft ? 0.95 : 1.0;
      u.pitch = soft ? 1.07 : 1.0;
      u.volume = 1;

      q.speak(u);
    }catch{}
  }

  function breathCue({ stage, voice, coachSoft, vibrate, tick, countdown, announce }){
    if (tick) beep(880, 35, 0.06);

    if (vibrate && navigator.vibrate){
      try { navigator.vibrate(18); } catch {}
    }

    if (!voice) return;

    const soft = !!coachSoft;

    // Décompte
    if (typeof countdown === "number" && Number.isFinite(countdown)){
      if (G.lastSpokenSecond === countdown) return;
      G.lastSpokenSecond = countdown;
      softSpeak(String(countdown), { soft:true, forceCancel:false });
      return;
    }

    G.lastSpokenSecond = null;

    const s = String(stage || "").toLowerCase();

    // annonce de phase (on évite de la répéter inutilement)
    const stageKey = (announce ? "announce:" : "stage:") + s;
    if (G.lastStage === stageKey) return;
    G.lastStage = stageKey;

    let phrase = "";
    if (s.includes("inspire")) phrase = soft ? "Inspire… doucement." : "Inspire.";
    else if (s.includes("bloque") || s.includes("pause")) phrase = soft ? "Garde l’air… encore un instant." : "Pause.";
    else if (s.includes("expire")) phrase = soft ? "Expire… relâche." : "Expire.";
    else phrase = soft ? "On continue… tranquillement." : "Continue.";

    // On cancel seulement sur changement de phase (pour éviter la superposition)
    softSpeak(phrase, { soft:true, forceCancel:true });
  }

  function initPage(){
    refreshVoices();
    setMood(localStorage.getItem(LS_MOOD) || G.currentMood || "calm");

    const unlockOnce = async () => {
      await unlock();
      refreshVoices();
      window.removeEventListener("pointerdown", unlockOnce, true);
      window.removeEventListener("touchstart", unlockOnce, true);
    };
    window.addEventListener("pointerdown", unlockOnce, true);
    window.addEventListener("touchstart", unlockOnce, true);

    // Certains Android chargent les voix après coup
    try{
      if ("speechSynthesis" in window){
        window.speechSynthesis.onvoiceschanged = () => refreshVoices();
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