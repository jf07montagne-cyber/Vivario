/* respiration.js — Vivario (v18)
   ✅ "Inspire / Bloque / Expire" dit par la voix
   ✅ Lit aussi le texte sous le timer
   ✅ Ajoute classes body: breath-inhale / breath-hold / breath-exhale => animation poumons
   ✅ Coupe l’ambiance pendant l’exo (option)
*/
(() => {
  const $ = (id) => document.getElementById(id);

  const elLabel = $("label");
  const elTimer = $("timer");
  const elSub   = $("sub");

  const btnStart = $("btnStart");
  const btnPause = $("btnPause");
  const btnStop  = $("btnStop");

  const selRhythm = $("rhythm");
  const selDur = $("duration");

  const chkVoice = $("voiceOn");
  const chkCoachSoft = $("coachSoftVoice");
  const chkCutAmb = $("cutAmbiance");

  let running = false;
  let paused = false;
  let t = 0;
  let stage = "ready"; // inhale/hold/exhale
  let interval = null;

  function parseRhythm(v){
    const [a,b,c] = String(v||"4-0-6").split("-").map(n => parseInt(n,10));
    return {
      inhale: Number.isFinite(a)?a:4,
      hold: Number.isFinite(b)?b:0,
      exhale: Number.isFinite(c)?c:6
    };
  }

  function setStage(s){
    stage = s;
    document.body.classList.remove("breath-inhale","breath-hold","breath-exhale");
    if (s === "inhale") document.body.classList.add("breath-inhale");
    if (s === "hold") document.body.classList.add("breath-hold");
    if (s === "exhale") document.body.classList.add("breath-exhale");
  }

  function speak(text){
    if (!chkVoice?.checked) return;
    try{
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text));
      u.lang = "fr-FR";
      u.rate = chkCoachSoft?.checked ? 0.98 : 1.03;
      u.pitch = chkCoachSoft?.checked ? 1.02 : 1.0;
      u.volume = 1;
      speechSynthesis.speak(u);
    }catch{}
  }

  function updateUI(label, seconds, sub){
    if (elLabel) elLabel.textContent = label;
    if (elTimer) elTimer.textContent = String(seconds);
    if (elSub) elSub.textContent = sub;
  }

  function announce(label, sub){
    // dit le mot (Inspire/Expire/Bloque) + lit le texte dessous
    speak(label);
    setTimeout(() => speak(sub), 450);
  }

  function stopAll(){
    running = false;
    paused = false;
    t = 0;
    clearInterval(interval);
    interval = null;
    setStage("ready");
    updateUI("Prêt", "—", "Tu peux arrêter quand tu veux.");
    try{ speechSynthesis.cancel(); }catch{}
    if (chkCutAmb?.checked) {
      try{ window.VivarioAmbience?.setOn?.(localStorage.getItem("vivario_amb_on")==="1"); }catch{}
    }
  }

  function tick(){
    const r = parseRhythm(selRhythm?.value);

    const cycle = r.inhale + r.hold + r.exhale;
    if (cycle <= 0) return;

    const pos = t % cycle;

    if (pos === 0){
      setStage("inhale");
      announce("Inspire", "Laisse l’air entrer, tranquille.");
    }

    if (pos === r.inhale && r.hold > 0){
      setStage("hold");
      announce("Bloque", "Garde juste un petit instant.");
    }

    if (pos === r.inhale + r.hold){
      setStage("exhale");
      announce("Expire", "Relâche doucement, jusqu’au bout.");
    }

    // seconds remaining in current stage
    let remaining = 0;
    let label = "";
    let sub = "";

    if (pos < r.inhale){
      label = "Inspire";
      remaining = r.inhale - pos;
      sub = "L’air entre. Rien à prouver.";
    } else if (pos < r.inhale + r.hold){
      label = "Bloque";
      remaining = (r.inhale + r.hold) - pos;
      sub = "Juste un instant. Doucement.";
    } else {
      label = "Expire";
      remaining = cycle - pos;
      sub = "Relâche. Tes épaules se déposent.";
    }

    updateUI(label, remaining, sub);
    t++;

    // durée
    const dur = String(selDur?.value || "infini");
    if (dur !== "infini"){
      const minutes = parseInt(dur,10);
      if (Number.isFinite(minutes) && minutes > 0){
        if (t >= minutes * 60) stopAll();
      }
    }
  }

  function start(){
    if (running) return;
    running = true;
    paused = false;
    t = 0;

    if (chkCutAmb?.checked) {
      // coupe l’ambiance pendant l’exercice (option)
      try{ window.VivarioAmbience?.setOn?.(false); }catch{}
    }

    tick();
    interval = setInterval(() => {
      if (!running || paused) return;
      tick();
    }, 1000);
  }

  function pause(){
    if (!running) return;
    paused = !paused;
    if (paused){
      updateUI("Pause", "—", "Reprends quand tu veux.");
      try{ speechSynthesis.cancel(); }catch{}
    } else {
      tick();
    }
  }

  btnStart?.addEventListener("click", start);
  btnPause?.addEventListener("click", pause);
  btnStop?.addEventListener("click", stopAll);

  // init
  stopAll();
})();