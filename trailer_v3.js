(() => {
  const acts = [...document.querySelectorAll(".act")];
  const bar = document.getElementById("bar");
  const skip = document.getElementById("skip");
  const mute = document.getElementById("mute");
  const audio = document.getElementById("amb");

  // Durées (ms) — plus “cinéma” (on laisse respirer)
  const DUR = [3800, 4200, 3800, 5200, 4200, 5200, 999999]; 
  // Le dernier = on reste sur l'écran final (pas d'auto-redirect)

  const TOTAL = DUR.slice(0, 6).reduce((a, b) => a + b, 0);

  let idx = 0;
  let started = false;
  let isMuted = true;
  const startAt = performance.now();

  function show(i){
    acts.forEach(a => a.classList.remove("active"));
    const act = acts[i];
    if (!act) return;
    act.classList.add("active");

    // reveal voice-over avec petit délai
    const vo = act.querySelector(".vo");
    if (vo) {
      vo.classList.remove("on");
      setTimeout(() => vo.classList.add("on"), 550);
    }

    // anime les barres du scan (si présentes)
    act.querySelectorAll(".scanRow .v i").forEach((el) => {
      const w = el.getAttribute("style") || "";
      // style contient width:XX%
      const m = w.match(/width\s*:\s*([0-9]+)%/i);
      const target = m ? Number(m[1]) : 60;
      el.style.width = "0%";
      setTimeout(() => (el.style.width = target + "%"), 450);
    });
  }

  function next(){
    idx++;
    if (idx >= acts.length) return;

    show(idx);

    // stop auto après acte 5 -> acte final
    if (idx >= 6) return;

    setTimeout(next, DUR[idx]);
  }

  function progress(){
    // barre prog jusqu'à l'acte 5 inclus (avant l'écran final)
    const t = performance.now() - startAt;
    const pct = Math.min(100, (t / TOTAL) * 100);
    bar.style.width = pct + "%";
    requestAnimationFrame(progress);
  }

  function start(){
    if (started) return;
    started = true;

    show(0);
    setTimeout(next, DUR[0]);
    progress();
  }

  // skip -> aller direct à l'écran final (pas de redirect)
  skip.addEventListener("click", () => {
    idx = 6;
    show(6);
    bar.style.width = "100%";
  });

  // audio toggle
  function applyMute(){
    if (!audio) return;
    audio.muted = isMuted;
    mute.textContent = isMuted ? "🔇" : "🔊";
  }

  mute.addEventListener("click", () => {
    isMuted = !isMuted;
    applyMute();
    if (!isMuted) {
      audio.volume = 0.8;
      audio.play().catch(() => {});
    }
  });

  // unlock audio + start trailer on first interaction
  window.addEventListener("pointerdown", () => {
    start();
    // on démarre en mute (clinique)
    applyMute();
  }, { once:true });

  // si l'utilisateur ne touche pas, on démarre quand même (sans audio)
  setTimeout(() => start(), 600);
})();