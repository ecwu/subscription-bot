export function log(
  level: "info" | "warn" | "error",
  message: string,
  meta?: Record<string, unknown>
): void {
  const timestamp = new Date().toISOString();
  const payload = { timestamp, level, message, ...meta };

  // In production, avoid console.log and use structured logging if available
  if (level === "error") {
    console.error(JSON.stringify(payload));
  } else if (level === "warn") {
    console.warn(JSON.stringify(payload));
  } else {
    console.log(JSON.stringify(payload));
  }
}

export function createLogger(requestId: string) {
  return {
    info: (message: string, meta?: Record<string, unknown>) =>
      log("info", message, { requestId, ...meta }),
    warn: (message: string, meta?: Record<string, unknown>) =>
      log("warn", message, { requestId, ...meta }),
    error: (message: string, meta?: Record<string, unknown>) =>
      log("error", message, { requestId, ...meta }),
  };
}
