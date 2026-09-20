# Email delivery options for sending a prescription link

Research ticket: [GitHub issue #37](https://github.com/) — "Which email transport should we use to send a prescription from this Cloudflare Workers (vinext) app to a patient's email address, as a message containing a hosted link to the locked PDF?"

Scope note: this document answers only the transport question. It does **not** decide how the PDF is stored, how the lock/token works, or where the hosted URL lives. Those are separate tickets.

## Question

The app is a Cloudflare Workers-hosted vinext application (deployed with `wrangler`, D1 binding, no custom domain configured in `wrangler.jsonc`). We need to send a transactional email to a patient containing a **hosted link** to a locked PDF, from inside a Worker request handler. This document compares:

1. Cloudflare Email Service / Email Routing `send_email` binding
2. Resend
3. SendGrid (Twilio SendGrid)
4. Postmark

on: outbound sending from a Worker, hosted-link vs. attachment support, free/low-volume pricing and account requirements, deliverability and DNS setup, fit with a credential-free demo, and how sending is triggered or queued (async / `waitUntil`).

Every decision-relevant claim below is cited inline to the primary source (vendor docs or API reference). Where a claim is an inference rather than a documented fact, it is labelled **[inference]**.

---

## Option 1: Cloudflare Email Service / Email Routing `send_email` binding

Cloudflare now exposes outbound sending through what the docs call **Email Service** (the old Email Routing "send email from a Worker" page now redirects into it). A Worker sends with a `send_email` binding through either the structured `send()` builder or the legacy `EmailMessage` MIME API ([Workers API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/)).

### How sending works

- Add `"send_email": [{ "name": "EMAIL" }]` to the Wrangler config, then call `await env.EMAIL.send({ to, from, subject, html, text })`; the structured builder also accepts `attachments`, `cc`, `bcc`, `replyTo`, and custom `headers` ([Workers API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/)).
- The legacy API (`new EmailMessage(from, to, rawMime)` from `cloudflare:email`) is still supported for raw RFC 5322 MIME ([Workers API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/)).
- Bindings can be restricted by `destination_address`, `allowed_destination_addresses`, and `allowed_sender_addresses`; the sender must always belong to a domain onboarded to Email Service ([Configure send bindings](https://developers.cloudflare.com/email-service/configuration/send-bindings/)).
- Errors are thrown as `Error` objects with a `code` such as `E_SENDER_NOT_VERIFIED`, `E_RATE_LIMIT_EXCEEDED`, `E_DAILY_LIMIT_EXCEEDED`, `E_CONTENT_TOO_LARGE` ([Workers API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/)).

### Hosted link vs. attachment

- A hosted link is just an `<a href>` in the `html` body — nothing transport-specific is needed.
- Native attachments are supported: base64/`ArrayBuffer` `content`, `filename`, `type`, and `disposition: "attachment" | "inline"` ([Workers API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/)).
- Limits: **5 MiB total message size including attachments** (25 MiB when sending only to verified destination addresses), max **32 attachments**, max **50 recipients**, 16 KB of custom headers ([Limits](https://developers.cloudflare.com/email-service/platform/limits/)).
- Local `wrangler dev` cannot serialise `ArrayBuffer` attachment content; binary attachments must be tested on a deployed Worker ([Local development — sending](https://developers.cloudflare.com/email-service/local-development/sending/)).

### Pricing and account requirements

- Sending **to arbitrary recipients requires the Workers Paid plan**: 3,000 outbound emails/month included, then $0.35 per 1,000 ([Pricing](https://developers.cloudflare.com/email-service/platform/pricing/)).
- Sending to **verified destination addresses** in the account is **free on all plans, including Workers Free with only Email Routing configured**, and does not count against quota or daily limits ([Pricing](https://developers.cloudflare.com/email-service/platform/pricing/), [Routing rules and addresses](https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/)).
- Requires **Cloudflare DNS** and an onboarded domain ([Send emails](https://developers.cloudflare.com/email-service/get-started/send-emails/)).
- Before a sending domain is onboarded you can only send to verified destination addresses; after onboarding you can send to any recipient. You can only send **from** your routing domains ([Limits](https://developers.cloudflare.com/email-service/platform/limits/)).
- New accounts start with a conservative **daily** quota that scales with sending behaviour and standing; higher limits require the Limit Increase Request Form ([Limits](https://developers.cloudflare.com/email-service/platform/limits/)).

### Deliverability and DNS

- Onboarding a sending domain automatically adds, on the `cf-bounce` subdomain: MX for bounces, an SPF TXT, a DKIM TXT, and a DMARC TXT on `_dmarc.<domain>` ([Domain configuration](https://developers.cloudflare.com/email-service/configuration/domains/)).
- Email Routing has separate root-domain MX/SPF/DKIM records and its own DKIM selector ([Domain configuration](https://developers.cloudflare.com/email-service/configuration/domains/)).
- DNS changes typically complete in 5–15 minutes but can take up to 24 hours ([Send emails](https://developers.cloudflare.com/email-service/get-started/send-emails/)).

### Credential-free demo fit

- **Best of the four.** With `wrangler dev` and no `remote` flag, the email binding is **simulated locally**: nothing is sent, and the message content is logged to the console and written to local files for inspection ([Local development — sending](https://developers.cloudflare.com/email-service/local-development/sending/)).
- Setting `remote: true` makes local code send real emails through Email Service — useful, but requires a real Cloudflare account and domain ([Local development — sending](https://developers.cloudflare.com/email-service/local-development/sending/), [Send emails](https://developers.cloudflare.com/email-service/get-started/send-emails/)).

### Triggering / queueing / async

- `send()` returns a `Promise`; await it before returning if the response depends on it.
- For fire-and-forget sends after a response, `ctx.waitUntil()` extends the invocation, but only for **up to 30 seconds after the response is sent** and that budget is shared across all `waitUntil` calls in the request ([Context (ctx)](https://developers.cloudflare.com/workers/runtime-apis/context/)).
- For work that may exceed the `waitUntil` window, Cloudflare recommends a Queue with a separate consumer Worker; Queues add reliable delivery and automatic retries ([Context (ctx)](https://developers.cloudflare.com/workers/runtime-apis/context/)).
- Note: outbound sends from a Worker appear as **dropped** in the Email Routing summary even when delivered; use Email sending metrics/logs instead ([Limits](https://developers.cloudflare.com/email-service/platform/limits/)).

### Pros

- Native binding, no third-party SDK, no API key to hold in Worker secrets.
- True offline/credential-free local simulation for the demo.
- DNS (SPF/DKIM/DMARC) auto-configured when the domain is onboarded.

### Cons

- Arbitrary recipients require **Workers Paid**; free tier only reaches verified destination addresses.
- Requires a domain on **Cloudflare DNS** and an onboarded sending/routing domain.
- New-account daily quota ramps up and may be too low for a demo without a limit-increase request.
- Binary attachments can't be exercised in local dev.

---

## Option 2: Resend

### How sending works

- HTTP API `POST https://api.resend.com/emails` with `Authorization: Bearer re_...`, or the official Node SDK `resend.emails.send(...)` ([Send with Cloudflare Workers](https://resend.com/docs/send-with-cloudflare-workers), [Send Email API ref](https://resend.com/docs/api-reference/emails/send-email)).
- Resend publishes a dedicated Cloudflare Workers guide, and its Workers example uses the Node SDK directly in a `fetch` handler ([Send with Cloudflare Workers](https://resend.com/docs/send-with-cloudflare-workers), [example repo](https://github.com/resend/resend-cloudflare-workers-example)).

### Hosted link vs. attachment

- The body is arbitrary `html`/`text`, so a hosted link is trivial.
- Attachments: `attachments[]` with `content` (Buffer/base64), `filename`, `content_type`, and `content_id` for inline; **max 40 MB per email after base64 encoding** ([Send Email API ref](https://resend.com/docs/api-reference/emails/send-email)).
- The attachment schema also accepts a `path` — "Path where the attachment file is hosted" — i.e. Resend can fetch a hosted file and attach it ([Send Email API ref](https://resend.com/docs/api-reference/emails/send-email)). This is an attachment fetched from a URL, not a link in the body.

### Pricing and account requirements

- Free: **3,000 emails/month, limited to 100/day**, 3 domains; Pro from $20/mo for 50,000 ([Resend Pricing](https://resend.com/pricing)).
- Requires an API key and a **verified domain** to send to arbitrary recipients ([Verified Domains](https://resend.com/docs/dashboard/domains/introduction), [Send with Cloudflare Workers](https://resend.com/docs/send-with-cloudflare-workers)).
- No need to pre-create a sender address: after verifying a domain you can send from any address at that domain ([Sender email addresses](https://resend.com/docs/knowledge-base/how-do-I-create-an-email-address-or-sender-in-resend)).
- Rate limit: default **10 requests/second per team**; 429 on exceed ([Send with Cloudflare Workers](https://resend.com/docs/send-with-cloudflare-workers)).

### Deliverability and DNS

- Add and verify the domain with DKIM/SPF records (TXT and MX or CNAME); do not proxy the CNAME (Cloudflare "orange cloud" breaks verification) ([Add and verify a domain](https://resend.com/docs/add-a-domain)).
- Verification usually completes within 15 minutes, occasionally up to 72 hours ([Add and verify a domain](https://resend.com/docs/add-a-domain)).
- Resend recommends sending from a subdomain to isolate reputation ([Verified Domains](https://resend.com/docs/dashboard/domains/introduction)).

### Credential-free demo fit

- **Weak.** There is no offline/sandbox delivery mode. Without a verified domain you can only use `onboarding@resend.dev` **to your own account email**; sending to anyone else returns `403` ([403 Error Using resend.dev Domain](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain), [Errors](https://resend.com/docs/api-reference/errors)).
- Resend provides test recipient addresses (`delivered@`, `bounced@`, `complained@`, `suppressed@resend.dev`) that simulate events but still count against quota and still require a real API key ([Send Test Emails](https://resend.com/docs/dashboard/emails/send-test-emails)).

### Triggering / queueing / async

- Synchronous HTTP call returning `{ data: { id } }` or `{ data: null, error }` ([Send Email API ref](https://resend.com/docs/api-reference/emails/send-email)).
- Supports `scheduled_at` (up to 30 days) and an `Idempotency-Key` header (unique per request, expires after 24 hours) to make retries safe ([Send Email API ref](https://resend.com/docs/api-reference/emails/send-email), [Send with Cloudflare Workers](https://resend.com/docs/send-with-cloudflare-workers)).
- In a Worker, wrap the call in `ctx.waitUntil()` for after-response sending, subject to the same 30-second limit ([inference] from the HTTP model plus [Cloudflare Context API](https://developers.cloudflare.com/workers/runtime-apis/context/)).

### Pros

- Clean Worker integration with an official guide.
- Generous free tier (3,000/month) and simple permissive pricing.
- `scheduled_at` and idempotency keys built in.

### Cons

- Needs an API key (third-party secret) and a verified domain.
- No offline mode; can't run the demo's send path without credentials.
- 10 req/s team rate limit.

---

## Option 3: SendGrid (Twilio SendGrid)

### How sending works

- HTTP API `POST https://api.sendgrid.com/v3/mail/send`, `Authorization: Bearer <API key>`, JSON body with `personalizations`, `from`, `subject`, `content`, `attachments` ([Mail Send API ref](https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send)).
- Returns `202 Accepted` on success; error bodies are JSON `errors[]` ([Mail Send API ref](https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send)).
- The docs describe the endpoint as a Web API for global and EU subusers; being an HTTP+token API, it is callable from any fetch-capable runtime including a Worker **[inference]** ([Mail Send API ref](https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send)). No official SendGrid-on-Cloudflare-Workers guide was found.

### Hosted link vs. attachment

- Body is arbitrary `content[]` with MIME types, so a hosted link is trivial.
- Attachments: base64 `content` plus `filename`, `type`, `disposition` (`inline`/`attachment`), `content_id` ([Mail Send API ref](https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send)).
- `mail_settings.sandbox_mode.enable` validates a request **without delivering** it ([Mail Send API ref](https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send)).
- `send_at` schedules up to **72 hours** in advance; `batch_id` groups scheduled sends for pause/cancel ([Mail Send API ref](https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send)).

### Pricing and account requirements

- Free trial: **100 emails/day for 60 days**, no credit card; paid Essentials starts at $19.95/mo ([Email API pricing](https://www.twilio.com/en-us/products/email-api/pricing)).
- The pricing FAQ states that after creating a sender identity you can send **100 emails per day on the free plan**; overage rates apply on paid plans ([Email API pricing](https://www.twilio.com/en-us/products/email-api/pricing)).
- Requires a **verified sender identity** — either Single Sender Verification or domain authentication ([Authenticate a single sender](https://www.twilio.com/docs/sendgrid/ui/sending-email/sender-verification)).

### Deliverability and DNS

- Domain authentication adds CNAME/TXT (automated security) or MX/TXT (manual) records for SPF/DKIM/DMARC; verification can take up to 48 hours ([Configure domain authentication](https://www.twilio.com/docs/sendgrid/ui/account-and-settings/how-to-set-up-domain-authentication)).
- Domain authentication removes the `via sendgrid.net` tagline and improves inbox placement ([Configure domain authentication](https://www.twilio.com/docs/sendgrid/ui/account-and-settings/how-to-set-up-domain-authentication)).
- Single Sender Verification warns against using some large inbox provider addresses because of DMARC ([Authenticate a single sender](https://www.twilio.com/docs/sendgrid/ui/sending-email/sender-verification)).

### Credential-free demo fit

- **Weak.** No offline mode. `sandbox_mode` validates the payload without sending, but still requires a real account and API key ([Mail Send API ref](https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send)).
- The free trial still requires sign-up ([Email API pricing](https://www.twilio.com/en-us/products/email-api/pricing)).

### Triggering / queueing / async

- Synchronous HTTP POST returning `202`; scheduling via `send_at` (max 72 h) and `batch_id` ([Mail Send API ref](https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send)).
- In a Worker, use `ctx.waitUntil()` for after-response sending, subject to the 30-second limit ([inference] from the HTTP model plus [Cloudflare Context API](https://developers.cloudflare.com/workers/runtime-apis/context/)).

### Pros

- Mature deliverability tooling, analytics, event webhooks.
- Payload sandbox mode for validating requests.
- `send_at`/`batch_id` scheduling.

### Cons

- Free tier is a **60-day trial** rather than a permanent free allowance on the API plan; ongoing free sending is uncertain from the pricing page.
- Needs API key and sender/domain authentication before sending.
- No offline mode; more account setup than Resend.
- No first-party Cloudflare Workers guide found.

---

## Option 4: Postmark

### How sending works

- HTTP API `POST https://api.postmarkapp.com/email` with `X-Postmark-Server-Token`; or SMTP; or official SDKs ([Email API ref](https://postmarkapp.com/developer/api/email-api)).
- `From` must have a **registered and confirmed Sender Signature** ([Email API ref](https://postmarkapp.com/developer/api/email-api)).
- Batch endpoint `/email/batch` accepts up to **500 messages** and **50 MB payload including attachments** ([Email API ref](https://postmarkapp.com/developer/api/email-api)).

### Hosted link vs. attachment

- Body is `HtmlBody`/`TextBody`, so a hosted link is trivial.
- Attachments: `Attachments[]` with `Name`, base64 `Content`, `ContentType`, optional `ContentID` for inline ([Email API ref](https://postmarkapp.com/developer/api/email-api)).
- Single-message and batch endpoints; batch errors are per-message and still return HTTP 200 ([Email API ref](https://postmarkapp.com/developer/api/email-api)).

### Pricing and account requirements

- Free Developer plan: **100 emails/month, no overages**, never expires; Basic from **$15/mo for 10,000**, unlimited/day ([Postmark Pricing](https://postmarkapp.com/pricing)).
- There is **no tier between 100/month and 10,000/month** ([Postmark Pricing](https://postmarkapp.com/pricing)).
- Requires an account and a server token; account-management endpoints need the account token, which is owner-only ([Managing your account](https://postmarkapp.com/developer/user-guide/managing-your-account)).
- Sender signatures and servers are account-level; DKIM setup and SPF verification are managed there ([Managing your account](https://postmarkapp.com/developer/user-guide/managing-your-account)).

### Deliverability and DNS

- DKIM, SPF, and DMARC authentication are included on all tiers ([Postmark Pricing](https://postmarkapp.com/pricing)).
- `From` requires a confirmed Sender Signature ([Email API ref](https://postmarkapp.com/developer/api/email-api)).
- Message Streams separate transactional from broadcast mail ([Postmark Pricing](https://postmarkapp.com/pricing)).

### Credential-free demo fit

- **Weak.** Sandbox **Servers** black-hole messages so nothing reaches a real inbox, and messages appear as Delivered in the UI/webhooks — but this requires a real account/server and **still counts toward the monthly sending volume** ([Sandbox mode](https://postmarkapp.com/developer/user-guide/sandbox-mode), [Server sandbox mode](https://postmarkapp.com/developer/user-guide/sandbox-mode/server-sandbox-mode)).
- There is no credential-free local mode.

### Triggering / queueing / async

- Synchronous HTTP API; scheduled-sending is not documented on the single-email endpoint (unlike Resend/SendGrid) ([Email API ref](https://postmarkapp.com/developer/api/email-api)).
- In a Worker, use `ctx.waitUntil()` for after-response sending, subject to the 30-second limit ([inference] from the HTTP model plus [Cloudflare Context API](https://developers.cloudflare.com/workers/runtime-apis/context/)).

### Pros

- Strong deliverability reputation and simple two-tier pricing.
- Free tier never expires (but only 100/month).
- Batch endpoint handles 500 messages per call.

### Cons

- Free allowance is very small (100/month).
- No free tier between 100 and 10,000/month.
- Requires confirmed Sender Signature and account/server setup.
- No credential-free mode; sandbox still consumes quota.

---

## Comparison table

| Dimension | Cloudflare Email Service / Email Routing | Resend | SendGrid | Postmark |
| --- | --- | --- | --- | --- |
| Send from a Worker | Native `send_email` binding ([docs](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/)) | REST/SDK; official Workers guide ([docs](https://resend.com/docs/send-with-cloudflare-workers)) | REST `v3/mail/send` ([docs](https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send)) | REST `/email` ([docs](https://postmarkapp.com/developer/api/email-api)) |
| Hosted link in body | Any HTML ([docs](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/)) | Any HTML ([docs](https://resend.com/docs/api-reference/emails/send-email)) | Any HTML ([docs](https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send)) | Any HTML ([docs](https://postmarkapp.com/developer/api/email-api)) |
| Attachment support | Base64, 5 MiB total (25 MiB verified dest.), 32 max ([limits](https://developers.cloudflare.com/email-service/platform/limits/)) | Base64 or hosted `path`, 40 MB post-encoding ([ref](https://resend.com/docs/api-reference/emails/send-email)) | Base64 ([ref](https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send)) | Base64; 50 MB batch payload ([ref](https://postmarkapp.com/developer/api/email-api)) |
| Free allowance | Verified destinations free; arbitrary = Paid, 3,000/mo then $0.35/1k ([pricing](https://developers.cloudflare.com/email-service/platform/pricing/)) | 3,000/mo, 100/day ([pricing](https://resend.com/pricing)) | 100/day for 60 days; FAQ says 100/day free ([pricing](https://www.twilio.com/en-us/products/email-api/pricing)) | 100/mo, never expires ([pricing](https://postmarkapp.com/pricing)) |
| Account/key needed | Cloudflare account; binding, no third-party key ([docs](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/)) | API key + verified domain ([docs](https://resend.com/docs/send-with-cloudflare-workers)) | API key + sender/domain auth ([docs](https://www.twilio.com/docs/sendgrid/ui/sending-email/sender-verification)) | Server token + confirmed Sender Signature ([docs](https://postmarkapp.com/developer/api/email-api)) |
| DNS / domain needs | Cloudflare DNS; auto SPF/DKIM/DMARC ([docs](https://developers.cloudflare.com/email-service/configuration/domains/)) | DKIM/SPF TXT+CNAME; don't proxy ([docs](https://resend.com/docs/add-a-domain)) | CNAME/TXT or MX/TXT; up to 48 h ([docs](https://www.twilio.com/docs/sendgrid/ui/account-and-settings/how-to-set-up-domain-authentication)) | DKIM/SPF/DMARC included ([pricing](https://postmarkapp.com/pricing)) |
| Credential-free demo | Yes — local simulation logs emails ([docs](https://developers.cloudflare.com/email-service/local-development/sending/)) | No — needs key; resend.dev only to own address ([docs](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)) | No — sandbox validates but needs key ([ref](https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send)) | No — sandbox black-holes but needs account + quota ([docs](https://postmarkapp.com/developer/user-guide/sandbox-mode/server-sandbox-mode)) |
| Scheduling | Not documented on `send()` ([ref](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/)) | `scheduled_at` up to 30 days ([ref](https://resend.com/docs/api-reference/emails/send-email)) | `send_at` up to 72 h ([ref](https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send)) | Not documented ([ref](https://postmarkapp.com/developer/api/email-api)) |
| Idempotency | Not documented | `Idempotency-Key`, 24 h ([ref](https://resend.com/docs/api-reference/emails/send-email)) | Not documented | Not documented |
| Async in Worker | `await` or `ctx.waitUntil` (30 s) ([docs](https://developers.cloudflare.com/workers/runtime-apis/context/)) | `await` or `ctx.waitUntil` (30 s) [inference] | `await` or `ctx.waitUntil` (30 s) [inference] | `await` or `ctx.waitUntil` (30 s) [inference] |

---

## Facts the provider decision needs

These are the plain facts that the decision ticket must weigh. They are stated without a recommendation.

1. **Cloudflare sending to arbitrary recipients costs money.** It requires the Workers Paid plan, gives 3,000 emails/month, and costs $0.35 per 1,000 after that. Free sending only reaches verified destination addresses ([Pricing](https://developers.cloudflare.com/email-service/platform/pricing/)).

2. **The credential-free demo requirement points only at Cloudflare.** `wrangler dev` simulates the email binding with no credentials and logs/saves the message locally. Resend, SendGrid, and Postmark all require a real account and key, and their "test" modes either still send, still need a key, or still consume quota ([Local development](https://developers.cloudflare.com/email-service/local-development/sending/), [Resend 403](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain), [SendGrid sandbox](https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send), [Postmark sandbox](https://postmarkapp.com/developer/user-guide/sandbox-mode/server-sandbox-mode)).

3. **Cloudflare requires a domain on Cloudflare DNS.** The repo currently ships with no custom domain (`wrangler.jsonc` has no `routes`). Email Service requires Cloudflare DNS and an onboarded domain; before onboarding a sending domain you can only send to verified destination addresses, and you can only send **from** your routing domains ([Send emails](https://developers.cloudflare.com/email-service/get-started/send-emails/), [Limits](https://developers.cloudflare.com/email-service/platform/limits/)).

4. **Cloudflare's new-account daily quota is conservative and ramps up.** If the demo needs to send to arbitrary recipients immediately, this may require a limit-increase request ([Limits](https://developers.cloudflare.com/email-service/platform/limits/)).

5. **Every option can carry an arbitrary hosted link**, because every option renders an HTML body. Hosted-link vs. attachment is therefore an application design choice, not a differentiator between transports. All four also support base64 attachments; the practical size ceilings are Cloudflare 5 MiB, Resend 40 MB, SendGrid base64 (no stated total in the field docs), Postmark 50 MB batch payload ([Cloudflare limits](https://developers.cloudflare.com/email-service/platform/limits/), [Resend ref](https://resend.com/docs/api-reference/emails/send-email), [SendGrid ref](https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send), [Postmark ref](https://postmarkapp.com/developer/api/email-api)).

6. **Free-tier envelopes differ sharply.** Cloudflare: free only to verified destinations, otherwise paid. Resend: 3,000/month (100/day) free. Postmark: 100/month free and no tier between 100 and 10,000. SendGrid: 100/day for 60 days on the trial; the pricing FAQ also claims 100/day on the free plan ([Cloudflare pricing](https://developers.cloudflare.com/email-service/platform/pricing/), [Resend pricing](https://resend.com/pricing), [Postmark pricing](https://postmarkapp.com/pricing), [SendGrid pricing](https://www.twilio.com/en-us/products/email-api/pricing)).

7. **Domain/DNS setup is required by all four** before sending to arbitrary recipients: Cloudflare onboard (auto SPF/DKIM/DMARC), Resend verify domain, SendGrid single-sender or domain auth, Postmark confirmed Sender Signature ([Cloudflare domains](https://developers.cloudflare.com/email-service/configuration/domains/), [Resend add-a-domain](https://resend.com/docs/add-a-domain), [SendGrid sender verification](https://www.twilio.com/docs/sendgrid/ui/sending-email/sender-verification), [Postmark Email API](https://postmarkapp.com/developer/api/email-api)).

8. **Only Resend documents `scheduled_at` (30 days) and an idempotency key (24 h)**; SendGrid documents `send_at` (72 h) and `batch_id`. This matters if the send must survive a retry or be deferred ([Resend ref](https://resend.com/docs/api-reference/emails/send-email), [SendGrid ref](https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send)).

9. **Worker async semantics are the same for the three HTTP providers and Cloudflare's binding**: await for a dependent response, or `ctx.waitUntil()` for after-response work, capped at 30 seconds shared across all `waitUntil` calls; longer work needs Queues ([Context (ctx)](https://developers.cloudflare.com/workers/runtime-apis/context/)).

10. **Sending a PDF attachment via Cloudflare can't be tested locally** because the local simulator cannot serialise `ArrayBuffer` attachment content; a hosted link avoids that problem entirely ([Local development](https://developers.cloudflare.com/email-service/local-development/sending/)).

---

## Uncertainty and gaps

- **SendGrid free-plan permanence.** The pricing page frames the free offering as a "free trial" of 100 emails/day for 60 days, while the same page's FAQ says 100 emails/day on "our free SMTP plan." The primary source is internally inconsistent; confirm with SendGrid before relying on a permanent free tier ([Email API pricing](https://www.twilio.com/en-us/products/email-api/pricing)).
- **SDK compatibility with Workers was not confirmed from primary sources** for SendGrid or Postmark. Both expose HTTP APIs with header auth, so a Worker can call them with `fetch` **[inference]**, but no first-party Workers guide was found. Resend does publish a Workers guide ([Resend Workers guide](https://resend.com/docs/send-with-cloudflare-workers)).
- **Cloudflare Email Service maturity/GA status** is not stated as a GA or beta label on the pages reviewed; it has full pricing and limits docs. Treat the new-account daily quota as the main operational unknown ([Limits](https://developers.cloudflare.com/email-service/platform/limits/)).
- **The repo has no custom domain.** Whether a Cloudflare-managed domain is available to onboard for sending, and whether the demo is intended to reach real patient-style addresses or only a verified demo inbox, is not answerable from the code or docs and must be decided by the team. Relevant config: `wrangler.jsonc` (no `routes`), `package.json` (`vinext`, `wrangler`).
- **No claim about regulatory suitability (HIPAA/GDPR) is made here.** None of the vendors' pricing/docs pages reviewed state healthcare-specific compliance terms, and the product doc lists privacy/regulatory requirements as open decisions (`PRODUCT.md`).
- **Postmark scheduled sending** may exist outside the documented single-email endpoint; only absence of documentation is reported, not a definitive absence of the feature.
