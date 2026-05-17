# Commands

## User Commands

| Command      | Description                                      | Status        |
|-------------|--------------------------------------------------|---------------|
| `/start`    | Start the bot and show welcome message           | Placeholder   |
| `/help`     | Show list of available commands                  | Placeholder   |
| `/add`      | Add a new subscription                           | Placeholder   |
| `/list`     | List all your subscriptions                      | Placeholder   |
| `/delete`   | Delete a specific subscription                   | Placeholder   |
| `/export`   | Export your subscription data                    | Placeholder   |
| `/report`   | Generate a monthly run-rate PNG report           | Implemented   |
| `/delete_me`| Delete all your data from the bot                | Placeholder   |

## Development Commands

| Command      | Description                                      | Availability  |
|-------------|--------------------------------------------------|---------------|
| `/debug_me` | Show sanitized diagnostic info                   | Dev/Test only |

`/debug_me` is only registered when `APP_ENV !== "production"`. It never exposes raw Telegram user IDs, usernames, message text, or secrets.

## Planned Interactions

### `/add`

Will collect:
- Subscription name
- Price (optional)
- Currency (optional)
- Billing cycle (monthly, yearly, quarterly, weekly)
- Next billing date
- Category (optional)
- Note (optional)

### `/list`

Will display subscriptions with:
- Name and price
- Days until next billing
- Category

### `/delete`

Will show inline keyboard with subscription list, followed by confirmation.

### `/export`

Will generate a JSON export of all decrypted subscription data.

### `/report`

Generates a PNG report from the current subscription list. It shows monthly
run-rate spending, per-currency totals, and monthly date distribution. It does
not use or imply historical payment data.

Multi-currency conversion uses the manually maintained KV config key
`config:exchange-rates:v1`:

```json
{ "base": "CNY", "rates": { "CNY": 1, "USD": 7.2, "EUR": 7.8 } }
```

Subscriptions without price or currency, and subscriptions with `custom` billing
cycle, are excluded from the calculated total and counted in the report.
Currencies missing from the exchange-rate config remain visible in the
per-currency section but are not converted into the CNY total.

### `/delete_me`

Will require confirmation before permanently deleting all user data.

## Admin

If `ADMIN_USER_ID` is configured, that Telegram user is marked as admin (`ctx.isAdmin`).
There are no admin-only commands yet, but future commands can gate on this flag.
