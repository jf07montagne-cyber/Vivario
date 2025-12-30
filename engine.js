/* Vivario v1.1 — engine.js (TEST 14 FIX)
   ✅ Alignement CSS: .option + .label (ton style.css)
   ✅ Robustesse DOM (pas de crash si un id manque)
   ✅ Déblocage audio mobile (Android/iOS) dès la 1ère interaction
   ✅ Coach doux / neutre (localStorage vivario_coach_soft)
   ✅ Mood + scénarios + mémoire (inchangé, intégré)
*/

(() => {
  const STORAGE_KEY = "vivario_session_v1_1";
  const QUESTIONS_URL = "./questions_v1_1.json";
  const SCENARIOS_URL = "./scenarios_v1_1.json";

  const KEY_COACH = "vivario_coach_soft";      // "1" => soft
  const KEY_MEM   = "vivario_used_lines_v1_1"; // JSON array (signatures)
  const MEM_MAX   = 350;

  const CANDIDATE_CAP = 260;

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

  // Coach switch (si présent dans ton questionnaire.html)
  const coachInput =
    document.getElementById("coachSoft") ||
    document.querySelector("[data-coach-soft]");

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

  function markSelectedStyles(){
    if (!elOptions) return;
    const rows = [...elOptions.querySelectorAll(".option")];
    rows.forEach(row => {
      const input = row.querySelector("input");
      row.classList.toggle("is-selected", !!input?.checked);
    });
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

      row.addEventListener("click", () => {
        // petit délai pour laisser l’input se mettre à jour
        setTimeout(markSelectedStyles, 0);
      }, { passive:true });

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

    try { window.VivarioSound?.setMood?.(mood); } catch {}
  }

  // -------------------------------
  // Profile IDs + coach style
  // -------------------------------
  function buildProfile(){
    const getRoleValues = (role) => {
      const a = Object.values(answersRaw).find(x => x.role === role);
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
    let focusLine = "Aujourd’hui, l’important est juste de te situer.";
    if (focus.length === 1) focusLine = `Aujourd’hui, ton attention se tourne surtout vers ${focus[0]}.`;
    if (focus.length === 2) focusLine = `Aujourd’hui, ton attention se tourne surtout vers ${focus[0]} et ${focus[1]}.`;

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
  // Random + hashing
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
    return String(s || "").toLowerCase().replace(/\s+/g, " ").replace(/[’']/g, "'").trim();
  }
  function sigLoose(s){
    return normalizeLine(s)
      .replace(/\b(tu|toi|ton|ta|tes|aujourd'hui|maintenant|vraiment|un peu|juste|simplement)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // -------------------------------
  // Memory inter-sessions
  // -------------------------------
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
    try{ localStorage.setItem(KEY_MEM, JSON.stringify(list.slice(-MEM_MAX))); }catch{}
  }
  function pushMemory(newSigs){
    const mem = loadMemory();
    const set = new Set(mem);
    for (const s of newSigs){
      if (s) set.add(s);
    }
    saveMemory(Array.from(set).slice(-MEM_MAX));
  }

  // -------------------------------
  // Templates + labels
  // -------------------------------
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

  // -------------------------------
  // Micro-variations (anti répétitions)
  // -------------------------------
  function microVary(line, rng, coach){
    let s = String(line || "").trim();
    if (!s) return s;

    if (rng() < 0.12 && !/[.!?…]$/.test(s)) s += ".";
    if (rng() < 0.10 && /[.!]$/.test(s)) s = s.replace(/[.!]$/, "…");

    const gentle = [
      ["Tu peux", "Tu peux, si tu veux,"],
      ["C’est ok", "C’est ok, vraiment"],
      ["C’est normal", "C’est assez normal"],
      ["Juste", "Simplement"],
      ["Prends", "Prends juste"]
    ];
    const neutral = [
      ["Tu peux", "Tu peux"],
      ["C’est ok", "C’est OK"],
      ["C’est normal", "C’est normal"],
      ["Juste", "Juste"],
      ["Prends", "Prends"]
    ];
    const pack = (coach === "soft") ? gentle : neutral;

    if (rng() < 0.22){
      for (const [a,b] of pack){
        if (s.includes(a) && rng() < 0.35){
          s = s.replace(a, b);
          break;
        }
      }
    }

    if (rng() < 0.12){
      s = s
        .replace(/\bpetit\b/g, "tout petit")
        .replace(/\bdoucement\b/g, "tranquillement");
    }
    return s;
  }

  // -------------------------------
  // Blocks filtering
  // -------------------------------
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
    const hasAny = (arr, vals) => vals.some(v => (arr||[]).includes(v));
    const hasAll = (arr, vals) => vals.every(v => (arr||[]).includes(v));

    if (req.coach && req.coach !== profile.coach) return false;
    if (req.tone && req.tone !== profile.tone) return false;
    if (req.root && req.root !== profile.root) return false;
    if (req.energie && req.energie !== profile.energie) return false;
    if (req.sortie && req.sortie !== profile.sortie) return false;

    if (Array.isArray(req.themes_any) && req.themes_any.length){
      if (!hasAny(profile.themes, req.themes_any)) return false;
    }
    if (Array.isArray(req.themes_all) && req.themes_all.length){
      if (!hasAll(profile.themes, req.themes_all)) return false;
    }
    if (Array.isArray(req.besoin_any) && req.besoin_any.length){
      if (!hasAny(profile.besoin, req.besoin_any)) return false;
    }
    if (Array.isArray(req.posture_any) && req.posture_any.length){
      if (!hasAny(profile.posture, req.posture_any)) return false;
    }
    if (Array.isArray(req.vecu_any) && req.vecu_any.length){
      if (!hasAny(profile.vecu, req.vecu_any)) return false;
    }
    if (req.low_energy === true && profile.energie !== "faible") return false;
    if (req.not_low_energy === true && profile.energie === "faible") return false;
    return true;
  }

  function matchForbids(profile, fb){
    if (!fb || typeof fb !== "object") return true;
    const hasAny = (arr, vals) => vals.some(v => (arr||[]).includes(v));

    if (fb.coach && fb.coach === profile.coach) return false;
    if (fb.tone && fb.tone === profile.tone) return false;
    if (fb.root && fb.root === profile.root) return false;
    if (fb.energie && fb.energie === profile.energie) return false;
    if (fb.sortie && fb.sortie === profile.sortie) return false;

    if (Array.isArray(fb.themes_any) && fb.themes_any.length){
      if (hasAny(profile.themes, fb.themes_any)) return false;
    }
    if (Array.isArray(fb.besoin_any) && fb.besoin_any.length){
      if (hasAny(profile.besoin, fb.besoin_any)) return false;
    }
    if (fb.low_energy === true && profile.energie === "faible") return false;

    return true;
  }

  function filterBlocks(profile, blocks){
    return blocks.filter(b => {
      if (!b || !b.text) return false;
      if (!matchRequires(profile, b.requires)) return false;
      if (!matchForbids(profile, b.forbids)) return false;
      return true;
    });
  }

  function capCandidates(blocks, rng){
    if (blocks.length <= CANDIDATE_CAP) return blocks;
    const out = [];
    const used = new Set();
    const tries = Math.min(600, blocks.length * 2);
    for (let i=0; i<tries && out.length < CANDIDATE_CAP; i++){
      const idx = Math.floor(rng() * blocks.length);
      if (used.has(idx)) continue;
      used.add(idx);
      out.push(blocks[idx]);
    }
    return out.length ? out : blocks.slice(0, CANDIDATE_CAP);
  }

  function weightedPick(rng, blocks){
    if (!blocks.length) return null;
    let total = 0;
    for (const b of blocks) total += (b.weight || 1);
    let r = rng() * total;
    for (const b of blocks){
      r -= (b.weight || 1);
      if (r <= 0) return b;
    }
    return blocks[blocks.length - 1];
  }

  function pickManyUniqueWeighted(rng, blocks, n, usedLoose){
    const out = [];
    if (!blocks.length || n <= 0) return out;

    const local = capCandidates(blocks, rng);
    const tries = Math.min(160, local.length * 7);

    for (let i=0; i<tries && out.length < n; i++){
      const b = weightedPick(rng, local);
      if (!b) continue;
      const loose = sigLoose(b.text);
      if (!loose) continue;
      if (usedLoose.has(loose)) continue;
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

  // -------------------------------
  // Scénarios
  // -------------------------------
  function buildScenarioForVariant(profile, variantKey, usedLooseGlobal){
    if (!SCEN) return { text: "Merci d’avoir pris ce temps.\n\nTu peux avancer au rythme du jour.", usedSigs: [] };

    const meta = SCEN.meta || {};
    const vMeta = (meta.variants && meta.variants[variantKey]) ? meta.variants[variantKey] : {};
    const min = vMeta.min_sentences ?? meta.min_sentences ?? 7;
    const max = vMeta.max_sentences ?? meta.max_sentences ?? 10;

    const seedBase = hashString(JSON.stringify(profile));
    const seed = hashString(`${seedBase}:${variantKey}:${profile.root}:${profile.tone}:${profile.energie}:${profile.sortie}:${profile.coach}`);
    const rng = mulberry32(seed);

    const ctx = buildCtx(profile);

    const usedLoose = new Set();
    loadMemory().forEach(s => usedLoose.add(String(s)));
    usedLooseGlobal.forEach(s => usedLoose.add(String(s)));

    const roots = SCEN.roots || {};
    const modules = SCEN.modules || {};
    const rootPack = roots[profile.root] || roots.clarification || {};

    const openings = modules.openings || {};
    const toneOpen = openings[profile.tone] || openings.indetermine || [];

    const bridges = modules.bridges || [];
    const closings = modules.closings || [];
    const normalisation = modules.normalisation || [];

    const themePackAll = flattenByIds(modules.themes || {}, profile.themes || []);
    const vecuPackAll = flattenByIds(modules.vecu || {}, profile.vecu || []);
    const posturePackAll = flattenByIds(modules.posture || {}, profile.posture || []);
    const needPackAll = flattenByIds(modules.needs || {}, profile.besoin || []);
    const energyPack = (modules.energy && modules.energy[profile.energie]) ? modules.energy[profile.energie] : [];

    const variantPacks = (modules.variants && modules.variants[variantKey]) ? modules.variants[variantKey] : [];
    const variantClosings = (modules.variant_closings && modules.variant_closings[variantKey]) ? modules.variant_closings[variantKey] : [];

    const B = (arr) => filterBlocks(profile, asBlocks(arr));

    const blocks = [];
    blocks.push(...pickManyUniqueWeighted(rng, B(rootPack.intro || []), 1, usedLoose));
    blocks.push(...pickManyUniqueWeighted(rng, B(toneOpen), 1, usedLoose));

    if (variantKey === "main" || variantKey === "calm") {
      blocks.push(...pickManyUniqueWeighted(rng, B(bridges), 1, usedLoose));
    }

    const focusIds = Array.isArray(profile.focus) ? profile.focus : [];
    const focusLines = flattenByIds(modules.themes || {}, focusIds);
    blocks.push(...pickManyUniqueWeighted(rng, B(focusLines.length ? focusLines : themePackAll), 1, usedLoose));

    if (profile.energie !== "faible") blocks.push(...pickManyUniqueWeighted(rng, B(vecuPackAll), 1, usedLoose));
    if (profile.energie !== "faible") blocks.push(...pickManyUniqueWeighted(rng, B(posturePackAll), 1, usedLoose));

    if (variantKey === "norm") blocks.push(...pickManyUniqueWeighted(rng, B(normalisation), 1, usedLoose));

    blocks.push(...pickManyUniqueWeighted(rng, B(needPackAll), 1, usedLoose));
    blocks.push(...pickManyUniqueWeighted(rng, B(variantPacks), (profile.energie === "faible") ? 1 : 2, usedLoose));
    blocks.push(...pickManyUniqueWeighted(rng, B(energyPack), 1, usedLoose));

    blocks.push(...pickManyUniqueWeighted(rng, B(variantClosings), 1, usedLoose));
    blocks.push(...pickManyUniqueWeighted(rng, B(closings), 1, usedLoose));

    let lines = blocks
      .map(b => microVary(fillTemplate(b.text, ctx).trim(), rng, profile.coach))
      .filter(Boolean);

    if (lines.length > max) lines = lines.slice(0, max);

    while (lines.length < min && closings.length) {
      const extra = weightedPick(rng, B(closings));
      if (extra?.text) lines.push(microVary(fillTemplate(extra.text, ctx), rng, profile.coach));
      if (lines.length >= min) break;
    }

    const out = [];
    const seen = new Set();
    for (const l of lines){
      const s = sigLoose(l);
      if (!s) continue;
      if (seen.has(s)) continue;
      seen.add(s);
      out.push(l);
    }

    const usedSigs = out.map(sigLoose).filter(Boolean);
    usedSigs.forEach(s => usedLooseGlobal.add(s));
    pushMemory(usedSigs);

    return { text: out.join("\n\n"), usedSigs };
  }

  function buildScenarios(profile){
    if (!SCEN) return [];

    const roots = SCEN.roots || {};
    const rootTitle = roots?.[profile.root]?.title || "Juste pour toi";

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
    try { window.VivarioSound?.setMood?.("deep"); } catch {}

    const profile = buildProfile();
    const scenarios = buildScenarios(profile);
    const finalMessage = buildFinalMessage(profile);

    const session = buildSession(profile, scenarios, finalMessage);

    session.draft = {
      coach: profile.coach,
      profile,
      scenarios,
      createdAt: session.createdAt
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    window.location.href = "resultat.html?v=14";
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

  function setupCoachSwitch(){
    if (!coachInput) return;
    const isSoft = localStorage.getItem(KEY_COACH) === "1";
    coachInput.checked = !!isSoft;

    coachInput.addEventListener("change", () => {
      localStorage.setItem(KEY_COACH, coachInput.checked ? "1" : "0");
    });
  }

  function setupAudioUnlock(){
    function unlock(){
      try { window.VivarioSound?.setMood?.("calm"); } catch {}
      try { window.VivarioSound?.startBreathing?.({ affectBreath:false, muteAmbienceWhileBreath:false }); } catch {}
      try { window.VivarioSound?.stopBreathing?.(); } catch {}
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchstart", unlock);
    }
    window.addEventListener("pointerdown", unlock, { once:true, passive:true });
    window.addEventListener("touchstart", unlock, { once:true, passive:true });
  }

  async function init(){
    try{
      setupAudioUnlock();
      setupCoachSwitch();

      const qRes = await fetch(bust(QUESTIONS_URL), { cache: "no-store" });
      if (!qRes.ok) throw new Error("questions_v1_1.json introuvable (" + qRes.status + ")");
      const qData = await qRes.json();

      QUESTIONS = Array.isArray(qData.questions) ? qData.questions : (Array.isArray(qData) ? qData : []);
      if (!QUESTIONS.length) throw new Error("questions_v1_1.json: aucune question trouvée");

      orderIndex = QUESTIONS.map(q => String(q.id));

      try{
        const sRes = await fetch(bust(SCENARIOS_URL), { cache: "no-store" });
        if (sRes.ok) SCEN = await sRes.json();
      } catch {}

      renderQuestion(orderIndex[0]);

      if (btnNext) btnNext.addEventListener("click", goNext);
      if (btnBack) btnBack.addEventListener("click", goBack);

    } catch(e){
      setError("Erreur : " + e.message);
      if (elTitle) elTitle.textContent = "Impossible de charger le questionnaire";
      if (elSub) elSub.textContent = "Vérifie que questions_v1_1.json est bien à la racine.";
      if (elOptions) elOptions.innerHTML = "";
      if (elHint) elHint.style.display = "none";
    }
  }

  init();
})();