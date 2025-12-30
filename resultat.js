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
      return;
    }

    const scenarios = Array.isArray(session.scenarios) ? session.scenarios : [];
    const byKey = (k) => scenarios.find(s => s.key === k) || null;

    const profile = session.profile || {};

    // Titre de la page (carte hero)
    setText("resTitle", (scenarios[0]?.title) || "Résultat");
    setText(
      "resSub",
      session.finalMessage ? session.finalMessage.split("\n")[0] : "Prends une respiration…"
    );

    // ✅ AMÉLIORATION : label du 1er onglet = titre du scénario principal (root)
    const tabMain = document.querySelector('.tab[data-pane="main"]');
    if (tabMain) tabMain.textContent = (scenarios[0]?.title) || "Résultat";

    // Chips
    const chips = document.getElementById("resChips");
    if (chips) {
      chips.innerHTML = "";
      const tags = Array.isArray(profile.tags) ? profile.tags : [];
      tags.slice(0, 6).forEach(t => {
        const el = document.createElement("span");
        el.className = "chip";
        el.textContent = String(t).replace(/^(\w+):/, "$1 · ");
        chips.appendChild(el);
      });
    }

    const paneMain = document.getElementById("pane-main");
    const paneStep = document.getElementById("pane-step");
    const paneCalm = document.getElementById("pane-calm");
    const paneNorm = document.getElementById("pane-norm");

    const sMain = byKey("main");
    const sStep = byKey("step");
    const sCalm = byKey("calm");
    const sNorm = byKey("norm");

    if (paneMain) paneMain.innerHTML = toParagraphs(sMain?.text || session.finalMessage || "");
    if (paneStep) paneStep.innerHTML = toParagraphs(sStep?.text || "—");
    if (paneCalm) paneCalm.innerHTML = toParagraphs(sCalm?.text || "—");
    if (paneNorm) paneNorm.innerHTML = toParagraphs(sNorm?.text || "—");

    const getCurrentText = () => {
      const active = document.querySelector(".pane.active");
      return active ? active.innerText : "";
    };

    bindActions(getCurrentText);
  }

  main();
})();