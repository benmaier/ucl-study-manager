import { createChatHandler } from "ucl-chat-widget/server";
import { getChatConfig } from "../chat-config";
export const POST = async (req: Request) => createChatHandler(getChatConfig()).POST(req);
