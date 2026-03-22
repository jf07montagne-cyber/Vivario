(function(){
  const CATALOG_URL = "exercices_pro.json";

  const PRO_RESULT_KEY = "vivario_pro_result_v1";
  const PRO_ONBOARDING_KEY = "vivario_pro_onboarding_v1";
  const PRO_ACTIVITY_KEY = "vivario_pro_activity_v1";
  const DONE_KEY = "vivario_pro_exercises_done_v1"; // { "YYYY-MM-DD": { "<id>": { done_at, variant } } }

  const $ = (s, r=document) => r.querySelector(s);

  const grid = $("#grid");
  const toast = $("#toast");
  const toastRight = $("#toastRight");

  const q = $("#q");
  const selDomain = $("#selDomain");
  const selModality = $("#selModality");
  const selLevel = $("#selLevel");
  const tagChips = $("#tagChips");
  const recoHint = $("#recoHint");

  const btnResetFilters = $("#btnResetFilters");
  const btnRecommended = $("#btnRecommended");

  const playerTitle = $("#playerTitle");
  const playerSub = $("#playerSub");
  const playerVideo = $("#playerVideo");
  const playerFallback = $("#playerFallback");
  const donePill = $("#donePill");

  const variantSeg = $("#variantSeg");

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

  let catalog = null;
  let exercises = [];
  let selected = null;
  let selectedVariant = null;

  let timerTotal = 0;
  let timerLeft = 0;
  let timerTick = null;
  let timerRunning = false;

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

  function escapeHTML(str){
    return String(str || "").replace(/[&<>"']/g, (m) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[m]));
  }

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
    const domains = Array.isArray(catalog?.taxonomies?.domains) ? catalog.taxonomies.domains : [];
    domains.forEach(d => {
      const opt = document.createElement("option");
      opt.value = d;
      opt.textContent = d.replace(/_/g," ");
      selDomain.appendChild(opt);
    });

    const mods = Array.isArray(catalog?.taxonomies?.modalities) ? catalog.taxonomies.modalities : [];
    mods.forEach(m => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m.replace(/_/g," ");
      selModality.appendChild(opt);
    });

    const levels = Array.isArray(catalog?.taxonomies?.levels) ? catalog.taxonomies.levels : [];
    levels.forEach(l => {
      const opt = document.createElement("option");
      opt.value = l;
      opt.textContent = l;
      selLevel.appendChild(opt);
    });

    const tagSet = new Set();
    exercises.forEach(x => (x.tags||[]).forEach(t => tagSet.add(String(t))));
    const tags = Array.from(tagSet).slice(0, 18);
    tagChips.innerHTML = tags.map(t => `<span class="chip" data-tag="${escapeHTML(t)}">#${escapeHTML(t)}</span>`).join("");

    tagChips.querySelectorAll(".chip").forEach(ch => {
      ch.addEventListener("click", () => {
        const on = ch.classList.toggle("is-on");
        if (on){
          tagChips.querySelectorAll(".chip").forEach(o => { if (o!==ch) o.classList.remove("is-on"); });
        }
        renderGrid();
      });
    });
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
    const ftag = activeTagFilter();

    if (fd && !(ex.domains||[]).includes(fd)) return false;
    if (fm && ex.modality !== fm) return false;
    if (fl && ex.level !== fl) return false;
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
    map[exId] = { done_at: nowIso(), variant: variant || "micro" };
    all[day] = map;
    setJson(DONE_KEY, all);
  }

  function getRecoContext(){
    const result = getJson(PRO_RESULT_KEY);
    const onboarding = getJson(PRO_ONBOARDING_KEY);

    const tops = result ? topDomains(result.scores || {}, 3) : [];
    const topDomainNames = tops.map(x => x[0]);
    const topScore = tops.length ? Number(tops[0][1] || 0) : null;
    const band = (topScore == null) ? "good" : scoreBand(topScore);

    const energy = onboarding?.energy || null;        // basse/moyenne/haute
    const durationPref = onboarding?.duration || null; // 1-2 / 5 / 10

    return { result, onboarding, tops, topDomainNames, topScore, band, energy, durationPref };
  }

  function chooseDefaultVariant(ex){
    const ctx = getRecoContext();
    const policy = catalog?.variants_policy?.default_choice || {};

    const keys = Object.keys(ex.variants || {});
    if (!keys.length) return null;

    // sort by duration
    keys.sort((a,b) => (ex.variants[a]?.duration_sec||0) - (ex.variants[b]?.duration_sec||0));

    // helper pick nearest
    const has = (k) => keys.includes(k);

    // band
    if (ctx.band === "alert" && has(policy.if_band_alert)) return policy.if_band_alert;
    if (ctx.band === "warn" && has(policy.if_band_warn)) return policy.if_band_warn;
    if (ctx.band === "good" && has(policy.if_band_good)) return policy.if_band_good;

    // energy
    if (ctx.energy === "basse" && has(policy.if_energy_basse)) return policy.if_energy_basse;

    // duration pref
    if (ctx.durationPref === "1-2" && has(policy.if_duration_pref_1_2)) return policy.if_duration_pref_1_2;
    if (ctx.durationPref === "5" && has(policy.if_duration_pref_5)) return policy.if_duration_pref_5;
    if (ctx.durationPref === "10" && has(policy.if_duration_pref_10)) return policy.if_duration_pref_10;

    // fallback shortest
    return keys[0];
  }

  function computeRecommended(){
    const ctx = getRecoContext();
    const rules = catalog?.recommendation_rules || {};
    const map = rules.domain_to_tags || {};
    const fallbackOrder = rules.fallback_order || [];

    const wantedTags = new Set();
    ctx.topDomainNames.forEach(d => (map[d] || []).forEach(t => wantedTags.add(String(t))));

    const scored = exercises.map(ex => {
      let s = 0;

      const doms = ex.domains || [];
      ctx.topDomainNames.forEach((d, i) => {
        if (doms.includes(d)) s += (3 - i) * 8;
      });

      const tags = (ex.tags||[]).map(String);
      tags.forEach(t => { if (wantedTags.has(t)) s += 3; });

      if (!ctx.result){
        const idx = fallbackOrder.indexOf(ex.modality);
        if (idx >= 0) s += (fallbackOrder.length - idx);
      }

      if (ctx.band === "alert"){
        if (["respiration","ancrage","relaxation"].includes(ex.modality)) s += 6;
        if (tags.includes("urgence_douce")) s += 4;
      } else if (ctx.band === "warn"){
        if (["respiration","mobilite","yoga","mental","ecriture"].includes(ex.modality)) s += 3;
      } else {
        if (["mobilite","cardio","yoga"].includes(ex.modality)) s += 2;
      }

      if (isDoneToday(ex.id)) s -= 8;
      return { ex, score: s };
    });

    scored.sort((a,b) => b.score - a.score);
    return { ctx, best: scored.slice(0, 8).map(x=>x.ex) };
  }

  function renderRecoHint(){
    const { ctx, best } = computeRecommended();
    const domTxt = ctx.topDomainNames.length ? ctx.topDomainNames.join(", ") : "aucun diagnostic";
    recoHint.textContent = ctx.result
      ? `Top domaines: ${domTxt}. Intensité: ${ctx.band}. Je te propose les plus utiles automatiquement.`
      : `Pas de diagnostic local détecté. Je propose une base respiration/ancrage/mobilité.`;
    return { ctx, best };
  }

  function formatDuration(sec){
    const s = Number(sec||0);
    const m = Math.floor(s/60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2,"0")}`;
  }

  function bestBandFromResult(){
    const data = getJson(PRO_RESULT_KEY);
    if (!data) return "good";
    const tops = topDomains(data.scores || {}, 1);
    const s = (tops[0]||[null,0])[1] || 0;
    return scoreBand(s);
  }

  function buildCard(ex){
    const done = isDoneToday(ex.id);
    const band = bestBandFromResult();

    const vkeys = Object.keys(ex.variants || {});
    const vmins = vkeys.map(k => ex.variants[k]?.duration_sec).filter(x=>isFinite(x)).sort((a,b)=>a-b);
    const durLine = vmins.length ? `${formatDuration(vmins[0])} → ${formatDuration(vmins[vmins.length-1])}` : "Durée variable";

    const badgeLeft = done ? `<span class="badge good">✅ Terminé</span>` : ``;
    const badgeRight = `<span class="badge ${band}">${escapeHTML(ex.modality)}</span>`;

    const tags = (ex.tags||[]).slice(0,4).map(t => `<span class="tag">#${escapeHTML(t)}</span>`).join("");
    const hasVideo = !!ex.media?.preview_mp4;

    return `
      <article class="exo-card" data-id="${escapeHTML(ex.id)}" tabindex="0" role="button" aria-label="${escapeHTML(ex.title)}">
        <div class="exo-media">
          <div class="exo-badges">${badgeLeft}${badgeRight}</div>
          ${hasVideo ? `
            <video playsinline muted loop preload="metadata" poster="${escapeHTML(ex.media.poster||"")}">
              <source src="${escapeHTML(ex.media.preview_mp4)}" type="video/mp4" />
            </video>
          ` : `<div class="fallback">🎬 Aperçu</div>`}
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
    const list = exercises.filter(matchesFilters);
    if (!list.length){
      grid.innerHTML = `<div class="empty">Aucun exercice ne correspond à tes filtres.</div>`;
      return;
    }
    grid.innerHTML = list.map(buildCard).join("");

    grid.querySelectorAll(".exo-card video").forEach(v => {
      try{ const p = v.play(); if (p?.catch) p.catch(()=>{}); }catch{}
    });

    grid.querySelectorAll(".exo-card").forEach(card => {
      const id = card.getAttribute("data-id");
      const ex = exercises.find(x => x.id === id);
      if (!ex) return;
      const open = () => selectExercise(ex, { autoVariant:true });
      card.addEventListener("click", open);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " "){ e.preventDefault(); open(); }
      });
    });
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
    if (!timerTotal){ showToast(toastRight, "⏱️ Durée inconnue."); return; }
    if (timerRunning) return;

    timerRunning = true;
    updateTimerUI("En cours");

    let lastTick = Date.now();
    timerTick = setInterval(() => {
      const now = Date.now();
      const dt = Math.floor((now - lastTick)/1000);
      if (dt <= 0) return;
      lastTick = now;

      timerLeft = Math.max(0, timerLeft - dt);
      if (timerLeft <= 0){
        timerLeft = 0;
        timerRunning = false;
        clearInterval(timerTick); timerTick = null;
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
    clearInterval(timerTick); timerTick = null;
    updateTimerUI("Pause");
  }

  function timerReset(){
    if (!selected) return;
    clearInterval(timerTick); timerTick = null;
    timerRunning = false;
    timerLeft = timerTotal || 0;
    updateTimerUI("Prêt");
  }

  function stopTTS(){
    try{ if ("speechSynthesis" in window) window.speechSynthesis.cancel(); }catch{}
  }

  function speakLines(lines){
    if (!lines || !lines.length){ showToast(toastRight, "🔊 Script voix indisponible."); return; }
    if (!("speechSynthesis" in window)){ showToast(toastRight, "🔊 TTS non supporté."); return; }

    stopTTS();

    const rate = Number(selRate.value || 1);
    const text = lines.join(" ");
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "fr-FR";
    u.rate = clamp(rate, 0.7, 1.4);

    u.onstart = () => showToast(toastRight, "🔊 Voix en cours…");
    u.onend = () => showToast(toastRight, "🔊 Fin de la voix.");
    u.onerror = () => showToast(toastRight, "🔊 Erreur voix.");
    try{ window.speechSynthesis.speak(u); }catch{ showToast(toastRight, "🔊 Impossible de démarrer."); }
  }

  function renderVariantSeg(ex){
    const keys = Object.keys(ex.variants || {});
    if (!keys.length){
      variantSeg.innerHTML = `<span class="muted">Aucune variante</span>`;
      selectedVariant = null;
      return;
    }
    keys.sort((a,b) => (ex.variants[a]?.duration_sec||0) - (ex.variants[b]?.duration_sec||0));

    if (!selectedVariant || !keys.includes(selectedVariant)){
      selectedVariant = chooseDefaultVariant(ex) || keys[0];
    }

    variantSeg.innerHTML = keys.map(k => {
      const dur = ex.variants[k]?.duration_sec || 0;
      const label = `${k} • ${dur ? formatDuration(dur) : "—"}`;
      return `<button type="button" data-var="${escapeHTML(k)}" class="${k===selectedVariant ? "is-on" : ""}">${escapeHTML(label)}</button>`;
    }).join("");

    variantSeg.querySelectorAll("button[data-var]").forEach(b => {
      b.addEventListener("click", () => {
        selectedVariant = b.getAttribute("data-var");
        renderPlayer(ex);
        showToast(toastRight, `Variante: ${selectedVariant}`);
      });
    });
  }

  function renderPlayer(ex){
    playerTitle.textContent = ex.title;
    playerSub.textContent = `${ex.modality} • niveau ${ex.level} • domaines: ${(ex.domains||[]).join(", ") || "—"}`;

    donePill.style.display = isDoneToday(ex.id) ? "inline-flex" : "none";

    const hasVideo = !!ex.media?.preview_mp4;
    if (hasVideo){
      playerFallback.style.display = "none";
      playerVideo.style.display = "block";
      playerVideo.setAttribute("poster", ex.media.poster || "");
      playerVideo.innerHTML = `<source src="${escapeHTML(ex.media.preview_mp4)}" type="video/mp4" />`;
      try{ playerVideo.load(); const p = playerVideo.play(); if (p?.catch) p.catch(()=>{}); }catch{}
    } else {
      playerVideo.style.display = "none";
      playerFallback.style.display = "block";
    }

    renderVariantSeg(ex);

    const steps = ex.variants?.[selectedVariant]?.steps || [];
    stepsEl.innerHTML = (steps.length ? steps : ["Suivre la voix + faire au ressenti."]).map(s => `<li>${escapeHTML(s)}</li>`).join("");

    const contraList = Array.isArray(ex.contraindications) ? ex.contraindications : [];
    contra.textContent = contraList.length ? `⚠️ Vigilance: ${contraList.join(" ")}` : ``;

    timerTotal = ex.variants?.[selectedVariant]?.duration_sec || 0;
    timerLeft = timerTotal;
    clearInterval(timerTick); timerTick = null;
    timerRunning = false;
    updateTimerUI("Prêt");
  }

  function selectExercise(ex, opts = {}){
    selected = ex;
    if (opts.autoVariant) selectedVariant = null; // force chooseDefaultVariant()
    renderPlayer(ex);
    showToast(toast, `👉 Sélection: ${ex.title}`);
    pushActivity("home", { label: `Ouverture exercice: ${ex.title}`, exerciseId: ex.id, variant: selectedVariant });
  }

  function applyRecommendedFocus(){
    const { best } = renderRecoHint();
    if (!best.length){ showToast(toast, "Aucune reco trouvée."); return; }
    if (!selected) selectExercise(best[0], { autoVariant:true });
    showToast(toast, `✨ Recommandés: ${best.slice(0,3).map(x=>x.title).join(" • ")}`);
  }

  function suggestNext(){
    const { best } = computeRecommended();
    if (!best.length){ showToast(toastRight, "Aucune suggestion."); return; }
    const next = best.find(x => x.id !== selected?.id) || best[0];
    selectExercise(next, { autoVariant:true });
    showToast(toastRight, "➡️ Suggestion chargée.");
  }

  function wire(){
    [q, selDomain, selModality, selLevel].forEach(el => {
      el.addEventListener("input", renderGrid);
      el.addEventListener("change", renderGrid);
    });

    btnResetFilters.addEventListener("click", () => {
      q.value = ""; selDomain.value = ""; selModality.value = ""; selLevel.value = "";
      tagChips.querySelectorAll(".chip").forEach(c => c.classList.remove("is-on"));
      renderGrid();
      showToast(toast, "↻ Filtres réinitialisés.");
    });

    btnRecommended.addEventListener("click", () => applyRecommendedFocus());

    btnStartPause.addEventListener("click", () => {
      if (!selected){ showToast(toastRight, "Choisis un exercice d’abord."); return; }
      if (timerRunning) timerPause(); else timerStart();
    });
    btnResetTimer.addEventListener("click", () => timerReset());

    btnTTS.addEventListener("click", () => {
      if (!selected){ showToast(toastRight, "Choisis un exercice d’abord."); return; }
      const lines = selected.tts?.scripts?.[selectedVariant] || selected.tts?.scripts?.micro || [];
      speakLines(lines);
    });
    btnStopTTS.addEventListener("click", () => stopTTS());

    btnDone.addEventListener("click", () => {
      if (!selected){ showToast(toastRight, "Choisis un exercice d’abord."); return; }
      markDone(selected.id, selectedVariant || "micro");
      donePill.style.display = "inline-flex";
      showToast(toastRight, "✅ Terminé enregistré (local).");
      renderGrid();
      pushActivity("home", { label: `Exercice terminé ✅ — ${selected.title}`, exerciseId: selected.id, variant: selectedVariant });
    });

    btnSuggestNext.addEventListener("click", () => suggestNext());

    window.addEventListener("beforeunload", () => { try{ stopTTS(); }catch{} });
  }

  async function init(){
    try{
      catalog = await loadCatalog();
      exercises = Array.isArray(catalog.exercises) ? catalog.exercises : [];
      hydrateFilters();
      renderRecoHint();
      renderGrid();
      applyRecommendedFocus();
      showToast(toast, "✅ Catalogue chargé.");
    }catch(e){
      console.error(e);
      grid.innerHTML = `<div class="empty">Erreur chargement catalogue. Vérifie <b>${escapeHTML(CATALOG_URL)}</b>.</div>`;
      showToast(toast, "❌ Catalogue introuvable.");
    }
  }

  wire();
  init();
})();