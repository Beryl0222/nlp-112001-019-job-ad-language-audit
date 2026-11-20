// 报告输出：内部审核报告 + 面向学生的当前资格视图（只展示可公开内容及出处）。

const POLICY_TEXT = {
  mandatory: '强制资格',
  remediable: '可补足条件（非持证门槛）',
  none: '无强制资格'
};

function cite(reference) {
  if (!reference) {
    return '';
  }
  const place = reference.location ?? '';
  return `（出处：${reference.file} ${reference.id}，字符 ${reference.range[0]}-${reference.range[1]}${place ? `，${place}` : ''}）`;
}

// 学生只看到当前资格、偏好及出处，不暴露内部暂缓结论。
export function buildStudentView(result) {
  return result.roles.map(role => ({
    employer: role.employer,
    role: role.role,
    currentRequirement: {
      kind: POLICY_TEXT[role.currentRequirement.policy] ?? role.currentRequirement.policy,
      detail: role.currentRequirement.detail,
      source: role.currentRequirement.ref
        ? `${role.currentRequirement.ref.file} ${role.currentRequirement.ref.id}`
        : '来稿原文'
    },
    preferencesAndRemediable: role.publishableFragments.map(fragment => ({
      kind: fragment.kind,
      text: fragment.text,
      source: `${fragment.ref.file} ${fragment.ref.id}`
    })),
    scopeNotes: role.scopeNotes.map(note => ({
      text: note.text,
      source: `${note.ref.file} ${note.ref.id}`
    }))
  }));
}

function renderText(result) {
  const lines = [];
  lines.push('校园招聘资格暗示核查报告');
  lines.push('='.repeat(28));
  lines.push(result.advisory);
  lines.push('');

  lines.push('一、术语与近似词（按雇主分别理解）');
  for (const definition of result.glossary.definitions) {
    lines.push(`- 「${definition.term}」在 ${definition.employer} 处指：${definition.meaning}${cite(definition.ref)}`);
  }
  for (const warning of result.glossary.crossEmployerWarnings) {
    lines.push(`- 跨雇主提示：${warning.warning}`);
  }
  lines.push('');

  lines.push('二、更正与澄清各自消除/暴露的问题');
  for (const clarification of result.clarifications) {
    lines.push(`- [${clarification.id}] ${clarification.source}（${clarification.kind}）`);
    if (clarification.resolvesAmbiguity) {
      lines.push(`  消除的歧义：${clarification.resolvesAmbiguity}`);
    }
    for (const effect of clarification.effects) {
      lines.push(`  · ${effect.effect}：${effect.text}${cite(effect.ref)}`);
    }
  }
  lines.push('');

  lines.push('三、逐岗位核对');
  for (const role of result.roles) {
    lines.push(`- ${role.employer} / ${role.role}：${role.decision}`);
    lines.push(`  依据：${role.decisionBasis}`);
    lines.push(`  当前资格：${POLICY_TEXT[role.currentRequirement.policy] ?? role.currentRequirement.policy}——${role.currentRequirement.detail}${cite(role.currentRequirement.ref)}`);
    if (role.publishableFragments.length > 0) {
      lines.push('  可公开的偏好/可补足条件：');
      for (const fragment of role.publishableFragments) {
        lines.push(`    · [${fragment.kind}] ${fragment.text}${cite(fragment.ref)}`);
      }
    }
    for (const blocker of role.blockers) {
      lines.push(`  阻碍：${blocker.message}${cite(blocker.ref)}`);
    }
    for (const edit of role.channelEdits) {
      lines.push(`  渠道待改（${edit.channel}）：现措辞「${edit.currentWording}」→ 应改为「${edit.requiredWording}」${cite(edit.ref)}`);
    }
    if (role.historical.length > 0) {
      for (const item of role.historical) {
        lines.push(`  历史信息（不沿用）：${item.text}——${item.reason}${cite(item.ref)}`);
      }
    }
    if (role.holdTimeline) {
      lines.push('  暂缓经过还原：');
      for (const point of role.holdTimeline) {
        lines.push(`    ${point.stage}：${point.summary}${cite(point.ref)}`);
      }
    }
  }
  lines.push('');

  lines.push('四、共享模板影响范围');
  for (const draft of result.sharedDrafts) {
    lines.push(`- [${draft.id}] 渠道：${draft.channel}，覆盖岗位：${draft.roles.join('、')}`);
    for (const finding of draft.findings) {
      lines.push(`  · ${finding.consistent ? '相容' : '需修改'}：${finding.message}${cite(finding.ref)}`);
    }
  }
  lines.push('');

  lines.push('五、面向学生的当前资格视图');
  for (const item of buildStudentView(result)) {
    lines.push(`- ${item.employer} / ${item.role}`);
    lines.push(`  当前资格：${item.currentRequirement.kind}——${item.currentRequirement.detail}（出处：${item.currentRequirement.source}）`);
    for (const fragment of item.preferencesAndRemediable) {
      lines.push(`  [${fragment.kind}] ${fragment.text}（出处：${fragment.source}）`);
    }
    for (const note of item.scopeNotes) {
      lines.push(`  适用范围：${note.text}（出处：${note.source}）`);
    }
  }
  return lines.join('\n');
}

export function formatReport(result, format = 'text') {
  if (format === 'json') {
    return JSON.stringify({ ...result, studentView: buildStudentView(result) }, null, 2);
  }
  return renderText(result);
}
