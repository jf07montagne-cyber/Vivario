/* trailer_31.js — Vivario trailer (autoplay safe)
   - démarre automatiquement (visuel)
   - audio/voix: se lance dès que l'utilisateur touche (mobile friendly)
   - tue toute ancienne startOverlay si elle existe
*/
(() => {
  const acts = [...document.querySelectorAll(".act")];
  const bar = document.getElementById("bar");
  const btnSkip = document.getElementById("skip");
  const btnMute = document.getElementById("mute");
  const amb = document.getElementById("amb");

  // ✅ Si une ancienne overlay existe encore (cache / vieux HTML), on la supprime
  const legacyOverlay = document.getElementById("startOverlay") || document.querySelector(".startOverlay");
  if (legacyOverlay) {
    try { legacyOverlay.remove(); } catch { legacyOverlay.style.display = "none"; }
  }

  // Durées par act (ms) — total ~25s (final reste fixe)
  const durations = [4200, 4200, 4200, 4600, 4200, 4200, 999999];

  let idx = 0;
  let t = null;

  // Audio / VO
  let isMuted = false;
  let userInteracted = false; // mobile: audio bloqué tant que pas d'interaction
  let voiceEnabled = true;
  let speakQueueId = 0;

  function qsVoText(actEl){
    const node = actEl.querySelector("[data-vo]");
    return node ? (node.textContent || "").trim() : "";
  }

  function setMuteUI() {
    if (!btnMute) return;
    btnMute.textContent = isMuted ? "🔇" : "🔊";
    btnMute.setAttribute("aria-label", isMuted ? "Activer le son" : "Couper le son");
  }

  function stopSpeech() {
    try { window.speechSynthesis?.cancel?.(); } catch {}
  }

  function speak(text) {
    if (!voiceEnabled || isMuted || !userInteracted) return;
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
    if (!userInteracted) return; // mobile autoplay bloque
    try {
      if (isMuted) { amb.pause(); return; }
      const p = amb.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {}
  }

  function showAct(i) {
    idx = Math.max(0, Math.min(i, acts.length - 1));
    acts.forEach((a, k) => a.classList.toggle("active", k === idx));

    const progress = Math.round((idx / (acts.length - 1)) * 100);
    if (bar) bar.style.width = `${progress}%`;

    speak(qsVoText(acts[idx]));
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
  btnSkip?.addEventListener("click", () => goFinal());

  btnMute?.addEventListener("click", () => {
    isMuted = !isMuted;
    setMuteUI();
    if (isMuted) stopSpeech();
    playAmbience();
  });

  // ✅ Autoplay visuel dès chargement
  function startVisualAutoplay() {
    showAct(0);
    schedule();
  }

  // ✅ Dès la première interaction, on active audio + voix (si pas mute)
  function onFirstInteraction() {
    if (userInteracted) return;
    userInteracted = true;
    playAmbience();
    // rejoue la VO de l'act en cours
    speak(qsVoText(acts[idx]));
    window.removeEventListener("pointerdown", onFirstInteraction);
    window.removeEventListener("touchstart", onFirstInteraction);
    window.removeEventListener("keydown", onFirstInteraction);
  }

  window.addEventListener("pointerdown", onFirstInteraction, { passive: true });
  window.addEventListener("touchstart", onFirstInteraction, { passive: true });
  window.addEventListener("keydown", onFirstInteraction);

  setMuteUI();
  startVisualAutoplay();
})();