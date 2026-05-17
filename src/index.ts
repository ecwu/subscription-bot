import { Env } from "./types/env.js";
import { handleWebhook } from "./handlers/webhook.js";
import { handleScheduled } from "./handlers/scheduled.js";
import { handleHealth } from "./handlers/health.js";
import { log } from "./utils/logger.js";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const requestId = crypto.randomUUID();

    log("info", "Incoming request", {
      requestId,
      method: request.method,
      path: url.pathname,
    });

    try {
      switch (url.pathname) {
        case "/health":
          return handleHealth();
        case "/telegram/webhook":
          return handleWebhook(request, env);
        default:
          return new Response("Not Found", { status: 404 });
      }
    } catch (error) {
      log("error", "Unhandled error in fetch handler", {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });
      return new Response("Internal Server Error", { status: 500 });
    }
  },

  async scheduled(
    controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    await handleScheduled(controller, env);
  },
};
