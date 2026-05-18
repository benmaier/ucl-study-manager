import { createChatHandler } from "ucl-chat-widget/server";
import { getChatConfig } from "../chat-config";
import { ensureTextOnLastUserMessage } from "@/lib/ensure-message-text";

async function rebuildRequestWithText(req: Request): Promise<Request> {
  const body = await req.json();
  const patched = ensureTextOnLastUserMessage(body);
  return new Request(req.url, {
    method: req.method,
    headers: req.headers,
    body: JSON.stringify(patched),
  });
}

export const POST = async (req: Request) => {
  // Pre-process: inject a placeholder text when a user uploads a file
  // without typing anything (otherwise the widget rejects the turn).
  const patched = await rebuildRequestWithText(req);
  // Clone the patched request so we can retry with the fallback provider
  // if the primary fails.
  const clonedReq = patched.clone();

  try {
    const config = await getChatConfig();
    return createChatHandler(config).POST(patched);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[chat route] Primary failed:", message);

    // Try fallback provider
    try {
      const fallbackConfig = await getChatConfig({ useFallback: true });
      console.log("[chat route] Retrying with fallback provider");
      return createChatHandler(fallbackConfig).POST(clonedReq);
    } catch (fallbackErr) {
      const fallbackMessage = fallbackErr instanceof Error ? fallbackErr.message : "Unknown error";
      console.error("[chat route] Fallback also failed:", fallbackMessage);
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }
};
