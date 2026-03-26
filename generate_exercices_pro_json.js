// generate_exercices_pro_json.js
// Génère exercices_pro.json (500 exercices) — Vivario PRO B2
// Usage: node generate_exercices_pro_json.js

const fs = require("fs");

function nowISO(){ return new Date().toISOString(); }
function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function uniq(arr){ return Array.from(new Set(arr)); }
function slug(s){
  return String(s||"")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9]+/g,"_")
    .replace(/^_+|_+$/g,"")
    .slice(0, 60);
}

const DOMAINS = [
  "stress","anxiete","panique","sommeil","surcharge_mentale","rumination",
  "humeur","fatigue","burnout","concentration","motivation","confiance",
  "colere","douleur","douleur_dos","douleur_nuque","corps_mouvement",
  "addictions_compulsions","dependance_ecran","organisation","perfectionnisme",
  "estime_de_soi","relations","couple","famille","travail","finances",
  "emotions_intenses","limites","decisions","pensées_intrusives"
];

const MODALITIES = [
  "respiration","ancrage","mental","yoga","mobilite","cardio","relaxation","ecriture","posture"
];

const LEVELS = ["debutant","intermediaire","avance"];

const DOMAIN_TO_TAGS = {
  stress: ["calme","regulation","detente","tension"],
  anxiete: ["urgence_douce","anti-panique","present","calme"],
  panique: ["urgence_douce","anti-panique","present","regulation"],
  sommeil: ["soiree","detente","lenteur","relaxation"],
  surcharge_mentale: ["clarte","anti-rumination","focus","present"],
  rumination: ["anti-rumination","clarte","ecriture","present"],
  humeur: ["energie","routine","boost","mouvement"],
  fatigue: ["doux","reprise","mobilite","respiration"],
  burnout: ["doux","reprise","limites","micro"],
  concentration: ["focus","performance","present"],
  motivation: ["boost","energie","routine"],
  confiance: ["ancrage","posture","petit_pas"],
  colere: ["decharge","respiration","mouvement","pause"],
  douleur: ["mobilite","tension","douceur"],
  douleur_dos: ["dos","mobilite","douceur"],
  douleur_nuque: ["nuque","tension","mobilite"],
  corps_mouvement: ["mouvement","routine","mobilite"],
  addictions_compulsions: ["craving","pause","substitution","present"],
  dependance_ecran: ["pause","routine","focus","limites"],
  organisation: ["clarte","plan","micro","routine"],
  perfectionnisme: ["lacher_prise","micro","clarte","limites"],
  estime_de_soi: ["bienveillance","posture","petit_pas","ecriture"],
  relations: ["communication","limites","calme","clarte"],
  couple: ["communication","limites","emotions","clarte"],
  famille: ["calme","limites","organisation","routine"],
  travail: ["focus","tension","pause","clarte"],
  finances: ["clarte","plan","stress","limites"],
  emotions_intenses: ["urgence_douce","regulation","present","decharge"],
  limites: ["limites","non","priorites","clarte"],
  decisions: ["clarte","priorites","plan","micro"],
  pensées_intrusives: ["present","label","anti-rumination","calme"]
};

const MODALITY_TEMPLATES = {
  respiration: [
    { base:"Respiration 4–6", idea:"apaisement", steps:["Inspire 4s","Expire 6s","Relâche épaules"] },
    { base:"Soupir physiologique", idea:"anti-stress express", steps:["Double inspiration (petite + petite)","Expiration longue","Répéter"] },
    { base:"Respiration carrée", idea:"focus", steps:["Inspire","Pause","Expire","Pause"] },
    { base:"Expiration longue", idea:"calme rapide", steps:["Inspire doux","Expire long","Relâche mâchoire"] }
  ],
  ancrage: [
    { base:"5–4–3–2–1", idea:"anti-panique", steps:["5 choses vues","4 sensations","3 sons","2 odeurs","1 goût"] },
    { base:"Pieds au sol", idea:"revenir au présent", steps:["Appuie 3s","Relâche 3s","Répéter"] },
    { base:"Nommer 3 objets", idea:"réorientation", steps:["Regarde 3 objets","Décris 1 détail","Respire"] },
    { base:"Main sur poitrine", idea:"sécurité", steps:["Main posée","Expire long","Phrase rassurante"] }
  ],
  mental: [
    { base:"Label + retour présent", idea:"stop rumination", steps:["Nommer le phénomène","3 expirations","Retour sensations"] },
    { base:"1 pas utile", idea:"clarifier", steps:["Choisir 1 priorité","Définir 1 micro-action","Écrire 1 phrase"] },
    { base:"Pause 90 sec", idea:"défusion", steps:["Observer la pensée","Laisser passer","Revenir au corps"] },
    { base:"Re-cadrage doux", idea:"bienveillance", steps:["Phrase amie","Option la plus simple","Respiration"] }
  ],
  yoga: [
    { base:"Posture de l’enfant", idea:"détente", steps:["Hanches vers talons","Front au sol/bras","Souffle lent"] },
    { base:"Chat / Vache", idea:"dos", steps:["Inspire (dos creux)","Expire (dos rond)","Rythme doux"] },
    { base:"Torsion assise", idea:"déverrouiller", steps:["Allonger colonne","Tourner doux","Respirer"] },
    { base:"Jambes au mur", idea:"récupération", steps:["Allonger","Jambes élevées","Souffle calme"] }
  ],
  mobilite: [
    { base:"Nuque + épaules", idea:"anti-tension", steps:["Hausser/relâcher","Cercles épaules","Inclinaisons"] },
    { base:"Hanches", idea:"déverrouillage", steps:["Cercles lents","Ouverture douce","Respirer"] },
    { base:"Dos doux", idea:"reprise", steps:["Bascule bassin","Étirement léger","Retour neutre"] },
    { base:"Poignets/avant-bras", idea:"écran", steps:["Flex/ext","Cercles","Relâche"] }
  ],
  cardio: [
    { base:"Marche sur place", idea:"boost", steps:["30s marche","30s calme","Répéter"] },
    { base:"Montées de genoux soft", idea:"énergie", steps:["20s effort léger","40s calme","Répéter"] },
    { base:"Escaliers doux", idea:"activation", steps:["Monter tranquille","Descendre lent","Respiration"] },
    { base:"Mini circuit", idea:"motivation", steps:["Squat assisté","Marche","Respirer"] }
  ],
  relaxation: [
    { base:"Scan corporel", idea:"relaxation", steps:["Tête","Épaules","Ventre","Jambes"] },
    { base:"Relax mâchoire", idea:"tension", steps:["Dents décollées","Langue posée","Expire long"] },
    { base:"Progressif", idea:"relâchement", steps:["Contracter 3s","Relâcher 6s","Zone suivante"] },
    { base:"Visualisation", idea:"calme", steps:["Lieu sûr","Détails","Respiration"] }
  ],
  ecriture: [
    { base:"Worry dump", idea:"décharge", steps:["Écrire brut","Trier","1 pas faisable"] },
    { base:"Journal 3 lignes", idea:"clarte", steps:["Ce que je ressens","Ce dont j’ai besoin","1 action"] },
    { base:"Lettre bienveillante", idea:"estime", steps:["Parler comme à un ami","Nommer effort","Encourager"] },
    { base:"Liste limites", idea:"protections", steps:["Ce que j’accepte","Ce que je refuse","1 limite aujourd’hui"] }
  ],
  posture: [
    { base:"Posture ouverte", idea:"confiance", steps:["Pieds stables","Épaules ouvertes","Regard droit"] },
    { base:"Ancrage colonne", idea:"présence", steps:["Allonger colonne","Bassin neutre","Souffle"] },
    { base:"Mur (dos)", idea:"alignement", steps:["Dos contre mur","Nuque longue","Respirer"] },
    { base:"Reset bureau", idea:"tension", steps:["Se lever","Ouvrir poitrine","Relâcher nuque"] }
  ]
};

const VARIANTS = {
  libre:   { duration_sec: null, label: "Libre (sans timer)", mult: 1 },
  micro:   { duration_sec: 75,   label: "Micro",             mult: 1 },
  court:   { duration_sec: 180,  label: "Court",             mult: 2 },
  moyen:   { duration_sec: 360,  label: "Moyen",             mult: 3 },
  long:    { duration_sec: 600,  label: "Long",              mult: 4 },
  ultra:   { duration_sec: 900,  label: "Ultra-long",        mult: 5 }
};

function stepsForVariant(baseSteps, v){
  if (v === "libre"){
    return [
      "Fais l’exercice à ton rythme, sans timer.",
      ...baseSteps,
      "Arrête dès que c’est suffisant pour toi."
    ];
  }
  const mult = VARIANTS[v].mult;
  const reps = clamp(mult, 1, 6);
  const out = [];
  out.push(...baseSteps);
  out.push(`Répéter tranquillement (${reps} fois au total, sans forcer).`);
  out.push("Terminer par 2 expirations longues.");
  return out;
}

function ttsFor(modality, title, v){
  const commonEnd = v === "libre"
    ? "Tu peux arrêter quand tu sens que c’est bon."
    : `On tient encore un peu. Puis ce sera terminé.`;

  const intro = {
    respiration: "On se cale. Épaules relâchées. Respire sans forcer.",
    ancrage: "Reviens au présent. Sens tes appuis et regarde autour de toi.",
    mental: "On simplifie. On choisit le minimum utile.",
    yoga: "Bouge doucement. Pas de douleur. Respiration calme.",
    mobilite: "Amplitude douce. Pas de geste brusque.",
    cardio: "Intensité légère à modérée. Respire naturellement.",
    relaxation: "Laisse le corps se poser. Reviens au souffle si pensées.",
    ecriture: "Écris simple, brut, sans te juger.",
    posture: "Place-toi solide. Colonne longue, respiration calme."
  }[modality] || "On y va doucement.";

  const mid = {
    libre: "Suis les étapes. Si ça tire, réduis l’amplitude.",
    micro: "On fait court. Juste le nécessaire.",
    court: "On stabilise. Régulier et doux.",
    moyen: "On approfondit un peu. Garde une intensité tenable.",
    long: "On consolide. Laisse la respiration guider.",
    ultra: "On prend le temps. Ralentis si besoin."
  }[v] || "Reste simple.";

  return [
    `${title}.`,
    intro,
    mid,
    commonEnd
  ];
}

function chooseDomains(){
  // 1 à 3 domaines
  const d1 = pick(DOMAINS);
  const d2 = Math.random() < 0.55 ? pick(DOMAINS) : null;
  const d3 = Math.random() < 0.25 ? pick(DOMAINS) : null;
  return uniq([d1, d2, d3].filter(Boolean)).slice(0,3);
}

function buildTags(domains, modality){
  const tags = [];
  domains.forEach(d => (DOMAIN_TO_TAGS[d] || []).forEach(t => tags.push(t)));
  tags.push(modality);
  if (domains.includes("sommeil")) tags.push("soiree");
  if (domains.includes("douleur") || domains.includes("douleur_dos") || domains.includes("douleur_nuque")) tags.push("douceur");
  if (domains.includes("panique") || domains.includes("anxiete")) tags.push("urgence_douce");
  return uniq(tags).slice(0, 10);
}

function contraindicationsFor(modality, domains){
  const out = [];
  if (modality === "cardio") out.push("Adapter l’intensité si douleur, essoufflement anormal ou malaise.");
  if (modality === "yoga" || modality === "mobilite") out.push("Douleur aiguë: réduire amplitude, rester dans le confortable.");
  if (modality === "respiration") out.push("Si vertiges: respirer plus naturellement, réduire l’amplitude.");
  if (domains.includes("panique")) out.push("Si l’exercice augmente l’angoisse: basculer sur ancrage pieds au sol.");
  return uniq(out).slice(0,4);
}

function equipmentFor(modality){
  if (modality === "yoga" || modality === "relaxation" || modality === "mobilite") return ["tapis (optionnel)", "coussin (optionnel)"];
  if (modality === "ecriture") return ["notes (papier/téléphone)"];
  return [];
}

function mediaFor(id, modality){
  // placeholders : tu pourras mettre tes vrais fichiers plus tard
  return {
    preview_mp4: `media/exercices/${modality}/${id}_preview.mp4`,
    poster: `media/exercices/${modality}/${id}_poster.jpg`
  };
}

function buildExercise(i){
  const modality = pick(MODALITIES);
  const tpl = pick(MODALITY_TEMPLATES[modality]);
  const domains = chooseDomains();

  const baseTitle = `${tpl.base} — ${tpl.idea}`;
  const title = `${baseTitle} (${modality})`;
  const id = `${modality}_${slug(tpl.base)}_${String(i+1).padStart(3,"0")}`;

  const level = (i % 10 < 6) ? "debutant" : (i % 10 < 9) ? "intermediaire" : "avance";
  const tags = buildTags(domains, modality);

  const variants = {};
  Object.keys(VARIANTS).forEach(v => {
    variants[v] = {
      duration_sec: VARIANTS[v].duration_sec,
      no_timer: v === "libre",
      steps: stepsForVariant(tpl.steps, v)
    };
  });

  const tts = { lang: "fr-FR", scripts: {} };
  Object.keys(VARIANTS).forEach(v => {
    tts.scripts[v] = ttsFor(modality, baseTitle, v);
  });

  return {
    id,
    title,
    modality,
    level,
    domains,
    tags,
    contraindications: contraindicationsFor(modality, domains),
    equipment: equipmentFor(modality),
    media: mediaFor(id, modality),
    tts,
    variants
  };
}

function main(){
  const exercises = [];
  const N = 500;

  for (let i=0; i<N; i++){
    exercises.push(buildExercise(i));
  }

  const json = {
    meta: {
      version: "2.0-B2",
      title: "Vivario PRO — Catalogue Exercices (500) + Variantes B2",
      updated_at: nowISO(),
      media_root: "media/exercices/",
      notes: "500 exercices. Variantes: libre/micro/court/moyen/long/ultra. Tout local. Media placeholders."
    },
    taxonomies: {
      domains: DOMAINS,
      levels: LEVELS,
      modalities: MODALITIES
    },
    variants_policy: {
      names: ["libre","micro","court","moyen","long","ultra"],
      durations_hint_sec: {
        libre: "au ressenti",
        micro: "45–90",
        court: "90–240",
        moyen: "240–480",
        long: "480–900",
        ultra: "900–1200"
      }
    },
    recommendation_rules: {
      domain_to_tags: DOMAIN_TO_TAGS,
      fallback_order: ["respiration","ancrage","mobilite","relaxation","yoga","mental","cardio","ecriture","posture"]
    },
    exercises
  };

  fs.writeFileSync("exercices_pro.json", JSON.stringify(json, null, 2), "utf-8");
  console.log(`✅ OK: exercices_pro.json généré (${N} exercices)`);
}

main();0

