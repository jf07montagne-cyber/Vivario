/* ambiance.js — FIX v16.1
   ✅ Toggle ON/OFF fiable
   ✅ Un seul son
   ✅ Appui long = next track
   ✅ Pas de bouton sur respiration
   ✅ muteForBreath(true/false)
   ✅ IMPORTANT: si Ambiance est ON mais que mobile bloque l'autoplay,
      on relance au 1er tap sur la page (résultat inclus).
*/
(() => {
  const KEY_ON  = "vivario_amb_on";
  const KEY_IDX = "vivario_amb_idx";

  const TRACKS = [
    { name: "Calme", src: "ambiance.mp3" },
    { name: "Océan", src: "ambiance_ocean.mp3" },
    { name: "Focus", src: "ambiance_focus.mp3" },
    { name: "Deep",  src: "ambiance_deep.mp3" }
  ];

  const isBreathPage = document.body.classList.contains("page-breath");

  const audio = new Audio();
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = 0.7;

  let isOn = (localStorage.getItem(KEY_ON) === "1");
  let idx = parseInt(localStorage.getItem(KEY_IDX) || "0", 10);
  if (!Number.isFinite(idx) || idx < 0) idx = 0;
  if (idx >= TRACKS.length) idx = 0;

  let mutedForBreath = false;
  let wasOnBeforeBreath = null;

  function saveState() {
    try {
      localStorage.setItem(KEY_ON, isOn ? "1" : "0");
      localStorage.setItem(KEY_IDX, String(idx));
    } catch {}
  }

  function setTrack(i) {
    idx = ((i % TRACKS.length) + TRACKS.length) % TRACKS.length;
    const t = TRACKS[idx];
    if (!t) return;

    try { audio.pause(); } catch {}
    try { audio.currentTime = 0; } catch {}
    audio.src = t.src;
    saveState();
  }

  function setTrackByName(name){
    const n = String(name || "").toLowerCase().trim();
    const i = TRACKS.findIndex(t => String(t.name).toLowerCase() === n);
    if (i >= 0) setTrack(i);
  }

  function nextTrack() {
    setTrack(idx + 1);
    if (isOn && !mutedForBreath) play();
  }

  async function play() {
    if (mutedForBreath) return;
    try {
      if (!audio.src) setTrack(idx);
      await audio.play();
    } catch {
      // Autoplay bloqué: on relancera au 1er tap (voir armAutoResume)
    }
  }

  function stop() {
    try { audio.pause(); } catch {}
    try { audio.currentTime = 0; } catch {}
  }

  function setOn(v) {
    isOn = !!v;
    saveState();
    updateBtn();
    if (isOn) play();
    else stop();
  }

  function toggle() {
    setOn(!isOn);
  }

  function muteForBreath(flag) {
    const f = !!flag;
    if (f) {
      mutedForBreath = true;
      wasOnBeforeBreath = isOn;
      stop();
      updateBtn(true);
      return;
    }
    mutedForBreath = false;
    updateBtn(false);
    if (wasOnBeforeBreath) play();
    wasOnBeforeBreath = null;
  }

  let btn = null;

  function ensureBtn() {
    if (isBreathPage) return;
    btn = document.getElementById("ambienceToggle");
    if (btn) return;

    btn = document.createElement("button");
    btn.id = "ambienceToggle";
    btn.className = "btn ambience-toggle";
    btn.type = "button";

    btn.addEventListener("click", () => toggle());

    // appui long = next track
    let pressTimer = 0;
    btn.addEventListener("pointerdown", () => {
      pressTimer = window.setTimeout(() => nextTrack(), 520);
    }, { passive:true });
    const clear = () => { try{ clearTimeout(pressTimer); }catch{} };
    btn.addEventListener("pointerup", clear, { passive:true });
    btn.addEventListener("pointercancel", clear, { passive:true });

    document.body.appendChild(btn);
  }

  function updateBtn(forceMuted = null) {
    if (!btn) return;
    const muted = (forceMuted === null) ? mutedForBreath : !!forceMuted;

    const labelTrack = TRACKS[idx]?.name || "Ambiance";
    if (muted) {
      btn.textContent = `🔇 Ambiance (pause)`;
      btn.classList.remove("is-on");
      return;
    }
    btn.textContent = isOn ? `🔊 Ambiance: ${labelTrack}` : `🔈 Ambiance: OFF`;
    btn.classList.toggle("is-on", isOn);
  }

  // ✅ Fix principal: si ON + autoplay bloqué => relancer au 1er tap
  function armAutoResume(){
    const resumeOnce = async () => {
      if (!isOn || mutedForBreath) return;
      // si déjà en train de jouer => inutile
      if (!audio.paused) return;
      try { await play(); } catch {}
    };
    window.addEventListener("pointerdown", resumeOnce, { passive:true });
    window.addEventListener("touchstart", resumeOnce, { passive:true });
  }

  function init(){
    setTrack(idx);
    ensureBtn();
    updateBtn();
    armAutoResume();
    if (isOn && !isBreathPage) play();
  }

  window.VivarioAmbience = {
    init,
    setOn,
    toggle,
    stop,
    play,
    nextTrack,
    setTrack,
    setTrackByName,
    muteForBreath,
    get state() { return { isOn, idx, track: TRACKS[idx]?.name || "" }; }
  };

  window.VivarioAmbiance = window.VivarioAmbience;

  try{
    if (document.readyState === "loading"){
      document.addEventListener("DOMContentLoaded", () => window.VivarioAmbience?.init?.());
    } else {
      window.VivarioAmbience?.init?.();
    }
    window.addEventListener("pageshow", () => window.VivarioAmbience?.init?.());
  }catch{}
})();