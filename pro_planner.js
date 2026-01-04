/* pro_planner.js — Vivario PRO planner v1.0 (anti-répétition) */
(() => {
  function hashString(str){
    str = String(str || "");
    let h = 2166136261;
    for (let i=0;i<str.length;i++){
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0);
  }

  function mulberry32(seed){
    return function(){
      let t = (seed += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normalizeSig(s){
    return String(s || "")
      .toLowerCase()
      .replace(/[’]/g, "'")
      .replace(/[.,!?…:;()"]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function pickWeighted(rng, items){
    if (!items || !items.length) return null;
    // poids = minutes (plus court => plus fréquent) + bonus low
    const scored = items.map(m => {
      const base = 1;
      const byLevel = (m.level === "low") ? 1.25 : (m.level === "mid") ? 1.0 : 0.85;
      const byTime = Math.max(0.55, Math.min(1.35, 8 / Math.max(1, Number(m.minutes || 4))));
      return { m, w: base * byLevel * byTime };
    });
    const total = scored.reduce((a,x)=>a+x.w, 0);
    let r = rng() * total;
    for (const x of scored){
      r -= x.w;
      if (r <= 0) return x.m;
    }
    return scored[scored.length - 1].m;
  }

  function filterModulesForProfile(mods, profile){
    const themes = new Set();
    // profil gratuit : themes = travail/finances/couple... => on map vers thème pro quand possible
    (profile?.themes || []).forEach(t => themes.add(String(t)));
    // fallback: tag theme:xxx
    (profile?.tags || []).forEach(tag => {
      const m = String(tag).match(/^theme:(.+)$/i);
      if (m) themes.add(m[1]);
    });

    // mapping gratuit -> pro
    const map = {
      travail: "travail",
      finances: "finances",
      couple: "couple",
      famille: "famille",
      enfants: "enfants",
      sante: "sante",
      addiction: "addiction",
      multiple: "multiple",
      evenement: "evenement"
    };

    const proThemes = new Set();
    themes.forEach(t => {
      const k = map[t] || t;
      proThemes.add(k);
      // ajouts intelligents
      if (k === "travail" || k === "finances") proThemes.add("stress");
      if (k === "sante") proThemes.add("anxiete");
      if (k === "multiple") proThemes.add("stress");
    });

    const list = (mods || []).filter(m => {
      const mt = Array.isArray(m.themes) ? m.themes : [];
      return mt.some(x => proThemes.has(String(x)));
    });

    // si trop peu, on garde une base universelle
    if (list.length < 6) {
      const fallback = (mods || []).filter(m => (m.tags || []).includes("respiration") || (m.tags || []).includes("micro"));
      return fallback.length ? fallback : (mods || []);
    }
    return list;
  }

  function buildPlan(profile, modules, opts){
    const options = opts || {};
    const userId = profile?.userId || profile?.id || "u_pro";
    const today = (options.startDate || new Date().toISOString().slice(0,10));
    const seedBase = hashString(JSON.stringify(profile || {}));
    const seed = hashString(`${seedBase}|${userId}|${today}|${options.salt || "v1"}`);
    const rng = mulberry32(seed);

    const pool = filterModulesForProfile(modules || [], profile || {});
    const used = new Set(options.usedModuleIds || []);

    const slots = ["Matin", "Midi", "Soir"];
    const days = [];

    for (let d = 0; d < 7; d++){
      const daySeed = hashString(seed + "|" + d);
      const r = mulberry32(daySeed);

      const day = {
        dayIndex: d,
        date: (() => {
          const dt = new Date(today + "T00:00:00");
          dt.setDate(dt.getDate() + d);
          return dt.toISOString().slice(0,10);
        })(),
        slots: []
      };

      // 1 module principal + 1 micro + 1 stabilisateur (souvent respiration / corps)
      const pickUnique = (predicate) => {
        const candidates = pool.filter(m => !used.has(m.id) && (!predicate || predicate(m)));
        if (!candidates.length) return null;
        const m = pickWeighted(r, candidates);
        if (!m) return null;
        used.add(m.id);
        return m;
      };

      const stabilizer = pickUnique(m => (m.tags || []).includes("respiration") || (m.tags || []).includes("corps"));
      const micro = pickUnique(m => (m.tags || []).includes("micro") || Number(m.minutes||0) <= 3);
      const main = pickUnique(m => Number(m.minutes||0) >= 4);

      const picks = [
        stabilizer || micro || main,
        main || stabilizer || micro,
        micro || stabilizer || main
      ].filter(Boolean);

      for (let i=0;i<3;i++){
        const m = picks[i] || pickUnique();
        if (!m) continue;
        day.slots.push({
          label: slots[i],
          moduleId: m.id,
          title: m.title,
          minutes: m.minutes,
          goal: m.goal,
          instructions: m.instructions
        });
      }

      // si jamais un slot manque, on comble avec le plus court dispo
      while (day.slots.length < 3){
        const candidates = pool.filter(m => !used.has(m.id)).sort((a,b)=>(a.minutes||999)-(b.minutes||999));
        const m = candidates[0] || pool[0];
        if (!m) break;
        used.add(m.id);
        day.slots.push({
          label: slots[day.slots.length],
          moduleId: m.id,
          title: m.title,
          minutes: m.minutes,
          goal: m.goal,
          instructions: m.instructions
        });
      }

      // signature anti répétitions (texte)
      day.signature = normalizeSig(day.slots.map(x => x.moduleId).join("|"));
      days.push(day);
    }

    return { startDate: today, generatedAt: new Date().toISOString(), usedModuleIds: Array.from(used), days };
  }

  window.VivarioPROPlanner = {
    buildPlan
  };
})();