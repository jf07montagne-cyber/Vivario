/* ambiance.js — v17 (FIX)
   ✅ Bouton discret top-left sur toutes les pages
   ✅ Bons noms de fichiers : ambience*.mp3 (IMPORTANT)
   ✅ Un seul son, pas de mix
   ✅ Appui long = changer de piste
   ✅ muteForBreath(true/false) pour couper pendant respiration
*/
(() => {
  const KEY_ON  = "vivario_amb_on";
  const KEY_IDX = "vivario_amb_idx";

  // ✅ NOMS DE FICHIERS CORRIGÉS (ambience*.mp3)
  const TRACKS = [
    { name: "Calme", src: "ambience.mp3" },
    { name: "Océan", src: "ambience_ocean.mp3" },
    { name: "Focus", src: "ambience_focus.mp3" },
    { name: "Deep",  src: "ambience_deep.mp3" }
  ];

  const audio = new Audio();
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = 0.75;

  let isOn = (localStorage.getItem(KEY_ON) === "1");
  let idx = parseInt(localStorage.getItem(KEY_IDX) || "0", 10);
  if (!Number.isFinite(idx) || idx < 0 || idx >= TRACKS.length) idx = 0;

  let mutedForBreath = false;
  let wasOnBeforeBreath = null;

  // si play() est bloqué au premier tap (mobile), on affiche un hint
  let needSecondTap = false;

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
    updateBtn();
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

    // assure une src
    if (!audio.src) setTrack(idx);

    try {
      await audio.play();
      needSecondTap = false;
      updateBtn();
    } catch {
      // mobile: parfois nécessite 2e tap (selon navigateur)
      needSecondTap = true;
      updateBtn();
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
    // si on était ON mais bloqué, un 2e tap retente play()
    if (isOn && needSecondTap) return play();
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

  // ---------- UI bouton top-left ----------
  let btn = null;

  function ensureBtn() {
    btn = document.getElementById("ambienceToggle");
    if (btn) return;

    btn = document.createElement("button");
    btn.id = "ambienceToggle";
    btn.className = "btn ambience-toggle-top";
    btn.type = "button";
    btn.setAttribute("aria-label", "Ambiance");

    // click = toggle
    btn.addEventListener("click", () => toggle());

    // long press = next track
    let pressTimer = 0;
    btn.addEventListener("pointerdown", () => {
      pressTimer = window.setTimeout(() => nextTrack(), 520);
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
      btn.textContent = "🔇 Ambiance";
      btn.classList.remove("is-on");
      return;
    }

    if (needSecondTap && isOn) {
      btn.textContent = "🔈 Ambiance (retape)";
      btn.classList.add("is-on");
      return;
    }

    btn.textContent = isOn ? `🔊 ${labelTrack}` : "🔈 OFF";
    btn.classList.toggle("is-on", isOn);
  }

  function init(){
    setTrack(idx);
    ensureBtn();
    updateBtn();
    // auto-play possible si déjà ON, mais peut être bloqué : OK, l’utilisateur retape
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
      return { isOn, idx, track: TRACKS[idx]?.name || "" };
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