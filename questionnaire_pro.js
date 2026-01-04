/* questionnaire_pro.js — Vivario PRO
   Renderer adaptatif premium
   v1.0 — SAFE (n’impacte PAS le gratuit)
*/

(() => {
  const STATE_KEY = "vivario_pro_state_v1";

  // ====== STATE ======
  const state = {
    answers: {},          // { blockId: value }
    scores: {},           // rempli par pro_logic.js
    shownBlocks: [],      // ordre réel affiché
    energy: "medium",     // low | medium | high
    startedAt: Date.now()
  };

  // ====== ELEMENTS ======
  const root = document.getElementById("pro-root");
  const titleEl = document.getElementById("pro-title");
  const subtitleEl = document.getElementById("pro-subtitle");
  const progressEl = document.getElementById("pro-progress");
  const contentEl = document.getElementById("pro-content");
  const btnNext = document.getElementById("pro-next");
  const btnBack = document.getElementById("pro-back");

  if (!root) return;

  // ====== LOAD JSON ======
  let PRO_JSON = null;

  fetch("questionnaire_pro.json")
    .then(r => r.json())
    .then(json => {
      PRO_JSON = json;
      init();
    })
    .catch(() => {
      contentEl.innerHTML = `<p class="muted">Erreur de chargement du questionnaire PRO.</p>`;
    });

  // ====== INIT ======
  function init() {
    restore();
    detectEnergy();
    renderNextBlock();
    bindUI();
  }

  function bindUI() {
    btnNext.addEventListener("click", () => {
      if (!validateCurrent()) return;
      renderNextBlock();
    });

    btnBack.addEventListener("click", () => {
      goBack();
    });
  }

  // ====== ENERGY ADAPTATION ======
  function detectEnergy() {
    // priorité à une réponse explicite si elle existe
    if (state.answers.energy) {
      state.energy = state.answers.energy;
      return;
    }

    // fallback temps + volume
    const elapsed = (Date.now() - state.startedAt) / 1000;
    if (elapsed < 60) state.energy = "high";
    else if (elapsed < 180) state.energy = "medium";
    else state.energy = "low";
  }

  function shouldStopEarly() {
    if (state.energy === "high") return false;
    if (state.energy === "medium" && state.shownBlocks.length > 14) return true;
    if (state.energy === "low" && state.shownBlocks.length > 8) return true;
    return false;
  }

  // ====== BLOCK FLOW ======
  function getNextBlock() {
    const logic = window.VivarioProLogic;
    if (!logic) return null;

    return logic.nextBlock({
      json: PRO_JSON,
      answers: state.answers,
      shown: state.shownBlocks,
      energy: state.energy
    });
  }

  function renderNextBlock() {
    if (shouldStopEarly()) {
      finishEarly();
      return;
    }

    const block = getNextBlock();
    if (!block) {
      finish();
      return;
    }

    state.shownBlocks.push(block.id);
    save();

    renderBlock(block);
    updateProgress();
  }

  function goBack() {
    if (state.shownBlocks.length <= 1) return;

    state.shownBlocks.pop();
    const last = state.shownBlocks[state.shownBlocks.length - 1];
    const block = PRO_JSON.blocks.find(b => b.id === last);
    if (block) renderBlock(block);
    save();
    updateProgress();
  }

  // ====== RENDER ======
  function renderBlock(block) {
    titleEl.textContent = block.title || "Question";
    subtitleEl.textContent = block.subtitle || "";

    contentEl.innerHTML = "";

    if (block.type === "single" || block.type === "multi") {
      renderOptions(block);
    } else if (block.type === "scale") {
      renderScale(block);
    } else if (block.type === "text") {
      renderText(block);
    }
  }

  function renderOptions(block) {
    const prev = state.answers[block.id];

    block.options.forEach(opt => {
      const row = document.createElement("label");
      row.className = "pro-option";

      const input = document.createElement("input");
      input.type = block.type === "single" ? "radio" : "checkbox";
      input.name = block.id;
      input.value = opt.id;

      if (
        (block.type === "single" && prev === opt.id) ||
        (block.type === "multi" && Array.isArray(prev) && prev.includes(opt.id))
      ) {
        input.checked = true;
      }

      input.addEventListener("change", () => {
        if (block.type === "single") {
          state.answers[block.id] = opt.id;
        } else {
          const arr = Array.isArray(state.answers[block.id])
            ? state.answers[block.id]
            : [];
          if (input.checked) {
            arr.push(opt.id);
          } else {
            const i = arr.indexOf(opt.id);
            if (i >= 0) arr.splice(i, 1);
          }
          state.answers[block.id] = arr;
        }
        save();
      });

      const span = document.createElement("span");
      span.textContent = opt.label;

      row.appendChild(input);
      row.appendChild(span);
      contentEl.appendChild(row);
    });
  }

  function renderScale(block) {
    const prev = state.answers[block.id] ?? block.default ?? 5;

    const wrap = document.createElement("div");
    wrap.className = "pro-scale";

    const input = document.createElement("input");
    input.type = "range";
    input.min = block.min || 0;
    input.max = block.max || 10;
    input.value = prev;

    const value = document.createElement("div");
    value.className = "pro-scale-value";
    value.textContent = prev;

    input.addEventListener("input", () => {
      value.textContent = input.value;
      state.answers[block.id] = Number(input.value);
      save();
    });

    wrap.appendChild(input);
    wrap.appendChild(value);
    contentEl.appendChild(wrap);
  }

  function renderText(block) {
    const textarea = document.createElement("textarea");
    textarea.className = "pro-textarea";
    textarea.placeholder = block.placeholder || "";

    if (state.answers[block.id]) {
      textarea.value = state.answers[block.id];
    }

    textarea.addEventListener("input", () => {
      state.answers[block.id] = textarea.value;
      save();
    });

    contentEl.appendChild(textarea);
  }

  // ====== VALIDATION ======
  function validateCurrent() {
    const currentId = state.shownBlocks[state.shownBlocks.length - 1];
    const block = PRO_JSON.blocks.find(b => b.id === currentId);
    if (!block) return true;

    const val = state.answers[currentId];
    if (block.required && (val === undefined || val === "" || (Array.isArray(val) && !val.length))) {
      alert("Prends un instant pour répondre avant de continuer.");
      return false;
    }
    return true;
  }

  // ====== PROGRESS ======
  function updateProgress() {
    const pct = Math.min(100, Math.round((state.shownBlocks.length / PRO_JSON.max_blocks) * 100));
    progressEl.style.width = pct + "%";
  }

  // ====== FIN ======
  function finishEarly() {
    contentEl.innerHTML = `
      <p class="bigtext">
        On s’arrête ici pour respecter ton énergie.
      </p>
      <p class="muted">
        Vivario PRO a déjà suffisamment d’éléments pour te proposer
        un diagnostic utile et un plan personnalisé.
      </p>
    `;
    btnNext.textContent = "Voir mon diagnostic";
    btnNext.onclick = finish;
  }

  function finish() {
    save();
    window.location.href = "resultat_pro.html";
  }

  // ====== STORAGE ======
  function save() {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }

  function restore() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        Object.assign(state, data);
      }
    } catch {}
  }

})();