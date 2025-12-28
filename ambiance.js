/* Vivario — ambiance.js (v10 safe bridge)
   - Ne crée aucun bouton
   - Ne bind PAS de click (sinon double toggle)
   - Se contente de rafraîchir l'UI si un bouton existe
*/

(() => {
  function refreshUI(){
    const api = window.VivarioSound;
    if (!api) return;

    const btn =
      document.getElementById("vivarioAmbienceBtn") ||
      document.getElementById("ambienceToggle") ||
      document.querySelector(".ambience-toggle") ||
      document.querySelector("[data-ambience-toggle='1']");

    if (!btn) return;

    // si sound.js gère déjà le bouton, on ne fait que refléter l'état
    try {
      const on = api.isAmbienceOn?.() === true;
      btn.textContent = on ? "🔊 Ambiance" : "🔇 Ambiance";
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.classList.toggle("is-on", !!on);
    } catch {}
  }

  document.addEventListener("DOMContentLoaded", refreshUI);
  window.addEventListener("pageshow", refreshUI);
  window.addEventListener("storage", (e) => {
    if (e.key === "vivario_sound_on" || e.key === "vivario_mood") refreshUI();
  });
})();