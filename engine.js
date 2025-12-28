/* Vivario v1.1 — engine.js (FIX PRO)
   ✅ Corrige répétitions (tirage sans doublons + dédup finale)
   ✅ 4 variantes réellement différentes (structure + priorité)
   ✅ Logique de priorité (énergie faible, thèmes multiples, etc.)
   ✅ Mood audio (inchangé)
*/

(() => {
  const STORAGE_KEY = "vivario_session_v1_1";
  const QUESTIONS_URL = "./questions_v1_1.json";
  const SCENARIOS_URL = "./scenarios_v1_1.json";

  // --- UI requis
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

  // -------------------------------
  // Mood audio: basé sur IDs (role:"tone")
  // -------------------------------
  function applyMoodFromAnswer(q, values){
    if (!q || !values || !values.length) return;
    if (String(q.role || "") !== "tone") return;

    const v = String(values[0] || "").toLowerCase();
    let mood = "calm";
    if (v.includes("charge") || v.includes("fatigue")) mood = "deep";
    else if (v.includes("flou") || v.includes("confus")) mood = "focus";
    else if (v.includes("neutre")) mood = "focus";
    else if (v.includes("stable") || v.includes("bien")) mood = "ocean";

    window.VivarioSound?.setMood?.(mood);
  }

  // -------------------------------
  // Profile + logique de priorité
  // -------------------------------
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

    const hasMultiple = themes.includes("multiple");
    const themeCount = themes.length;

    // Priorités:
    const lowEnergy = (energie === "faible");
    const midEnergy = (energie === "parcourir");
    const highEnergy = (energie === "reflechir" || energie === "lecture");

    // Focus: max 2 thèmes, mais si "multiple" est présent => il passe devant
    let focus = themes.slice(0, 2);
    if (hasMultiple) {
      focus = ["multiple", ...themes.filter(t => t !== "multiple")].slice(0, 2);
    }

    return {
      root, tone, themes, focus, vecu, besoin, energie, sortie,
      priority: { lowEnergy, midEnergy, highEnergy, hasMultiple, themeCount }
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

    const end = profile.priority.lowEnergy
      ? "Objectif simple : te préserver. Un pas minuscule suffit."
      : "Tu peux avancer à ton rythme. Un pas minuscule suffit.";

    return [
      TONE[profile.tone] || TONE.indetermine,
      focusLine,
      end
    ].join("\n\n");
  }

  // -------------------------------
  // Seed helpers + tirage sans doublons
  // -------------------------------
  function hashString(str){
    let h = 2166136261;
    for (let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0);
  }

  // Renvoie une forme "normalisée" pour comparer les doublons
  function normLine(s){
    return String(s || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[“”"']/g, "'")
      .trim();
  }

  // Choisit un élément de arr en évitant les doublons (via usedSet)
  function pickUnique(arr, seed, usedSet){
    if (!Array.isArray(arr) || !arr.length) return null;
    const n = arr.length;

    // On tente plusieurs positions "pseudo aléatoires"
    // pour éviter de tomber deux fois sur la même phrase
    for (let k = 0; k < Math.min(10, n); k++){
      const idx = (seed + k * 7) % n;
      const candidate = arr[idx];
      const key = normLine(candidate);
      if (!key) continue;
      if (!usedSet.has(key)) {
        usedSet.add(key);
        return candidate;
      }
    }

    // fallback: prend le premier non utilisé
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

  // Clamp mais garantit les lignes variant + supprime répétitions
  function clampScenario(core, variant, min, max, closings, seed){
    let lines = dedupeKeepOrder([...(core||[]), ...(variant||[])]);

    // coupe si trop long
    if (lines.length > max) lines = lines.slice(0, max);

    // remplit si trop court
    const used = new Set(lines.map(normLine));
    while (lines.length < min && Array.isArray(closings) && closings.length){
      const add = pickUnique(closings, (seed ^ lines.length) >>> 0, used);
      if (!add) break;
      lines.push(add);
    }

    // dernière sécurité
    if (lines.length > max) lines = lines.slice(0, max);

    return lines;
  }

  // -------------------------------
  // Scénarios: structure + priorités + 4 variantes
  // -------------------------------
  function buildScenario(profile, variantKey){
    if (!SCEN) return null;

    const seedBase = hashString(JSON.stringify(profile)) >>> 0;
    const seed = (seedBase ^ hashString(variantKey)) >>> 0;

    const max = SCEN?.meta?.max_sentences ?? 12;
    const min = SCEN?.meta?.min_sentences ?? 7;

    const roots = SCEN.roots || {};
    const modules = SCEN.modules || {};
    const closings = modules?.closings?.soft || [];

    const used = new Set(); // anti-doublons global au scénario

    const rootId = (profile.root && roots[profile.root]) ? profile.root : "clarification";
    const root = roots[rootId];

    const lines = [];

    // Root (2)
    if (root && Array.isArray(root.text)) {
      lines.push(...pickUniqueMany(root.text, seed ^ 1, Math.min(2, root.text.length), used));
    }

    // Variant "signature" placée tôt => textes vraiment différents
    const variantPack = modules?.variants?.[variantKey] || [];
    const variantLines = pickUniqueMany(variantPack, seed ^ 999, 2, used);

    // Openings (1 ou 2 selon énergie)
    const op = modules.openings || {};
    const tone = profile.tone || "indetermine";
    const opPack = op[tone] || op.indetermine || [];
    const openingCount = profile.priority.lowEnergy ? 1 : 2;
    lines.push(...pickUniqueMany(opPack, seed ^ 11, openingCount, used));

    // Themes: priorité / quantité selon variante & énergie
    const th = modules.themes || {};
    const themeSource = (profile.focus && profile.focus.length) ? profile.focus : (profile.themes || []);
    let themeCount = 2;
    if (profile.priority.lowEnergy) themeCount = 1;
    if (variantKey === "calm") themeCount = 1; // calme = pas trop de charge cognitive
    if (variantKey === "step") themeCount = 1; // pas concret = focus, pas dispersion
    if (variantKey === "norm") themeCount = 1; // normalisation = moins de détails, plus d'assise

    themeSource.slice(0, themeCount).forEach((t, i) => {
      if (th[t]) lines.push(...pickUniqueMany(th[t], seed ^ (31+i), 2, used));
    });

    // Vécu: 1
    const ve = modules.vecu || {};
    (profile.vecu || []).slice(0, 1).forEach((v, i) => {
      if (ve[v]) {
        const one = pickUnique(ve[v], seed ^ (61+i), used);
        if (one) lines.push(one);
      }
    });

    // Needs: 1 (variant step -> plus concret mais pas répétitif)
    const ne = modules.needs || {};
    (profile.besoin || []).slice(0, 1).forEach((b, i) => {
      if (ne[b]) {
        const one = pickUnique(ne[b], seed ^ (91+i), used);
        if (one) lines.push(one);
      }
    });

    // Energy: 1
    const en = modules.energy || {};
    if (profile.energie && en[profile.energie]) {
      const one = pickUnique(en[profile.energie], seed ^ 131, used);
      if (one) lines.push(one);
    }

    // ✅ Variante placée juste après le coeur (pour différencier vraiment)
    // -> on la pousse plus haut pour calm/norm afin que l'onglet "respire"
    const composedCore =
      (variantKey === "calm" || variantKey === "norm")
        ? [...lines.slice(0, 4), ...variantLines, ...lines.slice(4)]
        : [...lines, ...variantLines];

    // Closing: 1
    if (closings.length) {
      const one = pickUnique(closings, seed ^ 177, used);
      if (one) composedCore.push(one);
    }

    // Clamp + dédup + fill
    const finalLines = clampScenario(composedCore, [], min, max, closings, seed);

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