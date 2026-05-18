# Privacy

## Data Handling Philosophy

This bot is designed with privacy as a core principle. Plaintext subscription content and Telegram chat IDs are not stored in Cloudflare KV, and raw Telegram user IDs are not used in KV keys.

An operator with direct access to production secrets could decrypt data. The privacy boundary is therefore: KV contents alone are not readable as user data, and routine logs/storage do not expose raw identifiers or plaintext subscription content.

## Encryption

- Subscription details (name, price, currency, category, notes, etc.) are encrypted using AES-GCM before storage.
- User profiles, including `chatId`, are encrypted at rest.
- KV-backed grammY session values are encrypted at rest and expire after 1 hour.
- The `ENCRYPTION_KEY` must be a base64url-encoded 32-byte value and is validated at startup.
- Session encryption derives a per-session AES-GCM key from `ENCRYPTION_KEY` and the hashed session key via HKDF-SHA-256.

## Anonymization

- Telegram user IDs are hashed with HMAC-SHA-256 before use as KV keys.
- This prevents correlation of user identity with stored data based on KV keys alone.
- The derived `userKey` is never logged.

## Storage

- Data is stored in Cloudflare KV.
- KV is eventually consistent and replicated globally.
- No plaintext subscription data is ever written to KV.
- Subscription records include encrypted payloads plus non-secret metadata used for indexing, reminders, and reports.
- Reminder lists are stored by date and contain `{ userKey, subscriptionId }` pairs.
- Session keys are stored as `session:<userKey>` and encrypted session values are automatically expired by KV.

## What the Operator Can See

- Encrypted ciphertext blobs (unreadable without the key)
- Billing dates, cycles, day/week/month/year interval values, status, trial flag, and auto-renewal flag (stored alongside ciphertext for indexing, reminders, and reports)
- Billing anchor day and created/updated timestamps
- Metadata: when a stored profile was created or updated
- Reminder entries per date: a list of `{ userKey, subscriptionId }` pairs (no subscription content)
- Sent markers: simple flags keyed by `userKey + subscriptionId + date` (no sensitive data)
- Encrypted session values under `session:<userKey>` until their 1-hour TTL expires

## What the Operator Cannot See

- Subscription names, prices, currencies, categories, or notes from KV alone
- The user's actual Telegram user ID (only the HMAC hash)
- The user's Telegram chat ID from KV alone

## Data Deletion

Users can delete all their data via `/delete_me`. This removes:
- All subscription records
- User profile
- Associated reminder entries

Before deletion, active conversations are exited. Encrypted KV session data may remain until its 1-hour TTL expires, but it should no longer contain business data after conversations are exited. Sent markers may remain as orphaned keys until they expire or are overwritten, but they contain no subscription content.

## Future Enhancements

- Key rotation support
- Optional client-side encryption for additional privacy
- Automatic data expiration / TTL
