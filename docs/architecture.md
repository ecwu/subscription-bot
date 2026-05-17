# Architecture

## Overview

The Subscription Bot is a Cloudflare Worker that receives Telegram updates via webhooks, stores encrypted subscription data in Cloudflare KV, and sends reminders via Cron Triggers.

## Components

### Worker Entrypoint (`src/index.ts`)

- `fetch`: Routes HTTP requests to health, webhook, or 404 handlers.
- `scheduled`: Delegates to the reminder service for daily cron processing (`0 8 * * *`).

### Bot Layer (`src/bot/`)

- `createBot.ts`: Configures the grammY bot with middleware, commands, conversations, and callbacks.
- `commands/`: Full command handlers (`/start`, `/help`, `/add`, `/list`, `/view`, `/edit`, `/delete`, `/export`, `/report`, `/reminders`, `/delete_me`, `/cancel`, `/debug_me`).
- `conversations/`: Multi-step interactive flows (`addConversation`, `editFieldConversation`, `editCycleConversation`).
- `callbacks/`: Inline keyboard callback handlers (`sub`, `edit`, `delete`, `privacy`).
- `keyboards/`: Reusable keyboard builders for inline buttons.
- `middleware/`: Cross-cutting concerns (`requestContext`, `auth`, `rateLimit`, `errorHandler`).

### Handlers (`src/handlers/`)

- `webhook.ts`: Validates Telegram secret token and passes updates to grammY.
- `scheduled.ts`: Daily cron handler that loads reminders for the upcoming days and dispatches them via `reminderService`.
- `health.ts`: Simple health check endpoint.

### Services (`src/services/`)

Business logic layer:
- `subscriptionService.ts`: Encrypts/decrypts subscription payloads, manages CRUD, resolves IDs (short/prefix/UUID), and coordinates reminder index updates.
- `reminderService.ts`: Processes daily reminders: loads entries, decrypts subscriptions, sends Telegram messages via `telegramService`, and marks reminders as sent.
- `reportService.ts`: Builds report data (monthly run-rate, per-currency totals, day distribution) and formats text fallback reports.
- `exportService.ts`: Aggregates user data for export.
- `privacyService.ts`: Handles data export and full deletion.
- `telegramService.ts`: Low-level Telegram Bot API client for sending messages.

### Repositories (`src/repositories/`)

Data access layer over Cloudflare KV:
- `subscriptionRepository.ts`: CRUD for subscriptions with index management, plus `rebuildIndex` and `cleanupOrphanedEntries` for repair.
- `userRepository.ts`: User profile storage (encrypted chat ID, first/last seen timestamps).
- `reminderRepository.ts`: Reminder list management per date, plus sent-marker tracking.
- `reportConfigRepository.ts`: Reads exchange-rate config from KV for `/report` currency conversion.

### Crypto (`src/crypto/`)

- `encryption.ts`: AES-GCM encrypt/decrypt with Web Crypto.
- `keyDerivation.ts`: HKDF-based key derivation per user.
- `userHash.ts`: HMAC-SHA-256 for deterministic user ID hashing.
- `masterKey.ts`: Validates and parses the base64url-encoded master key.

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
- `shortId.ts`: Short ID generation (first 8 chars of UUID).
- `commandParser.ts` / `editParser.ts`: Argument parsers for one-line commands.
- `callbackParser.ts`: Typed callback data parsers.
- `formatSubscription.ts`: Human-readable subscription formatting.
- `labels.ts`: Localized labels for billing cycles and other enums.
- `reportPng.ts` / `reportSvg.ts`: Report image rendering.

## Data Flow

### Command Flow

```
Telegram → Webhook → Bot (grammY) → Middleware → Command/Callback
                                          ↓
                                     Service Layer
                                          ↓
                                Repository (KV)
```

### Reminder Flow

```
Cron Trigger → scheduled handler → reminderService
                                        ↓
                              reminderRepository.listEntries(date)
                                        ↓
                              subscriptionRepository.get + decrypt
                                        ↓
                              userRepository.getUserProfile + decrypt
                                        ↓
                              telegramService.sendMessage
                                        ↓
                              reminderRepository.markSent
```

## Security

- All subscription payloads are encrypted at the application level before KV storage.
- User IDs are hashed with HMAC before use as KV keys.
- Webhook requests are validated via secret token.
- Admin mode can restrict access to a single Telegram user.
- Per-isolate in-memory rate limiting is applied to all user requests.
