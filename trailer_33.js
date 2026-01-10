/* trailer_33.js — Vivario trailer v3.3 (ciné++)
   - Auto-start visuel
   - Fondu noir court entre actes
   - Reveal logo + impact, CTA après
   - Son/VO activable au 1er tap (contrainte mobile)
*/
(() => {
  const acts = [...document.querySelectorAll(".act")];
  const bar = document.getElementById("bar");
  const btnSkip = document.getElementById("skip");
  const btnMute = document.getElementById("mute");
  const amb = document.getElementById("amb");
  const tapSound = document.getElementById("tapSound");
  const fadeBlack = document.getElementById("fadeBlack");

  const finalBrand = document.getElementById("finalBrand");
  const finalCta = document.getElementById("finalCta");

  // Durées ~ 25s
  const durations = [4200, 4100, 4100, 4600, 4300, 4200, 999999];

  let idx = 0;
  let t = null;

  // Audio/VO
  let audioUnlocked = false;
  let isMuted = true; // start mute (mobile)
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
    if (!audioUnlocked || isMuted) return;
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

  function playAmbience() {
    if (!amb) return;
    try {
      if (!audioUnlocked || isMuted) { amb.pause(); return; }
      const p = amb.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {}
  }

  function showTapPill(on){
    if (!tapSound) return;
    tapSound.classList.toggle("is-on", !!on);
  }

  function pulseFade(){
    if (!fadeBlack) return;
    fadeBlack.classList.add("is-on");
    setTimeout(() => fadeBlack.classList.remove("is-on"), 210);
  }

  function showAct(i) {
    idx = Math.max(0, Math.min(i, acts.length - 1));
    acts.forEach((a, k) => a.classList.toggle("active", k === idx));

    // progress
    const progress = Math.round((idx / (acts.length - 1)) * 100);
    if (bar) bar.style.width = `${progress}%`;

    // Final reveal
    if (idx === acts.length - 1) {
      // reset
      finalBrand?.classList.remove("is-on","is-hit");
      finalCta?.classList.remove("is-on");

      // reveal logo
      setTimeout(() => {
        finalBrand?.classList.add("is-on");
        finalBrand?.classList.add("is-hit");
      }, 260);

      // reveal CTA after logo
      setTimeout(() => finalCta?.classList.add("is-on"), 1250);
    } else {
      finalBrand?.classList.remove("is-on","is-hit");
      finalCta?.classList.remove("is-on");
    }

    // VO
    speak(qsVoText(acts[idx]));
  }

  function schedule() {
    clearTimeout(t);
    const d = durations[idx] ?? 4200;
    if (idx >= acts.length - 1) return; // final: stop auto
    t = setTimeout(() => {
      // ciné cut
      pulseFade();
      setTimeout(() => {
        showAct(idx + 1);
        schedule();
      }, 210);
    }, d);
  }

  function goFinal() {
    clearTimeout(t);
    pulseFade();
    setTimeout(() => showAct(acts.length - 1), 210);
  }

  // Controls
  btnSkip?.addEventListener("click", () => goFinal());

  btnMute?.addEventListener("click", () => {
    audioUnlocked = true;     // interaction = unlock
    isMuted = !isMuted;
    setMuteUI();
    if (isMuted) stopSpeech();
    playAmbience();
    showTapPill(false);
    if (!isMuted) speak(qsVoText(acts[idx]));
  });

  // Unlock on first tap anywhere
  function unlockAudioOnce(){
    if (audioUnlocked) return;
    audioUnlocked = true;
    isMuted = false;
    setMuteUI();
    playAmbience();
    showTapPill(false);
    speak(qsVoText(acts[idx]));
    window.removeEventListener("pointerdown", unlockAudioOnce, { passive: true });
    window.removeEventListener("touchstart", unlockAudioOnce, { passive: true });
  }
  window.addEventListener("pointerdown", unlockAudioOnce, { passive: true });
  window.addEventListener("touchstart", unlockAudioOnce, { passive: true });

  // AUTO START VISUEL
  function startAuto(){
    isMuted = true;
    audioUnlocked = false;
    setMuteUI();
    showTapPill(true);
    showAct(0);
    schedule();
  }

  startAuto();
})();