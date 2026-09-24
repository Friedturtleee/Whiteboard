# Cloud boards setup

The anonymous whiteboard works without cloud configuration. Cloud account and sharing endpoints fail closed until configured.

1. Create a Clerk application and configure its allowed origins for the deployed Pages site and local development.
2. Create a Cloudflare D1 database. Add a `[[d1_databases]]` binding named `DB` to `wrangler.toml` with the database name and ID from Cloudflare.

```toml
[[d1_databases]]
binding = "DB"
database_name = "whiteboard-metadata"
database_id = "<actual-database-id>"
```

Replace the example ID with the value returned by Cloudflare; the Worker intentionally does not contain a fake ID.
3. Apply `migrations/0001_boards.sql` to the local and production D1 databases with Wrangler migrations (or `wrangler d1 execute` for this initial SQL migration).
4. Set Worker secrets `CLERK_SECRET_KEY` and `TICKET_HASH_SECRET` with `wrangler secret put`.
5. Set Worker variable `ALLOWED_ORIGINS` to a comma-separated exact list of origins, including scheme and port where applicable (for example `https://example.pages.dev,http://localhost:8000`). Do not use `*`.
6. Set `js/cloud-config.js` `apiBaseUrl` and Clerk `clerkPublishableKey` for the frontend deployment. The publishable key is public; do not put any Worker secret in this file.
7. Deploy the Worker from `server/` and the static frontend separately. Verify D1 migrations and Worker configuration before inviting users.

Board members can currently be added by an owner's request using the target account's verified email. The target must already have a Clerk account; this flow grants access but does not send an invitation email or create an account.

`TICKET_HASH_SECRET` must be a long random secret. It is used to store one-way hashes of short-lived, single-use WebSocket tickets. Ticket expiration is enforced by the Worker.

The room currently caps each whiteboard at 50 simultaneous WebSocket connections, and each socket is limited to 240 messages and 64 MiB per 60-second connection window (individual messages are capped at 5 MiB). These limits do not replace an HTTP/API rate limit: configure Cloudflare rate limiting for the Worker before exposing it to broad public traffic. Offline editing across a page reload is not guaranteed; export important work as JSON.
