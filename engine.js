/* Vivario v1.1 — engine.js (FINAL + MOODS)
   - Lit questions_v1_1.json -> { questions:[...] }
   - Affiche title + subtitle + compteur
   - Respecte constraints min/max
   - Profil 100% basé sur IDs (aucune déduction sur texte libre)
   - Scénarios adaptatifs (roots/modules) scenarios_v1_1.json
   - Sauvegarde session: {answers, profile, scenarios, finalMessage} dans localStorage
   - ✅ NOUVEAU: setMood() selon les réponses (ocean / focus / deep)
   - ✅ NOUVEAU: ensureStarted() au premier geste utilisateur utile (clic "Continuer")
*/

(() => {
  const STORAGE_KEY = "vivario_session_v1_1";
  const QUESTIONS_URL = "./questions_v1_1.json";
  const SCENARIOS_URL = "./scenarios_v1_1.json";

  // --- UI requis
  const elTitle   = document.getElementById("qTitle");
  const elText    = document.getElementById("qText");       // présent (même caché)
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
  let answersRaw = {};  // qid -> { role, values:[ids], labels:[...] }
  let orderIndex = [];  // qids in order

  // ✅ audio state (éviter de spam ensureStarted)
  let audioEnsuredOnce = false;

  // utils
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
    if (elText)  elText.textContent  = ""; // on n’utilise pas qText pour l’affichage principal ici
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

  // selection + constraints
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

  // =========================================================
  // ✅ NOUVEAU : Mood logic (ocean / focus / deep)
  // =========================================================

  function safeLower(x){ return String(x || "").toLowerCase(); }

  function setMood(mood){
    // mood attendu: "ocean" | "focus" | "deep"
    const m = safeLower(mood);
    if (!m) return;
    try { window.VivarioSound?.setMood?.(m); } catch {}
  }

  function decideMoodFromAnswer(q, values){
    // On ne "lit" pas le texte libre, on se base sur IDs/roles.
    const role = safeLower(q?.role);

    // On utilise les IDs sélectionnés, et parfois les labels si tu changes les IDs plus tard.
    const vJoined = values.map(safeLower).join("|");

    // Mapping simple/robuste :
    // - "deep" si fatigue / charge / maximum / wheeze / rumble / etc.
    // - "focus" si confusion / flou / perdu / melange
    // - "ocean" sinon par défaut (calme & neutre)
    //
    // Tu peux enrichir ici selon tes IDs exacts.
    const looksDeep =
      vJoined.includes("fatigue") ||
      vJoined.includes("charge") ||
      vJoined.includes("maximum") ||
      vJoined.includes("tendu") ||
      vJoined.includes("pression");

    const looksFocus =
      vJoined.includes("confus") ||
      vJoined.includes("confusion") ||
      vJoined.includes("flou") ||
      vJoined.includes("perdu") ||
      vJoined.includes("melange") ||
      vJoined.includes("neutre");

    // Priorité par rôle (si tu veux guider l'ambiance par étapes)
    // - tone: stable => ocean, charge/flou => deep/focus
    // - posture: protection => deep, confusion => focus
    if (role === "tone"){
      if (vJoined.includes("stable")) return "ocean";
      if (looksDeep) return "deep";
      if (looksFocus) return "focus";
      return "ocean";
    }

    if (role === "posture"){
      if (looksDeep) return "deep";
      if (looksFocus) return "focus";
      if (vJoined.includes("protection") || vJoined.includes("recul")) return "deep";
      return "ocean";
    }

    // Si theme explicit "ocean/mer" un jour
    if (vJoined.includes("ocean") || vJoined.includes("mer")) return "ocean";

    // Fallback général
    if (looksDeep) return "deep";
    if (looksFocus) return "focus";
    return "ocean";
  }

  async function ensureSoundStarted(){
    if (audioEnsuredOnce) return;
    audioEnsuredOnce = true;
    try { await window.VivarioSound?.ensureStarted?.(); } catch {}
  }

  // profile 100% IDs
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

    const focus = themes.slice(0, 2);

    return { root, tone, themes, focus, vecu, besoin, energie, sortie, tags };
  }

  // ----- phrase finale ultra personnalisée (100% IDs)
  function buildFinalMessage(profile){
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

  // scenarios builder
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

    if (root && Array.isArray(root.text)) lines.push(...root.text);

    const op = modules.openings || {};
    const tone = profile.tone || "indetermine";
    const opPack = op[tone] || op.indetermine || [];
    lines.push(...seededPickMany(opPack, seed ^ 11, 2));

    const th = modules.themes || {};
    (profile.themes || []).forEach((t, i) => {
      if (th[t]) lines.push(...seededPickMany(th[t], seed ^ (31+i), 2));
    });

    const ve = modules.vecu || {};
    (profile.vecu || []).forEach((v, i) => {
      if (ve[v]) lines.push(seededPick(ve[v], seed ^ (61+i)));
    });

    const ne = modules.needs || {};
    (profile.besoin || []).forEach((b, i) => {
      if (ne[b]) lines.push(seededPick(ne[b], seed ^ (91+i)));
    });

    const en = modules.energy || {};
    if (profile.energie && en[profile.energie]) lines.push(seededPick(en[profile.energie], seed ^ 131));

    if (Array.isArray(SCEN.closing)) lines.push(...SCEN.closing);

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

    const s1 = { title: (SCEN?.roots?.[profile.root]?.title || "Scénario"), text: main };
    const s2 = { title: "Variante — un pas concret", text: buildScenarioText(profile, 777) || main };
    const s3 = { title: "Variante — apaisement", text: buildScenarioText(profile, 1337) || main };

    return [s1, s2, s3];
  }

  // session
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
    const profile = buildProfile();
    const scenarios = buildScenarios(profile);
    const finalMessage = buildFinalMessage(profile);

    const session = buildSession(profile, scenarios, finalMessage);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    window.location.href = "resultat.html";
  }

  // navigation
  async function goNext(){
    const q = byId(currentId);
    if (!q) return;

    const values = getSelectedValues(q);
    if (!validateConstraints(q, values)) return;
    if (!saveAnswer(q, values)) { setError("Choisis au moins une réponse pour continuer."); return; }

    setError("");

    // ✅ NOUVEAU: démarrer l’audio au premier vrai clic (anti-autoplay)
    await ensureSoundStarted();

    // ✅ NOUVEAU: changer l’ambiance selon la réponse
    const mood = decideMoodFromAnswer(q, values);
    setMood(mood);

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

  // init
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