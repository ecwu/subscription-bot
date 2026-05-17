import { Context, SessionFlavor } from "grammy";
import { ConversationFlavor } from "@grammyjs/conversations";
import { Env } from "./env.js";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SessionData {
  // intentionally empty for now
}

// Base context with custom properties (without conversation flavor)
export type BaseBotContext = Context &
  SessionFlavor<SessionData> & {
    env: Env;
    userKey?: string;
    requestId: string;
  };

// Full context used in middleware (with conversation controls)
export type BotContext = ConversationFlavor<BaseBotContext>;
