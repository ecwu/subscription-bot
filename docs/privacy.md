# Privacy

## Data Handling Philosophy

This bot is designed with privacy as a core principle. The operator of the bot cannot read your subscription data.

## Encryption

- All subscription details (name, price, notes, etc.) are encrypted using AES-GCM before storage.
- Encryption keys are derived per-user via HKDF-SHA-256 from a master secret.
- Only the user (via Telegram) can trigger operations that decrypt their data.

## Anonymization

- Telegram user IDs are hashed with HMAC-SHA-256 before use as KV keys.
- This prevents correlation of user identity with stored data based on KV keys alone.

## Storage

- Data is stored in Cloudflare KV.
- KV is eventually consistent and replicated globally.
- No plaintext subscription data is ever written to KV.

## What the Operator Can See

- Encrypted ciphertext blobs (unreadable without the key)
- Billing dates and cycles (used for reminders, stored alongside ciphertext)
- Metadata: when a user created their profile, update timestamps

## What the Operator Cannot See

- Subscription names, prices, categories, or notes
- The user's actual Telegram user ID (only the HMAC hash)

## Data Deletion

Users can delete all their data via `/delete_me`. This removes:
- All subscription records
- User profile
- Associated reminder entries

## Future Enhancements

- Key rotation support
- Optional client-side encryption for additional privacy
- Automatic data expiration / TTL
