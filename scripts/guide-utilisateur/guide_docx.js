const fs = require("fs");
const { d, t, p, body, bullets, numbered, h1, h2, box, table, figure, cover, document, toc, ORANGE, BRUN, Paragraph } = require("./charte");
const C = JSON.parse(fs.readFileSync(`${__dirname}/contenu.json`, "utf8"));
let inst = 0, fig = 0;
const children = [
  ...cover({ titre: C.titre, sousTitre: C.sousTitre, date: C.date, mention: "Captures réalisées sur l'outil, avec des données fictives." }),
  ...toc([["Présentation", ["Les profils d'utilisateur", "Le circuit d'une notation"]], ...C.sections.map((sec, i) => [`${i + 1}. ${sec.titre}`, sec.etapes.map((e) => e.titre)]), ["Les règles à retenir"], ["Besoin d'aide ?"]]),
  h1("Présentation"),
  body("L'outil note les entreprises clientes (TPE, PME et grandes entreprises) selon une méthode unique et explicable. Le chargé d'affaires crée le client depuis T24, ouvre un dossier selon son motif et l'instruit, avec l'aide de l'intelligence artificielle si elle est activée ; l'outil calcule la note et applique les règles de Bank Al-Maghrib ; le directeur du centre donne son avis et la contre-étude décide. Seule une notation validée devient la note officielle de l'entreprise."),
  body("Chaque utilisateur est rattaché à une banque, une région ou un centre d'affaires du groupe : il ne voit que les dossiers de son périmètre (et, si le cloisonnement par portefeuille est activé, le chargé d'affaires ne voit que ses clients)."),
  new Paragraph({ heading: d.HeadingLevel.HEADING_2, children: [t("Les profils d'utilisateur")] }),
  table(["Profil", "Ce qu'il peut faire"], C.profils, [2600, 7038]),
  new Paragraph({ heading: d.HeadingLevel.HEADING_2, children: [t("Le circuit d'une notation")] }),
  table(["Étape", "Action", "Qui"], C.circuit, [900, 5738, 3000]),
  p(""),
  box("À retenir", ["Une notation ne devient la note de l'entreprise qu'au terme du circuit de validation, décidé par des personnes autres que ses contributeurs."]),
];
C.sections.forEach((sec, si) => {
  children.push(h1(`${si + 1}. ${sec.titre}`), body(sec.intro));
  sec.etapes.forEach((e) => {
    inst += 1; fig += 1;
    children.push(h2(e.titre));
    children.push(...figure(`${__dirname}/../../docs/expression-besoin/captures/${e.img}.jpg`, `Figure ${fig} — ${e.titre}`));
    children.push(...numbered(e.actions, inst));
    children.push(p("", { spacing: { after: 60 } }), box("À savoir", [e.aSavoir]), p("", { spacing: { after: 120 } }));
  });
});
children.push(h1("Les règles à retenir"), ...bullets(C.regles), p(""),
  h1("Besoin d'aide ?"),
  table(["Sujet", "Interlocuteur"], [["Accès, mot de passe, compte verrouillé", "L'administrateur de l'outil de votre entité"], ["Rattachement à une banque ou filiale, rôle", "L'administrateur de l'outil"], ["Méthode de notation, grille, dérogations", "La Fonction Risques"], ["Données T24, crédit bureau, InfoRisque (raccordements)", "La DSI et l'administrateur de l'outil"], ["Watch list, levée de critère, décisions de comité", "La surveillance des risques et la contre-étude"], ["Incident technique", "Le support informatique (DSI)"]], [4600, 5038]));
d.Packer.toBuffer(document({ titreCourt: "Guide utilisateur — Outil de notation des entreprises", children })).then((b) => { fs.writeFileSync(`${__dirname}/../../docs/guides/Guide_utilisateur_outil_notation.docx`, b); console.log("ok", fig, "figures"); });
