# Interaction Review

This document reviews the Telegram interactive flows, session behavior, callback safety, and known UX limitations.

## /add Conversation Behavior

The `/add` command starts a multi-step conversation when called without arguments:

1. **Name** — asks for subscription name. Empty input is rejected.
2. **Price** — asks for price. User may type `skip` to leave unset.
3. **Currency** — inline keyboard with common currencies (CNY, USD, HKD, TWD, EUR, JPY, GBP, SGD). User can choose **其他** to type a custom 3-letter code, or **不填写** if no price was set. Required if price was set.
4. **Billing cycle** — inline keyboard with Weekly, Monthly, Quarterly, Yearly, Custom, and Advanced interval. Advanced interval prompts for `every 30 days`, `every 4 weeks`, `30d`, `4w`, `每30天`, or `每4周`.
5. **Next billing date** — inline calendar keyboard. User can navigate months with ‹ ›, pick a day, or select **今天**.
6. **Review** — shows a summary with Confirm/Cancel inline buttons.

If the user sends `/cancel` at any step, the conversation exits immediately and **no partial subscription is saved**.

If validation fails at any step, the conversation ends with an error message and the user must restart with `/add`.

### Legacy one-line usage
`/add Netflix 12.99 CNY monthly 2026-06-01` still works and bypasses the conversation.
Interval cycles also work in one-line usage, for example `/add Gym 30 CNY 30d 2026-06-01`.

## /edit Conversation Behavior

Two interactive edit paths exist:

### Inline edit menu (callback-based)
1. User clicks **Edit** from a `/list` message.
2. Bot shows an inline keyboard: Name, Price, Currency, Cycle, Next billing date, Cancel.
3. Clicking a text field starts `editField` conversation.
4. Clicking **Cycle** starts `editCycle` conversation with an inline keyboard.

### editField conversation
- Prompts for the new value.
- Validates input (name non-empty, price non-negative, currency 3-letter, date YYYY-MM-DD).
- Saves only after valid input.
- `/cancel` aborts without saving.

### editCycle conversation
- Shows inline keyboard with cycle options.
- Saves immediately after selection for fixed cycles.
- For Advanced interval, prompts for the interval text before saving.
- `/cancel` is not available here; the user can simply ignore the message.

### Legacy one-line usage
`/edit <id> date|price|cycle <value>` still works.
Cycle values can be fixed cycles or interval values such as `30d` and `every 4 weeks`.

## /cancel Behavior

- `/cancel` calls `ctx.conversation.exitAll()`, which safely ends all active conversations for the current chat.
- It is safe to use **outside** a conversation; the bot simply replies "已取消。"
- During `/add`, cancelling before the final Confirm step guarantees **no partial data is written to KV**.

## /reminders Behavior

The `/reminders` command lists subscriptions with upcoming renewals within the configured reminder window (default 3 days, controlled by `REMINDER_DAYS_AHEAD`).

- Loads all subscriptions, filters those with `nextBillingDate` between today and today + days ahead.
- Sorts by billing date ascending.
- Shows name, price (if set), and billing date for each upcoming subscription.
- If no subscriptions are due within the window, replies "近期没有即将扣款的订阅。"

This is a single-shot command; no conversation or callback state is involved.

## Session Limitations on Cloudflare Workers

grammY's default session storage is **in-memory per isolate**.

On Cloudflare Workers:
- Each incoming request may run in a **different isolate**.
- Isolates are **recycled/evicted unpredictably** after periods of inactivity or on deployments.
- Session data is **not shared** across isolates.

### Impact
- An active `/add` or `/edit` conversation may disappear if the isolate changes before the user responds.
- The user will see no error; the next message will simply not be recognized as part of a conversation.
- Users can safely restart the flow with `/add` or `/edit`.

### Decision for MVP
This behavior is **acceptable for MVP**. The bot is stateless and KV-backed for persistent data; transient conversation state is a minor UX trade-off.

### Future option: KV-backed session adapter
A KV-backed session adapter is technically possible:
- Serialize session state to KV with a key like `session:<userHash>`.
- Set a TTL (e.g., 1 hour) to avoid stale sessions.
- Encrypt session data if it contains sensitive metadata.

**Risks:**
- Adds latency (extra KV read/write per update).
- Race conditions if multiple isolates handle updates for the same user concurrently.
- grammY conversation state includes generator snapshots; serialization is non-trivial.

**Recommendation:** Defer until user feedback justifies the complexity.

## Stale Callback Handling

Callback buttons from old messages may still be clickable. The following protections are in place:

### Subscription no longer exists
All subscription-related callbacks (`sub:view`, `sub:edit`, `sub:delete`, `delete:confirm`) verify the subscription still exists in KV before acting. If it was deleted:
- The callback query is answered with "Subscription not found." or "Already deleted."
- The message text is edited to "Subscription not found or already deleted."

### Malformed callback data
All callbacks use `parse*CallbackData` helpers. If parsing fails:
- The callback query is answered with "Invalid callback data."
- No further action is taken.

### Expired conversation buttons
Buttons specific to active conversations (`cycle:`, `editcycle:`, `add:confirm`, `add:cancel`) have **fallback handlers** registered after the conversation handlers. If a conversation has ended (isolate recycled, user cancelled, or abandoned), these fallback handlers:
- Answer the callback query with "This selection has expired..."
- Prevent the Telegram loading spinner from spinning indefinitely.

### Uncaught errors
All callback handlers are wrapped in `try/catch`. If an unexpected error occurs:
- The callback query is answered with "Something went wrong."
- The error is logged (without sensitive data).
- No uncaught exception propagates to the user.

## Repeated Callback Clicks

### Delete confirmation — idempotent
1. User clicks **Delete** → confirmation keyboard appears.
2. User clicks **Confirm** → subscription is deleted, message edited to "Deleted."
3. User clicks **Confirm** again → bot checks KV, finds nothing, answers "Already deleted." and edits message to "Subscription not found or already deleted."
4. No crash, no double-deletion.

### Edit after deletion
If a user clicks **Edit** on a `/list` message for a subscription that was already deleted:
- Bot answers "Subscription not found."
- Message is edited to "Subscription not found or already deleted."

### Cancel after action completed
If a user clicks **Cancel** on a delete confirmation after the subscription was already deleted:
- The delete-cancel handler simply answers "Cancelled." and edits the message to "Delete cancelled."
- This is harmless; the subscription is already gone.

## Callback Query UX

- **All** callback handlers call `answerCallbackQuery` (directly or via `safeAnswerCallbackQuery`).
- Telegram stops showing the loading spinner immediately.
- No sensitive data (subscription names, prices, user IDs) is placed in callback query responses.
- Message edits use `safeEditMessageText` which silently ignores errors if the message was already edited or deleted.

## Privacy / Logging Review

The following are **never** logged:
- Raw Telegram user IDs, usernames, or chat IDs.
- `userKey` (hashed user identifier).
- Message text content.
- Subscription names, prices, or decrypted notes.
- `ENCRYPTION_KEY`, `USER_HASH_SECRET`, or `BOT_TOKEN`.

What **is** logged:
- `requestId` (UUID per update).
- `subId` (UUID) and `shortId` (first 8 chars) for audit trails.
- `updateId` for tracing.
- Error messages (sanitized).

## Remaining UX Limitations

1. **No conversation timeout.** If a user starts `/add` and abandons it, the conversation waits indefinitely until the isolate is recycled. The user must send `/cancel` or start a new command. A future enhancement could track conversation start timestamps and auto-exit stale ones.

2. **Session loss on isolate change.** As documented above, conversations may reset between requests. This is rare during active use but possible after long pauses.

3. **Inline buttons on old `/list` messages.** After editing or deleting a subscription, older `/list` messages still show `[View] [Edit] [Delete]` buttons for the old state. Clicking them triggers the stale-subscription handlers gracefully, but the UI is slightly misleading.

4. **No batch operations.** Each subscription in `/list` is a separate message. There is no "Delete all" or multi-select flow.

5. **No undo.** Deletion is permanent. The confirmation step mitigates accidental clicks, but there is no trash bin or recovery.

6. **Rate limiting is per-isolate.** The in-memory rate limiter resets when the isolate is recycled. This is acceptable for MVP but not a hard guarantee against abuse.

7. **Fixed-cycle edit buttons do not need /cancel.** For fixed-cycle buttons, the edit saves immediately after selection. For Advanced interval text input, `/cancel` aborts before saving.

## Validation Messages

All validation errors are user-facing and specific (messages are in Chinese as shown to users):

| Field | Invalid input | Message |
|-------|--------------|---------|
| Name | empty | "订阅名称不能为空。" |
| Price (add) | negative / non-numeric | "请输入非负数字，或发送 skip 跳过。" |
| Price (edit) | negative / non-numeric | "请输入非负数字。" |
| Currency (add) | not 3-letter | "请输入 3 位币种代码，例如 CNY 或 USD。" |
| Currency (edit) | not 3-letter | "请输入 3 位币种代码，例如 CNY 或 USD。" |
| Date (add) | wrong format | "请使用 YYYY-MM-DD 格式，例如 2026-06-01。" |
| Date (edit) | wrong format | "请使用 YYYY-MM-DD 格式，例如 2026-06-01。" |
| Cycle | invalid button | "请点击按钮选择扣款周期。" |
