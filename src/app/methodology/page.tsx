import { rulesetById } from "@/reference/segmentation";
import { CORP_STD_V1 } from "@/models";
import { requireSession } from "@/lib/session";

export default async function MethodologyPage() {
  // Toute page porteuse de données exige une session authentifiée.
  await requireSession();

  const m = CORP_STD_V1;
  const ruleset = rulesetById(m.segmentationRulesetId);
  return (
    <div style={{ display: "grid", gap: 18, maxWidth: 900 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Méthodologie</h1>
        <p className="muted">
          Principes de construction du modèle et séparation stricte des finalités.
        </p>
      </div>

      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 8 }}>Cinq sorties séparées</h2>
        <p style={{ fontSize: 13, marginBottom: 10 }}>
          Une garantie ne transforme jamais un mauvais emprunteur en bon emprunteur :
          elle réduit la perte en cas de défaut ou sécurise la décision. Chaque sortie
          conserve son modèle, sa version, sa date d&apos;effet et sa piste d&apos;audit.
        </p>
        <table className="data">
          <thead>
            <tr>
              <th>Sortie</th>
              <th>Objet</th>
              <th>Effet des garanties</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Note emprunteur / PD (moteur A — implémenté)</td>
              <td>Risque intrinsèque de défaut de la contrepartie</td>
              <td>Aucun effet direct sur la PD, sauf support de tiers démontré</td>
            </tr>
            <tr>
              <td>Décision de crédit (moteur B)</td>
              <td>Acceptation, conditions, délégation, limites</td>
              <td>Oui, selon la politique de crédit</td>
            </tr>
            <tr>
              <td>Classification BAM (moteur C)</td>
              <td>Classe réglementaire et provision</td>
              <td>Oui, selon éligibilité et régime applicable</td>
            </tr>
            <tr>
              <td>IFRS 9 (moteur D)</td>
              <td>Stage et pertes attendues</td>
              <td>Oui, via LGD, recouvrements et EAD</td>
            </tr>
            <tr>
              <td>RWA / CRM (moteur E)</td>
              <td>Exposition pondérée</td>
              <td>Oui, selon reconnaissance prudentielle</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 8 }}>Ordre de calcul du moteur</h2>
        <ol style={{ paddingLeft: 20, fontSize: 13, display: "grid", gap: 3 }}>
          <li>Routage du modèle (standard, TPE comportemental, modèle dédié)</li>
          <li>Segmentation TPE / PME / GE</li>
          <li>Contrôles de complétude et de validité</li>
          <li>Calcul des indicateurs</li>
          <li>Détermination des bandes et scores élémentaires (0/25/50/75/100)</li>
          <li>Agrégation par domaine</li>
          <li>Agrégation globale pondérée</li>
          <li>Application des caps de qualité et de structure</li>
          <li>Détection des red flags et routage</li>
          <li>Grade moteur</li>
          <li>Override éventuel sous maker-checker</li>
          <li>Enregistrement du snapshot, des explications et des versions</li>
        </ol>
      </section>

      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 8 }}>Formules d&apos;agrégation</h2>
        <pre
          style={{
            background: "var(--brand-soft)",
            padding: 12,
            borderRadius: 6,
            fontSize: 12,
            overflowX: "auto",
          }}
        >
{`Score_domaine = Σ(Score_critère × Poids_critère) / Σ(Poids applicables)
Score_brut    = Σ(Score_domaine × Poids_domaine) / Σ(Poids domaines applicables)
Confiance     = ${m.confidence.weights.completeness}% Complétude + ${m.confidence.weights.freshness}% Fraîcheur + ${m.confidence.weights.reliability}% Fiabilité + ${m.confidence.weights.provenance}% Provenance`}
        </pre>
        <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
          <strong>Poids total constant.</strong> Une donnée <code>MISSING</code>,{" "}
          <code>INVALID</code> ou <code>STALE</code> n&apos;est jamais retirée du
          dénominateur : elle reçoit soit un blocage, soit la catégorie « information
          absente » au score prudent déclaré par la grille. Un <code>NOT_APPLICABLE</code>{" "}
          n&apos;est admis que si le modèle l&apos;a prévu et nomme le critère qui reçoit
          le poids. Deux dossiers restent ainsi comparables, et l&apos;absence d&apos;une
          information défavorable ne peut plus améliorer un score.
        </p>
        <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
          <strong>La confiance ne plafonne plus le grade.</strong> Elle est restituée
          comme une classe (A, B, C, U) à côté du grade. Sous la classe minimale ou sous
          le seuil de couverture observée, aucun grade n&apos;est produit : un dossier
          insuffisamment documenté est un dossier non notable, pas un dossier moyen.
        </p>
      </section>

      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 8 }}>Statut de calibration</h2>
        <p style={{ fontSize: 13 }}>
          Le modèle est un <strong>champion expert initial</strong> destiné au démarrage,
          à la collecte structurée et au classement ordinal. Il ne prétend pas prédire
          une probabilité de défaut. Une calibration établie sur données simulées porte
          le statut <code>CALIBRATED_SYNTHETIC</code> et{" "}
          <strong>aucune probabilité n&apos;est exposée hors environnement bac à sable</strong> :
          en production, <code>pd_value</code> est nul et la finalité déclarée du
          résultat est <code>PILOT_SHADOW</code>. Chaque résultat porte ses usages
          autorisés et ses restrictions, pour qu&apos;aucun système aval n&apos;ait à les
          deviner.
        </p>
      </section>

      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 8 }}>Segmentation appliquée</h2>
        <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
          Jeu de règles <code>{ruleset.rulesetId}</code>, en vigueur depuis le{" "}
          {ruleset.effectiveFrom}. Le segment détermine à la fois les pondérations et les
          barèmes : il ne peut donc pas être choisi par l&apos;appelant sans être
          confronté au calcul.
        </p>
        <table className="data">
          <thead>
            <tr>
              <th>Segment</th>
              <th>Règle effective-datée</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>GE</td>
              <td>CA HT entreprise/groupe &gt; {(ruleset.geTurnoverThreshold / 1e6).toLocaleString("fr-FR")} MMAD</td>
            </tr>
            <tr>
              <td>PME</td>
              <td>
                CA HT &gt; {(ruleset.smeTurnoverThreshold / 1e6).toLocaleString("fr-FR")} et ≤{" "}
                {(ruleset.geTurnoverThreshold / 1e6).toLocaleString("fr-FR")} MMAD ; ou CA ≤{" "}
                {(ruleset.smeTurnoverThreshold / 1e6).toLocaleString("fr-FR")} MMAD avec exposition globale &gt;{" "}
                {(ruleset.smeExposureThreshold / 1e6).toLocaleString("fr-FR")} MMAD
              </td>
            </tr>
            <tr>
              <td>TPE</td>
              <td>
                CA HT ≤ {(ruleset.smeTurnoverThreshold / 1e6).toLocaleString("fr-FR")} MMAD et exposition globale ≤{" "}
                {(ruleset.smeExposureThreshold / 1e6).toLocaleString("fr-FR")} MMAD
              </td>
            </tr>
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Statut de la source : {ruleset.sourceStatus}. {ruleset.sourceFr}
        </p>
      </section>

      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 8 }}>Cinq finalités, cinq statuts</h2>
        <p style={{ fontSize: 13 }}>
          Cet outil implémente <strong>un seul</strong> des cinq moteurs : la notation du
          risque intrinsèque. Chaque résultat porte cinq statuts distincts —{" "}
          <code>ratingStatus</code>, <code>complianceStatus</code>,{" "}
          <code>decisionStatus</code>, <code>regulatoryClassStatus</code> et{" "}
          <code>ifrs9Status</code>. Les quatre derniers restent{" "}
          <code>NOT_EVALUATED</code> : c&apos;est une information, pas un oubli. Aucune
          décision de crédit, classe Bank Al-Maghrib ou stage IFRS 9 ne peut être déduite
          d&apos;un grade.
        </p>
      </section>

    </div>
  );
}
