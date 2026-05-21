import { UserRepository } from "../../repositories/userRepository.js";

export const SETTINGS_ONBOARDING_MESSAGE =
  "提醒：你还没有配置个人设置。\n" +
  "发送 /settings 设置提醒时间、时区和默认币种，让后续添加订阅更省事。";

export async function shouldShowSettingsOnboarding(
  userRepo: UserRepository,
  userKey: string,
  encryptionKey: string,
): Promise<boolean> {
  const profile = await userRepo.getUserProfile(userKey, encryptionKey);
  return !profile?.settings;
}
