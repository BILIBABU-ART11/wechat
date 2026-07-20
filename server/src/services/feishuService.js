const config = require('../config');

const FIELD_MAP = {
  record_id: 'record_id',
  title: 'title',
  source: 'source',
  original_url: 'original_url',
  company: 'company',
  product: 'product',
  category: 'category',
  ai_score: 'ai_score',
  ai_summary: 'ai_summary',
  publish_time: 'publish_time',
  deadline: 'deadline',
  status: 'status',
  owner: 'owner',
  comment: 'comment',
  reminder_reason: 'reminder_reason',
  procurement_unit: 'procurement_unit',
  updated_at: 'updated_at'
};

let cachedTenantToken = { value: '', expiresAt: 0 };

async function getTenantAccessToken() {
  if (config.mockMode) {
    cachedTenantToken = {
      value: 'mock-feishu-tenant-access-token',
      expiresAt: Date.now() + 3600 * 1000
    };
    return cachedTenantToken.value;
  }
  if (cachedTenantToken.value && cachedTenantToken.expiresAt > Date.now() + 60 * 1000) return cachedTenantToken.value;
  throw new Error('Real Feishu token fetch is reserved for credential integration.');
}

async function updateBitableRecord(recordId, payload) {
  await getTenantAccessToken();
  return { record_id: recordId, fields: payload, field_map: FIELD_MAP };
}

module.exports = {
  FIELD_MAP,
  getTenantAccessToken,
  updateBitableRecord
};
