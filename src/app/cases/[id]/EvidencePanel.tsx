import type { CaseEvidence } from "@/lib/case-evidence";
import type { Correction } from "@/reference/corrections";
import { BUREAU_LABELS, LINE_STATUS_LABELS, type CreditLine } from "@/reference/credit-report";
import { LEGAL_EVENT_LABELS } from "@/reference/legal-profile";
import type { FacilityTotals } from "@/reference/facilities";

/**
 * Éléments au jour de la décision : ce que le dossier a figé à la soumission.
 * Rendu serveur, lecture seule — la fiche client peut avoir évolué depuis.
 */

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const amount = (v: number | null | undefined) => (v === null || v === undefined ? "—" : nf.format(v));
const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "boolean" ? (v ? "oui" : "non") : typeof v === "number" ? nf.format(v) : String(v));
const levelColor = { INFO: "var(--muted, #666)", ATTENTION: "var(--warn)", ALERTE: "var(--bad)" } as Record<string, string>;

function Corrections({ items, pieceHref }: { items: Correction[]; pieceHref: (docId: string) => string | null }) {
  if (!items.length) return <p className="muted" style={{ fontSize: 12 }}>Aucune correction : rapport retenu tel que lu.</p>;
  return (
    <div className="table-scroll">
      <table className="data" style={{ minWidth: 700 }}>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Par</th>
            <th scope="col">Champ</th>
            <th scope="col">Lu ou avant</th>
            <th scope="col">Retenu</th>
            <th scope="col">Motif</th>
            <th scope="col">Justificatif</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => {
            const href = c.documentId ? pieceHref(c.documentId) : null;
            return (
              <tr key={c.id}>
                <td style={{ whiteSpace: "nowrap" }}>{c.at.slice(0, 10)}</td>
                <td>{c.by}</td>
                <td>{c.labelFr}</td>
                <td>{show(c.before)}</td>
                <td style={{ fontWeight: 600 }}>{show(c.after)}</td>
                <td>{c.motif}</td>
                <td>{href ? <a href={href}>{c.documentName ?? "pièce"}</a> : c.documentName ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Findings({ items }: { items: Array<{ level: string; textFr: string }> }) {
  const shown = items.filter((f) => f.textFr);
  if (!shown.length) return null;
  return (
    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
      {shown.map((f, i) => (
        <li key={i} style={{ color: levelColor[f.level] }}>
          {f.textFr}
        </li>
      ))}
    </ul>
  );
}

export function EvidencePanel({ caseId, evidence }: { caseId: string; evidence: CaseEvidence }) {
  const pieceByCpDoc = (cpDocId: string) => {
    const p = evidence.pieces.find((x) => x.sourceId === cpDocId);
    return p ? `/cases/${caseId}/pieces/${p.caseDocumentId}` : null;
  };
  const reportPiece = evidence.pieces.find((p) => p.origin === "RAPPORT_SOLVABILITE");
  const legalPiece = evidence.pieces.find((p) => p.origin === "FICHE_JURIDIQUE");
  const r = evidence.creditReport;
  const l = evidence.legal;
  const fac = evidence.facilities;
  const totals = fac.totals as FacilityTotals | null;
  const t24 = evidence.client.t24 && typeof evidence.client.t24 === "object" ? Object.entries(evidence.client.t24 as Record<string, unknown>).filter(([, v]) => v !== null && v !== "" && typeof v !== "object") : [];
  const ident = Object.entries(evidence.client.identity).filter(([, v]) => v);
  const IDENT_LABELS: Record<string, string> = { ice: "ICE", rc: "RC", commercialCourt: "Tribunal de commerce", fiscalId: "IF", cnss: "CNSS", patente: "Patente", legalForm: "Forme juridique", city: "Ville" };

  return (
    <section id="elements-decision" className="card" style={{ padding: 16, display: "grid", gap: 12, minWidth: 0, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <div>
        <h2 style={{ fontWeight: 600 }}>Éléments au jour de la décision</h2>
        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          Figés à la soumission le {evidence.frozenAt.slice(0, 16).replace("T", " ")} par {evidence.frozenBy}. La fiche client a pu évoluer depuis : ces éléments
          sont ceux qui ont fondé la note.
        </p>
      </div>

      <div style={{ display: "grid", gap: 6, minWidth: 0, gridTemplateColumns: "minmax(0, 1fr)" }}>
        <h3 style={{ fontSize: 14, fontWeight: 600 }}>Client</h3>
        <p style={{ fontSize: 13 }}>
          <strong>{evidence.client.name}</strong>
          {ident.map(([k, v]) => (
            <span key={k}>
              {" "}
              · {IDENT_LABELS[k] ?? k} {v}
            </span>
          ))}
        </p>
        {evidence.client.dataSource === "T24" && (
          <details>
            <summary style={{ cursor: "pointer", fontSize: 13 }}>
              Fiche T24 {evidence.client.coreBankingId ?? ""} synchronisée le {evidence.client.coreBankingSyncedAt?.slice(0, 10) ?? "—"}
            </summary>
            <div className="table-scroll" style={{ marginTop: 6 }}>
              <table className="data" style={{ minWidth: 420 }}>
                <tbody>
                  {t24.map(([k, v]) => (
                    <tr key={k}>
                      <th style={{ width: "40%" }}>{k}</th>
                      <td>{String(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </div>

      <div style={{ display: "grid", gap: 6, minWidth: 0, gridTemplateColumns: "minmax(0, 1fr)" }}>
        <h3 style={{ fontSize: 14, fontWeight: 600 }}>Rapport de solvabilité</h3>
        {r ? (
          <>
            <p style={{ fontSize: 13 }}>
              {BUREAU_LABELS[r.bureau as keyof typeof BUREAU_LABELS] ?? r.bureau} du {r.reportDate}
              {r.reference ? ` · réf. ${r.reference}` : ""} · {r.data.lines.length} ligne(s), {r.data.incidents.length} incident(s)
              {reportPiece ? (
                <>
                  {" "}
                  · <a href={`/cases/${caseId}/pieces/${reportPiece.caseDocumentId}`}>{reportPiece.fileName}</a>
                </>
              ) : null}
            </p>
            <Findings items={r.findings} />
            <details>
              <summary style={{ cursor: "pointer", fontSize: 13 }}>Lignes retenues ({r.data.lines.length})</summary>
              <div className="table-scroll" style={{ marginTop: 6 }}>
                <table className="data" style={{ minWidth: 760 }}>
                  <thead>
                    <tr>
                      <th scope="col">Établissement</th>
                      <th scope="col">Type</th>
                      <th scope="col" style={{ textAlign: "right" }}>Autorisé</th>
                      <th scope="col" style={{ textAlign: "right" }}>Encours</th>
                      <th scope="col" style={{ textAlign: "right" }}>Impayé</th>
                      <th scope="col">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.data.lines.map((x: CreditLine, i: number) => (
                      <tr key={i}>
                        <td>{x.institution}</td>
                        <td>{x.type || "—"}</td>
                        <td style={{ textAlign: "right" }}>{amount(x.authorized)}</td>
                        <td style={{ textAlign: "right" }}>{amount(x.outstanding)}</td>
                        <td style={{ textAlign: "right" }}>{amount(x.overdue)}</td>
                        <td>{LINE_STATUS_LABELS[x.status] ?? x.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            <Corrections items={r.corrections} pieceHref={pieceByCpDoc} />
          </>
        ) : (
          <p className="muted" style={{ fontSize: 13 }}>Aucun rapport enregistré à la soumission.</p>
        )}
      </div>

      <div style={{ display: "grid", gap: 6, minWidth: 0, gridTemplateColumns: "minmax(0, 1fr)" }}>
        <h3 style={{ fontSize: 14, fontWeight: 600 }}>Fiche juridique (InfoRisque)</h3>
        {l ? (
          <>
            <p style={{ fontSize: 13 }}>
              Rapport du {l.reportDate || "—"}
              {legalPiece ? (
                <>
                  {" "}
                  · <a href={`/cases/${caseId}/pieces/${legalPiece.caseDocumentId}`}>{legalPiece.fileName}</a>
                </>
              ) : null}
            </p>
            <Findings items={l.findings} />
            {l.profile.legalEvents.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {l.profile.legalEvents.map((e, i) => (
                  <li key={i}>
                    {e.date || "date inconnue"} · {LEGAL_EVENT_LABELS[e.kind]}
                    {e.resolved ? " — levé par une correction motivée" : ""}
                  </li>
                ))}
              </ul>
            )}
            <Corrections items={l.corrections} pieceHref={pieceByCpDoc} />
          </>
        ) : (
          <p className="muted" style={{ fontSize: 13 }}>Aucune fiche juridique à la soumission.</p>
        )}
      </div>

      <div style={{ display: "grid", gap: 6, minWidth: 0, gridTemplateColumns: "minmax(0, 1fr)" }}>
        <h3 style={{ fontSize: 14, fontWeight: 600 }}>Engagements chez la banque</h3>
        {fac.lines.length ? (
          <>
            <p style={{ fontSize: 13 }}>
              Position du {fac.positionDate ?? "—"} · {totals?.lines ?? fac.lines.length} ligne(s) · autorisé {amount(totals?.authorized)} · encours {amount(totals?.outstanding)} ·
              impayé {amount(totals?.overdue)} · engagement global {amount(totals?.exposure)}
            </p>
            <Findings items={fac.findings} />
          </>
        ) : (
          <p className="muted" style={{ fontSize: 13 }}>Aucune ligne d&apos;engagement à la soumission.</p>
        )}
      </div>

      <div style={{ display: "grid", gap: 6, minWidth: 0, gridTemplateColumns: "minmax(0, 1fr)" }}>
        <h3 style={{ fontSize: 14, fontWeight: 600 }}>Bilan : valeurs lues corrigées</h3>
        {evidence.bilan.corrections.length ? (
          <div className="table-scroll">
            <table className="data" style={{ minWidth: 600 }}>
              <thead>
                <tr>
                  <th scope="col">Exercice</th>
                  <th scope="col">Poste</th>
                  <th scope="col" style={{ textAlign: "right" }}>Lu</th>
                  <th scope="col" style={{ textAlign: "right" }}>Retenu</th>
                  <th scope="col">Motif</th>
                </tr>
              </thead>
              <tbody>
                {evidence.bilan.corrections.map((c, i) => (
                  <tr key={i}>
                    <td>{c.fiscalYear || "—"}</td>
                    <td>{c.labelFr}</td>
                    <td style={{ textAlign: "right" }}>{c.read || "—"}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{c.retained || "—"}</td>
                    <td>{c.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted" style={{ fontSize: 12 }}>
            Aucune : bilan retenu tel que {evidence.bilan.source === "IA" ? "lu par l'OCR intelligent" : evidence.bilan.source === "EXCEL" ? "chargé du gabarit Excel" : "saisi"}.
          </p>
        )}
      </div>

      {evidence.pieces.length > 0 && (
        <p style={{ fontSize: 13 }}>
          Pièces copiées dans le dossier :{" "}
          {evidence.pieces.map((p, i) => (
            <span key={p.caseDocumentId}>
              {i ? ", " : ""}
              <a href={`/cases/${caseId}/pieces/${p.caseDocumentId}`}>{p.fileName}</a>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}
