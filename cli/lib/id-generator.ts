import { randomInt } from "crypto";

// 256 common, easy-to-type English words (4 words from 256 = 256^4 ≈ 4.3 billion combinations)
const WORDS = [
  "amber","angel","apple","arrow","atlas","badge","beach","bells","berry","blade",
  "blaze","bloom","board","bonus","brave","brick","brush","cabin","candy","cargo",
  "cedar","chain","charm","chess","cliff","clock","cloud","cobra","coral","comet",
  "crane","crash","creek","crown","crush","curve","dance","delta","denim","diary",
  "diver","dodge","dream","drift","eagle","earth","elbow","ember","epoch","fairy",
  "feast","fiber","flame","flash","fleet","flint","flood","flora","forge","frost",
  "fruit","gamma","ghost","glade","gleam","globe","grace","grain","grape","grasp",
  "green","grove","guide","haven","heart","hedge","heron","honey","horse","house",
  "ivory","jewel","joint","joker","juice","karma","kiosk","knack","label","latch",
  "lemon","light","lilac","linen","llama","lodge","lotus","lunar","magic","mango",
  "maple","march","marsh","medal","melon","metal","mirth","model","moose","mount",
  "mural","nerve","noble","north","novel","ocean","olive","onion","opera","orbit",
  "otter","oxide","paint","panel","pasta","patch","peach","pearl","penny","perch",
  "photo","pilot","pixel","plant","plume","point","polar","prism","pulse","quail",
  "queen","quest","quiet","quilt","radar","ranch","raven","realm","ridge","river",
  "robin","robot","rocky","rouge","royal","ruby","ruler","sage","sandy","satin",
  "scout","seven","shade","shark","sheep","shell","shine","shore","sigma","silk",
  "siren","slate","smile","smoke","solar","sonic","spark","spice","spine","spoke",
  "spray","staff","stage","stamp","steam","steel","stern","stone","storm","stove",
  "sugar","sunny","surge","swift","table","tiger","toast","token","torch","tower",
  "trace","trail","trend","trout","tulip","twist","ultra","uncle","unity","upper",
  "urban","valve","vapor","vault","venus","verse","vigor","vine","viola","vivid",
  "vocal","voice","wagon","water","whale","wheat","whole","widow","wind","witch",
  "world","wrist","xenon","yacht","youth","zebra","zones","acorn","banjo","basil",
  "bison","bliss","bolts","brook","camel","chess","cider","cloak","coast","daisy",
  "depot","ember","finch","flame","frost","glyph",
];

function pickWord(): string {
  return WORDS[randomInt(0, WORDS.length)];
}

/**
 * Generate unique 4-word identifiers like "amber-coral-frost-lunar".
 * @param count Number of identifiers to generate
 * @param existing Set of identifiers already in use (from DB)
 * @returns Array of unique identifier strings
 */
export function generateIdentifiers(count: number, existing: Set<string>): string[] {
  const ids: string[] = [];
  const allUsed = new Set(existing);
  let attempts = 0;
  const maxAttempts = count * 100;

  while (ids.length < count) {
    if (attempts++ > maxAttempts) {
      throw new Error(
        `Could not generate ${count} unique identifiers after ${maxAttempts} attempts.`
      );
    }
    const id = [pickWord(), pickWord(), pickWord(), pickWord()].join("-");
    if (!allUsed.has(id)) {
      allUsed.add(id);
      ids.push(id);
    }
  }

  return ids;
}
