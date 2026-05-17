# Subscription Bot

A privacy-oriented Telegram bot for managing personal subscription services. Runs on Cloudflare Workers with application-level encryption.

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Language**: TypeScript
- **Telegram SDK**: grammY
- **Storage**: Cloudflare KV
- **Validation**: Zod
- **Testing**: Vitest
- **Crypto**: Web Crypto API

## Project Structure

```
src/
├── bot/          # Telegram bot setup, commands, middleware
├── handlers/     # Worker fetch/scheduled handlers
├── services/     # Business logic placeholders
├── repositories/ # KV storage access layer
├── crypto/       # Encryption, hashing, key derivation
├── models/       # TypeScript type definitions
├── schemas/      # Zod validation schemas
├── utils/        # Helpers and utilities
└── types/        # Shared type definitions
```

## Development

```bash
# Install dependencies
pnpm install

# Run dev server
pnpm dev

# Run tests
pnpm test

# Type check
pnpm types:check

# Lint
pnpm lint

# Format
pnpm format
```

## Environment Variables

| Variable | Required | Format / Notes |
|----------|----------|----------------|
| `BOT_TOKEN` | Yes | From @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Yes | High-entropy random string |
| `ENCRYPTION_KEY` | Yes | Base64url-encoded 32-byte value |
| `USER_HASH_SECRET` | Yes | High-entropy random string |
| `ADMIN_USER_ID` | No | Restrict bot to one Telegram user ID |
| `APP_ENV` | No | `development` (default), `production`, `test` |

### Generating ENCRYPTION_KEY

The master encryption key must be exactly 32 bytes (256 bits), base64url-encoded:

```bash
node -e "console.log(Buffer.from(crypto.randomBytes(32)).toString('base64url'))"
```

This key is used with HKDF to derive per-user encryption keys. Never commit it to version control.

## Architecture

See `docs/architecture.md` for system design.

## Privacy

See `docs/privacy.md` for data handling and encryption details.

## Commands

See `docs/commands.md` for the full command reference.

## Scaffold Review

See `docs/scaffold-review.md` for the latest security and correctness audit.
