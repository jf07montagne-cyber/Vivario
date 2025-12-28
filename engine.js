/* Vivario v1.1 — engine.js (TEST 7)
   ✅ TEST6 OK +
   ✅ mémoire par onglet (évite répétitions entre onglets)
   ✅ sauvegarde draft session pour régénération depuis resultat.html
*/

(() => {
  const STORAGE_KEY = "vivario_session_v1_1";
  const QUESTIONS_URL = "./questions_v1_1.json";
  const SCENARIOS_URL = "./scenarios_v1_1.json";

  const KEY_COACH = "vivario_coach_soft";              // "1" => soft
  const KEY_MEM   = "vivario_used_lines_v1_1";         // JSON array of signatures inter-sessions
  const MEM_MAX   = 350;

  // --- UI requis
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
  // Mood audio
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

  // -------------------------------
  // Profile IDs + coach style
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

    const t2 = themes.filter(t => t !== "multiple" && t !== "preferer_pas");
    const focus = (t2.length ? t2 : themes).slice(0, 2);

    const coach = (localStorage.getItem(KEY_COACH) === "1") ? "soft" : "neutral";

    const tags = [
      `coach:${coach}`,
      `tone:${tone}`,
      ...themes.map(t => `theme:${t}`),
      ...vecu.map(v => `vecu:${v}`),
      ...posture.map(p => `posture:${p}`),
      ...besoin.map(b => `besoin:${b}`),
      `energie:${energie}`,
      `sortie:${sortie}`,
      `root:${root}`
    ];

    return { root, tone, themes, focus, vecu, besoin, posture, energie, sortie, coach, tags };
  }

  // -------------------------------
  // Final message (inchangé)
  // -------------------------------
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

  // -------------------------------
  // Helpers scenario engine
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

  function normalizeLine(s){
    return String(s || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[’']/g, "'")
      .replace(/[^\p{L}\p{N}\s'!?.,-]/gu, "")
      .trim();
  }

  function sigLoose(s){
    return normalizeLine(s)
      .replace(/\b(tu|toi|ton|ta|tes|aujourd'hui|maintenant|vraiment|un peu|juste|simplement)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function loadMemory(){
    try{
      const raw = localStorage.getItem(KEY_MEM);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.slice(0, MEM_MAX) : [];
    }catch{
      return [];
    }
  }

  function saveMemory(list){
    try{
      const trimmed = list.slice(-MEM_MAX);
      localStorage.setItem(KEY_MEM, JSON.stringify(trimmed));
    }catch{}
  }

  function pushMemory(newSigs){
    const mem = loadMemory();
    const set = new Set(mem);
    for (const s of newSigs){
      if (!s) continue;
      set.add(s);
    }
    saveMemory(Array.from(set).slice(-MEM_MAX));
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
      travail: "le travail / la pression",
      finances: "les finances",
      couple: "le couple / la relation",
      famille: "la famille",
      enfants: "les enfants / la parentalité",
      amis: "le lien social / l’isolement",
      sante: "la santé",
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

    const themes = (profile.themes || []).map(labelTheme);
    const needs  = (profile.besoin || []).map(labelNeed);

    return { tone, energy, theme1, theme2, need1, need2, themes, needs };
  }

  function asBlocks(arr){
    if (!Array.isArray(arr)) return [];
    return arr.map(x => {
      if (typeof x === "string") return { text: x, weight: 1 };
      if (x && typeof x === "object" && typeof x.text === "string") {
        return {
          text: x.text,
          weight: (typeof x.weight === "number" && x.weight > 0) ? x.weight : 1,
          requires: x.requires || {},
          forbids: x.forbids || {},
          tags: Array.isArray(x.tags) ? x.tags : []
        };
      }
      return null;
    }).filter(Boolean);
  }

  function matchRequires(profile, req){
    if (!req || typeof req !== "object") return true;

    const hasAny = (arr, vals) => vals.some(v => arr.includes(v));
    const hasAll = (arr, vals) => vals.every(v => arr.includes(v));

    if (req.coach && req.coach !== profile.coach) return false;

    if (req.tone && req.tone !== profile.tone) return false;
    if (req.root && req.root !== profile.root) return false;
    if (req.energie && req.energie !== profile.energie) return false;
    if (req.sortie && req.sortie !== profile.sortie) return false;

    if (Array.isArray(req.themes_any) && req.themes_any.length){
      if (!hasAny(profile.themes || [], req.themes_any)) return false;
    }
    if (Array.isArray(req.themes_all) && req.themes_all.length){
      if (!hasAll(profile.themes || [], req.themes_all)) return false;
    }
    if (Array.isArray(req.besoin_any) && req.besoin_any.length){
      if (!hasAny(profile.besoin || [], req.besoin_any)) return false;
    }
    if (Array.isArray(req.posture_any) && req.posture_any.length){
      if (!hasAny(profile.posture || [], req.posture_any)) return false;
    }
    if (Array.isArray(req.vecu_any) && req.vecu_any.length){
      if (!hasAny(profile.vecu || [], req.vecu_any)) return false;
    }

    if (req.low_energy === true && profile.energie !== "faible") return false;
    if (req.not_low_energy === true && profile.energie === "faible") return false;

    return true;
  }

  function matchForbids(profile, fb){
    if (!fb || typeof fb !== "object") return true;

    const hasAny = (arr, vals) => vals.some(v => arr.includes(v));

    if (fb.coach && fb.coach === profile.coach) return false;

    if (fb.tone && fb.tone === profile.tone) return false;
    if (fb.root && fb.root === profile.root) return false;
    if (fb.energie && fb.energie === profile.energie) return false;
    if (fb.sortie && fb.sortie === profile.sortie) return false;

    if (Array.isArray(fb.themes_any) && fb.themes_any.length){
      if (hasAny(profile.themes || [], fb.themes_any)) return false;
    }
    if (Array.isArray(fb.besoin_any) && fb.besoin_any.length){
      if (hasAny(profile.besoin || [], fb.besoin_any)) return false;
    }

    if (fb.low_energy === true && profile.energie === "faible") return false;

    return true;
  }

  function filterBlocks(profile, blocks){
    return blocks.filter(b => {
      if (!b || !b.text) return false;
      if (!matchRequires(profile, b.requires)) return false;
      if (!matchForbids(profile, b.forbids)) return false;

      const isExit = (profile.sortie === "stop" || profile.sortie === "pas_aide");
      const lowEnergy = profile.energie === "faible";
      const wantPresence = (profile.besoin || []).includes("presence");

      const t = normalizeLine(b.text);

      if (isExit && (t.includes("liste") || t.includes("plan") || t.includes("objectif") || t.includes("action"))) {
        if (!b.tags.includes("soft")) return false;
      }
      if (lowEnergy && (t.includes("liste") || t.includes("3 choses") || t.includes("plan") || t.includes("action"))) {
        if (!b.tags.includes("micro")) return false;
      }
      if (wantPresence && (t.includes("choisis") || t.includes("définis") || t.includes("fais"))) {
        if (!b.tags.includes("soft")) return false;
      }
      return true;
    });
  }

  function weightedPick(rng, blocks){
    if (!blocks.length) return null;
    const total = blocks.reduce((s,b) => s + (b.weight || 1), 0);
    let r = rng() * total;
    for (const b of blocks){
      r -= (b.weight || 1);
      if (r <= 0) return b;
    }
    return blocks[blocks.length - 1];
  }

  function pickManyUniqueWeighted(rng, blocks, n, usedStrict, usedLoose){
    const out = [];
    if (!blocks.length || n <= 0) return out;

    const tries = Math.min(160, blocks.length * 8);
    for (let i=0; i<tries && out.length < n; i++){
      const b = weightedPick(rng, blocks);
      if (!b) continue;

      const strict = normalizeLine(b.text);
      const loose  = sigLoose(b.text);

      if (usedStrict.has(strict) || usedLoose.has(loose)) continue;

      usedStrict.add(strict);
      usedLoose.add(loose);
      out.push(b);
    }
    return out;
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
    for (const l of lines){
      const s = sigLoose(l);
      if (!s) continue;
      if (seen.has(s)) continue;
      seen.add(s);
      keep.push(l);
    }
    return keep;
  }

  // ✅ NEW: génération avec mémoire globale inter-onglets
  function buildScenarioForVariant(profile, variantKey, usedLooseGlobal){
    if (!SCEN) return "Merci d’avoir pris ce temps.\n\nTu peux avancer au rythme du jour.";

    const meta = SCEN.meta || {};
    const vMeta = (meta.variants && meta.variants[variantKey]) ? meta.variants[variantKey] : {};
    const min = vMeta.min_sentences ?? meta.min_sentences ?? 7;
    const max = vMeta.max_sentences ?? meta.max_sentences ?? 10;

    const seedBase = hashString(JSON.stringify(profile));
    const seed = hashString(`${seedBase}:${variantKey}:${profile.root}:${profile.tone}:${profile.energie}:${profile.sortie}:${profile.coach}`);
    const rng = mulberry32(seed);

    const ctx = buildCtx(profile);

    const usedStrict = new Set();
    const usedLooseLocal = new Set(); // mémoire propre à l’onglet

    // ✅ mémoire inter-sessions (bloque les phrases déjà utilisées sur d'anciennes sessions)
    const mem = loadMemory();
    mem.forEach(s => usedLooseLocal.add(String(s)));

    // ✅ mémoire inter-onglets (session en cours)
    if (usedLooseGlobal && usedLooseGlobal.size){
      usedLooseGlobal.forEach(s => usedLooseLocal.add(String(s)));
    }

    const roots = SCEN.roots || {};
    const modules = SCEN.modules || {};

    const rootPack = roots[profile.root] || roots.clarification || {};
    const openings = modules.openings || {};
    const bridges = modules.bridges || [];
    const closings = modules.closings || [];
    const normalisation = modules.normalisation || [];

    const toneOpen = openings[profile.tone] || openings.indetermine || [];

    const themePackAll = flattenByIds(modules.themes || {}, profile.themes || []);
    const vecuPackAll = flattenByIds(modules.vecu || {}, profile.vecu || []);
    const posturePackAll = flattenByIds(modules.posture || {}, profile.posture || []);
    const needPackAll = flattenByIds(modules.needs || {}, profile.besoin || []);
    const energyPack = (modules.energy && modules.energy[profile.energie]) ? modules.energy[profile.energie] : [];

    const variantPacks = (modules.variants && modules.variants[variantKey]) ? modules.variants[variantKey] : [];
    const variantClosings = (modules.variant_closings && modules.variant_closings[variantKey]) ? modules.variant_closings[variantKey] : [];

    const B = (arr) => filterBlocks(profile, asBlocks(arr));

    const blocks = [];
    const lowEnergy = profile.energie === "faible";
    const wantPresence = (profile.besoin || []).includes("presence");

    const usedStrictGlobalNo = usedStrict;
    const usedLooseForPicking = usedLooseLocal; // déjà fusionné (inter-session + inter-onglets)

    blocks.push(...pickManyUniqueWeighted(rng, B(rootPack.intro || []), 1, usedStrictGlobalNo, usedLooseForPicking));
    blocks.push(...pickManyUniqueWeighted(rng, B(toneOpen), 1, usedStrictGlobalNo, usedLooseForPicking));

    if (variantKey === "main" || variantKey === "calm") {
      blocks.push(...pickManyUniqueWeighted(rng, B(bridges), 1, usedStrictGlobalNo, usedLooseForPicking));
    }

    const focusIds = Array.isArray(profile.focus) ? profile.focus : [];
    const focusLines = flattenByIds(modules.themes || {}, focusIds);

    blocks.push(...pickManyUniqueWeighted(rng, B(focusLines.length ? focusLines : themePackAll), 1, usedStrictGlobalNo, usedLooseForPicking));
    if (!lowEnergy && !wantPresence) {
      blocks.push(...pickManyUniqueWeighted(rng, B(themePackAll), 1, usedStrictGlobalNo, usedLooseForPicking));
    }

    if (!lowEnergy) blocks.push(...pickManyUniqueWeighted(rng, B(vecuPackAll), 1, usedStrictGlobalNo, usedLooseForPicking));
    if (!lowEnergy) blocks.push(...pickManyUniqueWeighted(rng, B(posturePackAll), 1, usedStrictGlobalNo, usedLooseForPicking));

    if (variantKey === "norm") blocks.push(...pickManyUniqueWeighted(rng, B(normalisation), 1, usedStrictGlobalNo, usedLooseForPicking));
    blocks.push(...pickManyUniqueWeighted(rng, B(needPackAll), 1, usedStrictGlobalNo, usedLooseForPicking));

    blocks.push(...pickManyUniqueWeighted(rng, B(variantPacks), lowEnergy ? 1 : 2, usedStrictGlobalNo, usedLooseForPicking));
    blocks.push(...pickManyUniqueWeighted(rng, B(energyPack), 1, usedStrictGlobalNo, usedLooseForPicking));

    blocks.push(...pickManyUniqueWeighted(rng, B(variantClosings), 1, usedStrictGlobalNo, usedLooseForPicking));
    blocks.push(...pickManyUniqueWeighted(rng, B(closings), 1, usedStrictGlobalNo, usedLooseForPicking));

    let lines = blocks.map(b => fillTemplate(b.text, ctx).trim()).filter(Boolean);
    lines = dedupeSimilar(lines);

    if (lines.length > max) lines = lines.slice(0, max);
    while (lines.length < min && closings.length) {
      const extraB = weightedPick(rng, B(closings));
      if (extraB?.text) lines.push(fillTemplate(extraB.text, ctx));
      lines = dedupeSimilar(lines);
      if (lines.length >= min) break;
    }

    if (!lines.length) lines = ["Merci d’avoir pris ce temps.", "Tu peux avancer au rythme du jour, sans pression."];

    // ✅ mise à jour mémoire inter-onglets (global)
    const newSigs = lines.map(sigLoose).filter(Boolean);
    newSigs.forEach(s => usedLooseGlobal.add(s));

    // ✅ mémoire inter-sessions (persiste)
    pushMemory(newSigs);

    return { text: lines.join("\n\n"), usedSigs: newSigs };
  }

  function buildScenarios(profile){
    if (!SCEN) return [];

    const roots = SCEN.roots || {};
    const rootTitle = roots?.[profile.root]?.title || "Juste pour toi";

    // ✅ mémoire inter-onglets (session)
    const usedLooseGlobal = new Set();

    const main = buildScenarioForVariant(profile, "main", usedLooseGlobal);
    const step = buildScenarioForVariant(profile, "step", usedLooseGlobal);
    const calm = buildScenarioForVariant(profile, "calm", usedLooseGlobal);
    const norm = buildScenarioForVariant(profile, "norm", usedLooseGlobal);

    return [
      { key: "main", title: rootTitle, text: main.text },
      { key: "step", title: "Un pas concret", text: step.text },
      { key: "calm", title: "Apaisement", text: calm.text },
      { key: "norm", title: "Normalisation", text: norm.text }
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

    // ✅ TEST7: draft pour régénération depuis resultat.html
    session.draft = {
      coach: profile.coach,
      profile,
      scenarios,
      mem_hint: "stored",
      createdAt: session.createdAt
    };

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