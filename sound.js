/* Vivario — sound.js (v12.1 SAFE)
   ✅ Init robuste: DOMContentLoaded + pageshow (bfcache)
   ✅ Pas d'autoplay au load (Android friendly)
   ✅ Bouton unique + bind unique
   ✅ API: window.VivarioSound.toggleAmbience(), setMood(), startBreathing(), stopBreathing()
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
    ambienceMutedByBreath: false
  });

  function ensureAmbience(){
    if (G.ambienceAudio) return;
    G.ambienceAudio = new Audio(FILES[G.currentMood] || FILES.calm);
    G.ambienceAudio.loop = true;
    G.ambienceAudio.volume = 0.18;
    G.ambienceAudio.preload = "auto";
  }

  function ensureBreath(){
    if (G.breathAudio) return;
    G.breathAudio = new Audio(BREATH_DEFAULT);
    G.breathAudio.loop = true;
    G.breathAudio.volume = 0.35;
    G.breathAudio.preload = "auto";
  }

  async function safePlay(audio){
    try{
      const p = audio.play();
      if (p && typeof p.then === "function") await p;
      return true;
    } catch {
      return false;
    }
  }

  function safePause(audio){
    try{ audio.pause(); } catch {}
  }

  function setUI(on, btn){
    if (!btn) return;
    btn.textContent = on ? "🔊 Ambiance" : "🔇 Ambiance";
    btn.classList.toggle("is-on", !!on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function getButton(){
    let btn =
      document.getElementById("vivarioAmbienceBtn") ||
      document.querySelector(".ambience-toggle") ||
      document.getElementById("ambienceToggle") ||
      document.querySelector("[data-ambience-toggle='1']");

    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn ghost ambience-toggle";
      document.body.appendChild(btn);
    }

    if (btn.tagName && btn.tagName.toLowerCase() === "a") {
      btn.setAttribute("href", "javascript:void(0)");
      btn.setAttribute("role", "button");
    }

    btn.id = "vivarioAmbienceBtn";
    btn.classList.add("ambience-toggle");
    btn.dataset.ambienceToggle = "1";

    if (btn.tagName && btn.tagName.toLowerCase() === "button") {
      btn.type = "button";
    }

    return btn;
  }

  async function applyMood(mood){
    G.currentMood = mood || "calm";
    localStorage.setItem(LS_MOOD, G.currentMood);

    const nextFile = FILES[G.currentMood] || FILES.calm;

    ensureAmbience();

    const src = String(G.ambienceAudio.src || "");
    if (src.includes(nextFile)) return;

    const wasPlaying = G.ambienceOn && !G.ambienceAudio.paused;

    try{
      G.ambienceAudio.pause();
      G.ambienceAudio.src = nextFile;
      G.ambienceAudio.load();
    } catch {}

    if (wasPlaying) await safePlay(G.ambienceAudio);
  }

  async function startAmbience(){
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
    if (G.ambienceOn) stopAmbience();
    else await startAmbience();
    setUI(G.ambienceOn, btn);
  }

  async function startBreathing(opts = {}){
    const { muteAmbienceWhileBreath = true, affectBreath = true } = opts;

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
        const btn = document.getElementById("vivarioAmbienceBtn");
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

    if (btn.dataset.bound_v12_1 !== "1") {
      btn.addEventListener("click", async (e) => {
        e.preventDefault?.();
        await toggleAmbience(btn);
      });
      btn.dataset.bound_v12_1 = "1";
    }

    // pas d'autoplay
  }

  window.VivarioSound = {
    setMood: (m) => applyMood(m),
    toggleAmbience: () => toggleAmbience(document.getElementById("vivarioAmbienceBtn")),
    startBreathing,
    stopBreathing,
    isAmbienceOn: () => G.ambienceOn
  };

  document.addEventListener("DOMContentLoaded", initPage);
  window.addEventListener("pageshow", initPage);
})();