(() => {
  const acts = [...document.querySelectorAll(".act")];
  const bar = document.getElementById("bar");
  const btnSkip = document.getElementById("skip");
  const btnMute = document.getElementById("mute");

  const amb = document.getElementById("amb");
  const sfxSoft = document.getElementById("sfxSoft");
  const sfxImpact = document.getElementById("sfxImpact");

  const tapSound = document.getElementById("tapSound");
  const finalBrand = document.getElementById("finalBrand");
  const finalCta = document.getElementById("finalCta");

  const durations = [4300, 4300, 4300, 4700, 4300, 4300, 999999];

  let idx = 0;
  let t = null;

  let soundUnlocked = false;
  let isMuted = false;

  let voiceEnabled = true;
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
    if (!soundUnlocked || !voiceEnabled || isMuted) return;
    const s = (text || "").trim();
    if (!s) return;

    const qid = ++speakQueueId;

    try {
      if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;
      window.speechSynthesis.cancel();

      const u = new SpeechSynthesisUtterance(s);
      u.lang = "fr-FR";
      u.rate = 0.95;
      u.pitch = 0.95;
      u.volume = 0.95;

      u.onstart = () => { if (qid !== speakQueueId || isMuted) stopSpeech(); };
      window.speechSynthesis.speak(u);
    } catch {}
  }

  function safePlay(audioEl, volume = 1) {
    if (!audioEl) return;
    if (!soundUnlocked || isMuted) return;
    try {
      audioEl.volume = Math.max(0, Math.min(1, volume));
      audioEl.currentTime = 0;
      const p = audioEl.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {}
  }

  function playAmbience() {
    if (!amb) return;
    try {
      if (!soundUnlocked || isMuted) { amb.pause(); return; }
      amb.volume = 0.55;
      const p = amb.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {}
  }

  function showTapPill(on) {
    tapSound?.classList.toggle("is-on", !!on);
  }

  function updateProgress() {
    const progress = Math.round((idx / (acts.length - 1)) * 100);
    if (bar) bar.style.width = `${progress}%`;
  }

  function revealFinal() {
    if (finalBrand) finalBrand.classList.add("is-on");
    safePlay(sfxImpact, 0.9);

    setTimeout(() => {
      if (finalCta) finalCta.classList.add("is-on");
    }, 700);
  }

  function showAct(i, { withWhoosh = true } = {}) {
    idx = Math.max(0, Math.min(i, acts.length - 1));
    acts.forEach((a, k) => a.classList.toggle("active", k === idx));
    updateProgress();

    // whoosh sur transitions (sauf intro)
    if (withWhoosh && idx > 0 && idx < acts.length) safePlay(sfxSoft, 0.55);

    speak(qsVoText(acts[idx]));

    if (idx === acts.length - 1) revealFinal();
  }

  function next() {
    if (idx >= acts.length - 1) return;
    showAct(idx + 1);
    schedule();
  }

  function schedule() {
    clearTimeout(t);
    const d = durations[idx] ?? 4300;
    if (idx >= acts.length - 1) return;
    t = setTimeout(next, d);
  }

  function goFinal() {
    clearTimeout(t);
    showAct(acts.length - 1, { withWhoosh: true });
  }

  btnSkip?.addEventListener("click", goFinal);

  btnMute?.addEventListener("click", () => {
    isMuted = !isMuted;
    setMuteUI();
    if (isMuted) stopSpeech();
    playAmbience();
  });

  function unlockSoundOnce() {
    if (soundUnlocked) return;
    soundUnlocked = true;
    showTapPill(false);

    playAmbience();
    safePlay(sfxSoft, 0.22);
    speak(qsVoText(acts[idx]));
  }

  window.addEventListener("pointerdown", unlockSoundOnce, { once: true, passive: true });
  window.addEventListener("touchstart", unlockSoundOnce, { once: true, passive: true });
  window.addEventListener("keydown", (e) => {
    if (soundUnlocked) return;
    if (e.key === "Enter" || e.key === " ") unlockSoundOnce();
  }, { once: true });

  function startVisualAutoplay() {
    finalBrand?.classList.remove("is-on");
    finalCta?.classList.remove("is-on");

    showAct(0, { withWhoosh: false });
    schedule();

    // sur mobile, le son ne peut pas démarrer sans interaction -> on affiche la pill
    showTapPill(true);
  }

  setMuteUI();
  startVisualAutoplay();
})();