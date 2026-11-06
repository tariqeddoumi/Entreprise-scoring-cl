import { aiStatus } from "@/lib/ai";
import { loadSettings, SETTINGS } from "@/lib/settings";
import { safeQuery } from "@/lib/safe-db";
import { getPerimeter, requireSession } from "@/lib/session";
import { loadCircuit } from "@/lib/workflow";
import { CircuitEditor } from "./CircuitEditor";
import { SettingsForm } from "./SettingsForm";
import { PurposesEditor } from "./PurposesEditor";
import { loadPurposes } from "@/lib/financial-statements";
import { DEFAULT_PURPOSES } from "@/reference/case-purposes";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireSession("ADMIN");
  const perimeter = await getPerimeter();
  const values = await loadSettings();
  const ai = await aiStatus();
  const { circuit, stored } = await loadCircuit({ fresh: true });
  const { data: holders } = await safeQuery(async (db) => {
    const rows = await db.user.groupBy({ by: ["jobFunction"], where: { isActive: true, jobFunction: { not: null } }, _count: { _all: true } });
    return Object.fromEntries(rows.map((r) => [r.jobFunction ?? "", r._count._all]));
  }, {} as Record<string, number>);
  const { data: purposes } = await safeQuery((db) => loadPurposes(db), DEFAULT_PURPOSES);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Paramétrage de l&apos;outil</h1>
        <p className="muted">
          Circuit de validation, règles du workflow, dérogations, pièces et intelligence artificielle. Les grilles
          de notation et l&apos;échelle se paramètrent dans leurs écrans dédiés, par versions datées. Chaque modification est
          journalisée.
        </p>
      </div>
      <div className="card" role="status" style={{ padding: "12px 16px", fontSize: 13 }}>
        <strong>État de l&apos;IA :</strong> {ai.enabled ? (ai.missing ? `activée, mais ${ai.missing}` : `active (${ai.provider}, ${ai.model})`) : "désactivée"}.
      </div>
      <CircuitEditor circuit={circuit} stored={stored} readOnly={!perimeter.all} holders={holders} />
      <PurposesEditor initial={purposes} readOnly={!perimeter.all} />
      <SettingsForm
        readOnly={!perimeter.all}
        values={values}
        defs={SETTINGS.map((d) => ({ ...d, options: d.options ? [...d.options] : undefined }))}
      />
    </div>
  );
}
