//! What the offline storyteller says, by the kind of story (`Flavor`) and
//! by how a character talks (`Voice`).
//!
//! Lines about the player use tokens that `person` fills in for the
//! story's point of view: `{You}`/`{you}` (the subject), `{you!}` (the
//! object), `{Your}`/`{your}`, and verb endings `{s}`, `{es}`, `{are}`,
//! `{were}`, `{have}`, `{do}`. Where a line has not named the player yet,
//! `{you*}` and `{your*}` use the name in the third person ("behind Wren",
//! not "behind them"). Lines never name a particular world.

/// The kind of story, from its genres (or its era when it has none).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Flavor {
    Fantasy,
    Future,
    Dark,
    Heart,
    Wild,
    Plain,
}

impl Flavor {
    /// Phones and texts belong in it.
    pub fn modern(self) -> bool {
        !matches!(self, Flavor::Fantasy | Flavor::Wild)
    }
}

pub struct Bank {
    /// A line of atmosphere that opens a reply.
    pub beats: &'static [&'static str],
    /// Looking closely.
    pub look: &'static [&'static str],
    /// Moving on.
    pub moves: &'static [&'static str],
    /// Picking up, opening or using something.
    pub handle: &'static [&'static str],
    /// A fight, as it starts.
    pub fight: &'static [&'static str],
    /// A twist the player didn't cause.
    pub twists: &'static [&'static str],
    /// One more sensory line, for detailed stories.
    pub details: &'static [&'static str],
    /// The text-adventure style's "where to now".
    pub ways: &'static [&'static str],
    /// Things to find: name and what it is.
    pub items: &'static [(&'static str, &'static str)],
}

pub fn bank(f: Flavor) -> &'static Bank {
    match f {
        Flavor::Fantasy => &FANTASY,
        Flavor::Future => &FUTURE,
        Flavor::Dark => &DARK,
        Flavor::Heart => &HEART,
        Flavor::Wild => &WILD,
        Flavor::Plain => &PLAIN,
    }
}

static FANTASY: Bank = Bank {
    beats: &[
        "Torchlight gutters, and the shadows lean in as if to listen.",
        "Somewhere far off, a bell tolls once and falls silent.",
        "The air tastes of old stone and something sharper, like the moment before a storm.",
        "A raven shifts on a high perch, watching with one bright eye.",
        "Wind threads through the cracks, carrying the smell of woodsmoke.",
        "For a heartbeat the world holds still, the way it does before magic.",
    ],
    look: &[
        "Scratched into the stone, half hidden by moss, are runes that someone tried hard to erase.",
        "{You} look{s} closer. The dust here has been disturbed, and recently: boot prints, and something dragged.",
        "Behind the obvious there is the less obvious: a seam in the wall, a draft where no draft should be.",
        "The longer {you} look{s}, the more it seems the place is looking back.",
    ],
    moves: &[
        "{You} set{s} off. The path bends, the trees close in, and the sounds of the last place fall away.",
        "Stone steps lead down, worn smooth in the middle by a thousand years of feet.",
        "The way ahead opens into a hall too large for its torches; the far end is only a rumor.",
        "{You} move{s} on, and the road remembers every traveler who went this way and did not come back.",
    ],
    handle: &[
        "It gives with a groan of old iron. Whatever was sealed in here has been waiting a long time.",
        "{Your} fingers find the catch. Something clicks, deep inside, like a lock deciding to trust {you!}.",
        "It is heavier than it looks, and warm, as if someone was holding it a moment ago.",
    ],
    fight: &[
        "Steel rings on steel, and the shock of it runs all the way up {your*} arm.",
        "It comes at {you*} fast, all teeth and fury, and there is no more time to think.",
        "{You} strike{s} first, hard and fast, before {you} can think better of it.",
    ],
    twists: &[
        "Then the runes on the far wall begin, very faintly, to glow.",
        "A horn sounds in the distance: three short blasts. Someone is coming.",
        "The ground trembles, and dust sifts down from the ceiling.",
        "A cloaked figure watches from the edge of the light, and is gone when {you} look{s} again.",
    ],
    details: &[
        "Lichen glows a faint, sickly green in the cracks.",
        "{You} can hear water dripping somewhere, slow and patient.",
        "The torch smoke stings {your*} eyes and smells of pitch and old fat.",
    ],
    ways: &[
        "A passage leads deeper in; the way back is still lit.",
        "There are stairs going down, a door with no handle, and the way {you} came.",
        "From here: onward into the dark, or back toward the light.",
    ],
    items: &[
        ("Healing Potion", "A small vial of red liquid that glows faintly when shaken."),
        ("Rusty Key", "Old iron, heavier than it looks. It opens something."),
        ("Silver Ring", "Plain and cold, engraved inside with a name nobody remembers."),
        ("Map Fragment", "Half a map, torn along a fold. The other half is somewhere else."),
        ("Throwing Knife", "Balanced for the hand, sharp enough to matter."),
        ("Pouch of Coins", "A dozen coins of three different kingdoms."),
    ],
};

static FUTURE: Bank = Bank {
    beats: &[
        "Neon bleeds through the haze, painting everything the color of warnings.",
        "A drone hums overhead, pauses, and moves on.",
        "Somewhere a server fan spins up, loud in the sudden quiet.",
        "The rain carries a faint taste of metal.",
        "Every ad screen on the street flickers at once, then resyncs as if nothing happened.",
        "{Your} implant pings softly: a notification {you} decide{s} to ignore.",
    ],
    look: &[
        "{You} run{s} a scan. Most of it is noise, but one signal is encrypted, and it is close.",
        "Under the grime there is a serial number someone filed off. Not well enough.",
        "The logs have been wiped, which tells {you*} more than the logs would have.",
        "A camera in the corner tracks {you*}, a half-second behind, the way a person would.",
    ],
    moves: &[
        "{You} cut{s} through a service corridor that smells of ozone and old coffee.",
        "The maglev doors hiss open on a platform full of people trying hard not to look at anyone.",
        "{You} take{s} the stairs. The elevators are watched; the stairs only mostly.",
        "Down three levels the city changes: fewer lights, more locks, nobody asking questions.",
    ],
    handle: &[
        "The panel pops loose. Behind it, a tangle of cables and one blinking light that should not be there.",
        "It takes three tries and a borrowed code, but the lock goes green.",
        "{You} jack{s} in. For a second the world is all data, cold and very loud.",
    ],
    fight: &[
        "Shots crack off the walls, and {you} move{s} on instinct before {you} can think.",
        "It is fast, faster than anything made of meat, and it does not hesitate.",
        "{You} hit{s} first and hard, and sparks spray where flesh should be.",
    ],
    twists: &[
        "Every screen in sight goes dark at once.",
        "A message flashes across {your*} vision: ACCESS FLAGGED.",
        "Sirens start up a few blocks over, and they are getting closer.",
        "A security drone drops to eye level, its lens whirring as it focuses on {you*}.",
    ],
    details: &[
        "Holograms flicker in the drizzle, selling things nobody here can afford.",
        "The air hums with a hundred machines thinking at once.",
        "Somewhere below, a train shakes the floor like distant thunder.",
    ],
    ways: &[
        "A maintenance shaft leads down; the main corridor leads back to the cameras.",
        "There is a locked door, a vent just big enough, and the way {you} came.",
        "From here: deeper into the network, or out into the rain.",
    ],
    items: &[
        ("Stim Pack", "Single use. Takes the edge off pain for a while."),
        ("Data Chip", "Encrypted. Someone wanted this kept quiet."),
        ("Keycard", "Corporate issue, still active, name scratched off."),
        ("Burner Phone", "Prepaid, untraceable, one bar of signal."),
        ("EMP Charge", "Small enough to palm. Loud enough to end an argument with a machine."),
        ("Credstick", "Loaded with someone else's money."),
    ],
};

static DARK: Bank = Bank {
    beats: &[
        "The silence has weight, as if the room is holding its breath.",
        "A floorboard creaks somewhere behind {you*}, then nothing.",
        "The light seems thinner than it should be.",
        "Far away, a dog starts barking and stops all at once.",
        "The cold finds the back of {your*} neck and stays there.",
        "Something about the quiet feels arranged.",
    ],
    look: &[
        "{You} notice{s} what is missing before what is there: a clean square on a dusty shelf.",
        "The details do not add up. Someone wanted this to look ordinary, and tried a little too hard.",
        "There are scratches on the inside of the door. Small ones, low down.",
        "{You} find{s} a clue, and the uneasy feeling that {you} {were} meant to find it.",
    ],
    moves: &[
        "{You} go{es} on. The hallway is longer than it looked, and the bulbs ahead are dead.",
        "Each step echoes a little too long.",
        "{You} leave{s} the light behind. The dark here is the patient kind.",
        "The streets are empty in a way that feels deliberate.",
    ],
    handle: &[
        "It opens easily. Too easily, as if it was left that way.",
        "{Your} hand closes on it, and it is colder than anything that size should be.",
        "Inside, wrapped in a stained cloth, is something someone very much wanted hidden.",
    ],
    fight: &[
        "It lunges out of the dark, and there is only time to react.",
        "{You} swing{s} at the shape and connect{s} with something that is not quite there.",
        "Everything narrows to one desperate struggle in the dark.",
    ],
    twists: &[
        "A phone starts ringing somewhere in the building. No one should be here to answer it.",
        "The door {you} came through is closed now. {You} {do} not remember closing it.",
        "The lights flicker, and for an instant the shadows are the wrong shape.",
        "Someone has written a name in the condensation on the glass. It is {your*} name.",
    ],
    details: &[
        "The wallpaper is peeling in long, tired strips.",
        "It smells of damp and of something sweet underneath, which is worse.",
        "A clock somewhere is ticking, slightly out of time.",
    ],
    ways: &[
        "A staircase leads up into darkness; the front door is still behind {you*}.",
        "There is a door that was locked a minute ago, and the way out.",
        "From here: further in, or back while {you} still can.",
    ],
    items: &[
        ("Old Photograph", "Faded and creased, with one face scratched out."),
        ("Brass Key", "Small and tarnished, tied to a strip of red ribbon."),
        ("Flashlight", "The batteries are weak, but it works. For now."),
        ("Torn Diary Page", "Most of the words are smudged. One line isn't."),
        ("Matchbook", "From a place that closed years ago."),
        ("Bandage", "Clean, at least."),
    ],
};

static HEART: Bank = Bank {
    beats: &[
        "Someone laughs in the next room, and the sound makes everything feel warmer.",
        "Late light slants through the window and settles on everything like dust.",
        "A song {you} half know{s} drifts out of somebody's speaker.",
        "The smell of coffee and rain hangs in the air.",
        "It is one of those moments that could go a dozen different ways.",
        "{Your} heart does something complicated and inconvenient.",
    ],
    look: &[
        "{You} notice{s} the little things: a chipped mug kept anyway, a photo turned face down.",
        "There is more here than {you} saw at first, and some of it is personal.",
        "{You} catch{es} someone looking {your} way. They look away a second too late.",
        "It is small, but it tells {you*} something about whoever lives here.",
    ],
    moves: &[
        "{You} head{s} out. The streets are busy with people who all seem to know where they are going.",
        "The walk is short, but long enough to rehearse what to say, and to forget all of it.",
        "{You} arrive{s} a little early, which is either a good sign or a nervous one.",
        "The bus is late and crowded, and somehow that makes the city feel friendlier.",
    ],
    handle: &[
        "It is a small thing, but {you} hold{s} it a moment longer than {you} need{s} to.",
        "{You} open{s} it carefully. Inside is something that was clearly meant for someone.",
        "It works, mostly, with only a little swearing.",
    ],
    fight: &[
        "Voices rise, and suddenly it is a real argument, the kind people remember.",
        "Words fly faster than anyone meant them to.",
        "It turns into a scuffle, clumsy and loud and over almost before it starts.",
    ],
    twists: &[
        "{Your} phone buzzes at the worst possible moment.",
        "Someone {you} did not expect to see walks in, and stops short.",
        "It starts to rain, suddenly and seriously.",
        "Someone nearby clearly overheard every word.",
    ],
    details: &[
        "Fairy lights blink along the window frame, a few of them out.",
        "Somewhere a kettle starts to sing.",
        "The chair creaks in a friendly sort of way.",
    ],
    ways: &[
        "The door is right there, and so is the chance to stay a little longer.",
        "{You} could stay, go, or say the thing {you} came to say.",
        "From here: home, or wherever this night is going.",
    ],
    items: &[
        ("Handwritten Note", "Folded twice. The handwriting is careful, like someone tried hard."),
        ("Concert Tickets", "Two of them, for this weekend."),
        ("Hair Clip", "Small and silver. Someone will be looking for it."),
        ("Cafe Loyalty Card", "Nine stamps. One more for a free drink."),
        ("Spare Umbrella", "Bright yellow and impossible to lose."),
        ("Friendship Bracelet", "Hand-braided, a little uneven, made with care."),
    ],
};

static WILD: Bank = Bank {
    beats: &[
        "Wind sweeps across the open ground, and the horizon looks very far away.",
        "Dust hangs in a long gold shaft of light.",
        "A hawk circles high above, patient as a promise.",
        "The ground underfoot is uneven, and every step counts.",
        "Distant thunder rolls, unhurried.",
        "Somewhere ahead, water is running.",
    ],
    look: &[
        "{You} read{s} the ground: tracks, three days old at most, heading the same way.",
        "From up here {you} can see the whole valley, and the smoke rising at its far end.",
        "{You} find{s} the remains of a camp, left in a hurry.",
        "Carved into the bark, at about head height, is a mark {you} {have} seen before.",
    ],
    moves: &[
        "{You} strike{s} out across open country, the sun hot on {your} shoulders.",
        "The trail climbs, narrows, and then simply stops at a cliff edge with a view worth the climb.",
        "{You} ford{s} the river where it runs shallow, and the cold steals {your} breath.",
        "Miles pass. The land changes slowly, then all at once.",
    ],
    handle: &[
        "It comes free with a jerk, and {you} nearly lose{s} {your} footing.",
        "{You} work{s} at it with a knife and patience until it gives.",
        "Rough, practical, and exactly what was needed.",
    ],
    fight: &[
        "It is on {you*} before {you} can draw breath, and the fight is ugly and close.",
        "{You} meet{s} the charge head on, and the impact rattles every bone.",
        "Dust and shouting and the crack of something breaking.",
    ],
    twists: &[
        "A rope bridge ahead sways, and one of its planks drops into the gorge.",
        "Riders appear on the ridge, too far away to tell whose side they are on.",
        "The weather turns, fast.",
        "Something heavy moves in the brush nearby.",
    ],
    details: &[
        "Grasshoppers rasp in the long grass.",
        "The smell of sage and hot rock is everywhere.",
        "Far off, a lone tree stands against the sky like a signpost.",
    ],
    ways: &[
        "The trail goes on toward the hills; the river runs back the other way.",
        "There is a path up the ridge, a path down to the water, and the way {you} came.",
        "From here: onward, or back to camp.",
    ],
    items: &[
        ("Coil of Rope", "Fifty feet of good hemp."),
        ("Old Map", "Hand-drawn, with a route marked in faded ink."),
        ("Compass", "The needle trembles, then settles true."),
        ("Water Flask", "Full and cold."),
        ("Hunting Knife", "Worn handle, sharp edge."),
        ("Medicine Pouch", "Herbs and bandages, enough for one bad day."),
    ],
};

static PLAIN: Bank = Bank {
    beats: &[
        "For a moment nothing happens.",
        "Somewhere nearby, a door closes softly.",
        "The air shifts, and the mood of the place shifts with it.",
        "A small sound makes {you*} pause: footsteps, then silence.",
        "The light changes as {you} move{s}, and new shadows settle into the corners.",
        "Time seems to slow while {you} take{s} it all in.",
    ],
    look: &[
        "{You} take{s} {your} time. Details {you} missed before come into focus, and one of them does not quite fit.",
        "Looking closer pays off: something here has been moved recently, and not carefully.",
        "{You} keep{s} looking until the shape of a question forms, sharper than the one {you} started with.",
    ],
    moves: &[
        "{You} set{s} off. The place changes around {you!}, and so does the feeling in {your} chest.",
        "A few steps are enough to see things from a different angle.",
        "{You} move{s} on, and the way ahead turns out to be less simple than it looked.",
    ],
    handle: &[
        "It takes a moment, but it gives. What {you} find{s} is not what {you} expected.",
        "{Your} hands are steadier than {you} feel{s}. It works, and now {you} {have} to decide what to do with it.",
        "It resists at first, then yields all at once.",
    ],
    fight: &[
        "It happens fast, and there is no time to think.",
        "{You} meet{s} it head on, and for a moment it could go either way.",
        "It turns physical, and it is clumsy and frightening and real.",
    ],
    twists: &[
        "Then, without warning, everything changes.",
        "Someone arrives who was not supposed to be here.",
        "A sound from outside makes everyone go still.",
    ],
    details: &[
        "Every small sound seems louder than it should.",
        "The room is warmer than it was a minute ago.",
        "There is a faint smell of dust and something sweet.",
    ],
    ways: &[
        "There is a way onward, and the way back.",
        "{You} could go on, go back, or take a closer look at what is here.",
    ],
    items: &[
        ("Small Key", "Plain and well worn. It opens something nearby."),
        ("Folded Note", "A few lines in a hurried hand."),
        ("Flashlight", "Small, reliable, and very welcome."),
        ("Old Coin", "Worn smooth, from somewhere far away."),
    ],
};

/// Lines that fit any story.
pub const OTHER: &[&str] = &[
    "It is not a big moment, but it changes something.",
    "{You} commit{s} to it. Whatever happens next, there is no taking it back.",
    "It goes better than {you} feared and not quite as well as {you} hoped.",
];

/// The text-adventure style's dry answer to anything.
pub const WIT: &[&str] = &[
    "That accomplishes about what {you} expected.",
    "Nothing obvious happens. The world remains politely unimpressed.",
    "{You} do{es} it. It is done. History will decide whether it mattered.",
];

pub const TALK_ALONE: &[&str] = &[
    "{Your} words hang in the air. No one answers, but {you} {have} the feeling someone heard.",
    "{You} say{s} it out loud, mostly to {yourself}. It sounds braver than it felt.",
];

pub const CLOSERS: &[&str] = &[
    "What happens next is up to {you*}.",
    "Something here still does not add up.",
    "It feels like a small step closer to an answer.",
];

pub const ROLL_SUCCESS: &[&str] = &[
    "The roll goes {your*} way. It works, cleanly enough that {you} almost {do} not trust it.",
    "Luck is on {your*} side this time: it comes off better than {you} hoped.",
    "{You} make{s} it, with nothing to spare.",
];

pub const ROLL_FAILURE: &[&str] = &[
    "The roll goes against {you*}. It does not work, and now someone may have noticed.",
    "Not this time. It slips away from {you*}, and it will cost something.",
    "{You} fall{s} short, just barely, and the moment passes.",
];

pub const CRIT_SUCCESS: &[&str] = &[
    "A perfect roll. It goes better than anyone could have planned, and everyone sees it.",
    "The dice could not have been kinder: it is flawless, the kind of thing people tell stories about.",
];

pub const CRIT_FAILURE: &[&str] = &[
    "The worst possible roll. It goes wrong in the most spectacular way.",
    "A disaster, start to finish, and loud enough that everyone nearby knows it.",
];

/// A roll with no target, where the number itself is the result.
pub const ROLL_SCORE: &[&str] = &[
    "It comes out at {result}. Whether that is good enough remains to be seen.",
    "The number is {result}, and it settles things for now.",
];

pub const MAGIC: &[&str] = &[
    "Power gathers in {your*} hands, hot and eager, and leaps free.",
    "The words come out right, and the air answers, crackling.",
    "The spell takes hold, and for a moment everything smells of lightning.",
];

pub const STAKES: &[&str] = &[
    "Everything hangs on the next moment.",
    "This is the moment that decides it.",
    "No more planning. It comes down to this.",
];

pub const HURT: &[&str] = &[
    "{You} take{s} a hit that knocks the breath out of {you!}.",
    "Pain flares, sharp and bright, then settles into a dull throb.",
    "It is not a clean escape. {You} will feel that one later.",
];

pub const WIN: &[&str] = &[
    "{Your} blow lands clean, and the fight goes out of {your} opponent.",
    "When it is over, {you} {are} still standing, and they are not.",
];

pub const FOUND: &[&str] = &[
    "Tucked out of sight, {you} find{s} something worth keeping.",
    "Half hidden where no one would think to look, there is something {you} take{s} with {you!}.",
];

pub const REST: &[&str] = &[
    "{You} rest{s} a while. It is not much, but it helps.",
    "For a little while, nothing is asked of {you*}, and that is its own kind of healing.",
];

/// How a character talks, from their personality.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Voice {
    Bright,
    Wry,
    Soft,
    Gruff,
    Plain,
}

pub struct Voices {
    /// What they do, then what they say, when the player talks to them.
    pub talk: &'static [(&'static str, &'static str)],
    /// A short reaction to whatever the player did.
    pub react: &'static [&'static str],
    /// Answers to a text: several short messages in a row.
    pub texts: &'static [&'static [&'static str]],
    /// Picking up a call: their lines, in order.
    pub call: &'static [&'static [&'static str]],
    /// Texting the player first.
    pub incoming: &'static [&'static [&'static str]],
    pub thoughts: &'static [&'static str],
}

pub fn voices(v: Voice) -> &'static Voices {
    match v {
        Voice::Bright => &BRIGHT,
        Voice::Wry => &WRY,
        Voice::Soft => &SOFT,
        Voice::Gruff => &GRUFF,
        Voice::Plain => &PLAIN_VOICE,
    }
}

/// Personality words for each voice.
pub const VOICE_WORDS: &[(Voice, &[&str])] = &[
    (
        Voice::Wry,
        &[
            "wry",
            "sarcastic",
            "witty",
            "dry",
            "sardonic",
            "teasing",
            "cocky",
            "smug",
            "mischievous",
            "flirty",
            "flirtatious",
            "charming",
            "sly",
            "cunning",
        ],
    ),
    (
        Voice::Gruff,
        &[
            "gruff", "stern", "cold", "serious", "blunt", "grumpy", "stoic", "harsh", "distant",
            "aloof", "tough", "brooding", "ruthless", "guarded",
        ],
    ),
    (
        Voice::Soft,
        &[
            "shy",
            "quiet",
            "gentle",
            "kind",
            "soft",
            "timid",
            "reserved",
            "anxious",
            "sweet",
            "caring",
            "nervous",
            "tender",
            "sensitive",
        ],
    ),
    (
        Voice::Bright,
        &[
            "cheerful",
            "bubbly",
            "warm",
            "friendly",
            "energetic",
            "outgoing",
            "playful",
            "optimistic",
            "sunny",
            "enthusiastic",
            "loud",
            "excitable",
            "lively",
        ],
    ),
];

static BRIGHT: Voices = Voices {
    talk: &[
        ("lights up", "Oh, finally, someone asks the good questions!"),
        (
            "laughs",
            "Okay, okay. I'll tell you, but you have to promise not to make it weird.",
        ),
        ("leans in, delighted", "Wait, really? Tell me everything."),
        ("claps once", "Yes! I was hoping you'd say that."),
        (
            "grins, wide and easy",
            "You know what? I like you. Come on, I'll show you.",
        ),
    ],
    react: &[
        "Whoa. Okay, that was kind of amazing.",
        "Ha! I did not see that coming.",
        "See? This is why I like having you around.",
        "Okay, that was brave. Or silly. Brave-silly.",
        "Do it again! No, wait, don't.",
        "I'm telling everyone about this later.",
    ],
    texts: &[
        &["omg hi!!", "i was literally just thinking about you 😊"],
        &["wait", "you're texting ME?", "ok this made my day"],
        &["yesss", "ok tell me everything", "like EVERYTHING"],
    ],
    call: &[
        &[
            "Hi! Oh my gosh, hi.",
            "Sorry, I'm walking, it's so windy. Okay. Okay, I'm here. What's up?",
        ],
        &[
            "Heyyy! You called!",
            "Hang on, let me turn the music down. Okay, go.",
        ],
    ],
    incoming: &[
        &[
            "are you free later??",
            "something happened and i need to tell you in person 👀",
        ],
        &[
            "random question",
            "do you like pancakes",
            "asking for a reason",
        ],
    ],
    thoughts: &[
        "That was sweet. Don't get all flustered now.",
        "Okay, I really like this person.",
        "Stay cool. Stay cool. You are not staying cool.",
    ],
};

static WRY: Voices = Voices {
    talk: &[
        (
            "raises an eyebrow",
            "That depends entirely on who's asking.",
        ),
        (
            "smirks",
            "Bold question. Let's see if you can handle the answer.",
        ),
        (
            "laughs quietly",
            "You really want to know? Fine. But you owe me.",
        ),
        (
            "studies {you*} for a beat",
            "Interesting. Most people know better than to ask me that.",
        ),
        (
            "shrugs",
            "Sure. And after that I'll tell you all my other secrets.",
        ),
    ],
    react: &[
        "Well. That's one way to do it.",
        "Subtle. Very subtle.",
        "I'd clap, but I don't want to encourage you.",
        "Fascinating. Truly.",
        "And here I thought today would be boring.",
        "You do know people can see you, right?",
    ],
    texts: &[
        &["well well well", "look who remembered my number"],
        &["bold of you", "go on then"],
        &["lol", "you're lucky i'm bored"],
    ],
    call: &[
        &[
            "Well. You actually called.",
            "No, no, I'm flattered. Go on.",
        ],
        &[
            "This had better be good.",
            "...Okay, you have my attention.",
        ],
    ],
    incoming: &[
        &["so", "are we going to talk about earlier or"],
        &["don't panic", "but i might have done something"],
    ],
    thoughts: &[
        "Huh. Didn't see that coming. I hate that I like it.",
        "Careful. They're cleverer than they look.",
        "Don't smile. Do not smile.",
    ],
};

static SOFT: Voices = Voices {
    talk: &[
        (
            "hesitates",
            "I... I'm not sure I should say. But I trust you, I think.",
        ),
        (
            "looks down, then back up",
            "Sorry. I just didn't expect anyone to ask me.",
        ),
        (
            "answers quietly",
            "It's okay. I can tell you. Just... not too loud.",
        ),
        (
            "smiles a little",
            "You're kind to ask. Nobody usually does.",
        ),
    ],
    react: &[
        "Are you okay?",
        "Oh. That was... really something.",
        "Please be careful.",
        "I... didn't think you'd actually do that.",
        "That was kind of wonderful.",
        "Can I help?",
    ],
    texts: &[
        &[
            "hi",
            "sorry, i saw this and didn't know what to say at first",
            "i'm really glad you texted",
        ],
        &["oh", "hi :)"],
        &["are you okay?", "you can tell me"],
    ],
    call: &[
        &[
            "...Hello?",
            "Oh. It's you. Hi. Sorry, I wasn't sure I should pick up.",
        ],
        &[
            "Hi. Um.",
            "No, it's fine, I wasn't doing anything. I'm glad you called.",
        ],
    ],
    incoming: &[
        &["hey", "are you okay? you seemed quiet earlier"],
        &["i keep thinking about what you said", "goodnight :)"],
    ],
    thoughts: &[
        "Why is my heart going this fast?",
        "I hope they can't tell.",
        "Maybe it's okay to trust them.",
    ],
};

static GRUFF: Voices = Voices {
    talk: &[
        ("grunts", "Make it quick."),
        (
            "does not look up",
            "Wrong person to ask. Or the right one. Depends what you're paying.",
        ),
        (
            "stares a long moment",
            "Fine. Once. Don't make me repeat it.",
        ),
        ("snorts", "Questions get people hurt around here."),
    ],
    react: &[
        "Hm.",
        "Not bad.",
        "Don't do that again.",
        "Took you long enough.",
        "Huh. Didn't think you had it in you.",
        "Keep moving.",
    ],
    texts: &[
        &["What."],
        &["Busy.", "Make it quick."],
        &["Fine.", "Later."],
    ],
    call: &[
        &["Yeah.", "...I'm listening."],
        &["What is it.", "Go on. I haven't got all night."],
    ],
    incoming: &[
        &["We need to talk.", "Tonight."],
        &["Don't go out tonight.", "Trust me."],
    ],
    thoughts: &[
        "Careful. Don't let it show.",
        "I don't need this. So why am I still here?",
        "Brave or reckless? Can't tell yet.",
    ],
};

static PLAIN_VOICE: Voices = Voices {
    talk: &[
        (
            "listens without interrupting",
            "Let me think about how to put this.",
        ),
        ("nods slowly", "All right. Here's what I know."),
        ("considers it", "That's a fair question. I'll answer it."),
        ("pauses", "You really want to know? Okay."),
    ],
    react: &[
        "Huh. All right.",
        "Okay. I didn't expect that.",
        "Well, that's done.",
        "So what now?",
        "You're full of surprises.",
        "Right. Okay. Good.",
    ],
    texts: &[
        &["Hey. What's up?"],
        &["Hey", "Can't talk long, but I'm here"],
        &["Okay.", "Tell me more?"],
    ],
    call: &[
        &[
            "Hey. Give me a second, it's loud here.",
            "Okay. What's going on?",
        ],
        &["Hello? Oh, hi.", "No, it's fine. What's up?"],
    ],
    incoming: &[
        &["Hey, you around later?"],
        &["Did you see the news?", "Call me when you can."],
    ],
    thoughts: &[
        "There's more to this than they're telling me.",
        "I wasn't expecting that.",
        "I could get used to this, and that's the problem.",
    ],
};

/// Between call lines: what a real call sounds like.
pub const CALL_PAUSES: &[&str] = &[
    "*A pause. Traffic, somewhere on their end.*",
    "*Muffled voices, a door closing.*",
    "*A long breath down the line.*",
];

pub const AFTER_TEXT: &[&str] = &[
    "The typing dots appear, vanish, and appear again.",
    "{Your} phone stays quiet for a long moment after that.",
    "Another message seems to be on its way.",
];

pub const BUZZ: &[&str] = &["{Your} phone buzzes.", "A message lights up {your} screen."];

/// Words that make an action risky enough to roll for.
pub const TRY_WORDS: &[&str] = &[
    "try", "attempt", "sneak", "climb", "jump", "fight", "attack", "dodge", "persuade", "convince",
    "bluff", "lie", "steal", "force", "break", "escape", "chase", "swim", "hack", "pick", "exam",
    "test", "race", "duel", "cast", "charm", "lift", "shoot", "strike", "flee",
];

/// Only these count when rolls are kept for big moments.
pub const BIG_WORDS: &[&str] = &[
    "fight", "attack", "duel", "escape", "battle", "steal", "exam", "race", "confront", "charge",
    "flee", "kill",
];

pub const FIGHT_WORDS: &[&str] = &[
    "fight", "attack", "hit", "strike", "punch", "kick", "stab", "shoot", "slash", "duel", "swing",
    "block", "parry", "battle", "kill", "charge", "smash", "tackle",
];

pub const MAGIC_WORDS: &[&str] = &[
    "cast",
    "spell",
    "magic",
    "enchant",
    "summon",
    "hex",
    "curse",
    "conjure",
    "incantation",
    "fireball",
    "ward",
];

pub const REST_WORDS: &[&str] = &[
    "rest", "sleep", "nap", "camp", "meditate", "recover", "relax", "eat", "breathe",
];

pub const USE_WORDS: &[&str] = &[
    "use", "drink", "eat", "apply", "give", "throw", "quaff", "swallow", "inject", "offer",
];

pub const BUY_WORDS: &[&str] = &["buy", "pay", "purchase", "bribe", "tip", "order", "rent"];

pub const SEARCH_WORDS: &[&str] = &[
    "search",
    "loot",
    "rummage",
    "open",
    "dig",
    "explore",
    "investigate",
    "check",
    "examine",
];

/// Travelling far enough for a "later" heading.
pub const TRAVEL_WORDS: &[&str] = &[
    "leave", "travel", "drive", "ride", "return", "fly", "journey",
];

pub const LOOK_WORDS: &[&str] = &[
    "look",
    "examine",
    "search",
    "inspect",
    "read",
    "check",
    "study",
    "watch",
    "listen",
    "observe",
    "investigate",
    "peek",
    "glance",
    "stare",
    "notice",
    "explore",
];
pub const TALK_WORDS: &[&str] = &[
    "ask",
    "say",
    "says",
    "tell",
    "talk",
    "call",
    "greet",
    "answer",
    "reply",
    "whisper",
    "shout",
    "speak",
    "explain",
    "admit",
    "promise",
    "thank",
    "apologize",
    "introduce",
    "flirt",
    "compliment",
    "hug",
    "kiss",
    "confess",
];
pub const MOVE_WORDS: &[&str] = &[
    "go", "walk", "run", "leave", "enter", "climb", "head", "follow", "return", "move", "step",
    "wander", "cross", "approach", "hurry", "sneak", "descend", "travel", "drive", "ride", "flee",
];
pub const HANDLE_WORDS: &[&str] = &[
    "take", "pick", "open", "grab", "give", "use", "pull", "push", "touch", "hold", "close",
    "unlock", "lift", "drop", "write", "fix", "repair", "light", "hide", "put", "loot", "drink",
    "hack", "jack", "code", "build", "cook", "play",
];

/// Bars that are a body's or a mind's: damage and rest change them.
pub const VITAL: &[&str] = &[
    "health",
    "hp",
    "life",
    "hit points",
    "vitality",
    "stamina",
    "energy",
    "sanity",
    "shield",
];
pub const MANA: &[&str] = &["mana", "mp", "magic", "focus", "ether", "spirit"];
pub const MONEY: &[&str] = &[
    "gold", "money", "credits", "coins", "cash", "silver", "crowns", "dollars", "yen", "scrap",
];
pub const SOCIAL: &[&str] = &[
    "affection",
    "trust",
    "love",
    "friendship",
    "relationship",
    "romance",
    "bond",
    "reputation",
];
pub const XP: &[&str] = &["experience", "xp", "exp"];
/// Items that heal when used.
pub const HEALING: &[&str] = &[
    "potion", "stim", "medkit", "bandage", "medicine", "herb", "salve", "elixir", "tonic",
];
