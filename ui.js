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
})();