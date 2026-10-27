import { CASE_STATUS_LABELS } from "@/lib/cases";

const SHORT: Record<string, string> = {
  DRAFT: "Brouillon",
  SUBMITTED: "À valider",
  VALIDATED: "Validé",
  REJECTED: "Rejeté",
  CANCELLED: "Abandonné",
};

export function CaseStatusBadge({ status }: { status: string }) {
  return (
    <span className="case-status" data-status={status} title={CASE_STATUS_LABELS[status] ?? status}>
      {SHORT[status] ?? status}
    </span>
  );
}
