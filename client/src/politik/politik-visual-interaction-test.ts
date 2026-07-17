import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./PolitikPlay.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
let passed = 0;

function check(condition: boolean, label: string) {
  if (!condition) throw new Error(`Politik visual interaction contract failed: ${label}`);
  passed++;
}

check(source.includes('data-testid="politik-asset-company-picker"'), 'Assets select an authentic Company card');
check(source.includes('data-testid="politik-opening-market-picker"'), 'Companies select a visual Market token');
check(source.includes('data-testid="politik-margin-overflow-picker"'), 'Margin overflow uses visual track/Market choices');
check(source.includes('data-testid="politik-propaganda-replacement-picker"'), 'Propaganda replacement selects an authentic card');
check(source.includes('data-testid="politik-clash-defender-picker"'), 'Clash defender uses Nation cards');
check(source.includes('className="pk-edge-ability-card"') && source.includes('card={handCardArt(ability.card)}'), 'eligible Clash abilities display authentic card art');
check(source.includes('<PolitikCard scene={scene} card={handCardArt(company.card)}'), 'Company targets contain authentic card art');
check(!source.includes('<label>TARGET COMPANY<select'), 'ordinary Asset targeting has no dropdown');
check(!source.includes('<label>OPENING MARKET<select'), 'ordinary Company Market choice has no dropdown');
check(!source.includes('<label>MARGIN ABOVE 9<select'), 'ordinary Margin overflow has no dropdown');
check(!source.includes('<label>REPLACE PROPAGANDA<select'), 'ordinary Propaganda replacement has no dropdown');
check(!source.includes('<label>DEFENDER<select'), 'Clash defender has no dropdown');
check(!source.includes('<label>YOUR COMPANY<select'), 'corporate Clash attacker has no dropdown');
check(css.includes('.pk-card-targets') && css.includes('.pk-market-token'), 'visual card and token targets have dedicated styling');
check(source.includes('politik-clash-exception-toggle') && source.includes('showClashExceptionTools &&'), 'unencoded Clash forms stay disclosure-gated');

console.log(`Politik visual interaction contract: ${passed}/${passed} passed`);
