import { BASE_CURRENCY, COMMON_CURRENCIES } from "@/lib/fx";
import { safeQuery } from "@/lib/safe-db";
import { getPerimeter, requireSession } from "@/lib/session";
import { FxAdmin } from "./FxAdmin";

export const dynamic = "force-dynamic";

export default async function CurrenciesPage() {
  await requireSession("ADMIN");
  const perimeter = await getPerimeter();
  const { data: rates, dbAvailable } = await safeQuery(
    (db) => db.exchangeRate.findMany({ orderBy: [{ currency: "asc" }, { effectiveDate: "desc" }], take: 500 }),
    []
  );
  const latest = new Map<string, (typeof rates)[number]>();
  for (const r of rates) if (!latest.has(r.currency)) latest.set(r.currency, r);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Devises et cours de change</h1>
        <p className="muted">
          Devise de base du groupe : <strong>{BASE_CURRENCY}</strong>. Les montants saisis dans la devise
          d&apos;une filiale (chiffre d&apos;affaires, exposition) sont convertis au dernier cours publié à la
          date d&apos;arrêté du dossier ; la conversion est consignée dans le dossier. Sans cours, un dossier
          en devise étrangère ne peut pas être soumis.
        </p>
      </div>
      {!dbAvailable ? (
        <div className="card" style={{ padding: 16 }}>
          <span className="muted">Base injoignable : les cours sont indisponibles.</span>
        </div>
      ) : (
        <FxAdmin
          canWrite={perimeter.all}
          suggestions={COMMON_CURRENCIES.filter((c) => c !== BASE_CURRENCY)}
          latest={[...latest.values()].map((r) => ({
            currency: r.currency,
            rate: Number(r.rate),
            effectiveDate: r.effectiveDate,
          }))}
          history={rates.map((r) => ({
            id: r.id,
            currency: r.currency,
            rate: Number(r.rate),
            effectiveDate: r.effectiveDate,
            source: r.source,
            createdBy: r.createdBy,
          }))}
        />
      )}
    </div>
  );
}
