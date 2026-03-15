/* =========================================================
   Vivario PRO — micro-étapes 18→24 (global) v1.3 (ULTRA SAFE)
   Objectifs :
   (18) deep link resume=1 : toast + glow 1s sur zone question (et titre)
   (19) rappel doux si pause > 3 jours : CTA “Reprendre en douceur (1 min)” -> onboarding
   (20) protection anti-perte (rare) : confirm si “dirty” avant quitter
   (21) progress chip partout : “Session en cours : Q12 — Titre” + “Dernier brouillon : …”
   (22) mode nuit soft/deep (apaisé) : classes body vp-night-soft / vp-night-deep
   (23) accessibilité : aria-live toasts + role=status
   (24) perf : cache questionnaire_pro.json TTL + fallback (commun)
   ========================================================= */

(function(){
  "use strict";

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
  let _antiLossWired = false;

  // utils
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  function nowIso(){ return new Date().toISOString(); }

  function getJson(k){
    try { return JSON.parse(localStorage.getItem(k) || "null"); }
    catch { return null; }
  }
  function setJson(k,v){
    try { localStorage.setItem(k, JSON.stringify(v)); }
    catch {}
  }

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
    try{ return (Date.now() - new Date(iso).getTime()) / 86400000; }
    catch{ return Infinity; }
  }

  function isPage(name){ return new RegExp(name.replace(/\./g,"\\."), "i").test(location.pathname); }

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

  function hasResumeLike(){
    const r = getJson(RESUME_KEY);
    return !!(r && typeof r === "object" && !r.finished && (r.currentBlockId || r.currentStep));
  }

  // ===== (24) Cache JSON questionnaire_pro.json (commun) =====
  async function getQuestionnaireJsonCached(){
    const meta = getJson(QJSON_CACHE_META_KEY);
    const cached = getJson(QJSON_CACHE_KEY);
    const fresh = meta?.updated_at && (Date.now() - new Date(meta.updated_at).getTime() < QJSON_TTL_MS);

    if (fresh && cached && typeof cached === "object") return cached;

    // fetch ultra safe
    try{
      if (!("fetch" in window)) throw new Error("no fetch");
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

    if (stepIndex && title) return { label:`Q${stepIndex} — ${title}`, stepIndex, blockId, title };
    if (stepIndex) return { label:`Q${stepIndex}`, stepIndex, blockId, title:null };

    const hint = getHintLabel();
    if (hint) return { label:hint, stepIndex:null, blockId, title:null };

    if (blockId) return { label:String(blockId), stepIndex:null, blockId, title:null };
    return { label:null, stepIndex:null, blockId:null, title:null };
  }

  // ===== (22) Mode nuit =====
  function applyNightMode(){
    try{
      const h = new Date().getHours();
      const soft = (h >= 20 || h < 6);
      const deep = (h >= 21 || h < 6);
      if (soft) document.body.classList.add("vp-night-soft");
      if (deep) document.body.classList.add("vp-night-deep");
    }catch{}
  }

  // ===== (23) A11y toast + fallback UI =====
  function ensureMicrostepsStyleFallback(){
    if ($("#vpMicrostepsStyle")) return;
    const st = document.createElement("style");
    st.id = "vpMicrostepsStyle";
    st.textContent = `
      .vp-chipWrap{ display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
      .vp-progressChip{
        display:inline-flex; align-items:center; gap:8px;
        padding:6px 10px; border-radius:999px;
        border:1px solid rgba(255,255,255,.12);
        background: rgba(0,0,0,.12);
        color: rgba(234,240,255,.88);
        font-weight: 900; font-size: 12px; line-height: 1.1;
        box-shadow: 0 10px 26px rgba(0,0,0,.18);
        white-space: nowrap;
      }
      .vp-progressChip i{
        width:8px; height:8px; border-radius:999px; display:inline-block; flex:0 0 auto;
        background: rgba(120,160,255,.95);
        box-shadow: 0 0 0 4px rgba(120,160,255,.14);
      }
      .vp-progressChip.good{ border-color: rgba(35,240,215,.26); background: rgba(35,240,215,.08); }
      .vp-progressChip.good i{ background: rgba(35,240,215,.95); box-shadow: 0 0 0 4px rgba(35,240,215,.12); }
      .vp-progressChip.warn{ border-color: rgba(255,200,90,.22); background: rgba(255,200,90,.08); }
      .vp-progressChip.warn i{ background: rgba(255,200,90,.95); box-shadow: 0 0 0 4px rgba(255,200,90,.12); }

      .vp-toast{
        position: fixed;
        left: 12px;
        right: 12px;
        bottom: calc(12px + env(safe-area-inset-bottom));
        z-index: 9999;
        display:none;
        padding: 10px 12px;
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,.12);
        background: rgba(8,14,28,.88);
        backdrop-filter: blur(14px);
        color: rgba(234,240,255,.92);
        font-weight: 900;
        box-shadow: 0 18px 44px rgba(0,0,0,.32);
      }
      .vp-toast.is-on{ display:block; animation: vpToastIn .18s ease both; }
      @keyframes vpToastIn{ from{opacity:0; transform: translateY(10px);} to{opacity:1; transform: translateY(0);} }

      .vp-glowPulse{
        animation: vpGlow 1s ease both;
      }
      @keyframes vpGlow{
        0%{ box-shadow: 0 0 0 0 rgba(120,160,255,.00); }
        30%{ box-shadow: 0 0 0 4px rgba(120,160,255,.10), 0 0 22px rgba(120,160,255,.12); }
        100%{ box-shadow: 0 0 0 0 rgba(120,160,255,.00); }
      }
    `;
    document.head.appendChild(st);
  }

  function getOrCreateToast(){
    // si ton CSS/DOM contient déjà un toast, on le réutilise
    const existing = $("#qpToast") || $("#qpRestoredToast") || $("#vpToast");
    if (existing) return existing;

    const t = document.createElement("div");
    t.id = "vpToast";
    t.className = "vp-toast";
    t.setAttribute("role","status");
    t.setAttribute("aria-live","polite");
    t.setAttribute("aria-atomic","true");
    document.body.appendChild(t);
    return t;
  }

  function showToast(msg, ms=1800){
    try{
      const t = getOrCreateToast();
      if (!t) return;
      t.textContent = safeText(msg || "");
      t.classList.add("is-on");
      clearTimeout(showToast._t);
      showToast._t = setTimeout(() => {
        try{ t.classList.remove("is-on"); }catch{}
      }, ms);
    }catch{}
  }

  function patchToastA11y(){
    const ids = ["qpToast","qpRestoredToast","vpToast"];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (!el.getAttribute("role")) el.setAttribute("role","status");
      el.setAttribute("aria-live","polite");
      el.setAttribute("aria-atomic","true");
    });
  }

  // ===== (18) Deep link resume=1 : toast + glow + scroll zone =====
  function glowOnce(el){
    if (!el) return;
    el.classList.add("vp-glowPulse");
    setTimeout(() => { try{ el.classList.remove("vp-glowPulse"); }catch{} }, 1100);
  }

  function focusQuestionZoneSoft(){
    const zone =
      $("#cardQuestion") ||
      $("#options") ||
      $("#qTitle") ||
      $("main") ||
      document.body;

    try{ zone.scrollIntoView({ behavior:"smooth", block:"start" }); }catch{}
    glowOnce(zone);

    const title = $("#qTitle");
    if (title) glowOnce(title);
  }

  function handleDeepLinkResume(){
    const qs = new URLSearchParams(location.search || "");
    if (qs.get("resume") !== "1") return;

    // on NE force pas de restore : juste une aide visuelle + toast
    setTimeout(() => {
      showToast("Reprise détectée ✅ Tu peux continuer où tu t’étais arrêté.");
      focusQuestionZoneSoft();
    }, 180);
  }

  // ===== (20) Anti-perte (rare) : confirm si dirty =====
  function wireAntiLoss(){
    if (_antiLossWired) return;
    _antiLossWired = true;

    // marque dirty sur saisie
    document.addEventListener("input", () => { _dirty = true; }, { passive:true });
    document.addEventListener("change", () => { _dirty = true; }, { passive:true });

    // considère “sauvé” dès que draft_meta.updated_at bouge
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
      if (!_dirty) return;
      e.preventDefault();
      e.returnValue = "";
      return "";
    });
  }

  // ===== (21) Progress chip partout =====
  async function injectProgressChipEverywhere(){
    const hasSession = hasDraft() || hasResumeLike() || !!getStepFromState().stepIndex;
    if (!hasSession) return;

    const step = await getCurrentStepLabel();
    const label = step?.label ? step.label : "Session en cours";

    const meta = getJson(DRAFT_META_KEY);
    const ago = meta?.updated_at ? humanTimeAgo(meta.updated_at) : null;

    // évite doublons
    if ($(".vp-chipWrap")) return;

    const chipA = document.createElement("span");
    chipA.className = "vp-progressChip " + (ago ? "good" : "warn");
    chipA.innerHTML = `<i aria-hidden="true"></i><span>Session en cours : ${safeText(label)}</span>`;

    const wrap = document.createElement("div");
    wrap.className = "vp-chipWrap";
    wrap.appendChild(chipA);

    if (ago){
      const chipB = document.createElement("span");
      chipB.className = "vp-progressChip";
      chipB.style.opacity = ".88";
      chipB.innerHTML = `<i aria-hidden="true"></i><span>Dernier brouillon : ${ago} • local</span>`;
      wrap.appendChild(chipB);
    }

    // endroits possibles (ultra safe)
    const candidates = [
      $(".pro-topActions"),
      $(".pro-top-right"),
      $(".topBtns"),
      $(".sv-topActions"),
      $(".pro-brandRow"),
      $(".pro-top"),
    ].filter(Boolean);

    const mount = candidates[0] || null;
    if (!mount) return;

    // si c’est déjà monté
    if (mount.dataset.vpChipWired === "1") return;
    mount.dataset.vpChipWired = "1";

    mount.appendChild(wrap);
    glowOnce(wrap);

    // refresh léger au focus (si Qxx évolue)
    window.addEventListener("focus", async () => {
      try{
        const again = await getCurrentStepLabel();
        const txt = again?.label ? again.label : "Session en cours";
        const span = wrap.querySelector(".vp-progressChip span");
        if (span) span.textContent = `Session en cours : ${safeText(txt)}`;
      }catch{}
    });
  }

  // ===== (19) Rappel doux si pause > 3 jours =====
  function patchRappelDouxPause(){
    // Pause = dernière activité > 3 jours
    const acts = getJson(ACTIVITY_KEY) || [];
    const lastAt = acts[0]?.at || null;
    const pause = daysSince(lastAt) > 3;
    if (!pause) return;

    // si déjà un diagnostic récent, laisse les smart CTA faire leur job
    // ici on applique seulement aux liens “questionnaire” visibles, sans toucher aux CTA smart dynamiques.
    const links = $$('a[href^="questionnaire_pro.html"]');

    links.forEach(a => {
      if (a.dataset.vpSoftPause === "1") return;
      a.dataset.vpSoftPause = "1";

      // évite de casser les CTA pilotés par d’autres scripts
      const skipIds = ["smartPrimaryCta", "svSmartCta"];
      if (skipIds.includes(a.id)) return;

      // évite la barre mobile (garde simple)
      if (a.querySelector(".fbtn")) return;

      // uniquement si ça ressemble à un bouton
      const cls = (a.className || "");
      const looksBtn = cls.includes("btn") || cls.includes("pro-btn");
      if (!looksBtn) return;

      // si une session est déjà en cours, on n’écrase pas le “continuer”
      const session = hasDraft() || hasResumeLike() || !!getStepFromState().stepIndex;
      if (session) return;

      a.textContent = "🕊️ Reprendre en douceur (1 min)";
      a.href = "onboarding_pro.html?v=1";
      a.title = "Après une pause, reprise douce recommandée";
    });
  }

  // ===== init =====
  async function init(){
    ensureMicrostepsStyleFallback();
    applyNightMode();
    patchToastA11y();
    wireAntiLoss();
    handleDeepLinkResume();
    patchRappelDouxPause();
    await injectProgressChipEverywhere();
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", () => { init(); });
  } else {
    init();
  }
})();