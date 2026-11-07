# ADR 0018: Portraits made from a character's description

Status: accepted

## Context

MiniMe asked that, while creating a story, each character can get a picture that is attached
to them, "or the engine will generate a character based on descriptions or use an image from
the all section". ADR 0017 covered attaching pictures and using shared ones. This record
covers making a portrait from the description.

Story connections speak chat APIs. Pictures need image APIs, which differ in shape, in price
(per picture, not per token) and in what they refuse.

## Decision

- **Picture connections are their own kind.** Two new adapter kinds, `openai_images`
  (`POST {base}/images/generations`, OpenAI's API and servers that copy it) and
  `stable_diffusion` (Stable Diffusion WebUI, `POST {base}/sdapi/v1/txt2img`). They are saved
  like any connection (keys in the credential store) and checked for free by listing models.
  `Adapter::live` gives them a `Pictures` adapter that lists models but refuses to write a
  reply, without sending anything.
- **One picture connection at a time**, in app preferences under `picture_maker` (null: off).
  The storyteller (app or story) can never be a picture connection, and the picture maker can
  never be a story connection; both are refused in Rust. Changing a connection's kind clears
  whichever of the two it can no longer do; deleting it clears both.
- **The description** (`services::pictures::portrait_prompt`) uses species, gender or
  pronouns, age, role, looks, up to three traits, and the world's era and setting, capped at
  1500 characters. Names are left out (picture models draw words, and names carry no looks);
  story text and hidden details are never used. A style (painted, anime, photo, pencil sketch)
  is the only other input. `preview_portrait` returns the same text without sending it, for
  **Show what is sent**.
- **Always safe for work.** Every description ends with "One person, fully clothed, safe for
  work, no text" and lists nudity, sexual content and gore to avoid (Stable Diffusion's
  negative prompt, or an "Avoid:" sentence for OpenAI). This holds for adults-only stories too:
  explicit writing stays a matter between the player and their storyteller, and pictures are
  not part of it.
- **Bytes, not links.** DALL·E models are asked for `b64_json`; GPT image models always send
  bytes. A reply with only a link is an error (fetching an arbitrary URL is not worth the
  risk). Bodies are capped at the library's 20 MB image limit, and the bytes go through the
  same decoder as any added image, so anything that isn't a real picture is refused.
- **Ledger**: each attempt is one `api_requests` row with purpose `character_suggestion`
  (shown as "Character picture"), 0 tokens and no price, since per-picture prices aren't
  modelled. When the budget pauses paid requests, an unpriced one needs an explicit "Make it
  anyway" (`budget_override`), as for replies.
- **Scope**: a portrait made from a story's Pictures is kept for that story; one made while
  creating waits for the story (`ImportScope::NewStory`) and the wizard adds it to the draft's
  own pictures, so it joins the story when it is created.

## Consequences

- Portraits need a picture service; without one the portrait chooser says how to add it.
- Paid pictures show as unpriced in Usage. Adding per-picture prices would be a later change
  to rate cards.
- No new tables or migration: the adapter kind is a text column, and the preference is a row
  in `app_preferences`.
