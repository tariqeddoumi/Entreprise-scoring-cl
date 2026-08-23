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
    redFlags: z
      .array(z.string().regex(/^RF\d{2}$/, "Code de red flag attendu au format RFnn"))
      .max(50)
      .optional(),
    defaultTriggered: z.boolean().optional(),
    asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date d'arrêté au format YYYY-MM-DD"),
  })
  .strict();

export const counterpartySchema = z
  .object({
    name: z.string().min(1).max(300),
    ice: z.string().max(20).optional(),
    rc: z.string().max(30).optional(),
    fiscalId: z.string().max(30).optional(),
    legalForm: z.string().max(60).optional(),
    sectorCode: z.string().max(30).optional(),
    city: z.string().max(80).optional(),
  })
  .strict();

export const counterpartyPatchSchema = counterpartySchema.partial().extend({
  isActive: z.boolean().optional(),
});

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
