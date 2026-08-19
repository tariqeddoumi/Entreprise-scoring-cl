import { CORP_STD_V1 } from "@/models";

export default function MethodologyPage() {
  const m = CORP_STD_V1;
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
Confiance     = ${m.confidenceWeights.completeness}% Complétude + ${m.confidenceWeights.freshness}% Fraîcheur + ${m.confidenceWeights.reliability}% Fiabilité + ${m.confidenceWeights.provenance}% Provenance`}
        </pre>
        <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
          La redistribution de poids n&apos;est autorisée que pour un{" "}
          <code>NOT_APPLICABLE</code> avéré, à l&apos;intérieur du même domaine. Une donnée{" "}
          <code>MISSING</code>, <code>INVALID</code> ou <code>STALE</code> n&apos;est jamais
          redistribuée silencieusement : elle déclenche la politique de qualité, un cap
          ou un blocage. Une valeur manquante n&apos;est jamais transformée en zéro ni en
          score neutre.
        </p>
      </section>

      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 8 }}>Statut de calibration</h2>
        <p style={{ fontSize: 13 }}>
          Le modèle est un <strong>champion expert initial</strong> destiné au démarrage,
          à la collecte structurée et au classement ordinal. Il ne prétend pas prédire
          une probabilité de défaut : <code>pd_status = {m.pdStatus}</code>. Aucune PD
          synthétique n&apos;est exposée, et l&apos;usage de ce score pour IFRS 9, la
          tarification ou le capital réglementaire est bloqué tant que la calibration
          empirique et la validation indépendante ne sont pas réalisées.
        </p>
      </section>

      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 8 }}>Segmentation appliquée</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Segment</th>
              <th>Règle seed (paramétrable, effective-datée)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>GE</td>
              <td>CA HT entreprise/groupe &gt; {(m.segmentation.geTurnoverThreshold / 1e6).toLocaleString("fr-FR")} MMAD</td>
            </tr>
            <tr>
              <td>PME</td>
              <td>
                CA HT &gt; {(m.segmentation.smeTurnoverThreshold / 1e6).toLocaleString("fr-FR")} et ≤{" "}
                {(m.segmentation.geTurnoverThreshold / 1e6).toLocaleString("fr-FR")} MMAD ; ou CA ≤{" "}
                {(m.segmentation.smeTurnoverThreshold / 1e6).toLocaleString("fr-FR")} MMAD avec exposition globale &gt;{" "}
                {(m.segmentation.smeExposureThreshold / 1e6).toLocaleString("fr-FR")} MMAD
              </td>
            </tr>
            <tr>
              <td>TPE</td>
              <td>
                CA HT ≤ {(m.segmentation.smeTurnoverThreshold / 1e6).toLocaleString("fr-FR")} MMAD et exposition globale ≤{" "}
                {(m.segmentation.smeExposureThreshold / 1e6).toLocaleString("fr-FR")} MMAD
              </td>
            </tr>
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Statut : {m.segmentation.status}. {m.segmentation.sourceFr}
        </p>
      </section>
    </div>
  );
}
