/* ambiance.js — v18 (FIX AUDIO + bouton top-right)
   ✅ Supporte ambience*.mp3 OU ambiance*.mp3 (auto-détection)
   ✅ Bouton petit, fixe en haut à droite (toutes pages)
   ✅ Click = ON/OFF
   ✅ Appui long = piste suivante
   ✅ muteForBreath(true/false) conservé
*/
(() => {
  const KEY_ON  = "vivario_amb_on";
  const KEY_IDX = "vivario_amb_idx";

  // ⚠️ On accepte les 2 orthographes : ambience / ambiance
  const TRACKS = [
    { name: "Calme", candidates: ["./ambience.mp3", "./ambiance.mp3"] },
    { name: "Océan", candidates: ["./ambience_ocean.mp3", "./ambiance_ocean.mp3"] },
    { name: "Focus", candidates: ["./ambience_focus.mp3", "./ambiance_focus.mp3"] },
    { name: "Deep",  candidates: ["./ambience_deep.mp3", "./ambiance_deep.mp3"] }
  ];

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

  let btn = null;
  let resolvedSrcByIdx = new Map(); // idx -> src résolu (existe)

  function saveState() {
    try {
      localStorage.setItem(KEY_ON, isOn ? "1" : "0");
      localStorage.setItem(KEY_IDX, String(idx));
    } catch {}
  }

  // petit helper: test si un fichier existe (GitHub Pages = OK)
  async function urlExists(url) {
    try {
      const res = await fetch(url, { method: "HEAD", cache: "no-store" });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function resolveTrackSrc(i) {
    const t = TRACKS[i];
    if (!t) return "";
    if (resolvedSrcByIdx.has(i)) return resolvedSrcByIdx.get(i);

    for (const cand of (t.candidates || [])) {
      // on teste si le fichier existe
      if (await urlExists(cand)) {
        resolvedSrcByIdx.set(i, cand);
        return cand;
      }
    }
    // si rien trouvé, on prend le 1er (au cas où HEAD est bloqué)
    const fallback = (t.candidates && t.candidates[0]) ? t.candidates[0] : "";
    resolvedSrcByIdx.set(i, fallback);
    return fallback;
  }

  async function setTrack(i) {
    idx = ((i % TRACKS.length) + TRACKS.length) % TRACKS.length;
    saveState();

    const src = await resolveTrackSrc(idx);

    try { audio.pause(); audio.currentTime = 0; } catch {}
    audio.src = src || "";
    updateBtn();
  }

  function setTrackByName(name){
    const n = String(name || "").toLowerCase().trim();
    const i = TRACKS.findIndex(t => String(t.name).toLowerCase() === n);
    if (i >= 0) setTrack(i);
  }

  async function play() {
    if (mutedForBreath) return;

    // ✅ important mobile: unlock au moment du clic
    try { await window.VivarioSound?.unlock?.(); } catch {}

    try {
      if (!audio.src) await setTrack(idx);
      await audio.play();
    } catch {
      // si le navigateur bloque, l'utilisateur devra re-cliquer (normal)
    }
  }

  function stop() {
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {}
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

  async function nextTrack() {
    await setTrack((idx + 1) % TRACKS.length);
    if (isOn && !mutedForBreath) play();
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

  function ensureBtn() {
    btn = document.getElementById("ambienceToggle");
    if (btn) return;

    btn = document.createElement("button");
    btn.id = "ambienceToggle";
    btn.className = "btn ambience-toggle top-right";
    btn.type = "button";

    // click court = toggle
    btn.addEventListener("click", async () => {
      // unlock + toggle
      try { await window.VivarioSound?.unlock?.(); } catch {}
      toggle();
    });

    // appui long = next track
    let pressTimer = 0;
    btn.addEventListener("pointerdown", () => {
      pressTimer = window.setTimeout(() => nextTrack(), 600);
    }, { passive:true });

    const clear = () => { try { clearTimeout(pressTimer); } catch {} };
    btn.addEventListener("pointerup", clear, { passive:true });
    btn.addEventListener("pointercancel", clear, { passive:true });

    document.body.appendChild(btn);
  }

  function updateBtn(forceMuted = null) {
    if (!btn) return;
    const muted = (forceMuted === null) ? mutedForBreath : !!forceMuted;

    const labelTrack = TRACKS[idx]?.name || "Ambiance";
    if (muted) {
      btn.textContent = `🔇 ${labelTrack}`;
      btn.classList.remove("is-on");
      return;
    }

    // petit / discret
    btn.textContent = isOn ? `🎧 ${labelTrack}` : `🎧 OFF`;
    btn.classList.toggle("is-on", isOn);
  }

  async function init(){
    ensureBtn();
    await setTrack(idx);
    updateBtn();
    if (isOn && !mutedForBreath) play();
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
    get state() {
      return { isOn, idx, track: TRACKS[idx]?.name || "", src: audio.src || "" };
    }
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