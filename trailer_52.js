/* trailer_52.js — Vivario trailer (patch premium)
   - Défilement plus léger (crossfade)
   - EKG réparé si manquant
   - Final blockbuster reveal (boom + shine)
   - Background vivario_bg.jpg géré via CSS
*/
(() => {
  const acts = [...document.querySelectorAll(".act")];
  const bar = document.getElementById("bar");
  const btnSkip = document.getElementById("skip");
  const btnMute = document.getElementById("mute");

  const amb = document.getElementById("amb");             // ambiance
  const sWhoosh = document.getElementById("sfx_whoosh");  // whoosh soft
  const sImpact = document.getElementById("sfx_impact");  // impact

  const finalAct = document.querySelector(".act-final");
  const finalBrand = finalAct?.querySelector(".finalBrand");
  const finalCta = finalAct?.querySelector(".cta");

  // ✅ tempo plus "ciné"
  const FADE_MS = 900;
  const BASE_MS = 5200; // plus doux
  const LAST_MS = 999999;

  // Si tu as moins/plus de pages, ça s'adapte.
  // Si tu mets data-duration="6500" sur une act, ça prendra cette valeur.
  function getDuration(el, i){
    const v = Number(el?.getAttribute?.("data-duration"));
    if (Number.isFinite(v) && v > 800) return v;
    // un tout petit peu plus long pour les 2 premières pages
    if (i === 0) return 5600;
    if (i === 1) return 5600;
    // final : pas d'auto
    if (i === acts.length - 1) return LAST_MS;
    return BASE_MS;
  }

  let idx = 0;
  let t = null;
  let isMuted = false;
  let voiceEnabled = true; // on garde ce qui marche
  let speakQueueId = 0;

  function setMuteUI() {
    if (!btnMute) return;
    btnMute.textContent = isMuted ? "🔇" : "🔊";
    btnMute.setAttribute("aria-label", isMuted ? "Activer le son" : "Couper le son");
  }

  function stopSpeech() {
    try { window.speechSynthesis?.cancel?.(); } catch {}
  }

  function qsVoText(actEl){
    const node = actEl.querySelector("[data-vo]");
    return node ? (node.textContent || "").trim() : "";
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
    safePlay(sImpact, 0.90);
  }

  // ✅ Répare l’EKG si manquant / cassé
  function ensureEkg(actEl){
    // Cas 1 : un container .monitor existe mais pas de svg.ekg
    const mon = actEl.querySelector(".monitor");
    if (!mon) return;

    let svg = mon.querySelector("svg.ekg");
    if (!svg){
      svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "ekg");
      svg.setAttribute("viewBox", "0 0 760 92");
      svg.setAttribute("preserveAspectRatio", "none");

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      // tracé EKG doux/premium
      path.setAttribute("d",
        "M0,58 L70,58 " +
        "L92,58 L104,42 L118,78 L132,52 L152,58 " +
        "L220,58 L242,58 L254,44 L268,78 L282,50 L302,58 " +
        "L380,58 L402,58 L414,44 L428,78 L442,50 L462,58 " +
        "L760,58"
      );

      svg.appendChild(path);

      // place après un éventuel titre/texte
      mon.appendChild(svg);
    }
  }

  function progressUpdate(){
    const progress = Math.round((idx / (acts.length - 1)) * 100);
    if (bar) bar.style.width = `${progress}%`;
  }

  function showAct(i) {
    const prev = acts[idx];
    idx = Math.max(0, Math.min(i, acts.length - 1));
    const cur = acts[idx];

    // crossfade (sortie douce)
    acts.forEach(a => {
      if (a !== cur && a !== prev) {
        a.classList.remove("active","leaving");
      }
    });

    if (prev && prev !== cur) {
      prev.classList.remove("active");
      prev.classList.add("leaving");
      setTimeout(() => prev.classList.remove("leaving"), FADE_MS + 50);
    }

    cur.classList.add("active");
    cur.classList.remove("leaving");

    progressUpdate();

    // VO
    speak(qsVoText(cur));

    // EKG (réparation)
    ensureEkg(cur);

    // SFX transition (léger)
    if (idx > 0 && idx < acts.length - 1) sfxSoft();

    // Final blockbuster
    if (idx === acts.length - 1) {
      sfxImpact();

      if (finalBrand) {
        // ajouter un calque shine si absent
        if (!finalBrand.querySelector(".shine")) {
          const shine = document.createElement("div");
          shine.className = "shine";
          finalBrand.appendChild(shine);
        }

        finalBrand.classList.add("is-on");
        // boom + shine
        finalBrand.classList.remove("boom","shine-on");
        setTimeout(() => finalBrand.classList.add("boom"), 80);
        setTimeout(() => finalBrand.classList.add("shine-on"), 220);
      }

      if (finalCta) {
        finalCta.classList.remove("is-on");
        setTimeout(() => finalCta.classList.add("is-on"), 980);
      }
    }
  }

  function schedule() {
    clearTimeout(t);
    if (idx >= acts.length - 1) return;
    const d = getDuration(acts[idx], idx);
    t = setTimeout(() => {
      if (idx < acts.length - 1) {
        showAct(idx + 1);
        schedule();
      }
    }, d);
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

  function startTrailer() {
    playAmbience(); // peut être bloqué sur mobile avant interaction
    showAct(0);
    schedule();
  }

  setMuteUI();
  startTrailer();

  // Sur mobile, au premier tap on relance l’ambiance
  const kick = () => {
    playAmbience();
    window.removeEventListener("pointerdown", kick);
  };
  window.addEventListener("pointerdown", kick, { passive:true });
})();