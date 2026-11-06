# ADR 0004: Usage totals, rates and the monthly budget

Status: accepted (PR 07)

## Context

Roadmap section 07 asks for a Usage & Budget screen, user-entered rates, a
monthly warning and an optional pause on new paid requests. The ledger rows
already exist (ADR 0002). The budget policy, its error codes and the
reservation rules are interface contracts (section 14), so they are recorded
here.

## Decision

- **Policy** lives in `app_preferences` under `budget_policy`:
  `{ enabled, currency: "USD", monthlyLimitUsd: "5.00", warningThresholdPercent: 1..100, mode: "warn" | "pause_new_requests" }`.
  The limit is a decimal string (up to 6 decimals), stored trimmed and
  compared in micro-USD. Only USD for now.
- **Month** is the UTC calendar month (`started_at >= YYYY-MM-01T00:00:00.000Z`).
  The screen says so, because the month can turn in the user's evening.
- **Month-to-date spend** is over paid rows only:
  `posted = SUM(cost_micro_usd)`, `reserved = SUM(reserved_micro_usd)`,
  `unknown = COUNT(rows with NULL cost that are not in flight)`.
  Local rows are never counted or gated.
- **Pause gate** runs inside `open_request`'s write transaction, before the
  row is inserted, so two routes asking at once are serialized by the single
  writer and cannot both use the same headroom.
  - The request's ceiling is `prompt estimate x input rate + max output x output rate`
    at the current rate card (cached tokens are not assumed).
  - `posted + reserved + ceiling > limit` refuses with `BUDGET_PAUSED`. No
    ledger row is written and nothing is sent.
  - A paid model with no rate card cannot be checked: the gate refuses with
    `BUDGET_OVERRIDE_REQUIRED` unless the caller passes the user's explicit
    one-time override (`generate_reply { budgetOverride: true }`, or pressing
    "Send a test message"). An override reserves 0. Memory summaries never
    override.
  - Every priced paid row records its ceiling as `reserved_micro_usd`, budget
    or not, so calls in flight always count toward the month.
- **Reconcile:** closing a row with a known cost sets `reserved_micro_usd = 0`
  (the cost is now posted). A row that ends with unknown cost keeps its
  reservation, so the gate stays conservative. This replaces the separate
  `reserved` status ADR 0002 anticipated: the row stays `sent` until closed.
- **Warning:** level is `warning` at the threshold percent of the limit and
  `reached` at 100%, of the known `posted` spend. The user can dismiss it; the
  dismissal (`budget_warning_dismissed`) records month, level, limit and
  threshold, and any change to those shows the warning again. Warn-only mode
  never refuses a request.
- **Usage report:** `get_usage_summary(scope, profileId?)` and
  `list_api_requests(scope, profileId?, limit)` with scope `session`
  (this app run), `month_utc` or `all_time`. Unknown costs are counted
  separately and never added as 0. Rows priced with an assumed cached rate are
  flagged approximate.
- **Rates:** `set_rates` writes a new rate card for the connection's current
  model, effective now. Past rows keep the rate snapshot they were priced with.
- **Diagnostics** adds `RATE_CONFIG`: WARN when a budget is on and a paid
  connection's model has no rates.

## Consequences

The budget is an estimate and the screen says so: calls made outside the app,
or that the provider never reports, are not counted. Users are told to set a
hard limit with their provider too.
