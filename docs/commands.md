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

### `/delete_me`

Will require confirmation before permanently deleting all user data.

## Admin

If `ADMIN_USER_ID` is configured, only that Telegram user can interact with the bot.
