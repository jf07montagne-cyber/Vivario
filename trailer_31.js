/* trailer_v31.js — Vivario trailer v3.1
   - vraie bande annonce (acts + rythme + VO)
   - safe : ne touche à aucune autre page
*/
(() => {
  const acts = [...document.querySelectorAll(".act")];
  const bar = document.getElementById("bar");
  const btnSkip = document.getElementById("skip");
  const btnMute = document.getElementById("mute");
  const amb = document.getElementById("amb");

  const overlay = document.getElementById("startOverlay");
  const btnStart = document.getElementById("btnStart");
  const btnStartMute = document.getElementById("btnStartMute");

  // Durées par act (ms) — total ~25s
  const durations = [4200, 4200, 4200, 4600, 4200, 4200, 999999];

  let idx = 0;
  let t = null;
  let started = false;

  // VO (speechSynthesis)
  let voiceEnabled = true;
  let isMuted = false;
  let speakQueueId = 0;

  function qsVoText(actEl){
    const node = actEl.querySelector("[data-vo]");
    return node ? (node.textContent || "").trim() : "";
  }

  function setMuteUI() {
    btnMute.textContent = isMuted ? "🔇" : "🔊";
    btnMute.setAttribute("aria-label", isMuted ? "Activer le son" : "Couper le son");
  }

  function stopSpeech() {
    try { window.speechSynthesis?.cancel?.(); } catch {}
  }

  function speak(text) {
    if (!voiceEnabled || isMuted) return;
    const s = (text || "").trim();
    if (!s) return;

    // nouvelle "session" de speak, pour éviter chevauchement
    const qid = ++speakQueueId;

    try {
      if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;

      // cancel ce qui joue
      window.speechSynthesis.cancel();

      const u = new SpeechSynthesisUtterance(s);
      u.lang = "fr-FR";
      // réglages “ciné / clinique”
      u.rate = 0.95;
      u.pitch = 0.95;
      u.volume = 0.95;

      // sécurité si on mute en plein milieu
      u.onstart = () => { if (qid !== speakQueueId || isMuted) stopSpeech(); };
      u.onend = () => {};
      u.onerror = () => {};

      window.speechSynthesis.speak(u);
    } catch {}
  }

  function playAmbience() {
    // ambiance mp3 (si présent) — respecte mute
    if (!amb) return;
    try {
      if (isMuted) { amb.pause(); return; }
      const p = amb.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {}
  }

  function showAct(i) {
    idx = Math.max(0, Math.min(i, acts.length - 1));
    acts.forEach((a, k) => a.classList.toggle("active", k === idx));

    // progress
    const progress = Math.round((idx / (acts.length - 1)) * 100);
    if (bar) bar.style.width = `${progress}%`;

    // VO text
    const txt = qsVoText(acts[idx]);
    speak(txt);
  }

  function next() {
    if (idx >= acts.length - 1) return;
    showAct(idx + 1);
    schedule();
  }

  function schedule() {
    clearTimeout(t);
    const d = durations[idx] ?? 4200;
    if (idx >= acts.length - 1) return; // final: pas d'auto
    t = setTimeout(next, d);
  }

  function goFinal() {
    clearTimeout(t);
    showAct(acts.length - 1);
  }

  // Controls
  btnSkip?.addEventListener("click", () => {
    goFinal();
  });

  btnMute?.addEventListener("click", () => {
    isMuted = !isMuted;
    setMuteUI();
    if (isMuted) stopSpeech();
    playAmbience();
  });

  // Start overlay
  function startTrailer({ mute = false } = {}) {
    if (started) return;
    started = true;

    isMuted = !!mute;
    setMuteUI();

    overlay?.classList.add("is-hidden");

    // démarrer ambiance
    playAmbience();

    // lancement
    showAct(0);
    schedule();
  }

  btnStart?.addEventListener("click", () => startTrailer({ mute: false }));
  btnStartMute?.addEventListener("click", () => startTrailer({ mute: true }));

  // Bonus: si l'utilisateur clique directement sur la page
  // on démarre en "mute=false" (il pourra mute)
  window.addEventListener("keydown", (e) => {
    if (started) return;
    if (e.key === "Enter" || e.key === " ") startTrailer({ mute: false });
  });

  // Sécurité : si la page est ouverte sans interaction, on ne lance rien.
  setMuteUI();
})();