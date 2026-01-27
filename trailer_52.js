/* trailer_52.js — Vivario trailer v5.3
   - garde ce qui marche (audio ok / whoosh ok / défilement ok)
   - FIX : reveal final = logo choisi (vivario_logo.png) + CTA après
*/
(() => {
  const acts = [...document.querySelectorAll(".act")];
  const bar = document.getElementById("bar");
  const btnSkip = document.getElementById("skip");
  const btnMute = document.getElementById("mute");

  const amb = document.getElementById("amb");
  const whooshSoft = document.getElementById("whooshSoft");
  const whooshImpact = document.getElementById("whooshImpact");

  const finalBrand = document.getElementById("finalBrand");
  const finalCta = document.getElementById("finalCta");

  // Durées par act (ms) — total ~25–30s (final pas d'auto)
  const durations = [4300, 4300, 4300, 4700, 4300, 4300, 999999];

  let idx = 0;
  let t = null;

  let isMuted = false;

  // VO (speechSynthesis)
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
    if (isMuted) return;
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

  function safePlay(aud, volume=0.9){
    if (!aud) return;
    try {
      aud.volume = Math.max(0, Math.min(1, volume));
      const p = aud.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {}
  }

  function playAmbience() {
    if (!amb) return;
    try {
      if (isMuted) { amb.pause(); return; }
      amb.volume = 0.55;
      safePlay(amb, 0.55);
    } catch {}
  }

  function showAct(i) {
    idx = Math.max(0, Math.min(i, acts.length - 1));
    acts.forEach((a, k) => a.classList.toggle("active", k === idx));

    // progress
    const progress = Math.round((idx / (acts.length - 1)) * 100);
    if (bar) bar.style.width = `${progress}%`;

    // VO
    speak(qsVoText(acts[idx]));

    // whoosh timing (léger à chaque cut, impact au reveal final)
    if (!isMuted) {
      if (idx === 6) {
        safePlay(whooshImpact, 0.95);
      } else if (idx > 0) {
        safePlay(whooshSoft, 0.55);
      }
    }

    // FINAL reveal
    if (idx === 6) {
      // Brand “wow”
      if (finalBrand) {
        requestAnimationFrame(() => {
          finalBrand.classList.add("is-on");
          // CTA juste après (petit délai cinéma)
          setTimeout(() => finalCta?.classList.add("is-on"), 520);
        });
      }
    } else {
      // reset au cas où
      finalBrand?.classList.remove("is-on");
      finalCta?.classList.remove("is-on");
    }
  }

  function next() {
    if (idx >= acts.length - 1) return;
    showAct(idx + 1);
    schedule();
  }

  function schedule() {
    clearTimeout(t);
    const d = durations[idx] ?? 4300;
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
    if (isMuted) {
      stopSpeech();
      try { amb?.pause?.(); } catch {}
    } else {
      playAmbience();
      speak(qsVoText(acts[idx]));
    }
  });

  // Démarrage auto (sans overlay)
  function start() {
    setMuteUI();
    playAmbience();
    showAct(0);
    schedule();
  }

  // Lance dès que possible (sans casser mobile)
  window.addEventListener("load", start);
})();