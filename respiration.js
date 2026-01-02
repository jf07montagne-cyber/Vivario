/* respiration.js — Vivario PRO SYNC v19
   Synchronise : voix + texte + poumons + flux
   ⚠️ Ne touche PAS aux autres pages
*/

(() => {
  const root = document.documentElement;
  const body = document.body;

  const stages = [
    { key: "inhale", label: "Inspire", text: "Inspire lentement", sec: 4 },
    { key: "hold",   label: "Retiens", text: "Garde l’air",        sec: 2 },
    { key: "exhale", label: "Expire",  text: "Expire doucement",  sec: 6 }
  ];

  let stageIndex = 0;
  let stageStart = 0;
  let lastSecondSpoken = -1;
  let running = false;

  const elStage = document.querySelector(".breath-stage");
  const elSec   = document.querySelector(".breath-sec");
  const elCoach = document.querySelector(".breath-coach");

  function setBodyStage(key){
    body.classList.remove("breath-inhale","breath-hold","breath-exhale");
    body.classList.add("breath-" + key);
  }

  function speakOnce(text){
    try{
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "fr-FR";
      u.rate = 0.85;   // plus doux
      u.pitch = 0.95;
      speechSynthesis.speak(u);
    }catch{}
  }

  function startStage(now){
    const s = stages[stageIndex];
    stageStart = now;
    lastSecondSpoken = -1;

    setBodyStage(s.key);
    elStage.textContent = s.label;
    elCoach.textContent = s.text;

    // 🎤 voix AU DÉBUT EXACT
    speakOnce(s.text);
  }

  function tick(now){
    if (!running) return;

    const s = stages[stageIndex];
    const elapsed = (now - stageStart) / 1000;
    const remain = Math.max(0, Math.ceil(s.sec - elapsed));

    elSec.textContent = remain;

    // 🎤 décompte parfaitement calé
    if (remain !== lastSecondSpoken && remain > 0){
      lastSecondSpoken = remain;
      speakOnce(String(remain));
    }

    // 🫁 progression continue 0 → 1
    let t = Math.min(1, elapsed / s.sec);

    if (s.key === "inhale"){
      root.style.setProperty("--breath", t);
      root.style.setProperty("--air", t);
    }
    else if (s.key === "hold"){
      root.style.setProperty("--breath", 1);
      root.style.setProperty("--air", 0.2);
    }
    else if (s.key === "exhale"){
      root.style.setProperty("--breath", 1 - t);
      root.style.setProperty("--air", 1 - t);
    }

    if (elapsed >= s.sec){
      stageIndex = (stageIndex + 1) % stages.length;
      startStage(now);
    }

    requestAnimationFrame(tick);
  }

  function start(){
    if (running) return;
    running = true;
    stageIndex = 0;
    startStage(performance.now());
    requestAnimationFrame(tick);
  }

  document.addEventListener("DOMContentLoaded", start);
})();