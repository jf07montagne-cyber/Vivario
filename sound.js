/* Vivario — sound.js (v11.1)
   - Singleton global (évite double exécution si inclus 2 fois)
   - Init robuste (DOMContentLoaded + pageshow) mais idempotent
   - Utilise TES fichiers audio présents à la racine
   - Bouton unique (réutilise #ambienceToggle / .ambience-toggle si présent)
   - API: window.VivarioSound.toggleAmbience(), setMood(), startBreathing(), stopBreathing(), isAmbienceOn()
*/

(() => {
  // ✅ singleton
  if (window.__VIVARIO_SOUND_V11_1__) return;
  window.__VIVARIO_SOUND_V11_1__ = true;

  const FILES = {
    calm:  "ambiance.mp3",
    ocean: "ambiance_ocean.mp3",
    focus: "ambiance_focus.mp3",
    deep:  "ambiance_deep.mp3"
  };

  const BREATH_DEFAULT = "breath_cycle.mp3";

  const LS_AMB_ON = "vivario_sound_on";
  const LS_MOOD   = "vivario_mood";

  // ✅ état global persistant (si navigation)
  const G = (window.__VIVARIO_SOUND_STATE__ ||= {
    ambienceAudio: null,
    breathAudio: null,
    ambienceOn: false,
    currentMood: localStorage.getItem(LS_MOOD) || "calm",
    ambienceMutedByBreath: false,
    btnId: "vivarioAmbienceBtn"
  });

  function ensureAmbience(){
    if (G.ambienceAudio) return;
    const file = FILES[G.currentMood] || FILES.calm;
    G.ambienceAudio = new Audio(file);
    G.ambienceAudio.loop = true;
    G.ambienceAudio.volume = 0.18;
  }

  function ensureBreath(){
    if (G.breathAudio) return;
    G.breathAudio = new Audio(BREATH_DEFAULT);
    G.breathAudio.loop = true;
    G.breathAudio.volume = 0.35;
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

  function findButton(){
    return (
      document.getElementById(G.btnId) ||
      document.getElementById("ambienceToggle") ||
      document.querySelector(".ambience-toggle") ||
      document.querySelector("[data-ambience-toggle='1']")
    );
  }

  function normalizeButton(btn){
    if (!btn) return null;

    // ✅ force un id unique pour que tous les scripts retrouvent le même
    btn.id = G.btnId;
    btn.dataset.ambienceToggle = "1";
    btn.classList.add("btn", "ghost", "ambience-toggle");
    btn.type = "button";

    return btn;
  }

  function createButton(){
    const btn = document.createElement("button");
    btn.id = G.btnId;
    btn.className = "btn ghost ambience-toggle";
    btn.type = "button";
    btn.dataset.ambienceToggle = "1";

    // ✅ bouton flottant si créé
    btn.style.position = "fixed";
    btn.style.right = "14px";
    btn.style.bottom = "14px";
    btn.style.zIndex = "9999";
    btn.style.backdropFilter = "blur(10px)";
    btn.style.borderColor = "rgba(255,255,255,.14)";
    btn.style.background = "rgba(255,255,255,.06)";

    document.body.appendChild(btn);
    return btn;
  }

  function getButton(){
    let btn = findButton();
    if (!btn) btn = createButton();
    return normalizeButton(btn);
  }

  async function applyMood(mood){
    G.currentMood = mood || "calm";
    localStorage.setItem(LS_MOOD, G.currentMood);

    const nextFile = FILES[G.currentMood] || FILES.calm;

    ensureAmbience();

    const src = G.ambienceAudio.src || "";
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
        const btn = document.getElementById(G.btnId);
        setUI(G.ambienceOn, btn);
      });
    }
  }

  function bindOnce(btn){
    if (!btn) return;
    if (btn.dataset.boundSound === "1") return;

    btn.addEventListener("click", async () => {
      await toggleAmbience(btn);
    });

    btn.dataset.boundSound = "1";
  }

  // ✅ init idempotent
  function initPage(){
    G.ambienceOn = localStorage.getItem(LS_AMB_ON) === "1";
    G.currentMood = localStorage.getItem(LS_MOOD) || G.currentMood || "calm";

    const btn = getButton();
    setUI(G.ambienceOn, btn);
    bindOnce(btn);

    applyMood(G.currentMood);

    // ❗ Pas d’autoplay agressif : on tente seulement si ON était déjà actif
    if (G.ambienceOn) {
      startAmbience().then(() => setUI(G.ambienceOn, btn));
    }
  }

  window.VivarioSound = {
    setMood: (m) => applyMood(m),
    toggleAmbience: () => toggleAmbience(document.getElementById(G.btnId)),
    startBreathing,
    stopBreathing,
    isAmbienceOn: () => G.ambienceOn
  };

  document.addEventListener("DOMContentLoaded", initPage);
  window.addEventListener("pageshow", initPage);
})();