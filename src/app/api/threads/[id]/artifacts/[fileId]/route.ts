import { createArtifactsHandler } from "ucl-chat-widget/server";
import { getChatConfig } from "../../../../chat-config";
export const GET = async (req: Request, ctx: { params: Promise<{ id: string; fileId: string }> }) => createArtifactsHandler(getChatConfig()).GET(req, ctx);
