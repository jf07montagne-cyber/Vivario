/* =========================================================
   Vivario PRO — exercices_pro.js (B2)
   UI "carte vidéo" + lecture JSON + TTS + timer + Terminé ✅
   + reco auto selon résultat (vivario_pro_result_v1.scores si dispo)
   + variante "libre" (duration_sec = null) OK
   ========================================================= */

(function(){
  "use strict";

  // ---------- CONFIG ----------
  const CATALOG_URL = "exercices_pro.json?v=1";
  const PRO_RESULT_KEY = "vivario_pro_result_v1";                // diagnostic local (si existe)
  const DONE_KEY = "vivario_pro_exercises_done_v1";              // état terminé (par jour)
  const PREFS_KEY = "vivario_pro_exercises_prefs_v1";            // prefs UI (filtres)

  const DEFAULT_VARIANT = "micro"; // micro/court/moyen/long/ultra/libre
  const VARIANTS_ORDER = ["micro","court","moyen","long","ultra","libre"];

  const FALLBACK_RECO_TAGS = ["urgence_douce","calme","present","douceur","mobilite","respiration","ancrage"];

  // ---------- DOM ----------
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  const elStatus = $("#exStatus");
  const elCount = $("#exCount");
  const elRecoTitle = $("#exRecoTitle");
  const elRecoChips = $("#exRecoChips");
  const elGrid = $("#exGrid");
  const elEmpty = $("#exEmpty");

  const elFilterDomain = $("#filterDomain");
  const elFilterModality = $("#filterModality");
  const elFilterLevel = $("#filterLevel");
  const elFilterVariant = $("#filterVariant");
  const elFilterSearch = $("#filterSearch");
  const elFilterOnlyReco = $("#filterOnlyReco");
  const elBtnResetFilters = $("#btnResetFilters");

  // Drawer / modal
  const elDrawer = $("#exDrawer");
  const elDrawerClose = $("#drawerClose");
  const elDrawerTitle = $("#drawerTitle");
  const elDrawerMeta = $("#drawerMeta");
  const elDrawerMedia = $("#drawerMedia");
  const elDrawerTags = $("#drawerTags");
  const elDrawerSteps = $("#drawerSteps");

  const elVariantSeg = $("#variantSeg");
  const elBtnStart = $("#btnStart");
  const elBtnDone = $("#btnDone");
  const elTimer = $("#timer");
  const elTimerBar = $("#timerBar");
  const elTtsBtn = $("#ttsBtn");
  const elTtsStop = $("#ttsStop");
  const elTtsRate = $("#ttsRate");

  // ---------- STATE ----------
  let catalog = null;
  let allExercises = [];
  let filtered = [];
  let recommendedIds = new Set();

  let activeExercise = null;
  let activeVariant = DEFAULT_VARIANT;

  // timer
  let timerTotal = null; // seconds OR null for libre
  let timerLeft = null;
  let timerTick = null;

  // TTS
  let ttsUtter = null;
  let ttsSpeaking = false;

  // done map for today
  let doneState = loadDoneState();

  // ---------- STORAGE HELPERS ----------
  function getJson(key){
    try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
  }
  function setJson(key, val){
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }

  function todayKey(){
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const day = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  }

  function loadDoneState(){
    const data = getJson(DONE_KEY);
    const tk = todayKey();
    if (!data || typeof data !== "object" || data.day !== tk){
      const fresh = { day: tk, done: {} };
      setJson(DONE_KEY, fresh);
      return fresh;
    }
    if (!data.done || typeof data.done !== "object") data.done = {};
    return data;
  }

  function markDone(exId){
    doneState.done[exId] = { at: new Date().toISOString(), variant: activeVariant || null };
    setJson(DONE_KEY, doneState);
  }

  function isDone(exId){
    return !!doneState.done[exId];
  }

  // ---------- FORMAT ----------
  function esc(s){
    return String(s||"").replace(/[&<>"']/g, m => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[m]));
  }

  function formatDuration(sec){
    // PATCH "libre"
    if (sec == null) return "libre";
    const s = Number(sec || 0);
    const m = Math.floor(s/60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2,"0")}`;
  }

  function prettyModality(m){
    const map = {
      respiration:"Respiration",
      ancrage:"Ancrage",
      mental:"Mental",
      yoga:"Yoga",
      mobilite:"Mobilité",
      cardio:"Cardio",
      relaxation:"Relaxation",
      ecriture:"Écriture",
      posture:"Posture"
    };
    return map[m] || m || "—";
  }

  function prettyLevel(l){
    const map = { debutant:"Débutant", intermediaire:"Intermédiaire", avance:"Avancé" };
    return map[l] || l || "—";
  }

  function domainsLabel(domains){
    if (!Array.isArray(domains) || !domains.length) return "général";
    return domains.slice(0,3).join(", ").replace(/_/g," ");
  }

  // ---------- RECO ----------
  function getUserScores(){
    const data = getJson(PRO_RESULT_KEY);
    // On accepte plusieurs formes: {scores:{...}} ou {result:{scores:{...}}}
    const scores = data?.scores || data?.result?.scores || null;
    if (!scores || typeof scores !== "object") return null;
    return scores;
  }

  function topScoreDomains(scores, n=3){
    const arr = Object.entries(scores || {})
      .map(([k,v]) => [String(k), Number(v||0)])
      .filter(([,v]) => isFinite(v) && v > 0);
    arr.sort((a,b) => b[1]-a[1]);
    return arr.slice(0,n);
  }

  function buildRecoFromScores(){
    // Reco = tags issus des domaines + fallback si rien
    const scores = getUserScores();
    if (!scores){
      return { reason: "Aucun diagnostic local détecté", domains: [], tags: FALLBACK_RECO_TAGS.slice(0) };
    }

    const top = topScoreDomains(scores, 4);
    const domains = top.map(([k]) => k);
    const tags = [];

    // mapping simple par mots-clés (vu qu'on ne connaît pas tes noms exacts)
    domains.forEach(d => {
      const low = d.toLowerCase();
      if (low.includes("stress")) tags.push("stress","calme","respiration");
      if (low.includes("anx") || low.includes("ango")) tags.push("anxiete","urgence_douce","ancrage","respiration");
      if (low.includes("panic") || low.includes("pan")) tags.push("panique","urgence_douce","ancrage");
      if (low.includes("sommeil")) tags.push("sommeil","soiree","relaxation","respiration");
      if (low.includes("rumin")) tags.push("anti-rumination","mental","ecriture");
      if (low.includes("fatig")) tags.push("reprise","douceur","mobilite");
      if (low.includes("douleur") || low.includes("dos") || low.includes("nuque")) tags.push("douceur","mobilite","posture");
      if (low.includes("coler")) tags.push("decharge","respiration","mouvement");
      if (low.includes("concen") || low.includes("focus")) tags.push("focus","respiration","mental");
      if (low.includes("addict") || low.includes("compuls")) tags.push("craving","pause","present");
      if (low.includes("ecran")) tags.push("pause","limites","mobilite");
      if (low.includes("motiva")) tags.push("boost","cardio","routine");
    });

    const finalTags = Array.from(new Set([...tags, ...FALLBACK_RECO_TAGS]));
    return { reason: "Basé sur ton dernier diagnostic local", domains, tags: finalTags };
  }

  function computeRecommendedIds(){
    const reco = buildRecoFromScores();
    const tags = new Set(reco.tags || []);
    const out = [];

    for (const ex of allExercises){
      const exTags = Array.isArray(ex.tags) ? ex.tags : [];
      const hit = exTags.some(t => tags.has(t));
      if (hit) out.push(ex.id);
    }

    // fallback si trop peu
    if (out.length < 20){
      for (const ex of allExercises){
        if (["respiration","ancrage","mobilite","relaxation","yoga"].includes(ex.modality)) out.push(ex.id);
      }
    }

    recommendedIds = new Set(out);
    // UI
    if (elRecoTitle) elRecoTitle.textContent = reco.reason;
    if (elRecoChips){
      const chipDomains = (reco.domains || []).slice(0,4).map(d => `<span class="chip">${esc(d.replace(/_/g," "))}</span>`).join("");
      const chipTags = (reco.tags || []).slice(0,8).map(t => `<span class="chip ghost">${esc(t)}</span>`).join("");
      elRecoChips.innerHTML = chipDomains + chipTags;
    }
  }

  // ---------- FILTERS ----------
  function loadPrefs(){
    const p = getJson(PREFS_KEY);
    if (!p || typeof p !== "object") return {};
    return p;
  }
  function savePrefs(p){
    setJson(PREFS_KEY, p);
  }

  let prefs = loadPrefs();

  function applyPrefsToUI(){
    if (elFilterDomain) elFilterDomain.value = prefs.domain || "all";
    if (elFilterModality) elFilterModality.value = prefs.modality || "all";
    if (elFilterLevel) elFilterLevel.value = prefs.level || "all";
    if (elFilterVariant) elFilterVariant.value = prefs.variant || "all";
    if (elFilterSearch) elFilterSearch.value = prefs.search || "";
    if (elFilterOnlyReco) elFilterOnlyReco.checked = !!prefs.onlyReco;
  }

  function updatePrefsFromUI(){
    prefs.domain = elFilterDomain ? elFilterDomain.value : "all";
    prefs.modality = elFilterModality ? elFilterModality.value : "all";
    prefs.level = elFilterLevel ? elFilterLevel.value : "all";
    prefs.variant = elFilterVariant ? elFilterVariant.value : "all";
    prefs.search = elFilterSearch ? (elFilterSearch.value || "").trim() : "";
    prefs.onlyReco = elFilterOnlyReco ? !!elFilterOnlyReco.checked : false;
    savePrefs(prefs);
  }

  function filterExercises(){
    updatePrefsFromUI();

    const domain = prefs.domain || "all";
    const modality = prefs.modality || "all";
    const level = prefs.level || "all";
    const variant = prefs.variant || "all";
    const search = (prefs.search || "").toLowerCase();
    const onlyReco = !!prefs.onlyReco;

    filtered = allExercises.filter(ex => {
      if (onlyReco && !recommendedIds.has(ex.id)) return false;
      if (domain !== "all"){
        const doms = Array.isArray(ex.domains) ? ex.domains : [];
        if (!doms.includes(domain)) return false;
      }
      if (modality !== "all" && ex.modality !== modality) return false;
      if (level !== "all" && ex.level !== level) return false;
      if (variant !== "all"){
        const v = ex.variants?.[variant];
        if (!v) return false;
      }
      if (search){
        const blob = [
          ex.title, ex.modality, ex.level,
          ...(ex.tags||[]), ...(ex.domains||[])
        ].join(" ").toLowerCase();
        if (!blob.includes(search)) return false;
      }
      return true;
    });

    renderGrid();
  }

  // ---------- RENDER ----------
  function fillFilterOptions(){
    // domains
    const domains = (catalog?.taxonomies?.domains || []);
    const modalities = (catalog?.taxonomies?.modalities || []);
    const levels = (catalog?.taxonomies?.levels || []);

    if (elFilterDomain){
      elFilterDomain.innerHTML =
        `<option value="all">Tous domaines</option>` +
        domains.map(d => `<option value="${esc(d)}">${esc(d.replace(/_/g," "))}</option>`).join("");
    }
    if (elFilterModality){
      elFilterModality.innerHTML =
        `<option value="all">Toutes modalités</option>` +
        modalities.map(m => `<option value="${esc(m)}">${esc(prettyModality(m))}</option>`).join("");
    }
    if (elFilterLevel){
      elFilterLevel.innerHTML =
        `<option value="all">Tous niveaux</option>` +
        levels.map(l => `<option value="${esc(l)}">${esc(prettyLevel(l))}</option>`).join("");
    }
    if (elFilterVariant){
      elFilterVariant.innerHTML =
        `<option value="all">Toutes durées</option>` +
        VARIANTS_ORDER.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
    }
  }

  function renderGrid(){
    if (!elGrid) return;

    const total = filtered.length;
    if (elCount) elCount.textContent = `${total} exercice${total>1?"s":""}`;

    if (!total){
      if (elEmpty) elEmpty.style.display = "block";
      elGrid.innerHTML = "";
      return;
    }
    if (elEmpty) elEmpty.style.display = "none";

    // Tri: reco d'abord, puis non faits, puis faits
    const sorted = filtered.slice().sort((a,b) => {
      const ar = recommendedIds.has(a.id) ? 1 : 0;
      const br = recommendedIds.has(b.id) ? 1 : 0;
      if (ar !== br) return br - ar;

      const ad = isDone(a.id) ? 1 : 0;
      const bd = isDone(b.id) ? 1 : 0;
      if (ad !== bd) return ad - bd;

      return String(a.title).localeCompare(String(b.title));
    });

    elGrid.innerHTML = sorted.map(ex => cardHTML(ex)).join("");

    // wire
    $$(".ex-card", elGrid).forEach(card => {
      card.addEventListener("click", () => {
        const id = card.getAttribute("data-id");
        const ex = allExercises.find(x => x.id === id);
        if (ex) openDrawer(ex, prefs.variant !== "all" ? prefs.variant : DEFAULT_VARIANT);
      });
    });
  }

  function badgeHTML(ex){
    const tags = Array.isArray(ex.tags) ? ex.tags : [];
    const rec = recommendedIds.has(ex.id);
    const done = isDone(ex.id);

    const pills = [];
    if (rec) pills.push(`<span class="pill rec">⭐ Recommandé</span>`);
    pills.push(`<span class="pill">${esc(prettyModality(ex.modality))}</span>`);
    pills.push(`<span class="pill ghost">${esc(prettyLevel(ex.level))}</span>`);
    if (done) pills.push(`<span class="pill done">✅ Fait</span>`);
    if (tags.includes("urgence_douce")) pills.push(`<span class="pill alert">Urgence douce</span>`);
    return pills.join("");
  }

  function pickPreviewVariant(ex){
    // on affiche une durée "ex: micro" sur la carte
    const v = ex.variants?.micro || ex.variants?.court || ex.variants?.libre || null;
    if (!v) return null;
    return v.duration_sec;
  }

  function cardHTML(ex){
    const m = ex.media || {};
    const poster = m.poster ? esc(m.poster) : "";
    const mp4 = m.preview_mp4 ? esc(m.preview_mp4) : "";
    const dur = pickPreviewVariant(ex);

    return `
      <article class="ex-card" data-id="${esc(ex.id)}" role="button" tabindex="0" aria-label="${esc(ex.title)}">
        <div class="ex-media">
          <video class="ex-video" muted playsinline preload="metadata" poster="${poster}">
            <source src="${mp4}" type="video/mp4">
          </video>
          <div class="ex-overlay">
            <div class="ex-title">${esc(ex.title)}</div>
            <div class="ex-sub">${esc(domainsLabel(ex.domains))}</div>
            <div class="ex-metaRow">
              ${badgeHTML(ex)}
              <span class="dur">${esc(formatDuration(dur))}</span>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  // ---------- DRAWER ----------
  function closeDrawer(){
    if (!elDrawer) return;
    elDrawer.classList.remove("is-on");
    document.body.style.overflow = "";
    stopTimer();
    stopTTS();
    activeExercise = null;
  }

  function openDrawer(ex, variant){
    activeExercise = ex;
    activeVariant = (variant && ex.variants?.[variant]) ? variant : DEFAULT_VARIANT;

    if (elDrawerTitle) elDrawerTitle.textContent = ex.title || "Exercice";
    if (elDrawerMeta){
      const rec = recommendedIds.has(ex.id) ? "⭐ Recommandé" : "•";
      const done = isDone(ex.id) ? "✅ Fait aujourd’hui" : "•";
      elDrawerMeta.textContent = `${rec}  ${prettyModality(ex.modality)} • ${prettyLevel(ex.level)} • ${done}`;
    }

    // media
    const m = ex.media || {};
    const poster = m.poster ? esc(m.poster) : "";
    const mp4 = m.preview_mp4 ? esc(m.preview_mp4) : "";
    if (elDrawerMedia){
      elDrawerMedia.innerHTML = `
        <video class="drawer-video" controls playsinline preload="metadata" poster="${poster}">
          <source src="${mp4}" type="video/mp4">
        </video>
      `;
    }

    // tags
    if (elDrawerTags){
      const tags = (ex.tags||[]).slice(0, 14).map(t => `<span class="chip ghost">${esc(t)}</span>`).join("");
      const doms = (ex.domains||[]).slice(0, 6).map(d => `<span class="chip">${esc(d.replace(/_/g," "))}</span>`).join("");
      elDrawerTags.innerHTML = doms + tags;
    }

    renderVariantSeg(ex);
    renderSteps(ex, activeVariant);
    setupTimerFromVariant(ex, activeVariant);
    setupTTS(ex, activeVariant);
    updateDoneButton();

    if (elDrawer){
      elDrawer.classList.add("is-on");
      document.body.style.overflow = "hidden";
    }
  }

  function renderVariantSeg(ex){
    if (!elVariantSeg) return;
    const av = activeVariant;

    const seg = VARIANTS_ORDER.filter(v => !!ex.variants?.[v]).map(v => {
      const dur = ex.variants?.[v]?.duration_sec;
      const label = `${v}${dur==null?"":" • "+formatDuration(dur)}`;
      return `
        <button class="seg-btn ${v===av?"is-on":""}" data-v="${esc(v)}" type="button">
          ${esc(label)}
        </button>
      `;
    }).join("");

    elVariantSeg.innerHTML = seg;

    $$(".seg-btn", elVariantSeg).forEach(b => {
      b.addEventListener("click", () => {
        const v = b.getAttribute("data-v");
        if (!v || !ex.variants?.[v]) return;
        activeVariant = v;
        renderVariantSeg(ex);
        renderSteps(ex, v);
        setupTimerFromVariant(ex, v);
        setupTTS(ex, v);
        updateDoneButton();
      });
    });
  }

  function renderSteps(ex, variant){
    if (!elDrawerSteps) return;
    const v = ex.variants?.[variant];
    const steps = Array.isArray(v?.steps) ? v.steps : [];
    if (!steps.length){
      elDrawerSteps.innerHTML = `<div class="muted">Aucune étape disponible.</div>`;
      return;
    }
    elDrawerSteps.innerHTML = `
      <ol class="steps">
        ${steps.map(s => `<li>${esc(s)}</li>`).join("")}
      </ol>
    `;
  }

  // ---------- TIMER ----------
  function setupTimerFromVariant(ex, variant){
    stopTimer();
    const v = ex.variants?.[variant];
    const sec = v?.duration_sec ?? null;

    timerTotal = sec;
    timerLeft = sec;

    if (elTimer) elTimer.textContent = formatDuration(timerLeft);
    if (elTimerBar) elTimerBar.style.width = "0%";

    if (timerTotal == null){
      // libre
      if (elBtnStart) elBtnStart.textContent = "▶ Démarrer (libre)";
    } else {
      if (elBtnStart) elBtnStart.textContent = "▶ Démarrer";
    }
  }

  function startTimer(){
    if (timerTotal == null){
      // libre : pas de timer
      if (elBtnStart) elBtnStart.textContent = "⏸ En cours (libre)";
      return;
    }
    if (!isFinite(timerTotal) || timerTotal <= 0) return;
    if (timerTick) return;

    if (timerLeft == null || timerLeft <= 0) timerLeft = timerTotal;
    if (elBtnStart) elBtnStart.textContent = "⏸ Pause";

    timerTick = setInterval(() => {
      timerLeft -= 1;
      timerLeft = Math.max(0, timerLeft);

      if (elTimer) elTimer.textContent = formatDuration(timerLeft);

      const pct = Math.round(((timerTotal - timerLeft) / timerTotal) * 100);
      if (elTimerBar) elTimerBar.style.width = `${pct}%`;

      if (timerLeft <= 0){
        stopTimer();
        if (elBtnStart) elBtnStart.textContent = "↻ Rejouer";
        // auto done suggestion
        try{
          elBtnDone?.classList.add("pulse");
          setTimeout(() => elBtnDone?.classList.remove("pulse"), 1200);
        }catch{}
      }
    }, 1000);
  }

  function pauseTimer(){
    if (timerTotal == null){
      // libre
      if (elBtnStart) elBtnStart.textContent = "▶ Reprendre (libre)";
      return;
    }
    if (!timerTick) return;
    clearInterval(timerTick);
    timerTick = null;
    if (elBtnStart) elBtnStart.textContent = "▶ Reprendre";
  }

  function stopTimer(){
    if (timerTick){
      clearInterval(timerTick);
      timerTick = null;
    }
  }

  // ---------- TTS ----------
  function ttsAvailable(){
    return ("speechSynthesis" in window) && ("SpeechSynthesisUtterance" in window);
  }

  function stopTTS(){
    try{
      if (!ttsAvailable()) return;
      window.speechSynthesis.cancel();
    }catch{}
    ttsUtter = null;
    ttsSpeaking = false;
    if (elTtsBtn) elTtsBtn.textContent = "🔊 Voix";
  }

  function speakLines(lines, rate){
    if (!ttsAvailable()) return;
    stopTTS();
    const text = (lines || []).map(x => String(x||"").trim()).filter(Boolean).join(" ");
    if (!text) return;

    const u = new SpeechSynthesisUtterance(text);
    u.lang = "fr-FR";
    u.rate = clamp(Number(rate||1), 0.7, 1.2);
    u.pitch = 1.0;

    u.onend = () => {
      ttsSpeaking = false;
      if (elTtsBtn) elTtsBtn.textContent = "🔊 Voix";
    };
    u.onerror = () => {
      ttsSpeaking = false;
      if (elTtsBtn) elTtsBtn.textContent = "🔊 Voix";
    };

    ttsUtter = u;
    ttsSpeaking = true;
    if (elTtsBtn) elTtsBtn.textContent = "⏸ Pause voix";
    window.speechSynthesis.speak(u);
  }

  function pauseOrResumeTTS(){
    if (!ttsAvailable()) return;
    try{
      if (window.speechSynthesis.speaking && !window.speechSynthesis.paused){
        window.speechSynthesis.pause();
        if (elTtsBtn) elTtsBtn.textContent = "▶ Reprendre voix";
        return;
      }
      if (window.speechSynthesis.paused){
        window.speechSynthesis.resume();
        if (elTtsBtn) elTtsBtn.textContent = "⏸ Pause voix";
        return;
      }
    }catch{}
  }

  function setupTTS(ex, variant){
    if (!elTtsBtn || !elTtsStop) return;

    if (!ttsAvailable()){
      elTtsBtn.disabled = true;
      elTtsStop.disabled = true;
      elTtsBtn.textContent = "🔇 Voix indisponible";
      return;
    }

    elTtsBtn.disabled = false;
    elTtsStop.disabled = false;
    elTtsBtn.textContent = "🔊 Voix";
    ttsSpeaking = false;

    // wiring only once
    if (elTtsBtn.dataset.wired !== "1"){
      elTtsBtn.dataset.wired = "1";
      elTtsBtn.addEventListener("click", () => {
        if (!activeExercise) return;

        const rate = elTtsRate ? Number(elTtsRate.value || 1) : 1;

        // if already speaking: pause/resume
        if (ttsAvailable() && window.speechSynthesis.speaking){
          pauseOrResumeTTS();
          return;
        }

        // else speak from scripts
        const lines = activeExercise.tts?.scripts?.[activeVariant] ||
                      activeExercise.tts?.scripts?.micro ||
                      [];
        speakLines(lines, rate);
      });
    }

    if (elTtsStop.dataset.wired !== "1"){
      elTtsStop.dataset.wired = "1";
      elTtsStop.addEventListener("click", () => stopTTS());
    }
  }

  // ---------- DONE ----------
  function updateDoneButton(){
    if (!elBtnDone || !activeExercise) return;
    const done = isDone(activeExercise.id);
    elBtnDone.textContent = done ? "✅ Déjà fait (aujourd’hui)" : "✅ Terminé";
    elBtnDone.disabled = done;
  }

  function wireActions(){
    // drawer close
    elDrawerClose?.addEventListener("click", closeDrawer);
    elDrawer?.addEventListener("click", (e) => {
      if (e.target === elDrawer) closeDrawer();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && elDrawer?.classList.contains("is-on")) closeDrawer();
    });

    // start/pause timer
    elBtnStart?.addEventListener("click", () => {
      if (!activeExercise) return;

      // libre
      if (timerTotal == null){
        // toggle text only, no tick
        const t = elBtnStart.textContent || "";
        if (t.includes("En cours")){
          elBtnStart.textContent = "▶ Reprendre (libre)";
        } else {
          elBtnStart.textContent = "⏸ En cours (libre)";
        }
        return;
      }

      if (timerTick) pauseTimer();
      else startTimer();
    });

    // done
    elBtnDone?.addEventListener("click", () => {
      if (!activeExercise) return;
      markDone(activeExercise.id);
      updateDoneButton();
      // refresh grid badges
      renderGrid();
      // petite confirmation
      try{
        elBtnDone.textContent = "✅ Terminé (sauvé)";
      }catch{}
    });

    // filters
    [elFilterDomain, elFilterModality, elFilterLevel, elFilterVariant, elFilterOnlyReco].forEach(el => {
      if (!el) return;
      el.addEventListener("change", filterExercises);
    });
    elFilterSearch?.addEventListener("input", () => {
      clearTimeout(elFilterSearch._t);
      elFilterSearch._t = setTimeout(filterExercises, 120);
    });

    elBtnResetFilters?.addEventListener("click", () => {
      prefs = { domain:"all", modality:"all", level:"all", variant:"all", search:"", onlyReco:false };
      savePrefs(prefs);
      applyPrefsToUI();
      filterExercises();
    });
  }

  // ---------- LOAD ----------
  async function loadCatalog(){
    if (elStatus) elStatus.textContent = "Chargement du catalogue…";
    const res = await fetch(CATALOG_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("fetch failed");
    const json = await res.json();
    return json;
  }

  function init(){
    wireActions();
    applyPrefsToUI();

    loadCatalog()
      .then(json => {
        catalog = json;
        allExercises = Array.isArray(json.exercises) ? json.exercises : [];
        computeRecommendedIds();
        fillFilterOptions();
        applyPrefsToUI();
        filterExercises();

        if (elStatus) elStatus.textContent = "Catalogue prêt ✅";
      })
      .catch(err => {
        console.error(err);
        if (elStatus) elStatus.textContent = "Erreur de chargement du catalogue.";
        if (elEmpty) elEmpty.style.display = "block";
        if (elEmpty) elEmpty.textContent = "Impossible de charger exercices_pro.json. Vérifie qu’il est bien à la racine.";
      });
  }

  init();

  // clamp helper used by tts
  function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }

})();