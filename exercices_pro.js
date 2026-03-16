/* =========================================================
   Vivario PRO — Exercices (Module B) v1
   - UI cartes vidéo (preview mp4)
   - Lecture exercices_pro.json
   - Recommandations auto depuis vivario_pro_result_v1 (+ onboarding optionnel)
   - TTS (SpeechSynthesis)
   - Timer (start/pause/reset)
   - Terminé ✅ (local + activité)
   ========================================================= */

(function(){
  const CATALOG_URL = "exercices_pro.json";

  const PRO_RESULT_KEY = "vivario_pro_result_v1";
  const PRO_ONBOARDING_KEY = "vivario_pro_onboarding_v1";
  const PRO_ACTIVITY_KEY = "vivario_pro_activity_v1";

  const DONE_KEY = "vivario_pro_exercises_done_v1"; // { "YYYY-MM-DD": { "<id>": { done_at, variant } } }

  const $ = (s, r=document) => r.querySelector(s);

  // UI refs
  const grid = $("#grid");
  const toast = $("#toast");
  const toastRight = $("#toastRight");

  const q = $("#q");
  const selDomain = $("#selDomain");
  const selModality = $("#selModality");
  const selLevel = $("#selLevel");
  const selDuration = $("#selDuration");
  const tagChips = $("#tagChips");
  const recoHint = $("#recoHint");

  const btnResetFilters = $("#btnResetFilters");
  const btnRecommended = $("#btnRecommended");

  const playerTitle = $("#playerTitle");
  const playerSub = $("#playerSub");
  const playerVideo = $("#playerVideo");
  const playerFallback = $("#playerFallback");
  const donePill = $("#donePill");

  const btnShort = $("#btnShort");
  const btnLong = $("#btnLong");

  const timerBig = $("#timerBig");
  const timerSub = $("#timerSub");
  const btnStartPause = $("#btnStartPause");
  const btnResetTimer = $("#btnResetTimer");

  const btnTTS = $("#btnTTS");
  const btnStopTTS = $("#btnStopTTS");
  const selRate = $("#selRate");

  const stepsEl = $("#steps");
  const contra = $("#contra");

  const btnDone = $("#btnDone");
  const btnSuggestNext = $("#btnSuggestNext");

  // state
  let catalog = null;
  let exercises = [];
  let selected = null;        // exercise object
  let selectedVariant = "short"; // "short" | "long"

  // timer
  let timerTotal = 0;
  let timerLeft = 0;
  let timerTick = null;
  let timerRunning = false;

  // TTS
  let ttsUtter = null;

  function nowIso(){ return new Date().toISOString(); }
  function todayKey(){
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const day = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  }
  function getJson(k){ try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } }
  function setJson(k,v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

  function showToast(el, msg){
    if (!el) return;
    el.textContent = msg || "";
    el.classList.add("is-on");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => el.classList.remove("is-on"), 2400);
  }

  function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }

  function scoreBand(score){
    const s = Number(score || 0);
    if (!isFinite(s)) return "good";
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
      setJson(PRO_ACTIVITY_KEY, list.slice(0, 30));
    }catch{}
  }

  async function loadCatalog(){
    const r = await fetch(CATALOG_URL, { cache: "no-store" });
    if (!r.ok) throw new Error("catalog http");
    const json = await r.json();
    if (!json || typeof json !== "object") throw new Error("catalog bad");
    return json;
  }

  function hydrateFilters(){
    // Domains
    const domains = Array.isArray(catalog?.taxonomies?.domains) ? catalog.taxonomies.domains : [];
    domains.forEach(d => {
      const opt = document.createElement("option");
      opt.value = d;
      opt.textContent = d.replace(/_/g," ");
      selDomain.appendChild(opt);
    });

    // Modalities
    const mods = Array.isArray(catalog?.taxonomies?.modalities) ? catalog.taxonomies.modalities : [];
    mods.forEach(m => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m.replace(/_/g," ");
      selModality.appendChild(opt);
    });

    // Levels
    const levels = Array.isArray(catalog?.taxonomies?.levels) ? catalog.taxonomies.levels : [];
    levels.forEach(l => {
      const opt = document.createElement("option");
      opt.value = l;
      opt.textContent = l;
      selLevel.appendChild(opt);
    });

    // Tags chips (top unique)
    const tagSet = new Set();
    exercises.forEach(x => (x.tags||[]).forEach(t => tagSet.add(String(t))));
    const tags = Array.from(tagSet).slice(0, 14);
    tagChips.innerHTML = tags.map(t => `<span class="chip" data-tag="${escapeHTML(t)}">#${escapeHTML(t)}</span>`).join("");

    tagChips.querySelectorAll(".chip").forEach(ch => {
      ch.addEventListener("click", () => {
        const on = ch.classList.toggle("is-on");
        if (on){
          // single tag filter (simple & efficace)
          tagChips.querySelectorAll(".chip").forEach(o => { if (o!==ch) o.classList.remove("is-on"); });
        }
        renderGrid();
      });
    });
  }

  function escapeHTML(str){
    return String(str || "").replace(/[&<>"']/g, (m) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[m]));
  }

  function activeTagFilter(){
    const on = tagChips.querySelector(".chip.is-on");
    return on ? on.getAttribute("data-tag") : "";
  }

  function matchesFilters(ex){
    const text = (q.value || "").trim().toLowerCase();
    const fd = selDomain.value;
    const fm = selModality.value;
    const fl = selLevel.value;
    const fdur = selDuration.value; // short/long
    const ftag = activeTagFilter();

    if (fd && !(ex.domains||[]).includes(fd)) return false;
    if (fm && ex.modality !== fm) return false;
    if (fl && ex.level !== fl) return false;
    if (fdur){
      if (!ex.variants || !ex.variants[fdur]) return false;
    }
    if (ftag){
      const tags = (ex.tags||[]).map(String);
      if (!tags.includes(ftag)) return false;
    }
    if (text){
      const blob = [
        ex.title, ex.modality, ex.level,
        ...(ex.domains||[]),
        ...(ex.tags||[])
      ].join(" ").toLowerCase();
      if (!blob.includes(text)) return false;
    }
    return true;
  }

  function getDoneMap(){
    const all = getJson(DONE_KEY) || {};
    const day = todayKey();
    if (!all[day]) all[day] = {};
    return { all, day, map: all[day] };
  }

  function isDoneToday(exId){
    const { map } = getDoneMap();
    return !!map?.[exId];
  }

  function markDone(exId, variant){
    const { all, day, map } = getDoneMap();
    map[exId] = { done_at: nowIso(), variant: variant || "short" };
    all[day] = map;
    setJson(DONE_KEY, all);
  }

  function bestBandFromResult(){
    const data = getJson(PRO_RESULT_KEY);
    if (!data) return "good";
    const tops = topDomains(data.scores || {}, 1);
    const s = (tops[0]||[null,0])[1] || 0;
    return scoreBand(s);
  }

  function getRecommendationContext(){
    const result = getJson(PRO_RESULT_KEY);
    const onboarding = getJson(PRO_ONBOARDING_KEY);

    const tops = result ? topDomains(result.scores || {}, 3) : [];
    const topDomainNames = tops.map(x => x[0]);
    const topScore = tops.length ? Number(tops[0][1] || 0) : null;
    const band = (topScore == null) ? "good" : scoreBand(topScore);

    // onboarding rhythm influences variant default
    const energy = onboarding?.energy || null;     // basse/moyenne/haute
    const durationPref = onboarding?.duration || null; // "1-2" | "5" | "10"

    let preferVariant = "short";
    if (durationPref === "10") preferVariant = "long";
    else if (durationPref === "5") preferVariant = "long";
    else preferVariant = "short";
    if (energy === "basse") preferVariant = "short";

    return { result, onboarding, tops, topDomainNames, topScore, band, preferVariant };
  }

  function computeRecommendedList(){
    const ctx = getRecommendationContext();
    const rules = catalog?.recommendation_rules || {};
    const map = rules.domain_to_tags || {};
    const fallbackOrder = rules.fallback_order || [];

    // 1) build preferred tags from top domains
    const wantedTags = new Set();
    ctx.topDomainNames.forEach(d => {
      (map[d] || []).forEach(t => wantedTags.add(String(t)));
    });

    // 2) score each exercise
    const scored = exercises.map(ex => {
      let s = 0;

      // match top domains
      const doms = ex.domains || [];
      ctx.topDomainNames.forEach((d, i) => {
        if (doms.includes(d)) s += (3 - i) * 8; // top1 heavier
      });

      // match tags
      const tags = (ex.tags||[]).map(String);
      tags.forEach(t => { if (wantedTags.has(t)) s += 3; });

      // prefer modalities order when no result
      if (!ctx.result){
        const idx = fallbackOrder.indexOf(ex.modality);
        if (idx >= 0) s += (fallbackOrder.length - idx);
      }

      // band adjustments: alert -> favor respiration/ancrage/relaxation
      if (ctx.band === "alert"){
        if (["respiration","ancrage","relaxation"].includes(ex.modality)) s += 6;
        if (ex.tags?.includes("urgence_douce")) s += 4;
      } else if (ctx.band === "warn"){
        if (["respiration","mobilite","yoga","mental"].includes(ex.modality)) s += 3;
      } else {
        if (["mobilite","cardio","yoga"].includes(ex.modality)) s += 2;
      }

      // penalize already done today
      if (isDoneToday(ex.id)) s -= 8;

      return { ex, score: s };
    });

    scored.sort((a,b) => b.score - a.score);

    const best = scored.slice(0, 6).map(x => x.ex);
    return { ctx, best };
  }

  function renderRecoHint(){
    const { ctx, best } = computeRecommendedList();
    const band = ctx.band;
    const domTxt = ctx.topDomainNames.length ? ctx.topDomainNames.join(", ") : "aucun diagnostic";
    const pref = ctx.preferVariant === "short" ? "court" : "long";

    recoHint.textContent = ctx.result
      ? `Top domaines: ${domTxt}. Intensité: ${band}. Suggestion: format ${pref}.`
      : `Pas de diagnostic local détecté. Je propose une sélection “base” (respiration / ancrage / mobilité).`;

    return { ctx, best };
  }

  function badgeClassFromBand(){
    return bestBandFromResult();
  }

  function formatDuration(sec){
    const s = Number(sec||0);
    const m = Math.floor(s/60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2,"0")}`;
  }

  function buildCard(ex){
    const done = isDoneToday(ex.id);
    const band = badgeClassFromBand();

    const vShort = ex.variants?.short?.duration_sec || null;
    const vLong = ex.variants?.long?.duration_sec || null;

    const badgeLeft = done ? `<span class="badge good">✅ Terminé</span>` : ``;
    const badgeRight = `<span class="badge ${band}">${ex.modality}</span>`;

    const tags = (ex.tags||[]).slice(0,4).map(t => `<span class="tag">#${escapeHTML(t)}</span>`).join("");

    const durLine = (vShort && vLong)
      ? `⚡ ${formatDuration(vShort)} • 🧭 ${formatDuration(vLong)}`
      : (vShort ? `⚡ ${formatDuration(vShort)}` : (vLong ? `🧭 ${formatDuration(vLong)}` : "Durée variable"));

    const hasVideo = !!ex.media?.preview_mp4;

    return `
      <article class="exo-card" data-id="${escapeHTML(ex.id)}" tabindex="0" role="button" aria-label="${escapeHTML(ex.title)}">
        <div class="exo-media">
          <div class="exo-badges">
            ${badgeLeft}
            ${badgeRight}
          </div>

          ${hasVideo ? `
            <video playsinline muted loop preload="metadata" poster="${escapeHTML(ex.media.poster||"")}">
              <source src="${escapeHTML(ex.media.preview_mp4)}" type="video/mp4" />
            </video>
          ` : `
            <div class="fallback">🎬 Aperçu</div>
          `}
        </div>

        <div class="exo-body">
          <h3 class="exo-name">${escapeHTML(ex.title)}</h3>
          <div class="exo-meta">${escapeHTML(durLine)} • niveau ${escapeHTML(ex.level || "—")}</div>
          <div class="exo-tags">${tags}</div>
        </div>
      </article>
    `;
  }

  function renderGrid(){
    if (!grid) return;
    const list = exercises.filter(matchesFilters);

    if (!list.length){
      grid.innerHTML = `<div class="empty">Aucun exercice ne correspond à tes filtres.</div>`;
      return;
    }

    grid.innerHTML = list.map(buildCard).join("");

    // autoplay preview when possible
    grid.querySelectorAll(".exo-card video").forEach(v => {
      try{
        const p = v.play();
        if (p && typeof p.catch === "function") p.catch(()=>{});
      }catch{}
    });

    // wire click
    grid.querySelectorAll(".exo-card").forEach(card => {
      const id = card.getAttribute("data-id");
      const ex = exercises.find(x => x.id === id);
      if (!ex) return;

      function open(){
        selectExercise(ex, { autoVariant: true });
      }
      card.addEventListener("click", open);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " "){
          e.preventDefault();
          open();
        }
      });
    });
  }

  function setVariant(v){
    selectedVariant = (v === "long") ? "long" : "short";
    btnShort.classList.toggle("is-on", selectedVariant === "short");
    btnLong.classList.toggle("is-on", selectedVariant === "long");

    // update timer
    if (selected){
      const dur = selected.variants?.[selectedVariant]?.duration_sec || 0;
      timerTotal = dur;
      timerLeft = dur;
      timerRunning = false;
      clearInterval(timerTick);
      timerTick = null;
      updateTimerUI("Prêt");
    }
  }

  function updateTimerUI(stateText){
    const left = Math.max(0, Number(timerLeft||0));
    const m = Math.floor(left/60);
    const s = left % 60;
    timerBig.textContent = `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
    timerSub.textContent = stateText || (timerRunning ? "En cours" : "Prêt");
    btnStartPause.textContent = timerRunning ? "⏸ Pause" : "▶ Démarrer";
  }

  function timerStart(){
    if (!selected) return;
    if (!timerTotal){
      showToast(toastRight, "⏱️ Durée inconnue pour cette variante.");
      return;
    }
    if (timerRunning) return;
    timerRunning = true;
    updateTimerUI("En cours");

    const startedAt = Date.now();
    let lastTick = startedAt;

    timerTick = setInterval(() => {
      const now = Date.now();
      const dt = Math.floor((now - lastTick)/1000);
      if (dt <= 0) return;
      lastTick = now;

      timerLeft = Math.max(0, timerLeft - dt);
      if (timerLeft <= 0){
        timerLeft = 0;
        timerRunning = false;
        clearInterval(timerTick);
        timerTick = null;
        updateTimerUI("Terminé ✅");
        showToast(toastRight, "✅ Timer terminé. Tu peux marquer l’exercice comme fait.");
        return;
      }
      updateTimerUI("En cours");
    }, 250);
  }

  function timerPause(){
    if (!timerRunning) return;
    timerRunning = false;
    clearInterval(timerTick);
    timerTick = null;
    updateTimerUI("Pause");
  }

  function timerReset(){
    if (!selected) return;
    clearInterval(timerTick);
    timerTick = null;
    timerRunning = false;
    timerLeft = timerTotal || 0;
    updateTimerUI("Prêt");
  }

  function stopTTS(){
    try{
      if ("speechSynthesis" in window){
        window.speechSynthesis.cancel();
      }
    }catch{}
    ttsUtter = null;
  }

  function speakLines(lines){
    if (!lines || !lines.length){
      showToast(toastRight, "🔊 Script voix indisponible.");
      return;
    }
    if (!("speechSynthesis" in window)){
      showToast(toastRight, "🔊 TTS non supporté sur ce navigateur.");
      return;
    }

    stopTTS();

    const rate = Number(selRate.value || 1);
    const text = lines.join(" ");
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "fr-FR";
    u.rate = clamp(rate, 0.7, 1.4);
    u.pitch = 1.0;

    u.onstart = () => showToast(toastRight, "🔊 Voix en cours…");
    u.onend = () => showToast(toastRight, "🔊 Fin de la voix.");
    u.onerror = () => showToast(toastRight, "🔊 Erreur voix.");

    ttsUtter = u;
    try{
      window.speechSynthesis.speak(u);
    }catch{
      showToast(toastRight, "🔊 Impossible de démarrer la voix.");
    }
  }

  function renderPlayer(ex){
    playerTitle.textContent = ex.title;
    playerSub.textContent = `${ex.modality} • niveau ${ex.level} • domaines: ${(ex.domains||[]).join(", ") || "—"}`;

    // done pill
    const done = isDoneToday(ex.id);
    donePill.style.display = done ? "inline-flex" : "none";

    // media
    const hasVideo = !!ex.media?.preview_mp4;
    if (hasVideo){
      playerFallback.style.display = "none";
      playerVideo.style.display = "block";
      playerVideo.setAttribute("poster", ex.media.poster || "");
      playerVideo.innerHTML = `<source src="${escapeHTML(ex.media.preview_mp4)}" type="video/mp4" />`;
      try{
        playerVideo.load();
        const p = playerVideo.play();
        if (p && typeof p.catch === "function") p.catch(()=>{});
      }catch{}
    } else {
      playerVideo.style.display = "none";
      playerFallback.style.display = "block";
    }

    // steps
    const steps = ex.variants?.[selectedVariant]?.steps || [];
    stepsEl.innerHTML = (steps.length ? steps : ["Suivre la voix + faire au ressenti."]).map(s => `<li>${escapeHTML(s)}</li>`).join("");

    // contraindications
    const contraList = Array.isArray(ex.contraindications) ? ex.contraindications : [];
    contra.textContent = contraList.length
      ? `⚠️ Vigilance: ${contraList.join(" ")}`
      : ``;

    // timer values
    timerTotal = ex.variants?.[selectedVariant]?.duration_sec || 0;
    timerLeft = timerTotal;
    clearInterval(timerTick);
    timerTick = null;
    timerRunning = false;
    updateTimerUI("Prêt");
  }

  function selectExercise(ex, opts = {}){
    selected = ex;

    // choose variant
    if (opts.autoVariant){
      const ctx = getRecommendationContext();
      setVariant(ctx.preferVariant || "short");
    } else {
      setVariant(selectedVariant);
    }

    renderPlayer(ex);
    showToast(toast, `👉 Sélection: ${ex.title}`);

    try{
      pushActivity("home", { label: `Ouverture exercice: ${ex.title}`, exerciseId: ex.id, variant: selectedVariant });
    }catch{}
  }

  function suggestNext(){
    const { best } = computeRecommendedList();
    if (!best.length){
      showToast(toastRight, "Aucune suggestion disponible.");
      return;
    }
    const currentId = selected?.id || null;
    const next = best.find(x => x.id !== currentId) || best[0];
    selectExercise(next, { autoVariant: true });
    showToast(toastRight, "➡️ Suggestion chargée.");
  }

  function applyRecommendedFocus(){
    const { best } = renderRecoHint();
    if (!best.length){
      showToast(toast, "Aucune recommandation trouvée.");
      return;
    }
    // If nothing selected yet, open first recommended
    if (!selected) selectExercise(best[0], { autoVariant: true });

    // Light hint
    showToast(toast, `✨ Recommandés: ${best.slice(0,3).map(x=>x.title).join(" • ")}`);
  }

  function wire(){
    // filters
    [q, selDomain, selModality, selLevel, selDuration].forEach(el => {
      el.addEventListener("input", renderGrid);
      el.addEventListener("change", renderGrid);
    });

    btnResetFilters.addEventListener("click", () => {
      q.value = "";
      selDomain.value = "";
      selModality.value = "";
      selLevel.value = "";
      selDuration.value = "";
      tagChips.querySelectorAll(".chip").forEach(c => c.classList.remove("is-on"));
      renderGrid();
      showToast(toast, "↻ Filtres réinitialisés.");
    });

    btnRecommended.addEventListener("click", () => applyRecommendedFocus());

    // variant
    btnShort.addEventListener("click", () => { if (!selected) return; setVariant("short"); renderPlayer(selected); });
    btnLong.addEventListener("click", () => { if (!selected) return; setVariant("long"); renderPlayer(selected); });

    // timer
    btnStartPause.addEventListener("click", () => {
      if (!selected){ showToast(toastRight, "Choisis un exercice d’abord."); return; }
      if (timerRunning) timerPause();
      else timerStart();
    });
    btnResetTimer.addEventListener("click", () => timerReset());

    // TTS
    btnTTS.addEventListener("click", () => {
      if (!selected){ showToast(toastRight, "Choisis un exercice d’abord."); return; }
      const script = selected.tts?.[selectedVariant === "long" ? "script_long" : "script_short"] || [];
      speakLines(script);
    });
    btnStopTTS.addEventListener("click", () => stopTTS());

    // Done
    btnDone.addEventListener("click", () => {
      if (!selected){ showToast(toastRight, "Choisis un exercice d’abord."); return; }
      markDone(selected.id, selectedVariant);
      donePill.style.display = "inline-flex";
      showToast(toastRight, "✅ Enregistré comme terminé (local).");
      showToast(toast, `✅ Terminé: ${selected.title}`);
      renderGrid();

      try{
        pushActivity("home", {
          label: `Exercice terminé ✅ — ${selected.title}`,
          exerciseId: selected.id,
          variant: selectedVariant
        });
      }catch{}
    });

    btnSuggestNext.addEventListener("click", () => suggestNext());

    // stop TTS when leaving
    window.addEventListener("beforeunload", () => { try{ stopTTS(); }catch{} });
  }

  async function init(){
    try{
      catalog = await loadCatalog();
      exercises = Array.isArray(catalog.exercises) ? catalog.exercises : [];
      hydrateFilters();
      renderRecoHint();
      renderGrid();

      // auto select recommended
      applyRecommendedFocus();

      showToast(toast, "✅ Catalogue chargé.");
    }catch(e){
      console.error(e);
      grid.innerHTML = `<div class="empty">Erreur chargement catalogue. Vérifie que <b>${escapeHTML(CATALOG_URL)}</b> existe.</div>`;
      showToast(toast, "❌ Catalogue introuvable.");
    }
  }

  wire();
  init();
})();