/* onboarding_pro.js — Vivario PRO (Mode B: clinique premium)
   4 écrans : Objectif → Énergie → Priorités → Résumé
   SAFE: n’impacte aucune page existante.
*/
(() => {
  const KEY = "vivario_pro_onboarding_v1";

  const panes = [...document.querySelectorAll(".pane[data-pane]")];
  const stepPills = [...document.querySelectorAll(".stepPill[data-step]")];

  const btnBack = document.getElementById("btnBack");
  const btnNext = document.getElementById("btnNext");
  const btnReset = document.getElementById("btnReset");
  const btnStartPro = document.getElementById("btnStartPro");
  const btnSkip = document.getElementById("btnSkip");

  const breathStage = document.getElementById("breathStage");

  const goalWrap = document.getElementById("goalChoices");
  const goalOtherWrap = document.getElementById("goalOtherWrap");
  const goalOther = document.getElementById("goalOther");

  const energyRange = document.getElementById("energyRange");
  const energyValue = document.getElementById("energyValue");

  const stateWrap = document.getElementById("stateChoices");
  const domainWrap = document.getElementById("domainChoices");
  const note = document.getElementById("note");

  const summaryKV = document.getElementById("summaryKV");
  const summaryChips = document.getElementById("summaryChips");

  const goals = [
    { id: "apaiser_stress", title: "Apaiser le stress", desc: "Retrouver un calme stable et respirable." },
    { id: "retrouver_sommeil", title: "Retrouver le sommeil", desc: "Régulariser, couper le mental, récupérer." },
    { id: "sortir_rumination", title: "Stop aux ruminations", desc: "Diminuer la boucle mentale, clarifier." },
    { id: "decision_importante", title: "Décision importante", desc: "Choisir sans te perdre, un pas concret." },
    { id: "relation_couple", title: "Couple / relation", desc: "Tension, communication, sécurité affective." },
    { id: "travail_charge", title: "Travail / pression", desc: "Charge, burnout, limites, organisation." },
    { id: "addiction", title: "Addiction / compulsions", desc: "Substance, écrans, sexe, jeux… reprendre la main." },
    { id: "autre", title: "Autre", desc: "Tu précises en 1 phrase." }
  ];

  const states = [
    { id: "anxiete", title: "Anxiété", desc: "Tension, anticipation, peur diffuse." },
    { id: "fatigue", title: "Fatigue", desc: "Tout coûte, même le simple." },
    { id: "colere", title: "Irritabilité", desc: "Nerfs à vif, seuil bas." },
    { id: "tristesse", title: "Tristesse", desc: "Baisse morale, lourdeur." },
    { id: "panique", title: "Panique", desc: "Montées, souffle court, urgence." },
    { id: "vide", title: "Vide", desc: "Plus rien n’accroche." }
  ];

  const domains = [
    { id: "stress_anxiete", title: "Stress / anxiété", desc: "Tension, rumination, panique." },
    { id: "sommeil", title: "Sommeil", desc: "Endormissement, réveils, rythme." },
    { id: "humeur", title: "Humeur", desc: "Tristesse, irritabilité, instabilité." },
    { id: "trauma", title: "Trauma", desc: "Déclencheurs, hypervigilance, souvenirs." },
    { id: "tca", title: "TCA", desc: "Compulsions, restriction, rapport au corps." },
    { id: "estime", title: "Estime", desc: "Valeur personnelle, confiance." },
    { id: "organisation", title: "Organisation", desc: "Charge mentale, routines, chaos." },
    { id: "social", title: "Social", desc: "Isolement, limites, liens." },
    { id: "couple", title: "Couple", desc: "Confiance, communication, conflits." },
    { id: "parentalite", title: "Parentalité", desc: "Épuisement, culpabilité, cadre." },
    { id: "sante", title: "Santé", desc: "Douleurs, énergie, hygiène de vie." },
    { id: "addictions", title: "Addictions", desc: "Alcool, drogues, écrans, sexe, jeux." },
    { id: "travail_etudes", title: "Travail / études", desc: "Pression, sens, limites." },
    { id: "argent", title: "Argent", desc: "Stress financier, insécurité." }
  ];

  const state = {
    step: 0,
    goal: null,
    goal_other: "",
    energy: 5,
    main_state: null,
    domains: [],
    note: ""
  };

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ ...state, saved_at: new Date().toISOString() })); } catch {}
  }
  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || "null");
      if (!v) return;
      Object.assign(state, {
        step: 0,
        goal: v.goal || null,
        goal_other: v.goal_other || "",
        energy: Number.isFinite(Number(v.energy)) ? Number(v.energy) : 5,
        main_state: v.main_state || null,
        domains: Array.isArray(v.domains) ? v.domains : [],
        note: v.note || ""
      });
    } catch {}
  }
  function resetAll() {
    localStorage.removeItem(KEY);
    state.step = 0;
    state.goal = null;
    state.goal_other = "";
    state.energy = 5;
    state.main_state = null;
    state.domains = [];
    state.note = "";
    renderAll();
  }

  function setStep(n) {
    state.step = Math.max(0, Math.min(3, n));
    panes.forEach(p => p.classList.toggle("active", Number(p.dataset.pane) === state.step));
    stepPills.forEach(s => s.classList.toggle("active", Number(s.dataset.step) === state.step));

    btnBack.disabled = state.step === 0;
    btnNext.style.display = state.step === 3 ? "none" : "inline-flex";
    btnStartPro.style.display = state.step === 3 ? "inline-flex" : "none";

    if (state.step === 3) renderSummary();
    save();
  }

  function makeChoiceCard({ id, title, desc }, selected, onClick) {
    const el = document.createElement("div");
    el.className = "choice" + (selected ? " selected" : "");
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    el.dataset.id = id;
    el.innerHTML = `
      <p class="k">${title}</p>
      <p class="v">${desc}</p>
    `;
    const handler = () => onClick(id);
    el.addEventListener("click", handler);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handler(); }
    });
    return el;
  }

  function renderGoals() {
    goalWrap.innerHTML = "";
    goals.forEach(g => {
      goalWrap.appendChild(makeChoiceCard(g, state.goal === g.id, (id) => {
        state.goal = id;
        goalOtherWrap.style.display = (id === "autre") ? "block" : "none";
        renderGoals();
        save();
      }));
    });
    goalOther.value = state.goal_other || "";
    goalOtherWrap.style.display = (state.goal === "autre") ? "block" : "none";
  }

  function renderStates() {
    stateWrap.innerHTML = "";
    states.forEach(s => {
      stateWrap.appendChild(makeChoiceCard(s, state.main_state === s.id, (id) => {
        state.main_state = (state.main_state === id) ? null : id;
        renderStates();
        save();
      }));
    });
  }

  function renderDomains() {
    domainWrap.innerHTML = "";
    domains.forEach(d => {
      const selected = state.domains.includes(d.id);
      domainWrap.appendChild(makeChoiceCard(d, selected, (id) => {
        if (state.domains.includes(id)) state.domains = state.domains.filter(x => x !== id);
        else state.domains = [...state.domains, id];
        renderDomains();
        save();
      }));
    });
  }

  function renderEnergy() {
    energyRange.value = String(state.energy);
    energyValue.textContent = `${state.energy}/10`;
  }

  function energyLabel(n) {
    if (n <= 2) return "basse";
    if (n <= 5) return "moyenne";
    if (n <= 8) return "bonne";
    return "élevée";
  }

  function goalLabel(id) {
    const g = goals.find(x => x.id === id);
    if (!g) return "Non défini";
    if (id === "autre") return state.goal_other?.trim() ? `Autre — ${state.goal_other.trim()}` : "Autre";
    return g.title;
  }

  function renderSummary() {
    const domLabels = state.domains
      .map(id => domains.find(d => d.id === id)?.title)
      .filter(Boolean);

    summaryKV.innerHTML = `
      <div class="kvItem">
        <div class="k">Objectif</div>
        <p class="v">${escapeHtml(goalLabel(state.goal))}</p>
      </div>
      <div class="kvItem">
        <div class="k">Énergie</div>
        <p class="v">${state.energy}/10 (${energyLabel(state.energy)})</p>
      </div>
      <div class="kvItem">
        <div class="k">État dominant</div>
        <p class="v">${escapeHtml(states.find(s => s.id === state.main_state)?.title || "—")}</p>
      </div>
      <div class="kvItem">
        <div class="k">Note</div>
        <p class="v">${escapeHtml(state.note?.trim() || "—")}</p>
      </div>
    `;

    summaryChips.innerHTML = "";
    if (domLabels.length) {
      domLabels.slice(0, 14).forEach(t => {
        const chip = document.createElement("span");
        chip.className = "pro-chip";
        chip.textContent = t;
        summaryChips.appendChild(chip);
      });
    } else {
      const chip = document.createElement("span");
      chip.className = "pro-chip";
      chip.textContent = "Aucune priorité sélectionnée (ok)";
      summaryChips.appendChild(chip);
    }
  }

  function renderAll() {
    renderGoals();
    renderEnergy();
    renderStates();
    renderDomains();
    note.value = state.note || "";
    setStep(state.step);
  }

  function canGoNext() {
    // Step 0: objectif requis (si "autre", texte conseillé mais pas bloquant)
    if (state.step === 0) return !!state.goal;
    return true;
  }

  function goNext() {
    if (!canGoNext()) {
      // micro feedback
      try { navigator.vibrate?.(20); } catch {}
      return;
    }
    setStep(state.step + 1);
  }

  function goBack() {
    setStep(state.step - 1);
  }

  function startPro() {
    // Enregistre, puis redirige vers le questionnaire PRO
    save();
    window.location.href = "questionnaire_pro.html?v=18";
  }

  function skip() {
    // “Passer” = accès direct au questionnaire PRO
    startPro();
  }

  // Breath stage text sync (simple)
  const breathCycle = [
    { t: "Inspire", ms: 2900 },
    { t: "Pause", ms: 1200 },
    { t: "Expire", ms: 3100 }
  ];
  let bi = 0;
  function runBreath() {
    try { breathStage.textContent = breathCycle[bi].t; } catch {}
    const d = breathCycle[bi].ms;
    bi = (bi + 1) % breathCycle.length;
    setTimeout(runBreath, d);
  }

  function escapeHtml(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // Events
  btnNext?.addEventListener("click", goNext);
  btnBack?.addEventListener("click", goBack);
  btnReset?.addEventListener("click", resetAll);
  btnStartPro?.addEventListener("click", startPro);
  btnSkip?.addEventListener("click", skip);

  energyRange?.addEventListener("input", () => {
    state.energy = Number(energyRange.value || 5);
    renderEnergy();
    save();
  });

  goalOther?.addEventListener("input", () => {
    state.goal_other = String(goalOther.value || "");
    save();
  });

  note?.addEventListener("input", () => {
    state.note = String(note.value || "");
    save();
  });

  // Init
  load();
  renderAll();
  runBreath();
})();