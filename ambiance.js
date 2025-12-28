/* Vivario — ambiance.js (v10 UI-only bridge)
   - NE crée PAS de bouton
   - NE bind PAS de click (sinon double toggle avec sound.js)
   - Sert juste à compatibilité + resync UI
*/

(() => {
  function getBtn(){
    return (
      document.getElementById("vivarioAmbienceBtn") ||
      document.getElementById("ambienceToggle") ||
      document.querySelector(".ambience-toggle") ||
      document.querySelector("[data-ambience-toggle='1']")
    );
  }

  function syncUI(){
    const api = window.VivarioSound;
    const btn = getBtn();
    if (!api || !btn) return;

    try{
      const on = api.isAmbienceOn?.() === true;
      btn.textContent = on ? "🔊 Ambiance" : "🔇 Ambiance";
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.classList.toggle("is-on", !!on);
    }catch{}
  }

  document.addEventListener("DOMContentLoaded", () => {
    // Évite double init
    if (window.__VIVARIO_AMB_BRIDGE_V10__) return;
    window.__VIVARIO_AMB_BRIDGE_V10__ = true;

    syncUI();

    // Si d’autres scripts changent l’état, on resync
    window.addEventListener("storage", (e) => {
      if (e.key === "vivario_sound_on") syncUI();
    });

    // Resync léger après interaction (utile mobile)
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) syncUI();
    });
  });
})();