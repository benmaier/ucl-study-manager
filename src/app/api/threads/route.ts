import { createThreadsHandler } from "ucl-chat-widget/server";
import { getChatConfig } from "../chat-config";
export const GET = async () => createThreadsHandler(getChatConfig()).GET();
