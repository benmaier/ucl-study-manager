import { createFilesHandler } from "ucl-chat-widget/server";
import { getChatConfig } from "../../../../../api/chat-config";

export const GET = async (req: Request, ctx: { params: Promise<{ id: string; fileId: string }> }) => {
  try {
    const config = await getChatConfig();
    const handler = createFilesHandler(config);
    return handler.GET(req, ctx);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
