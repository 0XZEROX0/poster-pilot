// Shared helpers, pasted at the top of the Code nodes of "Static OS - Website orders" by build.cjs (n8n Code nodes cannot import).
const S = $('Settings').first().json;
const DRY = S.dryRun !== false;
const base = `projects/${S.projectId}/databases/(default)/documents`;
const dv = v => { if (!v || typeof v !== 'object') return null; if ('stringValue' in v) return v.stringValue; if ('booleanValue' in v) return v.booleanValue; if ('integerValue' in v) return Number(v.integerValue); if ('doubleValue' in v) return Number(v.doubleValue); if ('timestampValue' in v) return Date.parse(v.timestampValue); if ('nullValue' in v) return null; if ('mapValue' in v) { const o = {}; const f = (v.mapValue && v.mapValue.fields) || {}; for (const k of Object.keys(f)) o[k] = dv(f[k]); return o; } if ('arrayValue' in v) return ((v.arrayValue && v.arrayValue.values) || []).map(dv); return null; };
const ev = v => { if (v === null || v === undefined) return { nullValue: null }; if (typeof v === 'string') return { stringValue: v }; if (typeof v === 'boolean') return { booleanValue: v }; if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }; if (Array.isArray(v)) return { arrayValue: { values: v.map(ev) } }; const fields = {}; for (const k of Object.keys(v)) if (v[k] !== undefined) fields[k] = ev(v[k]); return { mapValue: { fields } }; };
const fieldsOf = doc => dv({ mapValue: { fields: (doc && doc.fields) || {} } }) || {};
const NOW = new Date().toISOString();
const rid = () => Array.from({ length: 20 }, () => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 62)]).join('');
// WooCommerce status -> the app's status (same table as fromWeb in src/data/orders.ts).
const fromWeb = w => (w === 'processing' ? 'confirmed' : ['completed', 'cancelled', 'refunded', 'failed'].includes(w) ? w : 'new');
const OPEN = ['new', 'confirmed'];
const WEB_LABEL = { pending: 'Pending payment', 'on-hold': 'On hold', processing: 'Processing', completed: 'Completed', cancelled: 'Cancelled', refunded: 'Refunded', failed: 'Failed' };
// WooCommerce state codes (Egypt) -> the area names the app shows.
const STATES = { EGALX: 'Alexandria', EGASN: 'Aswan', EGAST: 'Asyut', EGBA: 'Red Sea', EGBH: 'Beheira', EGBNS: 'Beni Suef', EGC: 'Cairo', EGDK: 'Dakahlia', EGDT: 'Damietta', EGFYM: 'Faiyum', EGGH: 'Gharbia', EGGZ: 'Giza', EGIS: 'Ismailia', EGJS: 'South Sinai', EGKB: 'Qalyubia', EGKFS: 'Kafr el-Sheikh', EGKN: 'Qena', EGLX: 'Luxor', EGMN: 'Minya', EGMNF: 'Monufia', EGMT: 'Matrouh', EGPTS: 'Port Said', EGSHG: 'Sohag', EGSHR: 'Sharqia', EGSIN: 'North Sinai', EGSUZ: 'Suez', EGWAD: 'New Valley' };
