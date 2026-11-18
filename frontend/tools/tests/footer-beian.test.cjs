'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const pug = require('pug');
const cheerio = require('cheerio');

const root = path.resolve(__dirname, '../..');
const filing = {
  number: '鲁公网安备37021102001864号',
  link: 'https://beian.mps.gov.cn/#/query/webSearch?code=37021102001864',
  icon: '/assets/badge/gonganlianwangbeian.png'
};

function renderFooter(siteRoot, publicSecurity) {
  const callbacks = {};
  const hexo = {
    config: { root: siteRoot, url: 'https://site.test' },
    theme: { config: { site_media: { base_url: 'https://cdn.example.test/assets' } } },
    extend: {
      helper: { register() {} },
      filter: { register(name, callback) { callbacks[name] = callback; } }
    }
  };
  const script = path.join(root, 'scripts/site-media.js');
  vm.runInNewContext(fs.readFileSync(script, 'utf8'), { hexo, require: createRequire(script) });
  const html = pug.renderFile(path.join(root, 'themes/fomalhaut/layout/includes/footer.pug'), {
    theme: {
      footer: { owner: { enable: true, since: 2023 }, icp: '鲁ICP备2026066398号-1', public_security: publicSecurity },
      error_img: { flink: '/assets/fallback/avatar.png' }
    },
    config: { author: 'Zany' },
    url_for: value => siteRoot + value.replace(/^\//, ''),
    full_url_for: value => 'https://site.test' + value
  });
  return cheerio.load(callbacks['after_render:html'](html));
}

for (const siteRoot of ['/', '/blog/']) {
  test(`police filing keeps its icon on the current origin under ${siteRoot}`, () => {
    const dom = renderFooter(siteRoot, filing);
    const link = dom('.footer-public-security a');
    assert.equal(link.attr('href'), filing.link);
    assert.equal(link.attr('rel'), 'noopener noreferrer');
    assert.equal(link.text(), filing.number);
    assert.equal(link.find('img').attr('src'), siteRoot + filing.icon.slice(1));
    assert.equal(link.find('img').attr('width'), '20');
    assert.equal(link.find('span').length, 0);
    assert.equal(dom('.footer-icp a').text(), '鲁ICP备2026066398号-1');
  });
}

test('a footer without police filing configuration still renders its ICP link', () => {
  const dom = renderFooter('/', undefined);
  assert.equal(dom('.footer-public-security').length, 0);
  assert.equal(dom('.footer-icp a').length, 1);
});
