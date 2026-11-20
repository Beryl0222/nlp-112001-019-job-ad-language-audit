import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readMaterials } from '../materials.js';
import { classifyTables } from '../audit/classify.js';
import { reconcile } from '../audit/reconcile.js';
import { buildStudentView } from '../audit/report.js';
import { runAudit } from '../audit/cli.js';

async function load() {
  const tables = await readMaterials();
  return reconcile(classifyTables(tables));
}

test('技术助理：入口与澄清冲突，结论为暂缓并给出渠道待改措辞', async () => {
  const result = await load();
  const tech = result.roles.find(role => role.role === '技术助理' && role.employer === '岭云工艺');
  assert.equal(tech.decision, '暂缓发布');
  const kinds = tech.blockers.map(blocker => blocker.kind);
  assert.ok(kinds.includes('entry-mismatch'));
  assert.ok(kinds.includes('shared-overreach'));
  assert.ok(tech.channelEdits.some(edit => edit.channel === '报名须知'));
  assert.ok(tech.channelEdits.some(edit => edit.channel === '移动端'));
  // 偏好与可补足条件仍可公开，不等于整岗被否决
  assert.ok(tech.publishableFragments.some(item => item.kind === '偏好'));
  assert.ok(tech.publishableFragments.some(item => item.kind === '可补足条件'));
});

test('设备助理：强制结业范围已收窄，结论为可发布', async () => {
  const result = await load();
  const equipment = result.roles.find(role => role.role === '设备助理');
  assert.equal(equipment.decision, '可发布');
  assert.equal(equipment.currentRequirement.policy, 'mandatory');
  assert.deepEqual(equipment.blockers, []);
});

test('另一家岭云：独立雇主的术语释义不与岭云工艺混用', async () => {
  const result = await load();
  const internship = result.roles.find(role => role.employer === '另一家岭云');
  assert.equal(internship.decision, '可发布');
  assert.equal(internship.currentRequirement.policy, 'none');
  const warning = result.glossary.crossEmployerWarnings.find(item => item.term === '项目经历');
  assert.ok(warning);
  assert.equal(warning.definedBy, '另一家岭云');
  assert.ok(warning.otherUses.every(ref => ref.employer !== '另一家岭云'));
});

test('雇主澄清 c2 被识别为歧义消除，渠道反馈 c1 不被当作澄清', async () => {
  const result = await load();
  const c2 = result.clarifications.find(item => item.id === 'c2');
  const c1 = result.clarifications.find(item => item.id === 'c1');
  assert.equal(c2.kind, '雇主澄清');
  assert.ok(c2.resolvesAmbiguity.includes('不要求持证'));
  assert.equal(c1.kind, '渠道维护方反馈');
  assert.equal(c1.resolvesAmbiguity, null);
});

test('共享模板 s1 只影响被错误覆盖的岗位，s2 指引相容', async () => {
  const result = await load();
  const s1 = result.sharedDrafts.find(draft => draft.id === 's1');
  const s2 = result.sharedDrafts.find(draft => draft.id === 's2');
  const overreach = s1.findings.find(finding => finding.kind === 'shared-overreach');
  assert.deepEqual(overreach.staleRoles, ['技术助理']);
  assert.ok(s2.findings.every(finding => finding.consistent));
});

test('历史条件标记为不沿用，并还原技术助理暂缓时间线', async () => {
  const result = await load();
  assert.ok(result.staleRecords.some(record => record.ref.id === 'a5'));
  const tech = result.roles.find(role => role.role === '技术助理');
  const stages = tech.holdTimeline.map(point => point.stage);
  assert.deepEqual(stages, ['历史门槛', '入口未同步', '雇主澄清', '当前暂缓依据']);
  assert.ok(tech.holdTimeline.at(-1).summary.includes('入口'));
});

test('每条结论都带记录编号与字符区间出处', async () => {
  const result = await load();
  for (const role of result.roles) {
    for (const blocker of role.blockers) {
      assert.ok(blocker.ref.id && Array.isArray(blocker.ref.range));
    }
  }
});

test('学生视图只含当前资格、偏好与出处，不含暂缓决定', async () => {
  const result = await load();
  const view = buildStudentView(result);
  assert.equal(view.length, 3);
  const strings = JSON.stringify(view);
  assert.ok(!strings.includes('暂缓'));
  const tech = view.find(item => item.role === '技术助理');
  assert.equal(tech.currentRequirement.kind, '可补足条件（非持证门槛）');
});

test('runAudit 不接收求职者数据，结论均为审核建议', async () => {
  const result = await runAudit();
  assert.ok(result.advisory.includes('不收集求职者资料'));
  assert.ok(result.advisory.includes('不代替学校作录用决定'));
});
