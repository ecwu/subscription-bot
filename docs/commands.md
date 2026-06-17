# Commands

## User Commands

| Command      | Description                                      | Status        |
|-------------|--------------------------------------------------|---------------|
| `/start`    | Start the bot and show welcome message           | Implemented   |
| `/help`     | Show list of available commands                  | Implemented   |
| `/add`      | Add a new subscription (interactive or one-line) | Implemented   |
| `/list`     | List all your subscriptions in compact text      | Implemented   |
| `/list_full`| List subscriptions with inline action buttons    | Implemented   |
| `/export`   | Export your subscription data as JSON            | Implemented   |
| `/report`   | Generate subscription spending PNG reports       | Implemented   |
| `/report_text` | Generate text spending detail report         | Implemented   |
| `/reminders`| Show upcoming renewals within reminder window    | Implemented   |
| `/settings` | Configure reminder and report defaults           | Implemented   |
| `/delete_me`| Delete all your data from the bot                | Implemented   |

## Development Commands

| Command      | Description                                      | Availability  |
|-------------|--------------------------------------------------|---------------|
| `/debug_me` | Show sanitized diagnostic info                   | Dev/Test only |

`/debug_me` is only registered when `APP_ENV !== "production"`. It never exposes raw Telegram user IDs, usernames, message text, or secrets.

## Admin Commands

| Command      | Description                                      | Availability  |
|-------------|--------------------------------------------------|---------------|
| `/diagnosis`| Check runtime configuration presence and validity | Admin only    |
| `/admin_reminders` | Show reminder timezone distribution       | Admin only    |

## Command Details

### `/start`

Shows a welcome message with the persistent reply keyboard. First-time users are prompted to add their first subscription and can use the bottom menu buttons. Returning users see a shorter welcome message with the same persistent menu.

### `/add`

**Interactive mode** (no arguments):
1. Asks for subscription name (non-empty).
2. Asks for price. Enter a number or tap **跳过价格** to leave unset. The old `skip` text is still accepted for compatibility.
3. Select currency via inline keyboard (includes common currencies + **其他** for custom input, with a back button from custom input).
4. Select billing cycle via inline keyboard: Weekly, Monthly, Quarterly, Yearly, Custom, or Advanced interval.
   Advanced interval first offers common presets such as 30 days, 4 weeks, 6 months, and 1 year. **其他** accepts day/week/month/year intervals such as `every 30 days`, `every 4 weeks`, `every 6 months`, `30d`, `4w`, `6m`, `2y`, `每30天`, `每4周`, `每6个月`, or `每2年`.
5. Select next billing date via inline calendar keyboard with month and year navigation.
6. Confirm the generated future billing-date preview, or go back to change the cycle/date.
7. Mark whether the subscription is a trial.
8. Mark whether it auto-renews.
9. Review summary with Confirm/Cancel buttons.

If the user sends `/cancel` at any step, the conversation exits immediately and **no partial subscription is saved**.

**One-line mode**:
```
/add <name> <price> <currency> <cycle> <date>
```
Example: `/add Netflix 12.99 CNY monthly 2026-06-01`

Interval examples:
- `/add Gym 30 CNY 30d 2026-06-01`
- `/add Hosting 9.99 USD every 4 weeks 2026-06-01`
- `/add Domain 80 CNY 2y 2026-06-01`

One-line `/add` always creates an active, paid, auto-renewing subscription. It does not support spaces in the name; use interactive `/add` for names with spaces, trial flags, or non-auto-renewing subscriptions.

### `/list`

Displays all subscriptions sorted by status and next billing date as compact text. Active subscriptions are shown before paused subscriptions. Each line shows name, price, billing cycle, type/status markers, and the next relevant date as a relative day count.

### `/list_full`

Displays a paginated inline list manager. Each page shows up to 8 subscriptions as buttons. Selecting a subscription opens a detail view with actions:
- Edit
- Delete
- Pause or Resume
- Mark or unmark trial
- Enable or disable auto-renewal
- Back to list

The edit menu supports name, price, currency, cycle, and next billing date.

**Interactive mode**:
Click **编辑** from a `/list_full` detail view. The bot shows an inline keyboard with fields: Name, Price, Currency, Cycle, Next billing date, and Back. Text/date/cycle edits start conversations. Price can be skipped with a button in `/add`; currency custom input can return to the picker; advanced cycle intervals offer presets before custom text input. Trial and auto-renewal are direct actions on the detail view.

The detail view also supports deleting, pausing, and resuming a subscription without typed IDs. Delete shows a confirmation inline keyboard before deleting. Pause happens immediately. Resume starts a short confirmation/date conversation.

Paused subscriptions remain stored and visible, but are excluded from:
- Scheduled reminders
- Automatic past-due date advancement
- Spending reports

The resume conversation shows inline buttons to resume with the existing date, open the shared date picker, or cancel. The user may also type a new date in `YYYY-MM-DD` format. The subscription is then marked active and re-added to the reminder index. Resume does not change trial or auto-renewal flags; if either flag is retained, the bot says so before and after restoring the subscription.

### `/export`

Returns a JSON export with `version`, `exportedAt`, and `subscriptions`. Sent as a MarkdownV2 code block. Size is limited to ~4000 characters (Telegram message limit). If the export is too large, the bot informs the user.

The export does **not** include `userKey`, raw Telegram ID, `chat_id`, or encrypted payloads. Export version `2` includes status, trial, auto-renewal, billing anchor, and interval metadata on subscriptions.

### `/report`

Generates PNG image reports from the current subscription list:
- 未来 30 天摊平支出：monthly-equivalent run rate for subscriptions with an actual payment due from today through the next 30 days.
- 未来 30 天支出：actual payment amounts due from today through the next 30 days.
- 年度预期支出：projected actual charges over the next 12 months.
- Per-currency totals and date/month distribution for each report.

Subscriptions without price or currency, and subscriptions with `custom` billing cycle, are excluded from the calculated total but counted in the report. Trial subscriptions and subscriptions with auto-renewal disabled are also excluded from spending totals and surfaced as excluded counts.

Multi-currency conversion uses the manually maintained KV config key `config:exchange-rates:v1`:

```json
{ "base": "USD", "rates": { "USD": 1, "CNY": 7.2, "EUR": 0.923 } }
```

Rates are maintained with USD as the exchange-rate base (`1 USD = N currency`). Report totals use the user's default currency from `/settings`: source currency amounts are converted to USD first, then from USD to that default currency. Currencies missing from the exchange-rate config remain visible in the per-currency section but are not converted into the default-currency total.

If PNG generation fails, the bot falls back to a plain-text report.

### `/report_text`

Generates a text report split into Telegram-safe message chunks:
- Upcoming 30-day due line items, sorted by billing date.
- Converted upcoming 30-day total in the user's default currency.
- Future 12-month projection grouped by month.
- Trial and non-auto-renewing counts excluded from totals.

### `/reminders`

Lists subscriptions with upcoming renewals within the configured reminder window (default 3 days, controlled by `REMINDER_DAYS_AHEAD`).
Paused subscriptions are excluded. Trial subscriptions and non-auto-renewing subscriptions are included when their date is within the window. Scheduled reminder messages use trial-expiration or service-expiration wording; after the scheduled task sends the due-date service-expiration reminder for a non-auto-renewing subscription, it automatically marks that subscription as paused. This command uses the compact list label `扣款日`.

Scheduled reminder messages include an inline **已续费一个周期** action when the bot can calculate the next billing date. It advances that subscription by one cycle, updates the reminder index, and ignores stale clicks from older reminder messages.

### `/settings`

Starts the settings conversation for:
- Default report currency
- Reminder enablement
- Reminder hour
- Timezone, using supported IANA timezones or custom UTC offsets such as `+8`, `-5`, and `+5:30`

Settings are stored in the encrypted user profile. Defaults are `USD`, reminders enabled, `09:00`, and `UTC`.

### `/delete_me`

Requires confirmation via inline keyboard before permanently deleting all user data:
- All subscription records
- User profile
- Associated reminder entries

### Cancelling Conversations

During active conversations, sending `/cancel` or `取消` aborts the current flow without saving partial input.

## Admin

If `ADMIN_USER_ID` is configured, that Telegram user is marked as admin (`ctx.isAdmin`).
Admin-only commands reject all other users.

### `/diagnosis`

Checks whether required runtime configuration and report currency constants are present and valid:
- `BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `ENCRYPTION_KEY`
- `USER_HASH_SECRET`
- `ADMIN_USER_ID`
- `SUBSCRIPTION_KV`
- `APP_ENV`
- `REMINDER_DAYS_AHEAD`
- `EXCHANGE_RATE_BASE_CURRENCY`
- `DEFAULT_REPORT_CURRENCY`
- KV config `config:exchange-rates:v1`

There is no global currency environment variable. User default currency is stored per user in encrypted profile settings, and report exchange rates are stored in KV at `config:exchange-rates:v1`. `/diagnosis` checks the static report currency constants and validates the KV exchange-rate config when the KV binding is available.

The report only includes status and validation messages. It never prints secret values, raw Telegram user IDs, usernames, message text, chat IDs, `userKey`, or exchange-rate values.

### `/admin_reminders`

Scans upcoming reminder index entries and reports timezone distribution for users with reminders enabled. It is intended for operational checks and does not expose raw user IDs or subscription details.
