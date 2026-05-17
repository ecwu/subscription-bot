import { ReminderRepository } from "../repositories/reminderRepository.js";

export interface ReminderService {
  // TODO: define reminder operations
  sendRemindersForDate(date: string): Promise<void>;
}

export function createReminderService(
  _repo: ReminderRepository
): ReminderService {
  return {
    async sendRemindersForDate(_date: string): Promise<void> {
      // TODO: implement reminder dispatch
    },
  };
}
