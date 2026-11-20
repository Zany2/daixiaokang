'use strict';

hexo.extend.generator.register('deploy_back20261119-metadata', function () {
  return {
    path: 'deploy_back20261119.json',
    data: JSON.stringify({ at: new Date().toISOString() }) + '\n'
  };
});
