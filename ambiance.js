/* Vivario — ambiance.js (v10 UI refresh only)
   - Ne bind PAS de click
   - Synchronise seulement le texte/état
*/
(() => {
  function refresh(){
    const api = window.VivarioSound;
    if (!api) return;

    const btn =
      document.getElementById("ambienceToggle") ||
      document.querySelector(".ambience-toggle");

    if (!btn) return;

    try{
      const on = api.isAmbienceOn?.() === true;
      btn.textContent = on ? "🔊 Ambiance" : "🔇 Ambiance";
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.classList.toggle("is-on", !!on);
    }catch{}
  }

  document.addEventListener("DOMContentLoaded", refresh);
  window.addEventListener("pageshow", refresh);
  window.addEventListener("storage", (e) => {
    if (e.key === "vivario_sound_on" || e.key === "vivario_mood") refresh();
  });
})();