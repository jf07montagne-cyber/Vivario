/* Vivario v1.1 — engine.js (UNIQUENESS BOOST v2)
   ✅ 4 onglets = 4 scénarios réellement différents
   ✅ Anti-répétitions (tirage unique + dédup finale)
   ✅ Priorités (énergie faible, "multiple", etc.)
   ✅ Combos avancés:
      - theme+theme
      - tone+theme
      - energie+theme
      - posture+theme
      - vecu+theme
      - besoin+theme
      - posture+vecu (optionnel)
*/

(() => {
  const STORAGE_KEY = "vivario_session_v1_1";
  const QUESTIONS_URL = "./questions_v1_1.json";
  const SCENARIOS_URL = "./scenarios_v1_1.json";

  // UI questionnaire
  const elTitle   = document.getElementById("qTitle");
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
        <div><div style="font-weight:650">${opt.label}</div></div>
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

  // Mood audio: basé sur IDs (role:"tone")
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

  // ---------- Profile + priorités (avec tes IDs)
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

    // Root (cohérent avec tes IDs posture/sortie)
    let root = "clarification";
    if (sortie === "stop" || sortie === "pas_aide") root = "sortie";
    else if (posture.includes("fatigue") || posture.includes("maximum")) root = "fatigue";
    else if (posture.includes("confusion") || posture.includes("melange")) root = "flou";
    else if (posture.includes("protection") || posture.includes("recul")) root = "protection";
    else if (posture.includes("effort") || posture.includes("adaptation")) root = "resilience";
    else root = "clarification";

    const themeSet = new Set(themes);
    const postureSet = new Set(posture);
    const vecuSet = new Set(vecu);
    const besoinSet = new Set(besoin);

    const hasMultiple = themeSet.has("multiple");
    const lowEnergy = (energie === "faible");
    const midEnergy = (energie === "parcourir");

    // Focus max 2: multiple prioritaire si présent
    let focus = themes.slice(0, 2);
    if (hasMultiple) {
      focus = ["multiple", ...themes.filter(t => t !== "multiple")].slice(0, 2);
    }

    return {
      root, tone, themes, focus, vecu, posture, besoin, energie, sortie,
      themeSet, postureSet, vecuSet, besoinSet,
      priority: { hasMultiple, lowEnergy, midEnergy }
    };
  }

  function buildFinalMessage(profile){
    const TONE = {
      stable: "Tu sembles plutôt stable aujourd’hui.",
      neutre: "Tu es dans un entre-deux, sans forcément tout nommer.",
      flou: "Il y a du flou, et c’est ok : tu n’as pas à forcer une réponse.",
      charge: "Tu portes beaucoup en ce moment — ça compte de le reconnaître.",
      indetermine: "Tu avances même sans tout définir, et c’est déjà une forme de justesse."
    };

    const end = profile.priority.lowEnergy
      ? "Objectif simple : te préserver. Un pas minuscule suffit."
      : "Tu peux avancer à ton rythme. Un pas minuscule suffit.";

    return [TONE[profile.tone] || TONE.indetermine, end].join("\n\n");
  }

  // ---------- Helpers + anti-doublons
  function hashString(str){
    let h = 2166136261;
    for (let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0);
  }

  function normLine(s){
    return String(s || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[“”"']/g, "'")
      .trim();
  }

  function pickUnique(arr, seed, usedSet){
    if (!Array.isArray(arr) || !arr.length) return null;
    const n = arr.length;

    for (let k = 0; k < Math.min(14, n); k++){
      const idx = (seed + k * 9) % n;
      const candidate = arr[idx];
      const key = normLine(candidate);
      if (!key) continue;
      if (!usedSet.has(key)) {
        usedSet.add(key);
        return candidate;
      }
    }
    for (let i=0;i<n;i++){
      const candidate = arr[i];
      const key = normLine(candidate);
      if (key && !usedSet.has(key)){
        usedSet.add(key);
        return candidate;
      }
    }
    return null;
  }

  function pickUniqueMany(arr, seed, count, usedSet){
    const out = [];
    for (let i=0;i<count;i++){
      const v = pickUnique(arr, (seed ^ (i*1103515245)) >>> 0, usedSet);
      if (v) out.push(v);
    }
    return out;
  }

  function dedupeKeepOrder(lines){
    const seen = new Set();
    const out = [];
    for (const s of (lines || [])) {
      const k = normLine(s);
      if (!k) continue;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(s);
    }
    return out;
  }

  function clampScenario(lines, min, max, closings, seed){
    let out = dedupeKeepOrder(lines);

    if (out.length > max) out = out.slice(0, max);

    const used = new Set(out.map(normLine));
    while (out.length < min && Array.isArray(closings) && closings.length){
      const add = pickUnique(closings, (seed ^ out.length) >>> 0, used);
      if (!add) break;
      out.push(add);
    }

    if (out.length > max) out = out.slice(0, max);
    return out;
  }

  // ---------- Combo engine (BOOST)
  function keyPair(a,b){ return [a,b].sort().join("+"); }

  function addComboPacks(lines, packs, seed, used, want){
    if (!packs.length || want <= 0) return lines;
    const out = lines.slice();

    // insertion stable (après ouverture)
    const insertAt = Math.min(Math.max(3, Math.floor(out.length/3)), 6);

    // petit shuffle seedé
    const sorted = packs.slice().sort((x,y) => (y.weight||0)-(x.weight||0));
    const take = sorted.slice(0, Math.min(want*3, sorted.length));

    let added = 0;
    for (let i=0;i<take.length && added<want;i++){
      const pack = take[i].pack;
      const one = pickUnique(pack, (seed ^ (700 + i*37)) >>> 0, used);
      if (one) {
        out.splice(insertAt + added, 0, one);
        added++;
      }
    }
    return out;
  }

  function collectCombos(profile, modules){
    const combos = modules?.combos || {};
    const packs = [];

    const themes = (profile.themes || []).slice(0, 7);
    const focus = (profile.focus || []).slice(0, 2);
    const post = (profile.posture || []).slice(0, 3);
    const vecu = (profile.vecu || []).slice(0, 2);
    const besoin = (profile.besoin || []).slice(0, 3);

    // theme+theme
    for (let i=0;i<themes.length;i++){
      for (let j=i+1;j<themes.length;j++){
        const k = keyPair(themes[i], themes[j]);
        if (combos[k]) packs.push({ key:k, pack: combos[k], weight: 4 });
      }
    }

    // tone+theme
    themes.slice(0,4).forEach(t=>{
      const k = `tone:${profile.tone}+${t}`;
      if (combos[k]) packs.push({ key:k, pack: combos[k], weight: 3 });
    });

    // energie+theme
    focus.forEach(t=>{
      const k = `energie:${profile.energie}+${t}`;
      if (combos[k]) packs.push({ key:k, pack: combos[k], weight: 3 });
    });

    // posture+theme (gros boost)
    post.forEach(p=>{
      focus.forEach(t=>{
        const k = `posture:${p}+${t}`;
        if (combos[k]) packs.push({ key:k, pack: combos[k], weight: 6 });
      });
    });

    // vecu+theme (boost)
    vecu.forEach(v=>{
      focus.forEach(t=>{
        const k = `vecu:${v}+${t}`;
        if (combos[k]) packs.push({ key:k, pack: combos[k], weight: 5 });
      });
    });

    // besoin+theme (boost)
    besoin.forEach(b=>{
      focus.forEach(t=>{
        const k = `besoin:${b}+${t}`;
        if (combos[k]) packs.push({ key:k, pack: combos[k], weight: 5 });
      });
    });

    // posture+vecu (bonus)
    post.slice(0,2).forEach(p=>{
      vecu.slice(0,1).forEach(v=>{
        const k = `posture:${p}+vecu:${v}`;
        if (combos[k]) packs.push({ key:k, pack: combos[k], weight: 4 });
      });
    });

    // multiple + quelque chose (prioritaire)
    if (profile.themeSet?.has("multiple")){
      const t2 = themes.find(t => t !== "multiple");
      if (t2) {
        const k = keyPair("multiple", t2);
        if (combos[k]) packs.push({ key:k, pack: combos[k], weight: 7 });
      }
    }

    // dédup packs par key
    const seen = new Set();
    return packs.filter(p => {
      if (seen.has(p.key)) return false;
      seen.add(p.key);
      return true;
    });
  }

  // ---------- Scénario builder (4 variantes)
  function buildScenario(profile, variantKey){
    if (!SCEN) return null;

    const seedBase = hashString(JSON.stringify(profile)) >>> 0;
    const seed = (seedBase ^ hashString(variantKey)) >>> 0;

    const max = SCEN?.meta?.max_sentences ?? 13;
    const min = SCEN?.meta?.min_sentences ?? 8;

    const roots = SCEN.roots || {};
    const modules = SCEN.modules || {};
    const closings = modules?.closings?.soft || [];

    const used = new Set();
    const lines = [];

    const rootId = (profile.root && roots[profile.root]) ? profile.root : "clarification";
    const root = roots[rootId];

    // Root (2)
    if (root && Array.isArray(root.text)) {
      lines.push(...pickUniqueMany(root.text, seed ^ 1, 2, used));
    }

    // Openings (1-2 selon énergie)
    const op = modules.openings || {};
    const opPack = op[profile.tone] || op.indetermine || [];
    const openingCount = profile.priority.lowEnergy ? 1 : 2;
    lines.push(...pickUniqueMany(opPack, seed ^ 11, openingCount, used));

    // ✅ BOOST: combos avancés injectés tôt
    const comboPacks = collectCombos(profile, modules);
    const wantCombos = profile.priority.hasMultiple ? 2 : 1;
    const withCombos = addComboPacks(lines, comboPacks, seed, used, wantCombos);

    const out = withCombos.slice();

    // Themes (1-2) selon variante/énergie
    const th = modules.themes || {};
    const source = (profile.focus && profile.focus.length) ? profile.focus : (profile.themes || []);
    let themeCount = 2;
    if (profile.priority.lowEnergy) themeCount = 1;
    if (variantKey !== "main") themeCount = 1;

    source.slice(0, themeCount).forEach((t, i) => {
      if (th[t]) out.push(...pickUniqueMany(th[t], seed ^ (31+i), 2, used));
    });

    // Posture (1) — ajoute une phrase posture spécifique
    const po = modules.posture || {};
    (profile.posture || []).slice(0,1).forEach((p,i)=>{
      if (po[p]) {
        const one = pickUnique(po[p], seed ^ (41+i), used);
        if (one) out.push(one);
      }
    });

    // Vécu (1)
    const ve = modules.vecu || {};
    (profile.vecu || []).slice(0,1).forEach((v, i) => {
      if (ve[v]) {
        const one = pickUnique(ve[v], seed ^ (61+i), used);
        if (one) out.push(one);
      }
    });

    // Besoin (1)
    const ne = modules.needs || {};
    (profile.besoin || []).slice(0,1).forEach((b, i) => {
      if (ne[b]) {
        const one = pickUnique(ne[b], seed ^ (91+i), used);
        if (one) out.push(one);
      }
    });

    // Energy (1)
    const en = modules.energy || {};
    if (profile.energie && en[profile.energie]) {
      const one = pickUnique(en[profile.energie], seed ^ 131, used);
      if (one) out.push(one);
    }

    // Variant signature (2) garantissent 4 onglets différents
    const variantPack = modules?.variants?.[variantKey] || [];
    const variantLines = pickUniqueMany(variantPack, seed ^ 999, 2, used);

    // placement différent selon onglet
    let composed = [];
    if (variantKey === "main") composed = [...out.slice(0, 4), ...variantLines, ...out.slice(4)];
    else if (variantKey === "step") composed = [...out.slice(0, 5), ...variantLines, ...out.slice(5)];
    else if (variantKey === "calm") composed = [...out.slice(0, 3), ...variantLines, ...out.slice(3)];
    else if (variantKey === "norm") composed = [...out.slice(0, 4), ...variantLines, ...out.slice(4)];
    else composed = [...out, ...variantLines];

    // Closing (1)
    if (closings.length) {
      const one = pickUnique(closings, seed ^ 177, used);
      if (one) composed.push(one);
    }

    // Clamp + fill
    const finalLines = clampScenario(composed, min, max, closings, seed);
    return finalLines.join("\n\n");
  }

  function buildScenarios(profile){
    const main = buildScenario(profile, "main");
    if (!main) return [];

    const rootTitle = (SCEN?.roots?.[profile.root]?.title || "Juste pour toi");

    return [
      { key: "main", title: rootTitle, text: main },
      { key: "step", title: "Un pas concret", text: buildScenario(profile, "step") || main },
      { key: "calm", title: "Apaisement", text: buildScenario(profile, "calm") || main },
      { key: "norm", title: "Normalisation", text: buildScenario(profile, "norm") || main }
    ];
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