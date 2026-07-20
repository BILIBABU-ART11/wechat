const { CATEGORIES, STATUS_VALUES } = require('../utils/constants');

let currentUser = null;

const userTemplate = {
  id: 'u_mock_001',
  openid: 'mock-openid',
  nickname: '院院通用户',
  internal_account: 'analyst@neurogaze.local',
  role: 'analyst',
  role_name: '分析员',
  department: '招投标提醒组',
  bound: true,
  permissions: ['article:read', 'message:read']
};

const articles = [
  {
    id: 'art_1001',
    record_id: 'bidREC001',
    title: '销售一组 待办提醒',
    source: '飞书招投标表',
    original_url: 'https://example.com/tenders/bid-1001',
    company: '销售一组',
    product: '神经介入耗材',
    category: '院内招标',
    ai_score: 5,
    ai_summary: '距离材料提交截止不足 24 小时，需确认授权书、产品资质和报价文件是否齐备。',
    publish_time: '2026-06-29T08:20:00+08:00',
    deadline: '2026-06-30T17:00:00+08:00',
    status: STATUS_VALUES.submit_due,
    owner: '招投标专员 A',
    comment: '提醒：材料提交截止临近。',
    reminder_reason: '明日 17:00 前提交遴选材料',
    procurement_unit: '院院通销售管理系统',
    updated_at: '2026-06-29T09:12:00+08:00'
  },
  {
    id: 'art_1002',
    record_id: 'bidREC002',
    title: '销售二组 待办提醒',
    source: '飞书招投标表',
    original_url: 'https://example.com/tenders/bid-1002',
    company: '销售二组',
    product: '取栓支架',
    category: '政府采购',
    ai_score: 4,
    ai_summary: '项目已进入材料准备阶段，需关注保证金缴纳时间和线上投标文件上传要求。',
    publish_time: '2026-06-29T07:45:00+08:00',
    deadline: '2026-07-03T10:00:00+08:00',
    status: STATUS_VALUES.materials,
    owner: '招投标专员 B',
    comment: '保证金节点需提前确认。',
    reminder_reason: '保证金缴纳和投标文件上传需同步推进',
    procurement_unit: '院院通销售管理系统',
    updated_at: '2026-06-29T10:02:00+08:00'
  },
  {
    id: 'art_1003',
    record_id: 'bidREC003',
    title: '西南医科大学附属医院弹簧圈耗材遴选',
    source: '飞书招投标表',
    original_url: 'https://example.com/tenders/bid-1003',
    company: '西南医科大学附属医院',
    product: '栓塞弹簧圈',
    category: '耗材遴选',
    ai_score: 4,
    ai_summary: '项目处于待评估阶段，需确认是否参与以及产品目录是否覆盖本次遴选范围。',
    publish_time: '2026-06-28T18:10:00+08:00',
    deadline: '2026-07-05T18:00:00+08:00',
    status: STATUS_VALUES.evaluating,
    owner: '区域负责人 C',
    comment: '等待区域确认是否参与。',
    reminder_reason: '需要确认是否参与报名',
    procurement_unit: '西南医科大学附属医院',
    updated_at: '2026-06-28T19:01:00+08:00'
  },
  {
    id: 'art_1004',
    record_id: 'bidREC004',
    title: '北方市第一医院 DSA 设备采购',
    source: '飞书招投标表',
    original_url: 'https://example.com/tenders/bid-1004',
    company: '北方市第一医院',
    product: 'DSA 设备',
    category: '设备采购',
    ai_score: 3,
    ai_summary: '项目已提交，等待开标安排。当前仅需关注开标时间和澄清通知。',
    publish_time: '2026-06-27T13:35:00+08:00',
    deadline: '2026-07-02T09:30:00+08:00',
    status: STATUS_VALUES.submitted,
    owner: '设备项目组',
    comment: '已提交，等待开标。',
    reminder_reason: '开标前关注澄清通知',
    procurement_unit: '北方市第一医院',
    updated_at: '2026-06-27T17:20:00+08:00'
  },
  {
    id: 'art_1005',
    record_id: 'bidREC005',
    title: '华南区域联盟耗材集中采购结果跟进',
    source: '飞书招投标表',
    original_url: 'https://example.com/tenders/bid-1005',
    company: '华南区域采购联盟',
    product: '神经介入耗材包',
    category: '中标结果',
    ai_score: 3,
    ai_summary: '结果公示阶段，需要关注中标结果、异议期和后续配送协议签署时间。',
    publish_time: '2026-06-26T16:12:00+08:00',
    deadline: '2026-07-01T18:00:00+08:00',
    status: STATUS_VALUES.follow_up,
    owner: '商务组',
    comment: '异议期结束后跟进协议。',
    reminder_reason: '结果公示期即将结束',
    procurement_unit: '华南区域采购联盟',
    updated_at: '2026-06-26T18:44:00+08:00'
  },
  {
    id: 'art_1006',
    record_id: 'bidREC006',
    title: '东部新区医院介入耗材补充采购',
    source: '飞书招投标表',
    original_url: 'https://example.com/tenders/bid-1006',
    company: '东部新区医院',
    product: '介入通用耗材',
    category: '院内招标',
    ai_score: 2,
    ai_summary: '新发布项目，当前仅需知晓并等待区域负责人判断是否跟进。',
    publish_time: '2026-06-26T09:30:00+08:00',
    deadline: '2026-07-08T17:00:00+08:00',
    status: STATUS_VALUES.new,
    owner: '区域负责人 D',
    comment: '新项目提醒。',
    reminder_reason: '新项目已进入飞书表',
    procurement_unit: '东部新区医院',
    updated_at: '2026-06-26T11:00:00+08:00'
  }
];

articles.forEach((article, index) => {
  const pendingCount = Math.max(1, Number(article.ai_score || 1) * 10 - index * 2);
  const userName = article.owner || article.company || `待办人员${index + 1}`;
  Object.assign(article, {
    title: `${userName} 待办提醒`,
    source: '院院通销售管理系统',
    original_url: '',
    company: userName,
    product: `${pendingCount} 条待办`,
    category: '待办统计',
    ai_score: pendingCount >= 40 ? 5 : pendingCount >= 20 ? 4 : 2,
    ai_summary: `当前还有 ${pendingCount} 条待办未处理，请尽快处理。`,
    status: pendingCount > 0 ? STATUS_VALUES.pending : STATUS_VALUES.completed,
    owner: userName,
    comment: `待办数量：${pendingCount}`,
    reminder_reason: `您还有${pendingCount}条待办未处理，请您尽快处理，谢谢`,
    procurement_unit: '院院通销售管理系统'
  });
});

let messages = [
  {
    id: 'msg_001',
    type: 'todo_stat_snapshot',
    title: '待办提醒',
    content: '招投标专员 A 当前还有 50 条待办未处理，请尽快处理。',
    article_id: 'art_1001',
    read: false,
    created_at: '2026-06-29T08:28:00+08:00'
  },
  {
    id: 'msg_002',
    type: 'todo_stat_snapshot',
    title: '待办提醒',
    content: '招投标专员 B 当前还有 38 条待办未处理，请尽快处理。',
    article_id: 'art_1002',
    read: false,
    created_at: '2026-06-29T08:05:00+08:00'
  },
  {
    id: 'msg_003',
    type: 'todo_stat_snapshot',
    title: '待办提醒',
    content: '院院通待办统计快照已同步到待办列表。',
    article_id: 'art_1006',
    read: true,
    created_at: '2026-06-28T19:20:00+08:00'
  }
];

function delay(data, timeout) {
  return new Promise((resolve) => setTimeout(() => resolve(data), timeout || 160));
}

function ok(data) {
  return { code: 0, message: 'ok', data };
}

function fail(code, message) {
  return { code, message, data: null };
}

function getSummary() {
  const highPriority = articles.filter((item) => item.ai_score >= 4);
  const activeStatuses = [
    STATUS_VALUES.pending,
    STATUS_VALUES.new,
    STATUS_VALUES.evaluating,
    STATUS_VALUES.materials,
    STATUS_VALUES.submit_due,
    STATUS_VALUES.opening,
    STATUS_VALUES.follow_up
  ];
  const pending = articles.filter((item) => activeStatuses.includes(item.status));

  return {
    today_new_count: articles.length,
    high_priority_count: highPriority.length,
    pending_count: pending.length,
    unread_message_count: messages.filter((item) => !item.read).length,
    categories: CATEGORIES.filter((item) => item !== '全部').map((category) => ({
      name: category,
      count: category === '待办统计' ? articles.length : articles.filter((article) => article.category === category).length
    })),
    recent_high_priority: highPriority
      .slice()
      .sort((a, b) => new Date(b.publish_time).getTime() - new Date(a.publish_time).getTime())
      .slice(0, 4)
  };
}

function filterArticles(params) {
  const query = params || {};
  let list = articles.slice();
  if (query.category && query.category !== '全部' && query.category !== '待办统计') {
    list = list.filter((item) => item.category === query.category);
  }
  if (query.score && query.score !== 'all') {
    list = list.filter((item) => item.ai_score >= Number(query.score));
  }
  if (query.status) {
    list = list.filter((item) => item.status === query.status);
  }
  if (query.keyword) {
    const keyword = String(query.keyword).trim();
    list = list.filter((item) => `${item.title}${item.company}${item.product}${item.ai_summary}`.includes(keyword));
  }
  list.sort((a, b) => new Date(b.publish_time).getTime() - new Date(a.publish_time).getTime());
  const page = Number(query.page || 1);
  const pageSize = Number(query.page_size || 20);
  return {
    items: list.slice((page - 1) * pageSize, page * pageSize),
    total: list.length,
    page,
    page_size: pageSize
  };
}

function getArticleId(url) {
  const match = url.match(/^\/api\/articles\/([^/]+)(?:\/status)?$/);
  return match ? match[1] : '';
}

function route(options) {
  const method = (options.method || 'GET').toUpperCase();
  const url = options.url;
  const data = options.data || {};

  if (method === 'POST' && url === '/api/auth/wechat-login') {
    if (currentUser) {
      return ok({ token: 'mock-token-bound-user', need_bind: false, user: currentUser });
    }
    return ok({ token: '', need_bind: true, bind_token: 'mock-bind-session', user: null });
  }

  if (method === 'POST' && url === '/api/auth/bind') {
    const bindValue = String(data.bind_value || '').trim();
    if (data.bind_type !== 'user_id' || !/^\d{6,}$/.test(bindValue)) {
      return fail(422, '只能使用有效用户ID授权码绑定');
    }
    currentUser = Object.assign({}, userTemplate, {
      id: `u_${bindValue}`,
      internal_account: bindValue,
      bind_type: 'user_id'
    });
    return ok({ token: 'mock-token-bound-user', user: currentUser });
  }

  if (method === 'GET' && url === '/api/user/me') return ok(currentUser || userTemplate);
  if (method === 'GET' && url === '/api/dashboard/summary') return ok(getSummary());
  if (method === 'GET' && url === '/api/articles') return ok(filterArticles(data));

  if (method === 'GET' && /^\/api\/articles\/[^/]+$/.test(url)) {
    const article = articles.find((item) => item.id === getArticleId(url));
    return article ? ok(article) : fail(404, '项目不存在');
  }

  if (method === 'PATCH' && /^\/api\/articles\/[^/]+\/status$/.test(url)) {
    const article = articles.find((item) => item.id === getArticleId(url));
    if (!article) return fail(404, '项目不存在');
    article.status = data.status || article.status;
    article.comment = data.comment || article.comment;
    article.updated_at = new Date().toISOString();
    return ok(article);
  }

  if (method === 'GET' && url === '/api/messages') {
    return ok({ items: messages, unread_count: messages.filter((item) => !item.read).length });
  }

  if (method === 'GET' && url === '/api/todo-stat/snapshots') {
    const list = filterArticles({
      page: data.page,
      page_size: data.pageSize || data.page_size || 20
    });
    return ok({
      items: list.items.map((article) => ({
        id: article.id,
        snapshotDate: article.updated_at.slice(0, 10),
        userId: article.owner,
        userName: article.owner,
        pendingCount: article.ai_score,
        content: article.reminder_reason || article.ai_summary
      })),
      total: list.total,
      page: list.page,
      pageSize: list.page_size
    });
  }

  if (method === 'PATCH' && /^\/api\/messages\/[^/]+\/read$/.test(url)) {
    const id = url.split('/')[3];
    const message = messages.find((item) => item.id === id);
    if (!message) return fail(404, '消息不存在');
    message.read = true;
    return ok(message);
  }

  if (method === 'GET' && url === '/api/subscribe/config') {
    return ok({ template_ids: [] });
  }

  if (method === 'POST' && url === '/api/subscribe') {
    return ok({
      enabled: Boolean(data.accepted),
      mock: Boolean(data.mock),
      template_ids: data.template_ids || [],
      updated_at: new Date().toISOString()
    });
  }

  if (method === 'GET' && url === '/api/reminders/status') {
    return ok({
      running: false,
      schedule_enabled: true,
      schedule_times: ['09:00', '17:00'],
      last_result: null
    });
  }

  if (method === 'POST' && url === '/api/reminders/run') {
    return ok({
      skipped: false,
      trigger: 'manual',
      fetched_count: articles.length,
      pending_count: articles.length,
      message_count: articles.length,
      recipient_count: currentUser ? 1 : 0,
      sent_count: 0,
      skipped_send_count: articles.length
    });
  }

  if (method === 'POST' && url === '/api/webhooks/feishu-record-created') {
    return ok({ received: true, message_created: true });
  }

  return fail(404, `Mock endpoint not found: ${method} ${url}`);
}

function request(options) {
  return delay(route(options));
}

module.exports = {
  request,
  _data: { articles, messages, userTemplate }
};
