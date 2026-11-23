import type { Prompt, RegionCode } from "../types.js";

/**
 * Starter deck for "Wetin You Talk?". DRAFT: every line needs a read-through by
 * native speakers from each region before public launch.
 *
 * Rules for new prompts:
 * - One "___" blank (or a question) with room for a punchline under 80 characters.
 * - Laugh WITH a culture, never AT a group. No ethnic, tribal or religious targets.
 * - No song lyrics, brand mascots or real private individuals.
 * - Mark anything with adult themes familySafe: false.
 */

type Row = readonly [text: string, regions: readonly RegionCode[], familySafe?: boolean];

const NG = ["ng"] as const;
const GH = ["gh"] as const;
const KE = ["ke"] as const;
const ZA = ["za"] as const;
const PAN = ["pan"] as const;
const NG_GH = ["ng", "gh"] as const;

const ROWS: readonly Row[] = [
  // ── Nigeria ───────────────────────────────────────────────────────────────
  ["The real reason NEPA took light just now: ___", NG],
  ["The worst thing to hear from a danfo conductor: ___", NG],
  ["A new Lagos traffic excuse that will actually work on your boss: ___", NG],
  ["A rejected title for a Nollywood movie: ___", NG],
  ["What the aunty at the owambe really said after spraying you: ___", NG],
  ["The one ingredient that would make Nigerian jollof even better: ___", NG],
  ["The 11th commandment, according to Nigerian parents: ___", NG],
  ["A terrible thing to paint on the back of a keke: ___", NG],
  ["The real reason your uncle forwards 50 WhatsApp broadcasts a day: ___", NG],
  ["A strange product sold at the bus stop that 'cures all your problems': ___", NG],
  ["What 'I'm on my way' really means in Lagos: ___", NG],
  ["A new rule for passing JAMB: ___", NG],
  ["What Mama Put will add to the menu next: ___", NG],
  ["Your Nigerian dad's reaction to a B on your report card: ___", NG],
  ["A sentence you will never hear a Nigerian aunty say: ___", NG],
  ["What to name your new 'Japa' travel agency: ___", NG],
  ["The first thing every Nigerian does after landing in London: ___", NG],
  ["A brand-new Pidgin word and what it means: ___", NG],
  ["Your neighbour's generator noise, translated into English: ___", NG],
  ["The worst thing to say at a Nigerian introduction ceremony: ___", NG],
  ["The worst thing to find in the Christmas rice cooler: ___", NG],
  ["A new aso ebi rule your aunty just invented: ___", NG],
  ["'Bros, abeg...' is usually followed by: ___", NG],
  ["Why Nigerian Twitter is fighting today: ___", NG],
  ["The next thing the agbero will collect money for: ___", NG],
  ["What the eba whispered to the egusi: ___", NG],
  ["A bad name for a church fellowship WhatsApp group: ___", NG],
  ["The real reason the okada man is smiling: ___", NG],
  ["What your landlord is increasing the rent for this year: ___", NG],
  ["The opening line of every Nollywood villain's speech: ___", NG],
  ["What every Nigerian mum keeps in the big Ghana-must-go bag: ___", NG],
  ["What Nigerian parents think a 'gap year' is: ___", NG],
  ["The dish nobody touches at the owambe: ___", NG],
  ["Your village people's latest plan: ___", NG],
  ["A new achievement unlocked in 'Naija no dey carry last': ___", NG],
  ["What 'Ehen! Na so?' usually means: ___", NG],
  ["What 'Help me pick up this call' from your mum always turns into: ___", NG],
  ["The real reason the meeting started on 'African time': ___", NG],

  // ── Ghana ─────────────────────────────────────────────────────────────────
  ["The newest thing the trotro mate is shouting: ___", GH],
  ["'Chale, wait...' is usually followed by: ___", GH],
  ["The newest business at Kwame Nkrumah Circle: ___", GH],
  ["What Ghanaian mums say when you ask for money: ___", GH],
  ["The best new kenkey topping: ___", GH],
  ["The name of the next big Ghanaian dance craze: ___", GH],
  ["Why the trotro still hasn't left the station after two hours: ___", GH],
  ["What shito would be called if it went global: ___", GH],
  ["December in Accra means ___", GH],
  ["The Black Stars' secret weapon: ___", GH],
  ["What your Ghanaian aunty means by 'I'm coming': ___", GH],

  // ── Nigeria × Ghana (the jollof wars) ─────────────────────────────────────
  ["The real reason Ghana and Naija fight about jollof: ___", NG_GH],
  ["The judge's final verdict in the Jollof Wars: ___", NG_GH],
  ["A rejected name for a Detty December event: ___", NG_GH],
  ["The exam question WAEC should have asked: ___", NG_GH],
  ["What Naija and Ghana can finally agree on: ___", NG_GH],

  // ── Kenya ─────────────────────────────────────────────────────────────────
  ["What the matatu conductor is really shouting: ___", KE],
  ["The newest thing you can pay for with mobile money: ___", KE],
  ["The secret ingredient in the best nyama choma: ___", KE],
  ["What Kenyans on Twitter are roasting today: ___", KE],
  ["Why the traffic on Thika Road still hasn't moved: ___", KE],
  ["Something you will definitely hear at a harambee: ___", KE],
  ["What a Kenyan mum means by 'Utaona': ___", KE],
  ["The real reason the matatu has a TV and disco lights: ___", KE],

  // ── South Africa ──────────────────────────────────────────────────────────
  ["What really happens during load shedding: ___", ZA],
  ["The braai rule nobody is allowed to break: ___", ZA],
  ["A new taxi hand signal and what it means: ___", ZA],
  ["What 'just now' actually means in South Africa: ___", ZA],
  ["The real reason the amapiano log drum is so loud: ___", ZA],
  ["What's really inside gogo's handbag: ___", ZA],
  ["The newest thing you can buy at the robot (traffic light): ___", ZA],

  // ── Pan-African ───────────────────────────────────────────────────────────
  ["What your mum actually means by 'We have food at home': ___", PAN],
  ["The worst 'something small' to bring when visiting: ___", PAN],
  ["Why your mum keeps the good plates in the cabinet forever: ___", PAN],
  ["The worst item on a bride price list: ___", PAN],
  ["The worst excuse for 'African time': ___", PAN],
  ["The real job of the 'man of the house' at Christmas: ___", PAN],
  ["What African mums do with the bag full of plastic bags: ___", PAN],
  ["The punishment for not greeting your elders at a party: ___", PAN],
  ["What the slipper of an African mum has seen: ___", PAN],
  ["The family WhatsApp group's name, if it was honest: ___", PAN],
  ["What every African uncle says after his second drink: ___", PAN],
  ["The thing every African home keeps 'for visitors only': ___", PAN],
  ["The worst gift to bring back from abroad for your family: ___", PAN],
  ["The question every aunty asks you at weddings: ___", PAN],
  ["What 'Go and ask your father' really means: ___", PAN],
  ["What diaspora kids pretend to understand in their parents' language: ___", PAN],
  ["The first thing you notice when you visit home after five years: ___", PAN],
  ["A new rule for the family group chat: ___", PAN],
  ["What's actually inside the ice cream container in the freezer: ___", PAN],
  ["A rejected name for an African superhero: ___", PAN],
  ["The superpower every African mum has: ___", PAN],
  ["The strangest thing to hear at an African wedding: ___", PAN],
  ["What 'We'll see' from an African parent means: ___", PAN],
  ["A top tip for surviving Christmas with 40 cousins: ___", PAN],
  ["The best way to escape washing plates at a family party: ___", PAN],
  ["If African mums ran the UN, the first law would be: ___", PAN],
  ["A terrible slogan for a pan-African airline: ___", PAN],
  ["What really happened to the TV remote: ___", PAN],
  ["The best excuse to skip the 6 a.m. family prayer: ___", PAN],
  ["An African proverb that should exist: ___", PAN],
  ["Something you must never say at your partner's family introduction: ___", PAN],
  ["The next big African dance move is called ___", PAN],
  ["Why the visitors' chair is still wrapped in plastic: ___", PAN],
  ["The worst thing to say to customs at your home airport: ___", PAN],
  ["An opinion that would start a fight at the family party: ___", PAN],
  ["What your parents think you do at your job: ___", PAN],
  ["A new public holiday every African country would celebrate: ___", PAN],
  ["The real reason your cousin is 'coming back from abroad soon': ___", PAN],
  ["The secret ingredient in every grandmother's cooking: ___", PAN],
  ["A terrible name for a hair salon: ___", PAN],
  ["The most dramatic thing a church usher could do: ___", PAN],
  ["What you must never touch in an African kitchen: ___", PAN],
  ["The best thing to shout when the light finally comes back: ___", PAN],
  ["The hardest exam in an African home: ___", PAN],
  ["The title of your mum's latest 10-minute voice note: ___", PAN],
  ["What the family dog is thinking during the Christmas party: ___", PAN],
  ["The only thing that will make the whole family arrive on time: ___", PAN],

  // ── Grown-ups only (excluded in family mode) ─────────────────────────────
  ["What really happened at the after-party: ___", PAN, false],
  ["The worst thing to find on your partner's phone: ___", PAN, false],
  ["A rejected name for a Lagos nightclub: ___", NG, false],
  ["Why the bachelor's eve got cancelled: ___", PAN, false],
  ["What your ex is really doing in Dubai: ___", PAN, false],
  ["The worst thing to say on a first date: ___", PAN, false],
  ["What happens at the Detty December after-party stays ___", NG_GH, false],
  ["The real reason the aunty is checking your ring finger: ___", PAN, false],
];

export const WETIN_YOU_TALK_PROMPTS: readonly Prompt[] = ROWS.map(([text, regions, familySafe], i) => ({
  id: `wyt-${String(i + 1).padStart(3, "0")}`,
  text,
  regions,
  familySafe: familySafe ?? true,
}));
