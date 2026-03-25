import { createThreadsHandler } from "ucl-chat-widget/server";
import { getChatConfig } from "../chat-config";

export const GET = async () => {
  const config = await getChatConfig();
  return createThreadsHandler(config).GET();
};
