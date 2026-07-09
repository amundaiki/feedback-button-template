# Spec: Reusable Feedback Button Template

## Problem Statement

Teams need the same authenticated feedback flow across admin and customer-facing tools without copying a project-specific component that depends on one design system, one auth provider, or one issue tracker setup.

## Solution

Create a standalone template repository with a small React feedback button/dialog and a server-side route factory. The UI is unstyled by default and configurable per project. The route requires explicit auth, rate limiting, and an issue sink so production cannot accidentally accept unauthenticated feedback. Optional notification adapters can alert Slack and email before the issue is created, routed by feedback type.

## User Stories

1. As a project maintainer, I want to copy a feedback button into a new app, so that testers can report bugs without opening a separate tracker.
2. As a project maintainer, I want the UI to be nearly unstyled, so that each project can apply its own design system.
3. As a project maintainer, I want auth to be an adapter, so that the template works with Payload, NextAuth, Authentik, or another session layer.
4. As a tester, I want the dialog to preserve my text when sending fails, so that I do not lose a detailed report.
5. As an operator, I want feedback to include page context, so that the issue is actionable.
6. As a security reviewer, I want unauthenticated requests to fail closed, so that internal surfaces do not become public write endpoints.
7. As a security reviewer, I want rate limiting, so that the endpoint cannot be trivially spammed.
8. As a maintainer, I want a Plane adapter, so that the Premiere workflow can be reused without copying secrets or IDs into client code.
9. As an operator, I want bug reports to trigger Slack and email alerts before issue creation, so that urgent breakages are seen quickly.
10. As a maintainer, I want notification routing by feedback type, so that improvement suggestions can use quieter notification rules than bugs.

## Implementation Decisions

- The client uses React only and does not import Next, shadcn/ui, or icon libraries.
- The server uses standard `Request` and `Response`, so it can run in Next App Router without importing framework response helpers.
- Auth, rate limiting, and issue creation are explicit adapters.
- Plane configuration is server-only and read from normal environment variables.
- Slack and email notifications are server-side adapters, optional by default, and run before issue creation when configured.
- Notification failures are non-blocking by default but can be marked required per rule.
- The default UI text is Norwegian Bokmål and can be overridden.
- The optional CSS file is intentionally small and not imported by default.

## Testing Decisions

- Test the server route as the highest useful seam: request in, response and issue-sink call out.
- Cover unauthenticated access, invalid input, rate limiting, notification routing/order, HTML escaping, provider failures, and method handling.
- Test the Plane adapter with fetch stubs and no real network calls.

## Out of Scope

- No GitHub remote creation in this local build.
- No project-specific auth adapter is bundled as the default.
- No design system styling is bundled as mandatory CSS.
- No database migrations or persistence layer are included.
- No direct SMTP, Resend, Sendgrid, or Postmark dependency is bundled; projects wire their existing email sender.

## Further Notes

The template is safe to push as a private GitHub template repository. Public release should get a separate review for wording, internal names, and provider assumptions.
