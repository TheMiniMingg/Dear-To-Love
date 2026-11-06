# ADR 0002: Generation runs, stream messages and the usage ledger

Status: accepted (PR 06)

## Context

The roadmap freezes the stream `runId` and `apiRequestId` contracts and the
usage schema before later PRs build on them (section 14).

## Decision

- **Run lifecycle:** `pending -> streaming -> completed | failed | cancelled |
interrupted`, every transition a compare-and-swap on the current status.
  Only the task that moved a run to `streaming` may finish it. `cancel_reply`
  signals that task; a run that never started is cancelled directly.
- **Stream messages** (`StreamMessage`, tagged by `type`): `started`,
  `delta {seq, text}`, `usage {usage}`, `done {finishReason}`,
  `error {code, message}`. Deltas are display-only; the committed reply comes
  back as the command's `RouteView` result. Every message carries `runId`.
- **Ledger:** one `api_requests` row per real outbound call, inserted with
  status `sent` before dispatch, closed exactly once. Purpose is
  `story_reply`, `memory_summary` (PR 07, see ADR 0003) or `manual_test`.
  The row id is the `apiRequestId`; a run links to it through
  `api_requests.generation_run_id`.
- **Costs:** a rate snapshot is copied into the row at dispatch.
  `micro-USD = noncached x inputRate + cached x cachedRate + output x outputRate`
  with rates in USD per 1M tokens (integer math). Missing counts or rates leave
  the cost `NULL` (unknown), never 0. A missing cached rate charges cached
  tokens at the input rate and is flagged `cachedRateAssumed`. Local billing
  is always 0. Calls refused before any work (connection refused, 401, 403,
  404, 429, other 4xx) record 0; anything that may have reached the model and
  then failed or was cancelled records unknown.
- **Errors:** new codes `RUN_ACTIVE` (a run is already pending/streaming on the
  route) and `PROVIDER_ERROR` (provider error without a more specific code).

## Consequences

Retries are always visible to the user and always counted. Budget preflight
(PR 07) can reserve against the same rows (`status = 'reserved'`,
`reserved_micro_usd`) without changing this contract.
