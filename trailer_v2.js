(() => {
  const acts = [...document.querySelectorAll(".act")];
  const bar = document.getElementById("bar");
  const skip = document.getElementById("skip");
  const audio = document.getElementById("amb");

  const DURATIONS = [
    3000, // studio
    3500,
    3000,
    3000,
    3000,
    4000,
    4000
  ];

  const TOTAL = DURATIONS.reduce((a,b)=>a+b,0);
  let time = 0;
  let idx = 0;

  function show(i){
    acts.forEach(a=>a.classList.remove("active"));
    acts[i]?.classList.add("active");
  }

  function next(){
    time += DURATIONS[idx];
    idx++;
    if(idx < acts.length){
      show(idx);
      setTimeout(next, DURATIONS[idx]);
    } else {
      location.replace("index_main.html?v=18");
    }
  }

  let elapsed = 0;
  const start = performance.now();

  function progress(){
    elapsed = performance.now() - start;
    bar.style.width = Math.min(100, elapsed / TOTAL * 100) + "%";
    requestAnimationFrame(progress);
  }

  show(0);
  setTimeout(next, DURATIONS[0]);
  progress();

  skip.onclick = () => location.replace("index_main.html?v=18");

  // audio unlock
  window.addEventListener("pointerdown", () => {
    audio.volume = 0.8;
    audio.play().catch(()=>{});
  }, { once:true });
})();