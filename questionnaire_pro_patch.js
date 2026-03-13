/* questionnaire_pro_patch.js — Vivario PRO (UX polish ultra safe) v2
   Objectifs :
   - Reprise session (autosave localStorage + restore)
   - Micro transitions d’apparition (IntersectionObserver)
   - Confort mobile (barre sticky)
   - Branchement Suivi : push activity “questionnaire en cours (Q12 — Titre)”
   - Retour depuis Suivi : proposer “Reprendre” + focus zone (sans auto-restore)
   - Toast discret “✅ Session restaurée” (1.5s)
   - Focus auto post-restore sur 1er champ du bloc courant
   - “Dernière question : Qxx — Titre bloc” via questionnaire_pro.json (cache local ultra safe)
   - Nav hint lisible par Accueil/Suivi, sans casser l’existant
*/
(() => {
  // ====== Keys ======
  const DRAFT_KEY = "vivario_pro_questionnaire_draft_v1";
  const DRAFT_META_KEY = "vivario_pro_questionnaire_draft_meta_v1";
  const PRO_STATE_KEY = "vivario_pro_state_v1";
  const PRO_ACTIVITY_KEY = "vivario_pro_activity_v1";

  // cache questionnaire json (ultra safe)
  const PRO_QJSON_CACHE_KEY = "vivario_pro_questionnaire_json_cache_v1";
  const PRO_QJSON_CACHE_META_KEY = "vivario_pro_questionnaire_json_cache_meta_v1";
  const PRO_QJSON_URL = "questionnaire_pro.json";
  const PRO_QJSON_TTL_MS = 7 * 24 * 3600 * 1000; // 7 jours

  // nav hint (pour Accueil/Suivi)
  const NAV_HINT_KEY = "vivario_pro_nav_hint_v1";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function nowIso() { return new Date().toISOString(); }

  function getJson(k) {
    try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; }
  }
  function setJson(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
  }

  function humanTimeAgo(iso) {
    if (!iso) return "il y a un moment";
    try {
      const d = new Date(iso);
      const diff = Date.now() - d.getTime();
      if (!isFinite(diff) || diff < 0) return "récemment";
      const min = Math.floor(diff / 60000);
      const h = Math.floor(diff / 3600000);
      const day = Math.floor(diff / 86400000);
      if (min < 1) return "à l’instant";
      if (min < 60) return `il y a ${min} min`;
      if (h < 24) return h === 1 ? "il y a 1h" : `il y a ${h}h`;
      if (day === 1) return "hier";
      if (day < 7) return `il y a ${day} jours`;
      return "il y a quelques jours";
    } catch { return "il y a un moment"; }
  }

  function safeText(s) {
    return String(s ?? "").replace(/\s+/g, " ").trim();
  }

  // ==========================
  // 0) Questionnaire JSON cache (ultra safe)
  // ==========================
  async function getQuestionnaireJsonCached() {
    const meta = getJson(PRO_QJSON_CACHE_META_KEY);
    const cached = getJson(PRO_QJSON_CACHE_KEY);

    const fresh = meta?.updated_at && (Date.now() - new Date(meta.updated_at).getTime() < PRO_QJSON_TTL_MS);
    if (fresh && cached && typeof cached === "object") return cached;

    // fetch soft (ne casse rien si fail)
    try {
      const r = await fetch(PRO_QJSON_URL, { cache: "no-store" });
      if (!r.ok) throw new Error("bad status");
      const json = await r.json();
      if (!json || typeof json !== "object") throw new Error("bad json");
      setJson(PRO_QJSON_CACHE_KEY, json);
      setJson(PRO_QJSON_CACHE_META_KEY, { updated_at: nowIso() });
      return json;
    } catch {
      // fallback cache même périmé
      if (cached && typeof cached === "object") return cached;
      return null;
    }
  }

  function findBlockTitleFromJson(qjson, blockId) {
    try {
      const blocks = qjson?.blocks;
      if (!Array.isArray(blocks) || !blockId) return null;
      const b = blocks.find(x => x && x.id === blockId);
      const t = safeText(b?.title || b?.label || "");
      return t || null;
    } catch {
      return null;
    }
  }

  // ==========================
  // 1) Draft autosave / restore
  // ==========================
  function fieldKey(el) {
    const n = el.getAttribute("name");
    if (n) return `name:${n}`;
    const id = el.getAttribute("id");
    if (id) return `id:${id}`;
    return null;
  }

  function collectDraft() {
    const data = {};
    const fields = $$("input, textarea, select")
      .filter(el => !el.disabled)
      .filter(el => {
        const type = (el.getAttribute("type") || "").toLowerCase();
        if (type === "password" || type === "file") return false;
        return true;
      });

    fields.forEach(el => {
      const k = fieldKey(el);
      if (!k) return;

      const tag = (el.tagName || "").toLowerCase();
      const type = (el.getAttribute("type") || "").toLowerCase();

      if (type === "checkbox") {
        data[k] = !!el.checked;
      } else if (type === "radio") {
        if (el.checked) data[k] = el.value ?? true;
        else if (data[k] == null) data[k] = null;
      } else if (tag === "select") {
        data[k] = el.value;
      } else {
        data[k] = el.value;
      }
    });

    const scrollY = Math.max(0, Math.round(window.scrollY || 0));

    setJson(DRAFT_KEY, data);
    setJson(DRAFT_META_KEY, {
      updated_at: nowIso(),
      scrollY
    });
  }

  function restoreDraft() {
    const data = getJson(DRAFT_KEY);
    if (!data || typeof data !== "object") return false;

    const fields = $$("input, textarea, select").filter(el => !el.disabled);
    let restoredAny = false;

    fields.forEach(el => {
      const k = fieldKey(el);
      if (!k || !(k in data)) return;

      const tag = (el.tagName || "").toLowerCase();
      const type = (el.getAttribute("type") || "").toLowerCase();
      const val = data[k];

      try {
        if (type === "checkbox") {
          el.checked = !!val;
          restoredAny = true;
          el.dispatchEvent(new Event("change", { bubbles: true }));
        } else if (type === "radio") {
          if (val == null) return;
          if (String(el.value) === String(val)) {
            el.checked = true;
            restoredAny = true;
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }
        } else if (tag === "select") {
          el.value = String(val ?? "");
          restoredAny = true;
          el.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          el.value = String(val ?? "");
          restoredAny = true;
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }
      } catch {}
    });

    const meta = getJson(DRAFT_META_KEY);
    if (meta && typeof meta.scrollY === "number") {
      setTimeout(() => {
        try { window.scrollTo({ top: meta.scrollY, behavior: "smooth" }); } catch {}
      }, 150);
    }

    return restoredAny;
  }

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
    try { localStorage.removeItem(DRAFT_META_KEY); } catch {}
  }

  function hasDraft() {
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

  // ==========================
  // 2) Lire l’étape / bloc courant (ultra safe)
  // ==========================
  function getCurrentStepFromProState() {
    const st = getJson(PRO_STATE_KEY);
    if (!st || typeof st !== "object") return { stepIndex: null, blockId: null };
    const shown = Array.isArray(st.shownBlocks) ? st.shownBlocks : [];
    if (!shown.length) return { stepIndex: null, blockId: null };
    const blockId = shown[shown.length - 1] || null;
    const stepIndex = shown.length; // Q1..Qn
    return { stepIndex, blockId };
  }

  async function getCurrentStepLabel() {
    const { stepIndex, blockId } = getCurrentStepFromProState();
    if (!stepIndex) return { stepIndex: null, blockId: null, blockTitle: null, label: null };

    const qjson = await getQuestionnaireJsonCached();
    const blockTitle = findBlockTitleFromJson(qjson, blockId);

    const label = blockTitle
      ? `Q${stepIndex} — ${blockTitle}`
      : `Q${stepIndex}`;

    return { stepIndex, blockId, blockTitle: blockTitle || null, label };
  }

  // ==========================
  // 3) Activity push (ultra safe)
  // ==========================
  function pushActivity(type, meta) {
    try {
      const list = getJson(PRO_ACTIVITY_KEY) || [];
      list.unshift({ type: type || "action", at: nowIso(), meta: meta || {} });
      setJson(PRO_ACTIVITY_KEY, list.slice(0, 20));
    } catch {}
  }

  // ==========================
  // 4) Nav hint (Accueil/Suivi)
  // ==========================
  async function updateNavHint(reason = "autosave") {
    // ne casse rien : si pas de draft, on ne force pas
    if (!hasDraft()) return;

    const step = await getCurrentStepLabel();
    setJson(NAV_HINT_KEY, {
      from: "questionnaire",
      reason,
      at: nowIso(),
      hasDraft: true,
      stepIndex: step.stepIndex,
      blockId: step.blockId,
      blockTitle: step.blockTitle,
      label: step.label
    });
  }

  // ==========================
  // 5) UI : toast + bottomBar + “restored” toast
  // ==========================
  function mountToast() {
    if ($("#qpToast")) return;
    const toast = document.createElement("div");
    toast.className = "qp-toast";
    toast.id = "qpToast";
    toast.innerHTML = `
      <div class="row">
        <div class="msg">
          <strong>Reprendre ta session ?</strong>
          <span id="qpToastMeta">Brouillon détecté</span>
        </div>
        <div class="btns">
          <button class="qp-pillBtn ghost" id="qpToastDismiss" type="button">Plus tard</button>
          <button class="qp-pillBtn primary" id="qpToastResume" type="button">Reprendre</button>
        </div>
      </div>
    `;
    document.body.appendChild(toast);

    $("#qpToastDismiss")?.addEventListener("click", () => toast.classList.remove("is-on"));
    $("#qpToastResume")?.addEventListener("click", async () => {
      toast.classList.remove("is-on");
      await handleResumeClick("toast");
    });
  }

  function mountBottomBar() {
    if ($("#qpBottomBar")) return;
    const bar = document.createElement("div");
    bar.className = "qp-bottomBar";
    bar.id = "qpBottomBar";
    bar.innerHTML = `
      <div class="txt">
        <strong>Reprise PRO</strong>
        <span id="qpBarMeta">Autosave local</span>
      </div>
      <div class="actions">
        <button class="qp-pillBtn ghost" id="qpBarReset" type="button">Recommencer</button>
        <button class="qp-pillBtn primary" id="qpBarResume" type="button">Reprendre</button>
      </div>
    `;
    document.body.appendChild(bar);

    $("#qpBarResume")?.addEventListener("click", async () => {
      await handleResumeClick("bar");
    });

    $("#qpBarReset")?.addEventListener("click", async () => {
      if (!confirm("Réinitialiser la reprise (brouillon local) ?")) return;
      clearDraft();
      try { localStorage.removeItem(NAV_HINT_KEY); } catch {}
      await updateResumeMeta();
      try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {}
    });
  }

  function mountRestoredToast() {
    if ($("#qpRestoredToast")) return;
    const t = document.createElement("div");
    t.id = "qpRestoredToast";
    t.className = "qp-restoredToast";
    t.textContent = "✅ Session restaurée";
    document.body.appendChild(t);
  }

  function showRestoredToast() {
    const t = $("#qpRestoredToast");
    if (!t) return;
    t.classList.add("is-on");
    clearTimeout(showRestoredToast._t);
    showRestoredToast._t = setTimeout(() => {
      try { t.classList.remove("is-on"); } catch {}
    }, 1500);
  }

  async function updateResumeMeta() {
    const meta = getJson(DRAFT_META_KEY);
    const base = meta?.updated_at ? `Dernière saisie ${humanTimeAgo(meta.updated_at)} • local` : "Brouillon local";

    const step = await getCurrentStepLabel();
    const stepLine = step?.label ? `Dernière question : ${step.label}` : null;

    const txt = stepLine ? `${base} • ${stepLine}` : base;

    const t1 = $("#qpToastMeta");
    const t2 = $("#qpBarMeta");
    if (t1) t1.textContent = txt;
    if (t2) t2.textContent = txt;

    const show = hasDraft();
    const toast = $("#qpToast");
    const bar = $("#qpBottomBar");

    if (bar) bar.style.display = show ? "" : "none"; // CSS gère mobile
    if (toast) {
      if (show) toast.classList.add("is-on");
      else toast.classList.remove("is-on");
    }

    // update nav hint for Accueil/Suivi (ultra safe)
    await updateNavHint("meta_update");
  }

  // ==========================
  // 6) Reveal animations
  // ==========================
  function applyReveal() {
    const candidates = [
      ".pro-card", ".card", ".question-card", "fieldset", ".panel", ".step", ".section", ".box",
      ".pro-hero", ".pro-scoreCard", ".pro-top"
    ];

    const els = [];
    candidates.forEach(sel => {
      $$(sel).forEach(el => els.push(el));
    });

    const uniq = Array.from(new Set(els)).filter(el => el && el.classList);
    uniq.forEach(el => el.classList.add("qp-reveal"));

    if (!uniq.length) return;

    if (!("IntersectionObserver" in window)) {
      uniq.forEach((el, i) => setTimeout(() => el.classList.add("is-in"), 40 * i));
      return;
    }

    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.08 });

    uniq.forEach((el, i) => {
      el.style.transitionDelay = (i * 40) + "ms";
      io.observe(el);
    });
  }

  // ==========================
  // 7) Autosave hooks
  // ==========================
  function wireAutosave() {
    let t = null;
    function schedule() {
      clearTimeout(t);
      t = setTimeout(async () => {
        collectDraft();
        await updateResumeMeta();
      }, 220);
    }

    document.addEventListener("input", (e) => {
      const el = e.target;
      if (!el) return;
      if (!(el instanceof HTMLElement)) return;
      if (!["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      schedule();
    }, { passive: true });

    document.addEventListener("change", (e) => {
      const el = e.target;
      if (!el) return;
      if (!(el instanceof HTMLElement)) return;
      if (!["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      schedule();
    }, { passive: true });

    window.addEventListener("beforeunload", () => {
      try { collectDraft(); } catch {}
      // nav hint for Accueil/Suivi
      try { updateNavHint("beforeunload"); } catch {}
    });
  }

  // ==========================
  // 8) Focus helpers (ultra safe)
  // ==========================
  function focusFirstFieldInCurrentBlock() {
    // priorité : #options (structure questionnaire_pro.html)
    const roots = [
      $("#options"),
      $("#cardQuestion"),
      document.body
    ].filter(Boolean);

    let target = null;

    for (const r of roots) {
      // 1) champs éditables
      target = r.querySelector('textarea:not([disabled]), input:not([disabled]), select:not([disabled])');
      if (target) break;
    }

    if (!target) return false;

    try {
      // scroll soft si hors écran
      if (typeof target.scrollIntoView === "function") {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } catch {}

    setTimeout(() => {
      try { target.focus({ preventScroll: true }); } catch { try { target.focus(); } catch {} }
      // radio/checkbox : améliorer l’UX
      try {
        const type = (target.getAttribute("type") || "").toLowerCase();
        if (type === "radio" || type === "checkbox") {
          // rien, focus suffit
        } else if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") {
          // place le curseur à la fin
          const v = target.value;
          if (typeof v === "string" && target.setSelectionRange) {
            target.setSelectionRange(v.length, v.length);
          }
        }
      } catch {}
    }, 160);

    return true;
  }

  function focusQuestionZoneSoft() {
    const zone = $("#cardQuestion") || $("#options") || $("main") || document.body;
    if (!zone) return;
    try { zone.scrollIntoView({ behavior: "smooth", block: "start" }); } catch {}
  }

  // ==========================
  // 9) Resume click handler (restore + toast + focus)
  // ==========================
  async function handleResumeClick(source = "unknown") {
    // restore draft
    const ok = restoreDraft();

    // nav hint refresh
    await updateNavHint("resume_click_" + source);

    // toast restored
    if (ok) {
      showRestoredToast();
      // focus block
      focusFirstFieldInCurrentBlock();
    } else {
      // si rien restauré, au moins focus zone
      focusQuestionZoneSoft();
    }

    await updateResumeMeta();
  }

  // ==========================
  // 10) Branchement : clic “📈 Suivi” depuis questionnaire
  // ==========================
  async function wireSuiviLinks() {
    const links = $$('a[href^="suivi_pro.html"]');
    if (!links.length) return;

    links.forEach(a => {
      if (a.dataset.qpWired === "1") return;
      a.dataset.qpWired = "1";

      a.addEventListener("click", async () => {
        // push activity : questionnaire en cours (Qxx — Titre)
        const step = await getCurrentStepLabel();
        const label = step?.label ? step.label : "Questionnaire en cours";

        try {
          pushActivity("questionnaire", {
            label: `Questionnaire en cours (${label})`,
            stepIndex: step?.stepIndex ?? null,
            blockId: step?.blockId ?? null,
            blockTitle: step?.blockTitle ?? null
          });
        } catch {}

        // nav hint : pour Accueil/Suivi
        try {
          setJson(NAV_HINT_KEY, {
            from: "questionnaire",
            reason: "go_suivi",
            at: nowIso(),
            hasDraft: hasDraft(),
            label,
            stepIndex: step?.stepIndex ?? null,
            blockId: step?.blockId ?? null,
            blockTitle: step?.blockTitle ?? null
          });
        } catch {}
      }, { passive: true });
    });
  }

  // ==========================
  // 11) Retour depuis Suivi → proposer “Reprendre” + focus zone (sans auto-restore)
  // ==========================
  async function handleReturnFromSuiviProposal() {
    // Conditions :
    // - query resume=1 (Accueil/Suivi mettra ça)
    // - ou nav_hint dit “go_suivi” récent
    const qs = new URLSearchParams(location.search || "");
    const askResume = qs.get("resume") === "1" || qs.get("from") === "suivi";

    const hint = getJson(NAV_HINT_KEY);
    const hintRecent = hint?.at ? (Date.now() - new Date(hint.at).getTime() < 6 * 3600 * 1000) : false;
    const hintFromSuiviFlow = hint?.reason === "go_suivi" || hint?.from === "suivi";

    const shouldPropose = hasDraft() && (askResume || (hintRecent && hintFromSuiviFlow));

    if (!shouldPropose) return;

    // On propose (toast + bar) mais sans auto-restore
    const toast = $("#qpToast");
    const bar = $("#qpBottomBar");
    if (toast) toast.classList.add("is-on");
    if (bar) bar.style.display = "";

    // Focus zone douce (pas d’auto restore)
    setTimeout(() => {
      focusQuestionZoneSoft();
    }, 120);

    // Nettoyage query (optionnel safe)
    // (évite de reproposer si refresh)
    try {
      if (askResume) {
        qs.delete("resume");
        qs.delete("from");
        const newQ = qs.toString();
        const url = location.pathname + (newQ ? "?" + newQ : "") + location.hash;
        history.replaceState({}, "", url);
      }
    } catch {}
  }

  // ==========================
  // 12) Init
  // ==========================
  async function init() {
    mountToast();
    mountBottomBar();
    mountRestoredToast();
    applyReveal();
    wireAutosave();

    // 1er save (pour meta)
    try { collectDraft(); } catch {}
    await updateResumeMeta();

    // wire Suivi link(s) if present
    await wireSuiviLinks();

    // propose resume on return from Suivi (no auto-restore)
    await handleReturnFromSuiviProposal();

    // Si tu veux auto-restore silencieux, ne pas faire ici.
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { init(); });
  } else {
    init();
  }
})();