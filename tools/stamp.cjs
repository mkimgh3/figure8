// Writes version.json: the build named in js/main.js and the list of files the game is made of. Run it before every
// publish (npm run stamp); js/update.js reads it to bring a Home Screen copy up to date.
const fs = require('fs'),
  path = require('path'),
  ROOT = path.resolve(__dirname, '..');
const build = /const BUILD = '([^']+)'/.exec(fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8'))[1];
const walk = (dir) =>
  fs
    .readdirSync(path.join(ROOT, dir), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(dir + '/' + e.name) : [dir + '/' + e.name]));
const files = ['index.html', 'manifest.webmanifest', ...walk('css'), ...walk('js'), ...walk('assets')].sort();
fs.writeFileSync(path.join(ROOT, 'version.json'), JSON.stringify({ build, files }, null, 1) + '\n');
console.log('version.json:', build, files.length, 'files');
