/* questionnaire_pro_patch.js — Vivario PRO (UX polish ultra safe) v1
   Objectifs :
   - Reprise session (autosave localStorage + restore)
   - Micro transitions d’apparition (IntersectionObserver)
   - Confort mobile (barre sticky “Reprendre / Recommencer” sans toucher aux boutons existants)
   - Zéro dépendance au code existant
*/
(() => {
  const KEY = "vivario_pro_questionnaire_draft_v1";
  const META_KEY = "vivario_pro_questionnaire_draft_meta_v1";

  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  function nowIso(){ return new Date().toISOString(); }

  function getJson(k){
    try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; }
  }
  function setJson(k, v){
    try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
  }

  function humanTimeAgo(iso){
    if (!iso) return "il y a un moment";
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
    } catch { return "il y a un moment"; }
  }

  /* ==========================
     1) Autosave / Restore
     ========================== */

  function fieldKey(el){
    // clé stable : name > id > dataset
    const n = el.getAttribute("name");
    if (n) return `name:${n}`;
    const id = el.getAttribute("id");
    if (id) return `id:${id}`;
    return null;
  }

  function collectDraft(){
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

      if (type === "checkbox"){
        data[k] = !!el.checked;
      } else if (type === "radio"){
        if (el.checked) data[k] = el.value ?? true;
        else if (data[k] == null) data[k] = null;
      } else if (tag === "select"){
        data[k] = el.value;
      } else {
        data[k] = el.value;
      }
    });

    // scroll pos
    const scrollY = Math.max(0, Math.round(window.scrollY || 0));

    setJson(KEY, data);
    setJson(META_KEY, {
      updated_at: nowIso(),
      scrollY
    });
  }

  function restoreDraft(){
    const data = getJson(KEY);
    if (!data || typeof data !== "object") return false;

    const fields = $$("input, textarea, select").filter(el => !el.disabled);
    let restoredAny = false;

    fields.forEach(el => {
      const k = fieldKey(el);
      if (!k || !(k in data)) return;

      const tag = (el.tagName || "").toLowerCase();
      const type = (el.getAttribute("type") || "").toLowerCase();
      const val = data[k];

      try{
        if (type === "checkbox"){
          el.checked = !!val;
          restoredAny = true;
          el.dispatchEvent(new Event("change", { bubbles:true }));
        } else if (type === "radio"){
          if (val == null) return;
          if (String(el.value) === String(val)){
            el.checked = true;
            restoredAny = true;
            el.dispatchEvent(new Event("change", { bubbles:true }));
          }
        } else if (tag === "select"){
          el.value = String(val ?? "");
          restoredAny = true;
          el.dispatchEvent(new Event("change", { bubbles:true }));
        } else {
          el.value = String(val ?? "");
          restoredAny = true;
          el.dispatchEvent(new Event("input", { bubbles:true }));
        }
      } catch {}
    });

    // restore scroll (soft)
    const meta = getJson(META_KEY);
    if (meta && typeof meta.scrollY === "number"){
      setTimeout(() => {
        try { window.scrollTo({ top: meta.scrollY, behavior: "smooth" }); } catch {}
      }, 150);
    }

    return restoredAny;
  }

  function clearDraft(){
    try { localStorage.removeItem(KEY); } catch {}
    try { localStorage.removeItem(META_KEY); } catch {}
  }

  /* ==========================
     2) UI: toast + bottomBar
     ========================== */

  function mountToast(){
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
    $("#qpToastResume")?.addEventListener("click", () => {
      toast.classList.remove("is-on");
      restoreDraft();
    });
  }

  function mountBottomBar(){
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

    $("#qpBarResume")?.addEventListener("click", () => restoreDraft());
    $("#qpBarReset")?.addEventListener("click", () => {
      if (!confirm("Réinitialiser la reprise (brouillon local) ?")) return;
      clearDraft();
      updateResumeMeta();
      // option: remonte en haut
      try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {}
    });
  }

  function hasDraft(){
    const data = getJson(KEY);
    if (!data || typeof data !== "object") return false;

    // Si au moins une valeur utile existe
    return Object.keys(data).some(k => {
      const v = data[k];
      if (v === true) return true;
      if (typeof v === "string" && v.trim().length) return true;
      if (typeof v === "number" && isFinite(v)) return true;
      return false;
    });
  }

  function updateResumeMeta(){
    const meta = getJson(META_KEY);
    const txt = meta?.updated_at ? `Dernière saisie ${humanTimeAgo(meta.updated_at)} • local` : "Brouillon local";
    const t1 = $("#qpToastMeta");
    const t2 = $("#qpBarMeta");
    if (t1) t1.textContent = txt;
    if (t2) t2.textContent = txt;

    const show = hasDraft();
    const toast = $("#qpToast");
    const bar = $("#qpBottomBar");

    if (bar) bar.style.display = show ? "" : "none"; // CSS gère mobile
    if (toast){
      if (show) toast.classList.add("is-on");
      else toast.classList.remove("is-on");
    }
  }

  /* ==========================
     3) Reveal animations
     ========================== */
  function applyReveal(){
    const candidates = [
      ".pro-card", ".card", ".question-card", "fieldset", ".panel", ".step", ".section", ".box",
      ".pro-hero", ".pro-scoreCard", ".pro-top"
    ];

    const els = [];
    candidates.forEach(sel => {
      $$(sel).forEach(el => els.push(el));
    });

    // dédoublonnage
    const uniq = Array.from(new Set(els)).filter(el => el && el.classList);
    uniq.forEach(el => el.classList.add("qp-reveal"));

    if (!uniq.length) return;

    if (!("IntersectionObserver" in window)){
      uniq.forEach((el,i) => setTimeout(() => el.classList.add("is-in"), 40*i));
      return;
    }

    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting){
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.08 });

    uniq.forEach((el,i) => {
      el.style.transitionDelay = (i * 40) + "ms";
      io.observe(el);
    });
  }

  /* ==========================
     4) Hook autosave on interactions
     ========================== */
  function wireAutosave(){
    // autosave sur input/change + throttle
    let t = null;
    function schedule(){
      clearTimeout(t);
      t = setTimeout(() => {
        collectDraft();
        updateResumeMeta();
      }, 220);
    }

    document.addEventListener("input", (e) => {
      const el = e.target;
      if (!el) return;
      if (!(el instanceof HTMLElement)) return;
      if (!["INPUT","TEXTAREA","SELECT"].includes(el.tagName)) return;
      schedule();
    }, { passive:true });

    document.addEventListener("change", (e) => {
      const el = e.target;
      if (!el) return;
      if (!(el instanceof HTMLElement)) return;
      if (!["INPUT","TEXTAREA","SELECT"].includes(el.tagName)) return;
      schedule();
    }, { passive:true });

    window.addEventListener("beforeunload", () => {
      try { collectDraft(); } catch {}
    });
  }

  /* ==========================
     Init
     ========================== */
  function init(){
    mountToast();
    mountBottomBar();
    applyReveal();
    wireAutosave();

    // 1er save (pour avoir meta)
    try { collectDraft(); } catch {}
    updateResumeMeta();

    // Si brouillon existe, on ne force pas la restore : on propose via toast/bar.
    // Mais si tu veux auto-restore silencieux, décommente :
    // if (hasDraft()) restoreDraft();
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();