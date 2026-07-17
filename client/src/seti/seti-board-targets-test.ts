import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./SetiScene.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('./setiBoardTargets.css', import.meta.url), 'utf8');
const tableCss = readFileSync(new URL('./seti.css', import.meta.url), 'utf8');
const soloCss = readFileSync(new URL('./setiSolo.css', import.meta.url), 'utf8');

function cssBlock(styles: string, selector: RegExp, message: string): string {
  const match = selector.exec(styles);
  assert.ok(match?.[1], message);
  return match[1];
}

for (const prop of ['goldTileTargets', 'onGoldTile', 'marsDataTargets', 'onMarsData', 'earthStepTarget', 'onEarthStep']) {
  assert.match(source, new RegExp(`\\b${prop}\\b`), `SetiTable must expose ${prop}`);
}

assert.match(source, /data-seti-target="gold-tile"[\s\S]*?data-seti-value=\{tile\.id\}/, 'gold targets preserve the exact tile id');
assert.match(source, /data-seti-target="mars-first-data"[\s\S]*?data-seti-value=\{amount\}/, 'Mars targets preserve the printed amount');
assert.match(source, /earthStep \? 'earth-step' : launch \? 'launch'/, 'Scan Earth target takes priority over launch');
assert.match(source, /target && \(\s*<button[\s\S]*?seti-board-gold-target/, 'gold buttons only render for targeted tiles');
assert.match(source, /target \? \(\s*<button[\s\S]*?seti-board-mars-data-target/, 'Mars buttons only render for targeted tokens');
assert.match(css, /\.seti-board-gold-target[\s\S]*?width:\s*max\(100%,\s*40px\)[\s\S]*?height:\s*max\(100%,\s*40px\)/, 'gold hit area is at least 40px');
assert.match(css, /\.seti-board-mars-data-target[\s\S]*?width:\s*40px[\s\S]*?height:\s*40px/, 'Mars hit area is at least 40px');
assert.match(css, /\.seti-cell-target\.is-earth-step[\s\S]*?width:\s*max\(8\.5%,\s*40px\)[\s\S]*?min-height:\s*40px/, 'Scan Earth hit area is at least 40px');

const spacecraftChoice = cssBlock(tableCss, /\.seti-planet-marker\.is-choice\s*\{([^}]*)\}/, 'spacecraft choice style must exist');
assert.match(spacecraftChoice, /width:\s*40px/, 'spacecraft choices have a 40px-wide hit area');
assert.match(spacecraftChoice, /height:\s*40px/, 'spacecraft choices have a 40px-tall hit area');

const alienCardChoice = cssBlock(tableCss, /\.seti-alien-deck\.is-choice,\s*\.seti-alien-face-up\.is-choice\s*\{([^}]*)\}/, 'alien card choice style must exist');
assert.match(alienCardChoice, /min-width:\s*40px/, 'alien deck and face-up choices are at least 40px wide');
assert.match(alienCardChoice, /min-height:\s*40px/, 'alien deck and face-up choices are at least 40px tall');

const sectorChoice = cssBlock(tableCss, /\.seti-sector-target\s*\{([^}]*)\}/, 'sector target style must exist');
assert.match(sectorChoice, /min-width:\s*40px/, 'sector targets stay at least 40px wide on short screens');
assert.match(sectorChoice, /min-height:\s*40px/, 'sector targets stay at least 40px tall on short screens');

const exchangeClose = cssBlock(tableCss, /\.seti-exchange-tray\s*>\s*\.seti-close\s*\{([^}]*)\}/, 'exchange close style must exist');
assert.match(exchangeClose, /width:\s*40px/, 'exchange close control stays 40px wide');
assert.match(exchangeClose, /height:\s*40px/, 'exchange close control stays 40px tall');

const soloTask = cssBlock(soloCss, /button\.seti-solo-task\.is-eligible\s*\{([^}]*)\}/, 'eligible solo task style must exist');
assert.match(soloTask, /min-width:\s*40px/, 'eligible solo task circles stay at least 40px wide');
assert.match(soloTask, /min-height:\s*40px/, 'eligible solo task circles stay at least 40px tall');

const compactProjectCards = cssBlock(tableCss, /\.seti-table\.is-compact\s+\.seti-row-card,\s*\.seti-table\.is-compact\s+\.seti-row-deck\s*\{([^}]*)\}/, 'compact project-row style must exist');
assert.match(compactProjectCards, /min-width:\s*40px/, 'compact project-row cards stay at least 40px wide');
assert.match(tableCss, /@media\s*\(max-width:\s*900px\)[\s\S]*?\.seti-project-dock\s*\{[^}]*grid-template-columns:\s*47px\s+repeat\(3,\s*minmax\(40px,\s*1fr\)\)/, 'responsive personal project row keeps three 40px card columns');

assert.match(source, /--seti-mars-offset['"]?:\s*`\$\{\(index - \(planet\.firstLandingBonuses\.length - 1\) \/ 2\) \* 44\}px`/, 'Mars targets receive distinct 44px fan offsets');
const marsTarget = cssBlock(css, /\}\r?\n\r?\n\.seti-board-mars-data-target\s*\{([^}]*)\}/, 'Mars target style must exist');
assert.match(marsTarget, /var\(--seti-mars-offset,\s*0px\)/, 'Mars target transform consumes its fan offset');

const goldFan = cssBlock(css, /\.seti-gold-rack:has\(\.seti-board-gold-target\)\s*\{([^}]*)\}/, 'targeted gold rack fan style must exist');
assert.match(goldFan, /width:\s*max\(28%,\s*184px\)/, 'targeted gold rack expands enough for four 40px tiles');
assert.match(goldFan, /gap:\s*8px/, 'targeted gold rack separates adjacent hit areas');
assert.match(css, /\.seti-table\.is-compact\s+\.seti-gold-rack:has\(\.seti-board-gold-target\)\s*\{[^}]*width:\s*184px/, 'compact targeted gold rack uses the non-overlapping fan width');

assert.match(source, /className=\{`seti-tech-stack[\s\S]*?disabled=\{!interactive \|\| !legal\}/, 'technology controls are disabled on the noninteractive TV table');
assert.match(source, /className=\{`seti-row-card[\s\S]*?disabled=\{!interactive\}/, 'project-row controls are disabled on the noninteractive TV table');

console.log('seti board targets: ok');
