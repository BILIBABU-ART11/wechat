const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const requiredFiles = [
  'project.config.json',
  'app.js',
  'app.json',
  'app.wxss',
  'sitemap.json',
  'README.md',
  'docs/architecture.md',
  'docs/api-design.md',
  'docs/development-guide.md',
  'docs/env-example.md',
  'services/request.js',
  'services/auth.js',
  'services/api.js',
  'services/mock.js',
  'utils/format.js',
  'utils/constants.js',
  'utils/storage.js',
  'utils/permission.js',
  'utils/authGuard.js',
  'utils/normalize.js',
  'server/package.json',
  'server/src/app.js',
  'server/src/index.js',
  'server/tests/api.test.js'
];

const pages = ['login', 'bind', 'index', 'list', 'detail', 'messages', 'profile'];
const components = ['article-card', 'status-tag', 'score-badge', 'empty-state', 'loading-state'];

for (const page of pages) {
  for (const ext of ['js', 'wxml', 'wxss', 'json']) requiredFiles.push(`pages/${page}/${page}.${ext}`);
}

for (const component of components) {
  for (const ext of ['js', 'wxml', 'wxss', 'json']) requiredFiles.push(`components/${component}/${component}.${ext}`);
}

const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  console.error('Missing required files:');
  missing.forEach((file) => console.error(`- ${file}`));
  process.exit(1);
}

for (const file of requiredFiles.filter((item) => item.endsWith('.json'))) {
  try {
    JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  } catch (error) {
    console.error(`Invalid JSON: ${file}`);
    console.error(error.message);
    process.exit(1);
  }
}

const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const expectedTabs = ['pages/index/index', 'pages/profile/profile'];
const actualTabs = (appConfig.tabBar && appConfig.tabBar.list || []).map((item) => item.pagePath);
const missingTabs = expectedTabs.filter((tab) => !actualTabs.includes(tab));
if (missingTabs.length) {
  console.error(`Missing tabBar pages: ${missingTabs.join(', ')}`);
  process.exit(1);
}

console.log(`Structure validation passed: ${requiredFiles.length} files checked.`);
