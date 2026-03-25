import { createThreadHandler } from "ucl-chat-widget/server";
import { getChatConfig } from "../../chat-config";

export const GET = async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const config = await getChatConfig();
  return createThreadHandler(config).GET(req, ctx);
};

export const PUT = async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const config = await getChatConfig();
  return createThreadHandler(config).PUT(req, ctx);
};
