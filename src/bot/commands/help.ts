import { BotContext } from "../../types/context.js";

export async function helpCommand(ctx: BotContext): Promise<void> {
  await ctx.reply(
    "可用命令：\n\n" +
      "一行命令：\n" +
      "/add <名称> <价格> <币种> <周期> <日期> — 添加订阅\n" +
      "  示例：/add Netflix 12.99 CNY monthly 2026-06-01\n" +
      "  间隔：/add Gym 30 CNY 30d 2026-06-01 或 every 4 weeks\n" +
      "  说明：一行 /add 的名称暂不支持空格\n\n" +
      "/list — 查看简洁订阅列表\n" +
      "/list_full — 查看带操作按钮的完整订阅列表\n" +
      "  在 /list_full 中可查看详情、编辑、暂停/恢复或删除订阅\n" +
      "/reminders — 查看近期即将扣款的订阅\n\n" +
      "/report — 生成月度订阅支出报告\n" +
      "/report_text — 生成文本版支出明细报告\n\n" +
      "交互方式：\n" +
      "/add — 逐步添加订阅，支持带空格的名称\n" +
      "/list_full — 点击每个订阅下方的按钮管理订阅\n\n" +
      "隐私与数据：\n" +
      "/export — 导出已保存的订阅 JSON\n" +
      "/delete_me — 永久删除所有已保存数据（需要确认）\n\n" +
      "/help — 显示这条帮助信息",
  );
}
