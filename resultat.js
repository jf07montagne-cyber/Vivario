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

  function normalizeTag(t) {
    const raw = String(t || "").trim();
    if (!raw) return null;

    // On ignore "user: u_xxx" ou tags ressemblant à un id
    if (raw.startsWith("user:")) return null;
    if (/^u_[a-z0-9_]+$/i.test(raw)) return null;

    // Format "key:value" attendu
    const m = raw.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.+)$/);
    if (!m) return null;

    const key = m[1].toLowerCase();
    const val = String(m[2] || "").trim();

    // Nettoyage
    const cleanVal = val
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Mapping joli
    const mapKey = {
      coach: "Coach",
      tone: "Tonalité",
      theme: "Thème",
      vecu: "Vécu",
      posture: "État"
    };

    // Valeurs jolies pour les cas fréquents
    const niceValMap = {
      soft: "doux",
      flou: "flou",
      fatigue: "fatigue"
    };

    const labelKey = mapKey[key] || key;
    const labelVal = niceValMap[cleanVal.toLowerCase()] || cleanVal;

    // On évite les trucs trop techniques
    if (labelVal.length > 42) return null;

    return `${labelKey} · ${labelVal}`;
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

  // ✅ Nettoyage & anti-répétition
  function cleanLines(text) {
    const raw = String(text || "")
      .split("\n")
      .map(s => s.trim())
      .filter(Boolean);

    // Retire doublons exacts
    const seen = new Set();
    const uniq = [];
    for (const s of raw) {
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      uniq.push(s);
    }
    return uniq;
  }

  function removeGenericRepeats(lines, keepOnceSet) {
    // Phrases trop génériques qu’on ne veut pas répéter partout
    const generic = [
      "merci d’avoir pris ce temps.",
      "merci d'avoir pris ce temps.",
      "tu es dans le flou.",
      "ici, on ne force pas la clarté — on la laisse venir.",
      "tu peux t’arrêter ici, ou revenir plus tard : vivario respecte ton rythme.",
      "tu peux, si tu veux, t’arrêter ici, ou revenir plus tard : vivario respecte ton rythme."
    ];

    const out = [];
    for (const s of lines) {
      const low = s.toLowerCase();
      const isGeneric = generic.some(g => low.includes(g));
      if (isGeneric) {
        // on ne garde qu’une fois au global
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
    // coupe après ~120 chars
    if (p.length <= 120) return p;
    return p.slice(0, 117).trim() + "…";
  }

  function buildIntros(profileTags, seed) {
    const tags = new Set((profileTags || []).map(t => String(t || "").toLowerCase()));

    const isCouple = Array.from(tags).some(t => t.includes("theme:") && t.includes("couple"));
    const isFlou = Array.from(tags).some(t => t.includes("tone:") && t.includes("flou"));
    const isFatigue = Array.from(tags).some(t => t.includes("posture:") && t.includes("fatigue"));

    const introMain = [
      isFlou ? "On va d’abord te rendre un peu d’air : juste l’essentiel, sans te pousser." : "On commence simple : stabiliser, puis avancer.",
      isFatigue ? "Ton énergie compte. Ici, on protège le minimum vital." : "On va garder ce qui tient debout, et laisser le reste.",
      isCouple ? "Dans le couple, le “trop” arrive vite : on va alléger sans dramatiser." : "Tu n’as pas à tout porter d’un coup."
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

    // si vraiment tout vide, on cache
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
      const chips = document.getElementById("resChips");
      if (chips) chips.style.display = "none";
      return;
    }

    const scenarios = Array.isArray(session.scenarios) ? session.scenarios : [];
    const byKey = (k) => scenarios.find(s => s.key === k) || null;
    const profile = session.profile || {};
    const tagsRaw = Array.isArray(profile.tags) ? profile.tags : [];

    // seed stable : basé sur tags + éventuel id session
    const seed = hashStr((tagsRaw.join("|") || "") + "|" + (session.userId || ""));

    // Titres / sous-titre
    setText("resTitle", (scenarios[0]?.title) || "Résultat");
    setText("resSub", session.finalMessage ? session.finalMessage.split("\n")[0] : "Prends une respiration…");

    const tabMain = document.querySelector('.tab[data-pane="main"]');
    if (tabMain) tabMain.textContent = (scenarios[0]?.title) || "Résultat";

    // ✅ Chips propres (repères)
    const chips = document.getElementById("resChips");
    if (chips) {
      const clean = tagsRaw
        .map(normalizeTag)
        .filter(Boolean)
        .slice(0, 6);

      if (!clean.length) {
        chips.style.display = "none";
      } else {
        chips.style.display = "";
        chips.innerHTML = clean.map(t => `<span class="chip">${escapeHTML(t)}</span>`).join("");
      }
    }

    // Textes scénarios
    const paneMain = document.getElementById("pane-main");
    const paneStep = document.getElementById("pane-step");
    const paneCalm = document.getElementById("pane-calm");
    const paneNorm = document.getElementById("pane-norm");

    const sMain = byKey("main");
    const sStep = byKey("step");
    const sCalm = byKey("calm");
    const sNorm = byKey("norm");

    // ✅ anti-répétition globale
    const keepOnce = new Set();

    const intros = buildIntros(tagsRaw, seed);

    function buildPaneText(key, rawText) {
      let lines = cleanLines(rawText);

      // retire / limite répétitions génériques
      lines = removeGenericRepeats(lines, keepOnce);

      // Ajoute une intro unique par pane (si pas déjà présent)
      const intro = intros[key] || "";
      if (intro) {
        const low = intro.toLowerCase();
        const already = lines.some(s => s.toLowerCase().includes(low.slice(0, 18)));
        if (!already) lines.unshift(intro);
      }

      // Petite finition : évite trop long => max 10 paragraphes
      if (lines.length > 10) lines = lines.slice(0, 10);

      return joinAsText(lines);
    }

    const mainTxt = buildPaneText("main", sMain?.text || session.finalMessage || "");
    const stepTxt = buildPaneText("step", sStep?.text || "—");
    const calmTxt = buildPaneText("calm", sCalm?.text || "—");
    const normTxt = buildPaneText("norm", sNorm?.text || "—");

    if (paneMain) paneMain.innerHTML = toParagraphs(mainTxt);
    if (paneStep) paneStep.innerHTML = toParagraphs(stepTxt);
    if (paneCalm) paneCalm.innerHTML = toParagraphs(calmTxt);
    if (paneNorm) paneNorm.innerHTML = toParagraphs(normTxt);

    // ✅ Résumé (4 phrases, visibles)
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