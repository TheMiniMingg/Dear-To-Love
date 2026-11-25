# ADR 0034: Item rarity, items that change dice, loot odds and Use

Status: accepted

## Context

RPG mode kept items as a name, a count and a description. MiniMe asked for more ways a moment
can go: an enemy's attack that only a roll of 1 blocks, and an item that limits a d20 to 1
or 2, or to odd numbers, to push the odds. Items should be unique and found as the story
goes (a chest at the end of a dungeon), come in six rarities (Common, Uncommon, Rare, Epic,
Legendary, Mythical) whose power matches the rarity, with odds the game sets or the player
changes. Typical RPG starting gear should be a click away, and Status and inventory needs a
**Use** button: the storyteller learns the item was used, and an item that can't be used
right now is not used up and the player is told why.

## Decision

- **Rarity and dice effects live on the item** (`domain/loot.rs`, `Item.rarity`,
  `Item.dice`, `Item.keep`). A dice effect is a short string the app parses: `+2` (adds),
  `odd`, `even`, `best` (roll twice, keep the higher) or faces such as `1-2`. Each effect has
  a least rarity (+1 common, +2 or best uncommon, +3 / odd / even rare, half a d20's faces
  epic, a few faces legendary, one face mythical); an item whose effect is stronger than its
  rarity is raised to fit, in the core and in the form alike. `keep` marks an item that
  isn't used up (a lucky coin, lockpicks).
- **The app rolls an item's effect fairly.** `RollRequest.item` names the item; the core
  checks it is in the inventory and fits the dice, then every die shows one of the allowed
  faces with equal odds (`dice::roll_with`). The roll stores the item, its effect and, for
  `best`, the faces set aside, and `DiceRoll::validate` checks all of it. A roll whose faces
  an item chose has no criticals (a 1 on a 1-2 die is what the player wanted). Replay spends
  the item when the roll's action is applied, so every route and retry agrees.
- **Loot rarity is drawn by the app, not chosen by the model.** With an inventory, every
  action stores `PlayerPayload.loot`, drawn from `Tracking.lootOdds` (default 50/25/13/7/4/1).
  Only the latest action carries it to the storyteller (`<item loot="Epic"/>`), so another
  reply to the same action draws the same. The storyteller writes the rarity and any dice
  effect on the gain tag and makes each item unique to the story. The odds are a folded
  section under Starting items: Stingy, Balanced (the default) or Generous, or six numbers.
- **Use sends the item, the storyteller judges.** `submit_action` takes `useItem`; the core
  refuses an item the player no longer has. The action reaches the storyteller as
  `<item use="Name"/>`; it answers `<item use="Name" result="used"/>` (one is taken unless it
  lasts; a `lose` right after is the same one) or `result="not-now"` with a reason, shown as
  "Can't use Rope now: … You still have it". A dice item is checked by the app instead: it
  goes on the roll the storyteller is waiting for, or the panel says no roll is waiting, dice
  are off, or the item can't change those dice. The roll composer also offers dice items.
- **Starter kits** (Warrior, Rogue, Mage, Ranger, Healer, Adventurer's pack) add translated
  items in one click, adding to what is already there.
- Prompt schema 17 adds ITEMS AND RARITY to the TRACKING section.

## Consequences

- Old stories read as before: every new field is optional and the default odds apply.
- Item effects only change dice the app rolls; anything else an item does stays in its
  description for the storyteller to honour.
