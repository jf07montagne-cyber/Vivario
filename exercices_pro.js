/* =========================================================
   Vivario PRO — Exercices (Module B) — v1.0 (ULTRA SAFE)
   - UI cartes vidéo (gif/mp4)
   - Lecture JSON exercices_pro.json
   - Reco auto selon vivario_pro_result_v1 (scores)
   - TTS (speechSynthesis) + bouton stop
   - Timer (start/pause/reset) + barre
   - "Terminé ✅" (historique local + activité + proposition suivante)
   ========================================================= */

(function(){
  "use strict";

  // ====== Storage keys (compat) ======
  const PRO_RESULT_KEY   = "vivario_pro_result_v1";
  const PRO_ACTIVITY_KEY = "vivario_pro_activity_v1";

  const EX_JSON_URL      = "exercices_pro.json";
  const EX_DONE_KEY      = "vivario_pro_exercices_done_v1";       // { [exerciseId]: { at, count } }
  const EX_HISTORY_KEY   = "vivario_pro_exercices_history_v1";    // [{id, at, duration_s, tags, domain}]
  const EX_LAST_KEY      = "vivario_pro_exercices_last_v1";       // last selected exercise id
  const EX_PREFS_KEY     = "vivario_pro_exercices_prefs_v1";      // local UI prefs

  // ====== DOM ======
  const $ = (id) => document.getElementById(id);

  const elBadge = $("badgeBand");
  const elBadgeText = $("badgeBandText");

  const kpiTopDomain = $("kpiTopDomain");
  const kpiTopDomainSub = $("kpiTopDomainSub");
  const kpiTopScore = $("kpiTopScore");
  const kpiTopScoreSub = $("kpiTopScoreSub");
  const kpiRecoCount = $("kpiRecoCount");
  const kpiDoneCount = $("kpiDoneCount");

  const searchEl = $("search");
  const filterRow = $("filterRow");
  const btnClearFilters = $("btnClearFilters");
  const btnRefresh = $("btnRefresh");

  const recoGrid = $("recoGrid");
  const allGrid  = $("allGrid");
  const recoEmpty = $("recoEmpty");
  const allEmpty  = $("allEmpty");

  const panelTitle = $("panelTitle");
  const panelSub   = $("panelSub");
  const panelMedia = $("panelMedia");
  const panelSteps = $("panelSteps");

  const btnSpeak = $("btnSpeak");
  const btnStopSpeak = $("btnStopSpeak");
  const btnStart = $("btnStart");
  const btnPause = $("btnPause");
  const btnReset = $("btnReset");
  const btnDone  = $("btnDone");
  const btnOpenSource = $("btnOpenSource");

  const timerLabel = $("timerLabel");
  const timerHint  = $("timerHint");
  const timerFill  = $("timerFill");

  const doneToast  = $("doneToast");
  const nextBox    = $("nextBox");
  const nextHint   = $("nextHint");

  // ====== Utils ======
  function getJson(key){
    try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
  }
  function setJson(key, value){
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }
  function nowIso(){ return new Date().toISOString(); }

  function escapeHTML(str){
    return String(str || "").replace(/[&<>"']/g, (m) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[m]));
  }

  function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }

  function severityLabel(score){
    const s = Number(score || 0);
    if (s >= 75) return "Élevé";
    if (s >= 45) return "Modéré";
    if (s >= 20) return "Léger";
    return "Faible";
  }
  function scoreBand(score){
    const s = Number(score || 0);
    if (s >= 75) return "alert";
    if (s >= 45) return "warn";
    return "good";
  }

  function topDomains(scores, n){
    const entries = Object.entries(scores || {});
    entries.sort((a,b) => (b[1]||0) - (a[1]||0));
    return entries.slice(0, n).filter(e => (e[1]||0) > 0);
  }

  function pushActivity(type, meta){
    try{
      const list = getJson(PRO_ACTIVITY_KEY) || [];
      list.unshift({ type: type || "action", at: nowIso(), meta: meta || {} });
      setJson(PRO_ACTIVITY_KEY, list.slice(0, 20));
    }catch{}
  }

  // ====== Diagnosis context → tags ======
  // Map “domain names” from result into exercise tags/categories
  const DOMAIN_TAG_MAP = [
    { key: /anxi|panique|peur/i, tags:["respiration","ancrage","calme"] },
    { key: /sommeil|insom/i,     tags:["sommeil","respiration","yoga_doux"] },
    { key: /stress/i,           tags:["respiration","décharge","mobilité"] },
    { key: /surcharge|mental|rumin/i, tags:["mental","écriture","focus"] },
    { key: /burn|épuis|fatigue/i, tags:["fatigue","yoga_doux","marche"] },
    { key: /colère/i,           tags:["décharge","cardio","respiration"] },
    { key: /douleur/i,          tags:["mobilité","yoga_doux","relâchement"] },
    { key: /motivation|procr/i, tags:["activation","cardio","mini_action"] },
    { key: /confiance|estime/i, tags:["mental","posture","affirmation"] },
    { key: /travail/i,          tags:["focus","pause","respiration"] }
  ];

  function inferTagsFromDomain(domainName){
    const d = String(domainName || "");
    for (const m of DOMAIN_TAG_MAP){
      try{
        if (m.key.test(d)) return m.tags.slice();
      }catch{}
    }
    // fallback broad
    return ["respiration","calme","mental"];
  }

  // ====== Catalogue state ======
  let catalog = [];              // full list (normalized)
  let filters = {
    query: "",
    tag: "all"
  };
  let ctx = {
    hasResult: false,
    topDomain: null,
    topScore: null,
    band: "good",
    inferredTags: ["respiration","calme"]
  };

  // ====== Current selected exercise ======
  let current = null;

  // ====== Timer state ======
  let timer = {
    total: 0,
    left: 0,
    running: false,
    interval: null,
    lastTick: 0
  };

  // ====== TTS state ======
  let tts = {
    speaking: false,
    voice: null
  };

  // ====== Load JSON catalogue ======
  async function loadCatalog(){
    // Expected JSON shape:
    // { "version": 1, "exercices": [ {id,title,desc,category,tags,duration_s,level,media:{type:"video|gif|image", src, poster}, steps:[...], ttsText, sourceUrl } ] }
    try{
      const res = await fetch(EX_JSON_URL, { cache: "no-store" });
      if (!res.ok) throw new Error("http");
      const json = await res.json();
      const list = Array.isArray(json?.exercices) ? json.exercices : [];
      return normalizeCatalog(list);
    }catch(e){
      // fallback minimal demo
      return normalizeCatalog([
        {
          id: "breath_4_6",
          title: "Respiration 4–6 (apaisement)",
          desc: "Inspire 4 secondes, expire 6 secondes. Simple et efficace.",
          category: "respiration",
          tags: ["respiration","calme","stress"],
          duration_s: 60,
          level: "easy",
          media: { type:"video", src:"media/breath_46.mp4", poster:"media/breath_46.jpg" },
          steps: [
            "Assieds-toi, épaules basses.",
            "Inspire 4 secondes par le nez.",
            "Expire 6 secondes (doucement, plus long).",
            "Répète jusqu’à la fin du timer."
          ],
          ttsText: "Respiration quatre six. Inspire quatre secondes, expire six secondes. Épaules basses. Continue jusqu’à la fin.",
          sourceUrl: ""
        },
        {
          id: "neck_release",
          title: "Relâchement nuque & épaules",
          desc: "Micro-mobilité pour enlever de la tension en 1 à 2 minutes.",
          category: "mobilite",
          tags: ["mobilité","relâchement","douleur"],
          duration_s: 90,
          level: "easy",
          media: { type:"gif", src:"media/neck_release.gif" },
          steps: [
            "Monte les épaules vers les oreilles (2 sec), relâche.",
            "Tourne la tête lentement gauche/droite.",
            "Incline l’oreille vers l’épaule (sans forcer)."
          ],
          ttsText: "Relâchement nuque et épaules. Monte les épaules, relâche. Tourne la tête lentement. Incline doucement, sans douleur.",
          sourceUrl: ""
        },
        {
          id: "yoga_child_pose",
          title: "Yoga doux — posture de l’enfant",
          desc: "Posture calmante (dos, respiration).",
          category: "yoga",
          tags: ["yoga_doux","sommeil","calme"],
          duration_s: 120,
          level: "easy",
          media: { type:"image", src:"media/child_pose.jpg" },
          steps: [
            "À genoux, fesses vers les talons.",
            "Buste en avant, bras devant ou le long du corps.",
            "Respire lentement, relâche la mâchoire."
          ],
          ttsText: "Posture de l’enfant. Fesses vers les talons. Buste en avant. Respire lentement et relâche.",
          sourceUrl: ""
        },
        {
          id: "cardio_20_20",
          title: "Cardio micro — 20/20 (activation)",
          desc: "20 secondes actives, 20 secondes repos, répéter 3 fois.",
          category: "cardio",
          tags: ["cardio","activation","motivation"],
          duration_s: 180,
          level: "moderate",
          media: { type:"video", src:"media/cardio_2020.mp4", poster:"media/cardio_2020.jpg" },
          steps: [
            "Choisis : montées de genoux OU jumping jacks.",
            "20 sec effort, 20 sec repos.",
            "Répète 3 fois. Hydrate-toi."
          ],
          ttsText: "Cardio micro vingt vingt. Choisis montées de genoux ou jumping jacks. Vingt secondes effort, vingt secondes repos. Trois tours.",
          sourceUrl: ""
        }
      ]);
    }
  }

  function normalizeCatalog(list){
    const out = [];
    (list || []).forEach((x) => {
      if (!x || !x.id) return;
      const item = {
        id: String(x.id),
        title: String(x.title || "Exercice"),
        desc: String(x.desc || ""),
        category: String(x.category || "autre"),
        tags: Array.isArray(x.tags) ? x.tags.map(t => String(t).trim()).filter(Boolean) : [],
        duration_s: Number(x.duration_s || x.duration || 60),
        level: String(x.level || "easy"),
        domainHints: Array.isArray(x.domainHints) ? x.domainHints.map(s => String(s)) : [],
        media: (x.media && typeof x.media === "object") ? {
          type: String(x.media.type || ""),
          src: String(x.media.src || ""),
          poster: String(x.media.poster || "")
        } : null,
        steps: Array.isArray(x.steps) ? x.steps.map(s => String(s)) : [],
        ttsText: String(x.ttsText || ""),
        sourceUrl: String(x.sourceUrl || x.source || "")
      };
      if (!isFinite(item.duration_s) || item.duration_s <= 0) item.duration_s = 60;
      out.push(item);
    });
    return out;
  }

  // ====== Read result + compute ctx ======
  function computeCtx(){
    const data = getJson(PRO_RESULT_KEY);
    if (!data || !data.scores){
      ctx = {
        hasResult: false,
        topDomain: null,
        topScore: null,
        band: "good",
        inferredTags: ["respiration","calme","mental"]
      };
      return ctx;
    }

    const tops = topDomains(data.scores || {}, 1);
    const first = tops[0] || [null, 0];
    const domain = first[0];
    const score = Number(first[1] || 0);
    const band = scoreBand(score);
    const inferred = inferTagsFromDomain(domain);

    ctx = {
      hasResult: true,
      topDomain: domain,
      topScore: score,
      band,
      inferredTags: inferred
    };
    return ctx;
  }

  function renderCtxUI(){
    // Badge band
    if (elBadge){
      elBadge.classList.remove("good","warn","alert");
      elBadge.classList.add(ctx.band);
    }
    if (elBadgeText){
      elBadgeText.textContent =
        ctx.band === "alert" ? "Urgence douce" :
        ctx.band === "warn" ? "Stabilité" :
        "Consolidation";
    }

    // KPIs
    if (!ctx.hasResult){
      kpiTopDomain.textContent = "—";
      kpiTopDomainSub.textContent = "Pas de résultat";
      kpiTopScore.textContent = "—";
      kpiTopScoreSub.textContent = "—";
      return;
    }
    kpiTopDomain.textContent = String(ctx.topDomain || "—");
    kpiTopDomainSub.textContent = `Tags : ${ctx.inferredTags.join(", ")}`;
    kpiTopScore.textContent = String(Math.round(ctx.topScore || 0));
    kpiTopScoreSub.textContent = severityLabel(ctx.topScore || 0);
  }

  // ====== Filters ======
  const TAGS_PRESET = [
    { id:"all", label:"Tout" },
    { id:"reco", label:"Recommandés" },
    { id:"respiration", label:"Respiration" },
    { id:"ancrage", label:"Ancrage" },
    { id:"calme", label:"Calme" },
    { id:"mental", label:"Mental" },
    { id:"écriture", label:"Écriture" },
    { id:"yoga_doux", label:"Yoga doux" },
    { id:"yoga", label:"Yoga" },
    { id:"mobilité", label:"Mobilité" },
    { id:"cardio", label:"Cardio" },
    { id:"activation", label:"Activation" },
    { id:"sommeil", label:"Sommeil" },
    { id:"stress", label:"Stress" }
  ];

  function mountFilters(){
    if (!filterRow) return;
    filterRow.innerHTML = TAGS_PRESET.map(t => {
      const on = (filters.tag === t.id);
      return `<button class="ex-pill ${on ? "is-on":""}" data-tag="${escapeHTML(t.id)}" type="button">${escapeHTML(t.label)}</button>`;
    }).join("");

    Array.from(filterRow.querySelectorAll(".ex-pill")).forEach(btn => {
      btn.addEventListener("click", () => {
        const tag = btn.getAttribute("data-tag") || "all";
        filters.tag = tag;
        setJson(EX_PREFS_KEY, { ...getJson(EX_PREFS_KEY), tag });
        mountFilters();
        renderLists();
      });
    });
  }

  function loadPrefs(){
    const prefs = getJson(EX_PREFS_KEY) || {};
    if (prefs.query && typeof prefs.query === "string") filters.query = prefs.query;
    if (prefs.tag && typeof prefs.tag === "string") filters.tag = prefs.tag;
    if (searchEl) searchEl.value = filters.query || "";
  }

  // ====== Done history ======
  function getDoneMap(){
    const m = getJson(EX_DONE_KEY);
    return (m && typeof m === "object") ? m : {};
  }
  function getHistory(){
    const h = getJson(EX_HISTORY_KEY);
    return Array.isArray(h) ? h : [];
  }

  function countDone(){
    const m = getDoneMap();
    return Object.keys(m).length;
  }

  function markDone(ex, duration_s){
    if (!ex || !ex.id) return;

    const done = getDoneMap();
    const prev = done[ex.id] || null;

    done[ex.id] = {
      at: nowIso(),
      count: prev ? (Number(prev.count || 0) + 1) : 1
    };
    setJson(EX_DONE_KEY, done);

    const hist = getHistory();
    hist.unshift({
      id: ex.id,
      at: nowIso(),
      duration_s: Number(duration_s || ex.duration_s || 0),
      tags: ex.tags || [],
      domain: ctx.topDomain || null
    });
    setJson(EX_HISTORY_KEY, hist.slice(0, 100));

    // activity
    try{
      pushActivity("exercices", {
        label: `Exercice terminé ✅ — ${ex.title}`,
        topScore: ctx.topScore ?? null,
        id: ex.id
      });
    }catch{}
  }

  // ====== Recommendations ======
  function scoreExercise(ex){
    // Higher is better
    let s = 0;

    // match inferred tags
    const tags = new Set((ex.tags || []).map(t => String(t).toLowerCase()));
    ctx.inferredTags.forEach(t => { if (tags.has(String(t).toLowerCase())) s += 6; });

    // band alignment (alert -> prefer calm/respiration/yoga_doux, avoid heavy cardio)
    const band = ctx.band;
    if (band === "alert"){
      if (tags.has("respiration") || tags.has("calme") || tags.has("yoga_doux") || tags.has("ancrage")) s += 6;
      if (tags.has("cardio")) s -= 6;
      if (String(ex.level).toLowerCase().includes("hard")) s -= 4;
    } else if (band === "warn"){
      if (tags.has("mobilité") || tags.has("respiration") || tags.has("mental")) s += 3;
      if (tags.has("cardio") && String(ex.level).toLowerCase().includes("easy")) s += 2;
    } else {
      if (tags.has("activation") || tags.has("cardio") || tags.has("focus")) s += 2;
    }

    // avoid repeating the same done too often
    const done = getDoneMap();
    const d = done[ex.id];
    if (d && d.count) s -= Math.min(6, Number(d.count) * 1.2);

    // duration preference (alert -> short)
    const dur = Number(ex.duration_s || 60);
    if (band === "alert"){
      if (dur <= 90) s += 3;
      if (dur > 240) s -= 3;
    } else if (band === "warn"){
      if (dur <= 180) s += 2;
      if (dur > 360) s -= 2;
    } else {
      if (dur <= 300) s += 1;
    }

    // tiny randomness
    s += Math.random() * 0.6;

    return s;
  }

  function computeRecommendations(){
    if (!catalog.length) return [];
    const scored = catalog.map(ex => ({ ex, score: scoreExercise(ex) }));
    scored.sort((a,b) => b.score - a.score);
    return scored.slice(0, 6).map(x => x.ex);
  }

  // ====== Filtering ======
  function matchesFilters(ex, isRecoList){
    const q = String(filters.query || "").trim().toLowerCase();
    const tag = String(filters.tag || "all");

    if (tag === "reco" && !isRecoList) return false; // only show in reco if filter is reco

    if (q){
      const hay = [
        ex.title, ex.desc, ex.category,
        (ex.tags || []).join(" "),
        (ex.steps || []).join(" ")
      ].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }

    if (tag && tag !== "all" && tag !== "reco"){
      const tags = (ex.tags || []).map(t => String(t).toLowerCase());
      if (!tags.includes(tag.toLowerCase())) return false;
    }

    return true;
  }

  // ====== Card rendering ======
  function bandClassForCard(ex){
    // use ctx.band but also allow exercise tags to tint
    const tags = (ex.tags || []).map(t => String(t).toLowerCase());
    if (tags.includes("respiration") || tags.includes("calme") || tags.includes("yoga_doux")) return "good";
    if (tags.includes("cardio") || tags.includes("activation")) return "warn";
    return ctx.band || "good";
  }

  function fmtDuration(sec){
    const s = Math.max(0, Number(sec || 0));
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    if (m <= 0) return `${r}s`;
    if (r === 0) return `${m} min`;
    return `${m}m ${r}s`;
  }

  function renderMediaThumb(ex){
    const m = ex.media;
    if (!m || !m.src) {
      return `<div class="ex-media"><div class="ex-empty" style="height:100%; display:flex; align-items:center; justify-content:center;">Aperçu</div></div>`;
    }

    const type = String(m.type || "").toLowerCase();
    if (type === "video" || m.src.toLowerCase().endsWith(".mp4") || m.src.toLowerCase().endsWith(".webm")){
      return `
        <div class="ex-media">
          <video muted playsinline preload="metadata" poster="${escapeHTML(m.poster || "")}">
            <source src="${escapeHTML(m.src)}" />
          </video>
          <div class="ex-playHint"><i></i> Preview</div>
        </div>
      `;
    }

    // gif/image
    return `
      <div class="ex-media">
        <img loading="lazy" src="${escapeHTML(m.src)}" alt="${escapeHTML(ex.title)}" />
        <div class="ex-playHint"><i></i> Preview</div>
      </div>
    `;
  }

  function renderCard(ex){
    const tint = bandClassForCard(ex);
    const tags = (ex.tags || []).slice(0, 2);
    const dur = fmtDuration(ex.duration_s);
    const cat = ex.category || "module";

    return `
      <article class="ex-item" data-id="${escapeHTML(ex.id)}" tabindex="0" role="button" aria-label="Ouvrir ${escapeHTML(ex.title)}">
        ${renderMediaThumb(ex)}
        <div class="ex-body">
          <div class="ex-topLine">
            <h4 class="ex-name">${escapeHTML(ex.title)}</h4>
            <div class="ex-miniMeta">
              <span class="ex-tag ${tint}"><strong>${escapeHTML(dur)}</strong></span>
              <span class="ex-tag">${escapeHTML(cat)}</span>
            </div>
          </div>

          <p class="ex-desc">${escapeHTML(ex.desc || "—")}</p>

          <div class="ex-footer">
            <div class="left">
              <span class="ex-dot"></span>
              <span>${escapeHTML((tags.length ? tags.join(" • ") : "sans tag"))}</span>
            </div>
            <div class="left">
              <span>${isDone(ex.id) ? "✅ déjà fait" : "▶ ouvrir"}</span>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  function isDone(id){
    const done = getDoneMap();
    return !!done[String(id)];
  }

  function wireCardClicks(container){
    if (!container) return;
    Array.from(container.querySelectorAll(".ex-item")).forEach(card => {
      const id = card.getAttribute("data-id");
      const open = () => {
        const ex = catalog.find(x => x.id === id);
        if (ex) openExercise(ex);
      };

      card.addEventListener("click", open);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " "){
          e.preventDefault();
          open();
        }
      });

      // small auto preview on hover (desktop only)
      const vid = card.querySelector("video");
      if (vid){
        card.addEventListener("mouseenter", () => { try{ vid.currentTime = 0; vid.play().catch(()=>{}); }catch{} });
        card.addEventListener("mouseleave", () => { try{ vid.pause(); }catch{} });
        card.addEventListener("touchstart", () => { try{ vid.pause(); }catch{} }, { passive:true });
      }
    });
  }

  // ====== Render lists ======
  let recommendations = [];

  function renderLists(){
    // reco list
    const recoFiltered = recommendations.filter(ex => matchesFilters(ex, true));
    if (recoGrid){
      recoGrid.innerHTML = recoFiltered.map(renderCard).join("");
      wireCardClicks(recoGrid);
    }
    if (recoEmpty) recoEmpty.style.display = (recoFiltered.length ? "none" : "block");
    if (kpiRecoCount) kpiRecoCount.textContent = String(recoFiltered.length);

    // all list
    const allFiltered = catalog.filter(ex => matchesFilters(ex, false));
    if (allGrid){
      allGrid.innerHTML = allFiltered.map(renderCard).join("");
      wireCardClicks(allGrid);
    }
    if (allEmpty) allEmpty.style.display = (catalog.length ? (allFiltered.length ? "none" : "block") : "block");

    // done KPI
    if (kpiDoneCount) kpiDoneCount.textContent = String(countDone());
  }

  // ====== Panel: open exercise ======
  function renderPanelMedia(ex){
    const m = ex.media;
    if (!m || !m.src){
      panelMedia.innerHTML = `<div class="ex-empty">Aucun média pour cet exercice.</div>`;
      return;
    }
    const type = String(m.type || "").toLowerCase();
    if (type === "video" || m.src.toLowerCase().endsWith(".mp4") || m.src.toLowerCase().endsWith(".webm")){
      panelMedia.innerHTML = `
        <video controls playsinline preload="metadata" poster="${escapeHTML(m.poster || "")}">
          <source src="${escapeHTML(m.src)}" />
        </video>
      `;
      return;
    }
    panelMedia.innerHTML = `<img loading="lazy" src="${escapeHTML(m.src)}" alt="${escapeHTML(ex.title)}" />`;
  }

  function renderPanelSteps(ex){
    const steps = Array.isArray(ex.steps) ? ex.steps : [];
    const html = steps.length
      ? `<h4>Étapes</h4><ol>${steps.map(s => `<li>${escapeHTML(s)}</li>`).join("")}</ol>`
      : `<h4>Étapes</h4><div class="ex-empty">Aucune étape définie (ajoute "steps" dans le JSON).</div>`;
    panelSteps.innerHTML = html;
  }

  function enableControls(on){
    [btnSpeak, btnStopSpeak, btnStart, btnPause, btnReset, btnDone, btnOpenSource].forEach(b => {
      if (!b) return;
      b.disabled = !on;
    });
  }

  function openExercise(ex){
    current = ex;
    setJson(EX_LAST_KEY, { id: ex.id, at: nowIso() });

    stopTimer(true);
    stopSpeak(true);

    doneToast?.classList.remove("is-on");

    panelTitle.textContent = ex.title || "Exercice";
    panelSub.textContent = `${ex.category || "module"} • ${fmtDuration(ex.duration_s)} • ${isDone(ex.id) ? "déjà fait ✅" : "non fait"}`;
    renderPanelMedia(ex);
    renderPanelSteps(ex);

    // timer setup
    timer.total = Math.max(1, Number(ex.duration_s || 60));
    timer.left = timer.total;
    timer.running = false;
    timerLabel.textContent = `Timer — ${fmtDuration(timer.total)}`;
    timerHint.textContent = `Restant : ${fmtDuration(timer.left)} • Clique ▶ pour démarrer`;
    timerFill.style.width = "0%";

    // source
    btnOpenSource.disabled = !(ex.sourceUrl && String(ex.sourceUrl).trim().length);

    enableControls(true);
    btnPause.disabled = true;

    // precompute next suggestion
    renderNextSuggestion(ex);

    // activity
    try{
      pushActivity("exercices", {
        label: `Ouverture exercice — ${ex.title}`,
        topScore: ctx.topScore ?? null,
        id: ex.id
      });
    }catch{}
  }

  // ====== Next suggestion ======
  function renderNextSuggestion(afterEx){
    const pick = pickNext(afterEx);
    if (!pick){
      nextBox.innerHTML = `<div class="ex-empty">Aucune proposition. (Ajoute plus d’exercices dans le JSON)</div>`;
      return;
    }

    nextHint.textContent = `Proposé selon ton profil (${ctx.band}) et ce que tu viens de faire.`;
    nextBox.innerHTML = `
      <div style="display:flex; gap:10px; align-items:flex-start; flex-wrap:wrap;">
        <div style="flex:1 1 220px;">
          <div style="font-weight:950; color: rgba(234,240,255,.96);">${escapeHTML(pick.title)}</div>
          <div style="margin-top:4px; color: rgba(234,240,255,.74); font-size:12.5px; line-height:1.35;">
            ${escapeHTML(pick.desc || "")}
          </div>
          <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
            <span class="ex-tag ${scoreBand(ctx.topScore || 0)}"><strong>${escapeHTML(fmtDuration(pick.duration_s))}</strong></span>
            <span class="ex-tag">${escapeHTML(pick.category || "module")}</span>
            ${(pick.tags || []).slice(0,2).map(t => `<span class="ex-tag">${escapeHTML(t)}</span>`).join("")}
          </div>
        </div>
        <div style="flex:0 0 auto;">
          <button class="ex-miniBtn primary" type="button" id="btnOpenNext">▶ Ouvrir</button>
        </div>
      </div>
    `;

    const b = document.getElementById("btnOpenNext");
    b?.addEventListener("click", () => openExercise(pick));
  }

  function pickNext(afterEx){
    if (!catalog.length) return null;

    // rule: avoid same id, prefer complementary categories
    const afterTags = new Set((afterEx?.tags || []).map(t => String(t).toLowerCase()));
    const done = getDoneMap();

    const candidates = catalog
      .filter(ex => ex.id !== afterEx.id)
      .filter(ex => !done[ex.id] || Number(done[ex.id]?.count || 0) < 3) // not too repeated
      .map(ex => {
        let sc = scoreExercise(ex);

        // complement: if after was cardio => suggest respiration/calm; if after was respiration => suggest mobility/mental
        const t = (ex.tags || []).map(x => String(x).toLowerCase());
        if (afterTags.has("cardio") || afterTags.has("activation")){
          if (t.includes("respiration") || t.includes("calme") || t.includes("yoga_doux")) sc += 3;
        }
        if (afterTags.has("respiration") || afterTags.has("calme")){
          if (t.includes("mobilité") || t.includes("mental") || t.includes("écriture")) sc += 2;
        }
        return { ex, sc };
      });

    candidates.sort((a,b) => b.sc - a.sc);
    return candidates[0]?.ex || null;
  }

  // ====== Timer logic ======
  function updateTimerUI(){
    if (!current) return;
    const pct = timer.total > 0 ? (1 - (timer.left / timer.total)) * 100 : 0;
    timerFill.style.width = clamp(pct, 0, 100).toFixed(0) + "%";
    timerHint.textContent = `Restant : ${fmtDuration(timer.left)} ${timer.running ? "• en cours" : "• pause"}`;
  }

  function tick(){
    const now = Date.now();
    const dt = (now - timer.lastTick) / 1000;
    timer.lastTick = now;

    timer.left = Math.max(0, timer.left - dt);
    updateTimerUI();

    if (timer.left <= 0){
      stopTimer(false);
      timerHint.textContent = `Terminé 🎉 • Clique "✅ Terminé" pour enregistrer`;
      try{
        // tiny sound using speech if available (soft)
        if ("speechSynthesis" in window){
          // no auto speak (safe), just UI.
        }
      }catch{}
    }
  }

  function startTimer(){
    if (!current) return;
    if (timer.running) return;

    timer.running = true;
    timer.lastTick = Date.now();
    btnStart.disabled = true;
    btnPause.disabled = false;
    btnReset.disabled = false;

    timer.interval = setInterval(tick, 250);
    updateTimerUI();
  }

  function pauseTimer(){
    if (!timer.running) return;
    timer.running = false;
    if (timer.interval) clearInterval(timer.interval);
    timer.interval = null;

    btnStart.disabled = false;
    btnPause.disabled = true;
    btnReset.disabled = false;
    updateTimerUI();
  }

  function stopTimer(resetToFull){
    timer.running = false;
    if (timer.interval) clearInterval(timer.interval);
    timer.interval = null;

    if (resetToFull){
      timer.left = timer.total || 0;
      timerFill.style.width = "0%";
      if (timerHint) timerHint.textContent = `Restant : ${fmtDuration(timer.left)} • prêt`;
    }

    if (btnStart) btnStart.disabled = !current;
    if (btnPause) btnPause.disabled = true;
    if (btnReset) btnReset.disabled = !current;
  }

  function resetTimer(){
    if (!current) return;
    stopTimer(true);
  }

  // ====== TTS logic ======
  function chooseVoice(){
    try{
      const voices = speechSynthesis.getVoices() || [];
      // prefer French voice
      const fr = voices.filter(v => (v.lang || "").toLowerCase().startsWith("fr"));
      return fr[0] || voices[0] || null;
    }catch{
      return null;
    }
  }

  function buildTtsText(ex){
    const parts = [];
    parts.push(ex.title || "Exercice");
    if (ex.ttsText && ex.ttsText.trim().length) parts.push(ex.ttsText.trim());
    else{
      // fallback: read steps
      const steps = Array.isArray(ex.steps) ? ex.steps : [];
      if (steps.length){
        parts.push("Étapes.");
        steps.forEach((s, i) => parts.push(`Étape ${i+1}. ${s}`));
      } else {
        parts.push(ex.desc || "");
      }
    }
    return parts.filter(Boolean).join(". ");
  }

  function speakCurrent(){
    if (!current) return;
    if (!("speechSynthesis" in window)) return;

    stopSpeak(true);

    const text = buildTtsText(current);
    if (!text.trim()) return;

    const u = new SpeechSynthesisUtterance(text);
    u.lang = "fr-FR";
    u.rate = 1.0;
    u.pitch = 1.0;
    u.volume = 1.0;

    // voice
    tts.voice = chooseVoice();
    if (tts.voice) u.voice = tts.voice;

    tts.speaking = true;
    btnSpeak.disabled = true;
    btnStopSpeak.disabled = false;

    u.onend = () => {
      tts.speaking = false;
      btnSpeak.disabled = false;
      btnStopSpeak.disabled = true;
    };
    u.onerror = () => {
      tts.speaking = false;
      btnSpeak.disabled = false;
      btnStopSpeak.disabled = true;
    };

    try{ speechSynthesis.speak(u); }catch{
      tts.speaking = false;
      btnSpeak.disabled = false;
      btnStopSpeak.disabled = true;
    }
  }

  function stopSpeak(silent){
    try{
      if (!("speechSynthesis" in window)) return;
      speechSynthesis.cancel();
    }catch{}
    tts.speaking = false;
    if (btnSpeak) btnSpeak.disabled = !current;
    if (btnStopSpeak) btnStopSpeak.disabled = true;
    if (!silent){
      // nothing
    }
  }

  // ====== Events ======
  function wireEvents(){
    // search
    searchEl?.addEventListener("input", () => {
      filters.query = String(searchEl.value || "");
      setJson(EX_PREFS_KEY, { ...getJson(EX_PREFS_KEY), query: filters.query });
      renderLists();
    });

    btnClearFilters?.addEventListener("click", () => {
      filters.query = "";
      filters.tag = "all";
      if (searchEl) searchEl.value = "";
      setJson(EX_PREFS_KEY, { query:"", tag:"all" });
      mountFilters();
      renderLists();
    });

    btnRefresh?.addEventListener("click", async () => {
      await bootstrap(true);
    });

    btnSpeak?.addEventListener("click", () => speakCurrent());
    btnStopSpeak?.addEventListener("click", () => stopSpeak(false));

    btnStart?.addEventListener("click", () => startTimer());
    btnPause?.addEventListener("click", () => pauseTimer());
    btnReset?.addEventListener("click", () => resetTimer());

    btnDone?.addEventListener("click", () => {
      if (!current) return;
      const durUsed = Math.round((timer.total || 0) - (timer.left || 0));
      markDone(current, durUsed);

      doneToast?.classList.add("is-on");
      setTimeout(() => doneToast?.classList.remove("is-on"), 2400);

      // propose next + refresh cards
      renderNextSuggestion(current);
      renderLists();

      // tiny reset timer for re-run
      stopTimer(true);
    });

    btnOpenSource?.addEventListener("click", () => {
      if (!current) return;
      const url = String(current.sourceUrl || "").trim();
      if (!url) return;
      try{ window.open(url, "_blank", "noopener"); }catch{}
    });

    // stop TTS when leaving
    window.addEventListener("beforeunload", () => { try{ stopSpeak(true); }catch{} });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden){
        try{ stopSpeak(true); }catch{}
        try{ pauseTimer(); }catch{}
      }
    });
  }

  // ====== Bootstrap ======
  async function bootstrap(forceReload){
    // ctx
    computeCtx();
    renderCtxUI();

    // load catalog
    if (forceReload || !catalog.length){
      catalog = await loadCatalog();
    }

    // recommendations
    recommendations = computeRecommendations();

    // filters + prefs
    loadPrefs();
    mountFilters();

    // render
    renderLists();

    // restore last exercise (optional)
    const last = getJson(EX_LAST_KEY);
    if (last?.id){
      const ex = catalog.find(x => x.id === String(last.id));
      if (ex) openExercise(ex);
    }

    // KPI done count
    if (kpiDoneCount) kpiDoneCount.textContent = String(countDone());

    // enable speech buttons only if available
    const ttsOK = ("speechSynthesis" in window);
    if (!ttsOK){
      btnSpeak.textContent = "🔇 Voix indispo";
      btnSpeak.disabled = true;
      btnStopSpeak.disabled = true;
    }

    // show a sensible default selected (first reco)
    if (!current && recommendations.length){
      openExercise(recommendations[0]);
    } else if (!current && catalog.length){
      openExercise(catalog[0]);
    } else {
      enableControls(!!current);
    }
  }

  // ====== Reveal animation ======
  function revealSafe(){
    const els = Array.from(document.querySelectorAll(".ex-reveal"));
    if (!els.length) return;
    if (!("IntersectionObserver" in window)){
      els.forEach((el,i) => setTimeout(() => el.classList.add("is-in"), 40*i));
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
    els.forEach((el,i) => {
      el.style.transitionDelay = (i * 50) + "ms";
      io.observe(el);
    });
  }

  // ====== Init ======
  function init(){
    revealSafe();
    wireEvents();

    // speech voices sometimes load async
    if ("speechSynthesis" in window){
      try{
        speechSynthesis.onvoiceschanged = () => { try{ tts.voice = chooseVoice(); }catch{} };
      }catch{}
    }

    bootstrap(false);
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();