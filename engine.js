/* Vivario v1.1 — engine.js
   - Charge questions_v1_1.json
   - Questionnaire adaptatif (next par option, ou next global)
   - Support single (radio) et multi (checkbox)
   - Sauvegarde une session stable dans localStorage
   - Pré-sélectionne des scénarios depuis scenarios_v1_1.json (facultatif)
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
  const btnNext = document.getElementById("btnNext");
  const btnBack = document.getElementById("btnBack");

  let QUESTIONS = [];
  let SCENARIOS = [];
  let currentId = null;
  let history = []; // pile des ids
  let answersMap = {}; // id -> value(s)
  let meta = {}; // infos utiles (themes etc.)

  function bust(url) {
    return url + (url.includes("?") ? "&" : "?") + "v=" + Date.now();
  }

  function setError(msg) {
    elErr.textContent = msg || "";
  }

  function normalizeOptions(options) {
    if (!Array.isArray(options)) return [];
    return options.map(o => {
      if (typeof o === "string") return { value: o, label: o };
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

  function qTitle(q) {
    return q.title || q.titre || q.theme || "Question";
  }

  function qText(q) {
    return q.text || q.question || q.prompt || "";
  }

  function qNextDefault(q) {
    return q.next || q.goto || q.to || null;
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

  function renderQuestion(id) {
    const q = findQuestion(id);
    if (!q) {
      setError("Question introuvable : " + id);
      return;
    }
    setError("");

    currentId = id;

    elTitle.textContent = qTitle(q);
    elText.textContent = qText(q);

    const multi = isMulti(q);
    elHint.style.display = multi ? "block" : "none";
    elHint.textContent = multi ? "✅ Tu peux cocher plusieurs réponses." : "";

    elOptions.innerHTML = "";
    const opts = normalizeOptions(q.options || q.choices || q.reponses);

    if (!opts.length) {
      // question texte libre
      const wrap = document.createElement("div");
      wrap.className = "opt";
      wrap.innerHTML = `
        <div style="width:100%">
          <textarea id="freeText" rows="3" style="width:100%;background:transparent;color:inherit;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:10px"></textarea>
        </div>`;
      elOptions.appendChild(wrap);

      // restore
      const prev = answersMap[String(id)];
      if (typeof prev === "string") {
        wrap.querySelector("#freeText").value = prev;
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
        <div>
          <div style="font-weight:600">${opt.label}</div>
        </div>
      `;
      elOptions.appendChild(row);
    }
  }

  function computeNext(q, selected) {
    const opts = normalizeOptions(q.options || q.choices || q.reponses);

    // si option->next
    if (opts.length) {
      if (Array.isArray(selected)) {
        // multi : si plusieurs next existent, on prend le 1er trouvé (sinon next défaut)
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

  function recordMeta(q, selected) {
    // On garde des tags simples (pour scénarios)
    const addTag = (t) => {
      if (!t) return;
      meta.tags = meta.tags || new Set();
      meta.tags.add(String(t).toLowerCase());
    };

    // theme / titre
    if (q.theme) addTag(q.theme);
    if (qTitle(q)) addTag(qTitle(q));

    // contenu réponses
    const addFromText = (txt) => {
      const s = String(txt || "").toLowerCase();
      if (s.includes("fatigu")) addTag("fatigue");
      if (s.includes("stress")) addTag("stress");
      if (s.includes("anx")) addTag("anxiete");
      if (s.includes("addict")) addTag("addiction");
      if (s.includes("finance") || s.includes("dette")) addTag("finances");
      if (s.includes("enfant") || s.includes("parent")) addTag("parentalite");
      if (s.includes("travail") || s.includes("job") || s.includes("boulot")) addTag("travail");
      if (s.includes("amis") || s.includes("famille") || s.includes("couple")) addTag("relations");
    };

    if (Array.isArray(selected)) selected.forEach(addFromText);
    else addFromText(selected);
  }

  function buildSession() {
    // construit un résumé propre (sans q1/q2)
    const answers = [];

    for (const id of Object.keys(answersMap)) {
      const q = findQuestion(id);
      if (!q) continue;

      const val = answersMap[id];
      let answerText = "";

      // si options, on convertit value -> label
      const opts = normalizeOptions(q.options || q.choices || q.reponses);
      if (opts.length) {
        if (Array.isArray(val)) {
          answerText = val.map(v => (opts.find(o => String(o.value) === String(v))?.label || String(v))).join(", ");
        } else {
          answerText = (opts.find(o => String(o.value) === String(val))?.label || String(val));
        }
      } else {
        answerText = String(val || "");
      }

      answers.push({
        id: String(id),
        theme: q.theme || qTitle(q),
        question: qText(q),
        answer: answerText
      });
    }

    const tags = meta.tags ? [...meta.tags] : [];
    return {
      version: "1.1",
      createdAt: new Date().toISOString(),
      answers,
      tags
    };
  }

  function pickScenarios(session) {
    if (!Array.isArray(SCENARIOS) || !SCENARIOS.length) return [];
    const tags = (session.tags || []).map(t => String(t).toLowerCase());

    const list = SCENARIOS.map(s => ({
      title: s.title || s.titre || "Scénario",
      text: s.text || s.contenu || s.description || "",
      tags: (s.tags || s.themes || s.keywords || []).map(x => String(x).toLowerCase())
    }));

    // filtre doux par tags
    let picked = list;
    if (tags.length) {
      const filtered = list.filter(s => s.tags.some(t => tags.includes(t)));
      if (filtered.length) picked = filtered;
    }

    // limite
    return picked.slice(0, 6);
  }

  async function finish() {
    const session = buildSession();
    session.scenarios = pickScenarios(session);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    // redirige
    window.location.href = "resultat.html";
  }

  function saveAnswerForCurrent(q, selected) {
    const id = String(q.id);

    // cas texte libre
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
      // fin
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

      // charge scenarios (facultatif)
      try {
        const sRes = await fetch(bust(SCENARIOS_URL), { cache: "no-store" });
        if (sRes.ok) {
          const sData = await sRes.json();
          SCENARIOS = Array.isArray(sData) ? sData : (sData.scenarios || []);
        }
      } catch(e) { /* pas bloquant */ }

      // start = première question ou qData.start
      const startId = (qData && qData.start) ? String(qData.start) : String(QUESTIONS[0].id);
      renderQuestion(startId);

      btnNext.addEventListener("click", goNext);
      btnBack.addEventListener("click", goBack);
    } catch (e) {
      setError("Erreur : " + e.message);
      elTitle.textContent = "Impossible de charger le questionnaire";
      elText.textContent = "Vérifie que questions_v1_1.json est bien à la racine du site (même niveau que questionnaire.html).";
      elOptions.innerHTML = "";
      elHint.style.display = "none";
    }
  }

  init();
})();