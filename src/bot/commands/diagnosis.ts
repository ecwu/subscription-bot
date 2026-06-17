import { parseMasterKey } from "../../crypto/masterKey.js";
import { BotContext } from "../../types/context.js";
import { Env } from "../../types/env.js";
import { createLogger } from "../../utils/logger.js";

type DiagnosisLevel = "ok" | "warn" | "error";

interface DiagnosisCheck {
  name: string;
  level: DiagnosisLevel;
  message: string;
}

const VALID_APP_ENVS = new Set(["development", "production", "test"]);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasKvMethods(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.get === "function" &&
    typeof candidate.put === "function" &&
    typeof candidate.delete === "function" &&
    typeof candidate.list === "function"
  );
}

function checkRequiredSecret(
  name: keyof Env,
  env: Partial<Env>,
): DiagnosisCheck {
  const value = env[name];
  if (!isNonEmptyString(value)) {
    return {
      name,
      level: "error",
      message: "missing or empty",
    };
  }

  return {
    name,
    level: "ok",
    message: "set",
  };
}

function checkEncryptionKey(env: Partial<Env>): DiagnosisCheck {
  const value = env.ENCRYPTION_KEY;
  if (!isNonEmptyString(value)) {
    return {
      name: "ENCRYPTION_KEY",
      level: "error",
      message: "missing or empty",
    };
  }

  try {
    parseMasterKey(value);
    return {
      name: "ENCRYPTION_KEY",
      level: "ok",
      message: "valid base64url 32-byte key",
    };
  } catch (error) {
    return {
      name: "ENCRYPTION_KEY",
      level: "error",
      message: error instanceof Error ? error.message : "invalid key",
    };
  }
}

function checkAdminUserId(env: Partial<Env>): DiagnosisCheck {
  const value = env.ADMIN_USER_ID;
  if (value === undefined || value === "") {
    return {
      name: "ADMIN_USER_ID",
      level: "warn",
      message: "not set; admin-only commands are unavailable",
    };
  }

  if (!/^\d+$/.test(value)) {
    return {
      name: "ADMIN_USER_ID",
      level: "warn",
      message: "set, but expected a numeric Telegram user ID",
    };
  }

  return {
    name: "ADMIN_USER_ID",
    level: "ok",
    message: "set",
  };
}

function checkKvBinding(env: Partial<Env>): DiagnosisCheck {
  if (!env.SUBSCRIPTION_KV) {
    return {
      name: "SUBSCRIPTION_KV",
      level: "error",
      message: "binding missing",
    };
  }

  if (!hasKvMethods(env.SUBSCRIPTION_KV)) {
    return {
      name: "SUBSCRIPTION_KV",
      level: "error",
      message: "binding does not expose expected KV methods",
    };
  }

  return {
    name: "SUBSCRIPTION_KV",
    level: "ok",
    message: "binding available",
  };
}

function checkAppEnv(env: Partial<Env>): DiagnosisCheck {
  const value = env.APP_ENV;
  if (value === undefined || value === "") {
    return {
      name: "APP_ENV",
      level: "ok",
      message: "not set; defaults to development",
    };
  }

  if (!VALID_APP_ENVS.has(value)) {
    return {
      name: "APP_ENV",
      level: "error",
      message: "must be development, production, or test",
    };
  }

  return {
    name: "APP_ENV",
    level: "ok",
    message: value,
  };
}

function checkReminderDaysAhead(env: Partial<Env>): DiagnosisCheck {
  const value = env.REMINDER_DAYS_AHEAD;
  if (value === undefined || value === "") {
    return {
      name: "REMINDER_DAYS_AHEAD",
      level: "ok",
      message: "not set; defaults to 3",
    };
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    return {
      name: "REMINDER_DAYS_AHEAD",
      level: "error",
      message: "must be a non-negative integer",
    };
  }

  return {
    name: "REMINDER_DAYS_AHEAD",
    level: "ok",
    message: value,
  };
}

export function buildDiagnosisChecks(env: Partial<Env>): DiagnosisCheck[] {
  return [
    checkRequiredSecret("BOT_TOKEN", env),
    checkRequiredSecret("TELEGRAM_WEBHOOK_SECRET", env),
    checkEncryptionKey(env),
    checkRequiredSecret("USER_HASH_SECRET", env),
    checkAdminUserId(env),
    checkKvBinding(env),
    checkAppEnv(env),
    checkReminderDaysAhead(env),
  ];
}

function formatStatus(level: DiagnosisLevel): string {
  switch (level) {
    case "ok":
      return "OK";
    case "warn":
      return "WARN";
    case "error":
      return "ERROR";
  }
}

export function buildDiagnosisReport(env: Partial<Env>): string {
  return formatDiagnosisReport(buildDiagnosisChecks(env));
}

function formatDiagnosisReport(checks: DiagnosisCheck[]): string {
  const errorCount = checks.filter((check) => check.level === "error").length;
  const warnCount = checks.filter((check) => check.level === "warn").length;

  const header =
    errorCount === 0
      ? "环境变量自检：通过"
      : `环境变量自检：发现 ${errorCount} 个错误`;

  return [
    header,
    warnCount > 0 ? `警告：${warnCount} 个` : "警告：0 个",
    "",
    ...checks.map(
      (check) =>
        `- [${formatStatus(check.level)}] ${check.name}: ${check.message}`,
    ),
  ].join("\n");
}

export async function diagnosisCommand(ctx: BotContext): Promise<void> {
  const logger = createLogger(ctx.requestId);

  if (!ctx.isAdmin) {
    await ctx.reply("This command is only available to admins.");
    logger.warn("Non-admin attempted diagnosis command");
    return;
  }

  const checks = buildDiagnosisChecks(ctx.env);
  await ctx.reply(formatDiagnosisReport(checks));
  logger.info("Environment diagnosis reported", {
    hasErrors: checks.some((check) => check.level === "error"),
  });
}
