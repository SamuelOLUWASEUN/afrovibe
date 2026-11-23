import type { Prompt, RegionCode } from "../types.js";

/** Paid deck packs. DRAFT copy: get native-speaker review before launch, like the core deck. */

type Row = readonly [text: string, regions: readonly RegionCode[], familySafe?: boolean];
const PAN = ["pan"] as const;
const NG = ["ng"] as const;

const OWAMBE: readonly Row[] = [
  ["The MC's announcement that made everyone go quiet: ___", PAN],
  ["What the uninvited guest wrote on the gift card: ___", PAN],
  ["The real reason the bride was three hours late: ___", PAN],
  ["What the DJ played when the groom's mum arrived: ___", PAN],
  ["The aso ebi colour nobody agreed to: ___", NG],
  ["Why the small chops finished before the couple arrived: ___", PAN],
  ["The worst thing to spray money on: ___", NG],
  ["What the photographer is secretly taking pictures of: ___", PAN],
  ["The family member who should never get the microphone, and why: ___", PAN],
  ["A new rule for collecting souvenir bags: ___", PAN],
  ["What the caterer is hiding in the back: ___", PAN],
  ["The worst first dance song choice: ___", PAN],
  ["What the aunties are really whispering about at table 4: ___", PAN],
  ["The bride price item that started a negotiation: ___", PAN],
  ["Why the wedding cake has a security guard: ___", PAN],
  ["What the best man's speech should NOT have included: ___", PAN],
  ["The excuse for taking three plates of jollof home: ___", PAN],
  ["The new owambe dance move everyone is learning: ___", PAN],
  ["What the groom's friends did to the wedding car: ___", PAN],
  ["The reason the after-party moved to the car park: ___", PAN, false],
];

const JAPA: readonly Row[] = [
  ["The first thing you said when you felt your first winter: ___", PAN],
  ["What the visa officer really wanted to ask: ___", PAN],
  ["The item your mum packed that customs found: ___", PAN],
  ["What the family group chat thinks you earn abroad: ___", PAN],
  ["The worst thing to say at your first job interview abroad: ___", PAN],
  ["Why your landlord abroad keeps texting you: ___", PAN],
  ["What 'I'm coming home for Christmas' really costs: ___", PAN],
  ["The new skill you learned in your first month abroad: ___", PAN],
  ["What your accent sounds like after one year abroad, according to your cousins: ___", PAN],
  ["The African shop abroad finally started selling ___", PAN],
  ["What you're hiding in your luggage on the way back home: ___", PAN],
  ["The list of things relatives asked you to buy: ___", PAN],
  ["Why the airport queue at home took four hours: ___", PAN],
  ["What your 'abroad' friends call jollof: ___", PAN],
  ["The text you send when you see another African on the train: ___", PAN],
  ["What 'send me something small' really means: ___", PAN],
  ["The reason you now own five winter coats: ___", PAN],
  ["What the Nigerian embassy queue taught you: ___", NG],
  ["The worst time to call home because of the time difference: ___", PAN],
  ["Your dream job title, according to your parents: ___", PAN],
];

function toPrompts(pack: string, prefix: string, rows: readonly Row[]): Prompt[] {
  return rows.map(([text, regions, familySafe], i) => ({
    id: `${prefix}-${String(i + 1).padStart(3, "0")}`,
    text,
    regions,
    familySafe: familySafe ?? true,
    pack,
  }));
}

export const DECK_PACK_PROMPTS: readonly Prompt[] = [
  ...toPrompts("deck_owambe", "owb", OWAMBE),
  ...toPrompts("deck_japa", "jpa", JAPA),
];
