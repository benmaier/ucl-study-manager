import { createChatHandler } from "ucl-chat-widget/server";
import { getChatConfig } from "../chat-config";

export const POST = async (req: Request) => {
  try {
    const config = await getChatConfig();
    return createChatHandler(config).POST(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[chat route] Error:", message, stack);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
