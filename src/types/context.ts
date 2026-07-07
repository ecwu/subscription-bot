import { Context, SessionFlavor } from "grammy";
import {
  ConversationFlavor,
  type ConversationData,
  type VersionedState,
} from "@grammyjs/conversations";
import { Env } from "./env.js";

export interface SessionData {
  conversations?: VersionedState<ConversationData>;
}

// Base context with custom properties (without conversation flavor)
export type BaseBotContext = Context &
  SessionFlavor<SessionData> & {
    env: Env;
    userKey?: string;
    requestId: string;
    isAdmin: boolean;
  };

// Full context used in middleware (with conversation controls)
export type BotContext = ConversationFlavor<BaseBotContext>;
