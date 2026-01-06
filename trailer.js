/* trailer.js — Bande annonce Vivario (cinématique)
   SAFE : n’impacte AUCUNE page existante (uniquement index trailer)
*/
(() => {
  const MAIN_URL = "index_main.html?v=18";

  // Réglages (modifiable)
  const TOTAL_MS = 19000; // durée totale bande-annonce (19s)
  const SCENE_MS = 3000;  // durée par scène (~3s)
  const SKIP_KEY = "vivario_trailer_seen_v1";

  const scenes = [...document.querySelectorAll(".scene")];
  const bar = document.getElementById("bar");
  const btnSkip = document.getElementById("btnSkip");
  const btnSound = document.getElementById("btnSound");
  const audio = document.getElementById("trailerAudio");

  let idx = 0;
  let start = performance.now();
  let timer = null;
  let raf = null;
  let soundOn = false;

  // Option : si déjà vue, on peut la sauter automatiquement (décommente si tu veux)
  // try{
  //   if (localStorage.getItem(SKIP_KEY) === "1") {
  //     location.replace(MAIN_URL);
  //     return;
  //   }
  // }catch(e){}

  function showScene(i){
    scenes.forEach(s => s.classList.remove("active"));
    const el = scenes[i];
    if (el) el.classList.add("active");
  }

  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

  function tick(){
    const t = performance.now() - start;
    const p = clamp(t / TOTAL_MS, 0, 1);
    if (bar) bar.style.width = `${Math.round(p * 100)}%`;

    const wantedIdx = Math.min(Math.floor(t / SCENE_MS), scenes.length - 1);
    if (wantedIdx !== idx){
      idx = wantedIdx;
      showScene(idx);
    }

    if (t >= TOTAL_MS){
      finish(true);
      return;
    }
    raf = requestAnimationFrame(tick);
  }

  function finish(autoredirect){
    try{ localStorage.setItem(SKIP_KEY, "1"); }catch(e){}
    cleanup();
    if (autoredirect) location.replace(MAIN_URL);
  }

  function cleanup(){
    if (timer) clearInterval(timer);
    if (raf) cancelAnimationFrame(raf);
  }

  // Son (avec restrictions navigateur : nécessite un tap)
  async function toggleSound(){
    soundOn = !soundOn;
    if (!audio) return;

    if (soundOn){
      try{
        audio.volume = 0.85;
        await audio.play();
        btnSound.textContent = "🔊 Son : ON";
      }catch(e){
        // si autoplay bloqué, on repasse OFF
        soundOn = false;
        btnSound.textContent = "🔈 Son : OFF";
      }
    } else {
      try{ audio.pause(); }catch(e){}
      btnSound.textContent = "🔈 Son : OFF";
    }
  }

  // Events
  if (btnSkip) btnSkip.addEventListener("click", () => finish(true), { passive:true });
  if (btnSound) btnSound.addEventListener("click", toggleSound);

  // Start
  showScene(0);
  start = performance.now();
  raf = requestAnimationFrame(tick);
})();