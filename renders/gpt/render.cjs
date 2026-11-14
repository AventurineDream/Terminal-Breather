// Reproduce terminal captures: node renders/gpt/render.cjs [before|after]
// `before` reads the untouched polish base; neither mode changes the worktree source.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const mode = process.argv[2] || 'after';
if (!['before', 'after'].includes(mode)) throw new Error('Use before or after');
const root = path.resolve(__dirname, '../..');
const source = mode === 'before'
  ? cp.execFileSync('git', ['show', 'ec9fa05:PlanetArt.js'], { cwd: root, encoding: 'utf8' })
  : fs.readFileSync(path.join(root, 'PlanetArt.js'), 'utf8');
const Art = new Function(source.replace(/^\.pragma library\n/, '') + '\nreturn {frame, composite};')();
const figures = ['iris', 'orbits', 'petal', 'lattice'];
const sizes = [[80, 24, 21], [120, 40, 37], [200, 60, 45]];
const frames = [];
const folder = path.join(__dirname, mode);
fs.mkdirSync(folder, { recursive: true });
for (const [width, height, cells] of sizes) {
  for (const id of figures) {
    const frame = Art.frame(id, { cells, aspect: 0.5, timeMs: 0, fullness: 0.6 });
    const lines = Art.composite(frame).split('\n');
    const top = Math.floor((height - frame.rows) / 2);
    const left = Math.floor((width - frame.cols) / 2);
    const screen = Array.from({length: height}, (_, row) =>
      row >= top && row < top + frame.rows
        ? (' '.repeat(left) + lines[row - top]).padEnd(width)
        : ' '.repeat(width));
    fs.writeFileSync(path.join(folder, `${id}-${width}x${height}.txt`), screen.join('\n') + '\n');
    frames.push({ id, width, height, top, left, ...frame });
  }
}
// Layer data preserves the real palette for colour contact sheets.
fs.writeFileSync(path.join(folder, 'layers.json'), JSON.stringify(frames));
console.log(`${mode}: saved ${frames.length} terminal captures`);
// A real ANSI terminal view of the smallest figures, not a source-text check.
if (process.stdout.isTTY || process.argv.includes('--view')) {
  for (const id of figures) {
    const f = frames.find(f => f.id === id && f.width === 80);
    const layers = f.layers.map(l => l.text.split('\n'));
    console.log(`\n${mode}: ${id} (21 rows, aspect 0.5, fullness 0.6)`);
    for (let r = 0; r < f.rows; r++) {
      let line = '';
      for (let c = 0; c < f.cols; c++) {
        const at = layers.findIndex(l => l[r][c] !== ' ');
        if (at < 0) { line += ' '; continue; }
        const color = f.layers[at].color.match(/\w\w/g).map(v => parseInt(v, 16));
        line += `\x1b[38;2;${color.join(';')}m${layers[at][r][c]}`;
      }
      console.log(line + '\x1b[0m');
    }
  }
}

// Colour proof uses the installed terminal font at an 8x16 cell aspect.
// The text captures above are full terminals; these sheets crop only margins.
if (mode === 'after') {
  const before = JSON.parse(fs.readFileSync(path.join(__dirname, 'before/layers.json'), 'utf8'));
  const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  for (const [width, height] of sizes) {
    const old = before.filter(f => f.width === width);
    const next = frames.filter(f => f.width === width);
    const panelWidth = next[0].cols * 8 + 32;
    const panelHeight = next[0].rows * 16 + 48;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${panelWidth * 2}" height="${panelHeight * 4}" style="background:#101512">`;
    svg += `<rect width="100%" height="100%" fill="#101512"/>`;
    for (let i = 0; i < figures.length; i++) {
      for (let side = 0; side < 2; side++) {
        const f = side ? next[i] : old[i];
        const x = side * panelWidth + 16, y = i * panelHeight;
        svg += `<text x="${x}" y="${y + 20}" fill="#D9E1D7" font-family="monospace" font-size="12">${f.id} ${width}x${height} ${side ? 'after' : 'before'}</text>`;
        for (const layer of f.layers) {
          layer.text.split('\n').forEach((line, row) => {
            svg += `<text xml:space="preserve" x="${x}" y="${y + 46 + row * 16}" fill="${layer.color}" font-family="JetBrainsMono Nerd Font" font-size="13.333333">${escape(line)}</text>`;
          });
        }
      }
    }
    svg += '</svg>';
    const output = path.join(__dirname, `comparison-${width}x${height}`);
    fs.writeFileSync(output + '.svg', svg);
    cp.execFileSync('rsvg-convert', [output + '.svg', '-o', output + '.png']);
  }
}
