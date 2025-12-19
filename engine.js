/* Vivario v1.1 — engine.js
   - Charge questions_v1_1.json
   - Questionnaire adaptatif (next par option ou next global)
   - Single (radio) + multi (checkbox)
   - Stocke session dans localStorage
   - Génère des scénarios adaptatifs depuis scenarios_v1_1.json (structure modules/roots)
*/

(() => {
  const STORAGE_KEY = "vivario_session_v1_1";
  const QUESTIONS_URL = "./questions_v1_1.json";
  const SCENARIOS_URL = "./scenarios_v1_1.json";

  const elTitle = document.getElementById("qTitle");
  const elText = document.getElementById("qText");
  const elHint = document.getElementById("qHint");
  const elOptions = document.getElementById("options");
  const elErr = document.getElementById("err");
  const elProgress = document.getElementById("qProgress");

  const btnNext = document.getElementById("btnNext");
  const btnBack = document.getElementById("btnBack");

  let QUESTIONS = [];
  let LIB = null;

  let currentId = null;
  let history = [];        // pile des ids
  let answersMap = {};     // id -> value(s)
  let meta = { tags: new Set(), firstMood: null }; // tags simples

  function bust(url) {
    return url + (url.includes("?") ? "&" : "?") + "v=" + Date.now();
  }

  function setError(msg) {
    if (elErr) elErr.textContent = msg || "";
  }

  function normalizeOptions(options) {
    if (!Array.isArray(options)) return [];
    return options.map(o => {
      if (typeof o === "string") return { value: o, label: o, next: null, tags: null };
      return {
        value: o.value ?? o.id ?? o.key ?? o.label ?? "",
        label: o.label ?? o.text ?? o.title ?? String(o.value ?? ""),
        next: o.next ?? o.goto ?? o.to ?? null,
        tags: o.tags ?? null
      };
    });
  }

  function findQuestion(id) {
    return QUESTIONS.find(q => String(q.id) === String(id)) || null;
  }

  function isMulti(q) {
    const t = String(q.type || "").toLowerCase();
    return q.multiple === true || t === "multi" || t === "checkbox" || t === "multiple";
  }

  function qTitleOf(q) {
    return q.title || q.titre || q.theme || "Question";
  }

  function qTextOf(q) {
    return q.text || q.question || q.prompt || "";
  }

  function qNextDefault(q) {
    return q.next || q.goto || q.to || null;
  }

  function addTag(t) {
    if (!t) return;
    meta.tags.add(String(t).toLowerCase());
  }

  function recordMeta(q, selected) {
    // tag sur theme/titre
    if (q.theme) addTag(q.theme);
    if (qTitleOf(q)) addTag(qTitleOf(q));

    // détecte “mood” (Q1 généralement)
    // on garde le premier choix global (utile pour openings)
    if (meta.firstMood == null && typeof selected === "string") {
      const s = selected.toLowerCase();
      if (s.includes("stable") || s.includes("bien")) meta.firstMood = "stable";
      else if (s.includes("neutre")) meta.firstMood = "neutre";
      else if (s.includes("perdu") || s.includes("confus") || s.includes("flou")) meta.firstMood = "flou";
      else if (s.includes("fatigu") || s.includes("charg")) meta.firstMood = "charge";
      else meta.firstMood = "indetermine";
    }

    // tags par contenu
    const addFromText = (txt) => {
      const s = String(txt || "").toLowerCase();
      if (s.includes("fatigu")) addTag("fatigue");
      if (s.includes("stress")) addTag("stress");
      if (s.includes("anx")) addTag("anxiete");
      if (s.includes("addict")) addTag("addiction");
      if (s.includes("finance") || s.includes("dette")) addTag("finances");
      if (s.includes("enfant") || s.includes("parent")) addTag("enfants");
      if (s.includes("travail") || s.includes("job") || s.includes("boulot")) addTag("travail");
      if (s.includes("amis")) addTag("amis");
      if (s.includes("couple")) addTag("couple");
      if (s.includes("famille")) addTag("famille");
      if (s.includes("sant")) addTag("sante");
      if (s.includes("rien")) addTag("rien_de_precis");
      if (s.includes("préf") || s.includes("pas dire")) addTag("preferer_pas");
      if (s.includes("stop") || s.includes("pas aid")) addTag("sortie");
    };

    if (Array.isArray(selected)) selected.forEach(addFromText);
    else addFromText(selected);
  }

  function renderProgress() {
    if (!elProgress) return;
    const idx = history.length + 1;
    const total = QUESTIONS.length || 0;
    elProgress.textContent = total ? `Question ${idx} / ${total}` : `Question ${idx}`;
  }

  function renderQuestion(id) {
    const q = findQuestion(id);
    if (!q) {
      setError("Question introuvable : " + id);
      return;
    }
    setError("");
    currentId = id;

    if (elTitle) elTitle.textContent = qTitleOf(q);
    if (elText) elText.textContent = qTextOf(q);

    const multi = isMulti(q);
    if (elHint) {
      elHint.style.display = multi ? "block" : "none";
      elHint.textContent = multi ? "✅ Tu peux cocher plusieurs réponses." : "";
    }

    renderProgress();

    elOptions.innerHTML = "";
    const opts = normalizeOptions(q.options || q.choices || q.reponses);

    // question texte libre
    if (!opts.length) {
      const wrap = document.createElement("div");
      wrap.className = "opt";
      wrap.innerHTML = `
        <div style="width:100%">
          <textarea id="freeText" rows="3"
            style="width:100%;background:transparent;color:inherit;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:10px"
            placeholder="Écris ici..."></textarea>
        </div>
      `;
      elOptions.appendChild(wrap);

      const prev = answersMap[String(id)];
      if (typeof prev === "string") {
        const ta = wrap.querySelector("#freeText");
        if (ta) ta.value = prev;
      }
      return;
    }

    const saved = answersMap[String(id)];

    for (const opt of opts) {
      const row = document.createElement("label");
      row.className = "opt";

      const type = multi ? "checkbox" : "radio";
      const name = "q_" + String(id);

      const checked = multi
        ? (Array.isArray(saved) && saved.includes(String(opt.value)))
        : (saved !== undefined && String(saved) === String(opt.value));

      row.innerHTML = `
        <input type="${type}" name="${name}" value="${String(opt.value)}" ${checked ? "checked" : ""}>
        <div><div style="font-weight:600">${opt.label}</div></div>
      `;
      elOptions.appendChild(row);
    }
  }

  function getSelected() {
    const q = findQuestion(currentId);
    if (!q) return null;

    const multi = isMulti(q);
    const inputs = [...elOptions.querySelectorAll("input")];
    if (!inputs.length) return null;

    if (!multi) {
      const r = inputs.find(i => i.checked);
      return r ? r.value : null;
    } else {
      const checked = inputs.filter(i => i.checked).map(i => i.value);
      return checked.length ? checked : null;
    }
  }

  function saveAnswerForCurrent(q, selected) {
    const id = String(q.id);

    // texte libre
    const free = document.getElementById("freeText");
    if (free) {
      const txt = free.value.trim();
      if (!txt) return false;
      answersMap[id] = txt;
      recordMeta(q, txt);
      return true;
    }

    if (selected === null) return false;
    answersMap[id] = selected;
    recordMeta(q, selected);
    return true;
  }

  function computeNext(q, selected) {
    const opts = normalizeOptions(q.options || q.choices || q.reponses);

    // si option->next
    if (opts.length) {
      if (Array.isArray(selected)) {
        // multi : si plusieurs next existent, on prend le 1er trouvé, sinon next global
        for (const v of selected) {
          const o = opts.find(x => String(x.value) === String(v));
          if (o && o.next) return o.next;
        }
      } else {
        const o = opts.find(x => String(x.value) === String(selected));
        if (o && o.next) return o.next;
      }
    }

    // sinon next global
    return qNextDefault(q);
  }

  function buildSession() {
    // construit un résumé propre
    const answers = [];
    for (const id of Object.keys(answersMap)) {
      const q = findQuestion(id);
      if (!q) continue;

      const val = answersMap[id];
      let answerText = "";

      const opts = normalizeOptions(q.options || q.choices || q.reponses);
      if (opts.length) {
        if (Array.isArray(val)) {
          answerText = val.map(v => (opts.find(o => String(o.value) === String(v))?.label || String(v))).join(", ");
        } else {
          answerText = opts.find(o => String(o.value) === String(val))?.label || String(val);
        }
      } else {
        answerText = String(val || "");
      }

      answers.push({
        id: String(id),
        theme: q.theme || qTitleOf(q),
        question: qTextOf(q),
        answer: answerText
      });
    }

    const tags = meta.tags ? [...meta.tags] : [];
    return {
      version: "1.1",
      createdAt: new Date().toISOString(),
      answers,
      tags,
      mood: meta.firstMood || "indetermine"
    };
  }

  // --- SCENARIOS (adaptation pour TON fichier scenarios_v1_1.json) ---
  function pickRootId(tags) {
    const t = new Set((tags || []).map(x => String(x).toLowerCase()));
    if (t.has("sortie") || t.has("stop")) return "sortie";
    if (t.has("fatigue")) return "fatigue";
    if (t.has("stress") || t.has("anxiete")) return "flou";
    if (t.has("addiction")) return "protection";
    // sinon
    return "clarification";
  }

  function pickOne(arr) {
    if (!Array.isArray(arr) || !arr.length) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function buildScenarioText(session, lib) {
    if (!lib || !lib.modules || !lib.roots) return [];

    const tags = (session.tags || []).map(x => String(x).toLowerCase());
    const rootId = pickRootId(tags);
    const root = lib.roots[rootId] || lib.roots.clarification;

    const parts = [];

    // opening selon mood
    const mood = session.mood || "indetermine";
    const openArr = lib.modules?.openings?.[mood] || lib.modules?.openings?.indetermine || [];
    const opening = pickOne(openArr);
    if (opening) parts.push(opening);

    // thème (si présent)
    const themeMap = lib.modules?.themes || {};
    const tryThemeKeys = ["travail","finances","couple","famille","enfants","amis","sante","addiction","evenement","multiple","rien_de_precis","preferer_pas"];
    for (const k of tryThemeKeys) {
      if (tags.includes(k)) {
        const line = pickOne(themeMap[k]);
        if (line) parts.push(line);
      }
    }

    // vécu
    const vecuMap = lib.modules?.vecu || {};
    const tryVecu = ["melange","porter_seul","fatigue","tenir_coute","mots_difficiles","rien"];
    for (const k of tryVecu) {
      if (tags.includes(k) || (k === "fatigue" && tags.includes("fatigue"))) {
        const line = pickOne(vecuMap[k]);
        if (line) parts.push(line);
      }
    }

    // besoin
    const needsMap = lib.modules?.needs || {};
    const tryNeeds = ["mots","comprendre","moins_seul","normaliser","recul","presence","indetermine"];
    for (const k of tryNeeds) {
      if (tags.includes(k)) {
        const line = pickOne(needsMap[k]);
        if (line) parts.push(line);
      }
    }

    // énergie
    const energyMap = lib.modules?.energy || {};
    const tryEnergy = ["lecture","reflechir","parcourir","faible","indetermine"];
    for (const k of tryEnergy) {
      if (tags.includes(k)) {
        const line = pickOne(energyMap[k]);
        if (line) parts.push(line);
      }
    }

    // racine (texte principal)
    const rootText = Array.isArray(root.text) ? root.text.join("\n\n") : String(root.text || "");
    // on met l’opening/modules avant, puis racine
    const intro = parts.length ? parts.join("\n\n") + "\n\n" : "";
    const full = (intro + rootText).trim();

    return [{
      title: root.title || "Scénario",
      text: full
    }];
  }

  function finish() {
    const session = buildSession();

    // scénarios adaptatifs
    if (LIB) {
      session.scenarios = buildScenarioText(session, LIB);
    } else {
      session.scenarios = [];
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    window.location.href = "resultat.html";
  }

  function goNext() {
    const q = findQuestion(currentId);
    if (!q) return;

    const selected = getSelected();
    const ok = saveAnswerForCurrent(q, selected);

    if (!ok) {
      setError("Choisis au moins une réponse pour continuer.");
      return;
    }
    setError("");

    const next = computeNext(q, answersMap[String(q.id)]);
    if (!next) {
      finish();
      return;
    }
    history.push(String(q.id));
    renderQuestion(next);
  }

  function goBack() {
    if (!history.length) return;
    const prev = history.pop();
    renderQuestion(prev);
  }

  async function init() {
    try {
      // charge questions
      const qRes = await fetch(bust(QUESTIONS_URL), { cache: "no-store" });
      if (!qRes.ok) throw new Error("questions_v1_1.json introuvable (" + qRes.status + ")");
      const qData = await qRes.json();

      QUESTIONS = Array.isArray(qData) ? qData : (qData.questions || []);
      if (!Array.isArray(QUESTIONS) || !QUESTIONS.length) throw new Error("questions_v1_1.json est vide");

      // charge librairie scénarios (ton JSON modules/roots)
      try {
        const sRes = await fetch(bust(SCENARIOS_URL), { cache: "no-store" });
        if (sRes.ok) LIB = await sRes.json();
      } catch (e) { /* pas bloquant */ }

      // start
      const startId = String(qData && qData.start ? qData.start : QUESTIONS[0].id);
      renderQuestion(startId);

      if (btnNext) btnNext.addEventListener("click", goNext);
      if (btnBack) btnBack.addEventListener("click", goBack);
    } catch (e) {
      setError("Erreur : " + e.message);
      if (elTitle) elTitle.textContent = "Impossible de charger le questionnaire";
      if (elText) elText.textContent = "Vérifie que questions_v1_1.json est bien à la racine du site.";
      if (elOptions) elOptions.innerHTML = "";
      if (elHint) elHint.style.display = "none";
    }
  }

  init();
})();