import Anthropic from "@anthropic-ai/sdk";
import { AI_PROVIDERS, loadSettings } from "./settings";

/**
 * Intelligence artificielle d'assistance — fournisseur paramétrable.
 *
 * - « anthropic » (par défaut) : API Claude. Lit les PDF page par page (tableaux
 *   et graphiques compris) ; sortie JSON contrainte par un schéma ; repli
 *   serveur automatique si le modèle décline la requête.
 * - « openai », « azure_openai », « compatible_openai » : toute API au format
 *   « chat completions » (OpenAI, Azure OpenAI, Mistral, modèle hébergé par la
 *   banque). Les PDF y sont transmis sous forme de texte extrait.
 *
 * Le fournisseur, le modèle et l'adresse se paramètrent à l'écran ; la clé reste
 * une variable d'environnement (ANTHROPIC_API_KEY, ou IA_CLE_API). L'IA est
 * DÉSACTIVÉE par défaut ; elle ne fait que proposer : aucune valeur n'est
 * appliquée sans décision humaine tracée.
 */

export type AiProvider = (typeof AI_PROVIDERS)[number];

export const DEFAULT_MODEL: Record<AiProvider, string> = {
  anthropic: "claude-opus-5-5",
  openai: "",
  azure_openai: "",
  compatible_openai: "",
};

export interface AiConfig {
  enabled: boolean;
  provider: AiProvider;
  model: string;
  baseUrl: string | null;
}

export interface AiDocument {
  name: string;
  mimeType: string;
  base64: string;
}

export interface AiRequest {
  system: string;
  documents: AiDocument[];
  instruction: string;
  schema: Record<string, unknown>;
  /** Profondeur de raisonnement : extraction simple « low », analyse « medium ». */
  effort: "low" | "medium" | "high";
  timeoutMs: number;
}

export interface AiResponse {
  json: unknown;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export class AiError extends Error {}

/** Types de pièces lisibles par l'IA. */
export const AI_READABLE_TYPES = ["application/pdf", "image/png", "image/jpeg", "text/plain", "text/csv"] as const;

export async function aiConfig(): Promise<AiConfig> {
  const s = await loadSettings();
  const provider = (AI_PROVIDERS as readonly string[]).includes(s.AI_PROVIDER) ? (s.AI_PROVIDER as AiProvider) : "anthropic";
  return {
    enabled: s.AI_ENABLED === "true",
    provider,
    model: (s.AI_MODEL ?? "").trim() || DEFAULT_MODEL[provider],
    baseUrl: (s.AI_BASE_URL ?? "").trim() || null,
  };
}

function apiKey(provider: AiProvider): string | undefined {
  if (provider === "anthropic") return process.env.ANTHROPIC_API_KEY;
  return process.env.IA_CLE_API;
}

/** Ce qui manque pour appeler le fournisseur, ou null. */
export function missingConfig(c: AiConfig): string | null {
  if (!apiKey(c.provider)) {
    return `la clé ${c.provider === "anthropic" ? "ANTHROPIC_API_KEY" : "IA_CLE_API"} est absente des variables d'environnement`;
  }
  if (!c.model) return "le modèle n'est pas renseigné (paramètre « Modèle »)";
  if ((c.provider === "azure_openai" || c.provider === "compatible_openai") && !c.baseUrl) {
    return "l'adresse de l'API n'est pas renseignée";
  }
  return null;
}

export async function aiStatus(): Promise<{ enabled: boolean; provider: string; model: string; missing: string | null }> {
  const c = await aiConfig();
  return { enabled: c.enabled, provider: c.provider, model: c.model, missing: missingConfig(c) };
}

/** Lève AiError si l'IA n'est pas utilisable ; renvoie la configuration sinon. */
export async function requireAi(): Promise<AiConfig> {
  const c = await aiConfig();
  if (!c.enabled) throw new AiError("L'assistance par l'IA est désactivée (Paramétrage › Intelligence artificielle).");
  const missing = missingConfig(c);
  if (missing) throw new AiError(`IA non configurée : ${missing}.`);
  return c;
}

export async function runAi(req: AiRequest): Promise<AiResponse> {
  const c = await requireAi();
  return c.provider === "anthropic" ? runAnthropic(c, req) : runOpenAiCompatible(c, req);
}

// --- Anthropic ------------------------------------------------------------------

function anthropicBlocks(docs: AiDocument[]): Anthropic.Beta.BetaContentBlockParam[] {
  const blocks: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const d of docs) {
    if (d.mimeType === "application/pdf") {
      blocks.push({
        type: "document",
        title: d.name,
        source: { type: "base64", media_type: "application/pdf", data: d.base64 },
      });
    } else if (d.mimeType === "image/png" || d.mimeType === "image/jpeg") {
      blocks.push({ type: "text", text: `Pièce « ${d.name} » (image) :` });
      blocks.push({ type: "image", source: { type: "base64", media_type: d.mimeType, data: d.base64 } });
    } else {
      blocks.push({
        type: "document",
        title: d.name,
        source: { type: "text", media_type: "text/plain", data: Buffer.from(d.base64, "base64").toString("utf8") },
      });
    }
  }
  return blocks;
}

async function runAnthropic(c: AiConfig, req: AiRequest): Promise<AiResponse> {
  const client = new Anthropic({ apiKey: apiKey("anthropic"), ...(c.baseUrl ? { baseURL: c.baseUrl } : {}) });
  try {
    const stream = client.beta.messages.stream(
      {
        model: c.model,
        max_tokens: 32000,
        // Repli serveur : si le modèle décline la requête, l'API la rejoue sur un
        // modèle de secours dans le même appel.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: req.effort, format: { type: "json_schema", schema: req.schema } },
        system: req.system,
        messages: [
          { role: "user", content: [...anthropicBlocks(req.documents), { type: "text", text: req.instruction }] },
        ],
      },
      { timeout: req.timeoutMs, maxRetries: 1 }
    );
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") throw new AiError("Le fournisseur d'IA a décliné la demande.");
    if (message.stop_reason === "max_tokens") throw new AiError("Réponse de l'IA tronquée : réduisez le nombre de pièces.");
    const text = message.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return {
      json: parseJson(text),
      model: message.model,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    };
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e instanceof Anthropic.RateLimitError) throw new AiError("Fournisseur d'IA saturé : réessayez dans une minute.");
    if (e instanceof Anthropic.AuthenticationError) throw new AiError("Clé d'API refusée par le fournisseur d'IA.");
    if (e instanceof Anthropic.APIError) throw new AiError(`Erreur du fournisseur d'IA (${e.status ?? "réseau"}).`);
    throw new AiError("Le fournisseur d'IA ne répond pas.");
  }
}

// --- API au format OpenAI ---------------------------------------------------------

async function pdfToText(base64: string): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(Buffer.from(base64, "base64")));
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  return pages.map((t, i) => `[Page ${i + 1}]\n${t.trim()}`).join("\n\n");
}

async function runOpenAiCompatible(c: AiConfig, req: AiRequest): Promise<AiResponse> {
  type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
  const parts: Part[] = [];
  for (const d of req.documents) {
    if (d.mimeType === "application/pdf") {
      let text: string;
      try {
        text = await pdfToText(d.base64);
      } catch {
        text = "(texte du PDF illisible : document scanné ou protégé)";
      }
      parts.push({ type: "text", text: `=== Pièce « ${d.name} » ===\n${text}` });
    } else if (d.mimeType.startsWith("image/")) {
      parts.push({ type: "image_url", image_url: { url: `data:${d.mimeType};base64,${d.base64}` } });
    } else {
      parts.push({ type: "text", text: `=== Pièce « ${d.name} » ===\n${Buffer.from(d.base64, "base64").toString("utf8")}` });
    }
  }
  parts.push({ type: "text", text: req.instruction });

  const base = (c.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const url = base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
  const key = apiKey(c.provider) ?? "";
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (c.provider === "azure_openai") headers["api-key"] = key;
  else headers.authorization = `Bearer ${key}`;

  // Sans image, le message part en texte simple : certaines API compatibles
  // (DeepSeek, modèles hébergés) n'acceptent pas le contenu en plusieurs parties.
  const userContent = parts.some((p) => p.type === "image_url")
    ? parts
    : parts.map((p) => (p.type === "text" ? p.text : "")).join("\n\n");

  // Sortie JSON contrainte par le schéma quand l'API le permet ; sinon (DeepSeek
  // et la plupart des API compatibles) mode « json_object », le schéma étant
  // alors donné dans les consignes.
  const strictFirst = c.provider !== "compatible_openai";
  const attempts: Array<"json_schema" | "json_object"> = strictFirst ? ["json_schema", "json_object"] : ["json_object"];
  let lastError: AiError | null = null;
  for (const mode of attempts) {
    for (let retry = 0; retry < 2; retry++) {
      const system =
        mode === "json_schema"
          ? req.system
          : `${req.system}\n\nRéponds UNIQUEMENT par un objet JSON valide (json), sans texte autour, conforme à ce schéma JSON :\n${JSON.stringify(req.schema)}`;
      const res = await fetch(url, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(req.timeoutMs),
        body: JSON.stringify({
          model: c.model,
          // Plafond explicite pour les API compatibles (DeepSeek tronque sinon le JSON) ;
          // OpenAI et Azure gardent leur valeur par défaut.
          ...(c.provider === "compatible_openai" ? { max_tokens: 8000 } : {}),
          messages: [
            { role: "system", content: system },
            { role: "user", content: userContent },
          ],
          response_format:
            mode === "json_schema"
              ? { type: "json_schema", json_schema: { name: "propositions", strict: true, schema: req.schema } }
              : { type: "json_object" },
        }),
      }).catch(() => {
        throw new AiError("Le fournisseur d'IA ne répond pas.");
      });
      if (res.status === 401 || res.status === 403) throw new AiError("Clé d'API refusée par le fournisseur d'IA.");
      if (res.status === 429) throw new AiError("Fournisseur d'IA saturé : réessayez dans une minute.");
      if (res.status === 400 && mode === "json_schema") {
        lastError = new AiError("Erreur du fournisseur d'IA (400).");
        break; // l'API ne connaît pas json_schema : passage au mode json_object
      }
      if (!res.ok) throw new AiError(`Erreur du fournisseur d'IA (${res.status}).`);
      const body = (await res.json()) as {
        model?: string;
        choices?: Array<{ finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const choice = body.choices?.[0];
      if (choice?.message?.refusal) throw new AiError("Le fournisseur d'IA a décliné la demande.");
      if (choice?.finish_reason === "length") throw new AiError("Réponse de l'IA tronquée : réduisez le nombre de pièces.");
      const content = (choice?.message?.content ?? "").trim();
      if (!content) {
        // DeepSeek peut renvoyer un contenu vide en mode JSON : une nouvelle tentative.
        lastError = new AiError("Réponse de l'IA vide.");
        continue;
      }
      return {
        json: parseJson(content),
        model: body.model ?? c.model,
        inputTokens: body.usage?.prompt_tokens ?? 0,
        outputTokens: body.usage?.completion_tokens ?? 0,
      };
    }
  }
  throw lastError ?? new AiError("Réponse de l'IA illisible.");
}

function parseJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(t);
  } catch {
    throw new AiError("Réponse de l'IA illisible.");
  }
}
