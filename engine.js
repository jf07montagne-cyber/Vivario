/* Vivario v1.1 — engine.js (FINAL + moods + 4 variantes FIX)
   - Garantit 4 scénarios différents (onglets) en réservant des phrases dédiées par variante
   - Empêche le "slice" de couper les phrases variant
*/

(() => {
  const STORAGE_KEY = "vivario_session_v1_1";
  const QUESTIONS_URL = "./questions_v1_1.json";
  const SCENARIOS_URL = "./scenarios_v1_1.json";

  const elTitle   = document.getElementById("qTitle");
  const elText    = document.getElementById("qText");
  const elSub     = document.getElementById("qSubtitle");
  const elHint    = document.getElementById("qHint");
  const elOptions = document.getElementById("options");
  const elErr     = document.getElementById("err");
  const btnNext   = document.getElementById("btnNext");
  const btnBack   = document.getElementById("btnBack");
  const elCounter = document.getElementById("qCounter");

  let QUESTIONS = [];
  let SCEN = null;

  let currentId = null;
  let history = [];
  let answersRaw = {};
  let orderIndex = [];

  const bust = (url) => url + (url.includes("?") ? "&" : "?") + "v=" + Date.now();
  const byId = (id) => QUESTIONS.find(q => String(q.id) === String(id)) || null;

  function setError(msg){ if (elErr) elErr.textContent = msg || ""; }

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
    const idx = orderIndex.indexOf(String(currentId));
    const total = orderIndex.length || 0;
    elCounter.textContent = (idx >= 0 && total) ? `Question ${idx + 1} / ${total}` : "";
  }

  function renderQuestion(qid){
    const q = byId(qid);
    if (!q) { setError("Question introuvable : " + qid); return; }

    setError("");
    currentId = String(q.id);

    if (elTitle) elTitle.textContent = q.title || "Question";
    if (elText)  elText.textContent  = "";
    if (elSub)   elSub.textContent   = q.subtitle || q.text || q.question || "";

    const multi = isMulti(q);
    if (elHint) {
      elHint.style.display = multi ? "block" : "none";
      elHint.textContent = multi ? "✅ Tu peux cocher plusieurs réponses." : "";
    }

    elOptions.innerHTML = "";
    const opts = normalizeOptions(q);

    const saved = answersRaw[String(q.id)];
    const savedValues = saved ? (saved.values || []) : [];

    opts.forEach(opt => {
      const row = document.createElement("label");
      row.className = "opt";

      const type = multi ? "checkbox" : "radio";
      const name = "q_" + String(q.id);
      const checked = savedValues.includes(opt.id);

      row.innerHTML = `
        <input type="${type}" name="${name}" value="${opt.id}" ${checked ? "checked" : ""}>
        <div><div style="font-weight:600">${opt.label}</div></div>
      `;
      elOptions.appendChild(row);
    });

    renderCounter();
  }

  function getSelectedValues(q){
    const multi = isMulti(q);
    const inputs = [...elOptions.querySelectorAll("input")];
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

  function nextByOrder(qid){
    const idx = orderIndex.indexOf(String(qid));
    if (idx >= 0 && idx < orderIndex.length - 1) return orderIndex[idx + 1];
    return null;
  }

  // -------------------------------
  // Mood audio: basé sur IDs (role:"tone")
  // -------------------------------
  function applyMoodFromAnswer(q, values){
    if (!q || !values || !values.length) return;
    if (String(q.role || "") !== "tone") return;

    const v = String(values[0] || "").toLowerCase();
    let mood = "calm";
    if (v.includes("charge")) mood = "deep";
    else if (v.includes("flou")) mood = "focus";
    else if (v.includes("neutre")) mood = "focus";
    else if (v.includes("stable")) mood = "ocean";

    window.VivarioSound?.setMood?.(mood);
  }

  function buildProfile(){
    const getRole = (role) => Object.values(answersRaw).find(a => a.role === role) || null;
    const getRoleValues = (role) => {
      const a = getRole(role);
      return a ? (a.values || []) : [];
    };

    const tone    = getRoleValues("tone")[0] || "indetermine";
    const themes  = getRoleValues("themes");
    const vecu    = getRoleValues("vecu");
    const posture = getRoleValues("posture");
    const besoin  = getRoleValues("besoin");
    const energie = getRoleValues("energie")[0] || "indetermine";
    const sortie  = getRoleValues("sortie")[0] || "identique";

    let root = "clarification";
    if (sortie === "stop" || sortie === "pas_aide") root = "sortie";
    else if (posture.includes("fatigue") || posture.includes("maximum")) root = "fatigue";
    else if (posture.includes("confusion") || posture.includes("melange")) root = "flou";
    else if (posture.includes("protection") || posture.includes("recul")) root = "protection";
    else if (posture.includes("effort") || posture.includes("adaptation")) root = "resilience";
    else if (posture.includes("stabilite") || posture.includes("point")) root = "clarification";

    const focus = themes.slice(0, 2);
    return { root, tone, themes, focus, vecu, besoin, energie, sortie };
  }

  function buildFinalMessage(profile){
    const TONE = {
      stable: "Tu sembles plutôt stable aujourd’hui.",
      neutre: "Tu es dans un entre-deux, sans forcément tout nommer.",
      flou: "Il y a du flou, et c’est ok : tu n’as pas à forcer une réponse.",
      charge: "Tu portes beaucoup en ce moment — ça compte de le reconnaître.",
      indetermine: "Tu avances même sans tout définir, et c’est déjà une forme de justesse."
    };

    const themeLabel = (id) => ({
      travail: "le travail/études",
      finances: "les finances",
      couple: "le couple",
      famille: "la famille",
      enfants: "les enfants/la parentalité",
      amis: "le lien social",
      sante: "la santé",
      addiction: "une habitude difficile",
      evenement: "un événement récent",
      multiple: "plusieurs choses en même temps",
      rien_de_precis: "un besoin de faire le point",
      preferer_pas: "quelque chose que tu gardes pour toi"
    }[id] || id);

    const focus = (profile.focus || []).map(themeLabel).filter(Boolean);
    let focusLine = "";
    if (focus.length === 1) focusLine = `Aujourd’hui, ton attention se tourne surtout vers ${focus[0]}.`;
    if (focus.length === 2) focusLine = `Aujourd’hui, ton attention se tourne surtout vers ${focus[0]} et ${focus[1]}.`;
    if (!focus.length) focusLine = "Aujourd’hui, l’important est juste de te situer.";

    return [
      TONE[profile.tone] || TONE.indetermine,
      focusLine,
      "Tu peux avancer à ton rythme. Un pas minuscule suffit."
    ].join("\n\n");
  }

  // -------- seeded helpers
  function hashString(str){
    let h = 2166136261;
    for (let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0);
  }
  function seededPick(arr, seed){
    if (!Array.isArray(arr) || !arr.length) return null;
    return arr[seed % arr.length];
  }
  function seededPickMany(arr, seed, n){
    if (!Array.isArray(arr) || !arr.length) return [];
    const out = [];
    let s = seed >>> 0;
    for (let i=0;i<n;i++){
      out.push(arr[s % arr.length]);
      s = (s * 1103515245 + 12345) >>> 0;
    }
    return out;
  }

  // ✅ Clamp intelligent: garde toujours les "variantLines"
  function clampWithVariant(lines, variantLines, min, max){
    const core = lines.filter(Boolean);
    const v = (variantLines || []).filter(Boolean);

    // Si trop long : on coupe le core mais on garde toujours v
    while (core.length + v.length > max && core.length > 0) {
      core.pop();
    }

    let out = [...core, ...v];

    // Si encore trop long (variant énorme) : coupe variant en dernier recours
    if (out.length > max) out = out.slice(0, max);

    // Remonte au min en répétant des closings si possible (géré plus bas)
    return out;
  }

  function buildScenarioLines(profile, variantKey){
    if (!SCEN) return null;

    const seedBase = hashString(JSON.stringify(profile)) >>> 0;
    const seed = (seedBase ^ hashString(variantKey)) >>> 0;

    const max = SCEN?.meta?.max_sentences ?? 12;
    const min = SCEN?.meta?.min_sentences ?? 7;

    const roots = SCEN.roots || {};
    const modules = SCEN.modules || {};

    const rootId = (profile.root && roots[profile.root]) ? profile.root : "clarification";
    const root = roots[rootId];

    const lines = [];

    // Root
    if (root && Array.isArray(root.text)) lines.push(...root.text);

    // Openings (2)
    const op = modules.openings || {};
    const tone = profile.tone || "indetermine";
    const opPack = op[tone] || op.indetermine || [];
    lines.push(...seededPickMany(opPack, seed ^ 11, 2));

    // Themes (jusqu’à 2, mais en variantes on peut réduire pour laisser place)
    const th = modules.themes || {};
    const themeCount = (variantKey === "norm") ? 1 : 2;
    (profile.themes || []).slice(0, themeCount).forEach((t, i) => {
      if (th[t]) lines.push(...seededPickMany(th[t], seed ^ (31+i), 2));
    });

    // Vécu (1..2)
    const ve = modules.vecu || {};
    const vecuCount = (variantKey === "calm") ? 1 : 2;
    (profile.vecu || []).slice(0, vecuCount).forEach((v, i) => {
      if (ve[v]) lines.push(seededPick(ve[v], seed ^ (61+i)));
    });

    // Besoins (1..2)
    const ne = modules.needs || {};
    const needCount = (variantKey === "step") ? 1 : 2;
    (profile.besoin || []).slice(0, needCount).forEach((b, i) => {
      if (ne[b]) lines.push(seededPick(ne[b], seed ^ (91+i)));
    });

    // Energy (1)
    const en = modules.energy || {};
    if (profile.energie && en[profile.energie]) lines.push(seededPick(en[profile.energie], seed ^ 131));

    // Closing base (1)
    const cl = modules.closings || {};
    if (Array.isArray(cl.soft)) lines.push(seededPick(cl.soft, seed ^ 177));

    // ✅ Variant lines GARANTIES (2 lignes)
    const variants = modules.variants || {};
    const variantPack = variants[variantKey] || [];
    const variantLines = seededPickMany(variantPack, seed ^ 999, 2);

    // Clamp intelligent
    let out = clampWithVariant(lines, variantLines, min, max);

    // Si trop court -> ajoute closings
    while (out.length < min && Array.isArray(cl.soft) && cl.soft.length) {
      out.push(seededPick(cl.soft, seed ^ out.length));
    }

    // sécurité
    if (out.length > max) out = out.slice(0, max);

    return out;
  }

  function buildScenarioText(profile, variantKey){
    const lines = buildScenarioLines(profile, variantKey);
    if (!lines) return null;
    return lines.filter(Boolean).join("\n\n");
  }

  function buildScenarios(profile){
    const main = buildScenarioText(profile, "main");
    if (!main) return [];

    const rootTitle = (SCEN?.roots?.[profile.root]?.title || "Juste pour toi");

    const s1 = { key:"main", title: rootTitle, text: main };
    const s2 = { key:"step", title: "Un pas concret", text: buildScenarioText(profile, "step") || main };
    const s3 = { key:"calm", title: "Apaisement", text: buildScenarioText(profile, "calm") || main };
    const s4 = { key:"norm", title: "Normalisation", text: buildScenarioText(profile, "norm") || main };

    return [s1, s2, s3, s4];
  }

  function buildSession(profile, scenarios, finalMessage){
    const answers = orderIndex
      .map(id => answersRaw[id])
      .filter(Boolean)
      .map(a => ({
        id: a.qid,
        role: a.role,
        question: a.qTitle || "",
        subtitle: a.qSubtitle || "",
        answer: (a.labels || []).join(", "),
        values: a.values || []
      }));

    return {
      version: "1.1",
      createdAt: new Date().toISOString(),
      profile,
      answers,
      scenarios,
      finalMessage
    };
  }

  function finish(){
    window.VivarioSound?.setMood?.("deep");

    const profile = buildProfile();
    const scenarios = buildScenarios(profile);
    const finalMessage = buildFinalMessage(profile);

    const session = buildSession(profile, scenarios, finalMessage);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    window.location.href = "resultat.html";
  }

  function goNext(){
    const q = byId(currentId);
    if (!q) return;

    const values = getSelectedValues(q);
    if (!validateConstraints(q, values)) return;
    if (!saveAnswer(q, values)) { setError("Choisis au moins une réponse pour continuer."); return; }

    applyMoodFromAnswer(q, values);

    setError("");
    const next = nextByOrder(q.id);
    if (!next) return finish();

    history.push(String(q.id));
    renderQuestion(next);
  }

  function goBack(){
    if (!history.length) return;
    const prev = history.pop();
    renderQuestion(prev);
  }

  async function init(){
    try{
      const qRes = await fetch(bust(QUESTIONS_URL), { cache: "no-store" });
      if (!qRes.ok) throw new Error("questions_v1_1.json introuvable (" + qRes.status + ")");
      const qData = await qRes.json();

      QUESTIONS = Array.isArray(qData.questions) ? qData.questions : (Array.isArray(qData) ? qData : []);
      if (!QUESTIONS.length) throw new Error("questions_v1_1.json: aucune question trouvée");

      orderIndex = QUESTIONS.map(q => String(q.id));

      try{
        const sRes = await fetch(bust(SCENARIOS_URL), { cache: "no-store" });
        if (sRes.ok) SCEN = await sRes.json();
      }catch(e){}

      renderQuestion(orderIndex[0]);

      if (btnNext) btnNext.addEventListener("click", goNext);
      if (btnBack) btnBack.addEventListener("click", goBack);

    }catch(e){
      setError("Erreur : " + e.message);
      if (elTitle) elTitle.textContent = "Impossible de charger le questionnaire";
      if (elSub) elSub.textContent = "Vérifie que questions_v1_1.json est bien à la racine.";
      if (elOptions) elOptions.innerHTML = "";
      if (elHint) elHint.style.display = "none";
    }
  }

  init();
})();