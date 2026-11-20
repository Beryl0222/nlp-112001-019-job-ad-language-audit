// 交叉核对：把岗位来稿、共享稿、更正口径按雇主与岗位归并，
// 依据学校口径 r1 给出“可发布 / 暂缓”的审核建议与证据链。
// 工具不收集求职者资料，也不代替学校作录用决定，结论均为审核建议。

import { TYPE_LABELS } from './classify.js';

const CORRECTION_FILE = '更正与审核口径.json';
const DRAFT_FILE = '岗位来稿.json';
const SHARED_FILE = '共享稿.json';

// 近似词族：同一个词在不同雇主、不同年份可能指不同事物，逐条登记出处。
const PROBE_TERMS = ['项目经历', '结业', '岭云课', '证书', '持证', '补修'];

function ref(statement) {
  return {
    file: statement.source.file,
    id: statement.source.id,
    range: statement.range,
    location: statement.source.location ?? statement.source.channel ?? null,
    employer: statement.source.employer,
    role: statement.source.role
  };
}

function splitRoles(rolesField) {
  return rolesField.split(/[、,，]/).map(item => item.trim()).filter(Boolean);
}

function mentionsRole(statement, role) {
  return statement.text.includes(role);
}

// 术语表：显式释义 + 近似词出现位置，跨雇主不合并含义。
export function buildGlossary(statements) {
  const definitions = statements
    .filter(statement => statement.type === 'definition')
    .map(statement => {
      const quoted = statement.text.match(/[“"]([^”"]+)[”"]/);
      return {
        term: quoted ? quoted[1] : statement.text.split('指')[0],
        meaning: statement.text.split('指').slice(1).join('指').trim(),
        employer: statement.source.employer,
        ref: ref(statement),
        note: '释义只对该雇主的文案有效，不得套用到其他雇主或其他岗位'
      };
    });

  const termOccurrences = PROBE_TERMS.map(term => ({
    term,
    occurrences: statements
      .filter(statement => statement.text.includes(term))
      .map(statement => ({
        employer: statement.source.employer,
        role: statement.source.role,
        kind: TYPE_LABELS[statement.type],
        historical: statement.type === 'historical',
        ref: ref(statement)
      }))
  })).filter(entry => entry.occurrences.length > 0);

  const crossEmployerWarnings = [];
  for (const definition of definitions) {
    const otherUses = termOccurrences
      .find(entry => entry.term === definition.term)?.occurrences
      .filter(item => item.employer !== definition.employer) ?? [];
    if (otherUses.length > 0) {
      crossEmployerWarnings.push({
        term: definition.term,
        definedBy: definition.employer,
        warning: `“${definition.term}”在 ${definition.employer} 处指“${definition.meaning}”，其他雇主处的用法须按各自原文理解`,
        otherUses: otherUses.map(item => item.ref)
      });
    }
  }

  return { definitions, termOccurrences, crossEmployerWarnings };
}

// 解析更正记录：澄清消除了哪项歧义，渠道反馈又暴露了什么未解决问题。
export function analyzeClarifications(statements) {
  return statements
    .filter(statement => statement.source.file === CORRECTION_FILE)
    .reduce((groups, statement) => {
      const row = groups.find(item => item.id === statement.source.id);
      const target = row ?? {
        id: statement.source.id,
        source: statement.source.source,
        clauses: []
      };
      target.clauses.push(statement);
      if (!row) {
        groups.push(target);
      }
      return groups;
    }, [])
    .map(record => {
      const isEmployerClarification = record.source !== '学校' &&
        record.source !== '手机报名维护方';
      const effects = record.clauses.map(clause => {
        const effect = { text: clause.text, ref: ref(clause), flags: clause.flags };
        if (clause.type === 'scope') {
          effect.effect = '收窄强制资格的适用岗位范围';
        } else if (clause.type === 'remediable') {
          effect.effect = '把强制资格改为可补足条件';
        } else if (clause.type === 'entry') {
          effect.effect = '暴露报名入口仍按旧门槛限制，渠道尚未同步';
        } else if (clause.type === 'sync') {
          effect.effect = '确认正文更改尚未同步到报名渠道，属于渠道维护问题而非资格澄清';
        } else if (clause.type === 'policy') {
          effect.effect = '学校审核口径';
        } else if (clause.flags.includes('negation') && clause.text.includes('持证')) {
          effect.effect = '明确否定持证要求，消除证书门槛歧义';
        } else {
          effect.effect = '更正说明';
        }
        return effect;
      });
      return {
        id: record.id,
        source: record.source,
        kind: isEmployerClarification
          ? '雇主澄清'
          : record.source === '手机报名维护方' ? '渠道维护方反馈' : '学校审核口径',
        resolvesAmbiguity: isEmployerClarification
          ? '技术助理是否必须持证或结业：不要求持证、可补修；强制结业仅保留给设备助理'
          : null,
        clauses: record.clauses,
        effects
      };
    });
}

// 从雇主澄清 c2 提炼当前有效的岗位资格事实。
function currentFacts(clarifications) {
  const facts = [];
  for (const clarification of clarifications) {
    if (clarification.kind !== '雇主澄清') {
      continue;
    }
    for (const clause of clarification.clauses) {
      if (clause.type === 'scope') {
        facts.push({
          role: '设备助理',
          policy: 'mandatory',
          detail: '必须完成岭云课（结业）',
          ref: ref(clause)
        });
      }
      if (clause.type === 'remediable' || clause.flags.includes('negation')) {
        facts.push({
          role: '技术助理',
          policy: 'remediable',
          detail: '不要求持证，入职后可补修内部课',
          ref: ref(clause)
        });
      }
    }
  }
  return facts;
}

function roleStatements(employer, role, statements) {
  const own = statements.filter(statement =>
    statement.source.file === DRAFT_FILE &&
    statement.source.employer === employer &&
    statement.source.role === role);
  const shared = statements.filter(statement =>
    statement.source.file === SHARED_FILE &&
    splitRoles(statement.source.roles).includes(role));
  const corrections = statements.filter(statement =>
    statement.source.file === CORRECTION_FILE &&
    (mentionsRole(statement, role) || statement.type === 'policy'));
  return { own, shared, corrections };
}

function evaluateRole(employer, role, grouped, facts) {
  const { own, shared, corrections } = grouped;
  const fact = facts.find(item => item.role === role);
  const blockers = [];
  const channelEdits = [];

  // 入口限制必须与当前公开说明一致（r1）。
  for (const clause of [...own, ...corrections]) {
    const restrictsEntry = clause.type === 'entry' ||
      (clause.type === 'sync' && clause.text.includes('只接受'));
    if (!restrictsEntry) {
      continue;
    }
    if (fact?.policy === 'remediable') {
      blockers.push({
        kind: 'entry-mismatch',
        message: '报名入口仍只接受结业同学，与雇主澄清的“可补修、不要求持证”相冲突',
        ref: ref(clause)
      });
      channelEdits.push({
        channel: clause.source.location ?? clause.source.source,
        currentWording: clause.text,
        requiredWording: '改为允许未结业同学申请，注明入职后补修、不要求持证',
        ref: ref(clause)
      });
    }
  }

  // 共享稿把共用资格写成两个岗位的共同门槛，需要按澄清后的实际范围核对。
  const sharedFindings = [];
  for (const clause of shared) {
    if (clause.type !== 'mandatory' && clause.type !== 'reference') {
      continue;
    }
    if (clause.type === 'reference') {
      sharedFindings.push({
        kind: 'shared-reference',
        message: '共享稿指引读者以各岗位报名须知为准，本身不增设门槛',
        consistent: true,
        ref: ref(clause)
      });
      continue;
    }
    const appliesToAll = splitRoles(clause.source.roles);
    const staleRoles = appliesToAll.filter(name =>
      facts.some(item => item.role === name && item.policy === 'remediable'));
    if (staleRoles.length > 0) {
      const finding = {
        kind: 'shared-overreach',
        message: `共享稿把“均须完成岭云课”套用到 ${staleRoles.join('、')}，超出澄清后的实际范围`,
        staleRoles,
        ref: ref(clause)
      };
      sharedFindings.push(finding);
      if (staleRoles.includes(role)) {
        blockers.push(finding);
        channelEdits.push({
          channel: clause.source.channel,
          currentWording: clause.text,
          requiredWording: `把强制结业的范围收窄为 ${appliesToAll
            .filter(name => !staleRoles.includes(name)).join('、')}，移动端摘要同步修改`,
          ref: ref(clause)
        });
      }
    } else {
      sharedFindings.push({
        kind: 'shared-consistent',
        message: '共享稿中的强制资格与当前澄清一致',
        consistent: true,
        ref: ref(clause)
      });
    }
  }

  const historical = own.filter(clause => clause.type === 'historical');
  const preferences = own.filter(clause => clause.type === 'preference');
  const remediable = own.filter(clause => clause.type === 'remediable');
  const open = own.filter(clause => clause.type === 'open');
  const scopeNotes = own.filter(clause => clause.type === 'scope');

  // 依 r1：偏好与可补足条件可以公开；入口未理顺前整岗暂缓。
  const publishableFragments = [...preferences, ...remediable, ...open].map(clause => ({
    text: clause.text,
    kind: TYPE_LABELS[clause.type],
    ref: ref(clause)
  }));

  const decision = blockers.length > 0 ? '暂缓发布' : '可发布';
  return {
    employer,
    role,
    decision,
    decisionBasis: decision === '暂缓发布'
      ? '学校口径 r1：入口实际限制与当前公开说明不一致，歧义期间暂缓受影响岗位'
      : '当前资格、入口与公开说明相互相容',
    currentRequirement: fact
      ? { policy: fact.policy, detail: fact.detail, ref: fact.ref }
      : { policy: 'none', detail: '无强制资格，按来稿原文开放报名', ref: null },
    scopeNotes: scopeNotes.map(clause => ({ text: clause.text, ref: ref(clause) })),
    publishableFragments,
    blockers,
    channelEdits,
    sharedFindings,
    historical: historical.map(clause => ({
      text: clause.text,
      reason: '历史招聘条件不能自动套用到本次，仅用于还原此前暂缓背景',
      ref: ref(clause)
    }))
  };
}

// 还原技术助理岗位此前为何被暂缓：历史门槛 → 答复待提供 → 入口未同步 → 澄清后仅剩渠道问题。
function buildHoldTimeline(statements) {
  const timeline = [];
  const historical = statements.find(statement =>
    statement.type === 'historical' && statement.text.includes('上一期'));
  if (historical) {
    timeline.push({
      stage: '历史门槛',
      summary: '上一期要求已获得训练证书，今年答复当时仍待提供，资格口径不明',
      ref: ref(historical)
    });
  }
  const syncIssue = statements.find(statement => statement.type === 'sync');
  if (syncIssue) {
    timeline.push({
      stage: '入口未同步',
      summary: '技术助理报名页入口仍只接受结业同学，正文更改没有同步到报名渠道',
      ref: ref(syncIssue)
    });
  }
  const clarification = statements.find(statement =>
    statement.source.file === CORRECTION_FILE &&
    statement.source.source === '岭云工艺' &&
    (statement.type === 'remediable' || statement.type === 'scope'));
  if (clarification) {
    timeline.push({
      stage: '雇主澄清',
      summary: '持证歧义已消除：技术助理不要求持证、可补修；强制结业仅保留给设备助理',
      ref: ref(clarification)
    });
  }
  timeline.push({
    stage: '当前暂缓依据',
    summary: '资格歧义虽已消除，但报名须知与移动端入口措辞仍未修改，入口与公开说明不一致',
    ref: null
  });
  return timeline;
}

export function reconcile(statements) {
  const glossary = buildGlossary(statements);
  const clarifications = analyzeClarifications(statements);
  const facts = currentFacts(clarifications);

  const rolePairs = statements
    .filter(statement => statement.source.file === DRAFT_FILE)
    .map(statement => [statement.source.employer, statement.source.role]);
  const uniquePairs = [...new Map(rolePairs.map(pair => [pair.join('\u0000'), pair])).values()];

  const roles = uniquePairs.map(([employer, role]) =>
    evaluateRole(employer, role, roleStatements(employer, role, statements), facts));

  const technical = roles.find(item => item.role === '技术助理');
  if (technical) {
    technical.holdTimeline = buildHoldTimeline(statements);
  }

  const staleRecords = roles.flatMap(item =>
    item.historical.map(entry => ({ employer: item.employer, role: item.role, ...entry })));

  const sharedDrafts = statements
    .filter(statement => statement.source.file === SHARED_FILE)
    .reduce((rows, statement) => {
      const row = rows.find(item => item.id === statement.source.id);
      const target = row ?? {
        id: statement.source.id,
        channel: statement.source.channel,
        roles: splitRoles(statement.source.roles),
        findings: []
      };
      const related = roles.flatMap(role => role.sharedFindings)
        .find(finding => finding.ref.id === statement.source.id);
      if (related && !target.findings.some(item => item.kind === related.kind)) {
        target.findings.push(related);
      }
      if (!row) {
        rows.push(target);
      }
      return rows;
    }, []);

  return {
    advisory: '本报告仅为文字核查建议，不收集求职者资料，也不代替学校作录用决定',
    glossary,
    clarifications,
    roles,
    sharedDrafts,
    staleRecords
  };
}
