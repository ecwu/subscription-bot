# Commands

## User Commands

| Command      | Description                                      | Status        |
|-------------|--------------------------------------------------|---------------|
| `/start`    | Start the bot and show welcome message           | Implemented   |
| `/help`     | Show list of available commands                  | Implemented   |
| `/add`      | Add a new subscription (interactive or one-line) | Implemented   |
| `/list`     | List all your subscriptions in compact text      | Implemented   |
| `/list_full`| List subscriptions with inline action buttons    | Implemented   |
| `/view`     | View subscription details by ID                  | Implemented   |
| `/edit`     | Edit a subscription field (interactive or one-line) | Implemented |
| `/delete`   | Delete a specific subscription                   | Implemented   |
| `/pause`    | Pause a subscription                             | Implemented   |
| `/resume`   | Resume a paused subscription                     | Implemented   |
| `/export`   | Export your subscription data as JSON            | Implemented   |
| `/report`   | Generate subscription spending PNG reports       | Implemented   |
| `/report_text` | Generate text spending detail report         | Implemented   |
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
   Advanced interval accepts day/week/month/year intervals such as `every 30 days`, `every 4 weeks`, `every 6 months`, `30d`, `4w`, `6m`, `2y`, `每30天`, `每4周`, `每6个月`, or `每2年`.
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

### `/view <id>`

Shows full details for a subscription. `id` can be the short ID (first 8 chars), a unique UUID prefix, or the full UUID. If a prefix is ambiguous, the bot asks for the full ID.

### `/edit <id> field value`

**One-line mode**:
```
/edit <id> date <YYYY-MM-DD>
/edit <id> price <amount> <currency>
/edit <id> cycle <value>
```

Cycle edits support the same fixed cycles and interval formats as `/add`, for example `/edit a1b2c3d4 cycle 30d`.

**Interactive mode**:
Click **编辑** from a `/list_full` detail view. The bot shows an inline keyboard with fields: Name, Price, Currency, Cycle, Next billing date, and Back. Text/date/cycle edits start conversations. Trial and auto-renewal are direct actions on the detail view.

### `/delete <id>`

Deletes a subscription after confirmation. `id` can be short ID, a unique UUID prefix, or full UUID. Shows a confirmation inline keyboard before deleting.

### `/pause <id>`

Pauses a subscription. Paused subscriptions remain stored and visible, but are excluded from:
- Scheduled reminders
- Automatic past-due date advancement
- Spending reports

Paused subscriptions can be restored with `/resume <id>` or the `/list_full` detail view.

### `/resume <id>`

Starts a short resume conversation for a paused subscription. The user can confirm the existing next billing date by replying `正确`, `确认`, `yes`, or `y`, or type a new date in `YYYY-MM-DD` format. The subscription is then marked active and re-added to the reminder index.

### `/export`

Returns a JSON export with `version`, `exportedAt`, and `subscriptions`. Sent as a MarkdownV2 code block. Size is limited to ~4000 characters (Telegram message limit). If the export is too large, the bot informs the user.

The export does **not** include `userKey`, raw Telegram ID, `chat_id`, or encrypted payloads. Export version `2` includes status, trial, auto-renewal, billing anchor, and interval metadata on subscriptions.

### `/report`

Generates PNG image reports from the current subscription list:
- 月度摊平支出：monthly-equivalent run rate for subscriptions whose next billing date is within one billing-cycle window from today.
- 当月支出：actual payment amounts due in the current calendar month.
- 年度预期支出：projected actual charges over the next 12 months.
- Per-currency totals and date/month distribution for each report.

Subscriptions without price or currency, and subscriptions with `custom` billing cycle, are excluded from the calculated total but counted in the report. Trial subscriptions and subscriptions with auto-renewal disabled are also excluded from spending totals and surfaced as excluded counts.

Multi-currency conversion uses the manually maintained KV config key `config:exchange-rates:v1`:

```json
{ "base": "CNY", "rates": { "CNY": 1, "USD": 7.2, "EUR": 7.8 } }
```

Currencies missing from the exchange-rate config remain visible in the per-currency section but are not converted into the CNY total.

If PNG generation fails, the bot falls back to a plain-text report.

### `/report_text`

Generates a text report split into Telegram-safe message chunks:
- Current-month due line items, sorted by billing day.
- Converted current-month total in CNY.
- Future 12-month projection grouped by month.
- Trial and non-auto-renewing counts excluded from totals.

### `/reminders`

Lists subscriptions with upcoming renewals within the configured reminder window (default 3 days, controlled by `REMINDER_DAYS_AHEAD`).
Paused subscriptions are excluded. Trial subscriptions and non-auto-renewing subscriptions are included when their date is within the window. Scheduled reminder messages use trial-expiration or service-expiration wording; after the scheduled task sends the due-date service-expiration reminder for a non-auto-renewing subscription, it automatically marks that subscription as paused. This command uses the compact list label `扣款日`.

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
