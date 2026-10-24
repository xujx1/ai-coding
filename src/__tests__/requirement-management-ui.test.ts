import * as assert from 'assert/strict';
import * as fs from 'fs';
import test from 'node:test';

test('requirement management does not expose app counts before ownership review', (t) => {
  if (!fs.existsSync('demo/mrd/targeted-campaign-stock-guard-mrd.md')) {
    t.skip('explicit Demo MRD is unavailable in this production-only checkout');
    return;
  }
  const app = fs.readFileSync('web/app.js', 'utf-8');
  const mrd = fs.readFileSync('demo/mrd/targeted-campaign-stock-guard-mrd.md', 'utf-8');

  const start = app.indexOf("if (module === 'requirements')");
  const end = app.indexOf("  return '';", start);
  const requirementBlock = app.slice(start, end);

  assert.ok(start > 0);
  assert.equal(requirementBlock.includes('应用数'), false);
  assert.equal(requirementBlock.includes("req.appCount"), false);
  assert.ok(requirementBlock.includes('formatRequirementPhase(req)'));
  assert.ok(requirementBlock.includes('formatRequirementStatus(req)'));
  assert.ok(app.includes('启动 PI 流程'));
  assert.ok(app.includes('startPiFromRequirement'));
  assert.equal(app.includes('需求评审通过'), false);
  assert.equal(mrd.includes('影响应用范围'), false);
  assert.equal(/`(?:console|ecom-[^`]+)`/.test(mrd), false);
});
