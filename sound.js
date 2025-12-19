/* Vivario — sound.js (v1.2) : ambiance intégrée (SANS mp3), fiable mobile
   - Génère un fond "vent/mer" via WebAudio (bruit filtré)
   - Toggle ON/OFF persistant
   - Volume + "Boost" pour bien entendre sur mobile
   - Démarre au 1er geste utilisateur (obligation navigateur mobile)
*/

(() => {
  const KEY_ON = "vivario_sound_on";
  const KEY_VOL = "vivario_sound_vol";
  const KEY_BOOST = "vivario_sound_boost";

  let ctx = null;
  let masterGain = null;
  let boostGain = null;

  let noiseSrc = null;
  let noiseGain = null;
  let filter1 = null;
  let filter2 = null;
  let lfo = null;
  let lfoGain = null;

  let started = false;   // audio graph construit
  let armed = false;     // en attente geste utilisateur

  function getOn() {
    const v = localStorage.getItem(KEY_ON);
    return v === null ? true : v === "1";
  }
  function setOn(v) {
    localStorage.setItem(KEY_ON, v ? "1" : "0");
  }

  function getVol() {
    const v = Number(localStorage.getItem(KEY_VOL));
    // volume par défaut volontairement plus haut sur mobile
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.65;
  }
  function setVol(v) {
    localStorage.setItem(KEY_VOL, String(Math.min(1, Math.max(0, v))));
  }

  function getBoost() {
    const v = Number(localStorage.getItem(KEY_BOOST));
    // boost par défaut = 1.6 (plus audible)
    return Number.isFinite(v) ? Math.min(3, Math.max(1, v)) : 1.6;
  }
  function setBoost(v) {
    localStorage.setItem(KEY_BOOST, String(Math.min(3, Math.max(1, v))));
  }

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();

    masterGain = ctx.createGain();
    masterGain.gain.value = getVol();

    boostGain = ctx.createGain();
    boostGain.gain.value = getBoost();

    // Chaîne finale : sources -> ... -> boost -> master -> destination
    boostGain.connect(masterGain);
    masterGain.connect(ctx.destination);

    return ctx;
  }

  function makePinkNoiseBuffer(context, seconds = 2) {
    // Pink-ish noise (simple filtering). Suffisant pour ambiance douce.
    const sampleRate = context.sampleRate;
    const length = Math.floor(sampleRate * seconds);
    const buffer = context.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      b6 = white * 0.115926;
      data[i] = (pink * 0.11); // niveau de base (on ajuste ensuite via gains)
    }
    return buffer;
  }

  function buildGraph() {
    if (started) return;

    const c = ensureCtx();

    // source bruit
    noiseSrc = c.createBufferSource();
    noiseSrc.buffer = makePinkNoiseBuffer(c, 2.5);
    noiseSrc.loop = true;

    // filtre type "vent/mer" : lowpass + bandpass léger
    filter1 = c.createBiquadFilter();
    filter1.type = "lowpass";
    filter1.frequency.value = 900;
    filter1.Q.value = 0.8;

    filter2 = c.createBiquadFilter();
    filter2.type = "bandpass";
    filter2.frequency.value = 220;
    filter2.Q.value = 0.6;

    // amplitude de base (ambiance douce)
    noiseGain = c.createGain();
    noiseGain.gain.value = 0.22;

    // LFO (vague lente) -> bouge doucement le volume
    lfo = c.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.065; // ~15s
    lfoGain = c.createGain();
    lfoGain.gain.value = 0.10; // amplitude du mouvement

    lfo.connect(lfoGain);
    lfoGain.connect(noiseGain.gain);

    // Connexions
    noiseSrc.connect(filter1);
    filter1.connect(filter2);
    filter2.connect(noiseGain);
    noiseGain.connect(boostGain);

    // start
    noiseSrc.start();
    lfo.start();

    started = true;
  }

  async function resumeAndPlay() {
    if (!getOn()) return;

    ensureCtx();
    buildGraph();

    try {
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      armed = false;
      updateUI();
    } catch (e) {
      armed = true;
      updateUI();
    }
  }

  function pause() {
    if (!ctx) return;
    // sur WebAudio on "suspend" (plus fiable que stop/recreate)
    ctx.suspend().catch(() => {});
    updateUI();
  }

  function toggle() {
    const next = !getOn();
    setOn(next);
    if (next) {
      resumeAndPlay();
    } else {
      pause();
    }
    updateUI();
  }

  // UI : bouton flottant + mini menu volume/boost (simple + fiable)
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

    btn.addEventListener("click", toggle);

    // long press / double tap => ouvre réglages
    let lastTap = 0;
    btn.addEventListener("pointerdown", () => {
      const now = Date.now();
      if (now - lastTap < 350) openPanel();
      lastTap = now;
    });

    document.body.appendChild(btn);
    return btn;
  }

  function ensurePanel() {
    let p = document.getElementById("soundPanel");
    if (p) return p;

    p = document.createElement("div");
    p.id = "soundPanel";
    p.style.position = "fixed";
    p.style.right = "14px";
    p.style.top = "58px";
    p.style.zIndex = "9999";
    p.style.width = "240px";
    p.style.padding = "12px";
    p.style.borderRadius = "16px";
    p.style.border = "1px solid rgba(255,255,255,.14)";
    p.style.background = "rgba(20,25,35,.72)";
    p.style.backdropFilter = "blur(12px)";
    p.style.boxShadow = "0 18px 45px rgba(0,0,0,.35)";
    p.style.color = "#fff";
    p.style.display = "none";

    p.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
        <div style="font-weight:700">Réglages son</div>
        <button id="soundClose" type="button"
          style="background:transparent;border:0;color:#fff;font-size:18px;cursor:pointer">✕</button>
      </div>

      <div style="height:10px"></div>

      <div style="font-size:12px;opacity:.85;margin-bottom:6px">Volume</div>
      <input id="soundVol" type="range" min="0" max="1" step="0.01" style="width:100%">

      <div style="height:12px"></div>

      <div style="font-size:12px;opacity:.85;margin-bottom:6px">Boost (si tu n’entends pas)</div>
      <input id="soundBoost" type="range" min="1" max="3" step="0.05" style="width:100%">

      <div style="height:12px"></div>

      <div style="font-size:12px;opacity:.75;line-height:1.35">
        Astuce : si tu n’entends rien, mets Boost à 2.2 puis Volume à 0.8.
      </div>
    `;

    document.body.appendChild(p);

    p.querySelector("#soundClose").addEventListener("click", closePanel);

    const vol = p.querySelector("#soundVol");
    const bst = p.querySelector("#soundBoost");

    vol.value = String(getVol());
    bst.value = String(getBoost());

    vol.addEventListener("input", () => {
      const v = Number(vol.value);
      setVol(v);
      if (masterGain) masterGain.gain.value = v;
    });

    bst.addEventListener("input", () => {
      const v = Number(bst.value);
      setBoost(v);
      if (boostGain) boostGain.gain.value = v;
    });

    return p;
  }

  function openPanel() {
    const p = ensurePanel();
    p.style.display = "block";
  }
  function closePanel() {
    const p = ensurePanel();
    p.style.display = "none";
  }

  function updateUI() {
    const btn = document.getElementById("soundToggle");
    if (!btn) return;

    const on = getOn();
    const icon = on ? "🔊" : "🔇";
    const status =
      !on ? "Son OFF" :
      armed ? "Touchez l’écran" :
      (ctx && ctx.state === "running") ? "Son ON" : "Son ON";

    btn.textContent = `${icon} ${status}`;
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  // Démarrage mobile : on doit capter un geste utilisateur
  function armOnFirstUserGesture() {
    if (armOnFirstUserGesture._installed) return;
    armOnFirstUserGesture._installed = true;

    const handler = async () => {
      if (!getOn()) return;
      await resumeAndPlay();
      window.removeEventListener("pointerdown", handler, true);
      window.removeEventListener("touchstart", handler, true);
      window.removeEventListener("keydown", handler, true);
    };

    window.addEventListener("pointerdown", handler, true);
    window.addEventListener("touchstart", handler, true);
    window.addEventListener("keydown", handler, true);
  }

  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.visibilityState === "visible") {
      if (getOn()) resumeAndPlay();
    }
  });

  document.addEventListener("DOMContentLoaded", () => {
    ensureButton();
    ensurePanel();
    updateUI();
    armOnFirstUserGesture();

    // On tente, mais mobile bloquera souvent => armed
    resumeAndPlay();
  });
})();