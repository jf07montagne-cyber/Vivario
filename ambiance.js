/* Vivario — ambiance.js (TEST 8)
   - Persiste ON/OFF
   - Déverrouille l’audio au 1er geste utilisateur (mobile)
   - Démarre/stoppe l’ambiance via VivarioSound (si dispo)
*/

(() => {
  const KEY = "vivario_ambience_on"; // "1" ou "0"

  function isOn(){ return localStorage.getItem(KEY) === "1"; }
  function setOn(v){ localStorage.setItem(KEY, v ? "1" : "0"); }

  function setButtonState(btn, on){
    if (!btn) return;
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    // texte optionnel
    if (btn.dataset.on && btn.dataset.off){
      btn.textContent = on ? btn.dataset.on : btn.dataset.off;
    }
  }

  async function startAmbience(){
    try{
      // certains sound.js ont un unlock
      await window.VivarioSound?.unlock?.();
    }catch{}
    try{
      await window.VivarioSound?.startAmbience?.();
    }catch{}
  }

  function stopAmbience(){
    try{ window.VivarioSound?.stopAmbience?.(); }catch{}
  }

  function apply(on, btn){
    setOn(on);
    setButtonState(btn, on);
    if (on) startAmbience();
    else stopAmbience();
  }

  // Déverrouillage au premier geste si ambiance ON
  function armAutoUnlock(btn){
    const handler = async () => {
      document.removeEventListener("pointerdown", handler, true);
      document.removeEventListener("touchstart", handler, true);
      if (isOn()){
        setButtonState(btn, true);
        await startAmbience();
      }
    };
    document.addEventListener("pointerdown", handler, true);
    document.addEventListener("touchstart", handler, true);
  }

  document.addEventListener("DOMContentLoaded", () => {
    // on accepte plusieurs sélecteurs, pour compatibilité
    const btn =
      document.getElementById("ambienceToggle") ||
      document.querySelector("[data-ambience-toggle]") ||
      document.querySelector(".ambience-toggle");

    if (!btn) return;

    setButtonState(btn, isOn());

    btn.addEventListener("click", () => {
      const next = !isOn();
      apply(next, btn);
    });

    // si ON, on attend un geste utilisateur (mobile)
    armAutoUnlock(btn);
  });
})();