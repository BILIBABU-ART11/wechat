#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const expectedAppId = process.env.WECHAT_APP_ID || 'wx964c3e4ac820ac37';
const projectFile = path.resolve(__dirname, '..', 'project.config.json');
const project = JSON.parse(fs.readFileSync(projectFile, 'utf8').replace(/^\uFEFF/, ''));

if (project.appid !== expectedAppId) {
  console.error(`AppID mismatch: project.config.json=${project.appid}, WECHAT_APP_ID=${expectedAppId}`);
  process.exit(1);
}

console.log(`Deploy config validation passed: AppID ${expectedAppId}`);
