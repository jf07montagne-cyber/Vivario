/* trailer_52.js — Vivario trailer v5.4
   FIXES:
   - logo final: auto-find (plusieurs chemins) + cache-bust
   - reveal ciné: flash + sweep + impact + CTA après
   - garde audio / whoosh / déroulement
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
  const finalLogoImg = document.getElementById("finalLogoImg");
  const finalStage = document.querySelector(".act-final .stage");
  const flash = document.querySelector(".act-final .revealFlash");
  const sweep = document.querySelector(".act-final .revealSweep");

  // Durées par act (ms)
  const durations = [4300, 4300, 4300, 4700, 4300, 4300, 999999];

  let idx = 0;
  let t = null;
  let isMuted = false;

  // VO
  let speakQueueId = 0;

  function qsVoText(actEl){
    const node = actEl.querySelector("[data-vo]");
    return node ? (node.textContent || "").trim() : "";
  }

  function setMuteUI() {
    if (!btnMute) return;
    btnMute.textContent = isMuted ? "🔇" : "🔊";
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

  // ✅ Auto-find logo (corrige ton bug)
  async function tryLoadImage(url){
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
  }

  async function ensureFinalLogo(){
    if (!finalLogoImg) return;

    const base = [
      "vivario_logo.png",
      "./vivario_logo.png",
      "img/vivario_logo.png",
      "imgs/vivario_logo.png",
      "image/vivario_logo.png",
      "images/vivario_logo.png",
      "assets/vivario_logo.png"
    ];

    // cache bust pour GitHub Pages
    const bust = `cb=${Date.now()}`;

    for (const p of base) {
      const candidate = `${p}?${bust}`;
      // test chargement
      const ok = await tryLoadImage(candidate);
      if (ok) {
        finalLogoImg.src = candidate;
        finalLogoImg.style.opacity = "1";
        return;
      }
    }

    // si rien ne marche, on laisse l'alt (ça te montre qu'il manque vraiment le fichier)
  }

  function showAct(i) {
    idx = Math.max(0, Math.min(i, acts.length - 1));
    acts.forEach((a, k) => a.classList.toggle("active", k === idx));

    // progress
    const progress = Math.round((idx / (acts.length - 1)) * 100);
    if (bar) bar.style.width = `${progress}%`;

    // VO
    speak(qsVoText(acts[idx]));

    // whoosh
    if (!isMuted) {
      if (idx === 6) safePlay(whooshImpact, 0.95);
      else if (idx > 0) safePlay(whooshSoft, 0.55);
    }

    // FINAL reveal
    if (idx === 6) {
      requestAnimationFrame(async () => {
        await ensureFinalLogo();

        // flash + sweep + brand + CTA
        if (flash) {
          flash.style.opacity = "0";
          flash.style.transition = "opacity .35s ease, transform .35s ease";
          flash.style.transform = "scale(.92)";
        }
        if (sweep) {
          sweep.style.opacity = "0";
          sweep.style.transition = "opacity .55s ease, transform .55s ease";
          sweep.style.transform = "translateX(-40%)";
        }

        // Start reveal
        setTimeout(() => {
          if (flash) {
            flash.style.opacity = "1";
            flash.style.transform = "scale(1.02)";
          }
          setTimeout(() => {
            if (flash) flash.style.opacity = "0";
          }, 220);

          if (sweep) {
            sweep.style.opacity = "1";
            sweep.style.transform = "translateX(40%)";
            setTimeout(() => {
              if (sweep) sweep.style.opacity = "0";
            }, 520);
          }

          finalBrand?.classList.add("is-on");
          setTimeout(() => finalCta?.classList.add("is-on"), 520);

          // micro "impact" visuel sur la stage
          if (finalStage) {
            finalStage.animate(
              [
                { transform: "translateY(0) scale(1)" },
                { transform: "translateY(-2px) scale(1.01)" },
                { transform: "translateY(0) scale(1)" }
              ],
              { duration: 380, easing: "cubic-bezier(.2,.9,.2,1)" }
            );
          }
        }, 120);
      });

    } else {
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

  function start() {
    setMuteUI();
    playAmbience();
    showAct(0);
    schedule();
  }

  window.addEventListener("load", start);
})();