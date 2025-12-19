/* Vivario v1.1 — engine.js (FINAL, 100% fiable avec TON JSON)
   - Lit questions_v1_1.json -> { questions:[...] }
   - Affiche titre + subtitle + compteur
   - Respecte constraints min/max
   - Profile 100% basé sur IDs de réponses (AUCUNE déduction sur texte libre)
   - Scénarios adaptatifs: roots/modules de scenarios_v1_1.json
   - Sauvegarde session: {answers, profile, scenarios} dans localStorage
*/

(() => {
  const STORAGE_KEY = "vivario_session_v1_1";
  const QUESTIONS_URL = "./questions_v1_1.json";
  const SCENARIOS_URL = "./scenarios_v1_1.json";

  // --- UI requis (dans questionnaire.html)
  const elTitle   = document.getElementById("qTitle");
  const elText    = document.getElementById("qText");
  const elSub     = document.getElementById("qSubtitle"); // optionnel (recommandé)
  const elHint    = document.getElementById("qHint");
  const elOptions = document.getElementById("options");
  const elErr     = document.getElementById("err");
  const btnNext   = document.getElementById("btnNext");
  const btnBack   = document.getElementById("btnBack");
  const elCounter = document.getElementById("qCounter");  // optionnel (recommandé)

  let QUESTIONS = [];
  let SCEN = null;

  let currentId = null;
  let history = [];
  let answersRaw = {};     // qid -> { role, values:[ids], labels:[...], qTitle, qText }
  let orderIndex = [];     // qids in order

  // ---------------- utils
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
    const total = orderIndex.length;
    elCounter.textContent = (idx >= 0) ? `Question ${idx + 1} / ${total}` : "";
  }

  function renderQuestion(qid){
    const q = byId(qid);
    if (!q) { setError("Question introuvable : " + qid); return; }

    setError("");
    currentId = String(q.id);

    if (elTitle) elTitle.textContent = q.title || "Question";
    if (elText)  elText.textContent  = q.subtitle ? "" : (q.text || q.question || "");
    if (elSub)   elSub.textContent   = q.subtitle || q.text || q.question || "";

    // hint multi
    const multi = isMulti(q);
    if (elHint) {
      elHint.style.display = multi ? "block" : "none";
      elHint.textContent = multi ? "✅ Tu peux cocher plusieurs réponses." : "";
    }

    // options
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

  // ---------------- selection + constraints
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

    if (n < min) {
      setError(`Choisis au moins ${min} réponse(s).`);
      return false;
    }
    if (n > max) {
      setError(`Choisis au maximum ${max} réponse(s).`);
      return false;
    }
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

  // ---------------- profile 100% fiable (UNIQUEMENT IDs)
  function buildProfile(){
    // helper to get first / array by role
    const getRole = (role) => Object.values(answersRaw).find(a => a.role === role) || null;
    const getRoleValues = (role) => {
      const a = getRole(role);
      return a ? (a.values || []) : [];
    };

    const tone    = getRoleValues("tone")[0] || "indetermine";   // q1
    const themes  = getRoleValues("themes");                      // q2
    const vecu    = getRoleValues("vecu");                        // q3
    const posture = getRoleValues("posture");                     // q4
    const besoin  = getRoleValues("besoin");                      // q5
    const energie = getRoleValues("energie")[0] || "indetermine"; // q6
    const sortie  = getRoleValues("sortie")[0] || "identique";    // q7

    // root dominant (règles FIABLES basées sur tes IDs q4/q7)
    // priorité : sortie -> fatigue -> flou -> protection -> resilience -> clarification
    let root = "clarification";

    if (sortie === "stop" || sortie === "pas_aide") root = "sortie";
    else if (posture.includes("fatigue") || posture.includes("maximum")) root = "fatigue";
    else if (posture.includes("confusion") || posture.includes("melange")) root = "flou";
    else if (posture.includes("protection") || posture.includes("recul")) root = "protection";
    else if (posture.includes("effort") || posture.includes("adaptation")) root = "resilience";
    else if (posture.includes("stabilite") || posture.includes("point")) root = "clarification";

    // tags (pour chips affichage) = union des IDs choisis, rangés par catégories
    const tags = [
      `tone:${tone}`,
      ...themes.map(t => `theme:${t}`),
      ...vecu.map(v => `vecu:${v}`),
      ...posture.map(p => `posture:${p}`),
      ...besoin.map(b => `besoin:${b}`),
      `energie:${energie}`,
      `sortie:${sortie}`,
      `root:${root}`
    ];

    // focus = 1-2 thèmes (ceux cochés en premier, fiable)
    const focus = themes.slice(0, 2);

    return {
      root, tone, themes, focus, vecu, besoin, energie, sortie, tags
    };
  }

  // ---------------- scenarios builder (roots/modules)
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

  function buildScenarioText(profile, variantSeed){
    if (!SCEN) return null;

    const seed = (hashString(JSON.stringify(profile)) ^ variantSeed) >>> 0;
    const max = SCEN?.meta?.max_sentences ?? 9;
    const min = SCEN?.meta?.min_sentences ?? 6;

    const roots = SCEN.roots || {};
    const modules = SCEN.modules || {};

    const rootId = (profile.root && roots[profile.root]) ? profile.root : "clarification";
    const root = roots[rootId];

    const lines = [];

    // root text
    if (root && Array.isArray(root.text)) lines.push(...root.text);

    // opening (selon tone q1)
    const op = modules.openings || {};
    const tone = profile.tone || "indetermine";
    const opPack = op[tone] || op.indetermine || [];
    lines.push(...seededPickMany(opPack, seed ^ 11, 2));

    // themes (q2)
    const th = modules.themes || {};
    profile.themes.forEach((t, i) => {
      if (th[t]) lines.push(...seededPickMany(th[t], seed ^ (31+i), 2));
    });

    // vecu (q3)
    const ve = modules.vecu || {};
    profile.vecu.forEach((v, i) => {
      if (ve[v]) lines.push(seededPick(ve[v], seed ^ (61+i)));
    });

    // needs (q5)
    const ne = modules.needs || {};
    profile.besoin.forEach((b, i) => {
      if (ne[b]) lines.push(seededPick(ne[b], seed ^ (91+i)));
    });

    // energy (q6)
    const en = modules.energy || {};
    if (profile.energie && en[profile.energie]) lines.push(seededPick(en[profile.energie], seed ^ 131));

    // closing
    if (Array.isArray(SCEN.closing)) lines.push(...SCEN.closing);

    // clean + trim
    let out = lines.filter(Boolean);
    if (out.length > max) out = out.slice(0, max);
    while (out.length < min && Array.isArray(SCEN.closing) && SCEN.closing.length) {
      out.push(seededPick(SCEN.closing, seed ^ out.length));
    }

    return out.join("\n\n");
  }

  function buildScenarios(profile){
    const main = buildScenarioText(profile, 0);
    if (!main) return [];

    // plusieurs scénarios : même profil, graines différentes -> variantes réelles mais cohérentes
    const s1 = { title: (SCEN?.roots?.[profile.root]?.title || "Scénario"), text: main };
    const s2 = { title: "Variante — un pas concret", text: buildScenarioText(profile, 777) || main };
    const s3 = { title: "Variante — apaisement", text: buildScenarioText(profile, 1337) || main };

    return [s1, s2, s3];
  }

  // ---------------- session
  function buildSession(profile, scenarios){
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
      scenarios
    };
  }

  function finish(){
    const profile = buildProfile();
    const scenarios = buildScenarios(profile);
    const session = buildSession(profile, scenarios);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    window.location.href = "resultat.html";
  }

  // ---------------- navigation
  function goNext(){
    const q = byId(currentId);
    if (!q) return;

    const values = getSelectedValues(q);

    if (!validateConstraints(q, values)) return;
    if (!saveAnswer(q, values)) { setError("Choisis au moins une réponse pour continuer."); return; }

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

  // ---------------- init
  async function init(){
    try{
      const qRes = await fetch(bust(QUESTIONS_URL), { cache: "no-store" });
      if (!qRes.ok) throw new Error("questions_v1_1.json introuvable (" + qRes.status + ")");
      const qData = await qRes.json();

      // TON FORMAT: { questions:[...] }
      QUESTIONS = Array.isArray(qData.questions) ? qData.questions : (Array.isArray(qData) ? qData : []);
      if (!QUESTIONS.length) throw new Error("questions_v1_1.json: aucune question trouvée");

      orderIndex = QUESTIONS.map(q => String(q.id));

      // scenarios
      try{
        const sRes = await fetch(bust(SCENARIOS_URL), { cache: "no-store" });
        if (sRes.ok) SCEN = await sRes.json();
      }catch(e){ /* non bloquant */ }

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