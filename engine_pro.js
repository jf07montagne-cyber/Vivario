/* Vivario PRO — engine_pro.js
   ✅ Logique adaptative (show_if / set_vars / scoring)
   ✅ Multi-thèmes => packs affichés sans refaire le questionnaire
   ✅ Intensité par thème => profondeur variable
   ✅ Stockage séparé du gratuit
*/
(() => {
  const STORAGE_KEY = "vivario_session_pro_v1";
  const QUESTIONS_URL = "./questions_pro_v1.json";

  const KEY_COACH = "vivario_coach_soft"; // on réutilise le même switch
  const KEY_USER  = "vivario_user_id";    // même user id persistant

  const elTitle   = document.getElementById("qTitle");
  const elSub     = document.getElementById("qSubtitle");
  const elHint    = document.getElementById("qHint");
  const elOptions = document.getElementById("options");
  const elErr     = document.getElementById("err");
  const btnNext   = document.getElementById("btnNext");
  const btnBack   = document.getElementById("btnBack");
  const elCounter = document.getElementById("qCounter");

  const coachInput =
    document.getElementById("coachSoft") ||
    document.querySelector("[data-coach-soft]");

  let QUESTIONS = [];
  let currentId = null;

  // history = ids réellement posés (visibles)
  let history = [];
  let answersRaw = {};

  // vars = cerveau adaptatif
  const vars = {
    selectedThemes: [],
    intensity: {},   // intensity[theme] = 1..4
    lowEnergy: false,
    countHighThemes: 0,
    topThemes: [],
    flags: {},
    scores: { global: 0, theme: {} }
  };

  function setError(msg){ if (elErr) elErr.textContent = msg || ""; }

  function ensureUserId(){
    try{
      let id = localStorage.getItem(KEY_USER);
      if (id && id.length > 6) return id;
      id = "u_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
      localStorage.setItem(KEY_USER, id);
      return id;
    }catch{
      return "u_fallback";
    }
  }
  const USER_ID = ensureUserId();

  const bust = (url) => url + (url.includes("?") ? "&" : "?") + "v=" + Date.now();
  const byId = (id) => QUESTIONS.find(q => String(q.id) === String(id)) || null;

  function isMulti(q){
    const t = String(q.type || "").toLowerCase();
    return t === "multi" || t === "checkbox" || t === "multiple" || q.multiple === true;
  }

  function normalizeOptions(q){
    const raw = q.options || [];
    return raw.map(o => ({
      id: String(o.id ?? o.value ?? o.key ?? ""),
      label: String(o.label ?? o.text ?? o.title ?? o.id ?? "")
    }));
  }

  function renderCounter(){
    if (!elCounter || !currentId) return;

    // compteur “intelligent”: seulement les questions visibles restantes
    const visibleIds = QUESTIONS
      .map(q => String(q.id))
      .filter(id => isVisible(id));

    const idx = visibleIds.indexOf(String(currentId));
    const total = visibleIds.length || 0;
    elCounter.textContent = (idx >= 0 && total) ? `Question ${idx + 1} / ${total}` : "";
  }

  function markSelectedStyles(){
    if (!elOptions) return;
    const rows = [...elOptions.querySelectorAll(".option")];
    rows.forEach(row => {
      const input = row.querySelector("input");
      row.classList.toggle("is-selected", !!input?.checked);
    });
  }

  // ---------- ADAPTATIVE CORE ----------

  function getVar(path){
    const p = String(path || "").trim();
    if (!p) return undefined;

    // support "intensity.addiction", "flags.addiction_high"
    const parts = p.split(".");
    let cur = vars;
    for (const k of parts){
      if (cur && typeof cur === "object" && k in cur) cur = cur[k];
      else return undefined;
    }
    return cur;
  }

  function evalCond(cond){
    if (!cond) return true;
    if (typeof cond !== "object") return !!cond;

    if (cond.all && Array.isArray(cond.all)) return cond.all.every(evalCond);
    if (cond.any && Array.isArray(cond.any)) return cond.any.some(evalCond);
    if (cond.not) return !evalCond(cond.not);

    const v = getVar(cond.var);

    if ("eq" in cond) return v === cond.eq;
    if ("neq" in cond) return v !== cond.neq;
    if ("gte" in cond) return (typeof v === "number") && v >= cond.gte;
    if ("lte" in cond) return (typeof v === "number") && v <= cond.lte;

    if ("includes" in cond) {
      if (Array.isArray(v)) return v.includes(cond.includes);
      if (typeof v === "string") return v.includes(cond.includes);
      return false;
    }

    return true;
  }

  function isVisible(qid){
    const q = byId(qid);
    if (!q) return false;
    if (!q.show_if) return true;
    return evalCond(q.show_if);
  }

  function recomputeDerived(){
    // lowEnergy (si energie faible OU si capacité mentale très basse si tu ajoutes un item)
    const energie = answersRaw["p2"]?.values?.[0] || ""; // p2 dans JSON PRO
    vars.lowEnergy = (energie === "faible");

    // countHighThemes
    const entries = Object.entries(vars.intensity || {});
    const high = entries.filter(([,n]) => typeof n === "number" && n >= 3);
    vars.countHighThemes = high.length;

    // topThemes (tri desc intensité)
    vars.topThemes = entries
      .filter(([,n]) => typeof n === "number")
      .sort((a,b) => (b[1]-a[1]))
      .map(([k]) => k)
      .slice(0, 3);
  }

  function applySetVars(q, values){
    const sv = q.set_vars || null;
    if (!sv || typeof sv !== "object") return;

    const first = values?.[0];

    for (const k of Object.keys(sv)){
      const rule = sv[k];
      if (!rule || typeof rule !== "object") continue;

      if (rule.fromAnswer === true) {
        // copie values[] (utile pour selectedThemes)
        assignVar(k, values.slice());
        continue;
      }

      if (rule.fromAnswerNumber === true) {
        const num = Number(first);
        if (!Number.isNaN(num)) assignVar(k, num);
        continue;
      }

      if (Array.isArray(rule.whenAnswerIn)) {
        const ok = rule.whenAnswerIn.includes(first);
        assignVar(k, !!ok);
        continue;
      }

      if (rule.compute === "lowEnergy") {
        // recalcul ensuite
        continue;
      }
    }
  }

  function assignVar(path, val){
    const parts = String(path).split(".");
    let cur = vars;
    for (let i=0; i<parts.length; i++){
      const key = parts[i];
      if (i === parts.length-1){
        cur[key] = val;
      }else{
        if (!cur[key] || typeof cur[key] !== "object") cur[key] = {};
        cur = cur[key];
      }
    }
  }

  function applyScoring(q, values){
    const s = q.score || null;
    if (!s || typeof s !== "object") return;

    // global
    if (typeof s.global === "number") vars.scores.global += s.global;

    // theme.<name>
    for (const key of Object.keys(s)){
      if (!key.startsWith("theme.")) continue;
      const theme = key.slice("theme.".length);
      const add = Number(s[key]);
      if (Number.isNaN(add)) continue;
      vars.scores.theme[theme] = (vars.scores.theme[theme] || 0) + add;
    }
  }

  // ---------- RENDER / NAV ----------

  function renderQuestion(qid){
    const q = byId(qid);
    if (!q) { setError("Question introuvable : " + qid); return; }

    setError("");
    currentId = String(q.id);

    if (elTitle) elTitle.textContent = q.title || "Question";
    if (elSub)   elSub.textContent   = q.subtitle || "";

    const multi = isMulti(q);
    if (elHint) {
      elHint.style.display = multi ? "block" : "none";
      elHint.textContent = multi ? "✅ Tu peux cocher plusieurs réponses." : "";
    }

    if (!elOptions) return;
    elOptions.innerHTML = "";

    const opts = normalizeOptions(q);
    const saved = answersRaw[String(q.id)];
    const savedValues = saved ? (saved.values || []) : [];

    opts.forEach(opt => {
      const row = document.createElement("label");
      row.className = "option";

      const type = multi ? "checkbox" : "radio";
      const name = "q_" + String(q.id);
      const checked = savedValues.includes(opt.id);

      row.innerHTML = `
        <input type="${type}" name="${name}" value="${opt.id}" ${checked ? "checked" : ""}>
        <span class="label">${opt.label}</span>
      `;

      row.addEventListener("click", () => setTimeout(markSelectedStyles, 0), { passive:true });
      elOptions.appendChild(row);
    });

    markSelectedStyles();
    renderCounter();
  }

  function getSelectedValues(q){
    const multi = isMulti(q);
    const inputs = elOptions ? [...elOptions.querySelectorAll("input")] : [];
    if (!inputs.length) return [];

    if (!multi) {
      const r = inputs.find(i => i.checked);
      return r ? [String(r.value)] : [];
    }
    return inputs.filter(i => i.checked).map(i => String(i.value));
  }

  function validateConstraints(q, values){
    const c = q.constraints || null;
    if (!c) return true;

    const n = values.length;
    const min = (typeof c.min === "number") ? c.min : 0;
    const max = (typeof c.max === "number") ? c.max : Infinity;

    if (n < min) { setError(`Choisis au moins ${min} réponse(s).`); return false; }
    if (n > max) { setError(`Choisis au maximum ${max} réponse(s).`); return false; }
    return true;
  }

  function saveAnswer(q, values){
    if (!values.length) return false;

    const opts = normalizeOptions(q);
    const labels = values.map(v => opts.find(o => o.id === v)?.label || v);

    answersRaw[String(q.id)] = {
      qid: String(q.id),
      role: String(q.role || ""),
      qTitle: String(q.title || ""),
      qSubtitle: String(q.subtitle || ""),
      values: values.slice(),
      labels: labels.slice()
    };
    return true;
  }

  function nextVisibleAfter(qid){
    const idx = QUESTIONS.findIndex(q => String(q.id) === String(qid));
    for (let i=idx+1; i<QUESTIONS.length; i++){
      const id = String(QUESTIONS[i].id);
      if (isVisible(id)) return id;
    }
    return null;
  }

  function prevFromHistory(){
    if (!history.length) return null;
    return history.pop();
  }

  function buildProfile(){
    // tags propres, pro
    const coach = (localStorage.getItem(KEY_COACH) === "1") ? "soft" : "neutral";
    const tags = [];

    tags.push(`user:${USER_ID}`);
    tags.push(`coach:${coach}`);
    for (const t of (vars.selectedThemes || [])) tags.push(`theme:${t}`);
    for (const [k,v] of Object.entries(vars.intensity || {})) tags.push(`intensity:${k}:${v}`);
    if (vars.lowEnergy) tags.push(`flag:low_energy`);
    for (const [k,v] of Object.entries(vars.flags || {})) if (v) tags.push(`flag:${k}`);

    // root simple (réutilise ta logique gratuite)
    let root = "clarification";
    const hasFatigue = (vars.lowEnergy || false) || !!vars.flags.high_distress;
    const high = vars.countHighThemes >= 2;

    if (vars.flags.stop || vars.flags.pas_aide) root = "sortie";
    else if (hasFatigue) root = "fatigue";
    else if (vars.flags.flou) root = "flou";
    else if (vars.flags.protection) root = "protection";
    else if (high) root = "resilience";

    return {
      version: "pro_v1",
      userId: USER_ID,
      coach,
      root,
      selectedThemes: vars.selectedThemes,
      intensity: vars.intensity,
      topThemes: vars.topThemes,
      countHighThemes: vars.countHighThemes,
      lowEnergy: vars.lowEnergy,
      flags: vars.flags,
      scores: vars.scores,
      tags
    };
  }

  function finish(){
    recomputeDerived();

    const profile = buildProfile();
    const answers = QUESTIONS
      .map(q => answersRaw[String(q.id)])
      .filter(Boolean)
      .map(a => ({
        id: a.qid,
        role: a.role,
        question: a.qTitle,
        subtitle: a.qSubtitle,
        answer: (a.labels || []).join(", "),
        values: a.values || []
      }));

    const session = {
      version: "pro_v1",
      createdAt: new Date().toISOString(),
      profile,
      answers
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));

    // page résultat PRO séparée (ne touche pas resultat.html)
    window.location.href = "resultat_pro.html?v=18";
  }

  function goNext(){
    const q = byId(currentId);
    if (!q) return;

    const values = getSelectedValues(q);
    if (!validateConstraints(q, values)) return;
    if (!saveAnswer(q, values)) { setError("Choisis au moins une réponse pour continuer."); return; }

    // appli vars + score
    applySetVars(q, values);

    // synchronise selectedThemes + intensity si questions dédiées
    if (String(q.role) === "themes") {
      vars.selectedThemes = values.slice();
    }
    if (String(q.role) === "theme_intensity") {
      // convention: id "p5_<theme>_intensity"
      const m = String(q.id).match(/^p5_([a-z0-9_]+)_intensity$/i);
      if (m) {
        const theme = m[1];
        const n = Number(values[0]);
        if (!Number.isNaN(n)) vars.intensity[theme] = n;
      }
    }

    applyScoring(q, values);
    recomputeDerived();

    // navigation adaptative
    setError("");
    const next = nextVisibleAfter(q.id);
    if (!next) return finish();

    history.push(String(q.id));
    renderQuestion(next);
  }

  function goBack(){
    const prev = prevFromHistory();
    if (!prev) return;
    renderQuestion(prev);
  }

  function setupCoachSwitch(){
    if (!coachInput) return;

    // défaut ON si jamais défini
    if (localStorage.getItem(KEY_COACH) === null) {
      localStorage.setItem(KEY_COACH, "1");
    }
    const isSoft = localStorage.getItem(KEY_COACH) === "1";
    coachInput.checked = !!isSoft;

    coachInput.addEventListener("change", () => {
      localStorage.setItem(KEY_COACH, coachInput.checked ? "1" : "0");
    });
  }

  async function init(){
    try{
      setupCoachSwitch();

      const qRes = await fetch(bust(QUESTIONS_URL), { cache: "no-store" });
      if (!qRes.ok) throw new Error("questions_pro_v1.json introuvable (" + qRes.status + ")");
      const qData = await qRes.json();

      QUESTIONS = Array.isArray(qData.questions) ? qData.questions : (Array.isArray(qData) ? qData : []);
      if (!QUESTIONS.length) throw new Error("questions_pro_v1.json: aucune question trouvée");

      // première question visible
      const first = QUESTIONS.find(q => isVisible(q.id));
      if (!first) throw new Error("Aucune question visible au démarrage.");
      renderQuestion(String(first.id));

      btnNext && btnNext.addEventListener("click", goNext);
      btnBack && btnBack.addEventListener("click", goBack);

    } catch(e){
      setError("Erreur : " + e.message);
      if (elTitle) elTitle.textContent = "Impossible de charger le questionnaire PRO";
      if (elSub) elSub.textContent = "Vérifie que questions_pro_v1.json est bien à la racine.";
      if (elOptions) elOptions.innerHTML = "";
      if (elHint) elHint.style.display = "none";
    }
  }

  init();
})();