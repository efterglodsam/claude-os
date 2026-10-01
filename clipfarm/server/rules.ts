import fs from 'node:fs';
import path from 'node:path';
import { paths } from './config.ts';

export const DEFAULT_RULES = `# Regler och kriterier för klippen

(Klistra in reglerna från clipping-communityt här – eller synka dem från Discord.
Agenterna läser hela den här filen före varje jobb.)

Exempel på sådant som bör stå här:
- Tillåten längd på klipp
- Vad som är förbjudet (t.ex. känsligt innehåll, tredjepartsmusik)
- Krav på format, text/undertexter, vattenstämpel, titel/beskrivning
- Hur och var klipp ska skickas in
`;

export function loadRules(): string {
  try {
    return fs.readFileSync(paths.rules, 'utf8');
  } catch {
    return DEFAULT_RULES;
  }
}

export function saveRules(text: string) {
  fs.mkdirSync(path.dirname(paths.rules), { recursive: true });
  fs.writeFileSync(paths.rules, text);
}

export const rulesAreSet = () => {
  const r = loadRules().trim();
  return r.length > 0 && r !== DEFAULT_RULES.trim();
};
