/* trailer_52.js — Vivario trailer v5.2.1
   - Fix ambiance (amb_ocean.mp3) : load + retry + volume + relance si SFX ok
   - Reveal final ciné (blackout + flash + impact + logo + CTA)
   - Défilement plus smooth (timings + transitions déjà côté CSS)
*/
(() => {
  const acts = [...document.querySelectorAll(".act")];
  const bar = document.getElementById("bar");
  const btnSkip = document.getElementById("skip");
  const btnMute = document.getElementById("mute");

  const amb = document.getElementById("amb");
  const sfxSoft = document.getElementById("sfxSoft");
  const sfxImpact = document.getElementById("sfxImpact");

  const tapSound = document.getElementById("tapSound");
  const breathTxt = document.getElementById("breathTxt");

  const brandReveal = document.getElementById("brandReveal");
  const cta = document.getElementById("cta");
  const finalStage = document.querySelector(".act-final .stage");
  const finalFlash = document.querySelector(".finaleFlash");

  // Durées par act (ms)
  // (un poil plus longues pour laisser le fondu respirer)
  const durations = [5600, 5200, 5600, 5600, 5600, 5600, 999999];

  let idx = 0;
  let t = null;
  let started = false;

  // Audio
  let isMuted = true;       // auto-start visuel; son sur interaction
  let soundUnlocked = false;

  // VO (speechSynthesis)
  let voiceEnabled = true;
  let speakQueueId = 0;
  let cachedVoice = null;

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

  function pickBestVoice() {
    try {
      if (!("speechSynthesis" in window)) return null;
      const voices = window.speechSynthesis.getVoices?.() || [];
      if (!voices.length) return null;

      const prefer = [
        /Google.*français/i,
        /Microsoft.*(Denise|Sylvie|Julie|Caroline|Paul)/i,
        /(fr-FR|français)/i
      ];
      for (const re of prefer) {
        const v = voices.find(x => re.test(`${x.name} ${x.lang}`));
        if (v) return v;
      }
      return voices.find(v => (v.lang || "").toLowerCase().startsWith("fr")) || voices[0];
    } catch { return null; }
  }

  function ensureVoiceCache(){
    if (cachedVoice) return;
    cachedVoice = pickBestVoice();
  }

  function speak(text) {
    if (!voiceEnabled || isMuted) return;
    const s = (text || "").trim();
    if (!s) return;

    const qid = ++speakQueueId;
    try {
      if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;

      ensureVoiceCache();
      window.speechSynthesis.cancel();

      const clean = s
        .replace(/\.\.\./g, "…")
        .replace(/…/g, "… ")
        .replace(/\./g, ". ")
        .replace(/\s+/g, " ")
        .trim();

      const u = new SpeechSynthesisUtterance(clean);
      u.lang = "fr-FR";
      if (cachedVoice) u.voice = cachedVoice;

      u.rate = 0.88;
      u.pitch = 1.02;
      u.volume = 0.95;

      u.onstart = () => { if (qid !== speakQueueId || isMuted) stopSpeech(); };
      u.onerror = () => {};
      window.speechSynthesis.speak(u);
    } catch {}
  }

  async function playAudio(el, vol = 0.9) {
    if (!el) return false;
    try {
      el.volume = Math.max(0, Math.min(1, vol));
      el.currentTime = 0;
      const p = el.play();
      if (p && typeof p.catch === "function") await p.catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  function showTapSound(show) {
    if (!tapSound) return;
    tapSound.classList.toggle("is-on", !!show);
  }

  async function startAmbienceWithRetry() {
    if (!amb || isMuted) return false;

    try { amb.load?.(); } catch {}
    // volume plus présent
    const ok1 = await playAudio(amb, 0.60);
    if (ok1) return true;

    // retry (certains navigateurs acceptent au 2e essai)
    await new Promise(r => setTimeout(r, 450));
    const ok2 = await playAudio(amb, 0.62);
    return ok2;
  }

  function updateProgress() {
    if (!bar) return;
    const p = (acts.length <= 1) ? 0 : Math.round((idx / (acts.length - 1)) * 100);
    bar.style.width = `${p}%`;
  }

  async function whooshForAct(i){
    if (isMuted) return;

    // si on arrive à jouer un SFX, c’est que le son est ok -> on force l’ambiance aussi
    if (!soundUnlocked) soundUnlocked = true;

    if (i >= 1 && i <= 5) await playAudio(sfxSoft, 0.55);
    if (i === acts.length - 1) await playAudio(sfxImpact, 0.80);
  }

  function revealFinal() {
    // effet ciné sur le stage final
    if (finalStage) finalStage.classList.add("is-reveal");
    if (brandReveal) brandReveal.classList.add("is-on");

    setTimeout(() => {
      if (cta) cta.classList.add("is-on");
    }, 650);
  }

  function showAct(i) {
    idx = Math.max(0, Math.min(i, acts.length - 1));
    acts.forEach((a, k) => a.classList.toggle("active", k === idx));
    updateProgress();

    // VO
    speak(qsVoText(acts[idx]));

    // SFX
    whooshForAct(idx);

    // FIN
    if (idx === acts.length - 1) revealFinal();
  }

  function scheduleNext() {
    clearTimeout(t);
    if (idx >= acts.length - 1) return;
    const d = durations[idx] ?? 5200;

    t = setTimeout(() => {
      showAct(idx + 1);
      scheduleNext();
    }, d);
  }

  function goFinal() {
    clearTimeout(t);
    showAct(acts.length - 1);
  }

  // Respiration texte
  function startBreathText(){
    if (!breathTxt) return;
    let flip = false;
    breathTxt.textContent = "Inspire…";
    setInterval(() => {
      flip = !flip;
      breathTxt.textContent = flip ? "Expire…" : "Inspire…";
    }, 2400);
  }

  async function unlockSound() {
    if (soundUnlocked && !isMuted) return;

    isMuted = false;
    setMuteUI();
    showTapSound(false);

    // Ambience
    const ok = await startAmbienceWithRetry();
    if (!ok) {
      // si l’amb ne part pas, on laisse quand même les SFX/VO, et on propose de retaper
      showTapSound(true);
    } else {
      soundUnlocked = true;
    }

    // relance la phrase courante
    speak(qsVoText(acts[idx]));
  }

  function startTrailerAuto() {
    if (started) return;
    started = true;

    // auto = visuel ON, son OFF
    isMuted = true;
    soundUnlocked = false;
    setMuteUI();
    showTapSound(true);

    startBreathText();
    showAct(0);
    scheduleNext();
  }

  // Controls
  btnSkip?.addEventListener("click", goFinal);

  btnMute?.addEventListener("click", async () => {
    isMuted = !isMuted;
    setMuteUI();

    if (isMuted) {
      stopSpeech();
      try { amb?.pause(); } catch {}
      showTapSound(true);
    } else {
      await unlockSound();
    }
  });

  tapSound?.addEventListener("click", async () => {
    await unlockSound();
  });

  // Voix parfois dispo après coup
  try {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.onvoiceschanged = () => { cachedVoice = null; ensureVoiceCache(); };
    }
  } catch {}

  // GO
  setMuteUI();
  startTrailerAuto();
})();