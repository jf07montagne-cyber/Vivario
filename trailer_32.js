/* trailer_32.js — Vivario trailer v3.2 (ciné)
   - Auto-start visuel (mobile safe)
   - Son/voix : activables au 1er tap (contrainte navigateur)
   - Reveal logo puis CTA après
   - Safe : ne touche à aucune autre page
*/
(() => {
  const acts = [...document.querySelectorAll(".act")];
  const bar = document.getElementById("bar");
  const btnSkip = document.getElementById("skip");
  const btnMute = document.getElementById("mute");
  const amb = document.getElementById("amb");
  const tapSound = document.getElementById("tapSound");

  const finalBrand = document.getElementById("finalBrand");
  const finalCta = document.getElementById("finalCta");

  // Durées (ms) ~ 25s
  const durations = [4200, 4100, 4100, 4600, 4300, 4200, 999999];

  let idx = 0;
  let t = null;

  // Audio/VO
  let audioUnlocked = false; // devient true après interaction
  let isMuted = true;        // on démarre MUET (mobile)
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

  function showAct(i) {
    idx = Math.max(0, Math.min(i, acts.length - 1));
    acts.forEach((a, k) => a.classList.toggle("active", k === idx));

    // progress (par acte)
    const progress = Math.round((idx / (acts.length - 1)) * 100);
    if (bar) bar.style.width = `${progress}%`;

    // Final reveal
    if (idx === acts.length - 1) {
      // logo puis CTA après
      setTimeout(() => finalBrand?.classList.add("is-on"), 220);
      setTimeout(() => finalCta?.classList.add("is-on"), 1150);
    } else {
      finalBrand?.classList.remove("is-on");
      finalCta?.classList.remove("is-on");
    }

    // VO
    speak(qsVoText(acts[idx]));
  }

  function schedule() {
    clearTimeout(t);
    const d = durations[idx] ?? 4200;
    if (idx >= acts.length - 1) return; // final: pas d'auto
    t = setTimeout(() => {
      showAct(idx + 1);
      schedule();
    }, d);
  }

  function goFinal() {
    clearTimeout(t);
    showAct(acts.length - 1);
  }

  // Controls
  btnSkip?.addEventListener("click", () => goFinal());

  btnMute?.addEventListener("click", () => {
    // si l’utilisateur clique, on considère le son “débloqué”
    audioUnlocked = true;
    isMuted = !isMuted;
    setMuteUI();
    if (isMuted) stopSpeech();
    playAmbience();
    showTapPill(false);

    // relance la VO de l'acte courant si on vient d'activer
    if (!isMuted) speak(qsVoText(acts[idx]));
  });

  // Unlock audio on first interaction (tap)
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

  // AUTO-START VISUEL (sans overlay)
  function startAuto() {
    // on démarre muet, et on affiche le pill
    isMuted = true;
    audioUnlocked = false;
    setMuteUI();
    showTapPill(true);

    showAct(0);
    schedule();
  }

  // Boot
  startAuto();
})();