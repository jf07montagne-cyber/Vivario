(() => {
  const LS_MOOD = "vivario_mood";

  const G = (window.__VIVARIO_SOUND__ ||= {
    audioCtx: null,
    unlocked: false,
    currentMood: localStorage.getItem(LS_MOOD) || "calm",
    lastSpokenSecond: -1,
    voiceReady: false,
    bestVoice: null,
    lastSpokeAt: 0
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

  function pickBestFrenchVoice(){
    try{
      const voices = window.speechSynthesis.getVoices?.() || [];
      const fr = voices.filter(v => (v.lang || "").toLowerCase().startsWith("fr"));
      if (!fr.length) return null;

      const score = (v) => {
        const name = (v.name || "").toLowerCase();
        let s = 0;

        // gros bonus si “female/femme” ou prénoms souvent féminins
        if (name.includes("female") || name.includes("femme")) s += 10;
        if (name.includes("amel") || name.includes("jul") || name.includes("lea") || name.includes("aure") || name.includes("cel")) s += 6;

        // voix qualité
        if (name.includes("natural") || name.includes("premium") || name.includes("enhanced")) s += 5;
        if (name.includes("google")) s += 4;

        if (v.default) s += 2;
        return s;
      };

      fr.sort((a,b) => score(b) - score(a));
      return fr[0] || null;
    }catch{
      return null;
    }
  }

  function ensureVoiceReady(){
    if (G.voiceReady) return;
    try{
      const tryPick = () => {
        const v = pickBestFrenchVoice();
        if (v){ G.bestVoice = v; G.voiceReady = true; }
      };
      tryPick();
      window.speechSynthesis.onvoiceschanged = tryPick;
    }catch{}
  }

  function speak(text, { soft = true, priority = "normal" } = {}){
    try{
      if (!("speechSynthesis" in window)) return;
      ensureVoiceReady();

      const now = performance.now();
      const minGap = (priority === "high") ? 35 : 80;
      if (now - G.lastSpokeAt < minGap) return;
      G.lastSpokeAt = now;

      // on annule seulement sur “high” (mots de phase)
      if (priority === "high") {
        try { window.speechSynthesis.cancel(); } catch {}
      }

      const u = new SpeechSynthesisUtterance(String(text));
      u.lang = "fr-FR";

      // plus “féminin / doux”
      u.rate  = soft ? 0.90 : 0.96;
      u.pitch = soft ? 1.14 : 1.06;
      u.volume = 1.0;

      if (G.bestVoice) u.voice = G.bestVoice;

      window.speechSynthesis.speak(u);
    }catch{}
  }

  function breathCue({ stage, voice, coachSoft, vibrate, tick, countdown }){
    if (tick) beep(880, 35, 0.06);

    if (vibrate && navigator.vibrate){
      try { navigator.vibrate(18); } catch {}
    }

    if (!voice) return;

    const soft = !!coachSoft;

    // décompte (0 géré côté respiration.js)
    if (typeof countdown === "number" && Number.isFinite(countdown)){
      if (countdown === G.lastSpokenSecond) return;
      G.lastSpokenSecond = countdown;
      speak(String(countdown), { soft, priority: "normal" });
      return;
    }

    G.lastSpokenSecond = -1;

    const s = String(stage || "").toLowerCase();
    let phrase = "";

    if (s.includes("inspire")) phrase = soft ? "Inspire…" : "Inspire.";
    else if (s.includes("bloque")) phrase = soft ? "Garde…" : "Bloque.";
    else if (s.includes("expire")) phrase = soft ? "Expire…" : "Expire.";
    else phrase = soft ? "On continue…" : "Continue.";

    speak(phrase, { soft, priority: "high" });
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

    ensureVoiceReady();
  }

  window.VivarioSound = { unlock, setMood, toggleAmbience, breathCue };
  document.addEventListener("DOMContentLoaded", initPage);
  window.addEventListener("pageshow", initPage);
})();