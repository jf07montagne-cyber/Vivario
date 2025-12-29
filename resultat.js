/* Vivario — resultat.js (v13)
   ✅ onglets scénarios
   ✅ coach doux toggle (re-génération depuis draft si dispo)
   ✅ copier + sauvegarde jour + historique
   ✅ bouton "Revenir demain" (rappel simple via localStorage)
*/

(() => {
  const STORAGE_KEY = "vivario_session_v1_1";
  const KEY_COACH = "vivario_coach_soft";
  const HIST_KEY = "vivario_history_v1";
  const REMIND_KEY = "vivario_return_tomorrow";

  const elMeta = document.getElementById("metaLine");
  const elFinal = document.getElementById("finalMessage");
  const elTabs = document.getElementById("tabs");
  const elPanes = document.getElementById("panes");
  const elChips = document.getElementById("chips");
  const elHistory = document.getElementById("historyList");

  const tCoach = document.getElementById("coachSoftResult");

  const btnCopy = document.getElementById("btnCopy");
  const btnSave = document.getElementById("btnSaveToday");
  const btnTomorrow = document.getElementById("btnReturnTomorrow");
  const btnClear = document.getElementById("btnClearHistory");

  function todayKey(){
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const day = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  }

  function loadSession(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    }catch{
      return null;
    }
  }

  function loadHistory(){
    try{
      const raw = localStorage.getItem(HIST_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    }catch{
      return [];
    }
  }

  function saveHistory(list){
    try{ localStorage.setItem(HIST_KEY, JSON.stringify(list)); }catch{}
  }

  function escapeHtml(s){
    return String(s || "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;");
  }

  function makeChip(text){
    const div = document.createElement("span");
    div.className = "coach-pill";
    div.style.opacity = "0.95";
    div.textContent = text;
    return div;
  }

  function renderChips(profile){
    if (!elChips || !profile) return;
    elChips.innerHTML = "";
    const items = [];
    if (profile.tone) items.push(`État : ${profile.tone}`);
    if (profile.focus?.[0]) items.push(`Focus : ${profile.focus[0]}`);
    if (profile.focus?.[1]) items.push(`Focus : ${profile.focus[1]}`);
    if (profile.energie) items.push(`Énergie : ${profile.energie}`);
    items.forEach(t => elChips.appendChild(makeChip(t)));
  }

  function renderFinal(text){
    if (!elFinal) return;
    const parts = String(text || "").split("\n\n").map(p => p.trim()).filter(Boolean);
    elFinal.innerHTML = parts.map(p => `<p>${escapeHtml(p)}</p>`).join("");
  }

  function renderTabs(scenarios){
    if (!elTabs || !elPanes) return;
    elTabs.innerHTML = "";
    elPanes.innerHTML = "";

    (scenarios || []).forEach((sc, i) => {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "tab" + (i === 0 ? " active" : "");
      tab.textContent = sc.title || sc.key;
      tab.dataset.key = sc.key;

      const pane = document.createElement("div");
      pane.className = "pane" + (i === 0 ? " active" : "");
      pane.dataset.key = sc.key;
      pane.innerHTML = String(sc.text || "")
        .split("\n\n")
        .map(p => p.trim()).filter(Boolean)
        .map(p => `<p>${escapeHtml(p)}</p>`)
        .join("");

      tab.addEventListener("click", () => {
        [...elTabs.querySelectorAll(".tab")].forEach(x => x.classList.remove("active"));
        [...elPanes.querySelectorAll(".pane")].forEach(x => x.classList.remove("active"));
        tab.classList.add("active");
        pane.classList.add("active");
      });

      elTabs.appendChild(tab);
      elPanes.appendChild(pane);
    });
  }

  function buildCopyText(session){
    const lines = [];
    lines.push("Vivario — Résultat");
    lines.push(session?.createdAt ? new Date(session.createdAt).toLocaleString() : "");
    lines.push("");
    lines.push(session?.finalMessage || "");
    lines.push("");
    (session?.scenarios || []).forEach(sc => {
      lines.push("— " + (sc.title || sc.key));
      lines.push(sc.text || "");
      lines.push("");
    });
    return lines.join("\n").trim();
  }

  async function doCopy(session){
    const txt = buildCopyText(session);
    try{
      await navigator.clipboard.writeText(txt);
      btnCopy.textContent = "✅ Copié";
      setTimeout(() => (btnCopy.textContent = "📋 Copier"), 1200);
    }catch{
      // fallback
      const ta = document.createElement("textarea");
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      try{ document.execCommand("copy"); }catch{}
      ta.remove();
      btnCopy.textContent = "✅ Copié";
      setTimeout(() => (btnCopy.textContent = "📋 Copier"), 1200);
    }
  }

  function saveToday(session){
    const key = todayKey();
    const hist = loadHistory();

    const item = {
      day: key,
      createdAt: session.createdAt,
      profile: session.profile,
      finalMessage: session.finalMessage,
      scenarios: session.scenarios
    };

    const idx = hist.findIndex(x => x.day === key);
    if (idx >= 0) hist[idx] = item;
    else hist.unshift(item);

    // cap
    while (hist.length > 40) hist.pop();

    saveHistory(hist);
    renderHistory(hist);

    btnSave.textContent = "✅ Sauvé";
    setTimeout(() => (btnSave.textContent = "💾 Sauver pour aujourd’hui"), 1200);
  }

  function renderHistory(list){
    if (!elHistory) return;
    const hist = Array.isArray(list) ? list : [];
    if (!hist.length) {
      elHistory.innerHTML = `<p class="muted" style="margin:0;">Aucun historique pour l’instant.</p>`;
      return;
    }

    elHistory.innerHTML = "";
    hist.forEach(item => {
      const card = document.createElement("div");
      card.className = "card";
      card.style.margin = "10px 0";
      card.style.padding = "12px";

      const title = document.createElement("div");
      title.style.fontWeight = "800";
      title.textContent = `📅 ${item.day}`;

      const sub = document.createElement("div");
      sub.className = "tiny muted";
      sub.style.marginTop = "4px";
      sub.textContent = item.createdAt ? new Date(item.createdAt).toLocaleString() : "";

      const actions = document.createElement("div");
      actions.className = "actions";
      actions.style.marginTop = "10px";

      const btnOpen = document.createElement("button");
      btnOpen.className = "btn ghost";
      btnOpen.type = "button";
      btnOpen.textContent = "Ouvrir";
      btnOpen.addEventListener("click", () => {
        // charge dans la vue actuelle
        renderChips(item.profile);
        renderFinal(item.finalMessage);
        renderTabs(item.scenarios);
        if (elMeta) elMeta.textContent = `Historique • ${item.day}`;
        window.scrollTo({ top: 0, behavior: "smooth" });
      });

      const btnCopyDay = document.createElement("button");
      btnCopyDay.className = "btn ghost";
      btnCopyDay.type = "button";
      btnCopyDay.textContent = "Copier";
      btnCopyDay.addEventListener("click", async () => {
        const fakeSession = { createdAt: item.createdAt, profile: item.profile, finalMessage: item.finalMessage, scenarios: item.scenarios };
        await doCopy(fakeSession);
      });

      actions.appendChild(btnOpen);
      actions.appendChild(btnCopyDay);

      card.appendChild(title);
      card.appendChild(sub);
      card.appendChild(actions);
      elHistory.appendChild(card);
    });
  }

  function scheduleReturnTomorrow(){
    // Simple flag + message sur prochaine ouverture
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(8,0,0,0); // demain 08:00 local
    localStorage.setItem(REMIND_KEY, String(d.getTime()));
    btnTomorrow.textContent = "✅ OK";
    setTimeout(() => (btnTomorrow.textContent = "🗓 Revenir demain"), 1200);
  }

  function showReturnMessageIfDue(){
    try{
      const t = parseInt(localStorage.getItem(REMIND_KEY) || "0", 10);
      if (!t) return;
      if (Date.now() >= t) {
        localStorage.removeItem(REMIND_KEY);
        // petit message discret
        const n = document.createElement("div");
        n.className = "card";
        n.style.margin = "10px 0";
        n.style.padding = "12px";
        n.innerHTML = `<div style="font-weight:800;">🗓 Petit rappel</div>
                       <div class="tiny muted" style="margin-top:4px;">Tu voulais revenir aujourd’hui. Tu peux refaire un tour du questionnaire si tu veux.</div>`;
        const wrap = document.querySelector(".wrap");
        wrap && wrap.insertBefore(n, wrap.children[2] || null);
      }
    }catch{}
  }

  function init(){
    const session = loadSession();
    if (!session) {
      if (elMeta) elMeta.textContent = "Aucune session trouvée.";
      renderFinal("Impossible de charger le résultat. Reviens à l’accueil et relance le questionnaire.");
      return;
    }

    if (elMeta) {
      const dt = session.createdAt ? new Date(session.createdAt).toLocaleString() : "";
      elMeta.textContent = `Version ${session.version || "1.1"} • ${dt}`;
    }

    // coach toggle sync
    if (tCoach) {
      tCoach.checked = (localStorage.getItem(KEY_COACH) === "1");
      tCoach.addEventListener("change", () => {
        localStorage.setItem(KEY_COACH, tCoach.checked ? "1" : "0");
      });
    }

    renderChips(session.profile);
    renderFinal(session.finalMessage);
    renderTabs(session.scenarios);

    const hist = loadHistory();
    renderHistory(hist);

    showReturnMessageIfDue();

    btnCopy && btnCopy.addEventListener("click", () => doCopy(session));
    btnSave && btnSave.addEventListener("click", () => saveToday(session));
    btnTomorrow && btnTomorrow.addEventListener("click", scheduleReturnTomorrow);

    btnClear && btnClear.addEventListener("click", () => {
      saveHistory([]);
      renderHistory([]);
      btnClear.textContent = "✅ Effacé";
      setTimeout(() => (btnClear.textContent = "🗑 Effacer l’historique"), 1200);
    });
  }

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("pageshow", init);
})();