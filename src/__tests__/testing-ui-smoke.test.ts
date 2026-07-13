import * as assert from 'assert/strict';
import * as fs from 'fs';
import test from 'node:test';

test('web removes standalone Testing Management page while backend API remains mounted', () => {
  const html = fs.readFileSync('web/index.html', 'utf-8');
  const app = fs.readFileSync('web/app.js', 'utf-8');
  const server = fs.readFileSync('src/server/app.ts', 'utf-8');

  assert.equal(/data-module="testing"/.test(html), false);
  assert.equal(/上传项目文件夹/.test(html), false);
  assert.equal(/project-folder-input/.test(html), false);
  assert.equal(/renderTestingManagementPage/.test(app), false);
  assert.equal(/startTestingWorkflowFromCurrentRun/.test(app), false);
  assert.equal(/submitTestingReview/.test(app), false);
  assert.match(server, /testingController/);
});
