'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Hexo = require('hexo');

test('Hexo generates deployment metadata and refreshes it on another build', async () => {
  const tempRoot = path.resolve(os.tmpdir());
  const directory = await fs.mkdtemp(path.join(tempRoot, 'hexo-deploy-metadata-'));
  const site = new Hexo(directory, { silent: true });
  try {
    await fs.mkdir(path.join(directory, 'scripts'));
    await fs.mkdir(path.join(directory, 'source'));
    await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify({ private: true, hexo: { version: '6.3.0' } }));
    await fs.writeFile(path.join(directory, '_config.yml'), 'url: https://example.test/blog\nroot: /blog/\ntheme: false\n');
    await fs.copyFile(path.resolve(__dirname, '../../scripts/deploy-metadata.js'), path.join(directory, 'scripts/deploy-metadata.js'));
    const before = Date.now();
    await site.init();
    await site.call('generate');

    const filename = path.join(directory, 'public/deploy.json');
    const first = JSON.parse(await fs.readFile(filename, 'utf8'));
    assert.ok(Date.parse(first.at) >= before);
    assert.ok(Date.parse(first.at) <= Date.now());
    assert.ok(first.at.endsWith('Z'));

    await fs.writeFile(filename, JSON.stringify({ at: '2000-01-01T00:00:00.000Z' }));
    await site.call('generate');
    const second = JSON.parse(await fs.readFile(filename, 'utf8'));
    assert.ok(Date.parse(second.at) >= Date.parse(first.at));
  } finally {
    await site.exit();
    assert.equal(path.dirname(path.resolve(directory)), tempRoot);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
