/* Vivario v1.1 — engine.js
   - Charge questions_v1_1.json
   - Questionnaire adaptatif (next par option ou next global)
   - Fallback: si aucun next, passe à la question suivante dans la liste
   - Sauvegarde session stable dans localStorage
   - Scénarios: sélection depuis scenarios_v1_1.json (roots/modules)
   - Audio ambiance + toggle ON/OFF (mobile-friendly)
*/

(() => {
  const STORAGE_KEY = "vivario_session_v1_1";
  const SOUND_KEY = "vivario_sound_on";
  const QUESTIONS_URL = "./questions_v1_1.json";
  const SCENARIOS_URL = "./scenarios_v1_1.json";
  const AUDIO_URL = "./ambiance.mp3"; // mets le fichier à la racine

  // éléments UI (doivent exister dans questionnaire.html)
  const elTitle = document.getElementById("qTitle");
  const elText = document.getElementById("qText");
  const elHint = document.getElementById("qHint");
  const elOptions = document.getElementById("options");
  const elErr = document.getElementById("err");
  const btnNext = document.getElementById("btnNext");
  const btnBack = document.getElementById("btnBack");

  // NOUVEAU (compteur + son)
  const elCounter = document.getElementById("qCounter");     // optionnel mais recommandé
  const btnSound = document.getElementById("soundToggle");   // optionnel mais recommandé

  let QUESTIONS = [];
  let currentId = null;
  let history = []; // pile des ids
  let answersMap = {}; // id -> value(s)
  let meta = { tags: new Set() }; // tags simples
  let SCENARIO_LIB = null; // json scenarios

  // -------------------------
  // Helpers
  // -------------------------
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

  function qTitle(q) {
    return q.title || q.titre || q.theme || "Question";
  }
  function qText(q) {
    return q.text || q.question || q.prompt || "";
  }

  function qNextDefault(q) {
    return q.next || q.goto || q.to || null;
  }

  // fallback: question suivante dans l'ordre du JSON
  function nextByOrder(currentQuestionId) {
    const idx = QUESTIONS.findIndex(q => String(q.id) === String(currentQuestionId));
    if (idx >= 0 && idx < QUESTIONS.length - 1) return String(QUESTIONS[idx + 1].id);
    return null;
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

  function recordMeta(q, selected) {
    // tags depuis option tags
    const addTag = (t) => {
      if (!t) return;
      meta.tags = meta.tags || new Set();
      meta.tags.add(String(t).toLowerCase());
    };

    // theme / titre
    if (q.theme) addTag(q.theme);
    addTag(qTitle(q));

    // tags depuis option
    const opts = normalizeOptions(q.options || q.choices || q.reponses);
    const addOptTags = (val) => {
      const o = opts.find(x => String(x.value) === String(val));
      if (o && o.tags) {
        if (Array.isArray(o.tags)) o.tags.forEach(addTag);
        else addTag(o.tags);
      }
    };

    if (Array.isArray(selected)) selected.forEach(addOptTags);
    else addOptTags(selected);

    // tags depuis texte (petit NLP)
    const addFromText = (txt) => {
      const s = String(txt || "").toLowerCase();
      if (!s) return;
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

  function computeNext(q, selected) {
    const opts = normalizeOptions(q.options || q.choices || q.reponses);

    // 1) next par option
    if (opts.length) {
      if (Array.isArray(selected)) {
        for (const v of selected) {
          const o = opts.find(x => String(x.value) === String(v));
          if (o && o.next) return String(o.next);
        }
      } else {
        const o = opts.find(x => String(x.value) === String(selected));
        if (o && o.next) return String(o.next);
      }
    }

    // 2) next global sur la question
    const n = qNextDefault(q);
    if (n) return String(n);

    // 3) fallback: next dans l'ordre
    return nextByOrder(q.id);
  }

  // -------------------------
  // Render
  // -------------------------
  function renderCounter() {
    if (!elCounter || !currentId) return;
    const idx = QUESTIONS.findIndex(q => String(q.id) === String(currentId));
    const total = QUESTIONS.length;
    if (idx >= 0) elCounter.textContent = `Question ${idx + 1} / ${total}`;
    else elCounter.textContent = "";
  }

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

    // options
    elOptions.innerHTML = "";
    const opts = normalizeOptions(q.options || q.choices || q.reponses);

    // si pas d'options => champ libre
    if (!opts.length) {
      const wrap = document.createElement("div");
      wrap.className = "opt";
      wrap.innerHTML = `
        <div style="width:100%">
          <textarea id="freeText" rows="3"
            style="width:100%;background:transparent;color:inherit;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:10px"></textarea>
        </div>
      `;
      elOptions.appendChild(wrap);

      // restore
      const prev = answersMap[String(id)];
      if (typeof prev === "string") {
        wrap.querySelector("#freeText").value = prev;
      }

      renderCounter();
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

    renderCounter();
  }

  // -------------------------
  // Build session + scenarios
  // -------------------------
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
            .map(v => (opts.find(o => String(o.value) === String(v))?.label || String(v)))
            .join(", ");
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
    if (!SCENARIO_LIB) return [];
    const tags = (session.tags || []).map(t => String(t).toLowerCase());

    // règle simple:
    // - si tag contient fatigue => root fatigue
    // - sinon si stress/anxiete => root flou
    // - sinon par défaut clarification
    // - si l’utilisateur a un tag "sortie" => sortie (si tu l’ajoutes depuis questions)
    const roots = SCENARIO_LIB.roots || {};
    const getRoot = (id) => roots[id] ? roots[id] : null;

    let root = null;
    if (tags.includes("sortie") || tags.includes("stop") || tags.includes("pas_aide")) {
      root = getRoot("sortie");
    } else if (tags.includes("fatigue")) {
      root = getRoot("fatigue");
    } else if (tags.includes("stress") || tags.includes("anxiete")) {
      root = getRoot("flou");
    } else {
      root = getRoot("clarification");
    }

    if (!root) return [];

    // transforme root.text[] en texte multi-lignes
    const text = Array.isArray(root.text) ? root.text.join("\n\n") : String(root.text || "");

    return [{
      title: root.title || "Scénario",
      text,
      tags: tags
    }];
  }

  function finish() {
    const session = buildSession();
    session.scenarios = pickScenarios(session);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    window.location.href = "resultat.html";
  }

  // -------------------------
  // Audio
  // -------------------------
  let audio = null;
  let audioReady = false;
  let soundOn = true;

  function loadSoundPref() {
    const v = localStorage.getItem(SOUND_KEY);
    soundOn = (v === null) ? true : (v === "1");
  }
  function saveSoundPref() {
    localStorage.setItem(SOUND_KEY, soundOn ? "1" : "0");
  }

  function ensureAudio() {
    if (audio) return;
    audio = new Audio(AUDIO_URL);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0.6;

    audio.addEventListener("canplaythrough", () => { audioReady = true; }, { once: true });
  }

  async function tryPlayAudio() {
    ensureAudio();
    if (!soundOn) return;

    try {
      await audio.play();
    } catch (e) {
      // sur mobile: play bloqué tant qu'il n'y a pas d'interaction
      // on retentera après un tap
    }
  }

  function stopAudio() {
    if (!audio) return;
    audio.pause();
  }

  function updateSoundButton() {
    if (!btnSound) return;
    btnSound.textContent = soundOn ? "🔊 Son : ON" : "🔇 Son : OFF";
  }

  function bindFirstUserGestureToAudio() {
    // une seule fois: au 1er tap/click, on lance l'audio si ON
    const handler = async () => {
      document.removeEventListener("click", handler);
      document.removeEventListener("touchstart", handler);
      await tryPlayAudio();
    };
    document.addEventListener("click", handler, { once: true });
    document.addEventListener("touchstart", handler, { once: true });
  }

  function initSound() {
    loadSoundPref();
    updateSoundButton();
    ensureAudio();
    bindFirstUserGestureToAudio();

    if (btnSound) {
      btnSound.addEventListener("click", async () => {
        soundOn = !soundOn;
        saveSoundPref();
        updateSoundButton();
        if (soundOn) await tryPlayAudio();
        else stopAudio();
      });
    }
  }

  // -------------------------
  // Navigation
  // -------------------------
  function goNext() {
    const q = findQuestion(currentId);
    if (!q) return;

    // lance son après action utilisateur (utile si le 1er tap est sur "Suivant")
    tryPlayAudio();

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

  // -------------------------
  // Init
  // -------------------------
  async function init() {
    initSound();

    try {
      // charge questions
      const qRes = await fetch(bust(QUESTIONS_URL), { cache: "no-store" });
      if (!qRes.ok) throw new Error("questions_v1_1.json introuvable (" + qRes.status + ")");
      const qData = await qRes.json();
      QUESTIONS = Array.isArray(qData) ? qData : (qData.questions || []);
      if (!Array.isArray(QUESTIONS) || !QUESTIONS.length) throw new Error("questions_v1_1.json est vide");

      // charge scénarios (optionnel)
      try {
        const sRes = await fetch(bust(SCENARIOS_URL), { cache: "no-store" });
        if (sRes.ok) SCENARIO_LIB = await sRes.json();
      } catch (e) {
        // pas bloquant
      }

      // start = qData.start sinon 1ère question
      const startId = (qData && qData.start) ? String(qData.start) : String(QUESTIONS[0].id);
      renderQuestion(startId);

      if (btnNext) btnNext.addEventListener("click", goNext);
      if (btnBack) btnBack.addEventListener("click", goBack);

    } catch (e) {
      setError("Erreur : " + e.message);
      if (elTitle) elTitle.textContent = "Impossible de charger le questionnaire";
      if (elText) elText.textContent = "Vérifie que questions_v1_1.json est bien à la racine (même niveau que questionnaire.html).";
      if (elOptions) elOptions.innerHTML = "";
      if (elHint) elHint.style.display = "none";
    }
  }

  init();
})();