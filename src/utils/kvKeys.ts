export function userProfile(userKey: string): string {
  return `user:${userKey}:profile`;
}

export function userSubscriptionsIndex(userKey: string): string {
  return `user:${userKey}:subs`;
}

export function subscription(userKey: string, subId: string): string {
  return `user:${userKey}:sub:${subId}`;
}

export function reminderDate(date: string): string {
  return `reminders:${date}`;
}
