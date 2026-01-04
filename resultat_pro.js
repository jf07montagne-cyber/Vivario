/* resultat_pro.js — Vivario PRO result viewer
   Lit vivario_pro_result_v1 et affiche Diagnostic + Plan + Suivi
   v1.0
*/
(() => {
  const PRO_RESULT_KEY = "vivario_pro_result_v1";

  const $ = (sel) => document.querySelector(sel);
  const escapeHTML = (str) =>
    String(str ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[m]));

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value ?? "";
  }

  function setHTML(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html ?? "";
  }

  function isoDay(d = new Date()) {
    return d.toISOString().slice(0, 10);
  }

  function readResult() {
    try { return JSON.parse(localStorage.getItem(PRO_RESULT_KEY) || "null"); } catch { return null; }
  }

  function severityLabel(score) {
    if (score >= 75) return "élevé";
    if (score >= 45) return "modéré";
    if (score >= 20) return "léger";
    return "faible";
  }

  function prettyDomainKey(key) {
    const map = {
      couple: "Couple",
      parentalite: "Parentalité",
      sante: "Santé",
      sommeil: "Sommeil",
      anxiete: "Anxiété",
      humeur: "Humeur",
      trauma: "Trauma",
      tca: "TCA",
      organisation: "Organisation",
      estime: "Estime",
      social: "Social",
      travail: "Travail",
      finances: "Finances",
      addiction: "Addictions",
      core: "Équilibre",
      global: "Global"
    };
    return map[key] || (key ? key.charAt(0).toUpperCase() + key.slice(1) : "—");
  }

  function renderChips(scores, diag) {
    const box = document.getElementById("proChips");
    if (!box) return;

    const entries = Object.entries(scores || {})
      .sort((a, b) => (b[1] || 0) - (a[1] || 0))
      .filter(([, v]) => (v || 0) > 0)
      .slice(0, 6);

    const primary = diag?.primary_domain;
    const primaryScore = diag?.primary_score ?? 0;

    const chips = [];

    if (primary) {
      chips.push(
        `<span class="pro-chip"><b>Focus</b> · ${escapeHTML(prettyDomainKey(primary))} · ${escapeHTML(severityLabel(primaryScore))}</span>`
      );
    }

    for (const [k, v] of entries) {
      chips.push(
        `<span class="pro-chip">${escapeHTML(prettyDomainKey(k))} · <b>${escapeHTML(v)}/100</b></span>`
      );
    }

    box.innerHTML = chips.join("");
  }

  function renderDiagnostic(diag) {
    setText("proTitle", diag?.title || "Vivario PRO");
    setText("proSub", (diag?.summary || "Diagnostic prêt.") );

    setText("diagSummary", diag?.summary || "—");

    const bullets = Array.isArray(diag?.bullets) ? diag.bullets : [];
    const ul = document.getElementById("diagBullets");
    if (ul) {
      ul.innerHTML = bullets.map(x => `<li>${escapeHTML(x)}</li>`).join("");
    }
  }

  function renderPlan(plan) {
    setText("planIntro", plan?.intro || "—");
    setText("planOutro", plan?.outro || "—");

    const grid = document.getElementById("planGrid");
    if (!grid) return;

    const steps = Array.isArray(plan?.steps) ? plan.steps : [];

    if (!steps.length) {
      grid.innerHTML = `<div class="plan-step"><p style="margin:0; color: rgba(234,240,255,.86);">Aucune étape trouvée. Relance le questionnaire PRO.</p></div>`;
      return;
    }

    grid.innerHTML = steps.map((s) => {
      const lines = Array.isArray(s.steps) ? s.steps : [];
      const mins = Number(s.minutes || 0) || 5;
      const when = s.when || "Aujourd’hui";
      const tags = Array.isArray(s.tags) ? s.tags : [];

      return `
        <div class="plan-step">
          <div class="plan-head">
            <div style="min-width:0;">
              <h4 class="plan-title">${escapeHTML(`${s.order}. ${s.title || "Étape"}`)}</h4>
              <p class="plan-meta">${escapeHTML(when)} · ${escapeHTML(mins)} min</p>
            </div>
            <span class="hist-pill">${escapeHTML(mins)} min</span>
          </div>

          ${lines.length ? `
            <ul class="pro-list" style="margin-top:10px;">
              ${lines.slice(0, 9).map(l => `<li>${escapeHTML(l)}</li>`).join("")}
            </ul>
          ` : `<p style="margin:10px 0 0; opacity:.9;">Ouvre l’étape et fais-la “simplement”.</p>`}

          ${tags.length ? `
            <div class="plan-tags">
              ${tags.slice(0, 8).map(t => `<span class="tag">${escapeHTML(t)}</span>`).join("")}
            </div>
          ` : ``}
        </div>
      `;
    }).join("");
  }

  // ===========================
  // Suivi / check-in
  // ===========================
  function checkinKey(day) {
    return `vivario_pro:checkin:${day}`;
  }

  function readCheckin(day) {
    try { return JSON.parse(localStorage.getItem(checkinKey(day)) || "null"); } catch { return null; }
  }

  function writeCheckin(day, payload) {
    localStorage.setItem(checkinKey(day), JSON.stringify(payload));
  }

  function lastNDays(n = 14) {
    const out = [];
    const d = new Date();
    for (let i = 0; i < n; i++) {
      const x = new Date(d);
      x.setDate(d.getDate() - i);
      out.push(isoDay(x));
    }
    return out;
  }

  function adherenceStats(n = 14) {
    const days = lastNDays(n);
    let done = 0;
    for (const day of days) {
      const v = readCheckin(day);
      if (v && v.done) done += 1;
    }
    const adherence = days.length ? done / days.length : 0;

    // streak: jours consécutifs "done" depuis aujourd'hui
    let streak = 0;
    for (const day of days) {
      const v = readCheckin(day);
      if (v && v.done) streak += 1;
      else break;
    }

    return { adherence, done, total: days.length, streak, days };
  }

  function renderAdherenceUI() {
    const { adherence, done, total, streak } = adherenceStats(14);
    const pct = Math.round(adherence * 100);

    const fill = document.getElementById("barFill");
    if (fill) fill.style.width = `${pct}%`;

    const txt = document.getElementById("adhText");
    if (txt) {
      txt.textContent = `Adhérence 14 jours : ${pct}% (${done}/${total}). Streak : ${streak} jour(s).`;
    }
  }

  function renderHistory() {
    const box = document.getElementById("proHistory");
    if (!box) return;

    const days = lastNDays(14);
    const rows = [];

    for (const day of days) {
      const v = readCheckin(day);
      const done = !!v?.done;
      const note = (v?.note || "").trim();

      rows.push(`
        <div class="hist-row">
          <div class="hist-left">
            <div class="hist-date">${escapeHTML(day)}</div>
            <div class="hist-note">${escapeHTML(note || (done ? "Fait au moins 1 étape." : "Non coché."))}</div>
          </div>
          <div class="hist-pill" style="
            ${done
              ? "border-color: rgba(35,150,170,.25); background: rgba(35,150,170,.12);"
              : "border-color: rgba(255,255,255,.12); background: rgba(0,0,0,.16);"}
          ">
            ${done ? "✅ Fait" : "—"}
          </div>
        </div>
      `);
    }

    box.innerHTML = rows.join("");
  }

  function bindCheckin(resultPayload) {
    const ck = document.getElementById("ckDone");
    const btn = document.getElementById("btnSaveCheckin");

    const today = isoDay();
    const existing = readCheckin(today);
    if (ck) ck.checked = !!existing?.done;

    btn?.addEventListener("click", () => {
      const done = !!ck?.checked;

      // mini note auto utile (focus + 1 module)
      const primary = resultPayload?.diagnostic?.primary_domain || "global";
      const step1 = resultPayload?.plan?.steps?.[0]?.title || "";
      const note = `Focus: ${prettyDomainKey(primary)}${step1 ? ` · Étape: ${step1}` : ""}`;

      writeCheckin(today, {
        at: new Date().toISOString(),
        done,
        note,
        seed: resultPayload?.seed || null
      });

      btn.textContent = "✅ Enregistré";
      setTimeout(() => (btn.textContent = "✅ Enregistrer mon suivi"), 1200);

      renderAdherenceUI();
      renderHistory();
    });
  }

  // ===========================
  // Export / Copy
  // ===========================
  function buildCopyText(payload) {
    const diag = payload?.diagnostic || {};
    const plan = payload?.plan || {};
    const scores = payload?.scores || {};

    const topScores = Object.entries(scores)
      .sort((a,b) => (b[1]||0) - (a[1]||0))
      .slice(0, 6)
      .map(([k,v]) => `- ${prettyDomainKey(k)}: ${v}/100`)
      .join("\n");

    const bullets = (diag?.bullets || []).map(b => `- ${b}`).join("\n");
    const steps = (plan?.steps || []).map(s => {
      const lines = (s.steps || []).map(x => `    • ${x}`).join("\n");
      return `- ${s.order}. ${s.title} (${s.minutes || 5} min)\n${lines}`;
    }).join("\n");

    return [
      `VIVARIO PRO — ${new Date(payload?.created_at || Date.now()).toLocaleString("fr-FR")}`,
      ``,
      `DIAGNOSTIC`,
      `${diag?.summary || ""}`,
      bullets ? `\nPoints:\n${bullets}` : ``,
      ``,
      `SCORES`,
      topScores || "- (aucun score)",
      ``,
      `PLAN DU JOUR`,
      `${plan?.intro || ""}`,
      ``,
      steps || "- (aucune étape)",
      ``,
      `${plan?.outro || ""}`
    ].filter(Boolean).join("\n");
  }

  function bindExport(payload) {
    const btnCopy = document.getElementById("btnCopyAll");
    const btnSave = document.getElementById("btnExportToday");

    btnCopy?.addEventListener("click", async () => {
      const txt = buildCopyText(payload);
      try {
        await navigator.clipboard.writeText(txt);
        btnCopy.textContent = "✅ Copié";
        setTimeout(() => (btnCopy.textContent = "📋 Copier tout"), 1200);
      } catch {
        alert("Copie impossible sur ce navigateur.");
      }
    });

    btnSave?.addEventListener("click", () => {
      const key = "vivario_pro:saved:" + isoDay();
      const txt = buildCopyText(payload);
      localStorage.setItem(key, txt);
      btnSave.textContent = "✅ Sauvé";
      setTimeout(() => (btnSave.textContent = "💾 Sauver aujourd’hui"), 1400);
    });
  }

  // ===========================
  // Main
  // ===========================
  function main() {
    const payload = readResult();

    if (!payload) {
      setText("proTitle", "Aucun résultat PRO");
      setText("proSub", "Lance le questionnaire PRO pour générer ton diagnostic.");
      setText("diagSummary", "—");
      setHTML("diagBullets", `<li>Retourne à l’accueil et démarre Vivario PRO.</li>`);
      setText("planIntro", "—");
      setHTML("planGrid", `<div class="plan-step"><p style="margin:0;">Aucun plan à afficher.</p></div>`);
      setText("planOutro", "—");
      renderAdherenceUI();
      renderHistory();
      return;
    }

    renderDiagnostic(payload.diagnostic);
    renderChips(payload.scores, payload.diagnostic);
    renderPlan(payload.plan);

    bindExport(payload);
    bindCheckin(payload);

    renderAdherenceUI();
    renderHistory();
  }

  main();
})();