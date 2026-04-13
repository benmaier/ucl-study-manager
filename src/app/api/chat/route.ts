import { createChatHandler } from "ucl-chat-widget/server";
import { getChatConfig } from "../chat-config";

export const POST = async (req: Request) => {
  // Clone request so we can retry with fallback if primary fails
  const clonedReq = req.clone();

  try {
    const config = await getChatConfig();
    return createChatHandler(config).POST(req);
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
