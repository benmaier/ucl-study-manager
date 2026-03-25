import { createThreadHandler } from "ucl-chat-widget/server";
import { getChatConfig } from "../../chat-config";
const handler = () => createThreadHandler(getChatConfig());
export const GET = async (req: Request, ctx: { params: Promise<{ id: string }> }) => handler().GET(req, ctx);
export const PUT = async (req: Request, ctx: { params: Promise<{ id: string }> }) => handler().PUT(req, ctx);
