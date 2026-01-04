/* pro_logic.js — Vivario PRO
   Moteur adaptatif + scoring + diagnostic + personnalisation (plan)
   v1.0 — SAFE (n’impacte PAS le gratuit)
*/

(() => {
  const PRO_STATE_KEY = "vivario_pro_state_v1";
  const PRO_RESULT_KEY = "vivario_pro_result_v1";

  // =========================================================
  // Helpers
  // =========================================================
  const nowISO = () => new Date().toISOString();
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const asArr = (v) => (Array.isArray(v) ? v : (v == null ? [] : [v]));
  const toStr = (v) => (v == null ? "" : String(v));
  const lc = (s) => toStr(s).toLowerCase();

  function stableHash(str) {
    str = String(str || "");
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0);
  }

  function pickWeighted(items, seed) {
    const arr = Array.isArray(items) ? items : [];
    if (!arr.length) return null;
    let total = 0;
    for (const it of arr) total += (it.weight || 1);
    let r = (seed % total);
    for (const it of arr) {
      r -= (it.weight || 1);
      if (r < 0) return it;
    }
    return arr[arr.length - 1];
  }

  // =========================================================
  // Rule Engine — show_if evaluator
  // =========================================================
  function evalCond(cond, ctx) {
    // ctx = { answers, scores, shown, energy }
    if (!cond) return true;

    // composés
    if (cond.all && Array.isArray(cond.all)) return cond.all.every(c => evalCond(c, ctx));
    if (cond.any && Array.isArray(cond.any)) return cond.any.some(c => evalCond(c, ctx));
    if (cond.not) return !evalCond(cond.not, ctx);

    const A = ctx.answers || {};
    const S = ctx.scores || {};

    if (cond.eq) {
      const { id, value } = cond.eq;
      return A[id] === value;
    }

    if (cond.includes) {
      const { id, value } = cond.includes;
      return asArr(A[id]).includes(value);
    }

    if (cond.in) {
      const { id, values } = cond.in;
      return asArr(values).includes(A[id]);
    }

    if (cond.answered) {
      const { id } = cond.answered;
      const v = A[id];
      if (Array.isArray(v)) return v.length > 0;
      return v !== undefined && v !== null && v !== "";
    }

    if (cond.num) {
      const { id, op, value } = cond.num;
      const n = Number(A[id]);
      if (Number.isNaN(n)) return false;
      switch (op) {
        case ">": return n > value;
        case ">=": return n >= value;
        case "<": return n < value;
        case "<=": return n <= value;
        case "==": return n === value;
        default: return false;
      }
    }

    if (cond.score) {
      const { domain, op, value } = cond.score;
      const n = Number(S[domain] || 0);
      switch (op) {
        case ">": return n > value;
        case ">=": return n >= value;
        case "<": return n < value;
        case "<=": return n <= value;
        case "==": return n === value;
        default: return false;
      }
    }

    if (cond.energy) {
      const { is } = cond.energy;
      return ctx.energy === is;
    }

    return true;
  }

  // =========================================================
  // Scoring
  // =========================================================
  function scoreFromBlock(block, answers) {
    if (!block || !block.scoring) return {};

    const sc = block.scoring;
    const out = {};

    // simple add
    if (sc.add && typeof sc.add === "object") {
      for (const k of Object.keys(sc.add)) out[k] = (out[k] || 0) + Number(sc.add[k] || 0);
    }

    // map single/multi
    if (sc.domain && sc.map) {
      const v = answers[block.id];
      if (block.type === "single") {
        out[sc.domain] = (out[sc.domain] || 0) + Number(sc.map[v] || 0);
      } else if (block.type === "multi") {
        let sum = 0;
        for (const id of asArr(v)) sum += Number(sc.map[id] || 0);
        out[sc.domain] = (out[sc.domain] || 0) + sum;
      }
    }

    // scale numeric
    if (sc.domain && sc.scale) {
      const n = Number(answers[block.id]);
      if (!Number.isNaN(n)) {
        const factor = Number(sc.scale.factor ?? 1);
        out[sc.domain] = (out[sc.domain] || 0) + (n * factor);
      }
    }

    return out;
  }

  function scoreAll(json, answers) {
    const blocks = Array.isArray(json?.blocks) ? json.blocks : [];
    const totals = {};
    for (const b of blocks) {
      const add = scoreFromBlock(b, answers);
      for (const k of Object.keys(add)) totals[k] = (totals[k] || 0) + add[k];
    }
    // normalisation douce (0..100)
    for (const k of Object.keys(totals)) {
      totals[k] = clamp(Math.round(totals[k] * 10), 0, 100);
    }
    return totals;
  }

  // =========================================================
  // Domain selection (multi-thèmes)
  // =========================================================
  function selectedDomains(answers, json) {
    const themeBlockId = json?.flow?.themes_block_id || "themes";
    const themes = asArr(answers[themeBlockId]);
    const domains = new Set();

    const map = json?.flow?.themes_to_domains || null;
    if (map && typeof map === "object") {
      for (const t of themes) {
        const arr = asArr(map[t]);
        arr.forEach(d => d && domains.add(d));
      }
    } else {
      themes.forEach(t => domains.add(t));
    }

    if (!domains.size) domains.add("core");
    return Array.from(domains);
  }

  // =========================================================
  // Safety / urgence (si présent dans les réponses)
  // =========================================================
  function detectUrgency(answers) {
    const flags = new Set();

    for (const [k, v] of Object.entries(answers || {})) {
      const lowK = lc(k);
      const lowV = lc(Array.isArray(v) ? v.join(",") : v);

      if (lowK.includes("self") && lowK.includes("harm")) flags.add("self_harm");
      if (lowV.includes("self_harm") || lowV.includes("suicide") || lowV.includes("me faire du mal")) flags.add("self_harm");

      if (lowV.includes("violence") || lowV.includes("danger") || lowV.includes("urgence")) flags.add("danger");
    }

    return { urgent: flags.size > 0, flags: Array.from(flags) };
  }

  // =========================================================
  // Next Block selector (adaptatif)
  // =========================================================
  function nextBlock({ json, answers, shown, energy }) {
    const blocks = Array.isArray(json?.blocks) ? json.blocks : [];
    const shownSet = new Set(asArr(shown));

    const scores = scoreAll(json, answers);
    const ctx = { answers, scores, shown, energy };

    // urgence -> force un block "urgent_support" si dispo
    const urg = detectUrgency(answers);
    if (urg.urgent) {
      const urgentBlock = blocks.find(b => b.id === "urgent_support");
      if (urgentBlock && !shownSet.has(urgentBlock.id)) return urgentBlock;
    }

    const flow = json?.flow || {};
    const baseOrder = asArr(flow.base || []);
    const startId = flow.start || baseOrder[0] || blocks[0]?.id;

    if (!shownSet.size && startId) {
      const b = blocks.find(x => x.id === startId);
      if (b) return b;
    }

    const domains = selectedDomains(answers, json);

    const candidates = [];

    // base explicit
    for (const id of baseOrder) {
      const b = blocks.find(x => x.id === id);
      if (b) candidates.push(b);
    }

    // domain blocks
    for (const b of blocks) {
      if (shownSet.has(b.id)) continue;
      const d = b.domain || b.group || null;
      if (!d) continue;
      if (domains.includes(d)) candidates.push(b);
    }

    // fallback: tout bloc non montré
    for (const b of blocks) {
      if (!shownSet.has(b.id)) candidates.push(b);
    }

    const filtered = candidates.filter(b => {
      if (shownSet.has(b.id)) return false;
      if (b.show_if && !evalCond(b.show_if, ctx)) return false;

      if (energy === "low") {
        const tags = asArr(b.tags).map(lc);
        if (tags.includes("deep") || tags.includes("long")) return false;
      }
      return true;
    });

    if (!filtered.length) return null;

    filtered.sort((a, b) => {
      const ra = a.required ? 1 : 0;
      const rb = b.required ? 1 : 0;
      if (rb !== ra) return rb - ra;

      const pa = Number(a.priority || 0);
      const pb = Number(b.priority || 0);
      if (pb !== pa) return pb - pa;

      return (a.id < b.id ? -1 : 1);
    });

    return filtered[0] || null;
  }

  // =========================================================
  // Diagnostic generation
  // =========================================================
  function severityLabel(score) {
    if (score >= 75) return "élevé";
    if (score >= 45) return "modéré";
    if (score >= 20) return "léger";
    return "faible";
  }

  function topDomains(scores, n = 3) {
    const entries = Object.entries(scores || {});
    entries.sort((a, b) => (b[1] || 0) - (a[1] || 0));
    return entries.slice(0, n).filter(e => (e[1] || 0) > 0);
  }

  function generateDiagnostic({ json, answers, scores }) {
    const urg = detectUrgency(answers);
    if (urg.urgent) {
      return {
        title: "Priorité sécurité",
        summary:
          "Ce que tu as indiqué ressemble à une situation où la sécurité passe avant tout. Vivario peut t’aider à te stabiliser, mais ce n’est pas un remplacement d’un soutien humain immédiat.",
        bullets: [
          "Si tu es en danger maintenant : appelle les urgences (112) ou un service local d’urgence.",
          "Si tu peux : contacte une personne de confiance et reste avec quelqu’un.",
          "Ensuite seulement, on pourra revenir sur le plan (respiration, ancrage, étapes)."
        ],
        flags: urg.flags
      };
    }

    const tops = topDomains(scores, 4);
    const primary = tops[0]?.[0] || "global";
    const primaryScore = tops[0]?.[1] || 0;

    const label = severityLabel(primaryScore);

    const titleMap = json?.diagnostic?.titles || {};
    const prettyPrimary = titleMap[primary] || primary;

    const summary =
      `D’après tes réponses, le domaine principal qui ressort est **${prettyPrimary}** (niveau ${label}). ` +
      `On va viser du concret : stabiliser d’abord, puis renforcer progressivement.`;

    const bullets = tops.map(([d, s]) => {
      const pretty = titleMap[d] || d;
      return `• ${pretty} : niveau ${severityLabel(s)} (score ${s}/100).`;
    });

    const energy = answers.energy || "medium";
    const energyLine =
      energy === "low"
        ? "Ton énergie semble basse : le plan sera plus court, plus doux, et très réaliste."
        : energy === "high"
          ? "Ton énergie permet d’aller un peu plus loin : on peut ajouter une étape de progression."
          : "On garde un rythme stable : simple, régulier, sans surcharge.";

    return {
      title: "Diagnostic Vivario PRO",
      summary,
      bullets: [energyLine, ...bullets],
      primary_domain: primary,
      primary_score: primaryScore
    };
  }

  // =========================================================
  // Plan generation (modules + historique + adhérence)
  // =========================================================
  function readHistoryAdherence() {
    const keys = Object.keys(localStorage)
      .filter(k => k.startsWith("vivario_pro:checkin:"))
      .sort()
      .reverse()
      .slice(0, 14);

    if (!keys.length) return { adherence: 0.5, last: null, streak: 0 };

    let done = 0;
    for (const k of keys) {
      try {
        const v = JSON.parse(localStorage.getItem(k) || "{}");
        if (v && v.done) done += 1;
      } catch {}
    }
    const adherence = done / keys.length;

    let streak = 0;
    for (const k of keys) {
      try {
        const v = JSON.parse(localStorage.getItem(k) || "{}");
        if (v && v.done) streak += 1;
        else break;
      } catch { break; }
    }

    return { adherence, last: keys[0], streak };
  }

  function planIntensity(energy, adherence) {
    if (energy === "low") return 1;
    if (adherence < 0.35) return 1;
    if (adherence < 0.7) return 2;
    return 3;
  }

  function pickPlanModules({ modulesByDomain, scores, answers, seed }) {
    const tops = topDomains(scores, 5);
    const energy = answers.energy || "medium";
    const hist = readHistoryAdherence();
    const intensity = planIntensity(energy, hist.adherence);

    const out = [];
    let i = 0;

    for (const [domain] of tops) {
      const list = asArr(modulesByDomain?.[domain]);
      if (!list.length) continue;

      const chosen = new Set(out.map(x => x.id));
      const pickSeed = stableHash(seed + "|" + domain + "|" + i);

      const filtered = energy === "low"
        ? list.filter(m => Number(m.minutes || 0) <= 6)
        : list.slice();

      const pool = filtered.length ? filtered : list;

      const picked = pickWeighted(pool.map(m => ({ ...m, weight: m.weight || 1 })), pickSeed);
      if (picked && !chosen.has(picked.id)) out.push(picked);

      i += 1;
      if (out.length >= intensity) break;
    }

    if (!out.length) {
      const core = asArr(modulesByDomain?.core);
      if (core.length) out.push(core[0]);
    }

    return { items: out, intensity, adherence: hist.adherence, streak: hist.streak };
  }

  function generatePlan({ modules, scores, answers, seed }) {
    const domainsPack = modules?.domains || modules?.domainsByDomain || modules || {};
    const pick = pickPlanModules({
      modulesByDomain: domainsPack,
      scores,
      answers,
      seed
    });

    const energy = answers.energy || "medium";
    const frame =
      energy === "low"
        ? "Plan court (au minimum viable)"
        : energy === "high"
          ? "Plan progressif (avec une étape en plus)"
          : "Plan stable (simple et régulier)";

    const intro =
      `Voici ton **plan du jour**. Il est calibré sur ton énergie (${energy}) et ton rythme récent ` +
      `(adhérence estimée ${(pick.adherence * 100).toFixed(0)}%).`;

    const steps = pick.items.map((m, idx) => ({
      order: idx + 1,
      id: m.id || `m_${idx + 1}`,
      title: m.title || "Exercice",
      minutes: m.minutes || 5,
      when: m.when || "Aujourd’hui",
      steps: asArr(m.steps || m.how || []).slice(0, 7),
      tags: asArr(m.tags || [])
    }));

    const outro =
      pick.streak >= 3
        ? `Tu as une bonne continuité (${pick.streak} jours). On garde la trajectoire : petit, régulier, efficace.`
        : `Objectif : faire **1 chose** vraiment. Le reste est optionnel.`;

    return {
      title: frame,
      intro,
      steps,
      outro
    };
  }

  // =========================================================
  // Build final result (for resultat_pro.html)
  // =========================================================
  function buildResult({ json, answers, shown, modules }) {
    const seed = stableHash(
      (json?.version || "pro") +
      "|" + Object.keys(answers || {}).sort().map(k => `${k}:${JSON.stringify(answers[k])}`).join("|")
    );

    const scores = scoreAll(json, answers);
    const diagnostic = generateDiagnostic({ json, answers, scores });

    const plan = generatePlan({
      modules: modules || {},
      scores,
      answers,
      seed: String(seed)
    });

    const payload = {
      version: "vivario-pro-result-1.0",
      created_at: nowISO(),
      seed,
      answers,
      shown_blocks: asArr(shown),
      scores,
      diagnostic,
      plan
    };

    try {
      localStorage.setItem(PRO_RESULT_KEY, JSON.stringify(payload));
    } catch {}

    return payload;
  }

  // =========================================================
  // Public API used by questionnaire_pro.js
  // =========================================================
  window.VivarioProLogic = {
    nextBlock,
    scoreAll,
    buildResult,
    readState() {
      try { return JSON.parse(localStorage.getItem(PRO_STATE_KEY) || "null"); } catch { return null; }
    },
    writeResult(payload) {
      try { localStorage.setItem(PRO_RESULT_KEY, JSON.stringify(payload)); } catch {}
    },
    readResult() {
      try { return JSON.parse(localStorage.getItem(PRO_RESULT_KEY) || "null"); } catch { return null; }
    }
  };
})();