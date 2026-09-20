# WhatsApp sending options for a hosted prescription link

## Question

Which WhatsApp sending approach should the Vishwas Clinic demo use to deliver a
hosted prescription link to a patient's mobile number?

The options compared are **Meta WhatsApp Cloud API (direct)**, **Twilio WhatsApp**, and
**Gupshup**, plus one credible fourth option, **360dialog** (a Meta Business Solution
Provider that resells Cloud API). Each is assessed on: business verification for a small
clinic; pre-approved templates for the clinic's outbound (business-initiated) message; the
24-hour customer service window and opt-in rules; whether a plain URL or document link can
be sent; phone number requirements and test numbers; pricing and free usage; sandbox/test
options that work without full verification; and how to call it from a Cloudflare Workers
backend.

The clinic context matters: the message is a **transactional/utility** prescription document
or link, sent by a two-doctor clinic in India, as a working demo that should later become
production.

---

## The mechanics every option inherits

All three WhatsApp Business Platform products sit on Meta's rules. The rules below are
Meta's and apply whether you call Meta directly or go through a provider.

### Customer service window and opt-in

- When a WhatsApp user messages or calls a business, a **24-hour customer service window**
  starts. The timer resets if the user messages or calls again before it expires. Inside the
  window you may send free-form ("service") messages; when it closes you can send **only
  pre-approved template messages** ([Meta, *Service messages*](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages)).
- Businesses are **required to obtain opt-in before messaging people on WhatsApp**. Opt-in can
  be general (not WhatsApp-specific) but must identify the business and comply with local law.
  Accepted methods include SMS, website, phone/IVR, and in person or on paper ([Meta, *Get opt-in for WhatsApp*](https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in),
  [WhatsApp Business Messaging Policy](https://business.whatsapp.com/policy)).
- A clinic taking a patient's mobile number at the desk and telling them a prescription link
  will be sent to that number is a plausible in-person opt-in; the clinic must be able to
  honor opt-out requests.

### Outbound messages need an approved template

- Template messages are **the only message type that can be sent outside a customer service
  window**. Templates are categorized **marketing**, **utility**, or **authentication**, and
  each must be **approved** before use ([Meta, *Template fundamentals*](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview),
  [Meta, *Template review*](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-review)).
- Review is largely machine-driven; **a decision can take up to 24 hours** ([Meta, *Template review*](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-review)).
  Gupshup describes the same process as typically minutes with human review up to 48 hours
  ([Gupshup, *Template Message Approvals & Statuses*](https://docs.gupshup.io/docs/message-template-approvals-statuses)).
- A prescription is a post-visit transactional document, so it fits **utility**; Meta's
  utility guidelines require a specific, agreed-upon transaction and reject mixed
  marketing content ([Meta, *Template categorization*](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization)).

### What shape can a link/document take?

Meta's Cloud API supports all of the following; providers expose the same primitives:

- **Free-form text with a URL** (window open only): `type: "text"`, with `preview_url: true`
  to render a link preview. The WhatsApp client auto-hyperlinks URLs; max 4096 characters
  ([Meta, *Text messages*](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/text-messages)).
- **Document message** (window open only): `type: "document"`, pointing at an uploaded
  `id` (recommended) or a hosted `link` (supported but "not recommended"), with optional
  caption and filename. PDF max 100 MB ([Meta, *Document messages*](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/document-messages)).
- **Interactive CTA URL button** (window open only): maps a URL to a tappable button so users
  do not see a long raw URL ([Meta, *Interactive CTA URL button messages*](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-cta-url-messages)).
- **Utility template with a URL button** (works outside the window): utility templates support
  a header (text/image/video/document), body, footer, and up to 10 buttons including URL
  buttons (max 2 URL buttons per template) ([Meta, *Utility templates*](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/utility-templates/utility-templates),
  [Meta, *Template components*](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/components)).
- **Utility template with a document header** (works outside the window): media headers can be
  image, video, gif, or a **document such as a PDF** ([Meta, *Template components*](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/components)).

So the hosted prescription link can be delivered either as a **free-form text/document while
the patient's 24-hour window is open**, or as an **approved utility template with a URL button
or PDF header when it is not**. In practice, a patient who has just messaged the clinic opens
the window; a cold outbound send does not.

### Phone numbers

- A business phone number **must be owned by the business**, have a country and area code
  (short codes unsupported), and be able to **receive voice calls or SMS**. It cannot already
  be in use with WhatsApp Messenger; it must be deleted from WhatsApp first ([Meta, *Business phone numbers*](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers)).
- **Mobile numbers are recommended**; landlines/fixed lines are viable for voice OTP but not
  SMS OTP ([Meta, *Business phone numbers*](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers)).
- A number used on the WhatsApp Business **app** cannot simply be registered too, unless the
  provider/Meta supports Coexistence ([Twilio, *Self Sign-up*](https://www.twilio.com/docs/whatsapp/self-sign-up);
  360dialog documents Coexistence at [360dialog, *Coexistence*](https://docs.360dialog.com/docs/resources/phone-numbers/coexistence)).
- Registering requires a **two-step verification PIN** and an SMS/voice code
  ([Meta, *Business phone numbers*](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers)).

### Pricing model (post-July 2025)

- Meta charges **per delivered template message**, by category and by the recipient number's
  country calling code. **Non-template messages are free**, but can only be sent inside an open
  customer service window. **Utility templates delivered inside an open window are free.** All
  messages, including templates, are free for **72 hours inside a Free Entry Point window**
  (entry via Click-to-WhatsApp ad or Facebook Page CTA) ([Meta, *Pricing*](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)).
- Rates are published only as downloadable rate cards per currency, including **INR**
  ([Meta, *Pricing — rate cards*](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing#rate-cards-and-volume-tiers)).
  The India rate cards are the authoritative INR numbers.
- Because India billing localization launched 1 Jan 2026, eligible India-based customers must
  migrate WABAs to INR by 31 Dec 2026 ([Meta, *Pricing — India*](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)).

---

## Option 1 — Meta WhatsApp Cloud API (direct)

Meta's own hosted API. You manage the WABA, business verification, phone number, templates,
tokens, and webhooks yourself.

### What you get

- **Test resources included.** Creating a WhatsApp app automatically provisions a **test
  WhatsApp Business account and test business phone number**, which have **relaxed messaging
  limits and need no payment method on file** to send template messages
  ([Meta, *About the platform — Test resources*](https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform)).
  This is the fastest way to demo a real message end-to-end.
- **Verification is not required to start**, but you stay in a sandbox-ish state. A newly
  created business portfolio has a **messaging limit of 250 unique recipients per 24 hours**;
  2,000 is unlocked by **verifying the business** (or sending 2,000 delivered out-of-window
  messages) and higher tiers scale automatically ([Meta, *Messaging limits*](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits)).
  Unverified portfolios are also capped at **250 templates** and **2 registered phone numbers**
  ([Meta, *Template fundamentals*](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview),
  [Meta, *Business phone numbers*](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers)).
- **Business verification is free** and distinct from the paid "Meta Verified" subscription
  ([Twilio, *Self Sign-up*](https://www.twilio.com/docs/whatsapp/self-sign-up),
  [Meta help, *Verify your business*](https://www.facebook.com/business/help/2058515294227817)).
  Meta says processing time varies by region and **can take several weeks** (Twilio's summary
  of the Meta process, [Twilio, *Self Sign-up*](https://www.twilio.com/docs/whatsapp/self-sign-up)).
- Sending is a single HTTPS call to `POST /<PHONE_NUMBER_ID>/messages` on `graph.facebook.com`
  with a system-user bearer token ([Meta, *Get started*](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started),
  [Meta, *Service messages — Requests*](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages)).

### Pros

- **No per-message markup.** You pay Meta's rate card only.
- **Most complete and authoritative documentation**, including copy-paste Cloud API calls.
- Free test number lets the demo send real WhatsApp messages without business verification or
  a card on file.
- Direct control of templates, phone number, and webhooks; no vendor in the data path.

### Cons

- You build and operate everything: token rotation, template lifecycle, webhook handling,
  phone number registration, quality/messaging-limit monitoring.
- A test number is for testing; production needs a real number plus enough verification to
  raise limits.
- No account manager or SLA; support is community/Business Support Home.
- **Test-number recipient allowlist.** The test number can only message numbers you add and
  verify. Current Meta reference docs do not state a numeric cap; Meta's own developer
  community thread says **up to 5 numbers**, and the error `131030 "Recipient phone number not
  in allowed list"` applies to test numbers ([Meta Developer Community thread](https://developers.facebook.com/community/threads/741895674379680/)).
  Treat the exact cap as to-verify in the dashboard (see Gaps).

---

## Option 2 — Twilio WhatsApp

Twilio resells the WhatsApp Business Platform behind its Programmable Messaging REST API and
adds a sandbox and managed onboarding.

### What you get

- **Sandbox without a WABA or registered sender.** Twilio provides a shared Sandbox number
  (`+14155238886`). Users join by sending `join <sandbox code>`; only joined users can be
  messaged. It ships **three pre-approved templates**: Appointment Reminders, Order
  Notifications ("Your {{1}} order of {{2}} has shipped and should be delivered on {{3}}.
  Details: {{4}}"), and Verification Codes. **Custom templates are not allowed in the
  Sandbox** ([Twilio, *Test WhatsApp messaging with the Sandbox*](https://www.twilio.com/docs/whatsapp/sandbox)).
  The Order Notifications `{{4}}` slot is a natural carrier for the hosted prescription URL.
- **24-hour window.** Joining the Sandbox opens a window; inside it you can send free-form
  messages, outside it only the pre-approved templates
  ([Twilio, *Sandbox*](https://www.twilio.com/docs/whatsapp/sandbox),
  [Twilio, *Key concepts*](https://www.twilio.com/docs/whatsapp/key-concepts)).
- **Sender registration.** For production you register a WhatsApp sender through WhatsApp
  Self Sign-up (or the Tech Provider program for ISVs). You can use a Twilio number or your own
  number; it must meet WhatsApp compatibility, not already be on WhatsApp, and be able to
  receive SMS/voice. **Business verification becomes necessary to move into production and to
  raise limits** ([Twilio, *Self Sign-up*](https://www.twilio.com/docs/whatsapp/self-sign-up)).
- **Pricing.** Twilio adds **$0.005 per message** (inbound or outbound) on top of Meta's
  pass-through template fees; utility/authentication templates start at $0.0034/message; there
  is **no Meta fee during the customer service window for utility templates or free-form
  messages**; a failed-message processing fee of $0.001 may apply
  ([Twilio, *WhatsApp pricing*](https://www.twilio.com/en-us/whatsapp/pricing)).
- **Trial free units.** A Twilio trial includes **100 WhatsApp messages** and can be started
  without a credit card; trial accounts expire after 30 days. Trials allow only Twilio-provided
  content and up to **5 verified recipients**; custom templates are not available during trial
  ([Twilio, *Trial account*](https://www.twilio.com/docs/usage/trials),
  [Twilio, *Sandbox*](https://www.twilio.com/docs/whatsapp/sandbox)).
- Sending is `POST https://api.twilio.com/2010-04-01/Accounts/<SID>/Messages.json`, form-encoded
  with API-key/secret basic auth, using `ContentSid` for templates or `Body`/`MediaUrl` for
  free-form ([Twilio, *Quickstart*](https://www.twilio.com/docs/whatsapp/quickstart),
  [Twilio, *Message resource*](https://www.twilio.com/docs/messaging/api/message-resource)).

### Pros

- **Fastest credible demo**: no WABA, no business verification, no phone-number registration —
  join the sandbox and send. The Order Notifications template can carry the prescription link.
- Single API across WhatsApp/SMS/voice, familiar to many developers, many language SDKs.
- Trial gives 100 free WhatsApp messages; sandbox itself is unmetered but billed at standard
  rates ([Twilio, *Sandbox*](https://www.twilio.com/docs/whatsapp/sandbox)).
- Managed sender registration and support.

### Cons

- **$0.005/message markup** on top of Meta fees (so ~10x Gupshup's markup per message).
- Sandbox limitations: only joined users, one message every 3 seconds, **session expires 3 days
  after joining**, shared Twilio-branded number, only 3 pre-approved templates, custom
  templates unsupported ([Twilio, *Sandbox*](https://www.twilio.com/docs/whatsapp/sandbox)).
- Production still requires a WABA, a registered sender, and Meta business verification for
  scale — Twilio adds a layer but does not remove Meta's requirements.
- Trial content is restricted to Twilio-provided templates, and trial messages only go to up to
  5 verified recipients.

---

## Option 3 — Gupshup

Gupshup is an India-headquartered Meta Business Solution Provider with a self-serve dashboard,
Embedded Signup, wallet billing, and a sandbox.

### What you get

- **Self-serve Embedded Signup** to create/select a Meta Business Portfolio, WABA, business
  profile, and phone number; the docs note Meta "will likely need to complete Meta Business
  Verification before making your App live" ([Gupshup, *Onboarding Guide*](https://docs.gupshup.io/docs/onboarding-guide)).
- **Sandbox** is a dedicated test environment that can send to chosen recipients from a
  **Gupshup sandbox number** (`+91 70XXXXX90`), with **charges deducted from the wallet**; it
  supports custom text and sample media and predefined interactive messages
  ([Gupshup, *Sandbox*](https://docs.gupshup.io/docs/sandbox)).
- **Templates** are created and managed in the dashboard and submitted to WhatsApp; typical
  approval is minutes, human review up to 48 hours ([Gupshup, *Templates*](https://docs.gupshup.io/docs/templates),
  [Gupshup, *Template Message Approvals & Statuses*](https://docs.gupshup.io/docs/message-template-approvals-statuses)).
- **Sending APIs**:
  - session/free-form text: `POST https://api.gupshup.io/wa/api/v1/msg` with `message={"type":"text","text":"...","previewUrl":true}` ([Gupshup, *Text*](https://docs.gupshup.io/reference/session-text-message));
  - session document: `message={"type":"file","url":"<pdf>","filename":"...","caption":"..."}` ([Gupshup, *Document*](https://docs.gupshup.io/reference/post_wa-api-v1-msg-5));
  - CTA URL button: a `message` object with `type`, `display_text`, and `url` ([Gupshup, *CTA URL Message*](https://docs.gupshup.io/reference/cta-url));
  - template messages (incl. document/CTA): `POST https://api.gupshup.io/wa/api/v1/template/msg` with template id and params, plus an optional `message` object for media ([Gupshup, *Template messages*](https://docs.gupshup.io/docs/template-messages)).
- **Pricing.** Gupshup's self-serve plan charges a **flat $0.001 per message** Gupshup fee and
  passes **Meta's message fee through "at actuals"** ([Gupshup, self-serve pricing](https://www.gupshup.io/pricing)).
  The wallet is prepaid (1 USD = 1 credit), minimum recharge $10, non-refundable
  ([Gupshup, *Wallet*](https://docs.gupshup.io/docs/wallet)). Gupshup confirms Meta's per-message
  model and the free in-window utility rule ([Gupshup, *Pricing updates*](https://docs.gupshup.io/docs/pricing-updates-on-the-whatsapp-business-platform)).
- **INR-relevant.** Gupshup is India-focused, offers INR billing, and supports India-specific
  requirements ([Gupshup, self-serve pricing](https://www.gupshup.io/pricing)).

### Pros

- **Lowest markup of the managed providers**: $0.001/message vs Twilio's $0.005.
- India-first, INR billing, GST-aware, strong local support.
- Self-serve dashboard, Embedded Signup, and a sandbox with a real sandbox number.
- Wallet model is simple for a small clinic; no monthly platform fee on self-serve.

### Cons

- **Onboarding assumes a live WABA** ("To get started, you need to have a live WhatsApp for
  Business account with Gupshup") and warns business verification is likely needed before
  going live ([Gupshup, *Getting Started*](https://docs.gupshup.io/docs/getting-started),
  [Gupshup, *Onboarding Guide*](https://docs.gupshup.io/docs/onboarding-guide)). The sandbox's
  precise prerequisites (whether it works with no verified WABA at all) are not spelled out.
- Sandbox usage is **billed from the wallet**, so it is not a free demo
  ([Gupshup, *Sandbox*](https://docs.gupshup.io/docs/sandbox)).
- Documentation is less consistent than Meta's or Twilio's; some pages are CRM-extension docs
  rather than raw API reference.
- Verification is still Meta's, so the same business-verification and opt-in rules apply.

---

## Option 4 (notable other) — 360dialog

360dialog is a Meta Business Solution Provider that sells **direct Cloud API access with a flat
monthly license and no per-message markup**.

- **Pricing:** monthly license **€49 / $59** (Regular), €99/$119 (Premium), €249/$299 (Higher
  Throughput); Meta message/call fees are billed at the official Meta rate cards. A 7%
  marketing surcharge applies if you use the standard `/messages` endpoint instead of the
  Marketing Messages API ([360dialog, *Pricing*](https://docs.360dialog.com/docs/get-started/pricing)).
- **Sandbox:** fixed recipient (your own number/BSUID), **max 200 messages**, only three
  predefined templates (`disclaimer`, `first_welcome_messsage`, `interactive_template_sandbox`),
  no media upload. Once the 200-message cap is hit, requests fail with HTTP 429
  ([360dialog, *Sandbox*](https://docs.360dialog.com/docs/get-started/sandbox)).
- **Verification:** offers Partner-led Business Verification, classic Meta verification, or
  paid Meta Verified for Business; business verification is required to scale
  ([360dialog, *Meta Business Verification*](https://docs.360dialog.com/docs/resources/meta-business-verification)).
- **Trade-off:** no per-message markup, but a **recurring monthly fee** that a low-volume clinic
  may not justify, and a restrictive sandbox.

---

## Comparison table

| Dimension | Meta Cloud API (direct) | Twilio WhatsApp | Gupshup | 360dialog |
|---|---|---|---|---|
| Business verification | Not needed to test; needed to scale (250→2,000+ recipients) | Not needed for Sandbox; needed for production/scale | Docs say likely needed before App goes live | Required to scale; offers Partner-led verification |
| Outbound template approval | Yes, up to 24 h | Yes, up to 24 h; Sandbox has 3 pre-approved | Yes, minutes–48 h | Yes, same Meta rules |
| 24 h window / opt-in | 24 h free-form; opt-in required | Same; joining Sandbox opens window | Same | Same |
| Plain URL / document | Text URL (+preview), document (id or link), CTA URL, utility template URL button or PDF header | Same primitives via Content API; Sandbox `{{4}}` details slot can hold URL | Text URL, document URL, CTA URL, template media | Same as Meta (Cloud API passthrough) |
| Phone number | Own number; SMS/voice capable, not on WhatsApp; test number provided | Twilio or own number; test via Sandbox number | New or migrated number via Embedded Signup | Own number via onboarding |
| Pricing | Meta rate card only; non-template and in-window utility free | **+$0.005/msg** Twilio fee + Meta fees; failed-msg $0.001 | **+$0.001/msg** Gupshup fee + Meta fees | **€49+/month** license + Meta fees |
| Free tier / trial | Test number: relaxed limits, no card needed | Trial: 100 WhatsApp msgs, no card; Sandbox unmetered (billed) | No documented free tier; prepaid wallet, min $10 | No free tier; paid license |
| Sandbox without full verification | Yes — auto test WABA + number | **Yes — Sandbox, no WABA needed** | Sandbox exists but onboarding assumes live WABA; usage billed | Yes but 200 msgs, 1 recipient, 3 templates |
| Cloudflare Workers fit | Direct `fetch` to Graph API | Direct `fetch` to Twilio REST | Direct `fetch` to Gupshup REST | Direct `fetch` to Cloud API |

---

## Facts the provider decision needs

1. **This is a utility/transactional message.** A prescription for a just-completed
   consultation is utility, not marketing. Utility templates are cheaper and are **free when
   sent inside an open 24-hour customer service window** ([Meta, *Pricing*](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)).
2. **The patient must have opted in**, and the clinic must state its name and that the patient
   is opting in to receive messages ([Meta, *Get opt-in*](https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in)).
   A desk/phone opt-in at the clinic is acceptable.
3. **If the patient messages the clinic first, the prescription link can be sent free** as a
   free-form text/document within 24 hours. If the clinic sends first, it needs an **approved
   utility template** and pays Meta's rate ([Meta, *Service messages*](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages)).
4. **Meta business verification is free but can take weeks** and is the gate to lifting the
   default **250-recipient/24h** limit to 2,000 and beyond ([Meta, *Messaging limits*](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits),
   [Twilio, *Self Sign-up*](https://www.twilio.com/docs/whatsapp/self-sign-up)).
5. **A demo can run today without verification via any of the three sandboxes**: Meta's test
   number, Twilio's Sandbox, or Gupshup's sandbox. Twilio's is the only one that explicitly
   needs **no WABA and no sender registration**, and its Order Notifications template can carry
   the link ([Twilio, *Sandbox*](https://www.twilio.com/docs/whatsapp/sandbox)).
6. **Cost per production message differs by provider markup**: Meta direct = Meta rate card;
   Gupshup = Meta + $0.001; Twilio = Meta + $0.005. For a low-volume clinic the absolute
   difference is small; for high volume Gupshup is materially cheaper than Twilio.
7. **360dialog removes per-message markup but adds a recurring monthly license**, which only
   pays off above a volume threshold; its sandbox is capped at 200 messages to one recipient.
8. **The sending pattern determines cost**: in-window free-form/document sends are free;
   out-of-window template sends are billable by category and recipient country.
9. **All three providers are plain HTTPS REST and work from Cloudflare Workers with `fetch()`**
   ([Cloudflare, *Fetch*](https://developers.cloudflare.com/workers/runtime-apis/fetch/)):
   Meta `POST graph.facebook.com/v<ver>/<PHONE_NUMBER_ID>/messages`; Twilio
   `POST api.twilio.com/2010-04-01/Accounts/<SID>/Messages.json`; Gupshup
   `POST api.gupshup.io/wa/api/v1/msg` or `/template/msg`. Credentials can live in Worker
   secrets/environment bindings ([Cloudflare, *Secrets*](https://developers.cloudflare.com/workers/configuration/secrets/)).
10. **The clinic owns the Meta requirements regardless of provider.** A provider hides
    onboarding paperwork but cannot remove opt-in, template approval, the 24-hour window, or
    business verification for scale.

**Working recommendation for the demo:** start with **Twilio Sandbox** (fastest, no WABA, three
pre-approved templates, `{{4}}` carries the prescription URL), and evaluate **Meta Cloud API
direct** for production because it has no per-message markup and the test number already lets
the team prove the real end-to-end flow. Choose **Gupshup** if India-local billing and lower
markup matter more than documentation polish. Treat **360dialog** as the option for higher
volume where a flat license beats per-message markup.

---

## Uncertainty and gaps (could not confirm from primary sources)

- **Exact Meta test-number recipient cap.** Meta's current reference docs say the test number
  has "relaxed messaging limits" but do not state a number. The cap of **5 verified
  recipients** appears in Meta's own developer community thread and in the product UI, not in
  Meta's reference documentation. Verify in the App Dashboard before relying on it.
- **India utility per-message rate.** Meta publishes rates only as downloadable per-currency
  rate cards (INR included) rather than inline text, so no exact INR figure is quoted here.
  Read the INR rate card from [Meta, *Pricing*](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing#rate-cards-and-volume-tiers)
  for the current number.
- **Gupshup sandbox prerequisites.** Gupshup's Getting Started page says a live WABA is
  required, while the Sandbox page presents it as a standalone test environment; it is unclear
  whether the sandbox works with no verified WABA. Confirm with Gupshup
  (`devsupport@gupshup.io`, per the wallet docs).
- **Gupshup opt-in guidance.** The linked Gupshup opt-in support article is behind a
  JavaScript/Cloudflare challenge and could not be read; the finding here relies on Meta's
  policy and Gupshup's template docs.
- **Twilio Content API URL-button/media specifics.** Twilio's WhatsApp messaging inherits
  Meta's template semantics, but this research did not deep-read Twilio's Content API docs for
  URL-button and document-header templates. Verify before building a custom production
  template.
- **Webhook signature verification.** Meta and Twilio both document request-signature headers
  for webhooks, but the exact scheme was not verified here. Confirm the header/signing scheme
  before implementing inbound replies or delivery receipts on the Worker.
- **Meta test-number behavior with unregistered WhatsApp users.** The docs confirm the test
  number works and the allowlist error exists, but not whether a recipient must first have
  WhatsApp installed/messaged the number. Test with a real device.

---

## Primary sources

**Meta (WhatsApp Business Platform / Cloud API)**
- About the platform (test resources, opt-in, limits): https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform
- Get started: https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started
- Service messages / customer service window: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages
- Text messages: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/text-messages
- Document messages: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/document-messages
- Interactive CTA URL button messages: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-cta-url-messages
- Template fundamentals: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview
- Template review: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-review
- Utility templates: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/utility-templates/utility-templates
- Template components: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/components
- Template categorization: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization
- Messaging limits: https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits
- Business phone numbers: https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers
- Pricing: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
- Get opt-in: https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in
- WhatsApp Business Messaging Policy: https://business.whatsapp.com/policy
- Verify your business (Meta help): https://www.facebook.com/business/help/2058515294227817
- Meta Developer Community thread on test-number allowlist: https://developers.facebook.com/community/threads/741895674379680/

**Twilio**
- WhatsApp overview: https://www.twilio.com/docs/whatsapp
- Sandbox: https://www.twilio.com/docs/whatsapp/sandbox
- Key concepts: https://www.twilio.com/docs/whatsapp/key-concepts
- Self Sign-up: https://www.twilio.com/docs/whatsapp/self-sign-up
- Quickstart: https://www.twilio.com/docs/whatsapp/quickstart
- Pricing: https://www.twilio.com/en-us/whatsapp/pricing
- Trial account: https://www.twilio.com/docs/usage/trials
- Message resource: https://www.twilio.com/docs/messaging/api/message-resource

**Gupshup**
- Getting started: https://docs.gupshup.io/docs/getting-started
- Onboarding guide: https://docs.gupshup.io/docs/onboarding-guide
- Sandbox: https://docs.gupshup.io/docs/sandbox
- Templates: https://docs.gupshup.io/docs/templates
- Template Message Approvals & Statuses: https://docs.gupshup.io/docs/message-template-approvals-statuses
- Template messages (send API): https://docs.gupshup.io/docs/template-messages
- Session text: https://docs.gupshup.io/reference/session-text-message
- Session document: https://docs.gupshup.io/reference/post_wa-api-v1-msg-5
- CTA URL message: https://docs.gupshup.io/reference/cta-url
- Verify your business on Meta: https://docs.gupshup.io/docs/verify-your-business-on-meta
- Pricing updates on the WhatsApp Business Platform: https://docs.gupshup.io/docs/pricing-updates-on-the-whatsapp-business-platform
- Wallet: https://docs.gupshup.io/docs/wallet
- Self-serve pricing: https://www.gupshup.io/pricing

**360dialog**
- Pricing: https://docs.360dialog.com/docs/get-started/pricing
- Sandbox: https://docs.360dialog.com/docs/get-started/sandbox
- Meta Business Verification: https://docs.360dialog.com/docs/resources/meta-business-verification

**Cloudflare Workers**
- Fetch API: https://developers.cloudflare.com/workers/runtime-apis/fetch/
- Secrets: https://developers.cloudflare.com/workers/configuration/secrets/
