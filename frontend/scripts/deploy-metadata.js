'use strict';

hexo.extend.generator.register('deploy-metadata', function () {
  return {
    path: 'deploy.json',
    data: JSON.stringify({ at: new Date().toISOString() }) + '\n'
  };
});
