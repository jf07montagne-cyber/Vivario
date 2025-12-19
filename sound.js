// sound.js — Vivario (audio ambiance ON/OFF + mobile safe)
(() => {
  const KEY = "vivario_sound_on";
  const audio = document.getElementById("bgAudio");
  const btn = document.getElementById("soundToggle");

  if (!audio || !btn) return;

  // état par défaut = ON
  const saved = localStorage.getItem(KEY);
  let isOn = saved === null ? true : saved === "1";

  function setBtn() {
    btn.textContent = isOn ? "🔊 Son : ON" : "🔇 Son : OFF";
  }

  function tryPlay() {
    if (!isOn) return;
    // volume doux
    audio.volume = 0.25;
    const p = audio.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  }

  function stop() {
    audio.pause();
    // remet au début pour éviter “reprise” au milieu
    try { audio.currentTime = 0; } catch (e) {}
  }

  function apply() {
    setBtn();
    if (isOn) tryPlay();
    else stop();
  }

  // toggle
  btn.addEventListener("click", () => {
    isOn = !isOn;
    localStorage.setItem(KEY, isOn ? "1" : "0");
    apply();
  });

  // Mobile: autorise démarrage après 1 interaction user
  const unlock = () => {
    document.removeEventListener("touchstart", unlock);
    document.removeEventListener("click", unlock);
    tryPlay();
  };
  document.addEventListener("touchstart", unlock, { once: true, passive: true });
  document.addEventListener("click", unlock, { once: true });

  // applique au chargement
  apply();
})();