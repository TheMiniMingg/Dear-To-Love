# ADR 0016: Dice rolls and character stats

Status: accepted

## Context

MiniMe asked for chance in stories: dice rolls in an adventure, and odds that come from the
story itself. For example, a test is scored 0 to 100, but after studying twice the score is
40 to 100.

## Decision

- **The storyteller sets the odds, the app rolls.** With `Narration.dice` on, the contract
  gets a `DICE` section:
  - When the player tries something uncertain, the model stops at the moment of truth and
    ends its reply with `<roll for dice target stat/>`.
  - `dice` is dice notation (`1d20`, `2d6+1`) or a range (`40-100`).
  - The model is told to raise or lower the odds from what has happened. The test example
    above is in the prompt.
  - Models are good at judging odds from a story and bad at being random. So the model never
    rolls; the app does.
- **Fair rolls.** `domain/dice.rs` parses the spec and rolls with the operating system's
  random source (`getrandom`), using rejection sampling so every face is equally likely. A
  roll that the app could not have made (faces out of range, a total that does not add up) is
  refused on validation.
- **Stored with the action.** `PlayerPayload` gains an optional `roll` (`DiceRoll`: label,
  dice, stat, bonus, target, faces, total, asked). The player's text may then be empty.
  - The storyteller reads the action as the roll tag with `result` and `outcome`, then the
    words (`PlayerPayload::story_text`). Summaries, recaps, exports and search use the same
    text.
  - Because the roll lives in the event:
    - another reply to the same action never rerolls;
    - editing the action's words keeps the roll;
    - every reader of the story sees the same number.
  - No new event kind and no migration.
- **Stats.** `Character.stats` is a list of named numbers (at most 30, -1000 to 1000). A roll
  with a stat adds the player character's value at that point of the route. The value is
  looked up in Rust, not sent by the reader. A stat the character does not have adds nothing.
- **Where rolls come from.**
  - The reader shows a request as a card with a **Roll** button, on the latest reply only.
  - The composer's **Roll dice** mode (in dice stories) lets the player roll on their own,
    with a stat and a target.
  - Results show as a die with the total and Success or Failed.
- **Defaults.** The Adventure, Fantasy and School life story types turn dice on in Quick Start
  and the wizard. Anyone can switch it in Narration.
- **Offline storyteller.** With dice on, a risky action ends in a `1d20` roll request. A roll
  result decides the reply: a success line, a failure line, or the score.
- `PROMPT_SCHEMA_VERSION` 6.

## Consequences

- An app from before this change cannot import a storypack whose events carry a roll or
  whose characters have stats (payloads deny unknown fields).
- A roll can't be verified after the fact. A storypack could carry a made-up roll that adds
  up, which is harmless in a single-player story.
