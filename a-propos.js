// a-propos.js — améliore le texte sans casser (v1)
(() => {
  const block = document.querySelector(".card p, .card .muted, .card");
  if (!block) return;

  const p = block.tagName.toLowerCase() === "p" ? block : block.querySelector("p");
  if (!p) return;

  // remplace seulement si ça ressemble à l'ancien texte
  const t = (p.textContent || "").toLowerCase();
  if (!t.includes("vivario est né") && t.length > 20) return;

  p.innerHTML = `
    Vivario est un outil de pause : quand plusieurs choses se croisent (fatigue, finances, couple, enfants, santé),
    on perd vite en clarté <b>avant même</b> de décider.<br><br>
    Ici, tu réponds à quelques questions simples. Ensuite, Vivario génère des scénarios courts mais <b>personnalisés</b>
    (un pas concret, apaisement, normalisation…).<br><br>
    <b>Tout reste sur ton téléphone.</b> Rien n’est envoyé, rien n’est partagé.
    `;
})();