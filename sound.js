/* Vivario — sound.js v2 (100% autonome, SANS MP3)
   Ambiance douce "vent/mer" générée via WebAudio:
   - compatible mobile (démarre après un geste)
   - toggle ON/OFF + volume (persistant)
*/

(() => {
  const KEY_ON = "vivario_sound_on";
  const KEY_VOL = "vivario_sound_vol";

  // --------- état
  let ctx = null;
  let master = null;
  let isOn = true;
  let isRunning = false;

  // nodes
  let noiseSrc = null;
  let noiseGain = null;
  let lowpass = null;
  let bandpass = null;
  let lfo = null;
  let lfoGain = null;

  // --------- helpers storage
  function getOn() {
    const v = localStorage.getItem(KEY_ON);
    return v === null ? true : v === "1";
  }
  function setOn(v) {
    localStorage.setItem(KEY_ON, v ? "1" : "0");
  }
  function getVol() {
    const v = Number(localStorage.getItem(KEY_VOL));
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.35;
  }
  function setVol(v) {
    localStorage.setItem(KEY_VOL, String(v));
  }

  // --------- UI
  function ensureButton() {
    let btn = document.getElementById("soundToggle");
    if (btn) return btn;

    btn = document.createElement("button");
    btn.id = "soundToggle";
    btn.type = "button";

    btn.style.position = "fixed";
    btn.style.right = "14px";
    btn.style.top = "14px";
    btn.style.zIndex = "9999";
    btn.style.border = "1px solid rgba(255,255,255,.14)";
    btn.style.background = "rgba(20,25,35,.55)";
    btn.style.backdropFilter = "blur(10px)";
    btn.style.color = "#fff";
    btn.style.padding = "10px 12px";
    btn.style.borderRadius = "14px";
    btn.style.fontSize = "14px";
    btn.style.display = "inline-flex";
    btn.style.alignItems = "center";
    btn.style.gap = "8px";
    btn.style.cursor = "pointer";
    btn.style.boxShadow = "0 10px 30px rgba(0,0,0,.25)";

    btn.addEventListener("click", () => {
      toggle();
    });

    document.body.appendChild(btn);
    return btn;
  }

  function updateUI() {
    const btn = document.getElementById("soundToggle");
    if (!btn) return;

    const on = getOn();
    const icon = on ? "🔊" : "🔇";
    const label = on
      ? (isRunning ? "Son : ON" : "Touchez pour démarrer")
      : "Son : OFF";

    btn.textContent = `${icon} ${label}`;
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  // --------- WebAudio: bruit (brown-ish) + filtres + lfo "vagues"
  function createNoiseBuffer(audioCtx) {
    const sampleRate = audioCtx.sampleRate;
    const seconds = 2.5;
    const buffer = audioCtx.createBuffer(1, Math.floor(sampleRate * seconds), sampleRate);
    const data = buffer.getChannelData(0);

    // Brown noise (intégré, plus doux que white noise)
    let lastOut = 0.0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + (0.02 * white)) / 1.02;
      data[i] = lastOut * 3.5; // gain interne
    }
    return buffer;
  }

  function buildGraph() {
    if (ctx) return;

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    ctx = new AudioCtx();

    master = ctx.createGain();
    master.gain.value = getVol();
    master.connect(ctx.destination);

    // Noise source
    const buffer = createNoiseBuffer(ctx);
    noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = buffer;
    noiseSrc.loop = true;

    noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.35;

    // filtres pour "vent/mer"
    lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 900; // douceur
    lowpass.Q.value = 0.7;

    bandpass = ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.value = 220; // souffle bas
    bandpass.Q.value = 0.8;

    // LFO : fait onduler légèrement le volume (effet vagues)
    lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.08; // très lent

    lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.10; // amplitude modulation

    // Connexions
    noiseSrc.connect(noiseGain);
    noiseGain.connect(lowpass);
    lowpass.connect(bandpass);
    bandpass.connect(master);

    lfo.connect(lfoGain);
    lfoGain.connect(noiseGain.gain); // modifie le gain du bruit

    // Démarre nodes (mais context peut être "suspended" jusqu’au geste)
    noiseSrc.start();
    lfo.start();
  }

  async function start() {
    buildGraph();
    if (!ctx) return;

    try {
      if (ctx.state === "suspended") await ctx.resume();
      isRunning = true;
    } catch (e) {
      // sur certains navigateurs, resume peut être bloqué
      isRunning = false;
    }
    updateUI();
  }

  function stop() {
    // on ne "détruit" pas tout (ça évite bugs), on coupe juste le master
    if (master) master.gain.value = 0.00001;
    isRunning = false;
    updateUI();
  }

  function applyVolume(v) {
    setVol(v);
    if (master && getOn()) master.gain.value = v;
  }

  function toggle() {
    const next = !getOn();
    setOn(next);

    if (next) {
      // remet le volume + tente de démarrer
      buildGraph();
      if (master) master.gain.value = getVol();
      start();
    } else {
      stop();
    }
  }

  // démarrage mobile fiable : on attend un geste
  function armFirstGesture() {
    const handler = async () => {
      if (!getOn()) return;
      await start();
      window.removeEventListener("pointerdown", handler, true);
      window.removeEventListener("touchstart", handler, true);
      window.removeEventListener("keydown", handler, true);
    };
    window.addEventListener("pointerdown", handler, true);
    window.addEventListener("touchstart", handler, true);
    window.addEventListener("keydown", handler, true);
  }

  // Si la page redevient visible, on relance si ON
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && getOn()) {
      start();
      if (master) master.gain.value = getVol();
    }
  });

  // init
  document.addEventListener("DOMContentLoaded", () => {
    isOn = getOn();
    ensureButton();
    updateUI();

    if (isOn) {
      // on prépare le graphe, et on attend le geste
      buildGraph();
      armFirstGesture();

      // Optionnel: si le navigateur autorise, on démarre direct
      start();
      applyVolume(getVol());
    }
  });

  // optionnel : expose une mini API pour debug
  window.VivarioSound = {
    start,
    toggle,
    setVolume: applyVolume
  };
})();