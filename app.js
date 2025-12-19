/* Vivario 1.1 — Questionnaire 5 questions + scénarios adaptatifs modulaires
   Stockage local uniquement (localStorage). Netlify Forms uniquement pour avis.html (inchangé).
*/

(function () {
  const VIVARIO = {};
  window.VIVARIO = VIVARIO;

  // -----------------------------
  // Audio (optionnel, OFF par défaut)
  // -----------------------------
  const AUDIO_FILE = "ambiance_mer_vent_doux.wav";
  let audio = null;
  let audioOn = false;

  function ensureAudio() {
    if (audio) return;
    audio = new Audio(AUDIO_FILE);
    audio.loop = true;
    audio.volume = 0.18;
  }

  function setSoundUI(on) {
    const btn = document.getElementById("soundToggle");
    const hint = document.getElementById("soundHint");
    if (btn) btn.textContent = on ? "🔊" : "🔇";
    if (hint) hint.textContent = on ? "Ambiance : ON" : "Ambiance : OFF";
  }

  function toggleSound() {
    try {
      ensureAudio();
      audioOn = !audioOn;
      if (audioOn) audio.play();
      else audio.pause();
      setSoundUI(audioOn);
      localStorage.setItem("vivario_sound_on", audioOn ? "1" : "0");
    } catch (e) {
      // silencieux
    }
  }

  function initSound() {
    const saved = localStorage.getItem("vivario_sound_on");
    audioOn = saved === "1";
    setSoundUI(audioOn);
    const btn = document.getElementById("soundToggle");
    if (btn) btn.addEventListener("click", toggleSound);
    // ne lance pas automatiquement pour éviter les blocages navigateur
  }

  // -----------------------------
  // Storage
  // -----------------------------
  const STORE_KEY = "vivario_answers_v11";

  VIVARIO.loadAnswers = function () {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  VIVARIO.saveAnswers = function (obj) {
    localStorage.setItem(STORE_KEY, JSON.stringify(obj));
  };

  VIVARIO.clearAnswers = function () {
    localStorage.removeItem(STORE_KEY);
  };

  // -----------------------------
  // Questions (5)
  // -----------------------------
  const QUESTIONS = [
    {
      id: "q1",
      type: "multi",
      title: "Comment te sens-tu en ce moment, globalement ?",
      sub: "Il n’y a pas de bonne ou de mauvaise réponse. Tu peux sélectionner une ou plusieurs réponses.",
      options: [
        "Je me sens plutôt bien, mais un peu fatigué(e) mentalement",
        "Je me sens perdu(e), j’ai du mal à faire le point",
        "Je me sens sous pression ou stressé(e) en ce moment",
        "Je me sens vide, démotivé(e), sans trop savoir pourquoi",
        "Je me sens mal, et ça dure depuis un moment",
        "Je ne sais pas vraiment comment je me sens",
      ],
    },
    {
      id: "q2",
      type: "multi",
      title: "Ces derniers temps, qu’est-ce qui te pèse le plus ?",
      sub: "Tu peux sélectionner une ou plusieurs réponses.",
      options: [
        "La fatigue mentale ou émotionnelle",
        "Le travail ou la pression professionnelle",
        "La situation familiale ou personnelle",
        "Un sentiment de solitude ou d’incompréhension",
        "Des préoccupations liées à la santé",
        "Une addiction ou une habitude difficile à gérer",
        "Des difficultés liées aux enfants ou à la parentalité",
        "Plusieurs choses en même temps",
        "Je préfère ne pas préciser",
      ],
    },
    {
      id: "q3",
      type: "multi",
      title: "Quand tu penses à ta situation actuelle, qu’est-ce qui te traverse le plus souvent ?",
      sub: "Tu peux sélectionner une ou plusieurs réponses.",
      options: [
        "J’ai beaucoup de choses en tête et j’ai du mal à faire le tri",
        "Je ressens une pression intérieure, même sans raison précise",
        "J’ai l’impression de tenir, mais au prix de beaucoup d’efforts",
        "Je me sens bloqué(e), comme si je tournais en rond",
        "Je fais ce que je peux, sans trop savoir si je vais dans le bon sens",
        "Je me sens assez stable, même si tout n’est pas simple",
        "Je ne sais pas vraiment comment décrire ce que je ressens",
      ],
    },
    {
      id: "q4",
      type: "multi",
      title: "Dans ce que tu vis en ce moment, qu’est-ce qui t’aide, même légèrement ?",
      sub: "Tu peux sélectionner une ou plusieurs réponses.",
      options: [
        "Le fait de mettre des mots sur ce que je ressens",
        "Me sentir compris(e) ou reconnu(e)",
        "Prendre du temps pour moi, même court",
        "Être distrait(e) ou occupé(e)",
        "Parler à quelqu’un (ou en avoir envie)",
        "Rien en particulier pour l’instant",
        "Je ne sais pas vraiment",
      ],
    },
    {
      id: "q5",
      type: "single",
      title: "En ce moment, comment te situes-tu face à l’idée de faire évoluer ta situation ?",
      sub: "Une seule réponse suffit.",
      options: [
        "J’ai envie que les choses changent, mais je ne sais pas par où commencer",
        "Je fais déjà des efforts, même si ce n’est pas toujours visible",
        "Je n’ai pas l’énergie de faire plus pour l’instant",
        "Je préfère prendre du recul avant de penser à changer quoi que ce soit",
        "Je ne me pose pas vraiment la question en ce moment",
      ],
    },
  ];

  // -----------------------------
  // Seeded RNG (pour variations stables)
  // -----------------------------
  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    return function () {
      let t = (seed += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pick(rng, arr) {
    return arr[Math.floor(rng() * arr.length)];
  }

  // -----------------------------
  // Flags & règles B
  // -----------------------------
  VIVARIO.computeFlags = function (ans) {
    const q1 = ans.q1 || [];
    const q2 = ans.q2 || [];
    const q3 = ans.q3 || [];
    const q4 = ans.q4 || [];
    const q5 = ans.q5 || "";

    // Emotion dominante (priorité)
    let emotion = "stabilite";
    const q1s = q1.join(" | ").toLowerCase();
    if (q1s.includes("fatigu") || q1s.includes("vide") || q1s.includes("dur")) emotion = "fatigue";
    else if (q1s.includes("pression") || q1s.includes("stress")) emotion = "pression";
    else if (q1s.includes("perdu") || q1s.includes("sais pas")) emotion = "flou";

    // Contexte principal (Q2 priorité)
    let contexte = "aucun";
    const q2s = q2.join(" | ").toLowerCase();
    if (q2s.includes("addiction")) contexte = "addiction";
    else if (q2s.includes("enfant")) contexte = "enfants";
    else if (q2s.includes("travail")) contexte = "travail";
    else if (q2s.includes("santé")) contexte = "sante";
    else if (q2s.includes("famil")) contexte = "personnel";
    else if (q2s.includes("solitude") || q2s.includes("incompr")) contexte = "solitude";
    else if (q2s.includes("préfère ne pas")) contexte = "aucun";

    // Type scénario via Q5
    const q5s = (q5 || "").toLowerCase();
    let scenarioBase = "realiste";
    if (q5s.includes("pas l’énergie") || q5s.includes("recul")) scenarioBase = "prudent";
    else if (q5s.includes("déjà des efforts")) scenarioBase = "engage";

    // Normalisation
    const countAnswers = (q1.length + q2.length + q3.length + q4.length + (q5 ? 1 : 0));
    const manyThings = q2s.includes("plusieurs choses");
    const normaliser = manyThings || countAnswers >= 10; // ~3+ multi cochés => souvent >=10 items

    // Secondaire Q3 (surcharge/blocage)
    const q3s = q3.join(" | ").toLowerCase();
    const hasSurcharge = q3s.includes("beaucoup") || q3s.includes("tri");
    const hasBlocage = q3s.includes("bloqué") || q3s.includes("tournais en rond");

    // Ressources
    const q4s = q4.join(" | ").toLowerCase();
    const aideMots = q4s.includes("mettre des mots");
    const aideCompris = q4s.includes("compris");
    const aideRien = q4s.includes("rien en particulier");

    // Seed stable
    const seed = hashString(JSON.stringify(ans));
    const rng = mulberry32(seed);

    return {
      q1, q2, q3, q4, q5,
      emotion,
      contexte,
      scenarioBase,
      normaliser,
      hasSurcharge,
      hasBlocage,
      aideMots,
      aideCompris,
      aideRien,
      rng,
      countAnswers
    };
  };

  // -----------------------------
  // Bibliothèque modulaire
  // -----------------------------
  const OPENINGS = {
    prudent: [
      "Ce que tu ressens en ce moment mérite d’être accueilli tel quel.",
      "Prendre ce temps pour regarder ce que tu vis est déjà une forme d’attention envers toi-même."
    ],
    realiste: [
      "Ce que tu vis semble demander de la clarté, sans te juger.",
      "Le simple fait de poser les choses ici est déjà une manière de reprendre un peu de recul."
    ],
    engage: [
      "Ce que tu fais aujourd’hui compte déjà, même si ce n’est pas spectaculaire.",
      "Le fait de te regarder avec honnêteté est déjà une force."
    ]
  };

  const EMOTIONS = {
    fatigue: "La fatigue mentale peut rendre chaque chose plus lourde, même celles qui semblaient simples auparavant.",
    pression: "Vivre sous pression constante laisse rarement de place pour souffler.",
    flou: "Se sentir perdu peut donner l’impression de ne plus savoir où poser son attention.",
    stabilite: "On peut se sentir plutôt stable tout en portant quelque chose de difficile à l’intérieur."
  };

  const CONTEXTES = {
    addiction: "Vivre avec une habitude difficile à gérer peut être éprouvant, parfois silencieusement.",
    enfants: "Les responsabilités liées aux enfants peuvent prendre beaucoup de place, souvent sans laisser de temps pour soi.",
    travail: "Les exigences professionnelles peuvent prendre beaucoup de place, parfois sans que l’on s’en rende compte.",
    sante: "Les préoccupations liées à la santé mobilisent souvent beaucoup d’énergie intérieure.",
    personnel: "Les situations personnelles peuvent être lourdes à porter, surtout lorsqu’elles durent.",
    solitude: "Se sentir seul ou incompris peut accentuer le poids de ce que l’on traverse.",
    aucun: ""
  };

  const SECONDARIES = [
    "Quand beaucoup de choses s’accumulent, il devient difficile de faire le tri sans se fatiguer davantage.",
    "Se sentir bloqué(e) peut donner l’impression de tourner en rond, même quand on fait de son mieux."
  ];

  const NORMALISATION = "Le fait que plusieurs éléments se mélangent est normal : les situations humaines sont rarement simples ou linéaires.";

  const POSTURES = {
    "J’ai envie que les choses changent, mais je ne sais pas par où commencer":
      "Avoir envie que les choses évoluent sans savoir comment est une situation fréquente — tu n’as pas à trouver tout de suite.",
    "Je fais déjà des efforts, même si ce n’est pas toujours visible":
      "Les efforts discrets, invisibles, sont souvent les plus difficiles à reconnaître — pourtant ils comptent.",
    "Je n’ai pas l’énergie de faire plus pour l’instant":
      "Ne pas avoir l’énergie d’aller plus loin pour l’instant est totalement légitime. Tu n’as rien à forcer.",
    "Je préfère prendre du recul avant de penser à changer quoi que ce soit":
      "Prendre du recul peut être une manière de te protéger. Tu peux avancer à ton rythme, sans pression.",
    "Je ne me pose pas vraiment la question en ce moment":
      "Ne pas te poser la question maintenant peut aussi être une façon de respirer. Tu as le droit d’être simplement là."
  };

  const FIN = [
    "Merci d’avoir pris ce temps.",
    "Si vous le souhaitez, vous pouvez simplement rester avec ce que cela fait émerger, ou revenir plus tard. Vivario respecte votre rythme."
  ];

  // -----------------------------
  // Assembleur (règles B)
  // -----------------------------
  VIVARIO.composeScenario = function (flags, modeLetter) {
    // mapping P/R/E
    const base =
      modeLetter === "P" ? "prudent" :
      modeLetter === "E" ? "engage" : "realiste";

    // Q5 domine: si posture = pas d’énergie/recul => prudent; si efforts => engagé; sinon réaliste
    let scenario = flags.scenarioBase;
    // On garde 3 lectures, mais chacune reste cohérente avec Q5 :
    // - Si Q5 impose prudent, même E sera plus doux, etc.
    // Ici: on ne remplace pas le type, on ajuste le ton via opening + posture + limites.

    const rng = flags.rng;

    const sentences = [];

    // 1) ouverture (selon lecture choisie)
    sentences.push(pick(rng, OPENINGS[base]));

    // 2) émotion dominante
    sentences.push(EMOTIONS[flags.emotion] || EMOTIONS.stabilite);

    // 3) secondaire optionnel (1 max) si surcharge/blocage et place
    // mais évite d’alourdir si fatigue + pas d’énergie
    const q5s = (flags.q5 || "").toLowerCase();
    const veryLowEnergy = q5s.includes("pas l’énergie");
    if (!veryLowEnergy) {
      if (flags.hasSurcharge && sentences.length < 4) sentences.push(SECONDARIES[0]);
      else if (flags.hasBlocage && sentences.length < 4) sentences.push(SECONDARIES[1]);
    }

    // 4) contexte (1 max)
    if (flags.contexte && flags.contexte !== "aucun" && sentences.length < 5) {
      const c = CONTEXTES[flags.contexte];
      if (c) sentences.push(c);
    }

    // 5) normalisation conditionnelle
    if (flags.normaliser && sentences.length < 6) {
      sentences.push(NORMALISATION);
    }

    // 6) posture (obligatoire, Q5)
    if (POSTURES[flags.q5]) {
      sentences.push(POSTURES[flags.q5]);
    } else {
      // fallback doux
      sentences.push("Tu peux avancer à ton rythme, même si aujourd’hui tu n’as pas toutes les réponses.");
    }

    // 7) FIN (2 phrases)
    sentences.push(FIN[0]);
    sentences.push(FIN[1]);

    // garde-fou longueur max (8 phrases)
    while (sentences.length > 8) {
      // retire d'abord normalisation, puis contexte, puis secondaire
      const idxNorm = sentences.indexOf(NORMALISATION);
      if (idxNorm !== -1) { sentences.splice(idxNorm, 1); continue; }

      const ctxVals = Object.values(CONTEXTES).filter(Boolean);
      const idxCtx = sentences.findIndex(s => ctxVals.includes(s));
      if (idxCtx !== -1) { sentences.splice(idxCtx, 1); continue; }

      const idxSec = sentences.findIndex(s => SECONDARIES.includes(s));
      if (idxSec !== -1) { sentences.splice(idxSec, 1); continue; }

      break;
    }

    // rendu HTML
    return `<p>${sentences.join("</p><p>")}</p>`;
  };

  VIVARIO.buildGlobalRead = function (flags) {
    // courte phrase globale, non directive
    const bits = [];
    if (flags.aideMots) bits.push("mettre des mots aide déjà");
    if (flags.aideCompris) bits.push("se sentir reconnu(e) compte");
    if (flags.aideRien) bits.push("ne rien identifier pour l’instant est normal");

    if (bits.length === 0) {
      return "Ici, l’essentiel est d’être accueilli(e) tel que tu es, sans pression.";
    }
    return "Ce qui ressort ici : " + bits.join(", ") + ".";
  };

  VIVARIO.buildSummary = function (flags) {
    const emo = {
      fatigue: "fatigue mentale",
      pression: "pression / stress",
      flou: "perte de repères",
      stabilite: "stabilité fragile"
    }[flags.emotion] || "quelque chose de difficile";

    const ctx = {
      addiction: "une habitude difficile à gérer",
      enfants: "la parentalité / les enfants",
      travail: "le travail",
      sante: "la santé",
      personnel: "la situation personnelle",
      solitude: "la solitude / l’incompréhension",
      aucun: ""
    }[flags.contexte] || "";

    const posture = flags.q5 ? `Posture du moment : ${flags.q5}.` : "";
    const partCtx = ctx ? `Contexte principal : ${ctx}.` : "";

    return `Résumé Vivario : état dominant = ${emo}. ${partCtx} ${posture}`.replace(/\s+/g, " ").trim();
  };

  // -----------------------------
  // Questionnaire renderer
  // -----------------------------
  function renderQuestion(stepIdx, ans) {
    const q = QUESTIONS[stepIdx];
    const quiz = document.getElementById("quiz");
    if (!quiz) return;

    quiz.innerHTML = "";

    const h = document.createElement("div");
    h.className = "qtitle";
    h.textContent = q.title;

    const sub = document.createElement("div");
    sub.className = "qsub";
    sub.textContent = q.sub;

    quiz.appendChild(h);
    quiz.appendChild(sub);

    const selected = ans[q.id] || (q.type === "multi" ? [] : "");

    q.options.forEach((optText) => {
      const lab = document.createElement("label");
      lab.className = "opt";

      const input = document.createElement("input");
      input.type = q.type === "multi" ? "checkbox" : "radio";
      input.name = q.id;
      input.value = optText;

      if (q.type === "multi") {
        input.checked = Array.isArray(selected) && selected.includes(optText);
      } else {
        input.checked = selected === optText;
      }

      const span = document.createElement("div");
      span.className = "otxt";
      span.textContent = optText;

      lab.appendChild(input);
      lab.appendChild(span);

      function syncSelectedClass() {
        const isOn = input.checked;
        if (isOn) lab.classList.add("selected");
        else lab.classList.remove("selected");
      }
      syncSelectedClass();

      lab.addEventListener("click", (e) => {
        // laissez le clic cocher naturellement
        setTimeout(() => {
          if (q.type === "multi") {
            const checks = [...document.querySelectorAll(`input[name="${q.id}"]`)];
            ans[q.id] = checks.filter(c => c.checked).map(c => c.value);
          } else {
            ans[q.id] = optText;
          }
          VIVARIO.saveAnswers(ans);

          // refresh selected UI for all options
          const allLabs = [...document.querySelectorAll(".opt")];
          allLabs.forEach(l => {
            const inp = l.querySelector("input");
            if (!inp) return;
            if (inp.checked) l.classList.add("selected");
            else l.classList.remove("selected");
          });
        }, 0);
      });

      quiz.appendChild(lab);
    });

    // progress UI
    const stepInfo = document.getElementById("stepInfo");
    if (stepInfo) stepInfo.textContent = `${stepIdx + 1}/${QUESTIONS.length}`;
    const fill = document.getElementById("progressFill");
    if (fill) fill.style.width = `${Math.round(((stepIdx + 1) / QUESTIONS.length) * 100)}%`;
  }

  function validateStep(stepIdx, ans) {
    const q = QUESTIONS[stepIdx];
    const v = ans[q.id];
    if (q.type === "single") return !!v;
    // multi : au moins 1 choix
    return Array.isArray(v) && v.length > 0;
  }

  function initQuestionnaire() {
    const quiz = document.getElementById("quiz");
    if (!quiz) return;

    let ans = VIVARIO.loadAnswers() || {};
    let step = 0;

    renderQuestion(step, ans);

    const back = document.getElementById("btnBack");
    const next = document.getElementById("btnNext");

    if (back) back.onclick = () => {
      if (step > 0) {
        step--;
        renderQuestion(step, ans);
      } else {
        // retour accueil
        window.location.href = "accueil.html";
      }
    };

    if (next) next.onclick = () => {
      if (!validateStep(step, ans)) {
        alert("Choisis au moins une réponse pour continuer.");
        return;
      }
      if (step < QUESTIONS.length - 1) {
        step++;
        renderQuestion(step, ans);
      } else {
        // fini -> résultat
        window.location.href = "resultat.html";
      }
    };
  }

  // -----------------------------
  // Result page renderer
  // -----------------------------
  function initResultat() {
    const globalRead = document.getElementById("globalRead");
    const sP = document.getElementById("scenarioPrudent");
    const sR = document.getElementById("scenarioRealiste");
    const sE = document.getElementById("scenarioEngage");
    const sum = document.getElementById("summaryText");
    if (!globalRead || !sP || !sR || !sE || !sum) return;

    const ans = VIVARIO.loadAnswers();
    if (!ans) {
      window.location.href = "questionnaire.html";
      return;
    }

    const flags = VIVARIO.computeFlags(ans);

    globalRead.textContent = VIVARIO.buildGlobalRead(flags);

    sP.innerHTML = `<h3>Lecture prudente</h3>${VIVARIO.composeScenario(flags, "P")}`;
    sR.innerHTML = `<h3>Lecture réaliste</h3>${VIVARIO.composeScenario(flags, "R")}`;
    sE.innerHTML = `<h3>Lecture engagée</h3>${VIVARIO.composeScenario(flags, "E")}`;

    const summary = VIVARIO.buildSummary(flags);
    sum.textContent = summary;

    const btnCopy = document.getElementById("btnCopy");
    if (btnCopy) {
      btnCopy.onclick = async () => {
        try {
          await navigator.clipboard.writeText(summary);
          const old = btnCopy.textContent;
          btnCopy.textContent = "Copié ✅";
          setTimeout(() => (btnCopy.textContent = old), 1200);
        } catch {
          alert("Copie impossible. Tu peux sélectionner le texte manuellement.");
        }
      };
    }

    const btnRestart = document.getElementById("btnRestart");
    if (btnRestart) {
      btnRestart.onclick = () => {
        VIVARIO.clearAnswers();
        window.location.href = "accueil.html";
      };
    }
  }

  // -----------------------------
  // Boot
  // -----------------------------
  document.addEventListener("DOMContentLoaded", () => {
    initSound();
    initQuestionnaire();
    initResultat();
  });
})();