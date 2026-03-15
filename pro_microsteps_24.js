/* =========================================================
   Vivario PRO — micro-étapes 1→24 (complément) v1
   Objectifs :
   (18) deep link resume=1 : toast + glow 1s sur bloc courant
   (19) rappel doux si pause > 3 jours : label “Reprendre en douceur (1 min)”
   (20) protection anti-perte (rare) : mini confirm si “dirty”
   (21) progress chip partout : “Session en cours : Q12 — Titre”
   (22) mode nuit soft/deep (apaisé)
   (23) accessibilité : aria-live toasts + role=status
   (24) perf : cache questionnaire_pro.json TTL + fallback (commun)
   ========================================================= */

(function(){
  // ===== Keys (compat avec tes pages) =====
  const DRAFT_KEY      = "vivario_pro_questionnaire_draft_v1";
  const DRAFT_META_KEY = "vivario_pro_questionnaire_draft_meta_v1";
  const STATE_KEY      = "vivario_pro_state_v1";
  const RESUME_KEY     = "vivario_pro_questionnaire_resume_v1";
  const NAV_HINT_KEY   = "vivario_pro_nav_hint_v1";
  const ACTIVITY_KEY   = "vivario_pro_activity_v1";

  const QJSON_CACHE_KEY      = "vivario_pro_questionnaire_json_cache_v1";
  const QJSON_CACHE_META_KEY = "vivario_pro_questionnaire_json_cache_meta_v1";
  const QJSON_URL            = "questionnaire_pro.json";
  const QJSON_TTL_MS         = 7 * 24 * 3600 * 1000;

  // anti-perte
  let _dirty = false;
  let _lastSaveAt = 0;

  const $ = (s, r=document) => r.querySelector(s);
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

  function daysSince(iso){
    if (!iso) return Infinity;
    try{ return (Date.now() - new Date(iso).getTime()) / 86400000; }catch{ return Infinity; }
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

  // ===== (24) Cache JSON questionnaire_pro.json (commun) =====
  async function getQuestionnaireJsonCached(){
    const meta = getJson(QJSON_CACHE_META_KEY);
    const cached = getJson(QJSON_CACHE_KEY);
    const fresh = meta?.updated_at && (Date.now() - new Date(meta.updated_at).getTime() < QJSON_TTL_MS);
    if (fresh && cached && typeof cached === "object") return cached;

    try{
      const r = await fetch(QJSON_URL, { cache: "no-store" });
      if (!r.ok) throw new Error("http");
      const json = await r.json();
      if (!json || typeof json !== "object") throw new Error("bad json");
      setJson(QJSON_CACHE_KEY, json);
      setJson(QJSON_CACHE_META_KEY, { updated_at: nowIso() });
      return json;
    }catch{
      if (cached && typeof cached === "object") return cached;
      return null;
    }
  }

  function findBlockTitleFromJson(qjson, blockId){
    try{
      const blocks = qjson?.blocks;
      if (!Array.isArray(blocks) || !blockId) return null;
      const b = blocks.find(x => x && String(x.id) === String(blockId));
      const t = safeText(b?.title || b?.label || "");
      return t || null;
    }catch{ return null; }
  }

  // ===== step courant (STATE / RESUME / NAV_HINT) =====
  function getStepFromState(){
    const st = getJson(STATE_KEY);
    const shown = Array.isArray(st?.shownBlocks) ? st.shownBlocks : [];
    if (!shown.length) return { stepIndex:null, blockId:null };
    const blockId = shown[shown.length - 1] || null;
    return { stepIndex: shown.length, blockId };
  }

  function getResumeBlockId(){
    const r = getJson(RESUME_KEY);
    if (!r || typeof r !== "object") return null;
    if (r.finished) return null;
    return r.currentBlockId || r.currentStep || null;
  }

  function getHintLabel(){
    const h = getJson(NAV_HINT_KEY);
    return h?.label ? String(h.label) : null;
  }

  async function getCurrentStepLabel(){
    const state = getStepFromState();
    const blockId = state.blockId || getResumeBlockId();
    const stepIndex = state.stepIndex || null;

    const qjson = await getQuestionnaireJsonCached();
    const title = findBlockTitleFromJson(qjson, blockId);

    // label prioritaire : Qxx — Titre si possible
    if (stepIndex && title) return { label:`Q${stepIndex} — ${title}`, stepIndex, blockId, title };
    if (stepIndex) return { label:`Q${stepIndex}`, stepIndex, blockId, title:null };

    // fallback : NAV_HINT label si présent
    const hint = getHintLabel();
    if (hint) return { label:hint, stepIndex:null, blockId, title:null };

    // fallback : blocId brut
    if (blockId) return { label:String(blockId), stepIndex:null, blockId, title:null };

    return { label:null, stepIndex:null, blockId:null, title:null };
  }

  // ===== (22) Mode nuit =====
  function applyNightMode(){
    const h = new Date().getHours();
    const soft = (h >= 20 || h < 6);
    const deep = (h >= 21 || h < 6);
    if (soft) document.body.classList.add("vp-night-soft");
    if (deep) document.body.classList.add("vp-night-deep");
  }

  // ===== (23) A11y toasts =====
  function patchToastA11y(){
    const ids = ["qpToast","qpRestoredToast"];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (!el.getAttribute("role")) el.setAttribute("role","status");
      el.setAttribute("aria-live","polite");
      el.setAttribute("aria-atomic","true");
    });
  }

  // ===== (18) Deep link resume=1 : glow + focus zone =====
  function glowOnce(el){
    if (!el) return;
    el.classList.add("vp-glowPulse");
    setTimeout(() => { try{ el.classList.remove("vp-glowPulse"); }catch{} }, 1100);
  }

  function focusQuestionZoneSoft(){
    const zone =
      $("#cardQuestion") ||
      $("#options") ||
      $("main") ||
      document.body;

    try{ zone.scrollIntoView({ behavior:"smooth", block:"start" }); }catch{}
    glowOnce(zone);
  }

  function handleDeepLinkResume(){
    const qs = new URLSearchParams(location.search || "");
    if (qs.get("resume") !== "1") return;
    // on NE force pas restore (ton patch le fait déjà : proposition reprise)
    setTimeout(() => {
      focusQuestionZoneSoft();
    }, 180);
  }

  // ===== (20) Anti-perte (rare) : confirm si dirty ET save pas encore “settled” =====
  function wireAntiLoss(){
    // on marque dirty sur saisie
    document.addEventListener("input", () => { _dirty = true; }, { passive:true });
    document.addEventListener("change", () => { _dirty = true; }, { passive:true });

    // on considère “sauvé” dès que draft_meta updated_at bouge
    setInterval(() => {
      const m = getJson(DRAFT_META_KEY);
      if (m?.updated_at){
        const t = new Date(m.updated_at).getTime();
        if (isFinite(t) && t > _lastSaveAt){
          _lastSaveAt = t;
          _dirty = false;
        }
      }
    }, 700);

    window.addEventListener("beforeunload", (e) => {
      // ultra safe : seulement si user a tapé ET sauvegarde pas encore passée
      if (!_dirty) return;
      // message custom ignoré par certains navigateurs, mais le confirm apparaît
      e.preventDefault();
      e.returnValue = "";
      return "";
    });
  }

  // ===== (21) Progress chip partout =====
  async function injectProgressChipEverywhere(){
    // uniquement si session en cours
    const hasSession = hasDraft() || !!getResumeBlockId() || !!getStepFromState().stepIndex;
    if (!hasSession) return;

    const step = await getCurrentStepLabel();
    const label = step?.label ? step.label : "Session en cours";
    const meta = getJson(DRAFT_META_KEY);
    const ago = meta?.updated_at ? humanTimeAgo(meta.updated_at) : null;

    const chip = document.createElement("span");
    chip.className = "vp-progressChip " + (ago ? "good" : "warn");
    chip.innerHTML = `<i aria-hidden="true"></i><span>Session en cours : ${safeText(label)}</span>`;

    // endroits possibles (ultra safe)
    const candidates = [
      $(".pro-topActions"),             // accueil_pro/resultat_pro/suivi_pro
      $(".pro-top-right"),              // questionnaire_pro
      $(".topBtns"),                    // onboarding_pro
      $(".sv-topActions"),              // suivi_pro
      $(".pro-brandRow"),               // pages PRO
    ].filter(Boolean);

    const mount = candidates[0] || null;
    if (!mount) return;

    if (mount.dataset.vpChipWired === "1") return;
    mount.dataset.vpChipWired = "1";

    const wrap = document.createElement("div");
    wrap.className = "vp-chipWrap";
    wrap.appendChild(chip);

    if (ago){
      const sub = document.createElement("span");
      sub.className = "vp-progressChip";
      sub.style.opacity = ".88";
      sub.innerHTML = `<i aria-hidden="true"></i><span>Dernier brouillon : ${ago} • local</span>`;
      wrap.appendChild(sub);
    }

    mount.appendChild(wrap);
    glowOnce(wrap);
  }

  // ===== (19) Rappel doux si pause > 3 jours : label CTA onboarding =====
  function patchRappelDouxOnboarding(){
    // uniquement sur onboarding_pro.html
    const isOnboarding = /onboarding_pro\.html/i.test(location.pathname);
    if (!isOnboarding) return;

    const acts = getJson(ACTIVITY_KEY) || [];
    const lastAt = acts[0]?.at || null;
    const pause = daysSince(lastAt) > 3;

    if (!pause) return;

    // Cherche le CTA principal vers questionnaire_pro
    const ctas = $$('a[href^="questionnaire_pro.html"]');
    ctas.forEach(a => {
      if (a.dataset.vpSoftPause === "1") return;
      a.dataset.vpSoftPause = "1";
      // Remplace uniquement si c’est un vrai bouton
      const cls = (a.className || "");
      const looksBtn = cls.includes("btn");
      if (!looksBtn) return;
      a.textContent = "🕊️ Reprendre en douceur (1 min)";
      a.href = "onboarding_pro.html?v=1"; // reste sur onboarding (logique “doux”)
      a.title = "Reprise douce recommandée après une pause";
    });
  }

  // ===== init =====
  async function init(){
    applyNightMode();
    patchToastA11y();
    wireAntiLoss();
    handleDeepLinkResume();
    patchRappelDouxOnboarding();
    await injectProgressChipEverywhere();
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", () => { init(); });
  } else {
    init();
  }
})();