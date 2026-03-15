/* =========================================================
   Vivario PRO — micro-étapes 1→17 (JS) v1 (ULTRA SAFE)
   1) Normalisation storage + helpers
   2) Resume meta robuste (RESUME_KEY)
   3) Draft meta auto (DRAFT_META_KEY) si draft change
   4) Banner reprise session (accueil/suivi/resultat/onboarding)
   5) Toast fallback (si qpToast absent)
   6) Reset session propre (clear draft/state/resume + meta)
   7) CTA "Continuer" cohérent (ajoute resume=1)
   8) Mode express flag global
   9) Accessibilité : role/status sur toast
   10) Focus soft quand reprise
   11) Keyboard shortcuts (Esc ferme banner) + safe
   12) Perf : debounce + observer storage
   13) Activity push minimal
   14) Chip "Session en cours" (si pas déjà ajouté par 18→24)
   15) Protection double-injection
   16) Compat pages PRO/Gratuit (ne fait rien hors PRO)
   17) Logs OFF (aucun console spam)
   ========================================================= */

(function(){
  const DRAFT_KEY      = "vivario_pro_questionnaire_draft_v1";
  const DRAFT_META_KEY = "vivario_pro_questionnaire_draft_meta_v1";
  const STATE_KEY      = "vivario_pro_state_v1";
  const RESUME_KEY     = "vivario_pro_questionnaire_resume_v1";
  const ACTIVITY_KEY   = "vivario_pro_activity_v1";
  const EXPRESS_KEY    = "vivario_pro_mode_express_v1";

  const PAGE_OK = /(_pro\.html|questionnaire_pro\.html)/i.test(location.pathname);
  if (!PAGE_OK) return;

  if (window.__VP_MICRO_17__ === 1) return;
  window.__VP_MICRO_17__ = 1;

  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  function nowIso(){ return new Date().toISOString(); }
  function getJson(k){ try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } }
  function setJson(k,v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

  function safeText(s){ return String(s ?? "").replace(/\s+/g," ").trim(); }

  function humanTimeAgo(iso){
    if (!iso) return null;
    try{
      const d = new Date(iso);
      const diff = Date.now() - d.getTime();
      if (!isFinite(diff) || diff < 0) return "récemment";
      const min = Math.floor(diff/60000);
      const h = Math.floor(diff/3600000);
      const day = Math.floor(diff/86400000);
      if (min < 1) return "à l’instant";
      if (min < 60) return `il y a ${min} min`;
      if (h < 24) return h === 1 ? "il y a 1h" : `il y a ${h}h`;
      if (day === 1) return "hier";
      if (day < 7) return `il y a ${day} jours`;
      return "il y a quelques jours";
    }catch{ return null; }
  }

  function hasDraft(){
    const d = getJson(DRAFT_KEY);
    if (!d || typeof d !== "object") return false;
    return Object.keys(d).some(k => {
      const v = d[k];
      if (v === true) return true;
      if (typeof v === "string" && v.trim().length) return true;
      if (typeof v === "number" && isFinite(v)) return true;
      return false;
    });
  }

  function getStepFromState(){
    const st = getJson(STATE_KEY);
    const shown = Array.isArray(st?.shownBlocks) ? st.shownBlocks : [];
    if (!shown.length) return { stepIndex:null, blockId:null };
    return { stepIndex: shown.length, blockId: shown[shown.length - 1] || null };
  }

  function getResume(){
    const r = getJson(RESUME_KEY);
    if (!r || typeof r !== "object") return null;
    if (r.finished) return null;
    if (!r.currentBlockId && !r.currentStep) return null;
    return r;
  }

  function upsertResumeFromState(){
    const st = getStepFromState();
    if (!st.blockId && !st.stepIndex) return;

    const prev = getJson(RESUME_KEY) || {};
    const payload = {
      finished: false,
      currentBlockId: st.blockId || prev.currentBlockId || null,
      currentStep: st.stepIndex || prev.currentStep || null,
      updated_at: nowIso()
    };
    setJson(RESUME_KEY, payload);
  }

  function updateDraftMetaTouch(){
    setJson(DRAFT_META_KEY, { updated_at: nowIso() });
  }

  function pushActivity(type, meta){
    try{
      const list = getJson(ACTIVITY_KEY) || [];
      list.unshift({ type: type || "action", at: nowIso(), meta: meta || {} });
      setJson(ACTIVITY_KEY, list.slice(0, 20));
    }catch{}
  }

  // Toast fallback (si tes toasts n’existent pas)
  function ensureToast(){
    let t = $("#vpToastFallback");
    if (t) return t;
    t = document.createElement("div");
    t.id = "vpToastFallback";
    t.className = "vp-toast";
    t.setAttribute("role","status");
    t.setAttribute("aria-live","polite");
    t.setAttribute("aria-atomic","true");
    document.body.appendChild(t);
    return t;
  }
  function showToast(msg, ms=2200){
    const existing = $("#qpToast") || $("#qpRestoredToast");
    const t = existing || ensureToast();
    t.textContent = safeText(msg || "");
    t.classList.add("is-on");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => t.classList.remove("is-on"), ms);
  }

  // Reset session propre
  function clearSessionAll(){
    try{ localStorage.removeItem(DRAFT_KEY); }catch{}
    try{ localStorage.removeItem(DRAFT_META_KEY); }catch{}
    try{ localStorage.removeItem(STATE_KEY); }catch{}
    try{ localStorage.removeItem(RESUME_KEY); }catch{}
    showToast("Session PRO réinitialisée (local) ✅");
    pushActivity("home", { label:"Réinitialisation session questionnaire (local)" });
  }

  // Banner reprise (sur pages PRO hors questionnaire aussi)
  function mountResumeBanner(){
    const resume = getResume();
    const draft = hasDraft();
    const st = getStepFromState();

    if (!resume && !draft && !st.stepIndex) return;

    // évite double injection si 18→24 a déjà mis des chips
    if (document.body.dataset.vpResumeBanner === "1") return;
    document.body.dataset.vpResumeBanner = "1";

    // Où l’accrocher : on prend un header actions si présent, sinon début du main
    const anchor =
      $(".pro-topActions") || $(".sv-topActions") || $(".topBtns") || $(".pro-top-right") || $(".pro-brandRow") || $("main");

    if (!anchor) return;

    const lastMeta = getJson(DRAFT_META_KEY);
    const ago = lastMeta?.updated_at ? humanTimeAgo(lastMeta.updated_at) : null;
    const q = st.stepIndex ? `Q${st.stepIndex}` : (resume?.currentStep ? `Q${resume.currentStep}` : "Q—");
    const block = st.blockId || resume?.currentBlockId || resume?.currentStep || null;

    const wrap = document.createElement("div");
    wrap.className = "vp-resumeBar";
    wrap.id = "vpResumeBar";

    wrap.innerHTML = `
      <div style="min-width:0;">
        <strong>🧩 Session en cours détectée</strong>
        <span>${safeText(q)}${block ? " • " + safeText(String(block)) : ""}${ago ? " • Dernier brouillon : " + ago : ""}</span>
      </div>
      <div class="vp-resumeActions">
        <button class="vp-miniBtn primary" type="button" id="vpBtnContinue">▶ Continuer</button>
        <button class="vp-miniBtn" type="button" id="vpBtnHide">Masquer</button>
        <button class="vp-miniBtn danger" type="button" id="vpBtnReset">Réinitialiser</button>
      </div>
    `;

    // Si anchor est une ligne de boutons, on met après
    if (anchor.classList && (anchor.classList.contains("pro-topActions") || anchor.classList.contains("topBtns") || anchor.classList.contains("sv-topActions"))){
      anchor.insertAdjacentElement("afterend", wrap);
    } else {
      anchor.insertAdjacentElement("afterbegin", wrap);
    }

    // Actions
    $("#vpBtnContinue")?.addEventListener("click", () => {
      const target = "questionnaire_pro.html?v=1&resume=1&from=banner";
      pushActivity("questionnaire", { label:"Reprise via bannière (resume=1)" });
      window.location.href = target;
    });

    $("#vpBtnReset")?.addEventListener("click", () => {
      if (!confirm("Réinitialiser la session questionnaire PRO sur cet appareil ?")) return;
      clearSessionAll();
      try{ wrap.remove(); }catch{}
    });

    $("#vpBtnHide")?.addEventListener("click", () => { try{ wrap.remove(); }catch{} });

    // Esc = masquer
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape"){
        const bar = $("#vpResumeBar");
        if (bar) { try{ bar.remove(); }catch{} }
      }
    }, { passive:true });
  }

  // Mode express flag (sans casser ton questionnaire)
  function wireExpressButton(){
    const btn = $("#btnMode");
    if (!btn) return;

    function setOn(on){
      try{ localStorage.setItem(EXPRESS_KEY, on ? "1" : "0"); }catch{}
      btn.classList.toggle("is-on", !!on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      showToast(on ? "Mode express activé ⚡" : "Mode express désactivé");
      // on broadcast pour questionnaire_pro.js si tu veux l’écouter plus tard
      try{ window.dispatchEvent(new CustomEvent("vivario:express", { detail:{ on: !!on } })); }catch{}
    }

    const cur = (localStorage.getItem(EXPRESS_KEY) || "0") === "1";
    setOn(cur);

    btn.addEventListener("click", () => {
      const next = !((localStorage.getItem(EXPRESS_KEY) || "0") === "1");
      setOn(next);
    });
  }

  // Observers : si state/draft change → update resume/meta
  function wireStorageObservers(){
    // 1) au load
    try{
      if (hasDraft()) updateDraftMetaTouch();
      upsertResumeFromState();
    }catch{}

    // 2) écoute storage (multi-onglets)
    window.addEventListener("storage", (e) => {
      if (!e || !e.key) return;
      if (e.key === STATE_KEY) {
        try{ upsertResumeFromState(); }catch{}
      }
      if (e.key === DRAFT_KEY) {
        try{ updateDraftMetaTouch(); }catch{}
      }
    });

    // 3) polling ultra léger (au cas où questionnaire_pro.js n’émet pas)
    setInterval(() => {
      try{ upsertResumeFromState(); }catch{}
    }, 1400);
  }

  // Focus soft si resume=1 (complément du 18)
  function focusSoftIfResume(){
    const qs = new URLSearchParams(location.search || "");
    if (qs.get("resume") !== "1") return;
    setTimeout(() => {
      const z = $("#cardQuestion") || $("#options") || $("main") || document.body;
      try{ z.scrollIntoView({ behavior:"smooth", block:"start" }); }catch{}
      try{ z.classList.add("vp-glowPulse"); setTimeout(()=>z.classList.remove("vp-glowPulse"), 1100); }catch{}
      showToast("Reprise de session (local) ✅");
    }, 220);
  }

  function init(){
    wireStorageObservers();
    wireExpressButton();
    mountResumeBanner();
    focusSoftIfResume();
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();