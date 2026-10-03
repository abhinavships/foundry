// Builds docs/atlas/index.html (self-contained page) and docs/BLOCKS.md from docs/atlas/blocks.json.
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const data = JSON.parse(readFileSync(new URL('docs/atlas/blocks.json', root), 'utf8'));
const tpl = readFileSync(new URL('docs/atlas/template.html', root), 'utf8');

const json = JSON.stringify(data).replace(/</g, '\\u003c');
writeFileSync(new URL('docs/atlas/index.html', root), tpl.replace('/*__DATA__*/', () => json));

const kinds = (ks) => ks.map((k) => data.kinds[k].label).join(' + ');
const name = (id) => data.blocks.find((b) => b.id === id).n;
let md = `# Block catalog\n\nGenerated from \`docs/atlas/blocks.json\` by \`node scripts/build-atlas.mjs\`. Do not edit by hand.\n\n`;
md += `## Block types\n\n` + Object.values(data.kinds).map((k) => `- **${k.label}**: ${k.def}`).join('\n') + '\n';
for (const L of data.layers) {
  md += `\n## ${L.code} ${L.name}\n\n${L.purpose}\n`;
  for (const b of data.blocks.filter((x) => x.l === L.id)) {
    md += `\n### ${b.n}\n\n*${kinds(b.k)}* · ${b.s}\n\n**How it works**\n\n${b.h.map((h, i) => `${i + 1}. ${h}`).join('\n')}\n\n`;
    md += `| | |\n|---|---|\n| Inputs | ${b.i.join('; ')} |\n| Outputs | ${b.o.join('; ')} |\n| Feeds into | ${(b.x || []).map(name).join(', ') || '—'} |\n| Built with | ${b.t} |\n| Scale | ${b.p} |\n| Guardrails | ${b.g} |\n`;
  }
}
md += `\n## Scenario traces\n`;
for (const s of data.scenarios) {
  md += `\n### ${s.name}\n\n*${s.family} · reader: ${s.who}*\n\n${s.steps.map(([id, t], i) => `${i + 1}. **${name(id)}**: ${t}`).join('\n')}\n`;
}
writeFileSync(new URL('docs/BLOCKS.md', root), md);
console.log(`atlas: ${data.blocks.length} blocks, ${data.scenarios.length} scenarios`);
