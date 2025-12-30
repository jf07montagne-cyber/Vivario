// accueil.js — micro amélioration texte + animation (v1)
(() => {
  const css = document.createElement("style");
  css.textContent = `
    .viv-title-glow{ text-shadow: 0 10px 30px rgba(0,0,0,.35); }
    .viv-sub{ opacity:.9; line-height:1.45; }
  `;
  document.head.appendChild(css);

  const h = document.querySelector("h1, .brand");
  if (h) h.classList.add("viv-title-glow");

  const p = document.querySelector(".muted, .subtitle, p");
  if (p && !p.dataset.viv) {
    p.dataset.viv = "1";
    p.classList.add("viv-sub");
    // texte plus “présent”
    const txt = p.textContent || "";
    if (txt.length < 70) {
      p.textContent = "Quand une décision pèse, prendre 60 secondes peut changer la suite. Rien n’est envoyé : tout reste sur ton appareil.";
    }
  }
})();