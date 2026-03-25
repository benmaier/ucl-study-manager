import { createMessagesHandler } from "ucl-chat-widget/server";
import { getChatConfig } from "../../../chat-config";

export const GET = async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const config = await getChatConfig();
  return createMessagesHandler(config).GET(req, ctx);
};
