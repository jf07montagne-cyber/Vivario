/* trailer_52.js — Vivario trailer v5.2
   - Autostart visuel (muet), son/voix activables au 1er tap
   - Transitions ciné anti-superposition (leaving)
   - Reveal final: logo -> boutons
   - Whoosh soft sur transitions + impact sur reveal final
*/
(() => {
  const acts = [...document.querySelectorAll(".act")];
  const bar = document.getElementById("bar");
  const btnSkip = document.getElementById("skip");
  const btnMute = document.getElementById("mute");
  const amb = document.getElementById("amb");
  const whooshSoft = document.getElementById("whooshSoft");
  const whooshImpact = document.getElementById("whooshImpact");

  const tapSound = document.getElementById("tapSound");
  const finalBrand = document.getElementById("finalBrand");
  const cta = document.getElementById("cta");

  // Durées par act (ms) — total ~25s (hors final)
  const durations = [4200, 4200, 4200, 4600, 4200, 4200, 999999];

  let idx = 0;
  let timer = null;

  // Audio/VO policy:
  // - visuel autostart = OK
  // - son/voix nécessitent souvent un geste utilisateur (mobile)
  let audioUnlocked = false;
  let isMuted = true; // démarre en muet
  let voiceEnabled = true;

  // Speech
  let speakQueueId = 0;
  let cachedVoices = [];

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

  function pickBestFrenchVoice() {
    try {
      const list = window.speechSynthesis?.getVoices?.() || [];
      if (list.length) cachedVoices = list;

      const fr = cachedVoices.filter(v => (v.lang || "").toLowerCase().startsWith("fr"));
      if (!fr.length) return null;

      // préférences (souvent + naturel)
      const prefs = [
        /google.*fr/i,
        /microsoft.*(fr|french)/i,
        /am[eé]lie/i,
        /thomas/i,
        /fran(c|ç)ais/i
      ];

      for (const re of prefs) {
        const v = fr.find(x => re.test((x.name || "") + " " + (x.voiceURI || "")));
        if (v) return v;
      }
      return fr[0] || null;
    } catch {
      return null;
    }
  }

  function speak(text) {
    if (!audioUnlocked || isMuted || !voiceEnabled) return;
    const s = (text || "").trim();
    if (!s) return;

    const qid = ++speakQueueId;

    try {
      if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;

      window.speechSynthesis.cancel();

      // Mini humanisation: découpe en 2 phrases max (respiration)
      const parts = s.split(/(?<=[.!?…])\s+/).filter(Boolean).slice(0, 2);

      const voice = pickBestFrenchVoice();

      const speakOne = (t, delay = 0) => {
        setTimeout(() => {
          if (qid !== speakQueueId || isMuted) return;

          const u = new SpeechSynthesisUtterance(t);
          u.lang = "fr-FR";
          if (voice) u.voice = voice;

          // plus posé / moins robotique
          const baseRate = 0.88;
          const basePitch = 0.98;
          const jitter = (n) => n + (Math.random() * 0.03 - 0.015);

          u.rate = jitter(baseRate);
          u.pitch = jitter(basePitch);
          u.volume = 0.95;

          u.onstart = () => { if (qid !== speakQueueId || isMuted) stopSpeech(); };
          u.onerror = () => {};
          window.speechSynthesis.speak(u);
        }, delay);
      };

      // 2 segments max, léger délai entre eux
      speakOne(parts[0], 0);
      if (parts[1]) speakOne(parts[1], 380);

    } catch {}
  }

  function safePlay(audioEl, vol = 0.85) {
    if (!audioEl || !audioUnlocked || isMuted) return;
    try {
      audioEl.volume = vol;
      audioEl.currentTime = 0;
      const p = audioEl.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {}
  }

  function playAmbience() {
    if (!amb || !audioUnlocked) return;
    try {
      if (isMuted) { amb.pause(); return; }
      amb.volume = 0.55;
      const p = amb.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {}
  }

  // Transitions anti-superposition
  function showAct(nextIdx) {
    const prevIdx = idx;
    idx = Math.max(0, Math.min(nextIdx, acts.length - 1));

    const prev = acts[prevIdx];
    const next = acts[idx];

    if (prev && prev !== next) {
      prev.classList.remove("active");
      prev.classList.add("leaving");
      // retire leaving après la transition (650ms)
      setTimeout(() => prev.classList.remove("leaving"), 700);
    }

    acts.forEach((a, k) => {
      if (k !== idx && k !== prevIdx) a.classList.remove("active", "leaving");
    });

    next.classList.add("active");

    // progress
    const progress = Math.round((idx / (acts.length - 1)) * 100);
    if (bar) bar.style.width = `${progress}%`;

    // whoosh soft sur changement (sauf tout début)
    if (idx > 0 && idx < acts.length - 1) safePlay(whooshSoft, 0.35);

    // VO
    speak(qsVoText(next));

    // Final reveal
    if (idx === acts.length - 1) {
      // reveal logo, puis boutons
      requestAnimationFrame(() => {
        finalBrand?.classList.add("is-on");
        safePlay(whooshImpact, 0.55);
        setTimeout(() => cta?.classList.add("is-on"), 850);
      });
    } else {
      finalBrand?.classList.remove("is-on");
      cta?.classList.remove("is-on");
    }
  }

  function schedule() {
    clearTimeout(timer);
    const d = durations[idx] ?? 4200;
    if (idx >= acts.length - 1) return; // final: pas d'auto
    timer = setTimeout(() => showAct(idx + 1), d);
  }

  function goFinal() {
    clearTimeout(timer);
    showAct(acts.length - 1);
  }

  // Controls
  btnSkip?.addEventListener("click", () => goFinal());

  btnMute?.addEventListener("click", () => {
    isMuted = !isMuted;
    setMuteUI();
    if (isMuted) stopSpeech();
    playAmbience();
    if (!isMuted) speak(qsVoText(acts[idx]));
  });

  // Unlock audio on first user gesture
  function unlockAudioOnce() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    tapSound?.classList.remove("is-on");
    setMuteUI();

    // si on active, on démarre ambiance + voice sur l'act en cours
    if (!isMuted) {
      playAmbience();
      speak(qsVoText(acts[idx]));
    }
  }

  // Autostart visuel (MUET), puis invite à activer le son
  function autoStartVisual() {
    // démarre en muet mais joue la cinématique
    isMuted = true;
    setMuteUI();

    // On montre la pill "tap sound"
    tapSound?.classList.add("is-on");

    // Act0 déjà visible, on schedule la suite
    showAct(0);
    schedule();
  }

  // 1er tap/click = unlock audio
  ["pointerdown","touchstart","click"].forEach(evt => {
    window.addEventListener(evt, () => unlockAudioOnce(), { once:true, passive:true });
  });

  // Si après unlock, l'utilisateur veut réellement du son: il unmute (bouton)
  // Bonus: si user appuie sur la pill, on unmute direct + lance
  tapSound?.addEventListener("click", () => {
    unlockAudioOnce();
    isMuted = false;
    setMuteUI();
    playAmbience();
    speak(qsVoText(acts[idx]));
  });

  // Préchargement voix
  try {
    window.speechSynthesis?.addEventListener?.("voiceschanged", () => {
      cachedVoices = window.speechSynthesis.getVoices() || [];
    });
  } catch {}

  // GO
  autoStartVisual();
})();