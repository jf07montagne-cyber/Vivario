/* pro_resume_badge_patch.js — Vivario PRO (badge reprise global) v1
   Injecte un badge “Brouillon en cours • Qxx — Titre” dans Accueil/Suivi/Résultat.
   Ultra safe : si éléments non trouvés => ne fait rien.
*/

(() => {
  const DRAFT_KEY = "vivario_pro_questionnaire_draft_v1";
  const DRAFT_META_KEY = "vivario_pro_questionnaire_draft_meta_v1";
  const STEP_META_KEY  = "vivario_pro_questionnaire_step_meta_v1";

  const $ = (s, r=document) => r.querySelector(s);

  function getJson(k){
    try{ return JSON.parse(localStorage.getItem(k) || "null"); }catch{ return null; }
  }

  function hasDraft(){
    const data = getJson(DRAFT_KEY);
    if (!data || typeof data !== "object") return false;
    return Object.keys(data).some(k => {
      const v = data[k];
      if (v === true) return true;
      if (typeof v === "string" && v.trim().length) return true;
      if (typeof v === "number" && isFinite(v)) return true;
      return false;
    });
  }

  function humanTimeAgo(iso){
    if (!iso) return "récemment";
    try{
      const d = new Date(iso);
      const diff = Date.now() - d.getTime();
      const min = Math.floor(diff/60000);
      const h = Math.floor(diff/3600000);
      const day = Math.floor(diff/86400000);
      if (min < 1) return "à l’instant";
      if (min < 60) return `il y a ${min} min`;
      if (h < 24) return h === 1 ? "il y a 1h" : `il y a ${h}h`;
      if (day === 1) return "hier";
      if (day < 7) return `il y a ${day} jours`;
      return "il y a quelques jours";
    }catch{ return "récemment"; }
  }

  function escapeHTML(str){
    return String(str || "").replace(/[&<>"']/g, (m) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[m]));
  }

  function inject(){
    if (!hasDraft()) return;

    const host =
      $(".pro-topActions") ||
      $(".sv-topActions") ||
      $(".pro-top-right") ||
      $(".pro-brandRow") ||
      $("header");

    if (!host) return;
    if ($("#proResumeBadge")) return;

    const step = getJson(STEP_META_KEY) || {};
    const meta = getJson(DRAFT_META_KEY) || {};
    const q = step?.qLabel ? `${step.qLabel}${step.title ? ` — ${step.title}` : ""}` : "Questionnaire en cours";
    const t = meta?.updated_at ? `Dernière saisie ${humanTimeAgo(meta.updated_at)}` : "Brouillon local";

    const wrap = document.createElement("div");
    wrap.id = "proResumeBadge";
    wrap.style.cssText = `
      display:inline-flex; align-items:center; gap:10px; flex-wrap:wrap;
      padding: 6px 10px; border-radius: 999px;
      border: 1px solid rgba(255,255,255,.12);
      background: rgba(0,0,0,.14);
      color: rgba(234,240,255,.92);
      font-weight: 900; font-size: 12px;
    `;
    wrap.innerHTML = `
      <span style="display:inline-flex;align-items:center;gap:8px;">
        <span style="width:8px;height:8px;border-radius:999px;background:rgba(120,160,255,.95);box-shadow:0 0 0 4px rgba(120,160,255,.14);"></span>
        <span>${escapeHTML(q)}</span>
        <span style="opacity:.72;font-weight:800;">• ${escapeHTML(t)}</span>
      </span>
      <a href="questionnaire_pro.html?v=1&from=suivi"
         style="text-decoration:none; padding:6px 10px; border-radius:999px;
                border:1px solid rgba(120,160,255,.26); background: rgba(120,160,255,.12);
                color: rgba(240,245,255,.94); font-weight:950;">
         Reprendre
      </a>
      <button id="proResumeClear" type="button"
         style="padding:6px 10px; border-radius:999px;
                border:1px solid rgba(255,255,255,.14); background: transparent;
                color: rgba(240,245,255,.90); font-weight:950; cursor:pointer;">
         Recommencer
      </button>
    `;

    host.prepend(wrap);

    $("#proResumeClear")?.addEventListener("click", () => {
      if (!confirm("Effacer le brouillon du questionnaire PRO (reprise) ?")) return;
      try{ localStorage.removeItem(DRAFT_KEY); }catch{}
      try{ localStorage.removeItem(DRAFT_META_KEY); }catch{}
      try{ localStorage.removeItem(STEP_META_KEY); }catch{}
      try{ wrap.remove(); }catch{}
    });
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", inject);
  } else {
    inject();
  }
})();