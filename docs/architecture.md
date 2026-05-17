# Architecture

## Overview

The Subscription Bot is a Cloudflare Worker that receives Telegram updates via webhooks, stores encrypted subscription data in Cloudflare KV, and sends reminders via Cron Triggers.

## Components

### Worker Entrypoint (`src/index.ts`)

- `fetch`: Routes HTTP requests to health, webhook, or 404 handlers.
- `scheduled`: Delegates to the reminder service for daily cron processing.

### Bot Layer (`src/bot/`)

- `createBot.ts`: Configures the grammY bot with middleware and commands.
- `commands/`: Placeholder command handlers (`/start`, `/help`, `/add`, etc.).
- `middleware/`: Cross-cutting concerns (auth, error handling, request context).
- `callbacks/`: Inline keyboard callback handlers.
- `keyboards/`: Reusable keyboard builders.

### Handlers (`src/handlers/`)

- `webhook.ts`: Validates Telegram secret token and passes updates to grammY.
- `scheduled.ts`: Placeholder for cron-based reminder processing.
- `health.ts`: Simple health check endpoint.

### Services (`src/services/`)

Business logic layer. Currently stubbed:
- `subscriptionService.ts`: Encrypts/decrypts subscription payloads.
- `reminderService.ts`: Placeholder for reminder dispatch.
- `exportService.ts`: Aggregates user data for export.
- `privacyService.ts`: Handles data deletion.

### Repositories (`src/repositories/`)

Data access layer over Cloudflare KV:
- `subscriptionRepository.ts`: CRUD for subscriptions with index management.
- `userRepository.ts`: User profile storage.
- `reminderRepository.ts`: Reminder list management per date.

### Crypto (`src/crypto/`)

- `encryption.ts`: AES-GCM encrypt/decrypt with Web Crypto.
- `keyDerivation.ts`: HKDF-based key derivation per user.
- `userHash.ts`: HMAC-SHA-256 for deterministic user ID hashing.

### Models & Schemas (`src/models/`, `src/schemas/`)

TypeScript interfaces and Zod schemas for:
- `Subscription` / `StoredSubscription`
- `UserProfile`
- `Reminder`
- Environment validation

### Utils (`src/utils/`)

- `kvKeys.ts`: Pure functions for KV key naming conventions.
- `date.ts`: Date arithmetic helpers.
- `money.ts`: Currency formatting helpers.
- `logger.ts`: Structured JSON logging.
- `errors.ts`: Custom error classes.

## Data Flow

```
Telegram → Webhook → Bot (grammY) → Middleware → Command/Callback
                                         ↓
                                    Service Layer
                                         ↓
                               Repository (KV)
```

## Security

- All subscription payloads are encrypted at the application level before KV storage.
- User IDs are hashed with HMAC before use as KV keys.
- Webhook requests are validated via secret token.
- Admin mode can restrict access to a single Telegram user.
