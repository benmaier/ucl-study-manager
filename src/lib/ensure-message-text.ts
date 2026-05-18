/**
 * The widget's chat handler rejects requests whose last user message has
 * no extractable text with `{"error":"No user message"}`. When a
 * participant attaches a file without typing anything, the widget sends
 * only file parts (no text) and the request 400s. This pre-processor
 * injects a one-character placeholder so file-only uploads behave like
 * a normal turn from the widget's perspective. Inject only when the
 * message has parts but none of them carry text.
 */

type MessagePart = { type: string; text?: string };
type Message = { role: string; content?: MessagePart[] | string };

export function ensureTextOnLastUserMessage(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const b = body as { messages?: Message[] };
  const msgs = b.messages;
  if (!Array.isArray(msgs)) return body;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role !== "user") continue;
    const content = msgs[i].content;
    if (!Array.isArray(content)) return body;
    const hasText = content.some(
      (p) => p?.type === "text" && typeof p.text === "string" && p.text.length > 0,
    );
    if (!hasText && content.length > 0) {
      msgs[i] = {
        ...msgs[i],
        content: [...content, { type: "text", text: "(uploaded file)" }],
      };
    }
    return body;
  }
  return body;
}
