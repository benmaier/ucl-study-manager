import { randomInt } from "crypto";

// 256 common, easy-to-type English words
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

function pickWords(n: number): string[] {
  return Array.from({ length: n }, () => WORDS[randomInt(0, WORDS.length)]);
}

/**
 * Generate unique 3-word usernames like "amber-coral-frost".
 * Also generates a 6-word password for each.
 * @returns Array of { username, password } pairs
 */
export function generateCredentials(
  count: number,
  existingUsernames: Set<string>
): { username: string; password: string }[] {
  const results: { username: string; password: string }[] = [];
  const allUsed = new Set(existingUsernames);
  let attempts = 0;
  const maxAttempts = count * 100;

  while (results.length < count) {
    if (attempts++ > maxAttempts) {
      throw new Error(
        `Could not generate ${count} unique credentials after ${maxAttempts} attempts.`
      );
    }
    const username = pickWords(3).join("-");
    if (!allUsed.has(username)) {
      allUsed.add(username);
      const password = pickWords(6).join("-");
      results.push({ username, password });
    }
  }

  return results;
}
