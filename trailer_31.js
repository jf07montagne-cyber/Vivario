/* trailer_31.js — Vivario trailer v3.1 AUTO
   - autoplay VISUEL (sans clic)
   - audio/voix : activables au 1er tap (limitations mobiles)
   - reveal logo final puis CTA après
   - safe : ne touche à aucune autre page
*/
(() => {
  const acts = [...document.querySelectorAll(".act")];
  const bar = document.getElementById("bar");
  const btnSkip = document.getElementById("skip");
  const btnMute = document.getElementById("mute");
  const amb = document.getElementById("amb");

  // Overlay optional (peut rester dans le HTML)
  const overlay = document.getElementById("startOverlay");

  // CTA reveal
  const finalBrand = document.querySelector(".act-final .finalBrand");
  const finalCta = document.querySelector(".act-final .cta");

  // Durées par act (ms) — total ~25s
  const durations = [4200, 4200, 4200, 4600, 4200, 4200, 999999];

  let idx = 0;
  let t = null;
  let started = false;

  // Audio/VO
  let voiceEnabled = true;
  let isMuted = true;            // 🔇 par défaut (autoplay safe)
  let audioUnlocked = false;     // devient true après interaction
  let speakQueueId = 0;

  // petit bandeau “tap pour activer le son”
  let tapPill = null;

  function ensureTapPill(){
    if (tapPill) return tapPill;
    tapPill = document.createElement("div");
    tapPill.className = "tapSound";
    tapPill.textContent = "🔊 Appuie pour activer le son";
    document.querySelector(".trailer")?.appendChild(tapPill);
    return tapPill;
  }
  function showTapPill(on){
    const el = ensureTapPill();
    el.classList.toggle("is-on", !!on);
  }

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
    if (!voiceEnabled || isMuted) return;
    if (!audioUnlocked) return; // pas d'interaction -> évite bugs sur mobile
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
    if (isMuted) { try { amb.pause(); } catch {} return; }
    if (!audioUnlocked) return;

    try {
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

    // final reveal sequencing
    if (idx === acts.length - 1) {
      // logo d'abord, puis boutons
      if (finalBrand) finalBrand.classList.remove("is-on");
      if (finalCta) finalCta.classList.remove("is-on");

      setTimeout(() => { finalBrand?.classList.add("is-on"); }, 350);
      setTimeout(() => { finalCta?.classList.add("is-on"); }, 1100);
    }

    // VO
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
    if (idx >= acts.length - 1) return;
    t = setTimeout(next, d);
  }

  function goFinal() {
    clearTimeout(t);
    showAct(acts.length - 1);
    showTapPill(false);
  }

  // Controls
  btnSkip?.addEventListener("click", () => goFinal());

  btnMute?.addEventListener("click", () => {
    isMuted = !isMuted;
    setMuteUI();
    if (isMuted) stopSpeech();
    playAmbience();
  });

  // Déverrouillage audio au 1er tap/clic
  function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    showTapPill(false);
    playAmbience();

    // relire la VO du screen actuel si on vient d'activer
    if (!isMuted) {
      const txt = qsVoText(acts[idx]);
      speak(txt);
    }
  }

  // Interaction globale : unlock
  window.addEventListener("pointerdown", unlockAudio, { passive:true });
  window.addEventListener("touchstart", unlockAudio, { passive:true });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") unlockAudio();
  });

  // Autoplay (VISUEL) — on démarre automatiquement en mute
  function startAutoplay() {
    if (started) return;
    started = true;

    // cache l'overlay si présent (on garde ton HTML intact)
    overlay?.classList.add("is-hidden");

    // mute par défaut (autoplay safe)
    isMuted = true;
    setMuteUI();

    showTapPill(true);

    // lancement
    showAct(0);
    schedule();
  }

  // Lance automatiquement après chargement
  setMuteUI();
  window.addEventListener("load", () => {
    setTimeout(startAutoplay, 450);
  });
})();