/**
 * The widget's chat handler rejects requests whose last user message has
 * no extractable text with `{"error":"No user message"}`. When a
 * participant attaches a file without typing anything, the widget sends
 * only file parts (no text) and the request 400s.
 *
 * The widget's `extractText` reads from `msg.parts` (an array) — *not*
 * `msg.content`. Recent assistant-ui ships the parts array on
 * `msg.parts`; legacy versions may use `msg.content` as a string. We
 * handle both. Inject a placeholder text part only when the message has
 * at least one non-text part (e.g. a file) and no text at all, so an
 * actually-empty turn still gets rejected by the widget.
 */

type MessagePart = { type: string; text?: string };
type Message = {
  role: string;
  parts?: MessagePart[];
  content?: MessagePart[] | string;
};

const PLACEHOLDER = "(uploaded file)";

function hasNonEmptyText(parts: MessagePart[]): boolean {
  return parts.some(
    (p) => p?.type === "text" && typeof p.text === "string" && p.text.length > 0,
  );
}

export function ensureTextOnLastUserMessage(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const b = body as { messages?: Message[] };
  const msgs = b.messages;
  if (!Array.isArray(msgs)) return body;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role !== "user") continue;
    const msg = msgs[i];

    // Modern assistant-ui shape: `parts` array.
    if (Array.isArray(msg.parts)) {
      if (msg.parts.length > 0 && !hasNonEmptyText(msg.parts)) {
        msgs[i] = {
          ...msg,
          parts: [...msg.parts, { type: "text", text: PLACEHOLDER }],
        };
      }
      return body;
    }

    // Legacy shape: `content` as an array of parts.
    if (Array.isArray(msg.content)) {
      if (msg.content.length > 0 && !hasNonEmptyText(msg.content)) {
        msgs[i] = {
          ...msg,
          content: [...msg.content, { type: "text", text: PLACEHOLDER }],
        };
      }
      return body;
    }

    // `content` as a plain string: leave alone — widget falls back to it.
    return body;
  }
  return body;
}
