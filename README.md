# Subscription Bot

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/ecwu/subscription-bot)

A privacy-oriented Telegram bot for managing personal subscription services. Runs on Cloudflare Workers, stores data in Cloudflare KV, encrypts sensitive payloads at the application layer, and hashes Telegram user IDs before using them in storage keys.

## Tech Stack

- **Runtime**: Cloudflare Workers (`nodejs_compat`)
- **Language**: TypeScript (strict)
- **Telegram SDK**: grammY + @grammyjs/conversations
- **Storage**: Cloudflare KV
- **Validation**: Zod
- **Testing**: Vitest
- **Crypto**: Web Crypto API (AES-GCM, HKDF, HMAC-SHA-256)
- **Reports**: SVG + resvg PNG rendering

## Project Structure

```
src/
├── bot/              # Telegram bot setup, commands, conversations, callbacks, keyboards, middleware, KV session storage
├── handlers/         # Worker fetch/scheduled/health handlers
├── services/         # Subscription, reminder, report, export, privacy, Telegram API logic
├── repositories/     # KV storage access layer and config readers
├── crypto/           # Encryption, hashing, key derivation, master key parsing
├── models/           # TypeScript type definitions
├── schemas/          # Zod validation schemas
├── utils/            # Parsers, formatting, date/math helpers, report rendering
└── types/            # Shared Env and grammY context types
```

## Features

- Add subscriptions interactively or with one-line commands.
- Track fixed cycles (`weekly`, `monthly`, `quarterly`, `yearly`), manual `custom` cycles, and interval cycles such as `30d`, `4w`, `6m`, `2y`, `every 30 days`, and `每30天`.
- Mark subscriptions as trial or non-auto-renewing so reports and reminder wording match the real billing state.
- Pause and resume subscriptions from the inline list manager. Paused subscriptions are excluded from reminders, date advancement, and spending reports.
- View compact lists, paginated inline list management, subscription details, JSON export, PNG reports, and text reports.
- Send scheduled renewal reminders through Cloudflare Cron Triggers.

## Development

```bash
# Install dependencies
pnpm install

# Run dev server
pnpm dev

# Push Telegram slash-command menu
pnpm command:push

# Run tests
pnpm test:run

# Type check
pnpm types:check

# Lint
pnpm lint

# Format
pnpm format
```

Before merging a code change, run:

```bash
pnpm types:check
pnpm test:run
pnpm lint
```

## Environment Variables

| Variable | Required | Format / Notes |
|----------|----------|----------------|
| `BOT_TOKEN` | Yes | From @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Yes | High-entropy random string |
| `ENCRYPTION_KEY` | Yes | Base64url-encoded 32-byte value |
| `USER_HASH_SECRET` | Yes | High-entropy random string |
| `ADMIN_USER_ID` | No | Telegram user ID marked as admin |
| `APP_ENV` | No | `development` (default), `production`, `test` |
| `REMINDER_DAYS_AHEAD` | No | Number of days ahead to send renewal reminders (default: 3) |

Secrets belong in `.dev.vars` locally and in Wrangler secrets for production:

```bash
wrangler secret put BOT_TOKEN
wrangler secret put TELEGRAM_WEBHOOK_SECRET
wrangler secret put ENCRYPTION_KEY
wrangler secret put USER_HASH_SECRET
```

## Report Exchange Rates

`/report` generates PNG reports for monthly-equivalent spending, current-month due spending, and future 12-month projected spending. `/report_text` generates a Telegram text version with current-month line items and 12-month projected line items.

Known currencies are converted to CNY using a manually maintained KV config item. Exchange rates are maintained with USD as the base (`1 USD = N currency`), then converted from the source currency to USD and from USD to CNY. Seed or update the fixed key `config:exchange-rates:v1` with JSON like:

```json
{ "base": "USD", "rates": { "USD": 1, "CNY": 7.2, "EUR": 0.923 } }
```

For local `wrangler dev` storage:

```bash
pnpm wrangler kv key put config:exchange-rates:v1 '{"base":"USD","rates":{"USD":1,"CNY":7.2,"EUR":0.923}}' --binding SUBSCRIPTION_KV --local
pnpm wrangler kv key get config:exchange-rates:v1 --binding SUBSCRIPTION_KV --local
```

Missing currencies are shown where possible but are not included in converted CNY totals. Paused subscriptions, trial subscriptions, non-auto-renewing subscriptions, custom cycles, and entries without price/currency are excluded from calculated spending totals.

## Billing Cycles

Subscriptions support fixed cycles (`weekly`, `monthly`, `quarterly`, `yearly`),
`custom` cycles that do not auto-advance, and interval cycles in days, weeks, months, or years. One-line commands accept examples such as `30d`, `4w`, `6m`, `2y`, `every 30 days`, `every 4 weeks`, `every 6 months`, `每30天`, `每4周`, `每6个月`, and `每2年`.

### Generating ENCRYPTION_KEY

The master encryption key must be exactly 32 bytes (256 bits), base64url-encoded:

```bash
node -e "console.log(Buffer.from(crypto.randomBytes(32)).toString('base64url'))"
```

This key is used for application-level encryption. KV-backed session data derives a per-session AES-GCM key from it with HKDF. Never commit it to version control.

## Architecture

See `docs/architecture.md` for system design.

## Privacy

See `docs/privacy.md` for data handling and encryption details.

## Commands

See `docs/commands.md` for the full command reference.

## Scaffold Review

See `docs/scaffold-review.md` for the latest security and correctness audit.
