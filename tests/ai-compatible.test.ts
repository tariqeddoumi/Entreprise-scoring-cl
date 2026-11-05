import { afterEach, describe, expect, it, vi } from "vitest";

const settings: Record<string, string> = {};
vi.mock("../src/lib/settings", () => ({
  AI_PROVIDERS: ["anthropic", "openai", "azure_openai", "compatible_openai"],
  loadSettings: async () => settings,
}));

import { runAi } from "../src/lib/ai";

const req = {
  system: "Analyste crédit.",
  documents: [{ name: "note.txt", mimeType: "text/plain", base64: Buffer.from("CA 12 MDH").toString("base64") }],
  instruction: "Propose le chiffre d'affaires.",
  schema: { type: "object", properties: { ca: { type: "number" } }, required: ["ca"] },
  effort: "low" as const,
  timeoutMs: 5000,
};

function reply(content: string, status = 200) {
  return new Response(JSON.stringify({ model: "deepseek-flash", choices: [{ finish_reason: "stop", message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), { status });
}

afterEach(() => vi.unstubAllGlobals());

describe("API compatible OpenAI (DeepSeek)", () => {
  it("envoie json_object, le schéma dans les consignes et un message texte simple", async () => {
    Object.assign(settings, { AI_ENABLED: "true", AI_PROVIDER: "compatible_openai", AI_MODEL: "deepseek-flash", AI_BASE_URL: "https://api.deepseek.com" });
    process.env.IA_CLE_API = "test";
    const calls: Array<{ url: string; body: any }> = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return reply('```json\n{"ca": 12}\n```');
    });
    const r = await runAi(req);
    expect(r.json).toEqual({ ca: 12 });
    expect(calls[0].url).toBe("https://api.deepseek.com/chat/completions");
    expect(calls[0].body.response_format).toEqual({ type: "json_object" });
    expect(calls[0].body.messages[0].content).toContain("json");
    expect(typeof calls[0].body.messages[1].content).toBe("string");
  });

  it("relance une fois si le contenu revient vide", async () => {
    let n = 0;
    vi.stubGlobal("fetch", async () => reply(n++ === 0 ? "   " : '{"ca": 3}'));
    expect((await runAi(req)).json).toEqual({ ca: 3 });
    expect(n).toBe(2);
  });

  it("OpenAI : repli sur json_object si json_schema est refusé (400)", async () => {
    settings.AI_PROVIDER = "openai";
    const modes: string[] = [];
    vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => {
      const b = JSON.parse(String(init.body));
      modes.push(b.response_format.type);
      expect(b.max_tokens).toBeUndefined();
      return b.response_format.type === "json_schema" ? reply("", 400) : reply('{"ca": 7}');
    });
    expect((await runAi(req)).json).toEqual({ ca: 7 });
    expect(modes).toEqual(["json_schema", "json_object"]);
  });
});
