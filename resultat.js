(() => {
  const SESSION_KEY = "vivario_session_v1_1";

  function escapeHTML(str) {
    return String(str || "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[m]));
  }

  function hashStr(s) {
    s = String(s || "");
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0);
  }

  function pick(arr, seed) {
    if (!arr || !arr.length) return "";
    return arr[seed % arr.length];
  }

  function toParagraphs(text) {
    const parts = String(text || "")
      .split("\n")
      .map(s => s.trim())
      .filter(Boolean);

    return parts.map(p => `<p>${escapeHTML(p)}</p>`).join("");
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function renderHistory() {
    const box = document.getElementById("history");
    if (!box) return;

    const keys = Object.keys(localStorage)
      .filter(k => k.startsWith("vivario:saved:"))
      .sort()
      .reverse()
      .slice(0, 12);

    if (!keys.length) {
      box.innerHTML = `<p class="muted" style="margin:0;">Aucun enregistrement pour l’instant.</p>`;
      return;
    }

    box.innerHTML = keys.map(k => {
      const date = k.replace("vivario:saved:", "");
      const txt = (localStorage.getItem(k) || "").split("\n").slice(0, 2).join(" ");
      return `
        <div class="sep"></div>
        <p style="margin:10px 0 6px; font-weight:800;">${escapeHTML(date)}</p>
        <p class="muted" style="margin:0; line-height:1.5;">${escapeHTML(txt)}…</p>
      `;
    }).join("");
  }

  function bindTabs() {
    const tabs = document.querySelectorAll(".tab");
    tabs.forEach(btn => {
      btn.addEventListener("click", () => {
        const key = btn.getAttribute("data-pane");
        tabs.forEach(b => b.classList.toggle("active", b === btn));
        ["main", "step", "calm", "norm"].forEach(k => {
          const pane = document.getElementById("pane-" + k);
          if (pane) pane.classList.toggle("active", k === key);
        });
      });
    });
  }

  function bindActions(getCurrentText) {
    const btnCopy = document.getElementById("btnCopy");
    const btnSave = document.getElementById("btnSaveToday");

    btnCopy?.addEventListener("click", async () => {
      const txt = (getCurrentText() || "").trim();
      try {
        await navigator.clipboard.writeText(txt);
        btnCopy.textContent = "✅ Copié";
        setTimeout(() => (btnCopy.textContent = "📋 Copier"), 1200);
      } catch {
        alert("Copie impossible sur ce navigateur.");
      }
    });

    btnSave?.addEventListener("click", () => {
      const txt = (getCurrentText() || "").trim();
      const todayKey = "vivario:saved:" + new Date().toISOString().slice(0, 10);
      localStorage.setItem(todayKey, txt);
      btnSave.textContent = "✅ Sauvé";
      setTimeout(() => (btnSave.textContent = "💾 Sauver pour aujourd’hui"), 1400);
      renderHistory();
    });
  }

  // ✅ Nettoyage (intra-onglet)
  function cleanLines(text) {
    const raw = String(text || "")
      .split("\n")
      .map(s => s.trim())
      .filter(Boolean);

    const seen = new Set();
    const uniq = [];
    for (const s of raw) {
      const key = normalizeForCompare(s);
      if (seen.has(key)) continue;
      seen.add(key);
      uniq.push(s);
    }
    return uniq;
  }

  // Phrases génériques qu’on veut éviter de voir répétées / doublées
  function removeGenericRepeats(lines, keepOnceSet) {
    const generic = [
      "merci d’avoir pris ce temps",
      "merci d'avoir pris ce temps",
      "tu peux t’arrêter ici",
      "tu peux t'arreter ici",
      "vivario respecte ton rythme",
      "ici, on ne force pas la clarté",
      "on ne force pas la clarté",
      "si tu sens un peu plus d’air, garde juste ça",
      "si tu sens un peu plus d'air, garde juste ca",
      "c’est déjà une victoire",
      "c'est deja une victoire"
    ];

    const out = [];
    for (const s of lines) {
      const low = normalizeForCompare(s);
      const isGeneric = generic.some(g => low.includes(g));
      if (isGeneric) {
        if (keepOnceSet.has(low)) continue;
        keepOnceSet.add(low);
        out.push(s);
      } else {
        out.push(s);
      }
    }
    return out;
  }

  function joinAsText(lines) {
    return lines.join("\n");
  }

  function firstSentence(text) {
    const t = String(text || "").trim();
    if (!t) return "";
    const p = t.split("\n").map(x => x.trim()).filter(Boolean)[0] || "";
    if (p.length <= 120) return p;
    return p.slice(0, 117).trim() + "…";
  }

  // =========================================================
  // ✅ Dédup INTER-ONGLETS : aucune similitude entre scénarios
  // =========================================================
  function normalizeForCompare(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[’']/g, "'")
      .replace(/[…]/g, "...")
      .replace(/[^a-z0-9àâäçéèêëîïôöùûüÿœæ'\s-]/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokenSet(s) {
    const t = normalizeForCompare(s)
      .split(" ")
      .map(x => x.trim())
      .filter(Boolean)
      .filter(x => x.length > 2); // enlève "de", "et", etc.
    return new Set(t);
  }

  function jaccard(a, b) {
    if (!a.size || !b.size) return 0;
    let inter = 0;
    for (const x of a) if (b.has(x)) inter++;
    const union = a.size + b.size - inter;
    return union ? inter / union : 0;
  }

  function isTooSimilar(line, usedLinesNorm, usedTokenSets) {
    const n = normalizeForCompare(line);
    if (!n) return true;
    if (usedLinesNorm.has(n)) return true;

    const ts = tokenSet(line);
    for (const uts of usedTokenSets) {
      const sim = jaccard(ts, uts);
      if (sim >= 0.72) return true; // seuil agressif => plus unique
    }
    return false;
  }

  // =========================================================
  // ✅ Résumé Vivario humain (validé)
  // =========================================================
  function themeLabel(id) {
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
      preferer_pas: "ce que tu gardes pour toi"
    };
    return map[id] || id;
  }

  function needLabel(id) {
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

  function toneContext(tone) {
    const map = {
      stable: "Tu sembles plutôt stable aujourd’hui. C’est une base précieuse.",
      neutre: "Tu es dans un entre-deux : ni bien ni mal. Juste “entre”.",
      flou: "Il y a du flou. Ici on ne force pas la clarté : on la laisse venir.",
      charge: "Tu portes beaucoup en ce moment. Ton système est probablement en surcharge.",
      indetermine: "C’est difficile à nommer, et pourtant tu es là : ça compte."
    };
    return map[tone] || "Tu traverses quelque chose qui mérite une vraie attention.";
  }

  function renderVivarioSummary(profile) {
    const elA = document.getElementById("sumContext");
    const elB = document.getElementById("sumNeed");
    const elC = document.getElementById("sumFocus");
    if (!elA || !elB || !elC) return;

    const tone = String(profile?.tone || "indetermine");
    const themes = Array.isArray(profile?.themes) ? profile.themes : [];
    const besoins = Array.isArray(profile?.besoin) ? profile.besoin : [];

    const focusThemes = themes
      .filter(t => t && t !== "multiple" && t !== "preferer_pas")
      .slice(0, 2);

    elA.textContent = toneContext(tone);

    const mainNeed = besoins[0] || "indetermine";
    elB.textContent = `Ton besoin principal, là tout de suite, ressemble à : ${needLabel(mainNeed)}.`;

    if (focusThemes.length === 0) {
      elC.textContent = "Aujourd’hui, l’important est surtout de te situer, sans te forcer.";
    } else if (focusThemes.length === 1) {
      elC.textContent = `Ton attention se tourne surtout vers ${themeLabel(focusThemes[0])}.`;
    } else {
      elC.textContent = `Ton attention se tourne surtout vers ${themeLabel(focusThemes[0])} et ${themeLabel(focusThemes[1])}.`;
    }
  }

  // =========================================================
  // ✅ Intros (déjà bon) + seed varié par session unique
  // =========================================================
  function buildIntros(profileTags, seed) {
    const tags = new Set((profileTags || []).map(t => String(t || "").toLowerCase()));

    const isCouple = Array.from(tags).some(t => t.includes("theme:") && t.includes("couple"));
    const isFlou = Array.from(tags).some(t => t.includes("tone:") && t.includes("flou"));
    const isFatigue = Array.from(tags).some(t => t.includes("posture:") && t.includes("fatigue"));

    const introMain = [
      isFlou ? "On va d’abord te rendre un peu d’air : juste l’essentiel, sans te pousser." : "On commence simple : stabiliser, puis avancer.",
      isFatigue ? "Ton énergie compte. Ici, on protège le minimum vital." : "On va garder ce qui tient debout, et laisser le reste.",
      isCouple ? "Dans la relation, le “trop” arrive vite : on va alléger sans dramatiser." : "Tu n’as pas à tout porter d’un coup."
    ];

    const introStep = [
      "Un micro-pas, réaliste : 2 minutes, pas plus. Juste pour relancer.",
      isCouple ? "Un pas concret côté relation : petit, clair, faisable aujourd’hui." : "Un pas concret : un geste qui t’aide maintenant.",
      isFatigue ? "Quand tu es fatigué(e), l’action doit être petite… mais sûre." : "On vise le simple : un pas, puis pause."
    ];

    const introCalm = [
      "On baisse la pression. Pas besoin d’aller vite.",
      "On apaise le système : respiration courte, attention douce.",
      isFlou ? "Quand c’est flou, le calme redonne de la netteté." : "On ramène du calme pour que ça respire."
    ];

    const introNorm = [
      "Ce que tu ressens a du sens : ce n’est pas “trop”, c’est humain.",
      isFatigue ? "La fatigue change tout : ton cerveau fait juste de son mieux." : "Ton cerveau cherche la sécurité : normal.",
      isCouple ? "Quand la relation pèse, on peut se sentir seul(e) même à deux : c’est fréquent." : "Tu n’es pas “cassé(e)”."
    ];

    return {
      main: pick(introMain, seed + 1),
      step: pick(introStep, seed + 2),
      calm: pick(introCalm, seed + 3),
      norm: pick(introNorm, seed + 4)
    };
  }

  // =========================================================
  // ✅ Enrichissements : plus détaillés + uniques par onglet
  // (aucun texte commun entre onglets)
  // =========================================================
  function enrichBank(profile, seed) {
    const tone = String(profile?.tone || "indetermine");
    const themes = Array.isArray(profile?.themes) ? profile.themes : [];
    const besoin = Array.isArray(profile?.besoin) ? profile.besoin[0] : "indetermine";
    const energie = String(profile?.energie || "indetermine");

    const t1 = themes[0] || "rien_de_precis";
    const t2 = themes[1] || "";

    const themePhrase =
      t2 ? `${themeLabel(t1)} et ${themeLabel(t2)}` : themeLabel(t1);

    const needPhrase = needLabel(besoin);

    const main = [
      `Aujourd’hui, on ne cherche pas une solution globale : on cherche une façon de rendre la journée plus respirable.`,
      `Quand ça déborde, la priorité devient : réduire la pression à la source (même 10%), plutôt que te forcer à “tenir”.`,
      `Si tu peux, repère une contrainte précise liée à ${themePhrase} et demande-toi : “Qu’est-ce que je peux rendre plus simple, maintenant ?”.`,
      `Avec une énergie “${energie}”, tu as le droit d’ajuster le niveau d’exigence : la stabilité avant la performance.`,
      tone === "charge"
        ? `Ton système est en surcharge : le bon réflexe est de retirer une charge, pas d’en ajouter une autre.`
        : `Même si tu vas “à peu près”, consolider un repère concret aujourd’hui peut t’éviter l’accumulation.`
    ];

    const step = [
      `Mini-plan (2 minutes) : écris 1 phrase vraie sur ${themePhrase} — sans solution, juste un fait.`,
      `Puis choisis une micro-action “vérifiable” (tu peux dire “fait”) : un message, une note, un rangement d’une surface, ou une demande simple.`,
      `Si tu hésites : prends l’option la plus petite. Le but est de relancer, pas de régler.`,
      besoin === "moins_seul"
        ? `Option lien : envoie “Tu peux m’écouter 2 minutes ?” à une personne sûre. Court. Sans justification.`
        : `Option clarté : fais deux colonnes sur ton téléphone : “ce que je sais” / “ce que j’imagine”. 3 lignes max.`,
      `Enfin, stop. Tu t’arrêtes volontairement : c’est ça qui te rend la main.`
    ];

    const calm = [
      `Pose les pieds au sol. Relâche les épaules. Et laisse l’air sortir plus longtemps qu’il n’entre.`,
      `Respiration simple : inspire 4 secondes, expire 6 secondes, 5 fois. Pas besoin de “bien faire”.`,
      `Ancrage : trouve 3 choses que tu vois, 2 que tu entends, 1 sensation dans le corps.`,
      `Si le mental revient : reviens juste à l’expiration. C’est la sortie qui calme.`,
      `Quand ça redescend un peu, reste 10 secondes sans rien ajouter. Juste constater.`
    ];

    const norm = [
      `Ce que tu ressens est cohérent : le cerveau déteste l’incertitude et compense en tournant en boucle.`,
      `La fatigue rend tout plus intense : elle baisse la tolérance et augmente la sensibilité. Ce n’est pas “toi”, c’est l’état.`,
      `Avoir plusieurs émotions en même temps n’est pas un bug : c’est un système de protection qui scanne ce qui compte.`,
      `Normaliser ne minimise pas : ça retire la honte et ça remet de la place pour agir.`,
      `Tu peux te dire : “Je vis quelque chose de chargé, donc ma réaction est logique.” Ça suffit pour calmer la lutte intérieure.`
    ];

    // Petite variation interne, sans jamais réutiliser entre onglets
    const rotate = (arr, n) => arr.slice(n).concat(arr.slice(0, n));
    return {
      main: rotate(main, seed % 3),
      step: rotate(step, (seed + 1) % 3),
      calm: rotate(calm, (seed + 2) % 3),
      norm: rotate(norm, (seed + 3) % 3),
      needPhrase
    };
  }

  // =========================================================
  // ✅ Aperçu 4 modes (inchangé)
  // =========================================================
  function renderSummary(summary) {
    const grid = document.getElementById("resSummaryGrid");
    const box = document.getElementById("resSummary");
    if (!grid || !box) return;

    const items = [
      { k: "main", label: "🛡️ Énergie", text: summary.main },
      { k: "step", label: "👣 Pas concret", text: summary.step },
      { k: "calm", label: "🌙 Apaisement", text: summary.calm },
      { k: "norm", label: "🧠 Normalisation", text: summary.norm },
    ];

    grid.innerHTML = items.map(it => `
      <div class="sum-card">
        <div class="sum-top">
          <span class="sum-pill">${escapeHTML(it.label)}</span>
        </div>
        <p class="sum-text">${escapeHTML(it.text || "—")}</p>
      </div>
    `).join("");

    const any = items.some(x => (x.text || "").trim());
    box.style.display = any ? "" : "none";
  }

  function main() {
    bindTabs();
    renderHistory();

    let session = null;
    try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch {}

    if (!session) {
      setText("resTitle", "Aucun résultat");
      setText("resSub", "Lance le questionnaire pour générer un résultat.");
      const pm = document.getElementById("pane-main");
      if (pm) pm.innerHTML = `<p class="muted">Retour accueil → Commencer.</p>`;
      const rs = document.getElementById("resSummary");
      if (rs) rs.style.display = "none";
      return;
    }

    // ✅ IMPORTANT : nonce unique par session (garantit nouveauté si tu refais l’exercice)
    // - stable si tu reviens voir CE résultat
    // - différent si tu refais l’exercice (nouvelle session => nouveau nonce)
    if (!session.nonce) {
      session.nonce = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch {}
    }

    const scenarios = Array.isArray(session.scenarios) ? session.scenarios : [];
    const byKey = (k) => scenarios.find(s => s.key === k) || null;
    const profile = session.profile || {};
    const tagsRaw = Array.isArray(profile.tags) ? profile.tags : [];

    // ✅ Résumé Vivario humain (validé)
    renderVivarioSummary(profile);

    // seed stable par session + réponses
    const signature = JSON.stringify({
      tone: profile.tone,
      themes: profile.themes,
      vecu: profile.vecu,
      posture: profile.posture,
      besoin: profile.besoin,
      energie: profile.energie,
      sortie: profile.sortie
    });

    const seed = hashStr((tagsRaw.join("|") || "") + "|" + signature + "|" + (session.userId || "") + "|" + session.nonce);

    // Titres / sous-titre
    setText("resTitle", (scenarios[0]?.title) || "Résultat");
    setText("resSub", session.finalMessage ? session.finalMessage.split("\n")[0] : "Prends une respiration…");

    const tabMain = document.querySelector('.tab[data-pane="main"]');
    if (tabMain) tabMain.textContent = (scenarios[0]?.title) || "Résultat";

    // Panes
    const paneMain = document.getElementById("pane-main");
    const paneStep = document.getElementById("pane-step");
    const paneCalm = document.getElementById("pane-calm");
    const paneNorm = document.getElementById("pane-norm");

    const sMain = byKey("main");
    const sStep = byKey("step");
    const sCalm = byKey("calm");
    const sNorm = byKey("norm");

    // ✅ anti-répétition globale (génériques)
    const keepOnce = new Set();
    const intros = buildIntros(tagsRaw, seed);
    const enrich = enrichBank(profile, seed);

    // =========================================================
    // Construction brute (intra + génériques)
    // =========================================================
    function buildRawLines(key, rawText) {
      let lines = cleanLines(rawText);
      lines = removeGenericRepeats(lines, keepOnce);

      // intro unique
      const intro = intros[key] || "";
      if (intro) {
        const introN = normalizeForCompare(intro);
        const already = lines.some(s => normalizeForCompare(s).includes(introN.slice(0, 18)));
        if (!already) lines.unshift(intro);
      }
      return lines;
    }

    let linesMain = buildRawLines("main", sMain?.text || session.finalMessage || "");
    let linesStep = buildRawLines("step", sStep?.text || "—");
    let linesCalm = buildRawLines("calm", sCalm?.text || "—");
    let linesNorm = buildRawLines("norm", sNorm?.text || "—");

    // =========================================================
    // ✅ Dédup inter-onglets (ordre : main -> step -> calm -> norm)
    // =========================================================
    const usedNorm = new Set();
    const usedTokenSets = [];

    function dedupeAgainstUsed(lines) {
      const out = [];
      for (const s of lines) {
        if (isTooSimilar(s, usedNorm, usedTokenSets)) continue;
        const n = normalizeForCompare(s);
        usedNorm.add(n);
        usedTokenSets.push(tokenSet(s));
        out.push(s);
      }
      return out;
    }

    linesMain = dedupeAgainstUsed(linesMain);
    linesStep = dedupeAgainstUsed(linesStep);
    linesCalm = dedupeAgainstUsed(linesCalm);
    linesNorm = dedupeAgainstUsed(linesNorm);

    // =========================================================
    // ✅ Enrich : +détails si un onglet devient trop court
    // (et sans réintroduire de similitudes)
    // =========================================================
    function topUp(key, lines, targetMin, targetMax) {
      const bank = enrich[key] || [];
      for (const extra of bank) {
        if (lines.length >= targetMax) break;
        if (isTooSimilar(extra, usedNorm, usedTokenSets)) continue;

        const n = normalizeForCompare(extra);
        usedNorm.add(n);
        usedTokenSets.push(tokenSet(extra));
        lines.push(extra);
      }

      // Si malgré tout trop court, on force 1-2 phrases ultra spécifiques par onglet
      if (lines.length < targetMin) {
        const fallback = {
          main: [
            `Objectif discret : réduire l’effort invisible que tu fais en continu.`,
            `Une bonne journée, ici, c’est une journée “moins lourde”, pas une journée parfaite.`
          ],
          step: [
            `Choisis une action qui prend moins de 120 secondes : c’est ça le critère.`,
            `Après l’action : tu te donnes le droit de ne rien faire d’autre tout de suite.`
          ],
          calm: [
            `Si ça remonte : recommence une seule expiration longue. Juste une.`,
            `Le calme est un état, pas une performance : tu reviens, c’est tout.`
          ],
          norm: [
            `Ton cerveau cherche à te protéger. Même quand c’est maladroit, l’intention est la sécurité.`,
            `Ça peut aller mieux sans “tout comprendre” : parfois, il suffit de baisser la pression.`
          ]
        }[key] || [];

        for (const extra of fallback) {
          if (lines.length >= targetMin) break;
          if (isTooSimilar(extra, usedNorm, usedTokenSets)) continue;
          usedNorm.add(normalizeForCompare(extra));
          usedTokenSets.push(tokenSet(extra));
          lines.push(extra);
        }
      }

      // cap
      if (lines.length > targetMax) lines = lines.slice(0, targetMax);
      return lines;
    }

    linesMain = topUp("main", linesMain, 9, 12);
    linesStep = topUp("step", linesStep, 9, 12);
    linesCalm = topUp("calm", linesCalm, 8, 11);
    linesNorm = topUp("norm", linesNorm, 9, 12);

    // Texte final
    const mainTxt = joinAsText(linesMain);
    const stepTxt = joinAsText(linesStep);
    const calmTxt = joinAsText(linesCalm);
    const normTxt = joinAsText(linesNorm);

    if (paneMain) paneMain.innerHTML = toParagraphs(mainTxt);
    if (paneStep) paneStep.innerHTML = toParagraphs(stepTxt);
    if (paneCalm) paneCalm.innerHTML = toParagraphs(calmTxt);
    if (paneNorm) paneNorm.innerHTML = toParagraphs(normTxt);

    // Aperçu 4 modes
    renderSummary({
      main: firstSentence(mainTxt),
      step: firstSentence(stepTxt),
      calm: firstSentence(calmTxt),
      norm: firstSentence(normTxt)
    });

    const getCurrentText = () => {
      const active = document.querySelector(".pane.active");
      return active ? active.innerText : "";
    };

    bindActions(getCurrentText);
  }

  main();
})();