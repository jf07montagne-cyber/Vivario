/* Vivario — ambiance.js (v10.1 bridge SAFE)
   - Ne bind AUCUN click (évite double toggle)
   - Rafraîchit uniquement l’UI
   - Se met à jour même si le bouton est injecté après chargement (MutationObserver)
*/
(() => {
  const BTN_IDS = ["vivarioAmbienceBtn", "ambienceToggle"];
  let observerStarted = false;

  function getBtn(){
    return (
      document.getElementById(BTN_IDS[0]) ||
      document.getElementById(BTN_IDS[1]) ||
      document.querySelector(".ambience-toggle") ||
      document.querySelector("[data-ambience-toggle='1']")
    );
  }

  function refresh(){
    const api = window.VivarioSound;
    if (!api) return;
    const btn = getBtn();
    if (!btn) return;

    try {
      const on = api.isAmbienceOn?.() === true;
      btn.textContent = on ? "🔊 Ambiance" : "🔇 Ambiance";
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.classList.toggle("is-on", !!on);
    } catch {}
  }

  function startObserver(){
    if (observerStarted) return;
    observerStarted = true;
    const mo = new MutationObserver(() => refresh());
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  document.addEventListener("DOMContentLoaded", () => { refresh(); startObserver(); });
  window.addEventListener("pageshow", refresh);
  window.addEventListener("storage", (e) => {
    if (e.key === "vivario_sound_on" || e.key === "vivario_mood") refresh();
  });
})();