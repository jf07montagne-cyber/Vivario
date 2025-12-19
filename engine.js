/* Vivario v1.1 — engine.js
   - Charge questions_v1_1.json
   - Enchaînement adaptatif (next par option, sinon next global)
   - ✅ Fallback: si aucun next, passe à la question suivante du JSON
   - Support single (radio) et multi (checkbox)
   - Texte libre si aucune option
   - Sauvegarde session stable dans localStorage
   - Scénarios depuis scenarios_v1_1.json (facultatif)
   - Son: autoplay au 1er geste + bouton ON/OFF si présent
*/

(() => {
  const STORAGE_KEY = "vivario_session_v1_1";
  const QUESTIONS_URL = "./questions_v1_1.json";
  const SCENARIOS_URL = "./scenarios_v1_1.json";

  // --- éléments UI attendus (selon tes captures)
  const elTitle = document.getElementById("qTitle");
  const elText = document.getElementById("qText");
  const elHint = document.getElementById("qHint");
  const elOptions = document.getElementById("options");
  const elErr = document.getElementById("err");
  const btnNext = document.getElementById("btnNext");
  const btnBack = document.getElementById("btnBack");

  // --- audio (optionnel)
  const bgAudio = document.getElementById("bgAudio"); // <audio id="bgAudio" ...>
  const btnSound = document.getElementById("btnSound"); // bouton ON/OFF si tu l'avais
  const SOUND_KEY = "vivario_sound_enabled_v1_1";

  // --- état
  let QUESTIONS = [];
  let SCENARIOS = [];
  let currentId = null;
  let history = []; // pile des ids
  let answersMap = {}; // id -> value(s)
  let meta = { tags: new Set() }; // tags simples

  function bust(url) {
    return url + (url.includes("?") ? "&" : "?") + "v=" + Date.now();
  }

  function setError(msg) {
    if (elErr) elErr.textContent = msg || "";
  }

  // --- normalisation
  function normalizeOptions(options) {
    if (!Array.isArray(options)) return [];
    return options.map((o) => {
      if (typeof o === "string") {
        return { value: o, label: o, next: null, tags: null };
      }
      return {
        value: o.value ?? o.id ?? o.key ?? o.label ?? "",
        label: o.label ?? o.text ?? o.title ?? String(o.value ?? ""),
        next: o.next ?? o.goto ?? o.to ?? null,
        tags: o.tags ?? o.themes ?? o.keywords ?? null
      };
    });
  }

  function findQuestion(id) {
    return QUESTIONS.find((q) => String(q.id) === String(id)) || null;
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

  // ✅ Fallback ajouté ici
  function qNextDefault(q) {
    // 1) next explicite si présent
    const explicit = q.next ?? q.goto ?? q.to ?? null;
    if (explicit !== null && explicit !== undefined && String(explicit).trim() !== "") {
      return String(explicit);
    }

    // 2) sinon : question suivante selon l'ordre du JSON
    const idx = QUESTIONS.findIndex((x) => String(x.id) === String(q.id));
    if (idx >= 0 && idx < QUESTIONS.length - 1) {
      return String(QUESTIONS[idx + 1].id);
    }

    // 3) sinon : fin
    return null;
  }

  // --- lecture sélection
  function getSelected() {
    const q = findQuestion(currentId);
    if (!q) return null;

    const multi = isMulti(q);
    const inputs = [...(elOptions?.querySelectorAll("input") || [])];
    if (!inputs.length) return null;

    if (!multi) {
      const r = inputs.find((i) => i.checked);
      return r ? r.value : null;
    } else {
      const checked = inputs.filter((i) => i.checked).map((i) => i.value);
      return checked.length ? checked : null;
    }
  }

  // --- tags / meta
  function addTag(t) {
    if (!t) return;
    meta.tags.add(String(t).toLowerCase());
  }

  function recordMeta(q, selected) {
    // theme / titre
    addTag(q.theme);
    addTag(qTitle(q));

    // tags depuis options (si option possède tags)
    const opts = normalizeOptions(q.options || q.choices || q.reponses);
    const applyOptTags = (val) => {
      const o = opts.find((x) => String(x.value) === String(val));
      if (o && o.tags) {
        const arr = Array.isArray(o.tags) ? o.tags : [o.tags];
        arr.forEach(addTag);
      }
    };

    if (Array.isArray(selected)) selected.forEach(applyOptTags);
    else applyOptTags(selected);

    // tags basés sur texte (simple heuristique)
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

  // --- render question
  function renderQuestion(id) {
    const q = findQuestion(id);
    if (!q) {
      setError("Question introuvable : " + id);
      return;
    }
    setError("");

    currentId = String(id);

    if (elTitle) elTitle.textContent = qTitle(q);
    if (elText) elText.textContent = qText(q);

    const multi = isMulti(q);
    if (elHint) {
      elHint.style.display = multi ? "block" : "none";
      elHint.textContent = multi ? "✅ Tu peux cocher plusieurs réponses." : "";
    }

    if (!elOptions) return;
    elOptions.innerHTML = "";

    const opts = normalizeOptions(q.options || q.choices || q.reponses);

    // --- texte libre si pas d'options
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

      // restore
      const prev = answersMap[String(id)];
      if (typeof prev === "string") {
        const ta = wrap.querySelector("#freeText");
        if (ta) ta.value = prev;
      }
      return;
    }

    const saved = answersMap[String(id)];

    // --- options
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

  // --- compute next
  function computeNext(q, selected) {
    const opts = normalizeOptions(q.options || q.choices || q.reponses);

    // 1) option -> next (prioritaire)
    if (opts.length) {
      if (Array.isArray(selected)) {
        // multi : si plusieurs next existent, on prend le 1er trouvé
        for (const v of selected) {
          const o = opts.find((x) => String(x.value) === String(v));
          if (o && o.next) return String(o.next);
        }
      } else {
        const o = opts.find((x) => String(x.value) === String(selected));
        if (o && o.next) return String(o.next);
      }
    }

    // 2) next global / fallback JSON order
    return qNextDefault(q);
  }

  // --- save answer
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

  // --- build session + scenarios
  function buildSession() {
    const answers = [];

    for (const id of Object.keys(answersMap)) {
      const q = findQuestion(id);
      if (!q) continue;

      const val = answersMap[id];
      let answerText = "";

      const opts = normalizeOptions(q.options || q.choices || q.reponses);
      if (opts.length) {
        if (Array.isArray(val)) {
          answerText = val
            .map((v) => (opts.find((o) => String(o.value) === String(v))?.label || String(v)))
            .join(", ");
        } else {
          answerText = opts.find((o) => String(o.value) === String(val))?.label || String(val);
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

    const tags = (session.tags || []).map((t) => String(t).toLowerCase());
    const list = SCENARIOS.map((s) => ({
      title: s.title || s.titre || "Scénario",
      text: s.text || s.contenu || s.description || "",
      tags: (s.tags || s.themes || s.keywords || []).map((x) => String(x).toLowerCase())
    }));

    let picked = list;
    if (tags.length) {
      const filtered = list.filter((s) => s.tags.some((t) => tags.includes(t)));
      if (filtered.length) picked = filtered;
    }

    return picked.slice(0, 6);
  }

  function finish() {
    const session = buildSession();
    session.scenarios = pickScenarios(session);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));

    // redirige
    window.location.href = "resultat.html";
  }

  // --- navigation
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

  // --- SON (optionnel)
  function getSoundEnabled() {
    const v = localStorage.getItem(SOUND_KEY);
    // défaut ON si jamais tu avais déjà un système avant
    return v === null ? true : v === "1";
  }

  function setSoundEnabled(on) {
    localStorage.setItem(SOUND_KEY, on ? "1" : "0");
  }

  function applySoundState() {
    if (!bgAudio) return;
    const enabled = getSoundEnabled();
    bgAudio.muted = !enabled;
    // si tu as un bouton
    if (btnSound) {
      btnSound.textContent = enabled ? "Son : ON" : "Son : OFF";
      btnSound.setAttribute("aria-pressed", enabled ? "true" : "false");
    }
  }

  function tryStartAudio() {
    if (!bgAudio) return;
    if (!getSoundEnabled()) return;
    bgAudio.volume = 0.25;
    bgAudio.play().catch(() => {});
  }

  function initSound() {
    if (!bgAudio) return;

    applySoundState();

    // mobile: démarrage au premier geste utilisateur (sinon bloqué)
    const start = () => {
      tryStartAudio();
    };
    document.addEventListener("click", start, { once: true });
    document.addEventListener("touchstart", start, { once: true });

    // bouton ON/OFF si tu l'as
    if (btnSound) {
      btnSound.addEventListener("click", () => {
        const newState = !getSoundEnabled();
        setSoundEnabled(newState);
        applySoundState();
        if (newState) tryStartAudio();
        else bgAudio.pause();
      });
    }
  }

  // --- init
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
      } catch (e) {
        // non bloquant
      }

      // son
      initSound();

      // start = première question
      const startId = String((qData && qData.start) ? qData.start : QUESTIONS[0].id);
      renderQuestion(startId);

      // events
      if (btnNext) btnNext.addEventListener("click", goNext);
      if (btnBack) btnBack.addEventListener("click", goBack);
    } catch (e) {
      setError("Erreur : " + e.message);
      if (elTitle) elTitle.textContent = "Impossible de charger le questionnaire";
      if (elText) elText.textContent = "Vérifie que questions_v1_1.json est bien à la racine du site (même niveau que questionnaire.html).";
      if (elOptions) elOptions.innerHTML = "";
      if (elHint) elHint.style.display = "none";
    }
  }

  init();
})();