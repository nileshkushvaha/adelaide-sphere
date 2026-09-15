# @adelaide-sphere/domain

Domain rules that both `apps/api` and `apps/worker` must apply identically (SRS ARC 002: share the service, never copy the invariant into a second runtime).

- `enquiry-mail.ts` — composing the outbound enquiry message: header sanitisation, Reply-To validation and the plain-text body (SRS ENQ 005).
- `queue.ts` — queue and job names, the retry policy (five attempts, exponential backoff with jitter, visible failures) and the Redis connection parsing BullMQ needs (SRS EVT 002).

Source-only package with no runtime dependencies; consumers compile it. Nothing here touches the database, HTTP or a provider SDK.
