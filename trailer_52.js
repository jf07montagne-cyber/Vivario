/* trailer_52.js — Vivario trailer (v5.x)
   Patch principal : reveal final OK + CTA visibles
*/
(() => {
  const acts = [...document.querySelectorAll(".act")];
  const bar = document.getElementById("bar");
  const btnSkip = document.getElementById("skip");
  const btnMute = document.getElementById("mute");

  const amb = document.getElementById("amb");      // ambiance
  const sWhoosh = document.getElementById("sfx_whoosh");   // optionnel
  const sImpact = document.getElementById("sfx_impact");   // optionnel

  // Final reveal nodes (si présents)
  const finalAct = document.querySelector('.act-final');
  const finalBrand = finalAct?.querySelector('.finalBrand');
  const finalCta = finalAct?.querySelector('.cta');

  // Durées par act (ms) — adapte si tu as modifié tes acts
  // IMPORTANT : dernière valeur = très longue (pas d'auto sur final)
  const durations = [4200, 4200, 4200, 4600, 4200, 4200, 999999];

  let idx = 0;
  let t = null;

  // VO
  let voiceEnabled = true;
  let isMuted = false;
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
    if (!voiceEnabled || isMuted) return;
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
      u.onend = () => {};
      u.onerror = () => {};

      window.speechSynthesis.speak(u);
    } catch {}
  }

  function safePlay(audioEl, volume=1) {
    if (!audioEl) return;
    try {
      audioEl.volume = volume;
      if (isMuted) { audioEl.pause(); return; }
      const p = audioEl.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {}
  }

  function playAmbience() {
    safePlay(amb, 0.9);
  }

  function sfxSoft() {
    if (!sWhoosh) return;
    try { sWhoosh.currentTime = 0; } catch {}
    safePlay(sWhoosh, 0.75);
  }

  function sfxImpact() {
    if (!sImpact) return;
    try { sImpact.currentTime = 0; } catch {}
    safePlay(sImpact, 0.85);
  }

  function showAct(i) {
    idx = Math.max(0, Math.min(i, acts.length - 1));
    acts.forEach((a, k) => a.classList.toggle("active", k === idx));

    // progress
    const progress = Math.round((idx / (acts.length - 1)) * 100);
    if (bar) bar.style.width = `${progress}%`;

    // VO
    const txt = qsVoText(acts[idx]);
    speak(txt);

    // SFX transitions (léger)
    if (idx > 0 && idx < acts.length - 1) sfxSoft();

    // Final reveal
    if (idx === acts.length - 1) {
      // petit impact au reveal
      sfxImpact();

      // active reveal classes (si présent)
      if (finalBrand) finalBrand.classList.add("is-on");
      // CTA après logo (léger délai)
      if (finalCta) {
        finalCta.classList.remove("is-on");
        setTimeout(() => finalCta.classList.add("is-on"), 650);
      }
    }
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
  }

  // Controls
  btnSkip?.addEventListener("click", () => goFinal());

  btnMute?.addEventListener("click", () => {
    isMuted = !isMuted;
    setMuteUI();
    if (isMuted) stopSpeech();
    playAmbience();
  });

  // Auto start (sans overlay) : lance la bande-annonce
  // (audio peut être bloqué tant qu'il n'y a pas d'interaction — normal sur mobile)
  function startTrailer() {
    // ambience tente de jouer (si bloqué, ça partira au premier tap)
    playAmbience();
    showAct(0);
    schedule();
  }

  // Premier chargement
  setMuteUI();
  startTrailer();

  // Si l'utilisateur interagit, on retente ambiance (utile sur mobile)
  const kick = () => { playAmbience(); window.removeEventListener("pointerdown", kick); };
  window.addEventListener("pointerdown", kick, { passive:true });

})();