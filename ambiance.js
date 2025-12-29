/* Vivario — ambiance.js (v10 bridge SAFE)
   - Ne bind aucun click (sinon double toggle)
   - Rafraîchit seulement l’UI si besoin
*/
(() => {
  function refresh(){
    const api = window.VivarioSound;
    if (!api) return;

    const btn =
      document.getElementById("vivarioAmbienceBtn") ||
      document.querySelector(".ambience-toggle") ||
      document.getElementById("ambienceToggle");

    if (!btn) return;

    try {
      const on = api.isAmbienceOn?.() === true;
      btn.textContent = on ? "🔊 Ambiance" : "🔇 Ambiance";
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.classList.toggle("is-on", !!on);
    } catch {}
  }

  document.addEventListener("DOMContentLoaded", refresh);
  window.addEventListener("pageshow", refresh);
  window.addEventListener("storage", (e) => {
    if (e.key === "vivario_sound_on" || e.key === "vivario_mood") refresh();
  });
})();