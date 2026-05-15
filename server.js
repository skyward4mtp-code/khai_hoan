const express = require('express');
const cors = require('cors');
const axios = require('axios');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// =========================================================
// CẤU HÌNH THEO DÕI - SỬA TRỰC TIẾP Ở ĐÂY
// =========================================================
const TRACKING_CONFIG = {
  // Lấy từ link: https://statement.cake.vn/view?encoded_id=318535339
  encodedId: '318535339',

  // Chỉ ghi nhận giao dịch từ mốc này trở đi.
  // Định dạng khuyến nghị: YYYY-MM-DDTHH:mm:ss+07:00
  startAt: '2026-05-15T18:30:00+07:00',

  // Target quỹ để tính thanh tiến độ.
  targetAmount: 220000000,

  // Quỹ nền đã trích sẵn.
  // Hệ thống sẽ bắt đầu tính tiến độ từ mốc này, sau đó cộng thêm các giao dịch nhận tiền mới.
  initialFundAmount: 70000000,
  initialFundLabel: 'Trích quỹ nền 70.000.000đ',

  // Chu kỳ tự quét, tính bằng giây.
  pollSeconds: 30,

  // Link Google Form nhận quà minigame donate.
  // Thay bằng link form thật của bạn.
  giftFormUrl: 'https://docs.google.com/forms/d/1Om-Qa5STVAwZBTYeqRL05rj0le62FFVexXSPpQqOn38/edit',

  // Link YouTube để phát nhạc trên web.
  // Có thể dùng dạng https://www.youtube.com/watch?v=VIDEO_ID hoặc https://youtu.be/VIDEO_ID
  musicYoutubeUrl: 'https://www.youtube.com/watch?v=opejV49frug',

  // Các mốc target hiển thị trên cột tiến độ.
  milestones: [
    {
      amount: 100000000,
      title: 'KHỞI HỎA',
      subtitle: '100.000.000 VNĐ',
      items: ['Phục vụ stream', 'LED Hà Nội', 'LED TP.HCM 1', 'LED Đà Nẵng'],
    },
    {
      amount: 150000000,
      title: 'DẬY SÓNG',
      subtitle: '150.000.000 VNĐ',
      items: ['Phục vụ stream', 'LED Hà Nội', 'LED TP.HCM 1', 'LED Đà Nẵng', 'Roadshow xe bus Hà Nội'],
    },
    {
      amount: 200000000,
      title: 'VIỄN CHINH',
      subtitle: '200.000.000 VNĐ',
      items: ['Phục vụ stream', 'LED Hà Nội', 'LED TP.HCM 1', 'LED Đà Nẵng', 'Roadshow xe bus Hà Nội','LED TP.HCM 2','Roadshow xe bus TP.HCM'],
    },
    {
      amount: 220000000,
      title: 'KHẢI HOÀN',
      subtitle: '220.000.000 VNĐ',
      items: ['Phục vụ stream', 'LED Hà Nội',  'LED TP.HCM 1', 'LED Đà Nẵng', 'Roadshow xe bus Hà Nội','LED TP.HCM 2','Roadshow xe bus TP.HCM', 'LED Thái Lan', 'LED Nhật Bản'],
    },
  ],

  // FLAG DONATE: các mốc quỹ nội bộ Skyward tặng thêm cho Sky.
  // Mốc này tính theo phần DONATE TĂNG THÊM, không cộng vào tổng donate hiển thị.
  internalFundMilestones: [
    {
      amount: 80000000,
      title: 'LED Trung Quốc',
      shortTitle: 'LED Trung Quốc',
      description: 'Tổng donate tăng 80M → LED Trung Quốc.',
      unlockedText: 'LED Trung Quốc.',
    },
    {
      amount: 150000000,
      title: 'LED Mỹ',
      shortTitle: 'LED Mỹ',
      description: 'Tổng donate tăng 150M → LED Mỹ.',
      unlockedText: 'LED Mỹ.',
    },
  ],
};
// =========================================================

const DATA_DIR = path.join(__dirname, 'data');
const EXCEL_PATH = path.join(DATA_DIR, 'transactions.xlsx');
const RAW_DEBUG_PATH = path.join(DATA_DIR, 'last-api-response.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

let cache = {
  rows: [],
  lastRefreshAt: null,
  lastError: null,
  isRefreshing: false,
};

function getSettings() {
  return { ...TRACKING_CONFIG };
}

function normalizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function normalizeAmount(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  const s = String(value).replace(/[^0-9\-]/g, '');
  return Number(s || 0);
}


function isIncomingTransaction(item, amountRaw) {
  // Chỉ lấy giao dịch cộng tiền/nhận tiền.
  // Cake có thể trả amount là số dương cho cả thu và chi, nên không chỉ dựa vào amount.
  const rawAmountText = normalizeText(amountRaw);
  if (/^-/.test(rawAmountText)) return false;

  const hasCreditField = deepFirstValue(item, [
    'credit_amount', 'credit', 'receive_amount', 'received_amount', 'in_amount', 'deposit_amount'
  ]);
  if (hasCreditField !== undefined && normalizeAmount(hasCreditField) > 0) return true;

  const debitField = deepFirstValue(item, [
    'debit_amount', 'debit', 'withdraw_amount', 'out_amount', 'spent_amount', 'fee_amount'
  ]);
  if (debitField !== undefined && normalizeAmount(debitField) > 0) return false;

  const typeText = normalizeText(deepFirstValue(item, [
    'type', 'transaction_type', 'trans_type', 'direction', 'category', 'action', 'title'
  ])).toLowerCase();

  if (/(debit|withdraw|out|expense|payment|paid|charge|fee|send|sent|transfer_out|chi|rút|rut|thanh toán|thanh toan|chuyển đi|chuyen di|trừ tiền|tru tien)/i.test(typeText)) {
    if (!/(credit|receive|deposit|income|nhận|nhan|cộng|cong)/i.test(typeText)) return false;
  }

  const allText = collectStrings(item).join(' | ').toLowerCase();
  const hasIncomingSignal = /(nhận tiền|nhan tien|^từ\s|\|\s*từ\s|credit|receive|received|deposit|incoming|cộng tiền|cong tien|tiền vào|tien vao)/i.test(allText);
  const hasOutgoingSignal = /(rút tiền|rut tien|thanh toán|thanh toan|chuyển tiền đi|chuyen tien di|chuyển đi|chuyen di|trừ tiền|tru tien|debit|withdraw|payment|fee|charge)/i.test(allText);

  if (hasIncomingSignal) return true;
  if (hasOutgoingSignal) return false;

  // Không chắc thì chỉ lấy số dương; các giao dịch rút tiền thường đã bị bắt bởi các dấu hiệu trên.
  return normalizeAmount(amountRaw) > 0;
}


function stableTransactionKey(row) {
  const time = normalizeText(row.time);
  const sender = normalizeText(row.sender).toLowerCase();
  const amount = Number(row.amount || 0);
  const message = normalizeText(row.message).toLowerCase();
  return `${time}|${amount}|${sender}|${message}`;
}

function dedupeRows(rows) {
  const seen = new Set();
  const result = [];
  for (const row of rows || []) {
    const fixed = normalizeLoadedExcelRow ? normalizeLoadedExcelRow(row) : row;
    if (!fixed) continue;
    const key = stableTransactionKey(fixed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(fixed);
  }
  return result;
}

function firstValue(obj, keys) {
  if (!obj || typeof obj !== 'object') return undefined;
  const lowerMap = Object.fromEntries(Object.keys(obj).map(k => [k.toLowerCase(), k]));
  for (const key of keys) {
    const realKey = lowerMap[key.toLowerCase()];
    if (realKey && obj[realKey] !== undefined && obj[realKey] !== null && obj[realKey] !== '') return obj[realKey];
  }
  return undefined;
}

function deepFirstValue(input, keys) {
  if (!input || typeof input !== 'object') return undefined;
  if (Array.isArray(input)) {
    for (const item of input) {
      const found = deepFirstValue(item, keys);
      if (found !== undefined && found !== null && found !== '') return found;
    }
    return undefined;
  }

  const direct = firstValue(input, keys);
  if (direct !== undefined && direct !== null && direct !== '') return direct;

  for (const value of Object.values(input)) {
    if (value && typeof value === 'object') {
      const found = deepFirstValue(value, keys);
      if (found !== undefined && found !== null && found !== '') return found;
    }
  }
  return undefined;
}

function collectStrings(input, output = []) {
  if (input === null || input === undefined) return output;
  if (typeof input === 'string' || typeof input === 'number') {
    const text = normalizeText(input);
    if (text) output.push(text);
    return output;
  }
  if (Array.isArray(input)) {
    input.forEach(item => collectStrings(item, output));
    return output;
  }
  if (typeof input === 'object') {
    Object.values(input).forEach(value => collectStrings(value, output));
  }
  return output;
}

function parseVietnamTime(rawTime, rawDate) {
  const text = normalizeText([rawDate, rawTime].filter(Boolean).join(' '));
  if (!text) return null;

  // dd/mm/yyyy HH:mm:ss - Cake hiển thị theo kiểu Việt Nam.
  const dmy = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4}).*?(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (dmy) {
    const [, dd, mm, yyyy, hh, min, ss = '0'] = dmy;
    return new Date(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T${hh.padStart(2, '0')}:${min}:${ss.padStart(2, '0')}+07:00`);
  }

  // yyyy-mm-dd HH:mm:ss
  const ymd = text.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2}).*?(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (ymd) {
    const [, yyyy, mm, dd, hh, min, ss = '0'] = ymd;
    return new Date(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T${hh.padStart(2, '0')}:${min}:${ss.padStart(2, '0')}+07:00`);
  }

  const dOnly = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dOnly) {
    const [, dd, mm, yyyy] = dOnly;
    return new Date(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T00:00:00+07:00`);
  }

  const isoTry = new Date(text);
  if (!Number.isNaN(isoTry.getTime())) return isoTry;
  return null;
}

function cleanSenderText(value) {
  let text = normalizeText(value);
  text = text.replace(/^nhận\s*tiền\s*$/i, '');
  text = text.replace(/^từ\s+/i, '');
  return normalizeText(text);
}

function looksLikeSender(value) {
  const text = normalizeText(value);
  if (!text) return false;
  if (/^nhận\s*tiền$/i.test(text)) return false;
  return /^từ\s+/i.test(text);
}

function looksLikeTimeOnly(value) {
  return /^\d{1,2}:\d{2}(?::\d{2})?$/.test(normalizeText(value));
}

function looksLikeDateOrTime(value) {
  const text = normalizeText(value);
  return looksLikeTimeOnly(text)
    || /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.test(text)
    || /^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/.test(text);
}

function looksLikeAmountText(value) {
  const text = normalizeText(value);
  return /^[+\-]?[\d.,]+\s*đ?$/i.test(text) || /^[+\-]?\d+$/.test(text);
}

function looksLikeNoise(value) {
  const text = normalizeText(value);
  if (!text) return true;
  if (/^nhận\s*tiền$/i.test(text)) return true;
  if (looksLikeSender(text)) return true;
  if (looksLikeDateOrTime(text)) return true;
  if (looksLikeAmountText(text)) return true;
  if (/^success|completed|active|true|false|null$/i.test(text)) return true;
  if (/^[a-f0-9\-]{12,}$/i.test(text)) return true;
  if (/^https?:\/\//i.test(text)) return true;
  return false;
}

function pickSender(item) {
  const senderCandidates = [
    deepFirstValue(item, ['sender_name', 'sender', 'from_name', 'counter_account_name', 'account_name', 'source_name']),
    deepFirstValue(item, ['description', 'sub_title', 'subtitle', 'transaction_description']),
    deepFirstValue(item, ['title', 'name', 'from', 'bank_name']),
    collectStrings(item).find(looksLikeSender),
  ].filter(v => v !== undefined && v !== null && v !== '');

  const senderLike = senderCandidates.find(looksLikeSender);
  if (senderLike) return cleanSenderText(senderLike);

  const fallback = senderCandidates.find(v => !/^nhận\s*tiền$/i.test(normalizeText(v)) && !looksLikeNoise(v));
  return cleanSenderText(fallback || '') || 'Không rõ';
}

function pickMessage(item, sender) {
  const explicit = deepFirstValue(item, [
    'content', 'message', 'note', 'remark', 'memo', 'body', 'transaction_content',
    'trans_content', 'transfer_content', 'payment_content', 'description_detail'
  ]);

  if (explicit && !looksLikeNoise(explicit) && cleanSenderText(explicit) !== sender) {
    return normalizeText(explicit);
  }

  const strings = collectStrings(item);
  const senderIndex = strings.findIndex(s => cleanSenderText(s) === sender || normalizeText(s) === `Từ ${sender}`);
  const ordered = senderIndex >= 0 ? strings.slice(senderIndex + 1).concat(strings.slice(0, senderIndex)) : strings;

  const candidate = ordered.find(s => {
    if (looksLikeNoise(s)) return false;
    if (cleanSenderText(s) === sender) return false;
    if (/^MBBANK IBFT|^SACOMBANK|^MoMo$/i.test(s) && s.length < 30) return false;
    return true;
  });

  return normalizeText(candidate || '');
}

function recursiveFindTransactionArrays(input, output = []) {
  if (!input || typeof input !== 'object') return output;
  if (Array.isArray(input)) {
    const looksLikeTransactions = input.some(item => {
      if (!item || typeof item !== 'object') return false;
      const amount = deepFirstValue(item, ['amount', 'transaction_amount', 'money', 'credit_amount', 'debit_amount', 'value', 'trans_amount']);
      const desc = deepFirstValue(item, ['description', 'content', 'message', 'note', 'remark', 'transaction_content', 'sub_title', 'subtitle']);
      const time = deepFirstValue(item, ['time', 'date', 'created_at', 'transaction_time', 'trans_time', 'transaction_date']);
      return amount !== undefined && (desc !== undefined || time !== undefined);
    });
    if (looksLikeTransactions) output.push(input);
    input.forEach(item => recursiveFindTransactionArrays(item, output));
    return output;
  }
  Object.values(input).forEach(value => recursiveFindTransactionArrays(value, output));
  return output;
}

function mapApiItemToRow(item, index = 0) {
  const amountRaw = deepFirstValue(item, [
    'amount', 'transaction_amount', 'money', 'credit_amount', 'credit', 'receive_amount', 'value', 'trans_amount'
  ]);
  const amount = normalizeAmount(amountRaw);
  if (!amount || amount <= 0) return null;
  if (!isIncomingTransaction(item, amountRaw)) return null;

  const sender = pickSender(item);
  const message = pickMessage(item, sender);

  const rawDate = deepFirstValue(item, ['date', 'transaction_date', 'trans_date', 'effective_date']);
  const rawTime = deepFirstValue(item, ['time', 'created_at', 'transaction_time', 'trans_time', 'createdAt', 'updated_at']);
  const parsedDate = parseVietnamTime(rawTime, rawDate) || new Date();

  const idRaw = deepFirstValue(item, ['id', 'transaction_id', 'trans_id', 'reference', 'ref_no', 'trace_no']);
  const id = normalizeText(idRaw) || `${parsedDate.toISOString()}|${amount}|${sender}|${message}|${index}`;

  return {
    id,
    time: parsedDate.toISOString(),
    sender,
    amount,
    message,
    raw: JSON.stringify(item),
  };
}

async function fetchCakeTransactions(encodedId) {
  const allItems = [];
  let nextPage = '';
  let guard = 0;

  do {
    const url = `https://gw.cake.vn/public/user-group-account/statement?encoded_id=${encodeURIComponent(encodedId)}&next_page=${encodeURIComponent(nextPage || '')}`;
    const res = await axios.get(url, {
      timeout: 15000,
      headers: {
        'accept': 'application/json, text/plain, */*',
        'user-agent': 'Mozilla/5.0 CakeTracker/1.0',
        'referer': `https://statement.cake.vn/view?encoded_id=${encodeURIComponent(encodedId)}`,
      },
    });

    if (guard === 0) {
      fs.writeFileSync(RAW_DEBUG_PATH, JSON.stringify(res.data, null, 2), 'utf8');
    }

    const arrays = recursiveFindTransactionArrays(res.data);
    const bestArray = arrays.sort((a, b) => b.length - a.length)[0] || [];
    allItems.push(...bestArray);

    nextPage = normalizeText(deepFirstValue(res.data, ['next_page', 'nextPage', 'next', 'cursor']));
    guard += 1;
  } while (nextPage && guard < 60);

  return dedupeRows(allItems.map(mapApiItemToRow).filter(Boolean));
}

const EXCEL_COLUMNS = [
  { header: 'ID', key: 'id', width: 42 },
  { header: 'Thời gian', key: 'time', width: 24 },
  { header: 'Nhận tiền từ', key: 'sender', width: 32 },
  { header: 'Số tiền', key: 'amount', width: 16 },
  { header: 'Lời nhắn', key: 'message', width: 60 },
  { header: 'Raw JSON', key: 'raw', width: 80 },
];

function setupWorksheet(ws) {
  ws.columns = EXCEL_COLUMNS;
  ws.getRow(1).values = EXCEL_COLUMNS.map(c => c.header);
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.getColumn(4).numFmt = '#,##0';
  return ws;
}

async function ensureWorkbook() {
  const workbook = new ExcelJS.Workbook();
  if (fs.existsSync(EXCEL_PATH)) {
    await workbook.xlsx.readFile(EXCEL_PATH);
    let ws = workbook.getWorksheet('Transactions');
    if (!ws) ws = workbook.addWorksheet('Transactions');
    setupWorksheet(ws);
    return { workbook, worksheet: ws };
  }
  const ws = setupWorksheet(workbook.addWorksheet('Transactions'));
  await workbook.xlsx.writeFile(EXCEL_PATH);
  return { workbook, worksheet: ws };
}

function normalizeLoadedExcelRow(rowObj) {
  // Nếu Excel cũ còn Raw JSON, parse lại bằng logic mới.
  // Giao dịch chuyển đi/rút tiền sẽ trả về null và bị loại khỏi web + file Excel sau lần quét tiếp theo.
  if (rowObj.raw) {
    try {
      const parsed = JSON.parse(rowObj.raw);
      const repaired = mapApiItemToRow(parsed, 0);
      if (!repaired) return null;
      return { ...repaired, id: rowObj.id || repaired.id };
    } catch {}
  }

  const amount = Number(rowObj.amount || 0);
  const combined = `${rowObj.sender || ''} ${rowObj.message || ''}`.toLowerCase();
  if (amount <= 0) return null;
  if (/(^|\s)(tới|toi)\s+/i.test(rowObj.sender || '')) return null;
  if (/(chuyển tiền|chuyen tien|chuyển đi|chuyen di|rút tiền|rut tien|thanh toán|thanh toan|trừ tiền|tru tien)/i.test(combined)) return null;

  if (/^nhận\s*tiền$/i.test(normalizeText(rowObj.sender)) && looksLikeSender(rowObj.message)) {
    return { ...rowObj, sender: cleanSenderText(rowObj.message) || rowObj.sender, message: '' };
  }
  return rowObj;
}

async function loadRowsFromExcel() {
  const { worksheet } = await ensureWorkbook();
  const rows = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = row.values;
    if (!values || !values[1]) return;
    const rowObj = {
      id: String(values[1] || ''),
      time: String(values[2] || ''),
      sender: String(values[3] || ''),
      amount: Number(values[4] || 0),
      message: String(values[5] || ''),
      raw: String(values[6] || ''),
    };
    const fixed = normalizeLoadedExcelRow(rowObj);
    if (fixed) rows.push(fixed);
  });
  const cleanRows = dedupeRows(rows).filter(row => Number(row.amount || 0) > 0);
  cache.rows = cleanRows;
  return cleanRows;
}

async function writeRowsToExcel(rows) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = setupWorksheet(workbook.addWorksheet('Transactions'));
  rows.forEach(r => worksheet.addRow(r));
  worksheet.getColumn(4).numFmt = '#,##0';
  await workbook.xlsx.writeFile(EXCEL_PATH);
}

function buildStats(rows, settings) {
  const startAt = new Date(settings.startAt);
  rows = dedupeRows(rows);
  const displayRows = rows.filter(row => Number(row.amount || 0) > 0)
    .filter(row => Number.isNaN(startAt.getTime()) || new Date(row.time) >= startAt);
  const sortedRows = [...displayRows].sort((a, b) => new Date(b.time) - new Date(a.time));
  const donationAmount = displayRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const initialFundAmount = Number(settings.initialFundAmount || 0);
  const totalAmount = initialFundAmount + donationAmount;
  const targetAmount = Number(settings.targetAmount || 0);
  const progressPercent = targetAmount > 0 ? Math.min(100, (totalAmount / targetAmount) * 100) : 0;

  const top10 = [...displayRows]
    .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))
    .slice(0, 10)
    .map(row => ({ sender: row.sender || 'Không rõ', amount: Number(row.amount || 0), message: row.message || '', time: row.time || '' }));

  const milestones = (settings.milestones || []).map(m => ({
    ...m,
    reached: totalAmount >= Number(m.amount || 0),
    percent: targetAmount > 0 ? Math.min(100, (Number(m.amount || 0) / targetAmount) * 100) : 0,
    remaining: Math.max(0, Number(m.amount || 0) - totalAmount),
  }));
  const reachedMilestones = milestones.filter(m => m.reached);
  const nextMilestone = milestones.find(m => !m.reached) || null;
  const unlockedItems = [...new Set(reachedMilestones.flatMap(m => m.items || []))];

  const internalFundMilestones = (settings.internalFundMilestones || []).map(m => ({
    ...m,
    reached: donationAmount >= Number(m.amount || 0),
    remaining: Math.max(0, Number(m.amount || 0) - donationAmount),
    percent: Number(m.amount || 0) > 0 ? Math.min(100, (donationAmount / Number(m.amount || 0)) * 100) : 0,
  }));

  return {
    totalAmount,
    donationAmount,
    initialFundAmount,
    initialFundLabel: settings.initialFundLabel || '',
    targetAmount,
    progressPercent,
    transactionCount: displayRows.length,
    top10,
    milestones,
    internalFundMilestones,
    reachedMilestones,
    nextMilestone,
    unlockedItems,
    transactions: sortedRows.map(row => ({
      time: row.time,
      sender: row.sender || 'Không rõ',
      amount: Number(row.amount || 0),
      message: row.message || '',
    })),
    lastRefreshAt: cache.lastRefreshAt,
    lastError: cache.lastError,
    isRefreshing: cache.isRefreshing,
  };
}

async function refreshTransactions() {
  if (cache.isRefreshing) return { added: 0, skipped: true };
  cache.isRefreshing = true;
  cache.lastError = null;

  try {
    const settings = getSettings();
    const startAt = new Date(settings.startAt);
    const existingRows = dedupeRows(await loadRowsFromExcel()).filter(row => Number(row.amount || 0) > 0);
    const existingIds = new Set(existingRows.map(r => r.id));
    const existingKeys = new Set(existingRows.map(stableTransactionKey));

    const apiRows = await fetchCakeTransactions(settings.encodedId);
    const newRows = apiRows
      .filter(row => !existingIds.has(row.id))
      .filter(row => !existingKeys.has(stableTransactionKey(row)))
      .filter(row => Number.isNaN(startAt.getTime()) || new Date(row.time) >= startAt)
      .sort((a, b) => new Date(a.time) - new Date(b.time));

    const mergedRows = dedupeRows([...existingRows, ...newRows]);
    await writeRowsToExcel(mergedRows);
    cache.rows = mergedRows;
    cache.lastRefreshAt = new Date().toISOString();
    return { added: newRows.length, skipped: false };
  } catch (error) {
    cache.lastError = error?.response?.data ? JSON.stringify(error.response.data) : (error.message || String(error));
    return { added: 0, error: cache.lastError };
  } finally {
    cache.isRefreshing = false;
  }
}

app.get('/api/settings', (req, res) => {
  res.json(getSettings());
});

app.get('/api/status', async (req, res) => {
  const settings = getSettings();
  if (!cache.rows.length) await loadRowsFromExcel();
  res.json(buildStats(cache.rows, settings));
});

app.post('/api/refresh', async (req, res) => {
  const result = await refreshTransactions();
  const settings = getSettings();
  res.json({ ...result, ...buildStats(cache.rows, settings) });
});


app.get('/download/excel', async (req, res) => {
  await ensureWorkbook();
  res.download(EXCEL_PATH, 'cake-transactions.xlsx');
});


app.get('/api/debug/raw', (req, res) => {
  if (!fs.existsSync(RAW_DEBUG_PATH)) return res.status(404).json({ error: 'Chưa có dữ liệu debug. Hãy bấm Quét ngay trước.' });
  res.sendFile(RAW_DEBUG_PATH);
});

async function boot() {
  await loadRowsFromExcel();
  await refreshTransactions();

  const tick = Math.max(10, Number(getSettings().pollSeconds || 30)) * 1000;
  setInterval(refreshTransactions, tick);

  app.listen(PORT, () => {
    console.log(`Cake tracker running at http://localhost:${PORT}`);
    console.log('Sửa cấu hình theo dõi trong file server.js, mục TRACKING_CONFIG.');
  });
}

boot();
