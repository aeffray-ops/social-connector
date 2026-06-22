import { createInterface } from "node:readline/promises";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { SocialConnector } from "./SocialConnector.js";

/**
 * Natural-language layer over WhatsApp: an LLM reads a plain instruction
 * ("écris dans le groupe X pour dire Y demain à 9h"), composes a clear
 * message, resolves a fuzzy group name via the group list, and sends — with
 * a human confirmation gate before any real send (manual agentic loop).
 *
 * Backend-agnostic: works with OpenAI (default) or Anthropic. Both share the
 * same tool definitions and the same gated tool executor.
 *
 * EXPERIMENTAL: depends on the WhatsApp scraping and on an API key.
 */

export type AiProvider = "openai" | "anthropic";

const ANTHROPIC_MODEL = "claude-opus-4-8";
const OPENAI_MODEL_DEFAULT = "gpt-4o";

const SYSTEM = [
  "You drive a WhatsApp account on the user's behalf.",
  "Resolve fuzzy group references to an exact name with list_whatsapp_groups before sending or reading.",
  "For one conversation, use read_conversation on that exact chat; filter the returned `date`/`time` yourself for 'today'.",
  "For 'what did I get today' across chats: call list_recent_chats first, keep the chats whose `time` is an 'HH:MM' value (today), then read_conversation only on those (a handful, not dozens) and synthesize. Prefer previews when full detail is not needed.",
  "Compose clear, natural messages in the user's language from their intent — never send the raw instruction verbatim.",
  "Provide either `chat` (group/community) or `to` (contact number) to send_whatsapp_message, never both.",
  "If the destination is ambiguous (several plausible chats, or none match), do not send — ask the user to clarify instead.",
].join(" ");

/** Provider-neutral tool definitions (JSON Schema), mapped per backend below. */
const TOOL_DEFS: { name: string; description: string; schema: Record<string, unknown> }[] = [
  {
    name: "list_whatsapp_groups",
    description:
      "List the user's WhatsApp groups. Returns {count, groups}: use `count` as the authoritative total (do not recount the array yourself) and `groups` to resolve a fuzzy reference to an exact group name before sending.",
    schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_recent_chats",
    description:
      "List the most recent WhatsApp chats (newest first) with {name, time, preview, unread}. `time` is the last-activity time as WhatsApp shows it: an 'HH:MM' time means TODAY, otherwise it's 'hier'/a weekday/a date. Use this to find which chats are active today, then read_conversation on the relevant ones. Set onlyUnread to focus on unseen chats.",
    schema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max chats to list (default 20)." },
        onlyUnread: { type: "boolean", description: "Only chats with unread messages." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "read_conversation",
    description:
      "Read the recent messages of ONE WhatsApp conversation (group or contact), by exact chat name. Returns messages with {from, text, time, date}. To summarize 'today', read with a reasonable limit and filter by the `date` field yourself. There is no way to read all conversations at once.",
    schema: {
      type: "object",
      properties: {
        chat: { type: "string", description: "Exact chat/group name to read." },
        limit: { type: "number", description: "Max recent messages to fetch (default 50)." },
        since: { type: "string", description: "Optional lower-bound date YYYY-MM-DD (best-effort)." },
      },
      required: ["chat"],
      additionalProperties: false,
    },
  },
  {
    name: "send_whatsapp_message",
    description:
      "Send a WhatsApp message to a group/community (by exact name) or to a contact (by international phone number, no '+'). Compose a clear, natural message in the user's language from their intent — do not send the raw instruction verbatim.",
    schema: {
      type: "object",
      properties: {
        chat: { type: "string", description: "Exact group/community name (from list_whatsapp_groups)." },
        to: { type: "string", description: "Contact international number without '+', e.g. 33612345678." },
        message: { type: "string", description: "The composed message to send." },
      },
      required: ["message"],
      additionalProperties: false,
    },
  },
];

export interface RunAiOptions {
  connector: SocialConnector;
  instruction: string;
  /** Skip the confirmation prompt before sending. Default: false. */
  autoSend?: boolean;
  /** Force a backend; otherwise auto-detected from env. */
  provider?: AiProvider;
  /** Confirmation prompt; defaults to a y/N readline prompt on stdin. */
  confirm?: (question: string) => Promise<boolean>;
  /** Where agent text + status lines go. Default: console.log. */
  output?: (line: string) => void;
  /** Token usage reporter, called after each LLM round (for a consumption meter). */
  onUsage?: (u: { model: string; inputTokens: number; outputTokens: number }) => void;
}

async function defaultConfirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const ans = (await rl.question(question)).trim().toLowerCase();
    return ans === "y" || ans === "yes" || ans === "o" || ans === "oui";
  } finally {
    rl.close();
  }
}

/** Picks the backend: explicit > AI_PROVIDER env > whichever key is set > openai. */
export function resolveProvider(explicit?: AiProvider): AiProvider {
  if (explicit) return explicit;
  const env = process.env.AI_PROVIDER?.toLowerCase();
  if (env === "openai" || env === "anthropic") return env;
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return "openai";
}

interface ToolOutcome {
  content: string;
  isError?: boolean;
}

/** Runs one tool call (shared across backends), gating the send behind confirmation. */
async function execTool(
  name: string,
  input: {
    chat?: string;
    to?: string;
    message?: string;
    limit?: number;
    since?: string;
    onlyUnread?: boolean;
  },
  wa: SocialConnector,
  autoSend: boolean,
  confirm: (q: string) => Promise<boolean>,
  output: (line: string) => void,
): Promise<ToolOutcome> {
  if (name === "list_whatsapp_groups") {
    const groups = await wa.listGroups();
    // Return the count explicitly — LLMs miscount long lists, so don't make
    // the model recount; `count` is the authoritative total.
    return { content: JSON.stringify({ count: groups.length, groups }) };
  }

  if (name === "list_recent_chats") {
    const chats = await wa.listRecentChats({ limit: input.limit, onlyUnread: input.onlyUnread });
    return { content: JSON.stringify({ count: chats.length, chats }) };
  }

  if (name === "read_conversation") {
    if (!input.chat?.trim()) return { content: "Missing chat name.", isError: true };
    const messages = await wa.readConversation({
      chat: input.chat.trim(),
      limit: input.limit,
      since: input.since,
    });
    return { content: JSON.stringify({ count: messages.length, messages }) };
  }

  if (name === "send_whatsapp_message") {
    const { chat, to, message } = input;
    if (!message?.trim()) return { content: "Missing message.", isError: true };
    const target = chat ?? to ?? "(unknown)";

    if (!autoSend) {
      const ok = await confirm(
        `\n>>> Send to "${target}":\n    "${message}"\n>>> Confirm? [y/N] `,
      );
      if (!ok) {
        output("[--] Cancelled.");
        return { content: "User declined to send the message.", isError: true };
      }
    }

    try {
      await wa.post(message, { chat, target: to });
      output("[OK] Message sent.");
      return { content: `Sent to ${target}.` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[ERROR] ${msg}`);
      return { content: `Send failed: ${msg}`, isError: true };
    }
  }

  return { content: `Unknown tool: ${name}`, isError: true };
}

/** Anthropic (Claude) backend — manual tool-use loop. */
async function runAnthropic(opts: Required<Pick<RunAiOptions, "connector" | "instruction" | "autoSend">> & {
  confirm: (q: string) => Promise<boolean>;
  output: (line: string) => void;
  onUsage?: RunAiOptions["onUsage"];
}): Promise<void> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const tools: Anthropic.Tool[] = TOOL_DEFS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.schema as Anthropic.Tool.InputSchema,
  }));
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: opts.instruction },
  ];

  while (true) {
    const res = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      thinking: { type: "adaptive" },
      system: SYSTEM,
      tools,
      messages,
    });

    if (res.usage) {
      opts.onUsage?.({
        model: ANTHROPIC_MODEL,
        inputTokens: res.usage.input_tokens ?? 0,
        outputTokens: res.usage.output_tokens ?? 0,
      });
    }

    if (res.stop_reason !== "tool_use") {
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (text) opts.output(text);
      return;
    }

    messages.push({ role: "assistant", content: res.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of res.content) {
      if (block.type !== "tool_use") continue;
      const out = await execTool(
        block.name,
        block.input as {
          chat?: string;
          to?: string;
          message?: string;
          limit?: number;
          since?: string;
          onlyUnread?: boolean;
        },
        opts.connector,
        opts.autoSend,
        opts.confirm,
        opts.output,
      );
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: out.content,
        ...(out.isError ? { is_error: true } : {}),
      });
    }
    messages.push({ role: "user", content: results });
  }
}

/** OpenAI (ChatGPT) backend — chat.completions tool-calling loop. */
async function runOpenAI(opts: Required<Pick<RunAiOptions, "connector" | "instruction" | "autoSend">> & {
  confirm: (q: string) => Promise<boolean>;
  output: (line: string) => void;
  onUsage?: RunAiOptions["onUsage"];
}): Promise<void> {
  const client = new OpenAI(); // reads OPENAI_API_KEY
  const model = process.env.OPENAI_MODEL ?? OPENAI_MODEL_DEFAULT;
  const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = TOOL_DEFS.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.schema as OpenAI.FunctionParameters,
    },
  }));
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: opts.instruction },
  ];

  while (true) {
    const res = await client.chat.completions.create({
      model,
      messages,
      tools,
      tool_choice: "auto",
    });
    if (res.usage) {
      opts.onUsage?.({
        model,
        inputTokens: res.usage.prompt_tokens ?? 0,
        outputTokens: res.usage.completion_tokens ?? 0,
      });
    }
    const msg = res.choices[0]?.message;
    if (!msg) return;
    messages.push(msg);

    const calls = msg.tool_calls ?? [];
    if (calls.length === 0) {
      if (msg.content) opts.output(msg.content);
      return;
    }

    for (const call of calls) {
      if (call.type !== "function") continue;
      let input: {
        chat?: string;
        to?: string;
        message?: string;
        limit?: number;
        since?: string;
        onlyUnread?: boolean;
      } = {};
      try {
        input = JSON.parse(call.function.arguments || "{}");
      } catch {
        /* leave empty -> execTool reports the error */
      }
      const out = await execTool(call.function.name, input, opts.connector, opts.autoSend, opts.confirm, opts.output);
      messages.push({ role: "tool", tool_call_id: call.id, content: out.content });
    }
  }
}

/** Runs the natural-language WhatsApp agent on the selected backend. */
export async function runAi(opts: RunAiOptions): Promise<void> {
  const provider = resolveProvider(opts.provider);
  const output = opts.output ?? ((l: string) => console.log(l));
  const shared = {
    connector: opts.connector,
    instruction: opts.instruction,
    autoSend: opts.autoSend ?? false,
    confirm: opts.confirm ?? defaultConfirm,
    output,
    onUsage: opts.onUsage,
  };
  if (provider === "anthropic") await runAnthropic(shared);
  else await runOpenAI(shared);
}
