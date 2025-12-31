/* ambiance.js — FIX complet
   ✅ Toggle ON/OFF fiable
   ✅ Un seul son (pas de mix involontaire)
   ✅ Rotation entre plusieurs ambiances
   ✅ Pas de bouton sur respiration (page-breath)
   ✅ muteForBreath(true/false) pour couper pendant l’exercice
*/
(() => {
  const KEY_ON  = "vivario_amb_on";
  const KEY_IDX = "vivario_amb_idx";

  // ⚠️ Mets ici tes vrais fichiers audio
  const TRACKS = [
    { name: "Calme",  src: "audio/ambience_calm.mp3" },
    { name: "Océan",  src: "audio/ambience_ocean.mp3" },
    { name: "Forêt",  src: "audio/ambience_forest.mp3" }
  ];

  // Pas de bouton sur la page respiration
  const isBreathPage = document.body.classList.contains("page-breath");

  // Un seul player global
  const audio = new Audio();
  audio.loop = true;
  audio.preload = "auto";

  let isOn = (localStorage.getItem(KEY_ON) === "1");
  let idx = parseInt(localStorage.getItem(KEY_IDX) || "0", 10);
  if (!Number.isFinite(idx) || idx < 0) idx = 0;
  if (idx >= TRACKS.length) idx = 0;

  // Mute pendant respiration (on doit restaurer l’état précédent)
  let mutedForBreath = false;
  let wasOnBeforeBreath = null;

  function saveState() {
    try {
      localStorage.setItem(KEY_ON, isOn ? "1" : "0");
      localStorage.setItem(KEY_IDX, String(idx));
    } catch {}
  }

  function setTrack(i) {
    idx = i % TRACKS.length;
    const t = TRACKS[idx];
    if (!t) return;

    // ✅ stop net avant de changer (évite mix)
    audio.pause();
    audio.currentTime = 0;
    audio.src = t.src;
    saveState();
  }

  function nextTrack() {
    setTrack((idx + 1) % TRACKS.length);
    if (isOn && !mutedForBreath) {
      play();
    }
  }

  async function play() {
    if (mutedForBreath) return;
    try {
      if (!audio.src) setTrack(idx);
      await audio.play();
    } catch {
      // iOS/Android bloquent parfois tant que pas d’interaction
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

  // ✅ appelée par respiration.js
  function muteForBreath(flag) {
    const f = !!flag;

    if (f) {
      mutedForBreath = true;
      // on mémorise si c’était ON
      wasOnBeforeBreath = isOn;
      stop();
      updateBtn(true);
      return;
    }

    // restore
    mutedForBreath = false;
    updateBtn(false);
    if (wasOnBeforeBreath) {
      // on relance uniquement si l’utilisateur avait ON avant
      play();
    }
    wasOnBeforeBreath = null;
  }

  // Button
  let btn = null;

  function ensureBtn() {
    if (isBreathPage) return; // aucun bouton ici
    btn = document.getElementById("ambienceToggle");
    if (btn) return;

    btn = document.createElement("button");
    btn.id = "ambienceToggle";
    btn.className = "btn ambience-toggle";
    btn.type = "button";
    btn.addEventListener("click", () => {
      // click court = toggle
      toggle();
    });

    // Appui long (ou double click) = changer de track (pratique)
    let pressTimer = 0;
    btn.addEventListener("pointerdown", () => {
      pressTimer = window.setTimeout(() => {
        nextTrack();
      }, 550);
    }, { passive:true });

    btn.addEventListener("pointerup", () => {
      clearTimeout(pressTimer);
    }, { passive:true });

    btn.addEventListener("pointercancel", () => {
      clearTimeout(pressTimer);
    }, { passive:true });

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

  // Init
  setTrack(idx);

  // expose API (pour respiration.js)
  window.VivarioAmbience = {
    setOn,
    toggle,
    stop,
    play,
    nextTrack,
    muteForBreath,
    get state() {
      return { isOn, idx, track: TRACKS[idx]?.name || "" };
    }
  };

  // Crée bouton si besoin
  ensureBtn();
  updateBtn();

  // Si déjà ON, on tente de jouer (si pas bloqué par mobile, ça démarrera au 1er tap)
  if (isOn && !isBreathPage) play();
})();