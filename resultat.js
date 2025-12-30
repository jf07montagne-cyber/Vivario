// resultat.js (anti-répétition + rendu + historique)
(() => {
  const HISTORY_KEY = "vivario:scenarioHistory"; // array d'IDs
  const HISTORY_MAX = 20;

  function getHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); }
    catch { return []; }
  }
  function pushHistory(id) {
    const h = getHistory().filter(x => x !== id);
    h.unshift(id);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, HISTORY_MAX)));
  }

  function pickNonRepetitive(list) {
    const hist = new Set(getHistory());
    const fresh = list.filter(s => !hist.has(s.id));
    const pool = fresh.length ? fresh : list; // si tout a été vu, on recycle
    return pool[Math.floor(Math.random() * pool.length)];
  }

  async function loadJSON(path) {
    const r = await fetch(path, { cache: "no-store" });
    if (!r.ok) throw new Error("JSON introuvable: " + path);
    return r.json();
  }

  function renderScenario(s) {
    const title = document.getElementById("resTitle");
    const sub = document.getElementById("resSub");
    const text = document.getElementById("resText");
    const chips = document.getElementById("resChips");

    title.textContent = s.title || "Résultat";
    sub.textContent = s.subtitle || "Prends une respiration…";

    chips.innerHTML = "";
    (s.tags || []).slice(0, 6).forEach(t => {
      const el = document.createElement("span");
      el.className = "chip";
      el.textContent = t;
      chips.appendChild(el);
    });

    const paragraphs = (s.text || "").split("\n").map(x => x.trim()).filter(Boolean);
    text.innerHTML = paragraphs.map(p => `<p>${escapeHTML(p)}</p>`).join("");
  }

  function escapeHTML(str) {
    return str.replace(/[&<>"']/g, (m) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[m]));
  }

  function bindActions() {
    const btnCopy = document.getElementById("btnCopy");
    const btnSave = document.getElementById("btnSaveToday");
    const resText = document.getElementById("resText");

    btnCopy?.addEventListener("click", async () => {
      const txt = resText.innerText.trim();
      try {
        await navigator.clipboard.writeText(txt);
        btnCopy.textContent = "✅ Copié";
        setTimeout(() => (btnCopy.textContent = "📋 Copier"), 1200);
      } catch {
        alert("Copie impossible sur ce navigateur.");
      }
    });

    btnSave?.addEventListener("click", () => {
      const todayKey = "vivario:saved:" + new Date().toISOString().slice(0,10);
      localStorage.setItem(todayKey, resText.innerText.trim());
      btnSave.textContent = "✅ Sauvé";
      setTimeout(() => (btnSave.textContent = "💾 Sauver pour aujourd’hui"), 1400);
      renderHistory();
    });
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
      const txt = (localStorage.getItem(k) || "").split("\n").slice(0,2).join(" ");
      return `
        <div class="sep"></div>
        <p style="margin:10px 0 6px; font-weight:800;">${date}</p>
        <p class="muted" style="margin:0; line-height:1.5;">${escapeHTML(txt)}…</p>
      `;
    }).join("");
  }

  async function main() {
    bindActions();
    renderHistory();

    // charge scénarios
    const data = await loadJSON("scenarios_v1_1.json");

    // data attendu: { scenarios:[{id,title,subtitle,text,tags:[]}, ...] }
    const list = Array.isArray(data.scenarios) ? data.scenarios : [];
    if (!list.length) {
      document.getElementById("resText").innerHTML =
        `<p>Scénarios introuvables dans scenarios_v1_1.json</p>`;
      return;
    }

    const chosen = pickNonRepetitive(list);
    if (chosen?.id) pushHistory(chosen.id);
    renderScenario(chosen);
  }

  main().catch(err => {
    console.error(err);
    const box = document.getElementById("resText");
    if (box) box.innerHTML = `<p>Erreur : ${escapeHTML(String(err.message || err))}</p>`;
  });
})();