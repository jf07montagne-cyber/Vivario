/* trailer_51.js — Vivario trailer v5.1
   - visuel autoplay
   - audio autoplay en muet (ok mobile), puis tap => son + voix
   - whoosh soft à chaque transition, impact sur reveal logo
   - safe : ne touche à aucune autre page
*/
(() => {
  const acts = [...document.querySelectorAll(".act")];
  const bar = document.getElementById("bar");
  const btnSkip = document.getElementById("skip");
  const btnMute = document.getElementById("mute");

  const amb = document.getElementById("amb");
  const whooshSoft = document.getElementById("whooshSoft");
  const whooshImpact = document.getElementById("whooshImpact");

  const tapSound = document.getElementById("tapSound");
  const finalBrand = document.getElementById("finalBrand");
  const finalCta = document.getElementById("finalCta");

  // Durées (ms) — total ~26s puis final sans auto
  const durations = [4200, 4200, 4200, 4600, 4200, 4200, 999999];

  let idx = 0;
  let t = null;

  // audio state
  let isMuted = false;           // mute global (bouton)
  let soundUnlocked = false;     // interaction user
  let ambienceStarted = false;

  // speech
  let speakQueueId = 0;
  let chosenVoice = null;

  function qsVoText(actEl){
    const node = actEl.querySelector("[data-vo]");
    return node ? (node.textContent || "").trim() : "";
  }

  function setMuteUI() {
    btnMute.textContent = isMuted ? "🔇" : "🔊";
    btnMute.setAttribute("aria-label", isMuted ? "Activer le son" : "Couper le son");
  }

  function showTapPill(on){
    if (!tapSound) return;
    tapSound.classList.toggle("is-on", !!on);
  }

  function safePlay(el, { volume = 1, restart = true } = {}) {
    if (!el) return;
    try {
      el.volume = Math.max(0, Math.min(1, volume));
      if (restart) el.currentTime = 0;
      const p = el.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {}
  }

  function stopSpeech() {
    try { window.speechSynthesis?.cancel?.(); } catch {}
  }

  function pickBestVoice() {
    try {
      const voices = window.speechSynthesis?.getVoices?.() || [];
      if (!voices.length) return null;

      // Priorités : FR + Google/Microsoft/Natural/Neural + voix féminine si dispo
      const fr = voices.filter(v => (v.lang || "").toLowerCase().startsWith("fr"));
      const pool = fr.length ? fr : voices;

      const score = (v) => {
        const n = (v.name || "").toLowerCase();
        let s = 0;
        if ((v.lang || "").toLowerCase().startsWith("fr")) s += 50;
        if (n.includes("google")) s += 30;
        if (n.includes("microsoft")) s += 22;
        if (n.includes("natural") || n.includes("neural")) s += 22;
        if (n.includes("denise") || n.includes("julie") || n.includes("amelie") || n.includes("amélie")) s += 16;
        if (n.includes("female") || n.includes("femme")) s += 8;
        if (v.default) s += 4;
        return s;
      };

      return pool.slice().sort((a,b) => score(b)-score(a))[0] || null;
    } catch {
      return null;
    }
  }

  function speak(text) {
    if (!soundUnlocked || isMuted) return;
    const s = (text || "").trim();
    if (!s) return;

    const qid = ++speakQueueId;

    try {
      if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;

      // cancel ce qui joue
      window.speechSynthesis.cancel();

      const u = new SpeechSynthesisUtterance(s);
      u.lang = "fr-FR";

      // réglages “plus humains / apaisants”
      u.rate = 0.92;
      u.pitch = 0.92;
      u.volume = 1.0;

      if (chosenVoice) u.voice = chosenVoice;

      u.onstart = () => { if (qid !== speakQueueId || isMuted) stopSpeech(); };
      u.onerror = () => {};
      u.onend = () => {};

      window.speechSynthesis.speak(u);
    } catch {}
  }

  function startAmbienceMutedAutoplay() {
    if (!amb || ambienceStarted) return;
    ambienceStarted = true;

    // autoplay en muet (autorisé), on le démutera au tap
    try {
      amb.muted = true;
      amb.volume = 0;
      safePlay(amb, { volume: 0, restart: false });
    } catch {}
  }

  function unmuteAmbience() {
    if (!amb) return;
    try {
      amb.muted = false;
      amb.volume = isMuted ? 0 : 0.55;
      // relance si besoin
      safePlay(amb, { volume: amb.volume, restart: false });
    } catch {}
  }

  function showAct(i, { withWhoosh = true } = {}) {
    idx = Math.max(0, Math.min(i, acts.length - 1));

    acts.forEach((a, k) => a.classList.toggle("active", k === idx));

    // progress
    const progress = Math.round((idx / (acts.length - 1)) * 100);
    if (bar) bar.style.width = `${progress}%`;

    // whoosh léger sur transitions (si son unlock + pas mute)
    if (withWhoosh && soundUnlocked && !isMuted) {
      safePlay(whooshSoft, { volume: 0.55, restart: true });
    }

    // final reveal : logo puis CTA
    if (idx === acts.length - 1) {
      finalBrand?.classList.remove("is-on");
      finalCta?.classList.remove("is-on");

      // impact au reveal
      if (soundUnlocked && !isMuted) {
        setTimeout(() => safePlay(whooshImpact, { volume: 0.75, restart: true }), 250);
      }

      setTimeout(() => finalBrand?.classList.add("is-on"), 180);
      setTimeout(() => finalCta?.classList.add("is-on"), 780);
    }

    // VO : si le son est unlock => parle immédiatement sur l'act courant
    speak(qsVoText(acts[idx]));
  }

  function next() {
    if (idx >= acts.length - 1) return;
    showAct(idx + 1, { withWhoosh: true });
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
    showAct(acts.length - 1, { withWhoosh: true });
  }

  // Controls
  btnSkip?.addEventListener("click", () => goFinal());

  btnMute?.addEventListener("click", () => {
    isMuted = !isMuted;
    setMuteUI();

    if (isMuted) {
      stopSpeech();
      if (amb) amb.volume = 0;
    } else {
      if (soundUnlocked) unmuteAmbience();
      // re-parle l'act courant (net)
      speak(qsVoText(acts[idx]));
    }
  });

  // Unlock sound on first user gesture (tap/click/keydown)
  function unlockSoundOnce() {
    if (soundUnlocked) return;
    soundUnlocked = true;
    showTapPill(false);

    // choisir meilleure voix
    chosenVoice = pickBestVoice();

    // relance ambience en son
    unmuteAmbience();

    // parle tout de suite (dès le début, comme tu veux)
    speak(qsVoText(acts[idx]));
  }

  ["pointerdown","touchstart","mousedown","keydown"].forEach(evt => {
    window.addEventListener(evt, (e) => {
      // ignore ctrl/alt combos
      if (evt === "keydown") {
        const k = e.key || "";
        if (!(k === "Enter" || k === " " || k === "Spacebar")) return;
      }
      unlockSoundOnce();
    }, { passive: true });
  });

  // Voices list may load async on some browsers
  try {
    window.speechSynthesis?.addEventListener?.("voiceschanged", () => {
      if (!chosenVoice) chosenVoice = pickBestVoice();
    });
  } catch {}

  // AUTOSTART VISUEL
  function startVisualAutoplay() {
    setMuteUI();
    startAmbienceMutedAutoplay(); // muet auto OK
    showTapPill(true);            // invite à activer le son

    // démarre la timeline visuelle
    showAct(0, { withWhoosh: false });
    schedule();
  }

  // petit délai pour éviter flash au load
  setTimeout(startVisualAutoplay, 250);
})();