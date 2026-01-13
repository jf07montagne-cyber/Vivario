/* trailer_52.js — Vivario trailer v5.2
   Fix majeur: re-schedule après CHAQUE transition (sinon ça s'arrête à 2 acts)
   + auto-start visuel
   + tap-to-enable sound
   + whoosh soft / impact
   + reveal logo + CTA à la fin
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

  // Durées par act (ms) — total ~25-30s selon transitions
  const durations = [5200, 4500, 5000, 5200, 5200, 5200, 999999];

  let idx = 0;
  let t = null;
  let started = false;

  // Audio
  let isMuted = true; // auto-start visuel; son activable par tap
  let soundUnlocked = false;

  // VO (speechSynthesis)
  let voiceEnabled = true;
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

  function pickBestVoice() {
    try {
      if (!("speechSynthesis" in window)) return null;
      const voices = window.speechSynthesis.getVoices?.() || [];
      if (!voices.length) return null;

      // On préfère une voix FR “plus naturelle” si dispo
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

  let cachedVoice = null;
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

      // petites pauses “ciné”
      const clean = s
        .replace(/\.\.\./g, "…")
        .replace(/…/g, "… ")
        .replace(/\./g, ". ")
        .replace(/\s+/g, " ")
        .trim();

      const u = new SpeechSynthesisUtterance(clean);
      u.lang = "fr-FR";
      if (cachedVoice) u.voice = cachedVoice;

      // plus doux / moins robotique (selon voix dispo)
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

  async function tryStartAmbience() {
    if (!amb) return;
    if (isMuted) { try { amb.pause(); } catch {} return; }
    const ok = await playAudio(amb, 0.35);
    soundUnlocked = ok || soundUnlocked;
    showTapSound(!soundUnlocked);
  }

  function progressPercent() {
    if (acts.length <= 1) return 0;
    return Math.round((idx / (acts.length - 1)) * 100);
  }

  function updateProgress() {
    if (bar) bar.style.width = `${progressPercent()}%`;
  }

  function revealFinal() {
    // logo puis CTA après un petit délai
    if (brandReveal) brandReveal.classList.add("is-on");
    setTimeout(() => { if (cta) cta.classList.add("is-on"); }, 650);
  }

  async function whooshForAct(i){
    if (isMuted) return;
    // soft sur transitions, impact sur reveal final
    if (i >= 1 && i <= 5) await playAudio(sfxSoft, 0.55);
    if (i === acts.length - 1) await playAudio(sfxImpact, 0.75);
  }

  function showAct(i) {
    idx = Math.max(0, Math.min(i, acts.length - 1));
    acts.forEach((a, k) => a.classList.toggle("active", k === idx));
    updateProgress();

    // VO
    const txt = qsVoText(acts[idx]);
    speak(txt);

    // SFX
    whooshForAct(idx);

    // FIN
    if (idx === acts.length - 1) {
      revealFinal();
    }
  }

  function scheduleNext() {
    clearTimeout(t);
    if (idx >= acts.length - 1) return; // final: pas d'auto
    const d = durations[idx] ?? 4500;

    t = setTimeout(() => {
      // ⚠️ FIX: on replanifie après chaque transition
      showAct(idx + 1);
      scheduleNext();
    }, d);
  }

  function goFinal() {
    clearTimeout(t);
    showAct(acts.length - 1);
  }

  // Micro respiration texte (Inspire/Expire)
  function startBreathText(){
    if (!breathTxt) return;
    let flip = false;
    breathTxt.textContent = "Inspire…";
    setInterval(() => {
      flip = !flip;
      breathTxt.textContent = flip ? "Expire…" : "Inspire…";
    }, 2400);
  }

  // Start (auto visuel)
  function startTrailerAuto() {
    if (started) return;
    started = true;

    // auto = visuel ON, son OFF (mobile-friendly)
    isMuted = true;
    setMuteUI();
    showTapSound(true);

    startBreathText();
    showAct(0);
    scheduleNext();
  }

  // Unblock sound on first user interaction
  async function unlockSound() {
    if (soundUnlocked) return;
    isMuted = false;
    setMuteUI();
    await tryStartAmbience();
    // relance la phrase courante avec la “meilleure” voix dispo
    speak(qsVoText(acts[idx]));
    showTapSound(false);
    soundUnlocked = true;
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

  // Important: certaines voix se chargent après coup
  try {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.onvoiceschanged = () => { cachedVoice = null; ensureVoiceCache(); };
    }
  } catch {}

  // GO
  setMuteUI();
  startTrailerAuto();
})();