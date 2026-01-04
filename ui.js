/* ui.js — micro animations premium (safe) v18 */
(() => {
  const css = document.createElement("style");
  css.textContent = `
    .viv-reveal{ opacity:0; transform: translateY(10px); transition: opacity .55s ease, transform .55s ease; }
    .viv-reveal.is-in{ opacity:1; transform: translateY(0); }
    .viv-float{ animation: vivFloat 8s ease-in-out infinite; }
    @keyframes vivFloat{ 0%{transform:translateY(0)} 50%{transform:translateY(10px)} 100%{transform:translateY(0)} }
    .viv-shimmer{ position: relative; overflow: hidden; }
    .viv-shimmer::after{
      content:"";
      position:absolute; inset:-40%;
      background: radial-gradient(closest-side, rgba(255,255,255,.16), transparent 60%);
      transform: translateX(-40%);
      opacity:.22;
      pointer-events:none;
      animation: vivShimmer 9s ease-in-out infinite;
    }
    @keyframes vivShimmer{ 0%{transform:translateX(-35%)} 50%{transform:translateX(25%)} 100%{transform:translateX(-35%)} }

    /* ✅ Vivario PRO entry card (safe) */
    #vivarioProEntry .pro-badge{
      display:inline-flex;
      align-items:center;
      gap:8px;
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,.14);
      background: rgba(0,0,0,.16);
      color: rgba(234,240,255,.92);
      font-weight: 900;
      font-size: 12px;
      letter-spacing: .15px;
      margin-bottom: 10px;
      width: fit-content;
    }
    #vivarioProEntry .pro-badge .dot{
      width: 9px; height: 9px;
      border-radius: 999px;
      background: rgba(120,160,255,.95);
      box-shadow: 0 0 0 4px rgba(120,160,255,.14);
    }
    #vivarioProEntry .pro-grid{
      display:grid;
      grid-template-columns: 1fr;
      gap: 10px;
      margin-top: 10px;
    }
    @media(min-width:720px){
      #vivarioProEntry .pro-grid{ grid-template-columns: repeat(3, 1fr); }
    }
    #vivarioProEntry .pro-mini{
      padding: 12px;
      border-radius: 16px;
      background: rgba(255,255,255,.04);
      border: 1px solid rgba(255,255,255,.10);
      line-height: 1.45;
    }
    #vivarioProEntry .pro-mini strong{
      display:block;
      margin-bottom: 6px;
      font-size: 13px;
      letter-spacing: .15px;
      opacity: .92;
    }
    #vivarioProEntry .pro-mini span{
      color: rgba(234,240,255,.78);
      font-size: 13px;
    }
  `;
  document.head.appendChild(css);

  const targets = [...document.querySelectorAll(".card, .hero-card, header.top, .landing-card")];
  targets.forEach(el => el.classList.add("viv-reveal"));

  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add("is-in"); });
  }, { threshold: 0.08 });

  targets.forEach(el => io.observe(el));

  document.querySelectorAll(".hero-orb, .hero-glow, .orb").forEach(el => el.classList.add("viv-float"));
  document.querySelectorAll(".hero-card, .landing-card").forEach(el => el.classList.add("viv-shimmer"));

  /* =========================================================
     ✅ Vivario PRO entry (injecte un bouton sur accueil)
     - Ne modifie PAS accueil.html (injection DOM uniquement)
     - N’impacte PAS les autres pages
     ========================================================= */
  (() => {
    try {
      const path = (location.pathname || "").toLowerCase();

      // Accueil seulement (support aussi si URL finit par /accueil.html)
      if (!path.endsWith("accueil.html")) return;

      // évite doublon
      if (document.getElementById("vivarioProEntry")) return;

      const wrap = document.querySelector(".wrap");
      if (!wrap) return;

      const card = document.createElement("section");
      card.className = "card";
      card.id = "vivarioProEntry";

      card.innerHTML = `
        <div class="pro-badge"><span class="dot"></span> Vivario PRO</div>
        <h3 style="margin:0 0 6px;">Diagnostic + modules + plan personnalisé</h3>
        <p class="muted" style="margin:0; line-height:1.55;">
          Questionnaire PRO adaptatif multi-thèmes → analyse + recommandations guidées (respiration, cohérence cardiaque, sport, yoga, routines).
        </p>

        <div class="pro-grid" aria-label="Aperçu PRO">
          <div class="pro-mini">
            <strong>🎯 Diagnostic</strong>
            <span>Lecture structurée de tes thèmes + intensité + priorités.</span>
          </div>
          <div class="pro-mini">
            <strong>🧩 Modules</strong>
            <span>Exercices guidés adaptés : stress, sommeil, addictions, relation, etc.</span>
          </div>
          <div class="pro-mini">
            <strong>📅 Plan & suivi</strong>
            <span>Plan simple et tenable + historique + progression.</span>
          </div>
        </div>

        <div class="actions" style="margin-top:14px;">
          <a class="btn primary" href="questionnaire_pro.html?v=18">🚀 Accéder à Vivario PRO</a>
          <a class="btn ghost" href="resultat_pro.html?v=18">📍 Voir mon dernier résultat PRO</a>
        </div>
      `;

      // Placement : juste après le header (top) si possible, sinon début du wrap
      const topHeader = wrap.querySelector("header.top");
      if (topHeader && topHeader.nextSibling) {
        topHeader.parentNode.insertBefore(card, topHeader.nextSibling);
      } else {
        wrap.insertBefore(card, wrap.firstChild);
      }

      // animation reveal + observer (réutilise le même IO)
      card.classList.add("viv-reveal");
      io.observe(card);

    } catch {}
  })();
})();