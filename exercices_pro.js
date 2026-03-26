/* =========================================================
   Vivario PRO — exercices_pro.js (v1.0 ultra safe)
   - Lit exercices_pro.json (gros catalogue)
   - UI cartes “vidéo”
   - Reco auto via vivario_pro_result_v1.scores
   - TTS (speechSynthesis)
   - Timer + progress bar
   - “Terminé ✅” + stockage local (aujourd’hui + historique)
   - Tolère plusieurs structures JSON (array / exercises / items / data...)
   ========================================================= */

(function(){
  const JSON_URL = "exercices_pro.json";

  // --- stockage
  const RESULT_KEY = "vivario_pro_result_v1";
  const DONE_KEY = "vivario_pro_ex_done_v1";           // { byDay: { "YYYY-MM-DD": { ids:[], at:{} } }, all: {id:{last_at, count}} }
  const UI_KEY   = "vivario_pro_ex_ui_v1";             // prefs (filters)

  // --- rendu
  const PAGE_SIZE = 36;
  const RECO_COUNT = 6;
  const CATALOG_MAX_RENDER = 240; // on garde une limite + "Charger plus" pour rester fluide

  // --- DOM
  const elKpiCount = document.getElementById("kpiCount");
  const elKpiReco = document.getElementById("kpiReco");
  const elKpiDoneToday = document.getElementById("kpiDoneToday");
  const elKpiMode = document.getElementById("kpiMode");
  const elKpiModeSub = document.getElementById("kpiModeSub");
  const elFiltersMeta = document.getElementById("filtersMeta");
  const elSubLine = document.getElementById("subLine");

  const elQ = document.getElementById("q");
  const elSelCategory = document.getElementById("selCategory");
  const elSelVariant = document.getElementById("selVariant");
  const elSelLevel = document.getElementById("selLevel");
  const elDomainChips = document.getElementById("domainChips");
  const elToast = document.getElementById("toast");

  const elRecoGrid = document.getElementById("recoGrid");
  const elCatalogGrid = document.getElementById("catalogGrid");
  const elBtnLoadMore = document.getElementById("btnLoadMore");
  const elBtnResetFilters = document.getElementById("btnResetFilters");
  const elBtnRefreshReco = document.getElementById("btnRefreshReco");
  const elBtnClearDoneToday = document.getElementById("btnClearDoneToday");

  // Modal
  const m = {
    root: document.getElementById("modal"),
    title: document.getElementById("mTitle"),
    sub: document.getElementById("mSub"),
    media: document.getElementById("mMedia"),
    desc: document.getElementById("mDesc"),
    steps: document.getElementById("mSteps"),
    tips: document.getElementById("mTips"),
    safety: document.getElementById("mSafety"),
    tags: document.getElementById("mTags"),
    domains: document.getElementById("mDomains"),
    nextHint: document.getElementById("mNextHint"),
    foot: document.getElementById("mFoot"),
    toast: document.getElementById("mToast"),

    vbShort: document.getElementById("vbShort"),
    vbLong: document.getElementById("vbLong"),
    vbAuto: document.getElementById("vbAuto"),

    tLeft: document.getElementById("tLeft"),
    tFill: document.getElementById("tFill"),
    btnStart: document.getElementById("btnStart"),
    btnPause: document.getElementById("btnPause"),
    btnResetTimer: document.getElementById("btnResetTimer"),

    btnSpeak: document.getElementById("btnSpeak"),
    btnStopSpeak: document.getElementById("btnStopSpeak"),
    selRate: document.getElementById("selRate"),

    btnMarkDone: document.getElementById("btnMarkDone"),
    btnClose: document.getElementById("btnClose"),
    btnNextAuto: document.getElementById("btnNextAuto"),
    btnBackToList: document.getElementById("btnBackToList"),
    btnCopySteps: document.getElementById("btnCopySteps"),
  };

  // --- état
  let ALL = [];
  let FILTERED = [];
  let RECO = [];
  let renderCount = 0;

  let selectedDomains = new Set(); // chips
  let current = null; // exercice sélectionné
  let currentVariantMode = "auto"; // "auto" | "court" | "long"

  // timer
  let timer = {
    total: 0,
    left: 0,
    running: false,
    t0: 0,
    raf: 0
  };

  // TTS
  let tts = {
    speaking: false,
    utter: null
  };

  // ---------- helpers
  function getJson(key){
    try{ return JSON.parse(localStorage.getItem(key) || "null"); }catch{ return null; }
  }
  function setJson(key, val){
    try{ localStorage.setItem(key, JSON.stringify(val)); }catch{}
  }

  function toast(msg){
    if (!elToast) return;
    elToast.textContent = msg || "";
    elToast.classList.add("is-on");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => elToast.classList.remove("is-on"), 2200);
  }
  function mtoast(msg){
    if (!m.toast) return;
    m.toast.textContent = msg || "";
    m.toast.classList.add("is-on");
    clearTimeout(mtoast._t);
    mtoast._t = setTimeout(() => m.toast.classList.remove("is-on"), 2200);
  }

  function esc(s){
    return String(s ?? "").replace(/[&<>"']/g, (ch) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[ch]));
  }

  function todayKey(){
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const day = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  }

  function normalizeStr(s){
    return String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }

  function scoreBand(score){
    const s = Number(score || 0);
    if (s >= 75) return "alert";
    if (s >= 45) return "warn";
    return "good";
  }

  function severityLabel(score){
    if (score >= 75) return "Élevé";
    if (score >= 45) return "Modéré";
    if (score >= 20) return "Léger";
    return "Faible";
  }

  function prettySeconds(sec){
    const s = Math.max(0, Math.round(Number(sec || 0)));
    const mm = String(Math.floor(s/60)).padStart(2,"0");
    const ss = String(s%60).padStart(2,"0");
    return `${mm}:${ss}`;
  }

  function safeArray(v){
    if (!v) return [];
    if (Array.isArray(v)) return v.filter(Boolean);
    return [v].filter(Boolean);
  }

  // ---------- DONE store
  function getDoneStore(){
    let d = getJson(DONE_KEY);
    if (!d || typeof d !== "object") d = { byDay:{}, all:{} };
    if (!d.byDay || typeof d.byDay !== "object") d.byDay = {};
    if (!d.all || typeof d.all !== "object") d.all = {};
    return d;
  }

  function markDone(id){
    const store = getDoneStore();
    const day = todayKey();
    if (!store.byDay[day]) store.byDay[day] = { ids: [], at: {} };

    if (!store.byDay[day].ids.includes(id)) store.byDay[day].ids.unshift(id);
    store.byDay[day].at[id] = new Date().toISOString();

    if (!store.all[id]) store.all[id] = { last_at: null, count: 0 };
    store.all[id].last_at = new Date().toISOString();
    store.all[id].count = (store.all[id].count || 0) + 1;

    setJson(DONE_KEY, store);
    refreshDoneKpi();
    paintDoneBadges();
  }

  function isDoneToday(id){
    const store = getDoneStore();
    const day = todayKey();
    const x = store.byDay?.[day]?.ids || [];
    return x.includes(id);
  }

  function doneCountToday(){
    const store = getDoneStore();
    const day = todayKey();
    return (store.byDay?.[day]?.ids || []).length;
  }

  function resetDoneToday(){
    const store = getDoneStore();
    const day = todayKey();
    store.byDay[day] = { ids: [], at: {} };
    setJson(DONE_KEY, store);
    refreshDoneKpi();
    paintDoneBadges();
  }

  function refreshDoneKpi(){
    if (elKpiDoneToday) elKpiDoneToday.textContent = String(doneCountToday());
  }

  // ---------- result / domains
  function getResultScores(){
    const data = getJson(RESULT_KEY);
    const scores = data?.scores;
    if (!scores || typeof scores !== "object") return null;
    return scores;
  }

  function topDomains(scores, n){
    const entries = Object.entries(scores || {});
    entries.sort((a,b) => (b[1]||0) - (a[1]||0));
    return entries.slice(0, n).filter(e => (e[1]||0) > 0);
  }

  function buildDomainChipList(){
    // domaines par le diagnostic si présent, sinon: domaines trouvés dans le JSON
    const scores = getResultScores();
    let domains = [];

    if (scores){
      domains = topDomains(scores, 8).map(([k,v]) => ({ key:k, score:Number(v||0), from:"diag" }));
      if (elKpiMode) elKpiMode.textContent = "Auto";
      if (elKpiModeSub) elKpiModeSub.textContent = "basé sur ton diagnostic";
      if (elSubLine) elSubLine.textContent = "Recommandations actives : basées sur ton dernier diagnostic PRO (local).";
    } else {
      // fallback : domaines trouvés
      const set = new Set();
      ALL.forEach(x => safeArray(x.domains).forEach(d => set.add(String(d))));
      domains = Array.from(set).slice(0, 10).map(d => ({ key:d, score:0, from:"catalog" }));
      if (elKpiMode) elKpiMode.textContent = "Catalogue";
      if (elKpiModeSub) elKpiModeSub.textContent = "pas de score détecté";
      if (elSubLine) elSubLine.textContent = "Aucun diagnostic PRO détecté : recommandations basées sur le catalogue (générique).";
    }

    elDomainChips.innerHTML = "";
    const allChip = document.createElement("button");
    allChip.className = "chip is-on";
    allChip.type = "button";
    allChip.textContent = "Tous domaines";
    allChip.onclick = () => {
      selectedDomains.clear();
      renderDomainChips(domains);
      applyFilters(true);
    };
    elDomainChips.appendChild(allChip);

    renderDomainChips(domains);
  }

  function renderDomainChips(domains){
    // réécrit à partir du 2e chip (garde le “Tous” en premier)
    const keepFirst = elDomainChips.querySelector(".chip");
    elDomainChips.innerHTML = "";
    if (keepFirst) elDomainChips.appendChild(keepFirst);

    const allOn = selectedDomains.size === 0;
    keepFirst?.classList.toggle("is-on", allOn);

    domains.forEach(d => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      const label = d.score ? `${d.key} (${Math.round(d.score)})` : d.key;
      b.textContent = label;
      b.classList.toggle("is-on", selectedDomains.has(d.key));

      b.onclick = () => {
        if (selectedDomains.has(d.key)) selectedDomains.delete(d.key);
        else selectedDomains.add(d.key);
        renderDomainChips(domains);
        applyFilters(true);
      };

      elDomainChips.appendChild(b);
    });
  }

  // ---------- JSON parsing (tolérant)
  function coerceExercise(raw, idx){
    // on essaye d’être compatible avec n’importe quelle structure de génération
    const id = String(raw?.id || raw?.uid || raw?.key || raw?.slug || `ex_${idx}`);
    const title = String(raw?.title || raw?.name || raw?.label || "Exercice");
    const category = normalizeKey(raw?.category || raw?.type || raw?.family || "");
    const level = normalizeKey(raw?.level || raw?.difficulty || raw?.niveau || "debutant");
    const tags = safeArray(raw?.tags || raw?.keywords || raw?.motscles).map(String);

    const domains = safeArray(raw?.domains || raw?.targets || raw?.cibles || raw?.domaines).map(String);

    const desc = String(raw?.desc || raw?.description || raw?.summary || "");
    const steps = safeArray(raw?.steps || raw?.instructions || raw?.howto || raw?.etapes).map(String);

    const tips = safeArray(raw?.tips || raw?.conseils).map(String);
    const safety = safeArray(raw?.safety || raw?.warnings || raw?.precautions || raw?.contraindications).map(String);

    // media
    const media = raw?.media || {};
    const video = String(media?.video || raw?.video || raw?.mp4 || raw?.webm || "");
    const gif = String(media?.gif || raw?.gif || "");
    const image = String(media?.image || raw?.image || raw?.img || "");

    // variantes (court/long)
    const v = raw?.variants || raw?.variant || {};
    const shortObj = v?.short || raw?.short || null;
    const longObj  = v?.long  || raw?.long  || null;

    const shortSec = Number(shortObj?.seconds || shortObj?.durationSec || shortObj?.duration || raw?.short_seconds || raw?.shortSec || 60);
    const longSec  = Number(longObj?.seconds  || longObj?.durationSec  || longObj?.duration  || raw?.long_seconds  || raw?.longSec  || 180);

    const shortSteps = safeArray(shortObj?.steps || shortObj?.instructions).map(String);
    const longSteps  = safeArray(longObj?.steps  || longObj?.instructions).map(String);

    const out = {
      id,
      title,
      category: category || guessCategory(title, tags),
      level: level || "debutant",
      tags,
      domains,
      desc,
      steps,
      tips,
      safety,
      media: { video, gif, image },
      variants: {
        short: { seconds: isFinite(shortSec) ? shortSec : 60, steps: shortSteps },
        long:  { seconds: isFinite(longSec) ? longSec : 180, steps: longSteps }
      }
    };

    // nettoyage
    if (!out.variants.short.steps.length && out.steps.length) out.variants.short.steps = out.steps.slice(0, Math.min(4, out.steps.length));
    if (!out.variants.long.steps.length && out.steps.length) out.variants.long.steps = out.steps.slice(0);

    return out;
  }

  function normalizeKey(v){
    const s = normalizeStr(v);
    if (!s) return "";
    if (s.includes("inter")) return "intermediaire";
    if (s.includes("avan") || s.includes("expert")) return "avance";
    if (s.includes("deb")) return "debutant";

    if (s.includes("resp")) return "respiration";
    if (s.includes("yog")) return "yoga";
    if (s.includes("card")) return "cardio";
    if (s.includes("ancr")) return "ancrage";
    if (s.includes("mobi") || s.includes("soupl") || s.includes("etir")) return "mobilite";
    if (s.includes("ment") || s.includes("cogn") || s.includes("psy")) return "mental";
    return s.replace(/[^a-z0-9_-]/g,"");
  }

  function guessCategory(title, tags){
    const t = normalizeStr(title + " " + (tags||[]).join(" "));
    if (t.includes("resp") || t.includes("souffle") || t.includes("inspire") || t.includes("expire")) return "respiration";
    if (t.includes("yoga") || t.includes("asana") || t.includes("chien") || t.includes("salutation")) return "yoga";
    if (t.includes("cardio") || t.includes("marche") || t.includes("course") || t.includes("hiit")) return "cardio";
    if (t.includes("ancr") || t.includes("ground") || t.includes("5-4-3-2-1") || t.includes("sensor")) return "ancrage";
    if (t.includes("mobil") || t.includes("étire") || t.includes("etire") || t.includes("nuque") || t.includes("épaule") || t.includes("epaule")) return "mobilite";
    return "mental";
  }

  async function loadCatalog(){
    let json = null;
    try{
      const res = await fetch(JSON_URL, { cache: "force-cache" });
      if (!res.ok) throw new Error("HTTP");
      json = await res.json();
    }catch(e){
      toast("❌ Impossible de charger exercices_pro.json (vérifie qu’il est bien à la racine du site).");
      throw e;
    }

    // extraction tolérante
    let arr = null;
    if (Array.isArray(json)) arr = json;
    else if (Array.isArray(json?.exercises)) arr = json.exercises;
    else if (Array.isArray(json?.items)) arr = json.items;
    else if (Array.isArray(json?.data?.exercises)) arr = json.data.exercises;
    else if (Array.isArray(json?.data?.items)) arr = json.data.items;

    if (!Array.isArray(arr)) {
      toast("⚠️ JSON chargé mais structure inconnue. (Je peux l’adapter si tu me donnes le début du fichier)");
      arr = [];
    }

    ALL = arr.map(coerceExercise).filter(x => x && x.id);
    if (elKpiCount) elKpiCount.textContent = String(ALL.length);

    // KPI reco (sera mis après calcul)
    buildDomainChipList();
  }

  // ---------- scoring / reco
  function getUserContext(){
    const scores = getResultScores();
    if (!scores){
      return {
        hasScores:false,
        top: [],
        band: "good",
        primaryScore: 0
      };
    }

    const top = topDomains(scores, 4);
    const primaryScore = Number(top?.[0]?.[1] || 0);
    return {
      hasScores:true,
      top,
      band: scoreBand(primaryScore),
      primaryScore
    };
  }

  function computeExerciseScore(ex){
    // score = match domaines + match catégorie + match tags (léger)
    const ctx = getUserContext();
    let score = 0;

    if (ctx.hasScores){
      const dom = safeArray(ex.domains).map(d => normalizeStr(d));
      ctx.top.forEach(([k,v], idx) => {
        const kk = normalizeStr(k);
        const vv = Number(v||0);
        const weight = (idx === 0 ? 1.0 : idx === 1 ? 0.65 : 0.45);
        const hit = dom.some(d => d.includes(kk) || kk.includes(d));
        if (hit) score += vv * weight;
      });

      // band -> préférences
      if (ctx.band === "alert"){
        // on préfère court + respiration/ancrage/mobilité
        if (ex.category === "respiration") score += 25;
        if (ex.category === "ancrage") score += 20;
        if (ex.category === "mobilite") score += 12;
        if (ex.category === "cardio") score -= 8;
      } else if (ctx.band === "warn"){
        if (ex.category === "respiration") score += 12;
        if (ex.category === "yoga") score += 10;
        if (ex.category === "mobilite") score += 10;
        if (ex.category === "cardio") score += 4;
      } else {
        if (ex.category === "cardio") score += 10;
        if (ex.category === "yoga") score += 10;
        if (ex.category === "mental") score += 6;
      }
    } else {
      // sans diag: base “équilibrée”
      const base = { respiration: 14, ancrage: 12, mobilite: 10, mental: 8, yoga: 10, cardio: 6 };
      score += base[ex.category] || 7;
    }

    // évite répétition: si fait aujourd’hui, descend un peu
    if (isDoneToday(ex.id)) score -= 20;

    return score;
  }

  function computeReco(){
    const ctx = getUserContext();

    const candidates = ALL.slice();
    candidates.sort((a,b) => computeExerciseScore(b) - computeExerciseScore(a));

    // on prend un set diversifié
    const picked = [];
    const catCount = new Map();
    for (const ex of candidates){
      if (picked.length >= RECO_COUNT) break;

      const c = ex.category || "x";
      const n = catCount.get(c) || 0;
      if (n >= 2) continue; // max 2 par catégorie

      picked.push(ex);
      catCount.set(c, n + 1);
    }

    RECO = picked;
    if (elKpiReco) elKpiReco.textContent = String(RECO.length);

    const meta = ctx.hasScores
      ? `Reco: top domaines = ${ctx.top.map(x => x[0]).slice(0,3).join(", ")}`
      : `Reco: pas de diagnostic détecté`;
    if (elFiltersMeta) elFiltersMeta.textContent = meta;
  }

  // ---------- filtres
  function saveUI(){
    const data = {
      q: elQ?.value || "",
      cat: elSelCategory?.value || "",
      variant: elSelVariant?.value || "",
      level: elSelLevel?.value || "",
      domains: Array.from(selectedDomains)
    };
    setJson(UI_KEY, data);
  }
  function loadUI(){
    const data = getJson(UI_KEY);
    if (!data) return;
    if (elQ) elQ.value = data.q || "";
    if (elSelCategory) elSelCategory.value = data.cat || "";
    if (elSelVariant) elSelVariant.value = data.variant || "";
    if (elSelLevel) elSelLevel.value = data.level || "";
    if (Array.isArray(data.domains)){
      selectedDomains = new Set(data.domains.filter(Boolean));
    }
  }

  function matchesFilters(ex){
    const q = normalizeStr(elQ?.value || "");
    const cat = normalizeKey(elSelCategory?.value || "");
    const variant = normalizeKey(elSelVariant?.value || ""); // court/long
    const level = normalizeKey(elSelLevel?.value || "");

    if (cat && normalizeKey(ex.category) !== cat) return false;
    if (level && normalizeKey(ex.level) !== level) return false;

    if (variant){
      // si variant=court -> privilégie ceux qui ont short <= 120
      if (variant === "court"){
        const sec = Number(ex.variants?.short?.seconds || 60);
        if (sec > 150) return false;
      } else if (variant === "long"){
        const sec = Number(ex.variants?.long?.seconds || 180);
        if (sec < 150) return false;
      }
    }

    if (selectedDomains.size > 0){
      const dom = safeArray(ex.domains).map(d => normalizeStr(d));
      const ok = Array.from(selectedDomains).some(sd => {
        const s = normalizeStr(sd);
        return dom.some(d => d.includes(s) || s.includes(d));
      });
      if (!ok) return false;
    }

    if (q){
      const blob = normalizeStr(
        (ex.title||"") + " " +
        (ex.desc||"") + " " +
        (safeArray(ex.tags).join(" ")) + " " +
        (safeArray(ex.domains).join(" "))
      );
      if (!blob.includes(q)) return false;
    }

    return true;
  }

  function applyFilters(resetRender){
    if (resetRender){
      renderCount = 0;
      elCatalogGrid.innerHTML = "";
    }

    FILTERED = ALL.filter(matchesFilters);

    const txt = [];
    if (elSelCategory?.value) txt.push(elSelCategory.value);
    if (elSelVariant?.value) txt.push(elSelVariant.value);
    if (elSelLevel?.value) txt.push(elSelLevel.value);
    if (selectedDomains.size) txt.push(`${selectedDomains.size} domaine(s)`);

    if (elFiltersMeta){
      elFiltersMeta.textContent = `${FILTERED.length} résultat(s) • ${txt.length ? txt.join(" • ") : "sans filtre"}`;
    }

    saveUI();
    renderCatalogMore();
  }

  // ---------- render cards
  function makeCard(ex, opts = {}){
    const done = isDoneToday(ex.id);
    const band = (function(){
      // si l'ex a des domaines et qu'on a des scores, on prend le max score matching
      const scores = getResultScores();
      if (!scores) return "good";
      const dom = safeArray(ex.domains).map(d => normalizeStr(d));
      let best = 0;
      Object.entries(scores).forEach(([k,v]) => {
        const kk = normalizeStr(k);
        if (dom.some(d => d.includes(kk) || kk.includes(d))) best = Math.max(best, Number(v||0));
      });
      return scoreBand(best);
    })();

    const mediaHTML = buildMediaHTML(ex);

    const tags = [];
    tags.push(`<span class="tag"><i></i>${esc(ex.category || "module")}</span>`);
    tags.push(`<span class="tag"><i></i>${esc(ex.level || "debutant")}</span>`);
    const sec = pickVariant(ex).seconds;
    tags.push(`<span class="tag"><i></i>${esc(Math.round(sec/60))} min</span>`);
    if (done) tags.push(`<span class="tag done"><i></i>Terminé ✅</span>`);

    const el = document.createElement("div");
    el.className = "card";
    el.setAttribute("role","button");
    el.setAttribute("tabindex","0");
    el.innerHTML = `
      <div class="media">
        ${mediaHTML}
        <div class="badgeRow">
          <span class="pill ${band}">${band === "alert" ? "Urgence douce" : (band === "warn" ? "Stabilité" : "Consolidation")}</span>
          ${done ? `<span class="pill good">✅ Fait</span>` : ``}
        </div>
      </div>
      <div class="body">
        <p class="title">${esc(ex.title)}</p>
        <p class="desc">${esc(ex.desc || "Exercice guidé (étapes + timer + voix).")}</p>
        <div class="metaRow">
          ${tags.join("")}
        </div>
      </div>
    `;

    el.onclick = () => openExercise(ex.id, opts.from || "catalog");
    el.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " "){
        e.preventDefault();
        openExercise(ex.id, opts.from || "catalog");
      }
    };

    return el;
  }

  function buildMediaHTML(ex){
    const v = ex.media?.video || "";
    const g = ex.media?.gif || "";
    const i = ex.media?.image || "";

    // priorité: video > gif/image > placeholder
    if (v){
      return `<video src="${esc(v)}" muted playsinline loop autoplay preload="metadata"></video>`;
    }
    if (g){
      return `<img src="${esc(g)}" alt="" loading="lazy" />`;
    }
    if (i){
      return `<img src="${esc(i)}" alt="" loading="lazy" />`;
    }
    return `<div class="ph"></div><div class="shimmer"></div>`;
  }

  function renderReco(){
    elRecoGrid.innerHTML = "";
    if (!RECO.length){
      elRecoGrid.innerHTML = `<div class="panel" style="grid-column: 1 / -1;">
        <b>Pas de recommandation.</b>
        <div class="muted" style="margin-top:6px;">Vérifie que le JSON est chargé, puis clique “Recalculer”.</div>
      </div>`;
      return;
    }

    RECO.forEach(ex => elRecoGrid.appendChild(makeCard(ex, { from:"reco" })));
  }

  function renderCatalogMore(){
    // assure que le bouton ne dépasse pas une limite
    const maxCanRender = Math.min(FILTERED.length, CATALOG_MAX_RENDER);
    const remaining = maxCanRender - renderCount;

    if (remaining <= 0){
      elBtnLoadMore.disabled = true;
      elBtnLoadMore.style.opacity = ".55";
      elBtnLoadMore.textContent = (FILTERED.length > CATALOG_MAX_RENDER)
        ? `Limite affichage atteinte (${CATALOG_MAX_RENDER}). Utilise les filtres.`
        : "Tout est affiché";
      return;
    }

    const n = Math.min(PAGE_SIZE, remaining);
    const slice = FILTERED.slice(renderCount, renderCount + n);
    slice.forEach(ex => elCatalogGrid.appendChild(makeCard(ex, { from:"catalog" })));
    renderCount += n;

    elBtnLoadMore.disabled = false;
    elBtnLoadMore.style.opacity = "1";
    elBtnLoadMore.textContent = `Charger plus (${renderCount}/${maxCanRender})`;
  }

  function paintDoneBadges(){
    // re-render minimal : on ne reboucle pas tout le DOM proprement, mais c'est ok (petit set)
    // => on refait reco + reset catalog affiché
    renderCount = 0;
    elCatalogGrid.innerHTML = "";
    renderReco();
    applyFilters(true);
  }

  // ---------- modal / variant / timer / TTS
  function pickVariant(ex){
    const mode = currentVariantMode;
    const ctx = getUserContext();

    if (mode === "court") return ex.variants.short;
    if (mode === "long") return ex.variants.long;

    // auto :
    if (!ctx.hasScores) return ex.variants.short;

    if (ctx.band === "alert") return ex.variants.short;
    if (ctx.band === "warn") return ex.variants.short.seconds <= 180 ? ex.variants.short : ex.variants.long;
    return ex.variants.long;
  }

  function setVariantButtons(mode){
    currentVariantMode = mode;
    m.vbShort.classList.toggle("is-on", mode === "court");
    m.vbLong.classList.toggle("is-on", mode === "long");
    m.vbAuto.classList.toggle("is-on", mode === "auto");
    // reset timer based on variant
    if (current) resetTimerFromVariant();
    saveUI(); // optionnel
  }

  function resetTimerFromVariant(){
    stopTimer();
    const v = pickVariant(current);
    timer.total = Math.max(10, Number(v.seconds || 60));
    timer.left = timer.total;
    updateTimerUI();
  }

  function updateTimerUI(){
    if (!m.tLeft || !m.tFill) return;
    m.tLeft.textContent = prettySeconds(timer.left || 0);
    const pct = timer.total ? (1 - (timer.left / timer.total)) * 100 : 0;
    m.tFill.style.width = clamp(pct, 0, 100) + "%";
  }

  function beep(){
    try{
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 880;
      g.gain.value = 0.06;
      o.connect(g); g.connect(ctx.destination);
      o.start();
      setTimeout(() => { o.stop(); ctx.close(); }, 180);
    }catch{}
  }

  function tick(){
    if (!timer.running) return;
    const now = performance.now();
    const dt = (now - timer.t0) / 1000;
    timer.t0 = now;

    timer.left = Math.max(0, timer.left - dt);
    updateTimerUI();

    if (timer.left <= 0){
      timer.running = false;
      cancelAnimationFrame(timer.raf);
      timer.raf = 0;
      beep();
      mtoast("⏱️ Timer terminé ✅");
      return;
    }
    timer.raf = requestAnimationFrame(tick);
  }

  function startTimer(){
    if (!current) return;
    if (timer.left <= 0) timer.left = timer.total || 60;
    timer.running = true;
    timer.t0 = performance.now();
    if (!timer.raf) timer.raf = requestAnimationFrame(tick);
  }

  function pauseTimer(){
    timer.running = false;
  }

  function stopTimer(){
    timer.running = false;
    if (timer.raf) cancelAnimationFrame(timer.raf);
    timer.raf = 0;
  }

  function speakText(text){
    try{
      if (!("speechSynthesis" in window)) { mtoast("TTS non disponible sur ce navigateur."); return; }
      stopSpeak();

      const rate = Number(m.selRate?.value || 1) || 1;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "fr-FR";
      u.rate = clamp(rate, 0.7, 1.4);

      // tente d’utiliser une voix FR si dispo
      const voices = speechSynthesis.getVoices?.() || [];
      const fr = voices.find(v => (v.lang||"").toLowerCase().startsWith("fr"));
      if (fr) u.voice = fr;

      u.onend = () => { tts.speaking = false; tts.utter = null; };
      u.onerror = () => { tts.speaking = false; tts.utter = null; };

      tts.speaking = true;
      tts.utter = u;
      speechSynthesis.speak(u);
    }catch{
      mtoast("Erreur TTS.");
    }
  }

  function stopSpeak(){
    try{
      if ("speechSynthesis" in window) speechSynthesis.cancel();
    }catch{}
    tts.speaking = false;
    tts.utter = null;
  }

  function buildSpeakPayload(ex){
    const v = pickVariant(ex);
    const steps = (v.steps && v.steps.length) ? v.steps : ex.steps;
    const parts = [];
    parts.push(ex.title);
    if (ex.desc) parts.push(ex.desc);
    if (steps && steps.length){
      parts.push("Étapes :");
      steps.forEach((s, i) => parts.push(`Étape ${i+1}. ${s}`));
    }
    if (ex.tips && ex.tips.length){
      parts.push("Conseils :");
      ex.tips.slice(0, 4).forEach(t => parts.push(t));
    }
    return parts.join(". ");
  }

  function renderListBlock(arr){
    const list = safeArray(arr);
    if (!list.length) return `<p class="muted">—</p>`;
    return `<ul>${list.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`;
  }

  function renderTags(ex){
    const out = [];
    out.push(`<div class="tag"><i></i>${esc(ex.category || "module")}</div>`);
    out.push(`<div class="tag"><i></i>${esc(ex.level || "debutant")}</div>`);
    safeArray(ex.tags).slice(0, 10).forEach(t => out.push(`<div class="tag"><i></i>${esc(t)}</div>`));
    if (isDoneToday(ex.id)) out.push(`<div class="tag done"><i></i>Terminé ✅</div>`);
    return out.join("");
  }

  function renderDomains(ex){
    const dom = safeArray(ex.domains);
    if (!dom.length) return `<p class="muted">—</p>`;
    const scores = getResultScores() || {};
    const chips = dom.slice(0, 12).map(d => {
      const val = Number(scores[d] || scores[Object.keys(scores).find(k => normalizeStr(k) === normalizeStr(d))] || 0);
      const band = scoreBand(val);
      const label = val ? `${d} • ${Math.round(val)} (${severityLabel(val)})` : d;
      return `<div class="tag ${band === "alert" ? "done" : ""}"><i></i>${esc(label)}</div>`;
    });
    return `<div style="display:flex; gap:8px; flex-wrap:wrap;">${chips.join("")}</div>`;
  }

  function openExercise(id, from){
    const ex = ALL.find(x => x.id === id);
    if (!ex) { toast("Exercice introuvable."); return; }

    current = ex;
    stopTimer();
    stopSpeak();

    // auto par défaut à chaque ouverture
    setVariantButtons("auto");
    resetTimerFromVariant();

    // header
    m.title.textContent = ex.title;
    const sec = pickVariant(ex).seconds;
    m.sub.textContent = `${ex.category} • ${ex.level} • ${Math.round(sec/60)} min • ${from === "reco" ? "recommandé" : "catalogue"}`;

    // media modal
    m.media.innerHTML = "";
    const v = ex.media?.video || "";
    const g = ex.media?.gif || "";
    const i = ex.media?.image || "";
    if (v){
      m.media.innerHTML = `<video src="${esc(v)}" muted playsinline loop autoplay controls preload="metadata"></video>`;
    } else if (g){
      m.media.innerHTML = `<img src="${esc(g)}" alt="" loading="lazy" />`;
    } else if (i){
      m.media.innerHTML = `<img src="${esc(i)}" alt="" loading="lazy" />`;
    } else {
      m.media.innerHTML = `<div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color: rgba(234,240,255,.72); font-weight:900;">
        Aperçu indisponible
      </div>`;
    }

    // contenu
    m.desc.textContent = ex.desc || "Exercice guidé (étapes + timer + voix).";

    const vSteps = pickVariant(ex).steps;
    const steps = (vSteps && vSteps.length) ? vSteps : ex.steps;
    m.steps.innerHTML = renderListBlock(steps);

    m.tips.innerHTML = renderListBlock(ex.tips);
    m.safety.innerHTML = renderListBlock(ex.safety);

    m.tags.innerHTML = `<div style="display:flex; gap:8px; flex-wrap:wrap;">${renderTags(ex)}</div>`;
    m.domains.innerHTML = renderDomains(ex);

    // foot
    m.foot.textContent = `ID: ${ex.id} • Timer: ${prettySeconds(timer.total)} • Local`;

    // next hint
    m.nextHint.textContent = buildNextHint();

    // mark done button state
    m.btnMarkDone.textContent = isDoneToday(ex.id) ? "✅ Déjà fait aujourd’hui" : "✅ Terminé";
    m.btnMarkDone.classList.toggle("primary", !isDoneToday(ex.id));

    // open
    m.root.classList.add("is-on");
    document.body.style.overflow = "hidden";
  }

  function closeModal(){
    stopTimer();
    stopSpeak();
    m.root.classList.remove("is-on");
    document.body.style.overflow = "";
  }

  function buildNextHint(){
    const ctx = getUserContext();
    if (!ctx.hasScores) return "Mode catalogue : je te proposerai un exercice complémentaire (équilibré).";
    const top = ctx.top.map(x => x[0]).slice(0,2).join(", ");
    return `Auto: basé sur tes domaines principaux (${top}).`;
  }

  function nextAutoExercise(){
    if (!current) return null;
    const scored = ALL.slice().filter(x => x.id !== current.id);
    scored.sort((a,b) => computeExerciseScore(b) - computeExerciseScore(a));
    // évite ceux déjà faits aujourd'hui si possible
    const pick = scored.find(x => !isDoneToday(x.id)) || scored[0] || null;
    return pick;
  }

  // ---------- events
  function wire(){
    elBtnLoadMore?.addEventListener("click", () => renderCatalogMore());

    elBtnResetFilters?.addEventListener("click", () => {
      selectedDomains.clear();
      if (elQ) elQ.value = "";
      if (elSelCategory) elSelCategory.value = "";
      if (elSelVariant) elSelVariant.value = "";
      if (elSelLevel) elSelLevel.value = "";
      buildDomainChipList();
      applyFilters(true);
      toast("Filtres réinitialisés ✅");
    });

    elBtnRefreshReco?.addEventListener("click", () => {
      computeReco();
      renderReco();
      toast("Recommandations recalculées ✅");
    });

    elBtnClearDoneToday?.addEventListener("click", () => {
      if (!confirm("Réinitialiser uniquement les exercices “terminés aujourd’hui” sur cet appareil ?")) return;
      resetDoneToday();
      paintDoneBadges();
      toast("Reset “aujourd’hui” ✅");
    });

    [elQ, elSelCategory, elSelVariant, elSelLevel].forEach(x => {
      x?.addEventListener("input", () => applyFilters(true));
      x?.addEventListener("change", () => applyFilters(true));
    });

    // modal
    m.btnClose?.addEventListener("click", closeModal);
    m.root?.addEventListener("click", (e) => { if (e.target === m.root) closeModal(); });

    window.addEventListener("keydown", (e) => {
      const open = m.root?.classList.contains("is-on");
      if (!open) return;
      if (e.key === "Escape"){ e.preventDefault(); closeModal(); }
    });

    // variantes
    m.vbShort?.addEventListener("click", () => { setVariantButtons("court"); refreshModalVariant(); });
    m.vbLong?.addEventListener("click", () => { setVariantButtons("long"); refreshModalVariant(); });
    m.vbAuto?.addEventListener("click", () => { setVariantButtons("auto"); refreshModalVariant(); });

    function refreshModalVariant(){
      if (!current) return;
      resetTimerFromVariant();
      const vSteps = pickVariant(current).steps;
      const steps = (vSteps && vSteps.length) ? vSteps : current.steps;
      m.steps.innerHTML = renderListBlock(steps);
      m.sub.textContent = `${current.category} • ${current.level} • ${Math.round(pickVariant(current).seconds/60)} min`;
      m.foot.textContent = `ID: ${current.id} • Timer: ${prettySeconds(timer.total)} • Local`;
      mtoast("Variante appliquée ✅");
    }

    // timer
    m.btnStart?.addEventListener("click", () => startTimer());
    m.btnPause?.addEventListener("click", () => { pauseTimer(); mtoast("Pause"); });
    m.btnResetTimer?.addEventListener("click", () => { resetTimerFromVariant(); mtoast("Timer reset"); });

    // TTS
    m.btnSpeak?.addEventListener("click", () => {
      if (!current) return;
      const text = buildSpeakPayload(current);
      speakText(text);
      mtoast("Lecture…");
    });
    m.btnStopSpeak?.addEventListener("click", () => { stopSpeak(); mtoast("Stop"); });

    // Done
    m.btnMarkDone?.addEventListener("click", () => {
      if (!current) return;
      if (!isDoneToday(current.id)){
        markDone(current.id);
        m.btnMarkDone.textContent = "✅ Déjà fait aujourd’hui";
        m.btnMarkDone.classList.remove("primary");
        mtoast("Validé ✅ (local)");
      } else {
        mtoast("Déjà validé aujourd’hui ✅");
      }
      // refresh tags block
      m.tags.innerHTML = `<div style="display:flex; gap:8px; flex-wrap:wrap;">${renderTags(current)}</div>`;
    });

    // Next auto
    m.btnNextAuto?.addEventListener("click", () => {
      const nxt = nextAutoExercise();
      if (!nxt){ mtoast("Aucune proposition."); return; }
      openExercise(nxt.id, "auto");
      mtoast("Prochain recommandé ➜");
    });

    m.btnBackToList?.addEventListener("click", () => {
      closeModal();
      try{ window.scrollTo({ top: 0, behavior:"smooth" }); }catch{}
    });

    m.btnCopySteps?.addEventListener("click", async () => {
      if (!current) return;
      const vSteps = pickVariant(current).steps;
      const steps = (vSteps && vSteps.length) ? vSteps : current.steps;
      const txt = [current.title, "", ...(steps||[])].join("\n");
      try{
        await navigator.clipboard.writeText(txt);
        mtoast("Copié ✅");
      }catch{
        mtoast("Copie impossible (navigateur).");
      }
    });
  }

  // ---------- init
  async function init(){
    refreshDoneKpi();
    loadUI();

    await loadCatalog();

    // si pas de score, on le signale doucement
    if (!getResultScores()){
      toast("ℹ️ Aucun diagnostic PRO détecté : recommandations génériques.");
    }

    computeReco();
    renderReco();

    // catalogue
    applyFilters(true);

    wire();

    // safe voices warmup (certains navigateurs remplissent la liste après coup)
    try{
      if ("speechSynthesis" in window){
        speechSynthesis.getVoices?.();
        window.speechSynthesis.onvoiceschanged = () => {};
      }
    }catch{}

    // kpi mode
    const ctx = getUserContext();
    if (ctx.hasScores){
      if (elKpiMode) elKpiMode.textContent = ctx.band === "alert" ? "Apaisement" : (ctx.band === "warn" ? "Stabilité" : "Consolidation");
      if (elKpiModeSub) elKpiModeSub.textContent = `top score ${Math.round(ctx.primaryScore)} • ${severityLabel(ctx.primaryScore)}`;
    }

    // garde le “Charger plus” actif au départ
    elBtnLoadMore.disabled = false;
  }

  init().catch(() => {});

})();