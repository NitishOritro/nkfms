// সার্ভিস চার্জ ও বকেয়ার গাণিতিক হিসাব
import * as U from './format';

// ---------------------------------------------------------------------------
//  "বসবাসরত অবস্থায়" — যে মালিকেরা ভবনে বসবাস করতেন, তাঁদের জন্য আগস্ট ও
//  সেপ্টেম্বর ২০২৪ মাসে ধার্য সার্ভিস চার্জ ছিল ১,৫০০ নয়, ৩,৫০০ টাকা।
//
//  A-4 (চিত্রলেখা বিশ্বাস) ও C-1 (দর্শনা সরকার) আগে এই তালিকায় ছিলেন না,
//  ফলে তাঁদের ধার্য চার্জ ৪,০০০ টাকা কম ধরা হচ্ছিল। সমিতির শিটের সাথে
//  মিলিয়ে যোগ করা হলো — এখন A-4 এর বকেয়া ৩,৫০০ ও C-1 এর ৫০০ টাকা
//  (ডিসেম্বর ২০২৪ পর্যন্ত), যা শিটের হুবহু সমান।
// ---------------------------------------------------------------------------
const SPECIAL_3500_FLATS = new Set([
  'fA-1', 'fA-4', 'fB-2', 'fB-5', 'fB-7', 'fC-1', 'fC-3', 'fC-8'
]);

/** "বসবাসরত অবস্থায়" প্রযোজ্য মাসিক হার */
export const RESIDENT_RATE = 3500;

/** কোড-নির্ভর ফলব্যাক — ডাটাবেজে custom_rates বসানোর আগ পর্যন্ত */
export const RESIDENT_MONTHS = ['2024-08', '2024-09'];

/**
 * এই ফ্ল্যাটে "বসবাসরত" হার কোন কোন মাসে খেটেছে।
 *
 * আগে উত্তরটা কেবল উপরের হার্ডকোড করা তালিকা থেকে আসত। এখন আগে
 * ডাটাবেজের custom_rates দেখা হয় — নতুন কোনো মালিক যোগ হলে বা হার
 * বদলালে কোডে হাত না দিয়ে কেবল ডাটাবেজ হালনাগাদ করলেই চলবে।
 * কলামটি এখনো বসানো না থাকলে পুরোনো তালিকাই কাজ করে, তাই SQL চালানোর
 * আগে-পরে হিসাব একই থাকে।
 */
export function residentMonths(flat) {
  if (!flat) return [];
  const custom = flat.customRates || {};
  const fromDb = Object.keys(custom)
    .filter((m) => Number(custom[m]) === RESIDENT_RATE)
    .sort();
  if (fromDb.length) return fromDb;
  return SPECIAL_3500_FLATS.has(flat.id) ? RESIDENT_MONTHS.slice() : [];
}

/** এই ফ্ল্যাটে কখনো "বসবাসরত" হার খেটেছে কি না */
export function isResidentFlat(flat) {
  return residentMonths(flat).length > 0;
}

/** নির্দিষ্ট মাসে এই ফ্ল্যাটে "বসবাসরত" হার খাটছে কি না */
export function isResidentMonth(flat, month) {
  return residentMonths(flat).includes(month);
}

/** টুলটিপে দেখানোর ব্যাখ্যা */
export function residentNote(flat) {
  const name = (flat && flat.ownerName) || 'এই';
  const months = residentMonths(flat).map(U.monthLabel).join(' ও ');
  return `${name} ফ্ল্যাট মালিক উক্ত সময়ে (${months}) ভবনে বসবাসরত ছিলেন — তাই ওই দুই মাসে ধার্য মাসিক সার্ভিস চার্জ ছিল ৩,৫০০/- টাকা।`;
}

/** নির্দিষ্ট ফ্ল্যাট ও মাসে প্রযোজ্য মাসিক ধার্য হার */
export function rateForMonth(settings, month, flat) {
  if (flat) {
    if (flat.customRates && flat.customRates[month] != null) {
      return Number(flat.customRates[month]) || 0;
    }
    if (SPECIAL_3500_FLATS.has(flat.id) && (month === '2024-08' || month === '2024-09')) {
      return 3500;
    }
  }
  const history = Array.isArray(settings.rateHistory) ? settings.rateHistory : [];
  let rate = Number(settings.monthlyRate) || 0;
  const idx = U.monthIndex(month);
  history
    .slice()
    .sort((a, b) => U.monthIndex(a.fromMonth) - U.monthIndex(b.fromMonth))
    .forEach((entry) => {
      if (U.monthIndex(entry.fromMonth) <= idx) rate = Number(entry.rate) || 0;
    });
  return rate;
}

/** কোন মাস থেকে এই ফ্ল্যাটে চার্জ ধরা শুরু হবে */
export function flatStartMonth(flat, settings) {
  const start = settings.startMonth || '2024-08';
  const minStart = U.monthIndex(start) < U.monthIndex('2024-08') ? start : '2024-08';
  if (flat.joinMonth && U.monthIndex(flat.joinMonth) > U.monthIndex(minStart)) return flat.joinMonth;
  return minStart;
}

/** কোন মাস পর্যন্ত চার্জ ধরা হবে */
export function flatEndMonth(flat, asOfMonth) {
  if (flat.closedFrom && U.monthIndex(flat.closedFrom) <= U.monthIndex(asOfMonth)) {
    return U.addMonths(flat.closedFrom, -1);
  }
  return asOfMonth;
}

/** শুরু থেকে asOfMonth পর্যন্ত মোট ধার্যকৃত চার্জ */
export function chargeUpTo(flat, settings, asOfMonth) {
  const start = flatStartMonth(flat, settings);
  const end = flatEndMonth(flat, asOfMonth);
  const from = U.monthIndex(start);
  const to = U.monthIndex(end);
  let total = 0;
  for (let i = from; i <= to; i += 1) {
    total += rateForMonth(settings, U.indexToMonth(i), flat);
  }
  return total;
}

export function paidUpTo(payments, flatId, asOfMonth) {
  const limit = U.monthIndex(asOfMonth);
  return payments.reduce((sum, p) => (
    p.flatId === flatId && U.monthIndex(p.month) <= limit ? sum + (Number(p.amount) || 0) : sum
  ), 0);
}

export function paymentsInMonth(payments, flatId, month) {
  return payments.filter((p) => p.flatId === flatId && p.month === month);
}

export function paidInMonth(payments, flatId, month) {
  return paymentsInMonth(payments, flatId, month).reduce((s, p) => s + (Number(p.amount) || 0), 0);
}

/**
 * একটি ফ্ল্যাটের নির্দিষ্ট মাস পর্যন্ত পূর্ণ হিসাব।
 * due > 0 হলে বকেয়া, due < 0 হলে অগ্রীম জমা।
 */
export function flatStatus(data, flat, asOfMonth) {
  const opening = Number(flat.openingDue) || 0;
  const charged = chargeUpTo(flat, data.settings, asOfMonth);
  const paid = paidUpTo(data.payments, flat.id, asOfMonth);
  const balance = opening + charged - paid;
  const monthPayments = paymentsInMonth(data.payments, flat.id, asOfMonth);
  const monthPaid = monthPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const monthRate = rateForMonth(data.settings, asOfMonth, flat);
  return {
    flat,
    opening,
    charged,
    paid,
    balance,
    due: balance > 0 ? balance : 0,
    advance: balance < 0 ? -balance : 0,
    monthPaid,
    monthPayments,
    monthRate,
    collectorIds: monthPayments.map((p) => p.collectorId).filter(Boolean),
    monthUnpaid: monthPaid <= 0
  };
}

/** সব সক্রিয় ফ্ল্যাটের অবস্থা */
export function allStatuses(data, asOfMonth) {
  return data.flats
    .slice()
    .sort((a, b) => (a.serial || 0) - (b.serial || 0))
    .map((flat) => flatStatus(data, flat, asOfMonth));
}

export function summary(data, asOfMonth) {
  const rows = allStatuses(data, asOfMonth);
  const totals = rows.reduce((acc, r) => {
    acc.monthCollected += r.monthPaid;
    acc.totalDue += r.due;
    acc.totalAdvance += r.advance;
    if (r.due > 0) acc.defaulters += 1;
    if (r.monthPaid > 0) acc.paidThisMonth += 1;
    return acc;
  }, {
    monthCollected: 0,
    totalDue: 0,
    totalAdvance: 0,
    defaulters: 0,
    paidThisMonth: 0,
    flatCount: rows.length
  });
  return { rows, totals };
}

/** কালেক্টর অনুযায়ী কোন মাসে কত আদায় হলো */
export function collectorBreakdown(data, month) {
  const map = new Map();
  data.payments
    .filter((p) => p.month === month)
    .forEach((p) => {
      const key = p.collectorId || '__none__';
      const entry = map.get(key) || { collectorId: p.collectorId || null, amount: 0, count: 0 };
      entry.amount += Number(p.amount) || 0;
      entry.count += 1;
      map.set(key, entry);
    });
  return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
}

/** একটি ফ্ল্যাটের মাসভিত্তিক লেজার */
export function ledger(data, flat, asOfMonth) {
  const start = flatStartMonth(flat, data.settings);
  const rows = [];
  let running = Number(flat.openingDue) || 0;
  if (running !== 0) {
    rows.push({
      month: null,
      label: 'প্রারম্ভিক বকেয়া',
      charge: running,
      paid: 0,
      collectorIds: [],
      balance: running
    });
  }
  const from = U.monthIndex(start);
  const to = U.monthIndex(asOfMonth);
  for (let i = from; i <= to; i += 1) {
    const month = U.indexToMonth(i);
    const endMonth = flatEndMonth(flat, month);
    const charge = U.monthIndex(endMonth) >= i ? rateForMonth(data.settings, month, flat) : 0;
    const monthPayments = paymentsInMonth(data.payments, flat.id, month);
    const paid = monthPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    running += charge - paid;
    rows.push({
      month,
      label: U.monthLabel(month),
      charge,
      paid,
      collectorIds: monthPayments.map((p) => p.collectorId).filter(Boolean),
      balance: running
    });
  }
  return rows;
}

/**
 * ড্রপডাউনে দেখানোর শেষ মাস।
 *
 * আগে সব জায়গায় '2026-08' হার্ডকোড করা ছিল, ফলে সেপ্টেম্বর ২০২৬ এলেও
 * তালিকা আগস্টেই আটকে থাকত — চলতি মাসের এন্ট্রিই দেওয়া যেত না। এখন
 * চলতি মাস নিজে থেকেই যুক্ত হয়, তাই সময় এগোলে সফটওয়্যারও এগোয়।
 *
 * ডাটাবেজে যদি চলতি মাসেরও পরের কোনো এন্ট্রি থাকে (যেমন অগ্রীম জমা),
 * সেটিও যেন হারিয়ে না যায় — তাই দুইয়ের মধ্যে যেটি পরে সেটিই শেষ মাস।
 */
export function lastSelectableMonth(data) {
  let idx = U.monthIndex(U.currentMonth());
  (data.payments || []).forEach((p) => {
    const i = U.monthIndex(p.month);
    if (i > idx) idx = i;
  });
  // দোকান ভাড়ার জমার মাসও তালিকায় থাকা দরকার
  (data.shopRents || []).forEach((r) => {
    const i = U.monthIndex(r.paidMonth);
    if (i > idx) idx = i;
  });
  return U.indexToMonth(idx);
}

/** সেটিংসের শুরুর মাস থেকে lastSelectableMonth পর্যন্ত সব মাসের তালিকা */
export function monthOptions(data) {
  const startIdx = U.monthIndex(data.settings.startMonth || '2024-08');
  const endIdx = U.monthIndex(lastSelectableMonth(data));
  const list = [];
  for (let i = startIdx; i <= Math.max(startIdx, endIdx); i += 1) {
    list.push(U.indexToMonth(i));
  }
  return list;
}

/* ==========================================================================
   মাসিক আয়-ব্যয় হিসাবায়ন
   ========================================================================== */

/** একটি সারির অঙ্ক — উপ-লাইন থাকলে তাদের যোগফল, নইলে সরাসরি বসানো অঙ্ক */
export function ledgerRowAmount(entry) {
  const lines = entry.lines || [];
  // due:true মানে টাকাটা এখনো দেওয়া হয়নি — কাগজে অঙ্কের বদলে "বকেয়া" লেখা
  // থাকে আর যোগফলে ধরা হয় না। এখানেও তাই।
  return lines.length
    ? lines.reduce((sum, l) => sum + (l.due ? 0 : Number(l.amount) || 0), 0)
    : Number(entry.amount) || 0;
}

/**
 * এক মাসের আয়-ব্যয়ের যোগফল ও ক্যাশ ঘাটতি/উদ্বৃত্ত।
 * balance ঋণাত্মক মানে ঘাটতি, ধনাত্মক মানে উদ্বৃত্ত।
 */
export function ledgerSummary(data, month) {
  const all = (data.ledgerEntries || []).filter((e) => e.month === month);
  const stored = all.filter((e) => e.side === 'income');
  const expense = all.filter((e) => e.side === 'expense');

  // বিশেষ নোট — টাকার অঙ্ক নয়, ঘোষণা। কাগজে এগুলো যোগফলের নিচে পুরো
  // পাতা জুড়ে বসে, তাই খরচের কলামেও ঢোকে না, যোগফলেও ধরা হয় না।
  const notes = all
    .filter((e) => e.side === 'note')
    .sort((a, b) => (a.serial ?? 999) - (b.serial ?? 999));

  // ঐ মাসে যাঁদের মাধ্যমে সার্ভিস চার্জ আদায় হয়েছে, তাঁদের সারি জমার খাতায়
  // নিজে থেকেই বসে। ডাটাবেজে কিছু লেখা হয় না — প্রতিবার আদায়ের হিসাব থেকে
  // গুনে নেওয়া হয়, ফলে পরে কোনো আদায় সংশোধন করলে এখানেও সাথে সাথে মেলে।
  //
  // কেউ সারিটি সম্পাদনা করলে সেটি ডাটাবেজে স্থায়ীভাবে বসে যায়, আর তখন এই
  // স্বয়ংক্রিয় সারিটি আর তৈরি হয় না — হাতে লেখা সবসময় অগ্রাধিকার পায়।
  const claimed = new Set(
    all.filter((e) => e.source === 'collector').map((e) => e.refId || '')
  );

  // পুরোনো মাসগুলোর হিসাব কাগজ (PDF) থেকে হুবহু তোলা — সেখানে আদায়কারীদের
  // সারি কাগজের অঙ্কেই আছে। সেটিংসে ledgerAutoFromMonth থাকলে তার আগের
  // মাসে স্বয়ংক্রিয় সারি বসে না, নইলে কাগজের উপর আরেক দফা আদায় যোগ হতো।
  const autoFrom = data.settings.ledgerAutoFromMonth;
  const autoAllowed = !autoFrom || U.monthIndex(month) >= U.monthIndex(autoFrom);

  const auto = (autoAllowed ? collectorLedgerRows(data, month) : [])
    .filter((r) => !claimed.has(r.refId || ''))
    .map((r) => ({
      id: `auto-collector-${r.refId || 'none'}`,
      month,
      side: 'income',
      serial: null,
      title: r.title,
      lines: [],
      amount: r.amount,
      source: 'collector',
      refId: r.refId,
      note: `${U.bnDigits(r.flats)} টি ফ্ল্যাট`,
      auto: true
    }));

  // দোকান ভাড়া — "দোকান ভাড়া এন্ট্রি" পাতায় যা লেখা হয়, সেই মাসের (paidMonth)
  // খতিয়ানে আদায়কারীভিত্তিক একটি সারি হয়ে নিজে থেকেই বসে; উপ-লাইনে
  // দোকানওয়ারি ভাঙা। আদায়কারীদের সারির মতোই: হাতে লেখা/বদলানো সারি
  // (source 'shop-rent', একই refId) থাকলে স্বয়ংক্রিয়টি আর বসে না — পুরোনো
  // মাসগুলোর হাতে লেখা সারি এভাবেই অক্ষত থাকে, দ্বিগুণ হিসাব হয় না।
  const claimedShop = new Set(
    all.filter((e) => e.source === 'shop-rent').map((e) => e.refId || '')
  );
  const autoShop = shopRentLedgerRows(data, month)
    .filter((r) => !claimedShop.has(r.refId || ''))
    .map((r) => ({
      id: `auto-shop-rent-${r.refId || 'none'}`,
      month,
      // অ্যাডভান্স ফেরতের সারি খরচের দিকে, বাকিগুলো জমার দিকে
      side: r.side || 'income',
      serial: null,
      title: r.title,
      lines: r.lines,
      amount: r.amount,
      source: 'shop-rent',
      refId: r.refId,
      note: r.note,
      auto: true
    }));
  const autoShopIncome = autoShop.filter((r) => r.side !== 'expense');
  const autoShopExpense = autoShop.filter((r) => r.side === 'expense');

  // কাগজে আদায়কারীদের সারিগুলো সবার উপরে থাকে, তাই আগে সেগুলোই
  const income = [
    ...auto,
    ...autoShopIncome,
    ...stored.sort((a, b) => (a.serial ?? 999) - (b.serial ?? 999))
  ];
  const expenseSorted = [
    ...autoShopExpense,
    ...expense.sort((a, b) => (a.serial ?? 999) - (b.serial ?? 999))
  ];

  const sum = (list) => list.reduce((t, e) => t + ledgerRowAmount(e), 0);
  const totalIncome = sum(income);
  const totalExpense = sum(expenseSorted);

  // হাতে কিছুই লেখা না হলে হিসাবটি এখনো তৈরি হয়নি — আদায়ের সারিগুলো
  // নিজে থেকে বসে বলে যোগফল দেখা যায়, কিন্তু সেটি সম্পূর্ণ হিসাব নয়।
  const storedCount = all.length;

  return {
    income,
    expense: expenseSorted,
    notes,
    autoCount: auto.length,
    autoShopCount: autoShop.length,
    // এই মাসে আদায়কারীদের স্বয়ংক্রিয় সারি ইচ্ছাকৃতভাবে বন্ধ (কাগজ থেকে তোলা হিসাব)
    autoDisabled: !autoAllowed,
    storedCount,
    // খরচের একটিও সারি নেই অথচ আদায় আছে — মাসটি অসম্পূর্ণ
    incomplete: income.length > 0 && expenseSorted.length === 0,
    totalIncome,
    totalExpense,
    balance: totalIncome - totalExpense,
    lineCount: [...income, ...expenseSorted].reduce(
      (n, e) => n + Math.max(1, (e.lines || []).length),
      0
    )
  };
}

/**
 * আদায়ের হিসাব থেকে আদায়কারীভিত্তিক সারি বানানো।
 * ledgerSummary এগুলো নিজে থেকেই জমার খাতায় বসিয়ে দেয়।
 */
export function collectorLedgerRows(data, month) {
  // কাগজে সম্বোধনসহ লেখা হয় — "জনাব নীতিশ রঞ্জন", "মিসেস সীমা চন্দ"।
  // সেটিংসে সম্বোধন না দেওয়া থাকলে শুধু নামই বসে, ভুল সম্বোধন বসে না।
  const people = new Map(
    (data.settings.collectors || []).map((c) => [
      c.id,
      { name: c.bn || c.en, honorific: (c.honorific || '').trim() }
    ])
  );
  const totals = new Map();

  data.payments
    .filter((p) => p.month === month && Number(p.amount) > 0)
    .forEach((p) => {
      const key = p.collectorId || '';
      const cur = totals.get(key) || { amount: 0, flats: 0 };
      cur.amount += Number(p.amount) || 0;
      cur.flats += 1;
      totals.set(key, cur);
    });

  return Array.from(totals.entries())
    .sort((a, b) => b[1].amount - a[1].amount)
    .map(([collectorId, t]) => {
      const p = people.get(collectorId);
      const who = p ? [p.honorific, p.name].filter(Boolean).join(' ') : '';
      return {
        refId: collectorId,
        collectorName: p ? p.name : '',
        flats: t.flats,
        amount: t.amount,
        title: who
          ? `${who} কর্তৃক আদায় (${U.monthLabelShort(month)} এর সার্ভিস চার্জ বাবদ)`
          : `আদায়কারী উল্লেখ নেই (${U.monthLabelShort(month)} এর সার্ভিস চার্জ বাবদ)`
      };
    });
}

/**
 * আগের মাসের ফলাফল — ঘাটতি থাকলে চলতি মাসের খরচে, উদ্বৃত্ত থাকলে আয়ে বসে।
 * আগের মাসের কোনো হিসাবই না থাকলে null (তখন সারিটি বসানো হয় না)।
 */
export function carryoverRow(data, month) {
  const prev = U.addMonths(month, -1);
  const hasPrev = (data.ledgerEntries || []).some((e) => e.month === prev);
  if (!hasPrev) return null;

  const { balance } = ledgerSummary(data, prev);
  if (balance === 0) return null;

  return balance < 0
    ? {
        side: 'expense',
        amount: -balance,
        title: `পূর্বের হিসাবের ক্যাশ (${U.monthLabelShort(prev)}) ঘাটতি পূরণ`
      }
    : {
        side: 'income',
        amount: balance,
        title: `পূর্বের হিসাবের ক্যাশ (${U.monthLabelShort(prev)}) উদ্বৃত্ত`
      };
}

/* ==========================================================================
   দোকান ভাড়া

   দুই রকম মাস আছে, দুটোই দরকার:
     rentMonth — কোন মাসের ভাড়া (ভাড়াটিয়ার হিসাব, বকেয়া এর উপর)
     paidMonth — কোন মাসের খতিয়ানে টাকাটা জমা পড়ল (সমিতির ক্যাশের হিসাব)
   যেমন অক্টোবর-২৫ এর খতিয়ানে ৩নং দোকানের মে-জুলাই তিন মাসের ভাড়া একসাথে
   এসেছিল: rentMonth মে/জুন/জুলাই, paidMonth অক্টোবর।
   ========================================================================== */

export const SHOP_RENT_KINDS = [
  { id: 'rent', label: 'ভাড়া' },
  { id: 'electricity', label: 'বিদ্যুৎ বিল' },
  { id: 'other', label: 'অন্যান্য / সমন্বয়' },
  // অ্যাডভান্স (জামানত): গ্রহণ নগদে ঢোকে, সমন্বয় নগদ নয় (ভাড়া থেকে কাটা),
  // ফেরত নগদে বেরোয়। ব্যালেন্স = গ্রহণ − সমন্বয় − ফেরত।
  { id: 'advance-adjust', label: 'অ্যাডভান্স থেকে ভাড়া সমন্বয়' },
  // বিদ্যুৎ বিলও অ্যাডভান্স থেকে কাটা যায় — জামানত কমে, বিল পরিশোধ ধরা হয়, নগদ নয়
  { id: 'advance-adjust-elec', label: 'অ্যাডভান্স থেকে বিদ্যুৎ বিল সমন্বয়' },
  { id: 'advance', label: 'অ্যাডভান্স (জামানত) গ্রহণ' },
  { id: 'advance-refund', label: 'অ্যাডভান্স ফেরত' }
];
/** নগদে ওঠা দোকান-ভাড়া খাতের জমা — খতিয়ানের "দোকানের ভাড়া আদায়" সারি */
export const SHOP_CASH_KINDS = ['rent', 'electricity', 'other'];
/** যে খাতগুলো ভাড়ার পাওনা মেটায় (নগদ হোক বা অ্যাডভান্স থেকে কাটা) */
export const SHOP_SETTLING_KINDS = ['rent', 'other', 'advance-adjust'];
/** অ্যাডভান্স থেকে কাটা — দুই রকম (ভাড়া / বিদ্যুৎ); দুটোই জামানত কমায়, নগদ নয় */
export const SHOP_ADJUST_KINDS = ['advance-adjust', 'advance-adjust-elec'];

export function shopKindLabel(kind) {
  const k = SHOP_RENT_KINDS.find((x) => x.id === kind);
  return k ? k.label : kind;
}

/** দোকানের তালিকা ক্রমিক অনুযায়ী; includeInactive না দিলে কেবল চালু দোকান */
export function shopsSorted(data, includeInactive = false) {
  return (data.shops || [])
    .filter((s) => includeInactive || s.active !== false)
    .slice()
    .sort((a, b) => (a.serial || 0) - (b.serial || 0));
}

/** কাগজে যেভাবে লেখা হয়: "১নং দোকান" */
export function shopLabel(shop) {
  if (!shop) return '';
  return `${U.bnDigits(shop.shopNo)}নং দোকান`;
}

/* ---- ভাড়াটিয়ার ইতিহাস (tenancies) ----
   একটি দোকানে পরপর একাধিক ভাড়াটিয়া থাকতে পারে, মাঝে দোকান ফাঁকা।
   তালিকা থাকলে কেবল সময়কালের মাসগুলোতেই ভাড়া ধার্য; ফাঁকা মাস বকেয়া নয়।
   তালিকা খালি থাকলে পুরোনো নিয়ম: joinMonth → closedFrom, একটিই tenantName। */

/** ভাড়াটিয়ার তালিকা, শুরুর মাস অনুযায়ী সাজানো (কেবল বৈধ fromMonth) */
export function shopTenancies(shop) {
  const list = Array.isArray(shop.tenancies) ? shop.tenancies : [];
  return list
    .filter((t) => t && /^\d{4}-\d{2}$/.test(t.fromMonth || ''))
    .slice()
    .sort((a, b) => U.monthIndex(a.fromMonth) - U.monthIndex(b.fromMonth));
}

/** ঐ মাসে কে ভাড়ায় ছিলেন — tenancy বা null (খালি তালিকায় সবসময় null) */
export function shopTenancyFor(shop, month) {
  const i = U.monthIndex(month);
  return (
    shopTenancies(shop).find(
      (t) => i >= U.monthIndex(t.fromMonth) && (!t.toMonth || i <= U.monthIndex(t.toMonth))
    ) || null
  );
}

/** বর্তমান ভাড়াটিয়া (চলমান সময়কাল), না থাকলে শেষজন; খালি তালিকায় null */
export function shopCurrentTenancy(shop, asOfMonth) {
  const list = shopTenancies(shop);
  if (!list.length) return null;
  const m = asOfMonth || U.currentMonth();
  return shopTenancyFor(shop, m) || list.filter((t) => U.monthIndex(t.fromMonth) <= U.monthIndex(m)).pop() || list[0];
}

/** ঐ মাসের ভাড়াটিয়ার নাম — ইতিহাস না থাকলে দোকানের সাধারণ নাম */
export function shopTenantName(shop, month) {
  if (!shop) return '';
  const t = month ? shopTenancyFor(shop, month) : shopCurrentTenancy(shop);
  if (t) return t.tenantName || '';
  if (shopTenancies(shop).length) return '';
  return shop.tenantName || '';
}

/**
 * অ্যাডভান্সের সারিটি (rentMonth) কোন ভাড়াটিয়ার খাতায় — সময়কালের ভেতরে
 * হলে তাঁর; বাইরে হলে (যেমন ছাড়ার পরের মাসে ফেরত) তার আগের সর্বশেষজনের।
 */
export function shopTenancyForDeposit(shop, month, row) {
  const list = shopTenancies(shop);
  if (!list.length) return null;
  // সারিতে ভাড়াটিয়ার id লেখা থাকলে সেটিই (ফর্ম থেকে লেখা হলে থাকে)
  if (row && row.tenancyId) {
    const byId = list.find((t) => t.id === row.tenancyId);
    if (byId) return byId;
  }
  const inside = shopTenancyFor(shop, month);
  if (inside) return inside;
  const i = U.monthIndex(month);
  return list.filter((t) => U.monthIndex(t.fromMonth) <= i).pop() || list[0];
}

/** নির্দিষ্ট মাসে এই দোকানের ধার্য মাসিক ভাড়া — ভাড়াটিয়ার চুক্তির হার, নইলে
 *  rentHistory, নইলে monthlyRent */
export function shopRentForMonth(shop, month) {
  const t = shopTenancyFor(shop, month);
  if (t && Number(t.rent) > 0) return Number(t.rent);
  const history = Array.isArray(shop.rentHistory) ? shop.rentHistory : [];
  const idx = U.monthIndex(month);
  let rate = null;
  history
    .slice()
    .sort((a, b) => U.monthIndex(a.fromMonth) - U.monthIndex(b.fromMonth))
    .forEach((h) => {
      if (h.fromMonth && U.monthIndex(h.fromMonth) <= idx) rate = Number(h.rate) || 0;
    });
  return rate == null ? Number(shop.monthlyRent) || 0 : rate;
}

/** কোন মাস থেকে ভাড়া ধরা হবে — প্রথম ভাড়াটিয়ার শুরু, নইলে joinMonth */
export function shopStartMonth(shop, settings) {
  const list = shopTenancies(shop);
  if (list.length) return list[0].fromMonth;
  return shop.joinMonth || settings.startMonth || '2024-08';
}

/** কোন মাস পর্যন্ত ভাড়া ধরা হবে — শেষ ভাড়াটিয়ার শেষ মাস (চলমান হলে asOfMonth),
 *  ইতিহাস না থাকলে closedFrom-এর আগের মাস */
export function shopEndMonth(shop, asOfMonth) {
  const list = shopTenancies(shop);
  if (list.length) {
    const last = list[list.length - 1];
    if (last.toMonth && U.monthIndex(last.toMonth) < U.monthIndex(asOfMonth)) return last.toMonth;
    return asOfMonth;
  }
  if (shop.closedFrom && U.monthIndex(shop.closedFrom) <= U.monthIndex(asOfMonth)) {
    return U.addMonths(shop.closedFrom, -1);
  }
  return asOfMonth;
}

/** ঐ মাসে দোকানটি ভাড়ায় ছিল কি না (ফাঁকা মাসে ভাড়া ধার্য হয় না) */
export function shopIsChargeable(shop, settings, month) {
  if (shopTenancies(shop).length) return !!shopTenancyFor(shop, month);
  const i = U.monthIndex(month);
  return (
    i >= U.monthIndex(shopStartMonth(shop, settings)) &&
    i <= U.monthIndex(shopEndMonth(shop, month))
  );
}

/** শুরু থেকে asOfMonth পর্যন্ত মোট ধার্য ভাড়া — কেবল ভাড়ায় থাকা মাসগুলোর */
export function shopChargeUpTo(shop, settings, asOfMonth) {
  const from = U.monthIndex(shopStartMonth(shop, settings));
  const to = U.monthIndex(shopEndMonth(shop, asOfMonth));
  let total = 0;
  for (let i = from; i <= to; i += 1) {
    const m = U.indexToMonth(i);
    if (shopIsChargeable(shop, settings, m)) total += shopRentForMonth(shop, m);
  }
  return total;
}

/** শুরু থেকে asOfMonth পর্যন্ত যে মাসগুলোতে দোকান ফাঁকা ছিল (ইতিহাসের ফাঁক) */
export function shopVacantMonths(shop, settings, asOfMonth) {
  if (!shopTenancies(shop).length) return [];
  const from = U.monthIndex(shopStartMonth(shop, settings));
  const to = U.monthIndex(asOfMonth);
  const out = [];
  for (let i = from; i <= to; i += 1) {
    const m = U.indexToMonth(i);
    if (!shopIsChargeable(shop, settings, m)) out.push(m);
  }
  return out;
}

/** একটি দোকানের সব আদায় */
export function shopRentsOf(data, shopId) {
  return (data.shopRents || []).filter((r) => r.shopId === shopId);
}

const sumAmt = (list) => list.reduce((s, r) => s + (Number(r.amount) || 0), 0);

/**
 * একটি দোকানের নির্দিষ্ট মাস (rentMonth) পর্যন্ত পূর্ণ হিসাব।
 * ভাড়ার বকেয়া = ধার্য ভাড়া − (ভাড়া + অন্যান্য/সমন্বয়)। বিদ্যুৎ বিল ভাড়ার
 * হিসাবে ঢোকে না — সেটি আলাদা করে দেখানো হয়।
 */
export function shopStatus(data, shop, asOfMonth) {
  const limit = U.monthIndex(asOfMonth);
  const rents = shopRentsOf(data, shop.id).filter((r) => U.monthIndex(r.rentMonth) <= limit);
  const charged = shopChargeUpTo(shop, data.settings, asOfMonth);
  const paidRent = sumAmt(rents.filter((r) => r.kind === 'rent'));
  const paidOther = sumAmt(rents.filter((r) => r.kind === 'other'));
  // অ্যাডভান্স থেকে কাটা — নগদ নয়, কিন্তু ঐ মাসের ভাড়া পরিশোধিত
  const paidAdjust = sumAmt(rents.filter((r) => r.kind === 'advance-adjust'));
  // বিদ্যুৎ বিল: নগদে দেওয়া + অ্যাডভান্স থেকে কাটা = মোট পরিশোধিত বিল
  const electricityCash = sumAmt(rents.filter((r) => r.kind === 'electricity'));
  const electricityAdjust = sumAmt(rents.filter((r) => r.kind === 'advance-adjust-elec'));
  const balance = charged - paidRent - paidOther - paidAdjust;
  return {
    shop,
    charged,
    paidRent,
    paidOther,
    paidAdjust,
    paid: paidRent + paidOther + paidAdjust,
    electricity: electricityCash + electricityAdjust,
    electricityCash,
    electricityAdjust,
    balance,
    due: balance > 0 ? balance : 0,
    // "advance" এখানে অগ্রীম (বেশি দেওয়া ভাড়া) — অ্যাডভান্স/জামানত নয়, সেটি deposit
    advance: balance < 0 ? -balance : 0,
    deposit: shopDeposit(data, shop, asOfMonth),
    monthRate: shopRentForMonth(shop, asOfMonth)
  };
}

/**
 * একটি দোকানের অ্যাডভান্স (জামানত) খাতা — asOfMonth দিলে ঐ মাস পর্যন্ত
 * (rentMonth ধরে), না দিলে পুরোটা। balance = received − adjusted − refunded।
 * agreed/monthlyAdjust চুক্তির তথ্য (দোকানের ঘরে লেখা), history কালানুক্রমে।
 */
export function shopDeposit(data, shop, asOfMonth, tenancy) {
  const limit = asOfMonth ? U.monthIndex(asOfMonth) : Infinity;
  let rows = shopRentsOf(data, shop.id).filter(
    (r) => r.kind && r.kind.startsWith('advance') && U.monthIndex(r.rentMonth) <= limit
  );
  // নির্দিষ্ট ভাড়াটিয়ার খাতা চাইলে — কেবল তাঁর সারিগুলো
  if (tenancy) rows = rows.filter((r) => (shopTenancyForDeposit(shop, r.rentMonth, r) || {}).id === tenancy.id);
  const received = sumAmt(rows.filter((r) => r.kind === 'advance'));
  const adjustedRent = sumAmt(rows.filter((r) => r.kind === 'advance-adjust'));
  const adjustedElec = sumAmt(rows.filter((r) => r.kind === 'advance-adjust-elec'));
  const adjusted = adjustedRent + adjustedElec;
  const refunded = sumAmt(rows.filter((r) => r.kind === 'advance-refund'));
  // চুক্তির অঙ্ক — ভাড়াটিয়ার (দেওয়া থাকলে বা বর্তমানজনের), নইলে দোকানের
  const t = tenancy || shopCurrentTenancy(shop, asOfMonth);
  const agreed = t && Number(t.advanceAmount) > 0 ? Number(t.advanceAmount) : Number(shop.advanceAmount) || 0;
  const monthlyAdjust = t && Number(t.advanceAdjust) > 0 ? Number(t.advanceAdjust) : Number(shop.advanceAdjust) || 0;
  return {
    received,
    adjusted,
    adjustedRent,
    adjustedElec,
    refunded,
    balance: received - adjusted - refunded,
    agreed,
    monthlyAdjust,
    tenancy: t,
    history: rows
      .slice()
      .sort((a, b) => U.monthIndex(a.rentMonth) - U.monthIndex(b.rentMonth) || a.kind.localeCompare(b.kind))
  };
}

/** প্রতিটি ভাড়াটিয়ার অ্যাডভান্স খাতা আলাদা — আগেরজনের ফেরত বাকি আছে কিনা দেখতে */
export function shopDepositByTenancy(data, shop, asOfMonth) {
  return shopTenancies(shop).map((t) => ({ tenancy: t, ...shopDeposit(data, shop, asOfMonth, t) }));
}

/**
 * একটি ভাড়াটিয়ার সময়কালের (fromMonth – toMonth/asOfMonth) পূর্ণ হিসাব — ছাড়ার
 * সময়ের "চূড়ান্ত হিসাব": ধার্য, নগদ, সমন্বয়, বকেয়া, বিদ্যুৎ, অ্যাডভান্সের খাতা।
 * tenancy null হলে পুরো দোকানের হিসাবই (শুরু থেকে asOfMonth)।
 */
export function shopTenancyStatement(data, shop, tenancy, asOfMonth) {
  if (!tenancy) {
    const status = shopStatus(data, shop, asOfMonth);
    return {
      tenancy: null,
      fromMonth: shopStartMonth(shop, data.settings),
      toMonth: asOfMonth,
      rows: shopLedger(data, shop, asOfMonth),
      status,
      deposit: status.deposit,
      netRefund: status.deposit.balance - status.due
    };
  }
  const endIdx = Math.min(
    U.monthIndex(asOfMonth),
    tenancy.toMonth ? U.monthIndex(tenancy.toMonth) : Infinity
  );
  const toMonth = U.indexToMonth(endIdx);
  const rows = shopLedger(data, shop, toMonth).filter(
    (r) => U.monthIndex(r.month) >= U.monthIndex(tenancy.fromMonth) && (r.tenancy || {}).id === tenancy.id
  );
  const sumRow = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
  const charged = sumRow('charge');
  const paidRent = sumRow('rent');
  const paidOther = sumRow('other');
  const paidAdjust = sumRow('adjust');
  const balance = charged - paidRent - paidOther - paidAdjust;
  // অ্যাডভান্সের সারি — ভাড়াটিয়ার id ধরে; সময়কালের বাইরে (ছাড়ার পরের মাসে
  // ফেরত) পড়লেও তাঁর খাতাতেই
  const deposit = shopDeposit(data, shop, asOfMonth, tenancy);
  const status = {
    shop,
    charged,
    paidRent,
    paidOther,
    paidAdjust,
    paid: paidRent + paidOther + paidAdjust,
    electricity: sumRow('electricity'),
    electricityCash: sumRow('electricityCash'),
    electricityAdjust: sumRow('electricityAdjust'),
    balance,
    due: balance > 0 ? balance : 0,
    advance: balance < 0 ? -balance : 0,
    deposit,
    monthRate: Number(tenancy.rent) > 0 ? Number(tenancy.rent) : shopRentForMonth(shop, tenancy.fromMonth)
  };
  return {
    tenancy,
    fromMonth: tenancy.fromMonth,
    toMonth,
    rows,
    status,
    deposit,
    // ছাড়ার পর নিট পাওনা: জামানতে যা বাকি − ভাড়ার বকেয়া (ঋণাত্মক = ভাড়াটিয়া দেবেন)
    netRefund: deposit.balance - status.due
  };
}

/** সব দোকানের অ্যাডভান্স মিলিয়ে — সমিতির কাছে ভাড়াটিয়াদের মোট জমা (দায়) */
export function shopDepositTotals(data, asOfMonth) {
  return shopsSorted(data, true).reduce(
    (acc, shop) => {
      const d = shopDeposit(data, shop, asOfMonth);
      acc.received += d.received;
      acc.adjusted += d.adjusted;
      acc.adjustedRent += d.adjustedRent;
      acc.adjustedElec += d.adjustedElec;
      acc.refunded += d.refunded;
      acc.balance += d.balance;
      if (d.received || d.adjusted || d.refunded) acc.shopCount += 1;
      return acc;
    },
    { received: 0, adjusted: 0, adjustedRent: 0, adjustedElec: 0, refunded: 0, balance: 0, shopCount: 0 }
  );
}

/** একটি দোকানের মাসভিত্তিক লেজার (rentMonth ধরে), ফ্ল্যাটের ledger() এর অনুরূপ */
export function shopLedger(data, shop, asOfMonth) {
  const from = U.monthIndex(shopStartMonth(shop, data.settings));
  const to = U.monthIndex(asOfMonth);
  const rents = shopRentsOf(data, shop.id);
  const rows = [];
  let running = 0;
  let prevTenancyId = null;
  for (let i = from; i <= to; i += 1) {
    const month = U.indexToMonth(i);
    const chargeable = shopIsChargeable(shop, data.settings, month);
    const charge = chargeable ? shopRentForMonth(shop, month) : 0;
    const tenancy = shopTenancyFor(shop, month);
    // ভাড়াটিয়া বদলালে বকেয়া নতুনজনের জন্য শূন্য থেকে শুরু — আগেরজনের পুরো
    // হিসাব তাঁর চূড়ান্ত বিবরণীতে (shopTenancyStatement); মাঝের ফাঁকা মাস বাদ
    if (tenancy && prevTenancyId !== null && tenancy.id !== prevTenancyId) running = 0;
    if (tenancy) prevTenancyId = tenancy.id;
    const inMonth = rents.filter((r) => r.rentMonth === month);
    const rent = sumAmt(inMonth.filter((r) => r.kind === 'rent'));
    const other = sumAmt(inMonth.filter((r) => r.kind === 'other'));
    const adjust = sumAmt(inMonth.filter((r) => r.kind === 'advance-adjust'));
    const electricityCash = sumAmt(inMonth.filter((r) => r.kind === 'electricity'));
    const electricityAdjust = sumAmt(inMonth.filter((r) => r.kind === 'advance-adjust-elec'));
    const depositIn = sumAmt(inMonth.filter((r) => r.kind === 'advance'));
    const depositOut = sumAmt(inMonth.filter((r) => r.kind === 'advance-refund'));
    running += charge - rent - other - adjust;
    rows.push({
      month,
      label: U.monthLabel(month),
      charge,
      chargeable,
      // ইতিহাস আছে অথচ এ মাসে কেউ ছিল না = দোকান ফাঁকা
      vacant: !chargeable && shopTenancies(shop).length > 0,
      tenancy,
      rent,
      other,
      adjust,
      // বিদ্যুৎ বিল মোট (নগদ + অ্যাডভান্স থেকে কাটা); ভাগ আলাদা
      electricity: electricityCash + electricityAdjust,
      electricityCash,
      electricityAdjust,
      depositIn,
      depositOut,
      paid: rent + other + adjust,
      items: inMonth,
      collectorIds: Array.from(new Set(inMonth.map((r) => r.collectorId).filter(Boolean))),
      paidMonths: Array.from(new Set(inMonth.map((r) => r.paidMonth).filter(Boolean))).sort(),
      // ভাড়াটিয়ার শেষ মাস — এর পরে তাঁর চূড়ান্ত হিসাবের সারি বসে
      tenancyEnds: !!(tenancy && tenancy.toMonth === month),
      balance: running
    });
  }
  return rows;
}

/**
 * এক মাসের খতিয়ানে (paidMonth) দোকান ভাড়া খাতে কত উঠল, কোন কোন দোকান থেকে।
 * এটিই "মাসভিত্তিক দোকান ভাড়া" রিপোর্টের মূল টেবিল।
 */
export function shopRentByPaidMonth(data, paidMonth) {
  const inMonth = (data.shopRents || []).filter((r) => r.paidMonth === paidMonth);
  const shops = shopsSorted(data, true);
  const rows = shops
    .map((shop) => {
      const items = inMonth.filter((r) => r.shopId === shop.id);
      if (!items.length) return null;
      const rent = sumAmt(items.filter((r) => r.kind === 'rent'));
      const electricity = sumAmt(items.filter((r) => r.kind === 'electricity'));
      const other = sumAmt(items.filter((r) => r.kind === 'other'));
      // অ্যাডভান্স: গ্রহণ ও ফেরত নগদ (আলাদা খাত), সমন্বয় নগদ নয় — স্মারক
      const deposit = sumAmt(items.filter((r) => r.kind === 'advance'));
      const refund = sumAmt(items.filter((r) => r.kind === 'advance-refund'));
      const adjustRent = sumAmt(items.filter((r) => r.kind === 'advance-adjust'));
      const adjustElec = sumAmt(items.filter((r) => r.kind === 'advance-adjust-elec'));
      return {
        shop,
        items,
        rent,
        electricity,
        other,
        deposit,
        refund,
        // সমন্বয় মোট (ভাড়া + বিদ্যুৎ), ভাগ আলাদা
        adjust: adjustRent + adjustElec,
        adjustRent,
        adjustElec,
        // "মোট" = দোকান-ভাড়া খাতে নগদ জমা; অ্যাডভান্স গ্রহণ/ফেরত আলাদা কলামে
        total: rent + electricity + other,
        rentMonths: Array.from(
          new Set(items.filter((r) => SHOP_SETTLING_KINDS.includes(r.kind) && r.kind !== 'other').map((r) => r.rentMonth))
        ).sort(),
        collectorIds: Array.from(new Set(items.map((r) => r.collectorId).filter(Boolean))),
        notes: items.map((r) => r.note).filter(Boolean)
      };
    })
    .filter(Boolean);
  const totals = rows.reduce(
    (acc, r) => {
      acc.rent += r.rent;
      acc.electricity += r.electricity;
      acc.other += r.other;
      acc.deposit += r.deposit;
      acc.refund += r.refund;
      acc.adjust += r.adjust;
      acc.total += r.total;
      return acc;
    },
    { rent: 0, electricity: 0, other: 0, deposit: 0, refund: 0, adjust: 0, total: 0, shopCount: rows.length }
  );
  return { rows, totals };
}

/**
 * পুরোনো কাগজের একত্রিত "দোকান ভাড়া ও বিবিধ আয়" — দোকানওয়ারি বা মাসওয়ারি
 * ভাঙা নেই (যেমন আগস্ট-২৩ হতে জুলাই-২৪: ২০,৭০০)। সেটিংসে থাকে:
 *   shopRentLegacy: [{ id, fromMonth, toMonth, amount, label }]
 * রিপোর্টে আলাদা সারিতে দেখানো হয়, বকেয়ার হিসাবে ঢোকে না।
 */
export function shopRentLegacy(data) {
  const list = Array.isArray(data.settings.shopRentLegacy) ? data.settings.shopRentLegacy : [];
  return list
    .filter((l) => l && Number(l.amount) > 0)
    .map((l, i) => ({
      id: l.id || `legacy-${i + 1}`,
      fromMonth: l.fromMonth || '',
      toMonth: l.toMonth || '',
      amount: Number(l.amount) || 0,
      label: l.label || 'দোকান ভাড়া ও বিবিধ আয় (পূর্বের হিসাব)'
    }))
    .sort((a, b) => U.monthIndex(a.fromMonth) - U.monthIndex(b.fromMonth));
}

/**
 * যত মাসে (paidMonth) দোকান ভাড়া খাতে কিছু উঠেছে, নতুন থেকে পুরোনো ক্রমে —
 * প্রতি মাসের দোকানওয়ারি ভাঙা ও যোগফল। "মাসভিত্তিক দোকান ভাড়া" পাতার মূল তালিকা।
 */
export function shopRentMonthlyList(data) {
  // প্রথম জমার মাস থেকে চলতি মাস পর্যন্ত প্রতিটি মাস — যে মাসে কিছু ওঠেনি
  // সেটিও তালিকায় থাকে (rows খালি), নইলে ফাঁকা মাসগুলো চোখে পড়ে না।
  const paidMonths = (data.shopRents || []).map((r) => r.paidMonth).filter(Boolean);
  if (!paidMonths.length) {
    return { list: [], grand: { rent: 0, electricity: 0, other: 0, deposit: 0, refund: 0, adjust: 0, total: 0, monthCount: 0 } };
  }
  const from = Math.min(...paidMonths.map(U.monthIndex));
  const to = Math.max(U.monthIndex(lastSelectableMonth(data)), ...paidMonths.map(U.monthIndex));
  const months = [];
  for (let i = to; i >= from; i -= 1) months.push(U.indexToMonth(i));
  const list = months.map((month) => ({ month, ...shopRentByPaidMonth(data, month) }));
  const grand = list.reduce(
    (acc, m) => {
      acc.rent += m.totals.rent;
      acc.electricity += m.totals.electricity;
      acc.other += m.totals.other;
      acc.deposit += m.totals.deposit;
      acc.refund += m.totals.refund;
      acc.adjust += m.totals.adjust;
      acc.total += m.totals.total;
      return acc;
    },
    { rent: 0, electricity: 0, other: 0, deposit: 0, refund: 0, adjust: 0, total: 0, monthCount: list.filter((m) => m.rows.length).length }
  );
  return { list, grand };
}

/**
 * দোকান × মাস ছক (rentMonth ধরে) — কোন দোকানের কোন মাসের ভাড়া জমা পড়েছে,
 * কোনটি বকেয়া, এক নজরে। শেষ কলামে toMonth পর্যন্ত মোট বকেয়া।
 */
export function shopRentMatrix(data, fromMonth, toMonth) {
  const months = [];
  for (let i = U.monthIndex(fromMonth); i <= U.monthIndex(toMonth); i += 1) {
    months.push(U.indexToMonth(i));
  }
  const shops = shopsSorted(data, true);
  const rows = shops.map((shop) => {
    const rents = shopRentsOf(data, shop.id);
    const cells = months.map((m) => {
      const inMonth = rents.filter((r) => r.rentMonth === m);
      const chargeable = shopIsChargeable(shop, data.settings, m);
      return {
        month: m,
        chargeable,
        charge: chargeable ? shopRentForMonth(shop, m) : 0,
        rent: sumAmt(inMonth.filter((r) => r.kind === 'rent')),
        electricity: sumAmt(inMonth.filter((r) => r.kind === 'electricity')),
        other: sumAmt(inMonth.filter((r) => r.kind === 'other')),
        // অ্যাডভান্স থেকে কাটা — ভাড়া পরিশোধ ধরা হয়, নগদ নয়
        adjust: sumAmt(inMonth.filter((r) => r.kind === 'advance-adjust')),
        // বিদ্যুৎ বিলের যে অংশ অ্যাডভান্স থেকে কাটা (উপরের electricity-তে নেই)
        electricityAdjust: sumAmt(inMonth.filter((r) => r.kind === 'advance-adjust-elec')),
        // জমার মাস — ভাড়া/বিদ্যুৎ/সমন্বয়ের; অ্যাডভান্স গ্রহণ/ফেরতের মাস এখানে নয়
        paidMonths: Array.from(new Set(
          inMonth.filter((r) => r.kind !== 'advance' && r.kind !== 'advance-refund').map((r) => r.paidMonth).filter(Boolean)
        )).sort()
      };
    });
    return {
      shop,
      cells,
      totals: cells.reduce(
        (a, c) => ({
          charge: a.charge + c.charge,
          rent: a.rent + c.rent,
          electricity: a.electricity + c.electricity,
          other: a.other + c.other,
          adjust: a.adjust + c.adjust,
          electricityAdjust: a.electricityAdjust + c.electricityAdjust
        }),
        { charge: 0, rent: 0, electricity: 0, other: 0, adjust: 0, electricityAdjust: 0 }
      ),
      status: shopStatus(data, shop, toMonth)
    };
  });
  const colTotals = months.map((m, i) =>
    rows.reduce(
      (a, r) => ({
        month: m,
        charge: a.charge + r.cells[i].charge,
        rent: a.rent + r.cells[i].rent,
        electricity: a.electricity + r.cells[i].electricity,
        other: a.other + r.cells[i].other,
        adjust: a.adjust + r.cells[i].adjust,
        electricityAdjust: a.electricityAdjust + r.cells[i].electricityAdjust
      }),
      { month: m, charge: 0, rent: 0, electricity: 0, other: 0, adjust: 0, electricityAdjust: 0 }
    )
  );
  return { months, rows, colTotals };
}

/**
 * এক মাসের (paidMonth) দোকান ভাড়ার আদায় থেকে খতিয়ানের income সারি বানানো —
 * আদায়কারী অনুযায়ী একটি করে সারি, উপ-লাইনে দোকান ও খাত অনুযায়ী ভাঙা।
 * ledgerSummary এগুলো নিজে থেকেই জমার খাতায় বসায়।
 */
export function shopRentLedgerRows(data, paidMonth) {
  const allInMonth = (data.shopRents || []).filter(
    (r) => r.paidMonth === paidMonth && Number(r.amount) > 0
  );
  if (!allInMonth.length) return [];
  // নগদে ওঠা ভাড়া-খাত; অ্যাডভান্স গ্রহণ/ফেরত আলাদা সারিতে (নিচে), সমন্বয় নগদ নয়
  const inMonth = allInMonth.filter((r) => SHOP_CASH_KINDS.includes(r.kind));
  // একই মাসে (paidMonth) কোন দোকানের কত অ্যাডভান্স থেকে কাটা হলো — ভাড়ার
  // লাইনের শেষে স্মারক হিসেবে, যোগফলে নয়
  const adjustByShop = new Map();
  const elecAdjustByShop = new Map();
  allInMonth
    .filter((r) => r.kind === 'advance-adjust')
    .forEach((r) => adjustByShop.set(r.shopId, (adjustByShop.get(r.shopId) || 0) + (Number(r.amount) || 0)));
  allInMonth
    .filter((r) => r.kind === 'advance-adjust-elec')
    .forEach((r) => elecAdjustByShop.set(r.shopId, (elecAdjustByShop.get(r.shopId) || 0) + (Number(r.amount) || 0)));

  const people = new Map(
    (data.settings.collectors || []).map((c) => [
      c.id,
      { name: c.bn || c.en, honorific: (c.honorific || '').trim() }
    ])
  );
  const shopById = new Map((data.shops || []).map((s) => [s.id, s]));
  const shopOrder = (id) => (shopById.get(id) && shopById.get(id).serial) || 999;
  const kindOrder = { rent: 0, electricity: 1, other: 2 };

  const byCollector = new Map();
  inMonth.forEach((r) => {
    const key = r.collectorId || '';
    if (!byCollector.has(key)) byCollector.set(key, []);
    byCollector.get(key).push(r);
  });

  const cashRows = Array.from(byCollector.entries()).map(([collectorId, items]) => {
    // দোকান + খাত অনুযায়ী এক লাইনে — একই দোকানের একাধিক মাসের ভাড়া একসাথে
    const groups = new Map();
    items.forEach((r) => {
      const gk = `${r.shopId}|${r.kind}`;
      if (!groups.has(gk)) {
        groups.set(gk, { shopId: r.shopId, kind: r.kind, months: [], amount: 0, notes: [] });
      }
      const g = groups.get(gk);
      if (!g.months.includes(r.rentMonth)) g.months.push(r.rentMonth);
      g.amount += Number(r.amount) || 0;
      if (r.note) g.notes.push(r.note);
    });

    const lines = Array.from(groups.values())
      .sort(
        (a, b) =>
          shopOrder(a.shopId) - shopOrder(b.shopId) || kindOrder[a.kind] - kindOrder[b.kind]
      )
      .map((g) => {
        const shop = shopById.get(g.shopId);
        const who = shop ? shopLabel(shop) : 'দোকান';
        const monthsTxt = g.months.sort().map(U.monthLabelShort).join(', ');
        // নোট থাকলে লাইনের শেষে — যেমন "৮ মাসের ভাড়া একত্রে"
        const noteTxt = g.notes.length ? ` — ${g.notes.join('; ')}` : '';
        let text;
        // ঐ দোকানের এ মাসে অ্যাডভান্স থেকে কাটা থাকলে — স্মারক, নগদ নয়
        const adj = adjustByShop.get(g.shopId) || 0;
        const adjTxt = adj > 0 ? ` (এছাড়া অ্যাডভান্স থেকে সমন্বয় ${U.bnNumber(adj)}, নগদ নয়)` : '';
        const eadj = elecAdjustByShop.get(g.shopId) || 0;
        const eadjTxt = eadj > 0 ? ` (এছাড়া বিদ্যুৎ বিল অ্যাডভান্স থেকে সমন্বয় ${U.bnNumber(eadj)}, নগদ নয়)` : '';
        if (g.kind === 'rent') text = `${who}ের ভাড়া (${monthsTxt}) আদায়${noteTxt}${adjTxt}`;
        else if (g.kind === 'electricity') text = `${who}ের বিদ্যুৎ বিল (${monthsTxt}) আদায়${noteTxt}${eadjTxt}`;
        else text = g.notes.length ? g.notes.join('; ') : `${who} — অন্যান্য/সমন্বয় (${monthsTxt})`;
        return { text, amount: g.amount };
      });

    const p = people.get(collectorId);
    const who = p ? [p.honorific, p.name].filter(Boolean).join(' ') : '';
    const shopCount = new Set(items.map((r) => r.shopId)).size;
    return {
      side: 'income',
      refId: collectorId,
      collectorName: p ? p.name : '',
      title: who
        ? `${who} কর্তৃক দোকানের ভাড়া আদায়`
        : 'দোকানের ভাড়া আদায় (আদায়কারী উল্লেখ নেই)',
      lines,
      amount: lines.reduce((s, l) => s + l.amount, 0),
      note: `${U.bnDigits(shopCount)} টি দোকান`
    };
  });

  // অ্যাডভান্স (জামানত) গ্রহণ → আয়ের আলাদা সারি; ফেরত → খরচের সারি।
  // refId-তে ":advance"/":refund" যুক্ত — ভাড়ার সারির claim-এর সাথে মেশে না।
  const depositRows = (kind, side, suffix, titleOf, lineOf) => {
    const rows = allInMonth.filter((r) => r.kind === kind);
    if (!rows.length) return [];
    const byCol = new Map();
    rows.forEach((r) => {
      const key = r.collectorId || '';
      if (!byCol.has(key)) byCol.set(key, []);
      byCol.get(key).push(r);
    });
    return Array.from(byCol.entries()).map(([collectorId, items]) => {
      const p = people.get(collectorId);
      const who = p ? [p.honorific, p.name].filter(Boolean).join(' ') : '';
      const lines = items
        .slice()
        .sort((a, b) => shopOrder(a.shopId) - shopOrder(b.shopId))
        .map((r) => {
          const shop = shopById.get(r.shopId);
          const noteTxt = r.note ? ` — ${r.note}` : '';
          return { text: `${lineOf(shop ? shopLabel(shop) : 'দোকান', r)}${noteTxt}`, amount: Number(r.amount) || 0 };
        });
      return {
        side,
        refId: `${collectorId}:${suffix}`,
        collectorName: p ? p.name : '',
        title: titleOf(who),
        lines,
        amount: lines.reduce((s, l) => s + l.amount, 0),
        note: `${U.bnDigits(new Set(items.map((r) => r.shopId)).size)} টি দোকান`
      };
    });
  };
  const received = depositRows(
    'advance', 'income', 'advance',
    (who) => (who ? `${who} কর্তৃক দোকানের অ্যাডভান্স (জামানত) গ্রহণ` : 'দোকানের অ্যাডভান্স (জামানত) গ্রহণ'),
    (label, r) => `${label}ের অ্যাডভান্স (${U.monthLabelShort(r.rentMonth)}) গ্রহণ`
  );
  const refunded = depositRows(
    'advance-refund', 'expense', 'refund',
    (who) => (who ? `${who} কর্তৃক দোকানের অ্যাডভান্স (জামানত) ফেরত` : 'দোকানের অ্যাডভান্স (জামানত) ফেরত'),
    (label, r) => `${label}ের অ্যাডভান্স (${U.monthLabelShort(r.rentMonth)}) ফেরত`
  );

  return [...cashRows, ...received, ...refunded];
}
