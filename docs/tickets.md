# Tickets: Feedback Button Template

A reusable, adapter-based feedback button and API route template.

## Ticket 1: Create the reusable client feedback UI

**What to build:** A React-only feedback button and dialog that can be copied into any project and styled by that project.

**Blocked by:** None - can start immediately.

- [ ] Button opens a dialog.
- [ ] Dialog collects type, title, and description.
- [ ] Failed submissions keep user-entered text.
- [ ] UI has minimal default styling and exposes hooks for project CSS.

## Ticket 2: Create the fail-closed feedback route factory

**What to build:** A server route factory that validates input, requires auth, rate-limits requests, and sends sanitized issue payloads to an adapter.

**Blocked by:** Ticket 1.

- [ ] Unauthenticated requests return 401.
- [ ] Missing required adapters fail closed.
- [ ] Invalid or oversized requests are rejected.
- [ ] User text is escaped before HTML issue descriptions are built.
- [ ] Provider failures do not leak secrets or raw provider responses.

## Ticket 3: Add adapters, notifications, examples, and verification

**What to build:** Plane issue sink, in-memory rate limiter, Slack/email notification rules, usage example, README, and tests.

**Blocked by:** Ticket 2.

- [ ] Plane adapter creates issues with backlog state and feedback labels.
- [ ] Slack and email notifications can be routed by feedback type before issue creation.
- [ ] Notification failures are redacted and non-blocking unless marked required.
- [ ] Environment example contains placeholders only.
- [ ] README documents auth/rate-limit/security requirements.
- [ ] Typecheck and tests pass.
