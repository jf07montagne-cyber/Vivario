/* =========================================================
   Vivario PRO — exercices_pro.js v1.0 (ULTRA SAFE)
   - UI "carte vidéo" (gif/mp4) + recherche + filtres
   - Lecture exercices_pro.json
   - TTS (speechSynthesis) + timer + "Terminé ✅"
   - Reco auto selon vivario_pro_result_v1.scores (si présent)
   - Stockage local: terminé + dernière session
   ========================================================= */

(function(){
  const CATALOG_URL = "exercices_pro.json";

  // ----- LocalStorage keys
  const PRO_RESULT_KEY = "vivario_pro_result_v1"; // { created_at, scores:{} }
  const ONBOARDING_KEY = "vivario_pro_onboarding_v1"; // { energy, duration, ... }
  const DONE_KEY = "vivario_pro_exercises_done_v1"; // { [id]: { at, variant, sec, title } }
  const LAST_KEY = "vivario_pro_exercises_last_v1"; // { at, id, title }
  const ACTIVITY_KEY = "vivario_pro_activity_v1"; // optional tracking, ultra safe

  // ----- DOM
  const elGrid = document.getElementById("exGrid");
  const elSubtitle = document.getElementById("exSubtitle");
  const elToast = document.getElementById("exToast");

  const btnReload = document.getElementById("btnReload");

  const tabBtns = Array.from(document.querySelectorAll(".ex-pill"));
  const q = document.getElementById("q");
  const fDomain = document.getElementById("fDomain");
  const fCategory = document.getElementById("fCategory");

  const kpiMode = document.getElementById("kpiMode");
  const kpiModeSub = document.getElementById("kpiModeSub");
  const kpiDone = document.getElementById("kpiDone");
  const kpiDoneSub = document.getElementById("kpiDoneSub");
  const kpiLast = document.getElementById("kpiLast");
  const kpiLastSub = document.getElementById("kpiLastSub");
  const kpiTip = document.getElementById("kpiTip");

  const bandBadge = document.getElementById("exBandBadge");
  const bandText = document.getElementById("exBandText");

  // modal
  const m = {
    root: document.getElementById("exModal"),
    title: document.getElementById("mTitle"),
    sub: document.getElementById("mSub"),
    media: document.getElementById("mMedia"),
    time: document.getElementById("mTime"),
    hint: document.getElementById("mHint"),
    steps: document.getElementById("mSteps"),
    toast: document.getElementById("mToast"),
    closeTop: document.getElementById("mCloseTop"),
    variant: document.getElementById("mVariant"),
    speak: document.getElementById("mSpeak"),
    start: document.getElementById("mStart"),
    pause: document.getElementById("mPause"),
    reset: document.getElementById("mReset"),
    done: document.getElementById("mDone"),
  };

  // ----- State
  let _catalog = null;
  let _list = [];               // normalized exercises
  let _tab = "reco";            // reco | all | done
  let _domainAuto = "";         // suggested domain filter
  let _topDomains = [];         // from result
  let _band = "good";           // good | warn | alert
  let _preferredVariant = "short"; // short | long
  let _energy = "moyenne";      // onboarding energy
  let _durationPref = "1-2";    // onboarding duration

  // modal state
  let _current = null;          // current exercise object
  let _variant = "short";       // selected variant
  let _timer = { running:false, totalSec:0, leftSec:0, t:null, startedAt:null };

  // ----- helpers
  function getJson(key){
    try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
  }
  function setJson(key, value){
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }
  function nowIso(){ return new Date().toISOString(); }

  function toast(msg){
    if (!elToast) return;
    elToast.textContent = msg || "";
    elToast.classList.add("is-on");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => elToast.classList.remove("is-on"), 2400);
  }
  function mToast(msg){
    if (!m.toast) return;
    m.toast.textContent = msg || "";
    m.toast.classList.add("is-on");
    clearTimeout(mToast._t);
    mToast._t = setTimeout(() => m.toast.classList.remove("is-on"), 2400);
  }

  function escapeHTML(str){
    return String(str || "").replace(/[&<>"']/g, (x) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[x]));
  }

  function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }

  function prettyDate(iso){
    try{
      const d = new Date(iso);
      return d.toLocaleString(undefined, { year:"numeric", month:"short", day:"2-digit", hour:"2-digit", minute:"2-digit" });
    }catch{ return "—"; }
  }

  function humanTimeAgo(iso){
    if (!iso) return "—";
    try{
      const d = new Date(iso);
      const diff = Date.now() - d.getTime();
      if (!isFinite(diff) || diff < 0) return prettyDate(iso);
      const min = Math.floor(diff/60000);
      const h = Math.floor(diff/3600000);
      const day = Math.floor(diff/86400000);
      if (min < 1) return "à l’instant";
      if (min < 60) return `il y a ${min} min`;
      if (h < 24) return h === 1 ? "il y a 1h" : `il y a ${h}h`;
      if (day === 1) return "hier";
      if (day < 7) return `il y a ${day} jours`;
      return "il y a quelques jours";
    }catch{ return "—"; }
  }

  function scoreBand(score){
    const s = Number(score || 0);
    if (!isFinite(s)) return "good";
    if (s >= 75) return "alert";
    if (s >= 45) return "warn";
    return "good";
  }

  function severityLabel(score){
    const s = Number(score || 0);
    if (!isFinite(s)) return "Faible";
    if (s >= 75) return "Élevé";
    if (s >= 45) return "Modéré";
    if (s >= 20) return "Léger";
    return "Faible";
  }

  function safeArr(x){ return Array.isArray(x) ? x : []; }

  // ----- normalize catalog into a stable shape
  function normalizeExercise(raw, idx){
    const id = String(raw?.id || raw?.slug || raw?.key || `ex_${idx+1}`).trim();
    const title = String(raw?.title || raw?.name || raw?.label || "Exercice").trim();
    const category = String(raw?.category || raw?.type || "mental").toLowerCase().trim();
    const desc = String(raw?.desc || raw?.description || raw?.summary || "").trim();

    const tags = safeArr(raw?.tags).map(x => String(x).toLowerCase().trim()).filter(Boolean);
    const domains = safeArr(raw?.domains || raw?.target_domains || raw?.cibles || raw?.domaines)
      .map(x => String(x).toLowerCase().trim()).filter(Boolean);

    const level = String(raw?.level || raw?.niveau || raw?.difficulty || "debutant").toLowerCase().trim();

    // variants
    const v = raw?.variants || raw?.variant || {};
    const vShort = v?.short || raw?.short || raw?.variant_short || null;
    const vLong  = v?.long  || raw?.long  || raw?.variant_long  || null;

    function normVariant(vx, fallbackSec){
      if (!vx || typeof vx !== "object"){
        return { sec: fallbackSec, steps: [], tts: null };
      }
      const sec = Number(vx.sec || vx.seconds || vx.duration_sec || 0) || fallbackSec;
      const steps = safeArr(vx.steps || vx.instructions || vx.etapes).map(s => String(s).trim()).filter(Boolean);
      const tts = String(vx.tts || vx.voice || vx.script || "").trim() || null;
      return { sec, steps, tts };
    }

    const short = normVariant(vShort, 90);
    const long  = normVariant(vLong, 300);

    // media
    const media = raw?.media || {};
    const mediaUrl = String(media?.url || raw?.media_url || raw?.video || raw?.gif || "").trim() || null;
    const poster = String(media?.poster || raw?.poster || "").trim() || null;

    const intensity = String(raw?.intensity || raw?.intensite || "low").toLowerCase().trim(); // low/med/high
    const contraindications = safeArr(raw?.contraindications || raw?.avoid || []).map(x => String(x).trim()).filter(Boolean);

    return {
      id, title, category, desc,
      tags, domains, level, intensity,
      variants: { short, long },
      media: { url: mediaUrl, poster },
      contraindications
    };
  }

  async function loadCatalog(){
    if (elSubtitle) elSubtitle.textContent = "Chargement du catalogue…";
    try{
      const res = await fetch(CATALOG_URL, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      _catalog = json;

      const list = safeArr(json?.exercises || json?.items || json?.list || json?.data);
      _list = list.map((x,i) => normalizeExercise(x,i));

      if (elSubtitle){
        elSubtitle.textContent = `Catalogue chargé : ${_list.length} exercice(s). Reco auto + variantes courte/longue.`;
      }
      toast("✅ Catalogue chargé");
      inferContext();
      fillDomainSelect();
      render();
      renderKPIs();
    }catch(e){
      console.log(e);
      if (elSubtitle) elSubtitle.textContent = "❌ Impossible de charger exercices_pro.json (vérifie le fichier dans le dossier Vivario).";
      toast("❌ Erreur de chargement du catalogue");
      _catalog = null;
      _list = [];
      render();
      renderKPIs();
    }
  }

  function inferContext(){
    // 1) onboarding
    const ob = getJson(ONBOARDING_KEY);
    _energy = String(ob?.energy || "moyenne").toLowerCase();
    _durationPref = String(ob?.duration || "1-2").toLowerCase();

    // 2) result
    const result = getJson(PRO_RESULT_KEY); // {scores:{...}}
    const scores = (result && typeof result === "object") ? (result.scores || {}) : null;

    let topScore = 0;
    let topName = "";
    _topDomains = [];

    if (scores && typeof scores === "object"){
      const entries = Object.entries(scores).map(([k,v]) => [String(k).toLowerCase(), Number(v||0)]);
      entries.sort((a,b) => (b[1]||0) - (a[1]||0));
      _topDomains = entries.slice(0, 3).filter(e => isFinite(e[1]) && e[1] > 0);
      topName = (_topDomains[0] && _topDomains[0][0]) ? _topDomains[0][0] : "";
      topScore = (_topDomains[0] && _topDomains[0][1]) ? _topDomains[0][1] : 0;
    }

    _band = scoreBand(topScore);

    // choose an auto domain filter (but keep user able to change)
    _domainAuto = topName || "";
    if (fDomain && !fDomain.value){
      // keep default empty; we will set placeholder option label instead
    }

    // preferred variant
    // - if alert OR energy low => short
    // - if good AND energy high => long
    // - else based on onboarding duration pref
    if (_band === "alert" || _energy === "basse") _preferredVariant = "short";
    else if (_band === "good" && _energy === "haute") _preferredVariant = "long";
    else _preferredVariant = (_durationPref === "10") ? "long" : "short";

    // UI badge
    if (bandBadge && bandText){
      bandBadge.classList.remove("good","warn","alert");
      bandBadge.classList.add(_band === "alert" ? "alert" : (_band === "warn" ? "warn" : "good"));

      if (!_topDomains.length){
        bandText.textContent = "Mode général";
        if (kpiMode) kpiMode.textContent = "Général";
        if (kpiModeSub) kpiModeSub.textContent = "Aucun diagnostic local trouvé, recommandations génériques.";
      } else {
        const main = _topDomains[0];
        bandText.textContent = `${main[0]} • ${severityLabel(main[1])}`;
        if (kpiMode) kpiMode.textContent = (_band === "alert") ? "Apaisement" : (_band === "warn" ? "Stabilisation" : "Consolidation");
        if (kpiModeSub) kpiModeSub.textContent = `Basé sur ${main[0]} (score ${main[1]}). Variante par défaut : ${_preferredVariant}.`;
      }
    }

    // tip text
    if (kpiTip){
      if (_band === "alert"){
        kpiTip.innerHTML = "Priorité : <b>apaiser</b>. Choisis 1 variante <b>courte</b>, respiration lente, ancrage, étirement doux.";
      } else if (_band === "warn"){
        kpiTip.innerHTML = "Priorité : <b>stabiliser</b>. Var. courte ou moyenne, mobilité douce + mental simple.";
      } else {
        kpiTip.innerHTML = "Priorité : <b>consolider</b>. Tu peux aller vers une variante <b>longue</b> si tu es dispo.";
      }
    }
  }

  function fillDomainSelect(){
    if (!fDomain) return;
    const set = new Set();
    _list.forEach(x => (x.domains||[]).forEach(d => set.add(d)));
    const domains = Array.from(set).sort();

    // build options
    const current = fDomain.value || "";
    fDomain.innerHTML = "";

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = _domainAuto ? `Domaine (auto: ${_domainAuto})` : "Domaine (auto)";
    fDomain.appendChild(opt0);

    domains.forEach(d => {
      const o = document.createElement("option");
      o.value = d;
      o.textContent = d;
      fDomain.appendChild(o);
    });

    fDomain.value = current;
  }

  // done store
  function getDoneMap(){
    const m = getJson(DONE_KEY);
    return (m && typeof m === "object") ? m : {};
  }
  function setDone(id, payload){
    const map = getDoneMap();
    map[id] = payload;
    setJson(DONE_KEY, map);
    setJson(LAST_KEY, { at: payload.at, id, title: payload.title });
  }
  function isDone(id){
    const map = getDoneMap();
    return !!map[id];
  }

  function pushActivity(type, meta){
    try{
      const list = getJson(ACTIVITY_KEY) || [];
      list.unshift({ type: type || "action", at: nowIso(), meta: meta || {} });
      setJson(ACTIVITY_KEY, list.slice(0, 20));
    }catch{}
  }

  // ---- recommendation engine (simple but effective)
  function scoreForReco(ex){
    let s = 0;

    // domain match
    const domFilter = (fDomain && fDomain.value) ? String(fDomain.value).toLowerCase() : "";
    const autoDom = _domainAuto;

    const targets = domFilter ? [domFilter] : (_topDomains.map(x=>x[0]) || []);
    const hasTargets = targets && targets.length;

    if (hasTargets){
      const hit = targets.some(t => (ex.domains || []).includes(String(t).toLowerCase()));
      if (hit) s += 50;
      // bonus if matches auto main domain
      if (autoDom && (ex.domains || []).includes(autoDom)) s += 12;
    } else {
      // no diag => generic: prefer breathing + anchoring
      if (ex.category === "respiration" || ex.category === "ancrage") s += 25;
    }

    // severity / band preferences
    if (_band === "alert"){
      if (ex.intensity === "low") s += 18;
      if ((ex.tags||[]).includes("apaisement") || (ex.tags||[]).includes("calme")) s += 12;
      if (ex.category === "respiration") s += 10;
      if (ex.category === "cardio") s -= 12;
    } else if (_band === "warn"){
      if (ex.intensity !== "high") s += 10;
      if (ex.category === "mobilite" || ex.category === "yoga") s += 8;
      if (ex.category === "cardio") s -= 4;
    } else {
      // good
      if (ex.category === "cardio") s += 8;
      if (ex.intensity === "med") s += 6;
    }

    // energy preferences
    if (_energy === "basse"){
      if (ex.variants?.short?.sec <= 120) s += 10;
      if (ex.variants?.long?.sec >= 300) s -= 6;
    } else if (_energy === "haute"){
      if (ex.variants?.long?.sec >= 300) s += 8;
    }

    // text search match
    const qq = (q?.value || "").trim().toLowerCase();
    if (qq){
      const hay = (ex.title + " " + ex.desc + " " + (ex.tags||[]).join(" ") + " " + (ex.domains||[]).join(" ")).toLowerCase();
      if (hay.includes(qq)) s += 30;
      else s -= 8;
    }

    // category filter
    const cat = (fCategory && fCategory.value) ? String(fCategory.value).toLowerCase() : "";
    if (cat){
      if (ex.category === cat) s += 20;
      else s -= 40;
    }

    return s;
  }

  function filteredList(){
    let arr = _list.slice();

    // Tab logic
    if (_tab === "done"){
      arr = arr.filter(x => isDone(x.id));
    } else if (_tab === "reco"){
      // keep all but sort strongly, then take top subset after scoring
      // (we'll slice later)
    }

    // Search + filters are handled by scoring (soft), but we still hard-filter a bit
    const cat = (fCategory && fCategory.value) ? String(fCategory.value).toLowerCase() : "";
    if (cat){
      arr = arr.filter(x => x.category === cat);
    }

    // If user selected a domain, hard filter to avoid noise
    const dom = (fDomain && fDomain.value) ? String(fDomain.value).toLowerCase() : "";
    if (dom){
      arr = arr.filter(x => (x.domains || []).includes(dom));
    }

    // Search hard filter only if query >= 3 chars
    const qq = (q?.value || "").trim().toLowerCase();
    if (qq && qq.length >= 3){
      arr = arr.filter(ex => {
        const hay = (ex.title + " " + ex.desc + " " + (ex.tags||[]).join(" ") + " " + (ex.domains||[]).join(" ")).toLowerCase();
        return hay.includes(qq);
      });
    }

    // Sort for reco / all
    arr.sort((a,b) => scoreForReco(b) - scoreForReco(a));

    if (_tab === "reco"){
      // show top 24 max
      arr = arr.slice(0, 24);
    } else {
      // all/done: limit to keep UI fast but still large
      arr = arr.slice(0, 120);
    }

    return arr;
  }

  function chipBandClass(ex){
    // heuristic: if exercise targets alert band, color accordingly; else align with global band
    if (_band === "alert") return "alert";
    if (_band === "warn") return "warn";
    return "good";
  }

  function formatDuration(sec){
    const s = Math.max(0, Number(sec||0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2,"0")}:${String(r).padStart(2,"0")}`;
  }

  function mediaHTML(ex){
    const url = ex.media?.url;
    const poster = ex.media?.poster ? ` poster="${escapeHTML(ex.media.poster)}"` : "";
    if (!url){
      // fallback visual (no media)
      return `<div class="ex-media">
        <img alt="Aperçu" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='675'%3E%3Cdefs%3E%3CradialGradient id='g' cx='20%25' cy='10%25' r='90%25'%3E%3Cstop offset='0' stop-color='%2378a0ff' stop-opacity='.25'/%3E%3Cstop offset='1' stop-color='%23060a14' stop-opacity='1'/%3E%3C/radialGradient%3E%3C/defs%3E%3Crect width='100%25' height='100%25' fill='url(%23g)'/%3E%3Ctext x='50%25' y='50%25' fill='white' fill-opacity='.85' font-family='Arial' font-size='42' text-anchor='middle'%3EExercice%3C/text%3E%3C/svg%3E" />
        <div class="ex-play">▶ Ouvrir</div>
      </div>`;
    }

    const lower = url.toLowerCase();
    const isVideo = lower.endsWith(".mp4") || lower.endsWith(".webm") || lower.includes(".mp4?") || lower.includes(".webm?");
    const isGif = lower.endsWith(".gif") || lower.includes(".gif?");
    if (isVideo){
      return `<div class="ex-media">
        <video muted autoplay loop playsinline${poster}>
          <source src="${escapeHTML(url)}" />
        </video>
        <div class="ex-play">▶ Ouvrir</div>
      </div>`;
    }
    // gif or image
    return `<div class="ex-media">
      <img alt="Aperçu" src="${escapeHTML(url)}" />
      <div class="ex-play">▶ Ouvrir</div>
    </div>`;
  }

  function render(){
    if (!elGrid) return;
    if (!_list.length){
      elGrid.innerHTML = `<div class="pro-emptyState" style="grid-column:1/-1;">
        Aucun exercice affiché. Vérifie que <b>exercices_pro.json</b> est bien à côté de ce fichier.
      </div>`;
      return;
    }

    const arr = filteredList();
    if (!arr.length){
      elGrid.innerHTML = `<div class="pro-emptyState" style="grid-column:1/-1;">
        Aucun résultat avec ces filtres. Essaie d’enlever “catégorie” ou “domaine”.
      </div>`;
      return;
    }

    elGrid.innerHTML = arr.map(ex => {
      const v = (_preferredVariant === "long") ? ex.variants.long : ex.variants.short;
      const sec = v?.sec || 0;
      const done = isDone(ex.id);
      const bandCls = chipBandClass(ex);

      const chips = []
        .concat(ex.level ? [`niveau:${ex.level}`] : [])
        .concat(ex.intensity ? [`intensité:${ex.intensity}`] : [])
        .concat((ex.domains||[]).slice(0,2).map(d => `cible:${d}`))
        .concat((ex.tags||[]).slice(0,3));

      return `
        <article class="ex-cardItem" data-id="${escapeHTML(ex.id)}" tabindex="0" role="button" aria-label="Ouvrir ${escapeHTML(ex.title)}">
          ${mediaHTML(ex)}
          <div class="ex-body">
            <div class="ex-head">
              <h3 class="ex-name">${escapeHTML(ex.title)}</h3>
              <span class="ex-cat">${escapeHTML(ex.category)}</span>
            </div>

            <p class="ex-desc">${escapeHTML(ex.desc || "Exercice guidé avec timer + voix.")}</p>

            <div class="ex-chips">
              ${chips.slice(0,6).map(t => `<span class="ex-chip">${escapeHTML(t)}</span>`).join("")}
            </div>

            <div class="ex-foot">
              <div class="left">
                <span class="ex-mini ${bandCls}">var. ${escapeHTML(_preferredVariant)} • ${escapeHTML(formatDuration(sec))}</span>
                ${ex.contraindications && ex.contraindications.length ? `<span class="ex-mini warn">⚠️ précautions</span>` : ``}
              </div>
              ${done ? `<span class="ex-done">✅ Terminé</span>` : `<span class="ex-mini">▶ Ouvrir</span>`}
            </div>
          </div>
        </article>
      `;
    }).join("");

    // wire cards
    Array.from(elGrid.querySelectorAll(".ex-cardItem")).forEach(card => {
      if (card.dataset.wired === "1") return;
      card.dataset.wired = "1";
      const open = () => openExercise(card.getAttribute("data-id"));
      card.addEventListener("click", open);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " "){
          e.preventDefault();
          open();
        }
      });
    });
  }

  function renderKPIs(){
    const doneMap = getDoneMap();
    const doneCount = Object.keys(doneMap).length;
    if (kpiDone) kpiDone.textContent = String(doneCount);
    if (kpiDoneSub) kpiDoneSub.textContent = "Local • cet appareil";

    const last = getJson(LAST_KEY);
    if (!last){
      if (kpiLast) kpiLast.textContent = "—";
      if (kpiLastSub) kpiLastSub.textContent = "Aucune session";
    } else {
      if (kpiLast) kpiLast.textContent = humanTimeAgo(last.at);
      if (kpiLastSub) kpiLastSub.textContent = `${last.title || "Exercice"} • ${prettyDate(last.at)}`;
    }
  }

  // ===== Modal / player =====
  function closeModal(){
    stopTimer();
    stopSpeech();
    m.root?.classList.remove("is-on");
    document.body.style.overflow = "";
    _current = null;
  }

  function openModal(){
    m.root?.classList.add("is-on");
    document.body.style.overflow = "hidden";
  }

  function stopSpeech(){
    try{
      if ("speechSynthesis" in window){
        window.speechSynthesis.cancel();
      }
    }catch{}
  }

  function speakText(text){
    if (!text) { mToast("Aucun texte voix pour cet exercice."); return; }
    if (!("speechSynthesis" in window)) { mToast("Voix non supportée sur ce navigateur."); return; }

    try{
      stopSpeech();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "fr-FR";
      u.rate = 1.02;
      u.pitch = 1.0;
      u.volume = 1.0;
      window.speechSynthesis.speak(u);
    }catch{
      mToast("Impossible de lancer la voix.");
    }
  }

  function setMedia(ex){
    if (!m.media) return;
    const url = ex.media?.url;
    const poster = ex.media?.poster ? ` poster="${escapeHTML(ex.media.poster)}"` : "";

    if (!url){
      m.media.innerHTML = `<img alt="Aperçu" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='675'%3E%3Cdefs%3E%3CradialGradient id='g' cx='20%25' cy='10%25' r='90%25'%3E%3Cstop offset='0' stop-color='%2378a0ff' stop-opacity='.25'/%3E%3Cstop offset='1' stop-color='%23060a14' stop-opacity='1'/%3E%3C/radialGradient%3E%3C/defs%3E%3Crect width='100%25' height='100%25' fill='url(%23g)'/%3E%3Ctext x='50%25' y='50%25' fill='white' fill-opacity='.85' font-family='Arial' font-size='42' text-anchor='middle'%3EExercice%3C/text%3E%3C/svg%3E" />`;
      return;
    }

    const lower = url.toLowerCase();
    const isVideo = lower.endsWith(".mp4") || lower.endsWith(".webm") || lower.includes(".mp4?") || lower.includes(".webm?");
    if (isVideo){
      m.media.innerHTML = `<video controls playsinline${poster}>
        <source src="${escapeHTML(url)}" />
      </video>`;
      return;
    }
    m.media.innerHTML = `<img alt="Aperçu" src="${escapeHTML(url)}" />`;
  }

  function setSteps(list){
    if (!m.steps) return;
    const steps = safeArr(list).map(s => String(s).trim()).filter(Boolean);
    if (!steps.length){
      m.steps.innerHTML = `<li>Respire calmement, puis suis ton rythme.</li>`;
      return;
    }
    m.steps.innerHTML = steps.map(s => `<li>${escapeHTML(s)}</li>`).join("");
  }

  function pickVariant(ex){
    // start with preferred variant, but ensure it exists
    const want = _preferredVariant;
    if (want === "long" && ex.variants?.long) return "long";
    return "short";
  }

  function applyVariant(ex, variant){
    _variant = variant || "short";
    const v = (_variant === "long") ? ex.variants.long : ex.variants.short;

    // steps + tts fallback
    setSteps(v.steps && v.steps.length ? v.steps : ex.variants.short.steps);
    const sec = Number(v.sec || 0) || 0;

    _timer.totalSec = sec;
    _timer.leftSec = sec;
    _timer.running = false;
    renderTimer();

    if (m.variant) m.variant.textContent = `Variante : ${_variant === "long" ? "Longue" : "Courte"}`;
    if (m.hint) m.hint.textContent = `Durée: ${formatDuration(sec)} • ${_variant === "long" ? "approfondir" : "mode court"}`;
  }

  function renderTimer(){
    if (!m.time) return;
    const sec = Math.max(0, Math.floor(_timer.leftSec || 0));
    const mm = Math.floor(sec / 60);
    const ss = sec % 60;
    m.time.textContent = `${String(mm).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;

    if (m.start) m.start.textContent = _timer.running ? "▶ En cours…" : "▶ Démarrer";
    if (m.pause) m.pause.textContent = _timer.running ? "⏸ Pause" : "⏸ Pause";
  }

  function stopTimer(){
    _timer.running = false;
    if (_timer.t) clearInterval(_timer.t);
    _timer.t = null;
    renderTimer();
  }

  function startTimer(){
    if (!_current) return;
    const total = Number(_timer.totalSec || 0);
    if (!total || total < 5){
      mToast("Timer non configuré pour cet exercice.");
      return;
    }
    if (_timer.running) return;

    _timer.running = true;
    _timer.startedAt = Date.now();

    if (_timer.t) clearInterval(_timer.t);
    _timer.t = setInterval(() => {
      if (!_timer.running) return;
      _timer.leftSec = Math.max(0, _timer.leftSec - 1);
      renderTimer();
      if (_timer.leftSec <= 0){
        stopTimer();
        try{
          navigator.vibrate?.(120);
        }catch{}
        mToast("⏰ Timer terminé. Tu peux valider ✅");
      }
    }, 1000);

    renderTimer();
  }

  function pauseTimer(){
    if (!_timer.running) return;
    _timer.running = false;
    renderTimer();
  }

  function resetTimer(){
    stopTimer();
    _timer.leftSec = _timer.totalSec;
    renderTimer();
    if (m.hint) m.hint.textContent = "Timer réinitialisé";
  }

  function openExercise(id){
    const ex = _list.find(x => x.id === id);
    if (!ex){
      toast("Exercice introuvable.");
      return;
    }
    _current = ex;

    // title + sub
    if (m.title) m.title.textContent = ex.title;
    const sub = [
      ex.category,
      ex.domains && ex.domains.length ? `cibles: ${ex.domains.slice(0,3).join(", ")}` : null,
      ex.tags && ex.tags.length ? `tags: ${ex.tags.slice(0,4).join(", ")}` : null,
    ].filter(Boolean).join(" • ");
    if (m.sub) m.sub.textContent = sub || "—";

    setMedia(ex);

    const v = pickVariant(ex);
    applyVariant(ex, v);

    openModal();

    // activity (optional)
    try{
      pushActivity("home", { label: `Ouverture exercice: ${ex.title}`, from: "exercices" });
    }catch{}
  }

  function markDone(){
    if (!_current) return;
    const ex = _current;
    const payload = {
      at: nowIso(),
      variant: _variant,
      sec: _timer.totalSec || null,
      title: ex.title
    };
    setDone(ex.id, payload);

    try{
      pushActivity("home", { label: `Exercice terminé ✅ ${ex.title} (${_variant})`, from:"exercices" });
    }catch{}

    mToast("✅ Enregistré en local");
    renderKPIs();
    render(); // update cards "done"
  }

  function wireModal(){
    if (!m.root) return;

    m.closeTop?.addEventListener("click", closeModal);
    m.root.addEventListener("click", (e) => {
      if (e.target === m.root) closeModal();
    });

    window.addEventListener("keydown", (e) => {
      const open = m.root.classList.contains("is-on");
      if (!open) return;
      if (e.key === "Escape"){ e.preventDefault(); closeModal(); }
    });

    m.variant?.addEventListener("click", () => {
      if (!_current) return;
      const next = (_variant === "short") ? "long" : "short";
      applyVariant(_current, next);
      mToast(`Variante ${next === "long" ? "longue" : "courte"} sélectionnée`);
    });

    m.speak?.addEventListener("click", () => {
      if (!_current) return;
      const v = (_variant === "long") ? _current.variants.long : _current.variants.short;
      const t = v.tts || _current.variants.short.tts || null;

      // if no explicit tts, build from steps
      let text = t;
      if (!text){
        const steps = safeArr(v.steps && v.steps.length ? v.steps : _current.variants.short.steps);
        if (steps.length){
          text = `${_current.title}. ${steps.map((s,i)=>`Étape ${i+1}. ${s}`).join(" ")}`;
        }
      }
      speakText(text);
    });

    m.start?.addEventListener("click", startTimer);
    m.pause?.addEventListener("click", pauseTimer);
    m.reset?.addEventListener("click", resetTimer);
    m.done?.addEventListener("click", markDone);
  }

  // ---- UI events
  function setTab(name){
    _tab = name;
    tabBtns.forEach(b => b.classList.toggle("active", b.getAttribute("data-tab") === name));
    render();
  }

  function wireUI(){
    btnReload?.addEventListener("click", loadCatalog);

    tabBtns.forEach(b => {
      b.addEventListener("click", () => setTab(b.getAttribute("data-tab")));
    });

    q?.addEventListener("input", () => render());
    fDomain?.addEventListener("change", () => render());
    fCategory?.addEventListener("change", () => render());
  }

  // ---- init
  wireUI();
  wireModal();
  loadCatalog();

  // refresh on focus
  window.addEventListener("focus", () => {
    try{
      inferContext();
      fillDomainSelect();
      render();
      renderKPIs();
    }catch{}
  });

})();