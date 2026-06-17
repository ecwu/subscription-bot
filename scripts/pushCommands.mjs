import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const commands = [
  { command: "start", description: "开始使用" },
  { command: "help", description: "查看帮助" },
  { command: "add", description: "添加订阅" },
  { command: "list", description: "查看订阅列表" },
  { command: "list_full", description: "查看完整订阅列表" },
  { command: "export", description: "导出数据" },
  { command: "report", description: "查看支出报告" },
  { command: "reminders", description: "查看提醒" },
  { command: "settings", description: "设置默认参数" },
  { command: "delete_me", description: "删除我的数据" },
];

function parseDotEnv(content) {
  const values = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function getBotToken() {
  if (process.env.BOT_TOKEN) {
    return process.env.BOT_TOKEN;
  }

  const devVarsPath = resolve(process.cwd(), ".dev.vars");

  if (!existsSync(devVarsPath)) {
    return undefined;
  }

  return parseDotEnv(readFileSync(devVarsPath, "utf8")).BOT_TOKEN;
}

const botToken = getBotToken();

if (!botToken) {
  console.error("BOT_TOKEN is required. Set it in the environment or .dev.vars.");
  process.exit(1);
}

const response = await fetch(`https://api.telegram.org/bot${botToken}/setMyCommands`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ commands }),
});

const result = await response.json();

if (!response.ok || !result.ok) {
  console.error("Failed to push Telegram bot commands.");
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log(`Pushed ${commands.length} Telegram bot commands.`);
