import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyClause, splitClauses, classifyRecord } from '../audit/classify.js';

const clause = (text) => splitClauses(text).map(classifyClause);

test('切分保留字符区间，左闭右开且可还原原文', () => {
  const text = '应届生皆可报名。有同类项目经历者优先，可入职后补修内部课。';
  const parts = splitClauses(text);
  assert.equal(parts.length, 3);
  for (const part of parts) {
    assert.equal(text.slice(part.start, part.end), part.text);
  }
  assert.deepEqual(parts[0], { text: '应届生皆可报名', start: 0, end: 7 });
});

test('强制资格、偏好、可补足条件、入口限制分别定性', () => {
  const [open, preference, remediable] = clause(
    '应届生皆可报名。有同类项目经历者优先，可入职后补修内部课。');
  assert.equal(open.type, 'open');
  assert.equal(preference.type, 'preference');
  assert.equal(remediable.type, 'remediable');

  const [entry] = clause('只有结业于岭云课的同学才能通过本页申请。');
  assert.equal(entry.type, 'entry');

  const [mandatory] = clause('两个岗位均须完成岭云课方能报名。');
  assert.equal(mandatory.type, 'mandatory');
});

test('否定句带 negation 标记，不被当成强制资格', () => {
  const [negated] = clause('技术助理不要求持证。');
  assert.ok(negated.flags.includes('negation'));
  assert.notEqual(negated.type, 'mandatory');
});

test('转折与例外按 scope 定性', () => {
  const [scope] = clause('共享说明中的结业条件仅适用于设备助理岗。');
  assert.equal(scope.type, 'scope');
});

test('历史信息与术语释义各自归类，“指”优先于历史标记', () => {
  const [definition] = clause('我们说的“项目经历”指社团课外实践，欢迎零经验。');
  assert.equal(definition.type, 'definition');
  const [history] = clause('上一期要求已获得训练证书。');
  assert.equal(history.type, 'historical');
});

test('引用其他通知的指引句定性为 reference，不增设门槛', () => {
  const [reference] = clause('岗位条件以各自的报名须知为准。');
  assert.equal(reference.type, 'reference');
});

test('无标记文本归为 neutral，不强行解释', () => {
  const [neutral] = clause('正文更改尚未同步。');
  assert.equal(neutral.type, 'sync');
  const [plain] = clause('具体安排另行通知。');
  assert.equal(plain.type, 'neutral');
});

test('classifyRecord 保留完整出处信息', () => {
  const row = { id: 'a1', employer: '岭云工艺', role: '技术助理', location: '校园网页', text: '有同类项目经历者优先。' };
  const [statement] = classifyRecord(row, '岗位来稿.json');
  assert.equal(statement.source.file, '岗位来稿.json');
  assert.equal(statement.source.id, 'a1');
  assert.equal(statement.source.location, '校园网页');
  assert.deepEqual(statement.range, [0, 10]);
});
