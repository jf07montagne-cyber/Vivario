/* Vivario v1.1 — engine.js (TEST 4)
   - Garde tout ce qui marche (questionnaire adaptatif + session localStorage + mood audio)
   - Scénarios: 4 variantes (main/step/calm/norm) VRAIMENT différentes
   - Anti-répétition: dédoublonnage + understander simple + sélection pondérée
   - Templates avec placeholders: {tone}, {theme1}, {theme2}, {need1}, {energy}, etc.
*/

(() => {
  const STORAGE_KEY = "vivario_session_v1_1";
  const QUESTIONS_URL = "./questions_v1_1.json";
  const SCENARIOS_URL = "./scenarios_v1_1.json";

  // --- UI requis (questionnaire page)
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
    if (v.includes("charge") || v.includes("fatigue")) mood = "deep";
    else if (v.includes("flou")) mood = "focus";
    else if (v.includes("neutre")) mood = "focus";
    else if (v.includes("stable")) mood = "ocean";

    window.VivarioSound?.setMood?.(mood);
  }

  // -------------------------------
  // Profile 100% IDs
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
    else root = "clarification";

    // Focus = 2 thèmes max (évite "multiple" si autre existe)
    const t2 = themes.filter(t => t !== "multiple" && t !== "preferer_pas");
    const focus = (t2.length ? t2 : themes).slice(0, 2);

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

    return { root, tone, themes, focus, vecu, besoin, posture, energie, sortie, tags };
  }

  function buildFinalMessage(profile){
    // (inchangé: ton message final marche déjà bien)
    // Pour éviter de casser: on garde exactement la logique précédente
    const TONE = {
      stable: "Tu sembles plutôt stable aujourd’hui.",
      neutre: "Tu es dans un entre-deux, sans forcément tout nommer.",
      flou: "Il y a du flou, et c’est ok : tu n’as pas à forcer une réponse.",
      charge: "Tu portes beaucoup en ce moment — ça compte de le reconnaître.",
      indetermine: "Tu avances même sans tout définir, et c’est déjà une forme de justesse."
    };

    const SORTIE = {
      clair: "Si tu te sens un peu plus clair, garde juste ce petit gain : il suffit.",
      soulage: "Si tu te sens un peu soulagé(e), laisse ce souffle prendre sa place.",
      identique: "Même si c’est identique, tu n’as rien “raté” : tu as pris un temps pour toi.",
      pas_aide: "Si ça ne t’a pas aidé, tu as le droit de t’arrêter ici — et de chercher un autre soutien plus adapté.",
      stop: "Tu as le droit de t’arrêter là. Savoir s’arrêter est aussi une force."
    };

    const NEED = {
      mots: "Tu avais surtout besoin de mettre des mots : prends une seule phrase simple, et garde-la.",
      comprendre: "Tu voulais comprendre : vise une petite clarté, pas une solution parfaite.",
      moins_seul: "Tu avais besoin de te sentir moins seul(e) : ce que tu vis mérite d’être reconnu.",
      normaliser: "Tu voulais vérifier que c’est “normal” : oui, ton ressenti a le droit d’exister tel quel.",
      recul: "Tu avais besoin de recul : un pas en arrière peut être un vrai soin.",
      presence: "Tu voulais juste être ici : ce moment simple a de la valeur.",
      indetermine: "Tu ne savais pas exactement : c’est une info en soi, et ça mérite de la douceur."
    };

    const ENERGY = {
      lecture: "Garde ça léger : lire et accueillir suffit.",
      reflechir: "Tu peux réfléchir un peu, mais sans te juger.",
      parcourir: "Tu peux juste parcourir : pas besoin d’aller loin.",
      faible: "Si ton énergie est basse, l’objectif est simple : te préserver.",
      indetermine: "Avance au rythme du jour, sans te forcer."
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

    const firstNeed = (profile.besoin && profile.besoin[0]) ? profile.besoin[0] : "indetermine";

    return [
      TONE[profile.tone] || TONE.indetermine,
      focusLine,
      NEED[firstNeed] || NEED.indetermine,
      ENERGY[profile.energie] || ENERGY.indetermine,
      SORTIE[profile.sortie] || SORTIE.identique
    ].join("\n\n");
  }

  // -------------------------------
  // Scénarios — Uniqueness Boost
  // -------------------------------
  function hashString(str){
    let h = 2166136261;
    for (let i=0;i<str.length;i++){
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0);
  }

  function mulberry32(seed){
    return function(){
      let t = (seed += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pick(rng, arr){
    if (!Array.isArray(arr) || !arr.length) return null;
    return arr[Math.floor(rng() * arr.length)];
  }

  function pickManyUnique(rng, arr, n, usedSet){
    const out = [];
    if (!Array.isArray(arr) || !arr.length || n <= 0) return out;
    const tries = Math.min(80, arr.length * 3);
    for (let k=0; k<tries && out.length < n; k++){
      const s = pick(rng, arr);
      if (!s) continue;
      const key = normalizeLine(s);
      if (usedSet.has(key)) continue;
      usedSet.add(key);
      out.push(s);
    }
    return out;
  }

  function normalizeLine(s){
    return String(s || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[’']/g, "'")
      .replace(/[^\p{L}\p{N}\s'!?.,-]/gu, "")
      .trim();
  }

  function fillTemplate(str, ctx){
    return String(str || "").replace(/\{(\w+)\}/g, (_, k) => {
      const v = ctx[k];
      if (Array.isArray(v)) return v.join(" • ");
      return (v !== undefined && v !== null && String(v).length) ? String(v) : "";
    });
  }

  function labelTheme(id){
    const map = {
      travail: "le travail / la pression de performance",
      finances: "les finances / l’insécurité matérielle",
      couple: "le couple / la relation",
      famille: "la famille",
      enfants: "les enfants / la parentalité",
      amis: "le lien social / l’isolement",
      sante: "la santé / les inquiétudes",
      addiction: "une habitude difficile",
      evenement: "un événement récent",
      multiple: "plusieurs choses en même temps",
      rien_de_precis: "le besoin de faire le point",
      preferer_pas: "quelque chose que tu gardes pour toi"
    };
    return map[id] || id;
  }

  function labelNeed(id){
    const map = {
      mots: "mettre des mots",
      comprendre: "comprendre",
      moins_seul: "te sentir moins seul(e)",
      normaliser: "normaliser",
      recul: "prendre du recul",
      presence: "juste être là",
      indetermine: "douceur"
    };
    return map[id] || id;
  }

  function labelTone(id){
    const map = {
      stable: "plutôt stable",
      neutre: "dans un entre-deux",
      flou: "dans le flou",
      charge: "chargé(e)",
      indetermine: "difficile à nommer"
    };
    return map[id] || id;
  }

  function labelEnergy(id){
    const map = {
      lecture: "lecture tranquille",
      reflechir: "réflexion douce",
      parcourir: "parcourir sans effort",
      faible: "énergie basse",
      indetermine: "rythme du jour"
    };
    return map[id] || id;
  }

  function buildCtx(profile){
    const theme1 = profile.focus?.[0] ? labelTheme(profile.focus[0]) : "ce que tu traverses";
    const theme2 = profile.focus?.[1] ? labelTheme(profile.focus[1]) : "";
    const need1  = profile.besoin?.[0] ? labelNeed(profile.besoin[0]) : "douceur";
    const need2  = profile.besoin?.[1] ? labelNeed(profile.besoin[1]) : "";
    const tone   = labelTone(profile.tone);
    const energy = labelEnergy(profile.energie);

    const allThemes = (profile.themes || []).map(labelTheme);
    const allNeeds  = (profile.besoin || []).map(labelNeed);

    return {
      tone, energy,
      theme1, theme2,
      need1, need2,
      themes: allThemes,
      needs: allNeeds
    };
  }

  function selectLinesForVariant(profile, variantKey){
    // variantKey: main | step | calm | norm
    const meta = SCEN?.meta || {};
    const variantMeta = (meta.variants && meta.variants[variantKey]) ? meta.variants[variantKey] : {};
    const min = variantMeta.min_sentences ?? meta.min_sentences ?? 7;
    const max = variantMeta.max_sentences ?? meta.max_sentences ?? 10;

    const seedBase = hashString(JSON.stringify(profile));
    const seed = hashString(`${seedBase}:${variantKey}:${profile.root}:${profile.tone}`);
    const rng = mulberry32(seed);

    const ctx = buildCtx(profile);

    const used = new Set();
    const out = [];

    const modules = SCEN?.modules || {};
    const roots = SCEN?.roots || {};

    // --- Packs
    const rootPack = roots[profile.root] || roots.clarification || {};
    const openings = modules.openings || {};
    const toneOpen = openings[profile.tone] || openings.indetermine || [];

    const closings = modules.closings || [];
    const bridges  = modules.bridges || [];
    const energyPack = (modules.energy && modules.energy[profile.energie]) ? modules.energy[profile.energie] : [];
    const posturePack = (modules.posture) ? flattenByIds(modules.posture, profile.posture) : [];
    const vecuPack = (modules.vecu) ? flattenByIds(modules.vecu, profile.vecu) : [];
    const themePack = (modules.themes) ? flattenByIds(modules.themes, profile.themes) : [];
    const needPack = (modules.needs) ? flattenByIds(modules.needs, profile.besoin) : [];

    const variantPacks = (modules.variants && modules.variants[variantKey]) ? modules.variants[variantKey] : [];
    const variantClosings = (modules.variant_closings && modules.variant_closings[variantKey]) ? modules.variant_closings[variantKey] : [];

    // --- Règles de priorité (anti “tout pareil”)
    // 1) Root intro (1)
    if (Array.isArray(rootPack.intro)) out.push(...pickManyUnique(rng, rootPack.intro, 1, used));

    // 2) Tone opening (1)
    out.push(...pickManyUnique(rng, toneOpen, 1, used));

    // 3) “Bridge” (0-1) selon variant
    if (variantKey === "main" || variantKey === "calm") {
      out.push(...pickManyUnique(rng, bridges, 1, used));
    }

    // 4) Thèmes (1-2) : prend d’abord focus, puis autre thème s’il reste de la place
    //    Evite d’empiler si énergie faible
    const lowEnergy = profile.energie === "faible";
    const themeTarget = lowEnergy ? 1 : 2;

    const focusIds = Array.isArray(profile.focus) ? profile.focus : [];
    const themeLinesFocus = flattenByIds(modules.themes || {}, focusIds);
    out.push(...pickManyUnique(rng, themeLinesFocus, Math.min(themeTarget, themeLinesFocus.length ? 1 : 0) || 1, used));

    if (!lowEnergy && profile.themes?.length) {
      // une deuxième ligne de thème (différente)
      out.push(...pickManyUnique(rng, themePack, 1, used));
    }

    // 5) Vecu (0-1) : utile pour personnalisation
    if (!lowEnergy) out.push(...pickManyUnique(rng, vecuPack, 1, used));

    // 6) Posture (0-1)
    out.push(...pickManyUnique(rng, posturePack, lowEnergy ? 0 : 1, used));

    // 7) Needs (1) : obligatoire (mais variant différent)
    // - main: plus empathique
    // - step: action concrète
    // - calm: apaisement direct
    // - norm: normalisation + déculpabilisation
    if (variantKey === "norm") {
      const normPack = modules.normalisation || [];
      out.push(...pickManyUnique(rng, normPack, 1, used));
      // + need (mais “soft”)
      out.push(...pickManyUnique(rng, needPack, 1, used));
    } else {
      out.push(...pickManyUnique(rng, needPack, 1, used));
    }

    // 8) Variant pack (1-2) : c’est ici que chaque onglet devient vraiment différent
    out.push(...pickManyUnique(rng, variantPacks, lowEnergy ? 1 : 2, used));

    // 9) Energy (0-1)
    out.push(...pickManyUnique(rng, energyPack, 1, used));

    // 10) Closing (1) + variant closing (0-1)
    out.push(...pickManyUnique(rng, variantClosings, 1, used));
    out.push(...pickManyUnique(rng, closings, 1, used));

    // Nettoyage + templating + longueur
    let lines = out
      .map(s => fillTemplate(s, ctx))
      .map(s => String(s || "").trim())
      .filter(Boolean);

    // Anti re-phrasing grossier (si 2 lignes trop proches)
    lines = dedupeSimilar(lines);

    if (lines.length > max) lines = lines.slice(0, max);
    while (lines.length < min && closings.length) {
      const extra = fillTemplate(pick(rng, closings), ctx);
      if (extra) lines.push(extra);
      lines = dedupeSimilar(lines);
      if (lines.length >= min) break;
    }

    // Sécurité: jamais vide
    if (!lines.length) {
      lines = [
        "Merci d’avoir pris ce temps.",
        "Tu peux avancer au rythme du jour, sans pression."
      ];
    }

    return lines.join("\n\n");
  }

  function flattenByIds(obj, ids){
    const out = [];
    if (!obj || typeof obj !== "object") return out;
    const list = Array.isArray(ids) ? ids : [];
    list.forEach(id => {
      const pack = obj[id];
      if (Array.isArray(pack)) out.push(...pack);
    });
    return out;
  }

  function dedupeSimilar(lines){
    const keep = [];
    const seen = new Set();

    function sig(s){
      return normalizeLine(s)
        .replace(/\b(tu|toi|ton|ta|tes|aujourd'hui|maintenant|vraiment|un peu)\b/g, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    for (const l of lines){
      const a = sig(l);
      if (!a) continue;
      if (seen.has(a)) continue;
      seen.add(a);
      keep.push(l);
    }
    return keep;
  }

  function buildScenarios(profile){
    if (!SCEN) return [];

    const roots = SCEN.roots || {};
    const rootTitle = roots?.[profile.root]?.title || "Juste pour toi";

    const main = selectLinesForVariant(profile, "main");
    const step = selectLinesForVariant(profile, "step");
    const calm = selectLinesForVariant(profile, "calm");
    const norm = selectLinesForVariant(profile, "norm");

    return [
      { key: "main", title: rootTitle, text: main },
      { key: "step", title: "Un pas concret", text: step },
      { key: "calm", title: "Apaisement", text: calm },
      { key: "norm", title: "Normalisation", text: norm }
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
    // ambiance fin
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