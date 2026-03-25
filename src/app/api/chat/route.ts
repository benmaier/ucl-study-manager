import { createChatHandler } from "ucl-chat-widget/server";
import { getChatConfig } from "../chat-config";

export const POST = async (req: Request) => {
  const config = await getChatConfig();
  return createChatHandler(config).POST(req);
};
