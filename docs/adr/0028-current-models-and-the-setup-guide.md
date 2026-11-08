# ADR 0028: Current models and a setup guide that starts with the essentials

Status: accepted

## Context

By November 2026 most models people pick for stories think before they write: OpenAI's GPT-5
and later, Claude 5 and later (thinking can no longer be switched off on several of them),
Gemini 2.5 and later, and Grok 4. Thinking spends the same output limit as the reply, some
of them refuse a temperature or will soon, and a setting one model takes can be refused by
the next. The Setup guide also read like an essay before a beta: what it costs and how to
stay within a budget came last, and some players want every click spelled out.

## Decision

- **Brief thinking, with room for it.** For a model that thinks first, a request asks for low
  effort in that service's own words and gets `REASONING_ROOM` (2,000) more output tokens,
  which `Adapter::fit_request` adds before the budget reserves anything:
  - api.openai.com: GPT-5 and later and the o-series, `reasoning_effort: "low"`, no
    temperature (as in ADR 0027).
  - Anthropic: Opus, Sonnet and Haiku 5 and later, every Fable and Mythos,
    `output_config: {effort: "low"}`. Temperature was never sent.
  - Google (generativelanguage.googleapis.com): Gemini 2.5 and later except 2.5 Flash-Lite,
    `reasoning_effort: "low"`; Gemini 3 and later also send no temperature.
  - xAI: Grok 3 Mini and Grok 4 and later (not "non-reasoning"), `reasoning_effort: "low"`.
  - OpenRouter: the same families by their maker's prefix, plus names with "thinking",
    "reasoner" or "-r1", `reasoning: {effort: "low"}` and no temperature.
    Every other server gets exactly the connection's settings.
- **A refused setting is sent once more without it.** When a service refuses a request
  outright (HTTP 400 or 422) and the error names a setting the app added on its own
  (temperature, the effort settings, `stream_options`), that setting is taken out and the
  request is sent once more; the token limit's name is switched when the error asks for
  `max_completion_tokens` (or doesn't know it). A refused request is not charged, so the run
  still has one ledger row and at most one charge. A bad key or a story too long for the model
  is never "fixed" this way, and a second refusal is reported as it is. This is the only
  resend inside an adapter; every other retry is a new run.
- **Paid presets start at 32,000 tokens of context.** Each reply sends the story so far up to
  the context limit, so at 128,000 a long story's replies cost four times as much for little
  gain: older turns are summarized anyway. Existing connections keep their limit.
- **A list of known models** (`src/features/settings/models.ts`): name, preset, a few words on
  what each is good for, and the list price where the service publishes one, with the month
  it was checked. The connection form offers them as one-click chips; the guide prices a long
  story's reply from them (12,000 tokens in, 600 out, 300 more for thinking models); and
  **Usage & budget → Prices** offers **Use the listed prices**, which fills the form for the
  player to check and save. Nothing is looked up online, and nothing is saved unasked.
- **The guide leads with what matters.** The short version (play free now, connect an AI,
  stay within budget, keys stay here), then recommended models with a **Set up** button that
  fills in the service and model, then costs and the budget, then each service. Every
  service has a folded **Step by step, every click** list, built from shared steps so it
  reads the same everywhere, and the connection form shows the same list under **Service**.
  The contents bar sticks to the top while reading.

## Consequences

- Model names, notes and prices go stale; the month they were checked is shown beside them,
  and the services' own lists stay one click away.
- A new family that thinks first on another service needs adding to its host's rule in
  `adapters/openai.rs` or to `anthropic::thinks_by_default`.
