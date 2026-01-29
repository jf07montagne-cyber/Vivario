/* trailer_52.js — Vivario trailer v5.4 (patch logo reveal)
   - garde le comportement actuel (acts + progress + VO + sons)
   - patch : injecte vivario_logo.png au final + reveal ciné plus marqué
   - ne casse rien si certains éléments audio/HTML sont absents
*/
(() => {
  const acts = [...document.querySelectorAll(".act")];
  const bar = document.getElementById("bar");
  const btnSkip = document.getElementById("skip");
  const btnMute = document.getElementById("mute");

  // Ambiance + whoosh (IDs tolérants)
  const amb = document.getElementById("amb") || document.getElementById("ambience") || document.querySelector("audio[data-amb]");
  const whooshSoft = document.getElementById("whooshSoft") || document.getElementById("whoosh_soft") || document.querySelector("audio[data-whoosh='soft']");
  const whooshHit  = document.getElementById("whooshHit")  || document.getElementById("whoosh_hit")  || document.querySelector("audio[data-whoosh='hit']");

  // “Tap to enable sound” pill (si présent)
  const tapSound = document.querySelector(".tapSound");

  // Durées par act (ms) — adapte si tu as +/− d’acts
  const defaultDur = 4200;
  const durations = acts.map((_, i) => {
    // dernier act = final, pas d’auto
    if (i === acts.length - 1) return 999999;
    // rythme un peu plus fluide (évite haché)
    if (i === 3) return 4600;
    return defaultDur;
  });

  let idx = 0;
  let t = null;
  let started = false;

  // Voice
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

  function pickBestVoice() {
    try{
      const synth = window.speechSynthesis;
      if (!synth || !synth.getVoices) return null;
      const voices = synth.getVoices() || [];
      if (!voices.length) return null;

      // On privilégie une voix FR “naturelle” si dispo
      const preferred = voices.find(v => /fr/i.test(v.lang) && /Google|Microsoft|Natural|Neural|Siri|Audrey|Thomas|Amelie|Denise/i.test(v.name));
      return preferred || voices.find(v => /fr/i.test(v.lang)) || voices[0];
    } catch {
      return null;
    }
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

      // Réglages (on garde ton rendu actuel, juste un poil plus doux)
      u.rate = 0.95;
      u.pitch = 0.95;
      u.volume = 0.95;

      const v = pickBestVoice();
      if (v) u.voice = v;

      u.onstart = () => { if (qid !== speakQueueId || isMuted) stopSpeech(); };
      u.onerror = () => {};

      window.speechSynthesis.speak(u);
    } catch {}
  }

  function safePlay(audioEl, vol = 1) {
    if (!audioEl) return false;
    try{
      audioEl.volume = Math.max(0, Math.min(1, vol));
      const p = audioEl.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  function playAmbience() {
    if (!amb) return false;
    if (isMuted) { try{ amb.pause(); }catch{} return false; }
    return safePlay(amb, 0.65);
  }

  function playWhoosh(type = "soft") {
    if (isMuted) return;
    const el = type === "hit" ? whooshHit : whooshSoft;
    if (!el) return;
    try{
      el.currentTime = 0;
    }catch{}
    safePlay(el, type === "hit" ? 0.9 : 0.55);
  }

  function showTapSound(on) {
    if (!tapSound) return;
    tapSound.classList.toggle("is-on", !!on);
  }

  // progress (simple)
  function setProgressByIdx(i) {
    if (!bar || acts.length <= 1) return;
    const pct = Math.round((i / (acts.length - 1)) * 100);
    bar.style.width = `${pct}%`;
  }

  // PATCH: logo final inject (vivario_logo.png)
  function ensureFinalLogo() {
    const finalAct = acts[acts.length - 1];
    if (!finalAct) return;

    const brand = finalAct.querySelector(".finalBrand");
    if (!brand) return;

    // si déjà présent, ne touche pas
    if (brand.querySelector(".finalIcon img")) return;

    const wrap = document.createElement("div");
    wrap.className = "finalIcon";

    const img = document.createElement("img");
    img.src = "vivario_logo.png";     // ✅ ton nom de fichier
    img.alt = "Vivario";
    img.loading = "eager";
    img.decoding = "async";

    wrap.appendChild(img);

    // placer l’icône au-dessus du titre
    brand.insertBefore(wrap, brand.firstChild);
  }

  function revealFinalSequence() {
    const finalAct = acts[acts.length - 1];
    if (!finalAct) return;

    const brand = finalAct.querySelector(".finalBrand");
    const cta = finalAct.querySelector(".cta");
    if (!brand) return;

    // patch logo
    ensureFinalLogo();

    // reset classes
    brand.classList.remove("is-on");
    cta?.classList.remove("is-on");

    // “impact” au reveal + reveal étagé
    setTimeout(() => {
      brand.classList.add("is-on");
      playWhoosh("hit");
    }, 240);

    setTimeout(() => {
      cta?.classList.add("is-on");
    }, 980);
  }

  function showAct(i) {
    idx = Math.max(0, Math.min(i, acts.length - 1));
    acts.forEach((a, k) => a.classList.toggle("active", k === idx));

    setProgressByIdx(idx);

    // VO
    const txt = qsVoText(acts[idx]);
    speak(txt);

    // whoosh soft à chaque cut (sauf premier)
    if (idx > 0 && idx < acts.length - 1) playWhoosh("soft");

    // final
    if (idx === acts.length - 1) {
      revealFinalSequence();
    }
  }

  function next() {
    if (idx >= acts.length - 1) return;
    showAct(idx + 1);
    schedule();
  }

  function schedule() {
    clearTimeout(t);
    const d = durations[idx] ?? defaultDur;
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
    showTapSound(!isMuted ? false : true);
  });

  // Autostart (respect navigateur: on démarre muet)
  function startTrailer({ mute = true } = {}) {
    if (started) return;
    started = true;

    isMuted = !!mute;
    setMuteUI();

    // Lance la cinématique immédiatement
    showAct(0);
    schedule();

    // Ambiance tentée (si refus autoplay => user tap)
    const ok = playAmbience();
    showTapSound(!ok); // si autoplay bloque, on affiche pill
  }

  // Au premier tap/click: on unmute + démarre sons si bloqués
  function unlockSound() {
    if (!isMuted) {
      // même si non muté, on tente quand même de démarrer l’amb
      const ok = playAmbience();
      showTapSound(!ok);
      return;
    }
    isMuted = false;
    setMuteUI();
    const ok = playAmbience();
    showTapSound(!ok);
    // relance la phrase de l’act en cours (optionnel)
    const txt = qsVoText(acts[idx]);
    speak(txt);
  }

  // Démarrage auto après un micro délai (visuel ciné)
  window.addEventListener("load", () => {
    // précharge logo final (évite “vide”)
    try { new Image().src = "vivario_logo.png"; } catch {}
    setTimeout(() => startTrailer({ mute: true }), 450);
  });

  // Déblocage son
  window.addEventListener("pointerdown", () => unlockSound(), { passive:true });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") unlockSound();
  });

  // sécurité init
  setMuteUI();
})();