/* onboarding_pro_patch.js — Vivario PRO (ultra safe) v1
   Objectifs :
   - CTA intelligent Onboarding → Questionnaire (démarrer vs continuer)
   - Push activity au clic (vivario_pro_activity_v1) sans casser le stockage
   - Ajoute un hint de navigation (vivario_pro_nav_hint_v1) sans toucher aux clés existantes
   - Optionnel : mini toast discret (non bloquant)
   Zéro dépendance au code existant.
*/
(() => {
  const ACTIVITY_KEY = "vivario_pro_activity_v1";
  const PRO_STATE_KEY = "vivario_pro_state_v1";
  const NAV_HINT_KEY = "vivario_pro_nav_hint_v1";

  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  function nowIso(){ return new Date().toISOString(); }

  function getJson(k){
    try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; }
  }
  function setJson(k, v){
    try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
  }

  // pushActivity ultra safe (limite 20, pas de dépendance)
  function pushActivity(type, meta){
    try{
      const list = getJson(ACTIVITY_KEY) || [];
      list.unshift({ type: type || "action", at: nowIso(), meta: meta || {} });
      setJson(ACTIVITY_KEY, list.slice(0, 20));
    }catch{}
  }

  // Variante "dedup" légère (évite doublon si double click ultra rapide)
  function pushActivityDedup(type, meta){
    try{
      const list = getJson(ACTIVITY_KEY) || [];
      const last = list[0];
      const now = Date.now();
      const lastAt = last?.at ? new Date(last.at).getTime() : 0;

      const sameLabel = (last?.meta?.label && meta?.label && String(last.meta.label) === String(meta.label));
      const tooSoon = (now - lastAt) < 2500;

      if (sameLabel && tooSoon) return;

      list.unshift({ type: type || "action", at: nowIso(), meta: meta || {} });
      setJson(ACTIVITY_KEY, list.slice(0, 20));
    }catch{}
  }

  function getProState(){
    try{ return JSON.parse(localStorage.getItem(PRO_STATE_KEY) || "null"); }catch{ return null; }
  }

  function computeQuestionnaireLabel(){
    const st = getProState();
    const shown = Array.isArray(st?.shownBlocks) ? st.shownBlocks : [];
    // si au moins 1 bloc déjà vu => continuer
    if (shown.length >= 1) return `🚀 Continuer le questionnaire (Q${shown.length})`;
    return "🚀 Démarrer le questionnaire PRO";
  }

  function appendFromOnboarding(url){
    try{
      const u = new URL(url, window.location.href);
      if (!u.searchParams.has("from")) u.searchParams.set("from", "onboarding");
      return u.pathname + u.search + u.hash;
    }catch{
      // fallback ultra safe
      const s = String(url || "questionnaire_pro.html?v=1");
      if (s.includes("?")) return s + "&from=onboarding";
      return s + "?from=onboarding";
    }
  }

  // Mini toast discret (optionnel, non bloquant)
  function ensureToast(){
    if ($("#obToast")) return;
    const el = document.createElement("div");
    el.id = "obToast";
    el.style.cssText = `
      position: fixed;
      left: 12px; right: 12px;
      bottom: calc(12px + env(safe-area-inset-bottom));
      z-index: 9999;
      display: none;
      padding: 10px 12px;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,.12);
      background: rgba(8,14,28,.86);
      backdrop-filter: blur(14px);
      box-shadow: 0 18px 44px rgba(0,0,0,.30);
      color: rgba(238,242,255,.92);
      font-weight: 900;
      font-size: 12.5px;
      line-height: 1.35;
    `;
    el.textContent = "✅ Direction questionnaire…";
    document.body.appendChild(el);
  }

  function toast(msg, ms=1200){
    try{
      ensureToast();
      const el = $("#obToast");
      if (!el) return;
      el.textContent = msg || "✅ OK";
      el.style.display = "block";
      clearTimeout(toast._t);
      toast._t = setTimeout(() => { try{ el.style.display = "none"; }catch{} }, ms);
    }catch{}
  }

  function wireOnboardingToQuestionnaire(){
    // cible tous les liens vers questionnaire_pro.html (peu importe le ?v=1)
    const links = $$('a[href*="questionnaire_pro.html"]');
    if (!links.length) return;

    const smartLabel = computeQuestionnaireLabel();

    links.forEach(a => {
      try{
        const href = a.getAttribute("href") || "questionnaire_pro.html?v=1";
        a.setAttribute("href", appendFromOnboarding(href));

        // CTA intelligent: uniquement sur ceux qui ressemblent à un CTA
        const t = (a.textContent || "").trim().toLowerCase();
        const looksLikeCta = t.includes("questionnaire") || t.includes("passer") || t.includes("pro");
        if (looksLikeCta){
          a.textContent = smartLabel;
        }

        if (a.dataset.wiredOnbQ === "1") return;
        a.dataset.wiredOnbQ = "1";

        a.addEventListener("click", () => {
          try{
            const st = getProState();
            const shown = Array.isArray(st?.shownBlocks) ? st.shownBlocks : [];
            const qNum = shown.length ? `Q${shown.length}` : "Q1";

            pushActivityDedup("questionnaire", {
              label: `Onboarding → Questionnaire (${qNum})`,
              q: qNum
            });

            // hint navigation ultra safe (nouvelle clé, ne touche pas STATE_KEY)
            setJson(NAV_HINT_KEY, {
              from: "onboarding",
              at: nowIso(),
              q: qNum
            });

            // toast discret (ne bloque pas la nav)
            toast("✅ Direction questionnaire…", 900);
          }catch{}
        }, { passive:true });
      }catch{}
    });
  }

  function init(){
    wireOnboardingToQuestionnaire();
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();