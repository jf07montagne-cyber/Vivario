/* Vivario — ambiance.js (v9 bridge)
   Objectif :
   - compatibilité avec les anciennes pages qui incluent ambiance.js
   - ZÉRO duplication : ne crée pas de bouton, ne gère pas l'audio directement
   - délègue à window.VivarioSound (sound.js v9)
*/

(() => {
  function bindBridge(){
    const api = window.VivarioSound;
    if (!api) return;

    const btn =
      document.getElementById("vivarioAmbienceBtn") ||
      document.getElementById("ambienceToggle") ||
      document.querySelector(".ambience-toggle") ||
      document.querySelector("[data-ambience-toggle='1']");

    if (!btn) return;

    // évite les doubles bind si script rechargé
    if (btn.dataset.bridgeBound === "1") {
      // remet juste l’UI correcte si besoin
      try {
        const on = api.isAmbienceOn?.() === true;
        btn.textContent = on ? "🔊 Ambiance" : "🔇 Ambiance";
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      } catch {}
      return;
    }

    btn.dataset.bridgeBound = "1";

    // UI initiale
    try {
      const on = api.isAmbienceOn?.() === true;
      btn.textContent = on ? "🔊 Ambiance" : "🔇 Ambiance";
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    } catch {}

    // click -> délègue à sound.js
    btn.addEventListener("click", () => {
      api.toggleAmbience?.();
      try {
        const on = api.isAmbienceOn?.() === true;
        btn.textContent = on ? "🔊 Ambiance" : "🔇 Ambiance";
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      } catch {}
    });
  }

  document.addEventListener("DOMContentLoaded", bindBridge);
})();