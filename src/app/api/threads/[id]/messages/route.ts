import { createMessagesHandler } from "ucl-chat-widget/server";
import { getChatConfig } from "../../../chat-config";
export const GET = async (req: Request, ctx: { params: Promise<{ id: string }> }) => createMessagesHandler(getChatConfig()).GET(req, ctx);
