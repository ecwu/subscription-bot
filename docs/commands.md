# Commands

## User Commands

| Command      | Description                                      | Status        |
|-------------|--------------------------------------------------|---------------|
| `/start`    | Start the bot and show welcome message           | Implemented   |
| `/help`     | Show list of available commands                  | Implemented   |
| `/add`      | Add a new subscription (interactive or one-line) | Implemented   |
| `/list`     | List all your subscriptions with inline buttons  | Implemented   |
| `/view`     | View subscription details by ID                  | Implemented   |
| `/edit`     | Edit a subscription field (interactive or one-line) | Implemented |
| `/delete`   | Delete a specific subscription                   | Implemented   |
| `/export`   | Export your subscription data as JSON            | Implemented   |
| `/report`   | Generate two subscription spending PNG reports   | Implemented   |
| `/reminders`| Show upcoming renewals within reminder window    | Implemented   |
| `/delete_me`| Delete all your data from the bot                | Implemented   |
| `/cancel`   | Exit all active conversations                    | Implemented   |

## Development Commands

| Command      | Description                                      | Availability  |
|-------------|--------------------------------------------------|---------------|
| `/debug_me` | Show sanitized diagnostic info                   | Dev/Test only |

`/debug_me` is only registered when `APP_ENV !== "production"`. It never exposes raw Telegram user IDs, usernames, message text, or secrets.

## Command Details

### `/start`

Shows a welcome message. First-time users see a quick-start guide with `/add`, `/list`, and `/report`. Returning users see common actions.

### `/add`

**Interactive mode** (no arguments):
1. Asks for subscription name (non-empty).
2. Asks for price. Send `skip` to leave unset.
3. Select currency via inline keyboard (includes common currencies + custom input).
4. Select billing cycle via inline keyboard: Weekly, Monthly, Quarterly, Yearly, Custom, or Advanced interval.
   Advanced interval accepts day/week intervals such as `every 30 days`, `every 4 weeks`, `30d`, `4w`, `每30天`, or `每4周`.
5. Select next billing date via inline calendar keyboard.
6. Review summary with Confirm/Cancel buttons.

If the user sends `/cancel` at any step, the conversation exits immediately and **no partial subscription is saved**.

**One-line mode**:
```
/add <name> <price> <currency> <cycle> <date>
```
Example: `/add Netflix 12.99 CNY monthly 2026-06-01`

Interval examples:
- `/add Gym 30 CNY 30d 2026-06-01`
- `/add Hosting 9.99 USD every 4 weeks 2026-06-01`

Note: One-line `/add` does not support spaces in the name.

### `/list`

Displays all subscriptions sorted by next billing date. Each subscription is sent as a separate message with inline buttons: **[查看] [编辑] [删除]**.

### `/view <id>`

Shows full details for a subscription. `id` can be the short ID (first 8 chars) or the full UUID.

### `/edit <id> field value`

**One-line mode**:
```
/edit <id> date|price|cycle <value>
```

Cycle edits support the same fixed cycles and interval formats as `/add`, for example `/edit a1b2c3d4 cycle 30d`.

**Interactive mode**:
Send `/edit` without full arguments, or click **编辑** from a `/list` message. The bot shows an inline keyboard with fields: Name, Price, Currency, Cycle, Next billing date, Cancel. Clicking a field starts the corresponding conversation.

### `/delete <id>`

Deletes a subscription after confirmation. `id` can be short ID or full UUID. Shows a confirmation inline keyboard before deleting.

### `/export`

Returns a JSON export with `version`, `exportedAt`, and `subscriptions`. Sent as a MarkdownV2 code block. Size is limited to ~4000 characters (Telegram message limit). If the export is too large, the bot informs the user.

The export does **not** include `userKey`, raw Telegram ID, `chat_id`, or encrypted payloads.

### `/report`

Generates two PNG image reports from the current subscription list:
- 当前月度支出：monthly-equivalent run rate for subscriptions whose next billing date is within one billing-cycle window from today.
- 当月支出：actual payment amounts due in the current calendar month.
- Per-currency totals and date distribution for each report.

Subscriptions without price or currency, and subscriptions with `custom` billing cycle, are excluded from the calculated total but counted in the report.

Multi-currency conversion uses the manually maintained KV config key `config:exchange-rates:v1`:

```json
{ "base": "CNY", "rates": { "CNY": 1, "USD": 7.2, "EUR": 7.8 } }
```

Currencies missing from the exchange-rate config remain visible in the per-currency section but are not converted into the CNY total.

If PNG generation fails, the bot falls back to a plain-text report.

### `/reminders`

Lists subscriptions with upcoming renewals within the configured reminder window (default 3 days, controlled by `REMINDER_DAYS_AHEAD`).

### `/delete_me`

Requires confirmation via inline keyboard before permanently deleting all user data:
- All subscription records
- User profile
- Associated reminder entries

### `/cancel`

Calls `ctx.conversation.exitAll()`, safely ending all active conversations for the current chat. Safe to use outside of conversations.

## Admin

If `ADMIN_USER_ID` is configured, that Telegram user is marked as admin (`ctx.isAdmin`).
There are no admin-only commands yet, but future commands can gate on this flag.
