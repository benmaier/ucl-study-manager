import { createArtifactsHandler } from "ucl-chat-widget/server";
import { getChatConfig } from "../../../../chat-config";

export const GET = async (req: Request, ctx: { params: Promise<{ id: string; fileId: string }> }) => {
  const config = await getChatConfig();
  return createArtifactsHandler(config).GET(req, ctx);
};
