(() => {
  const PRO_RESULT_KEY = "vivario_pro_result_v1";

  // ---------------------------
  // Helpers
  // ---------------------------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const escapeHTML = (str) =>
    String(str || "").replace(/[&<>"']/g, (m) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[m]));

  const asArr = (v) => Array.isArray(v) ? v : (v == null ? [] : [v]);

  function setText(id, value){
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function formatDate(iso){
    try{
      const d = new Date(iso);
      return d.toLocaleString("fr-FR", { dateStyle:"medium", timeStyle:"short" });
    }catch{
      return "—";
    }
  }

  function lc(s){ return String(s||"").toLowerCase(); }

  function bindTabs(){
    const tabs = $$(".pro-tab");
    tabs.forEach(btn => {
      btn.addEventListener("click", () => {
        const key = btn.getAttribute("data-pane");
        tabs.forEach(b => b.classList.toggle("active", b === btn));
        ["diagnostic","plan","suivi"].forEach(k => {
          const pane = document.getElementById("pane-" + k);
          if (pane) pane.classList.toggle("active", k === key);
        });
      });
    });
  }

  // ---------------------------
  // History (saved snapshots)
  // ---------------------------
  function renderHistory(){
    const box = document.getElementById("history");
    if (!box) return;

    const keys = Object.keys(localStorage)
      .filter(k => k.startsWith("vivario_pro:saved:"))
      .sort()
      .reverse()
      .slice(0, 12);

    if (!keys.length){
      box.innerHTML = `<p class="pro-muted" style="margin:0;">Aucune sauvegarde PRO pour l’instant.</p>`;
      return;
    }

    box.innerHTML = keys.map(k => {
      const date = k.replace("vivario_pro:saved:", "");
      let txt = "";
      try{
        const payload = JSON.parse(localStorage.getItem(k) || "null");
        txt = payload?.diagnostic?.summary || payload?.diagnostic?.title || "";
      }catch{}
      txt = String(txt||"").replace(/\*\*/g,"").trim();
      if (txt.length > 160) txt = txt.slice(0, 157).trim() + "…";

      return `
        <div class="pro-historyItem">
          <p class="pro-historyDate">${escapeHTML(date)}</p>
          <p class="pro-historyTxt">${escapeHTML(txt || "—")}</p>
        </div>
      `;
    }).join("");
  }

  // ---------------------------
  // Suivi / check-in
  // ---------------------------
  function todayKey(){
    return new Date().toISOString().slice(0, 10);
  }

  function readCheckin(dateStr){
    const k = "vivario_pro:checkin:" + dateStr;
    try{ return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; }
  }

  function writeCheckin(dateStr, data){
    const k = "vivario_pro:checkin:" + dateStr;
    try{ localStorage.setItem(k, JSON.stringify(data)); } catch {}
  }

  function computeAdherence(days = 14){
    const keys = Object.keys(localStorage)
      .filter(k => k.startsWith("vivario_pro:checkin:"))
      .sort()
      .reverse()
      .slice(0, days);

    if (!keys.length) return { adherence: 0, streak: 0, total: 0, done: 0 };

    let done = 0;
    for (const k of keys){
      try{
        const v = JSON.parse(localStorage.getItem(k) || "{}");
        if (v && v.done) done += 1;
      }catch{}
    }

    let streak = 0;
    for (const k of keys){
      try{
        const v = JSON.parse(localStorage.getItem(k) || "{}");
        if (v && v.done) streak += 1;
        else break;
      }catch{ break; }
    }

    return { adherence: done / keys.length, streak, total: keys.length, done };
  }

  // ---------------------------
  // Rendering
  // ---------------------------
  function renderMiniCards(payload){
    const box = document.getElementById("miniCards");
    if (!box) return;

    const diag = payload?.diagnostic || {};
    const plan = payload?.plan || {};
    const steps = asArr(plan.steps);

    const bullets = asArr(diag.bullets).slice(0, 3);
    const bulletsHtml = bullets.length
      ? `<ul style="margin:8px 0 0; padding-left:18px; line-height:1.6;">
           ${bullets.map(b => `<li>${escapeHTML(String(b).replace(/^•\s*/,""))}</li>`).join("")}
         </ul>`
      : `<p class="v">—</p>`;

    const estMin = steps.reduce((acc, s) => acc + Number(s?.minutes || 0), 0);

    box.innerHTML = `
      <div class="pro-mini">
        <div class="k">🧭 Ce qui ressort</div>
        <p class="v" style="margin:0;">${escapeHTML(diag.title || "Diagnostic")}</p>
        ${bulletsHtml}
      </div>

      <div class="pro-mini">
        <div class="k">🗓️ Plan du jour</div>
        <p class="v" style="margin:0;">${escapeHTML(plan.title || "Plan")}</p>
        <p class="v" style="margin:8px 0 0;">
          ${escapeHTML(steps.length ? `${steps.length} étape(s) · ~${estMin || "?"} min` : "—")}
        </p>
      </div>
    `;
  }

  function renderChips(payload){
    const box = document.getElementById("proChips");
    if (!box) return;

    const diag = payload?.diagnostic || {};
    const chips = [];

    if (diag.primary_domain) chips.push("Domaine · " + diag.primary_domain);
    if (typeof diag.primary_score === "number") chips.push("Score · " + diag.primary_score + "/100");
    if (payload?.answers?.energy) chips.push("Énergie · " + payload.answers.energy);

    const flags = asArr(diag.flags);
    flags.slice(0, 2).forEach(f => chips.push("Signal · " + f));

    if (!chips.length){
      box.style.display = "none";
      return;
    }

    box.style.display = "";
    box.innerHTML = chips.slice(0, 6).map(t => `<span class="pro-chip">${escapeHTML(t)}</span>`).join("");
  }

  function renderScores(payload){
    const scores = payload?.scores || {};
    const entries = Object.entries(scores)
      .filter(([,v]) => typeof v === "number" && v > 0)
      .sort((a,b) => (b[1]||0) - (a[1]||0))
      .slice(0, 6);

    const list = document.getElementById("scoreList");
    if (!list) return;

    if (!entries.length){
      list.innerHTML = `<p class="pro-muted" style="margin:0;">Aucun score.</p>`;
      return;
    }

    list.innerHTML = entries.map(([k,v]) => `
      <div class="pro-scoreRow">
        <div class="name">${escapeHTML(k)}</div>
        <div style="display:flex; gap:10px; align-items:center; justify-content:flex-end;">
          <div class="pro-bar" style="width:140px;">
            <i style="width:${Math.max(2, Math.min(100, v))}%;"></i>
          </div>
          <div style="min-width:52px; text-align:right; font-weight:950;">${escapeHTML(v)}/100</div>
        </div>
      </div>
    `).join("");
  }

  function renderDiagnosticPane(payload){
    const pane = document.getElementById("pane-diagnostic");
    if (!pane) return;

    const diag = payload?.diagnostic || {};
    const bullets = asArr(diag.bullets);

    const html = `
      <p style="margin-top:0;"><strong>${escapeHTML(diag.title || "Diagnostic")}</strong></p>
      <p>${escapeHTML(String(diag.summary || "—").replace(/\*\*/g, ""))}</p>

      ${bullets.length ? `
        <div class="pro-kv" style="margin-top:12px;">
          <div class="pro-kvBox">
            <div class="k">Points clés</div>
            <p class="v" style="margin:0; line-height:1.65;">
              ${bullets.slice(0, 8).map(b => escapeHTML(String(b).replace(/^•\s*/,""))).join("<br>")}
            </p>
          </div>

          <div class="pro-kvBox">
            <div class="k">Intention</div>
            <p class="v" style="margin:0;">
              On vise <strong>utile</strong> et <strong>tenable</strong>. Stabiliser d’abord, puis renforcer.
            </p>
          </div>
        </div>
      ` : `
        <p class="pro-muted">—</p>
      `}
    `;

    pane.innerHTML = html;
  }

  function renderPlanPane(payload){
    const pane = document.getElementById("pane-plan");
    if (!pane) return;

    const plan = payload?.plan || {};
    const steps = asArr(plan.steps);

    const today = todayKey();
    const checkin = readCheckin(today) || { done:false, completed:{} };

    const head = `
      <p style="margin-top:0;"><strong>${escapeHTML(plan.title || "Plan")}</strong></p>
      <p>${escapeHTML(String(plan.intro || "—").replace(/\*\*/g, ""))}</p>
    `;

    const stepsHtml = steps.length ? `
      <div class="pro-planGrid">
        ${steps.map((s, idx) => {
          const sid = String(s.id || ("step_" + (idx+1)));
          const checked = !!checkin?.completed?.[sid];
          const substeps = asArr(s.steps);

          return `
            <div class="pro-step">
              <div class="pro-stepHead">
                <div>
                  <p class="pro-stepTitle">Étape ${escapeHTML(s.order || (idx+1))} — ${escapeHTML(s.title || "Exercice")}</p>
                </div>
                <div class="pro-stepMeta">
                  ${escapeHTML(String(s.when || "Aujourd’hui"))}<br>
                  ${escapeHTML(String(s.minutes || 5))} min
                </div>
              </div>

              ${substeps.length ? `
                <div style="margin-top:8px; line-height:1.65; color: rgba(238,242,255,.92);">
                  ${substeps.slice(0, 10).map(x => `• ${escapeHTML(x)}`).join("<br>")}
                </div>
              ` : `
                <p class="pro-muted" style="margin:0;">Détails à venir.</p>
              `}

              <div class="pro-checkRow">
                <input type="checkbox" data-step="${escapeHTML(sid)}" ${checked ? "checked" : ""} />
                <div>
                  <div style="font-weight:950;">Fait</div>
                  <div class="pro-muted" style="margin-top:2px;">Coche quand c’est terminé. Ça nourrit ton suivi.</div>
                </div>
              </div>
            </div>
          `;
        }).join("")}
      </div>

      <p style="margin-top:12px;">${escapeHTML(String(plan.outro || "").replace(/\*\*/g, ""))}</p>
    ` : `<p class="pro-muted">Aucune étape pour l’instant.</p>`;

    pane.innerHTML = head + stepsHtml;

    // bind checkboxes
    pane.querySelectorAll('input[type="checkbox"][data-step]').forEach(cb => {
      cb.addEventListener("change", () => {
        const sid = cb.getAttribute("data-step");
        const c = readCheckin(today) || { done:false, completed:{} };
        c.completed = c.completed || {};
        c.completed[sid] = !!cb.checked;

        // done = au moins 1 étape cochée OU toutes cochées (au choix : ici, >= 1)
        const any = Object.values(c.completed).some(Boolean);
        c.done = any;

        c.updated_at = new Date().toISOString();
        writeCheckin(today, c);

        // refresh suivi pane if visible
        renderSuiviPane(payload);
      });
    });
  }

  function renderSuiviPane(payload){
    const pane = document.getElementById("pane-suivi");
    if (!pane) return;

    const today = todayKey();
    const stats = computeAdherence(14);
    const checkin = readCheckin(today);

    const adherencePct = Math.round((stats.adherence || 0) * 100);

    pane.innerHTML = `
      <div class="pro-kv">
        <div class="pro-kvBox">
          <div class="k">Adhérence (14 jours)</div>
          <p class="v">${escapeHTML(adherencePct)}% (${escapeHTML(stats.done)}/${escapeHTML(stats.total)} jours)</p>
        </div>

        <div class="pro-kvBox">
          <div class="k">Série actuelle</div>
          <p class="v">${escapeHTML(stats.streak)} jour(s)</p>
        </div>

        <div class="pro-kvBox">
          <div class="k">Aujourd’hui</div>
          <p class="v">${checkin?.done ? "✅ Une action validée" : "— Pas encore validé"}</p>
        </div>

        <div class="pro-kvBox">
          <div class="k">Conseil PRO</div>
          <p class="v">Le suivi sert à réduire la culpabilité : on regarde <strong>le rythme</strong>, pas la perfection.</p>
        </div>
      </div>
    `;
  }

  // ---------------------------
  // Copy / Save
  // ---------------------------
  function toPlainText(payload){
    const diag = payload?.diagnostic || {};
    const plan = payload?.plan || {};
    const steps = asArr(plan.steps);

    const lines = [];
    lines.push("VIVARIO PRO — RÉSULTAT");
    lines.push(formatDate(payload?.created_at));
    lines.push("");
    lines.push("DIAGNOSTIC");
    lines.push(diag.title || "—");
    lines.push(String(diag.summary || "").replace(/\*\*/g,"").trim());
    asArr(diag.bullets).forEach(b => lines.push(String(b).replace(/^•\s*/,"- ")));
    lines.push("");
    lines.push("PLAN");
    lines.push(plan.title || "—");
    lines.push(String(plan.intro || "").replace(/\*\*/g,"").trim());
    lines.push("");

    steps.forEach((s, i) => {
      lines.push(`Étape ${s.order || (i+1)} — ${s.title || "Exercice"} (${s.minutes || 5} min, ${s.when || "Aujourd’hui"})`);
      asArr(s.steps).slice(0, 10).forEach(x => lines.push("- " + x));
      lines.push("");
    });

    if (plan.outro) lines.push(String(plan.outro || "").replace(/\*\*/g,"").trim());
    return lines.filter(Boolean).join("\n");
  }

  function bindActions(payload){
    const btnCopy = document.getElementById("btnCopy");
    const btnSave = document.getElementById("btnSaveToday");

    btnCopy?.addEventListener("click", async () => {
      const txt = toPlainText(payload);
      try{
        await navigator.clipboard.writeText(txt);
        btnCopy.textContent = "✅ Copié";
        setTimeout(() => (btnCopy.textContent = "📋 Copier"), 1200);
      }catch{
        alert("Copie impossible sur ce navigateur.");
      }
    });

    btnSave?.addEventListener("click", () => {
      const key = "vivario_pro:saved:" + todayKey();
      try{
        localStorage.setItem(key, JSON.stringify(payload));
      }catch{}
      btnSave.textContent = "✅ Sauvé";
      setTimeout(() => (btnSave.textContent = "💾 Sauver"), 1400);
      renderHistory();
    });
  }

  // ---------------------------
  // Load
  // ---------------------------
  function readResult(){
    // 1) via API VivarioProLogic si dispo
    if (window.VivarioProLogic?.readResult){
      const r = window.VivarioProLogic.readResult();
      if (r) return r;
    }
    // 2) fallback direct localStorage
    try{
      return JSON.parse(localStorage.getItem(PRO_RESULT_KEY) || "null");
    }catch{
      return null;
    }
  }

  function renderEmpty(){
    setText("diagTitle", "Aucun résultat PRO");
    setText("diagSummary", "Lance le questionnaire PRO pour générer un diagnostic et un plan.");
    setText("proSubtitle", "—");
    setText("proDate", "—");
    setText("primaryScore", "—");
    setText("primaryDomain", "Domaine principal");

    const mini = document.getElementById("miniCards");
    if (mini) mini.innerHTML = "";

    const paneD = document.getElementById("pane-diagnostic");
    const paneP = document.getElementById("pane-plan");
    const paneS = document.getElementById("pane-suivi");

    if (paneD) paneD.innerHTML = `<p class="pro-muted" style="margin:0;">Aucun résultat en mémoire.</p>`;
    if (paneP) paneP.innerHTML = `<p class="pro-muted" style="margin:0;">—</p>`;
    if (paneS) paneS.innerHTML = `<p class="pro-muted" style="margin:0;">—</p>`;

    const scores = document.getElementById("scoreList");
    if (scores) scores.innerHTML = `<p class="pro-muted" style="margin:0;">—</p>`;

    const chips = document.getElementById("proChips");
    if (chips) chips.style.display = "none";
  }

  function main(){
    bindTabs();
    renderHistory();

    const payload = readResult();
    if (!payload){
      renderEmpty();
      return;
    }

    const diag = payload.diagnostic || {};
    setText("diagTitle", diag.title || "Diagnostic Vivario PRO");
    setText("diagSummary", String(diag.summary || "—").replace(/\*\*/g,""));
    setText("proSubtitle", "Diagnostic + plan + suivi — calibré sur toi.");
    setText("proDate", formatDate(payload.created_at));

    const primaryScore = typeof diag.primary_score === "number" ? diag.primary_score : null;
    setText("primaryScore", primaryScore != null ? `${primaryScore}` : "—");
    setText("primaryDomain", diag.primary_domain ? `Domaine principal · ${diag.primary_domain}` : "Domaine principal");

    renderMiniCards(payload);
    renderChips(payload);
    renderScores(payload);

    renderDiagnosticPane(payload);
    renderPlanPane(payload);
    renderSuiviPane(payload);

    bindActions(payload);
  }

  main();
})();