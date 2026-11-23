import type { RegionCode } from "../types.js";

/**
 * Answers bots draw from. Bots can't read a prompt, so every line has to work as a
 * punchline for almost any "___" (the same trick as a "safety quip"). The randomness
 * is part of the joke; people still have to beat them with something sharper.
 *
 * Rules: family-safe only (bots play in family mode too), under 80 characters,
 * no real people, brands' mascots or song lyrics. DRAFT: review with native
 * speakers alongside the prompt deck.
 */

export interface BotAnswer {
  text: string;
  /** "pan" works anywhere; a country tag is preferred when that country's prompts are in play. */
  regions: readonly RegionCode[];
}

type Row = readonly [text: string, regions: readonly RegionCode[]];

const PAN = ["pan"] as const;
const NG = ["ng"] as const;
const GH = ["gh"] as const;
const KE = ["ke"] as const;
const ZA = ["za"] as const;
const NG_GH = ["ng", "gh"] as const;

const ROWS: readonly Row[] = [
  // ── Works anywhere ────────────────────────────────────────────────────────
  ["My mum's slipper, already airborne", PAN],
  ["A goat in a three-piece suit", PAN],
  ["Seven plastic bags inside one plastic bag", PAN],
  ["The landlord, again", PAN],
  ["A 12-minute voice note", PAN],
  ["Uncle's 'small' speech that lasted two hours", PAN],
  ["Grandma's secret spice, which is just a stock cube", PAN],
  ["A cousin you've never met but must greet", PAN],
  ["The visitors' biscuits nobody is allowed to eat", PAN],
  ["Light finally coming back", PAN],
  ["Rice and stew, no meat, no explanation", PAN],
  ["Data finishing at the worst possible moment", PAN],
  ["An ice cream bucket full of soup", PAN],
  ["An aunty with a camera and no shame", PAN],
  ["The pastor's fifth 'final' announcement", PAN],
  ["Bring your own container", PAN],
  ["A chicken that knows too much", PAN],
  ["The TV remote, still wrapped in nylon", PAN],
  ["Calling you by your full government name", PAN],
  ["A cracked phone held together by faith", PAN],
  ["Free food. That's it. That's the reason.", PAN],
  ["Washing every plate as a punishment", PAN],
  ["Running to switch on the generator in the rain", PAN],
  ["Greeting every elder in the compound, one by one", PAN],
  ["'I'm not angry, I'm just disappointed'", PAN],
  ["A wedding with 900 guests and 12 chairs", PAN],
  ["'So when are you getting married?'", PAN],
  ["A forward that says 'send to 10 people or else'", PAN],
  ["Hot pepper soup in 40-degree heat", PAN],
  ["Packing the whole house into one suitcase", PAN],
  ["Pretending to sleep so nobody sends you on errands", PAN],
  ["A family meeting about who finished the milk", PAN],
  ["The fan stopping at the exact worst moment", PAN],
  ["A rooster with a 4 a.m. attitude", PAN],
  ["Being sent to buy something you can't pronounce", PAN],
  ["Dancing like nobody's aunty is watching", PAN],
  ["Your name announced wrongly on the microphone", PAN],
  ["A party that 'starts at 2' and begins at 7", PAN],
  ["Tea with eleven sugars", PAN],
  ["Cold leftover rice the next morning, perfect", PAN],
  ["Blessings, but only in cash", PAN],
  ["The DJ playing the same song for an hour", PAN],
  ["A cousin selling 'business opportunities'", PAN],
  ["Clapping when the plane lands", PAN],
  ["A one-minute silence that lasted ten", PAN],
  ["A goat that walked into the party uninvited", PAN],
  ["Mum knowing exactly where everything is", PAN],
  ["A plastic chair, but make it a throne", PAN],
  ["The family photo that took three hours", PAN],
  ["Shouting 'I'm coming!' from the bed", PAN],
  ["An extra plate 'in case someone comes'", PAN],
  ["Wearing your church clothes to the market", PAN],
  ["Nothing. Absolutely nothing. Just silence.", PAN],
  ["The neighbour's speakers testing at 6 a.m.", PAN],
  ["Grandpa's radio at full volume, news only", PAN],
  ["Everybody talking, nobody listening", PAN],
  ["One piece of meat per person, strictly", PAN],
  ["A selfie with the bride's cousin's cousin", PAN],
  ["An aunty measuring your height with her hand", PAN],
  ["Your old report card, framed, in the living room", PAN],
  ["A wrapper that doubles as a towel", PAN],
  ["An extremely enthusiastic goat", PAN],
  ["Abeg Airways: we land when we land", PAN],
  ["Village People Limited", PAN],
  ["No Wahala Holdings", PAN],
  ["The Slipper Chronicles, Part 2", PAN],
  ["A WhatsApp group with 300 unread messages", PAN],
  ["Mum saying 'Ask your father', Dad saying 'Ask your mum'", PAN],
  ["Charging your phone at a stranger's house", PAN],
  ["Hiding the good meat at the bottom of the pot", PAN],

  // ── Nigeria ───────────────────────────────────────────────────────────────
  ["NEPA, obviously", NG],
  ["The danfo conductor's change, which you'll never see", NG],
  ["An agbero collecting money for the air you breathe", NG],
  ["An okada shortcut through the gutter", NG],
  ["Japa paperwork, in triplicate", NG],
  ["Suya at midnight", NG],
  ["Aso ebi debt", NG],
  ["Owambe leftovers in a rubber bowl", NG],
  ["Agege bread and a dream", NG],
  ["Puff-puff diplomacy", NG],
  ["Lagos traffic, but spiritually", NG],
  ["A Ghana-must-go bag full of old receipts", NG],
  ["'Who sent you?'", NG],
  ["Eba and a very strong opinion", NG],
  ["Pure water and pure vibes", NG],

  // ── Ghana ─────────────────────────────────────────────────────────────────
  ["Kenkey and shito, end of discussion", GH],
  ["The trotro mate's loudest voice", GH],
  ["Chale, relax", GH],
  ["Waakye with absolutely everything on it", GH],
  ["Kelewele from the roadside", GH],
  ["A kente outfit for every occasion", GH],
  ["Fufu pounding at 6 a.m.", GH],
  ["Banku and a lot of pepper", GH],
  ["Hiplife at full volume", GH],
  ["A trotro that leaves 'when it's full'", GH],

  // ── Nigeria × Ghana ──────────────────────────────────────────────────────
  ["Jollof. The answer is always jollof.", NG_GH],
  ["Detty December energy", NG_GH],
  ["Party jollof with a smoky bottom", NG_GH],

  // ── Kenya ─────────────────────────────────────────────────────────────────
  ["A matatu with disco lights", KE],
  ["Paying for it with mobile money, obviously", KE],
  ["Nyama choma and very long stories", KE],
  ["Ugali, the real MVP", KE],
  ["Mandazi and chai", KE],
  ["Thika Road traffic", KE],
  ["Mutura from the roadside", KE],
  ["A harambee for the harambee", KE],
  ["Sukuma wiki, every single week", KE],
  ["The matatu conductor hanging off the door", KE],

  // ── South Africa ──────────────────────────────────────────────────────────
  ["Load shedding, stage 6", ZA],
  ["A braai with no braai master", ZA],
  ["A taxi hand signal nobody understands", ZA],
  ["'Just now', meaning next week", ZA],
  ["The log drum at 3 a.m.", ZA],
  ["Gogo's handbag of mysteries", ZA],
  ["Pap and wors", ZA],
  ["Bunny chow for breakfast", ZA],
  ["Shisa nyama Sunday", ZA],
  ["Something you bought at the robot", ZA],
];

export const BOT_ANSWERS: readonly BotAnswer[] = ROWS.map(([text, regions]) => ({ text, regions }));
