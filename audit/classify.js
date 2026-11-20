// 条款切分与定性：只依据文本中的语言标记做规则判断，不揣测字面之外的含义。
// 每条结论都保留记录编号与字符区间，便于审核员回到原文复核。

const CLAUSE_BREAKS = new Set(['。', '；', ';', '，', ',']);

// 否定与转折是附加标记，不单独决定条款类型。
const NEGATION_MARKERS = ['不要求', '无需', '不需要', '不能', '不得', '未', '非', '不限', '零经验'];const TRANSITION_MARKERS = ['但是', '但', '然而', '不过', '可是', '却'];

// 规则按先后匹配，先匹配到的决定条款类型；所有命中的标记都会保留用于解释。
const RULES = [
  {
    type: 'entry',
    label: '实际入口限制',
    markers: ['报名页', '本页申请', '只接受', '报名渠道', '报名入口']
  },
  {
    type: 'definition',
    label: '术语释义',
    markers: ['定义为', '指']
  },
  {
    type: 'policy',
    label: '审核口径',
    markers: ['暂缓', '审核', '公开说明', '可公开']
  },
  {
    type: 'historical',
    label: '历史信息',
    markers: ['上一期', '往年', '去年', '历史', '上届', '仍待']
  },
  {
    type: 'scope',
    label: '适用范围或例外',
    markers: ['仅适用于', '只保留', '仅限于', '仅适用', '适用']
  },
  {
    type: 'sync',
    label: '渠道同步状态',
    markers: ['尚未同步', '未同步', '更改尚未']
  },
  {
    type: 'remediable',
    label: '可补足条件',
    markers: ['补修', '入职后']
  },
  {
    type: 'waiver',
    label: '否定性资格说明',
    markers: ['不要求', '无需', '不需要', '不限']
  },
  {
    type: 'preference',
    label: '偏好',
    markers: ['优先']
  },
  {
    type: 'example',
    label: '举例',
    markers: ['例如', '比如', '譬如', '举例']
  },
  {
    type: 'benefit',
    label: '待遇说明',
    markers: ['薪资', '待遇', '福利', '补贴', '保险', '年假', '奖金']
  },
  {
    type: 'reference',
    label: '指引性说明',
    markers: ['为准', '参照', '参见']
  },
  {
    type: 'mandatory',
    label: '强制资格',
    markers: ['必须', '须', '方能', '只有', '才能', '要求', '需', '应当']
  },
  {
    type: 'open',
    label: '无门槛报名说明',
    markers: ['皆可', '均可', '欢迎', '不限']
  }
];

const TYPE_LABELS = Object.fromEntries(RULES.map(rule => [rule.type, rule.label]));
TYPE_LABELS.neutral = '其他说明';

function pushClause(clauses, text, start, end) {
  const raw = text.slice(start, end);
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return;
  }
  const offset = start + raw.indexOf(trimmed);
  clauses.push({ text: trimmed, start: offset, end: offset + trimmed.length });
}

// 按中文句读切分，返回的区间相对整条 text，采用左闭右开。
export function splitClauses(text) {
  const clauses = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (CLAUSE_BREAKS.has(text[i])) {
      pushClause(clauses, text, start, i);
      start = i + 1;
    }
  }
  pushClause(clauses, text, start, text.length);
  return clauses;
}

function findMarkers(clauseText, markers) {
  return markers.filter(marker => clauseText.includes(marker));
}

export function classifyClause(clause) {
  const markers = [];
  for (const rule of RULES) {
    const hit = findMarkers(clause.text, rule.markers);
    if (hit.length > 0) {
      markers.push(...hit);
    }
  }
  const matchedRule = RULES.find(rule =>
    findMarkers(clause.text, rule.markers).length > 0);
  const flags = [];
  const negations = findMarkers(clause.text, NEGATION_MARKERS);
  if (negations.length > 0) {
    flags.push('negation');
  }
  const transitions = findMarkers(clause.text, TRANSITION_MARKERS);
  if (transitions.length > 0) {
    flags.push('transition');
  }
  return {
    text: clause.text,
    range: [clause.start, clause.end],
    type: matchedRule ? matchedRule.type : 'neutral',
    typeLabel: matchedRule ? matchedRule.label : TYPE_LABELS.neutral,
    flags,
    markers: [...new Set(markers)],
    negationMarkers: negations,
    transitionMarkers: transitions
  };
}

// 为一条资料记录生成带出处的条款列表。
export function classifyRecord(row, file) {
  const source = {
    file,
    id: row.id,
    employer: row.employer ?? null,
    role: row.role ?? null,
    roles: row.roles ?? null,
    location: row.location ?? null,
    channel: row.channel ?? null,
    source: row.source ?? null
  };
  return splitClauses(row.text).map(clause => ({
    ...classifyClause(clause),
    source
  }));
}

export function classifyTables(tables) {
  const statements = [];
  for (const [file, rows] of Object.entries(tables)) {
    for (const row of rows) {
      statements.push(...classifyRecord(row, file));
    }
  }
  return statements;
}

export { TYPE_LABELS };
