import { z } from "zod";

/**
 * Validation stricte des payloads API (côté serveur, systématique).
 * Le client ne fournit JAMAIS un poids, une formule ou un score global :
 * seules les mesures/observations et les scores qualitatifs ancrés 0/25/50/75/100
 * sont acceptés ; le serveur recalcule tout depuis la version de modèle publiée.
 */

/** Borne haute du nombre de critères acceptés dans une requête de notation. */
const MAX_CRITERIA = 200;

export const criterionInputSchema = z
  .object({
    status: z.enum(["AVAILABLE", "MISSING", "NOT_APPLICABLE", "INVALID", "STALE", "ESTIMATED"]),
    value: z.number().finite().optional(),
    score: z
      .union([z.literal(0), z.literal(25), z.literal(50), z.literal(75), z.literal(100)])
      .optional(),
    specialCase: z.string().max(64).optional(),
    evidence: z.string().max(4000).optional(),
  })
  .strict();

export const confidenceSchema = z
  .object({
    completeness: z.number().min(0).max(100),
    freshness: z.number().min(0).max(100),
    reliability: z.number().min(0).max(100),
    provenance: z.number().min(0).max(100),
  })
  .strict();

export const structuralFlagsSchema = z
  .object({
    companyAgeYears: z.number().min(0).max(500).optional(),
    hasStrongGroupSupport: z.boolean().optional(),
    negativeTangibleEquity: z.boolean().optional(),
    firmRecapitalizationDone: z.boolean().optional(),
    goingConcernMaterialUncertainty: z.boolean().optional(),
    accountsTooOld: z.boolean().optional(),
    ebitdaNegativeTwoOfThreeYears: z.boolean().optional(),
    baseDscrBelow1: z.boolean().optional(),
    stressDscrBelow1: z.boolean().optional(),
    singleClientDependencyUnmitigated: z.boolean().optional(),
    activeRestructuringForbearance: z.boolean().optional(),
    materialGroupFileIncomplete: z.boolean().optional(),
  })
  .strict();

/**
 * Matérialité des risques conditionnels (constat H09, diagnostic M03).
 *
 * Trois états : true matériel, false non matériel (à justifier dans
 * materialityEvidence), absent inconnu. Seul un « non matériel » justifié écarte
 * le critère.
 */
export const materialitySchema = z
  .object({
    esgPhysicalMaterial: z.boolean().optional(),
    esgTransitionMaterial: z.boolean().optional(),
    esgComplianceMaterial: z.boolean().optional(),
    covenantsMaterial: z.boolean().optional(),
  })
  .strict();

/** Support groupe (constat H05) : quatre conditions cumulatives, relèvement plafonné. */
export const groupSupportSchema = z
  .object({
    claimed: z.boolean(),
    capacityDocumented: z.boolean().optional(),
    willingnessDocumented: z.boolean().optional(),
    legallyBinding: z.boolean().optional(),
    fundsTransferable: z.boolean().optional(),
    requestedNotches: z.number().int().min(0).max(5).optional(),
  })
  .strict();

/**
 * Base financière jointe à une notation (bilan, ratios, contrôles). Bornée :
 * elle voyage dans l'instantané d'entrée, sans effet sur le calcul.
 */
const finiteOrNull = z.number().finite().nullable();
export const financialBasisSchema = z
  .object({
    chartVersion: z.string().max(40),
    statementModel: z.enum(["NORMAL", "SIMPLIFIE"]),
    certified: z.boolean(),
    source: z.enum(["SAISIE", "EXCEL", "IA"]),
    currency: z.string().regex(/^[A-Z]{3}$/).optional(),
    document: z.object({ id: z.string().max(40), name: z.string().max(200), sha256: z.string().regex(/^[0-9a-f]{64}$/) }).strict().optional(),
    years: z
      .array(
        z
          .object({
            fiscalYear: z.string().max(20),
            closingDate: z.string().max(10),
            postes: z.record(z.string().max(40), z.number().finite()).refine((r) => Object.keys(r).length <= 120, "Trop de postes."),
          })
          .strict()
      )
      .max(3),
    indicators: z.array(z.object({ key: z.string().max(40), values: z.array(finiteOrNull).max(3) }).strict()).max(80),
    gridRatios: z
      .array(
        z
          .object({
            criterion: z.string().max(32),
            indicator: z.string().max(40),
            computed: finiteOrNull,
            specialCase: z.string().max(60).optional(),
            retained: finiteOrNull,
            overridden: z.boolean(),
            reason: z.string().max(500).optional(),
            noteFr: z.string().max(1000).optional(),
          })
          .strict()
      )
      .max(30),
    controls: z
      .array(
        z
          .object({
            key: z.string().max(80),
            labelFr: z.string().max(200),
            status: z.enum(["OK", "ALERTE", "KO"]),
            detailFr: z.string().max(500),
          })
          .strict()
      )
      .max(200),
  })
  .strict();

export const ratingRequestSchema = z
  .object({
    counterpartyId: z.string().min(1).optional(), // requis pour la persistance, absent en simulation
    modelId: z.string().min(1),
    segment: z.enum(["TPE", "PME", "GE"]).optional(),
    segmentationData: z
      .object({
        annualTurnover: z.number().min(0).optional(),
        groupAnnualTurnover: z.number().min(0).optional(),
        globalBankExposure: z.number().min(0).optional(),
      })
      .strict()
      .optional(),
    // Le nombre de critères est borné : un objet non borné permettrait
    // d'envoyer des dizaines de milliers de clés et de saturer la validation.
    criteria: z
      .record(z.string().max(32), criterionInputSchema)
      .refine((c) => Object.keys(c).length <= MAX_CRITERIA, {
        message: `Au plus ${MAX_CRITERIA} critères par requête.`,
      }),
    confidence: confidenceSchema,
    structuralFlags: structuralFlagsSchema.optional(),
    materiality: materialitySchema.optional(),
    materialityEvidence: z
      .object({
        esgPhysicalMaterial: z.string().max(500).optional(),
        esgTransitionMaterial: z.string().max(500).optional(),
        esgComplianceMaterial: z.string().max(500).optional(),
        covenantsMaterial: z.string().max(500).optional(),
      })
      .strict()
      .optional(),
    /** Éléments de routage : le serveur en déduit la famille de modèle (diagnostic M06). */
    routing: z
      .object({
        reliableFinancialStatements: z.boolean(),
        behavioralHistoryMonths: z.number().int().min(0).max(600),
      })
      .strict()
      .optional(),
    groupSupport: groupSupportSchema.optional(),
    redFlags: z
      .array(z.string().regex(/^RF\d{2}$/, "Code de red flag attendu au format RFnn"))
      .max(50)
      .optional(),
    /** Statut conformité amont — porté séparément du risque (constat C06). */
    complianceStatus: z.enum(["NOT_EVALUATED", "CLEAR", "REFER", "BLOCKED"]).optional(),
    /** Exposition déjà au bilan : conservée dans l'instantané, sans effet sur le calcul. */
    existingExposure: z.boolean().optional(),
    /** Bilan et ratios qui fondent la notation : restitués sur la fiche, sans effet sur le calcul. */
    financialBasis: financialBasisSchema.optional(),
    defaultTriggered: z.boolean().optional(),
    defaultGrade: z.enum(["DEF1", "DEF2", "DEF3"]).optional(),
    asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date d'arrêté au format YYYY-MM-DD"),
  })
  .strict();

/** Codes ISO : pays (3166-1 alpha-2) et devise (4217). */
export const countryCodeSchema = z.string().regex(/^[A-Z]{2}$/, "Code pays ISO à deux lettres (MA, CI, SN…)");
export const currencyCodeSchema = z.string().regex(/^[A-Z]{3}$/, "Code devise ISO à trois lettres (MAD, XOF, EUR…)");

export const counterpartySchema = z
  .object({
    name: z.string().min(1).max(300),
    /** Banque ou filiale qui porte la relation ; à défaut, celle de l'appelant. */
    entityId: z.string().min(1).max(40).optional(),
    country: countryCodeSchema.optional(),
    /** Devise des montants de la contrepartie ; à défaut, celle de l'entité. */
    currency: currencyCodeSchema.optional(),
    ice: z.string().max(20).optional(),
    rc: z.string().max(30).optional(),
    fiscalId: z.string().max(30).optional(),
    legalForm: z.string().max(60).optional(),
    sectorCode: z.string().max(30).optional(),
    city: z.string().max(80).optional(),
  })
  .strict();

/**
 * Modification partielle : seuls les champs présents changent ; `null` efface
 * un champ facultatif (la raison sociale, l'entité et la devise ne s'effacent pas).
 */
export const counterpartyPatchSchema = counterpartySchema
  .partial()
  .extend({
    country: countryCodeSchema.nullable().optional(),
    ice: z.string().max(20).nullable().optional(),
    rc: z.string().max(30).nullable().optional(),
    fiscalId: z.string().max(30).nullable().optional(),
    legalForm: z.string().max(60).nullable().optional(),
    sectorCode: z.string().max(30).nullable().optional(),
    city: z.string().max(80).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const webhookSubscriptionSchema = z
  .object({
    // La forme est validée ici ; le protocole, les adresses privées et les
    // identifiants dans l'URL sont contrôlés par `checkOutboundUrl` avant
    // enregistrement (protection contre les requêtes forgées côté serveur).
    url: z.string().url().max(2000),
    secret: z.string().min(32, "Secret HMAC d'au moins 32 caractères requis").max(256),
    events: z
      .array(
        z.enum([
          "rating.completed",
          "rating.blocked",
          "rating.overridden",
          "rating.override_expired",
          "counterparty.updated",
          "*",
        ])
      )
      .min(1)
      .max(20),
  })
  .strict();

export const overrideRequestSchema = z
  .object({
    ratingRunId: z.string().min(1),
    toGrade: z.string().min(2).max(8),
    reasonCode: z.enum([
      "DATA_NOT_CAPTURED",
      "RECENT_EVENT_NEGATIVE",
      "RECENT_EVENT_POSITIVE",
      "GROUP_SUPPORT",
      "MODEL_LIMITATION",
      "SECTOR_SPECIFICITY",
      "MANAGEMENT_CHANGE",
      "TEMPORARY_SHOCK",
      "POLICY_EXCEPTION",
    ]),
    comment: z.string().min(10).max(4000),
    evidence: z.string().max(4000).optional(),
    expiresAt: z.string().datetime().optional(),
  })
  .strict();

export const overrideDecisionSchema = z
  .object({
    decision: z.enum(["APPROVED", "REJECTED"]),
    comment: z.string().max(4000).optional(),
  })
  .strict();

export const compareRequestSchema = z
  .object({
    previousRunId: z.string().min(1).max(64),
    currentRunId: z.string().min(1).max(64),
  })
  .strict();

export const caseDecisionSchema = z
  .object({
    decision: z.enum(["VALIDATED", "REJECTED"]),
    /** Obligatoire pour un rejet (10 caractères au moins). */
    comment: z.string().max(4000).optional(),
  })
  .strict();
