import { afterEach, describe, expect, it, vi } from "vitest";

const settings: Record<string, string> = {};
vi.mock("../src/lib/settings", () => ({
  AI_PROVIDERS: ["anthropic", "openai", "azure_openai", "compatible_openai"],
  loadSettings: async () => settings,
}));

import { chatCompletionsUrl, missingConfig, aiConfig, runAi } from "../src/lib/ai";

const req = {
  system: "Analyste crédit.",
  documents: [],
  instruction: "Propose le chiffre d'affaires.",
  schema: { type: "object", properties: { ca: { type: "number" } }, required: ["ca"] },
  effort: "low" as const,
  timeoutMs: 5000,
};
const reply = (content: string) =>
  new Response(JSON.stringify({ model: "m", choices: [{ finish_reason: "stop", message: { content } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of Object.keys(settings)) delete settings[k];
});

describe("fournisseurs d'IA", () => {
  it("adresse chat completions : OpenAI, Gemini, Azure avec api-version", () => {
    expect(chatCompletionsUrl(null)).toBe("https://api.openai.com/v1/chat/completions");
    expect(chatCompletionsUrl("https://generativelanguage.googleapis.com/v1beta/openai/")).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(chatCompletionsUrl("https://banque.openai.azure.com/openai/deployments/gpt-notation?api-version=2024-10-21")).toBe(
      "https://banque.openai.azure.com/openai/deployments/gpt-notation/chat/completions?api-version=2024-10-21"
    );
    expect(chatCompletionsUrl("https://banque.openai.azure.com/openai/deployments/gpt-notation/chat/completions?api-version=2024-10-21")).toBe(
      "https://banque.openai.azure.com/openai/deployments/gpt-notation/chat/completions?api-version=2024-10-21"
    );
  });

  it("une clé par fournisseur : la variable désignée est lue, en Bearer (Gemini) ou api-key (Azure)", async () => {
    process.env.IA_CLE_GEMINI = "cle-gemini";
    process.env.IA_CLE_AZURE = "cle-azure";
    Object.assign(settings, { AI_ENABLED: "true", AI_PROVIDER: "compatible_openai", AI_MODEL: "gemini-x", AI_BASE_URL: "https://generativelanguage.googleapis.com/v1beta/openai", AI_KEY_ENV: "IA_CLE_GEMINI" });
    const seen: Array<{ url: string; h: Record<string, string> }> = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      seen.push({ url, h: init.headers as Record<string, string> });
      return reply('{"ca": 1}');
    });
    await runAi(req);
    expect(seen[0].h.authorization).toBe("Bearer cle-gemini");
    Object.assign(settings, { AI_PROVIDER: "azure_openai", AI_BASE_URL: "https://banque.openai.azure.com/openai/deployments/d1?api-version=2024-10-21", AI_KEY_ENV: "IA_CLE_AZURE" });
    await runAi(req);
    expect(seen[1].h["api-key"]).toBe("cle-azure");
    expect(seen[1].h.authorization).toBeUndefined();
    expect(seen[1].url).toContain("/deployments/d1/chat/completions?api-version=");
  });

  it("un nom de variable hors IA_CLE_ n'est jamais lu ; clé absente signalée par son nom", async () => {
    process.env.DATABASE_URL_TEST = "secret";
    Object.assign(settings, { AI_PROVIDER: "openai", AI_MODEL: "gpt-x", AI_KEY_ENV: "DATABASE_URL_TEST" });
    const c = await aiConfig();
    expect(c.keyEnv).toBe("IA_CLE_API");
    Object.assign(settings, { AI_KEY_ENV: "IA_CLE_ABSENTE" });
    expect(missingConfig(await aiConfig())).toContain("IA_CLE_ABSENTE");
  });
});

describe("validation du paramètre", async () => {
  const real = await vi.importActual<typeof import("../src/lib/settings")>("../src/lib/settings");
  it("AI_KEY_ENV : IA_CLE_… uniquement", () => {
    expect(real.validateSetting("AI_KEY_ENV", "IA_CLE_OPENAI")).toEqual({ ok: true, value: "IA_CLE_OPENAI" });
    expect(real.validateSetting("AI_KEY_ENV", "DATABASE_URL").ok).toBe(false);
    expect(real.validateSetting("AI_KEY_ENV", "ia_cle_x").ok).toBe(false);
  });
});
