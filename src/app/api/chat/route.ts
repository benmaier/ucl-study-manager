import { createChatHandler } from "ucl-chat-widget/server";
import { getChatConfig } from "../chat-config";

export const POST = async (req: Request) => {
  try {
    const config = await getChatConfig();
    return createChatHandler(config).POST(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
};
