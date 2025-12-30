// index.js — animation légère CTA (v1)
(() => {
  const hero = document.querySelector(".hero, .card, main, body");
  if (!hero) return;

  document.documentElement.style.scrollBehavior = "smooth";

  // inject mini CSS safe
  const css = document.createElement("style");
  css.textContent = `
    .viv-fade-in{ opacity:0; transform: translateY(12px); animation: vivIn .65s ease forwards; }
    @keyframes vivIn{ to{ opacity:1; transform: translateY(0);} }
    .viv-pulse{ position:relative; }
    .viv-pulse::after{
      content:""; position:absolute; inset:-6px; border-radius:999px;
      border:1px solid rgba(255,255,255,.18);
      animation: vivPulse 1.8s ease-in-out infinite;
      pointer-events:none;
    }
    @keyframes vivPulse{ 0%{opacity:.15; transform:scale(.98);} 50%{opacity:.35; transform:scale(1.02);} 100%{opacity:.15; transform:scale(.98);} }
  `;
  document.head.appendChild(css);

  // fade elements
  const targets = [...document.querySelectorAll("h1,h2,p,.btn,.card,.hero-row")];
  targets.forEach((el, i) => {
    el.classList.add("viv-fade-in");
    el.style.animationDelay = `${Math.min(i * 70, 350)}ms`;
  });

  // pulse on main button
  const btn = document.querySelector("a.btn.primary, button.btn.primary, a[href*='accueil'], a[href*='question'], #btnStart, .start");
  if (btn) btn.classList.add("viv-pulse");
})();