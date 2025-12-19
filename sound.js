(() => {
  const KEY_ON = "vivario_sound_on";
  const AUDIO_SRC = "ambiance.mp3";

  let audio = null;
  let armed = false;
  let isPlaying = false;

  // mini panneau debug
  const panel = document.createElement("div");
  panel.style.position = "fixed";
  panel.style.left = "12px";
  panel.style.bottom = "12px";
  panel.style.zIndex = "99999";
  panel.style.maxWidth = "92vw";
  panel.style.padding = "10px 12px";
  panel.style.borderRadius = "12px";
  panel.style.background = "rgba(0,0,0,.75)";
  panel.style.border = "1px solid rgba(255,255,255,.18)";
  panel.style.color = "#fff";
  panel.style.fontSize = "12px";
  panel.style.lineHeight = "1.35";
  panel.style.backdropFilter = "blur(8px)";
  panel.style.whiteSpace = "pre-wrap";
  panel.textContent = "🔊 Debug son: init…";
  document.addEventListener("DOMContentLoaded", () => document.body.appendChild(panel));

  function log(msg){
    panel.textContent = msg;
    console.log(msg);
  }

  function getOn() {
    const v = localStorage.getItem(KEY_ON);
    return v === null ? true : v === "1";
  }
  function setOn(v) {
    localStorage.setItem(KEY_ON, v ? "1" : "0");
  }

  function ensureAudio() {
    if (audio) return audio;
    audio = new Audio(AUDIO_SRC);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 1.0;           // 🔥 on force à fond pour test
    audio.muted = false;
    audio.addEventListener("error", () => {
      const err = audio?.error;
      log("❌ Audio error. Fichier introuvable ou format bloqué.\n" +
          `SRC=${AUDIO_SRC}\n` +
          `code=${err?.code || "?"}`);
    });
    audio.addEventListener("playing", () => log("✅ Audio PLAYING (son en cours)"));
    audio.addEventListener("pause",   () => log("⏸️ Audio en pause"));
    return audio;
  }

  async function play() {
    if (!getOn()) { log("🔇 OFF (localStorage)"); return; }
    const a = ensureAudio();
    try {
      log("… tentative lecture (autoplay peut être bloqué)");
      await a.play();
      isPlaying = true;
      armed = false;
      log("✅ Lecture lancée. (Si tu n'entends rien → volume/BT/format/fichier)");
    } catch (e) {
      armed = true;
      isPlaying = false;
      log("⚠️ Autoplay bloqué.\n👉 Tape n'importe où (ou clique) pour démarrer.");
    }
  }

  function pause() {
    if (!audio) return;
    audio.pause();
    isPlaying = false;
    log("⏸️ Pause demandée");
  }

  // bouton on/off (injecté)
  function ensureButton() {
    let btn = document.getElementById("soundToggle");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "soundToggle";
      btn.type = "button";
      btn.style.position = "fixed";
      btn.style.right = "14px";
      btn.style.bottom = "14px";
      btn.style.zIndex = "99999";
      btn.style.border = "1px solid rgba(255,255,255,.12)";
      btn.style.background = "rgba(20,25,35,.55)";
      btn.style.backdropFilter = "blur(10px)";
      btn.style.color = "#fff";
      btn.style.padding = "10px 12px";
      btn.style.borderRadius = "14px";
      btn.style.fontSize = "14px";
      btn.style.display = "flex";
      btn.style.alignItems = "center";
      btn.style.gap = "8px";
      btn.style.cursor = "pointer";
      document.body.appendChild(btn);
    }

    const refresh = () => {
      const on = getOn();
      btn.textContent = on
        ? (isPlaying ? "🔊 Son : ON" : (armed ? "🔊 Touchez pour démarrer" : "🔊 Son : ON"))
        : "🔇 Son : OFF";
    };

    btn.addEventListener("click", async () => {
      const next = !getOn();
      setOn(next);
      if (next) await play(); else pause();
      refresh();
    });

    refresh();
    return { btn, refresh };
  }

  function armOnGesture() {
    const handler = async () => {
      if (!getOn()) return;
      await play();
      window.removeEventListener("pointerdown", handler, true);
      window.removeEventListener("touchstart", handler, true);
      window.removeEventListener("click", handler, true);
      window.removeEventListener("keydown", handler, true);
    };
    window.addEventListener("pointerdown", handler, true);
    window.addEventListener("touchstart", handler, true);
    window.addEventListener("click", handler, true);
    window.addEventListener("keydown", handler, true);
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const { refresh } = ensureButton();
    refresh();

    // test fetch du fichier (si 404 => on le sait)
    try{
      const r = await fetch(AUDIO_SRC, { cache:"no-store" });
      if (!r.ok) log(`❌ Fichier non accessible: ${AUDIO_SRC} (HTTP ${r.status})\n👉 Mets ambiance.mp3 à la racine, nom EXACT.`);
      else log(`✅ Fichier trouvé (HTTP ${r.status}). Tentative lecture…`);
    }catch(e){
      log("❌ Impossible de fetch le mp3 (réseau / CORS / chemin).");
    }

    await play();
    armOnGesture();
  });
})();