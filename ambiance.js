/* Vivario — ambiance.js (v18)
   ✅ Bouton ambiance FIXE (haut droite), discret, sur toutes les pages
   ✅ Lecture audio loop, compatible Android/iOS (unlock + play)
   ✅ Cycle : Calme → Océan → Focus → Deep
   ✅ Persistance : track + on/off + volume
*/
(() => {
  const LS_ON = "vivario_amb_on";
  const LS_TRACK = "vivario_amb_track";
  const LS_VOL = "vivario_amb_vol";

  const TRACKS = [
    { name: "Calme", keys: ["ambience.mp3","ambiance.mp3"] },
    { name: "Océan", keys: ["ambience_ocean.mp3","ambiance_ocean.mp3"] },
    { name: "Focus", keys: ["ambience_focus.mp3","ambiance_focus.mp3"] },
    { name: "Deep",  keys: ["ambience_deep.mp3","ambiance_deep.mp3"] }
  ];

  const S = (window.__VIVARIO_AMB__ ||= {
    audio: null,
    isOn: localStorage.getItem(LS_ON) === "1",
    trackName: localStorage.getItem(LS_TRACK) || "Calme",
    volume: Math.max(0, Math.min(1, Number(localStorage.getItem(LS_VOL) || "0.55"))),
    lastTap: 0
  });

  function ensureAudio(){
    if (S.audio) return S.audio;

    const a = document.createElement("audio");
    a.loop = true;
    a.preload = "auto";
    a.crossOrigin = "anonymous";
    a.volume = S.volume;

    // évite les blocages iOS: tente "playsinline"
    a.setAttribute("playsinline", "");
    a.setAttribute("webkit-playsinline", "");

    S.audio = a;
    return a;
  }

  function pickTrack(name){
    const t = TRACKS.find(x => x.name.toLowerCase() === String(name||"").toLowerCase());
    return t || TRACKS[0];
  }

  async function trySetSrcForTrack(track){
    const a = ensureAudio();
    const candidates = track.keys || [];

    // On essaie les sources une par une (sans fetch)
    for (const src of candidates){
      try{
        a.src = src;
        a.load();
        // petit test: on attend un micro moment; si erreur immédiate, on passe
        await new Promise(res => setTimeout(res, 40));
        return true;
      }catch{}
    }
    return false;
  }

  function toast(msg){
    try{
      let el = document.getElementById("viv-amb-toast");
      if (!el){
        el = document.createElement("div");
        el.id = "viv-amb-toast";
        el.style.cssText = `
          position:fixed; right:14px; top:62px; z-index:99999;
          background:rgba(10,18,38,.88); color:#fff;
          padding:10px 12px; border-radius:12px;
          font: 600 12px/1.2 system-ui, -apple-system, Segoe UI, Roboto;
          box-shadow:0 12px 32px rgba(0,0,0,.35);
          opacity:0; transform: translateY(-6px);
          transition: opacity .18s ease, transform .18s ease;
          pointer-events:none;
        `;
        document.body.appendChild(el);
      }
      el.textContent = msg;
      requestAnimationFrame(() => {
        el.style.opacity = "1";
        el.style.transform = "translateY(0)";
      });
      setTimeout(() => {
        el.style.opacity = "0";
        el.style.transform = "translateY(-6px)";
      }, 1200);
    }catch{}
  }

  function injectButtonCSS(){
    if (document.getElementById("viv-amb-css")) return;
    const st = document.createElement("style");
    st.id = "viv-amb-css";
    st.textContent = `
      .viv-amb-btn{
        position:fixed;
        top:12px; right:12px;
        z-index:99998;
        display:flex; align-items:center; gap:8px;
        padding:8px 10px;
        border-radius:999px;
        border:1px solid rgba(255,255,255,.14);
        background: rgba(10,18,38,.55);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        color:#fff;
        font: 800 12px/1 system-ui, -apple-system, Segoe UI, Roboto;
        letter-spacing:.2px;
        box-shadow: 0 10px 28px rgba(0,0,0,.28);
        cursor:pointer;
        user-select:none;
      }
      .viv-amb-btn:active{ transform: translateY(1px); }
      .viv-amb-dot{
        width:10px; height:10px; border-radius:99px;
        background: rgba(255,255,255,.25);
        box-shadow: inset 0 0 0 2px rgba(255,255,255,.14);
      }
      .viv-amb-btn.is-on .viv-amb-dot{
        background: rgba(80,255,180,.9);
        box-shadow: 0 0 0 4px rgba(80,255,180,.18);
      }
      .viv-amb-name{ opacity:.9; font-weight:900; }
      .viv-amb-icon{ opacity:.95; }
    `;
    document.head.appendChild(st);
  }

  function renderButton(){
    injectButtonCSS();
    if (document.getElementById("vivAmbBtn")) return;

    const btn = document.createElement("button");
    btn.id = "vivAmbBtn";
    btn.type = "button";
    btn.className = "viv-amb-btn";
    btn.innerHTML = `
      <span class="viv-amb-dot"></span>
      <span class="viv-amb-icon">🎧</span>
      <span class="viv-amb-name"></span>
    `;
    document.body.appendChild(btn);

    const nameEl = btn.querySelector(".viv-amb-name");

    const sync = () => {
      btn.classList.toggle("is-on", !!S.isOn);
      if (nameEl) nameEl.textContent = S.trackName;
    };
    sync();

    // click = toggle
    btn.addEventListener("click", async () => {
      await toggle();
      sync();
    });

    // double-tap rapide = change track
    btn.addEventListener("pointerdown", async () => {
      const now = Date.now();
      if (now - S.lastTap < 320){
        await nextTrack();
        sync();
      }
      S.lastTap = now;
    }, { passive:true });
  }

  async function setTrackByName(name){
    const t = pickTrack(name);
    S.trackName = t.name;
    localStorage.setItem(LS_TRACK, S.trackName);

    await trySetSrcForTrack(t);

    // si ambiance ON => relance sur le nouveau track
    if (S.isOn){
      await play();
      toast(`Ambiance : ${S.trackName}`);
    }
  }

  async function nextTrack(){
    const idx = TRACKS.findIndex(x => x.name === S.trackName);
    const next = TRACKS[(idx >= 0 ? idx + 1 : 0) % TRACKS.length];
    await setTrackByName(next.name);
  }

  async function play(){
    const a = ensureAudio();

    // si pas de src (premier lancement)
    if (!a.src){
      await setTrackByName(S.trackName || "Calme");
    }

    // unlock audio context si dispo
    try { await window.VivarioSound?.unlock?.(); } catch {}

    try{
      await a.play();
      S.isOn = true;
      localStorage.setItem(LS_ON, "1");
      return true;
    }catch(e){
      // Sur mobile: play doit être déclenché par un geste utilisateur (on est dans un click => ok)
      S.isOn = false;
      localStorage.setItem(LS_ON, "0");
      toast("Son bloqué : retape une fois.");
      return false;
    }
  }

  function stop(){
    const a = ensureAudio();
    try{ a.pause(); }catch{}
    S.isOn = false;
    localStorage.setItem(LS_ON, "0");
  }

  async function toggle(){
    if (S.isOn){
      stop();
      toast("Ambiance : OFF");
      return;
    }
    await play();
    toast(`Ambiance : ${S.trackName}`);
  }

  function setVolume(v){
    const a = ensureAudio();
    S.volume = Math.max(0, Math.min(1, Number(v)));
    localStorage.setItem(LS_VOL, String(S.volume));
    a.volume = S.volume;
  }

  function boot(){
    renderButton();
    ensureAudio();
    setVolume(S.volume);

    // applique track stocké
    setTrackByName(S.trackName || "Calme");

    // si était ON => tente de relancer (mais certains navigateurs exigeront un tap)
    if (S.isOn){
      // on n’insiste pas trop, on attend un geste utilisateur
      // l’utilisateur peut juste appuyer sur le bouton pour lancer
      stop();
      S.isOn = false;
      localStorage.setItem(LS_ON, "0");
    }
  }

  // API attendue par sound.js
  window.VivarioAmbience = {
    toggle,
    setTrackByName,
    nextTrack,
    setVolume
  };

  document.addEventListener("DOMContentLoaded", boot);
  window.addEventListener("pageshow", boot);
})();