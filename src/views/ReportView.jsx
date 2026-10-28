import React, { useState, useEffect, useRef } from 'react';
import { useData } from '../context/DataContext';
import * as Calc from '../utils/calc';
import * as U from '../utils/format';
import {
  Printer, FileText, ChevronLeft, ChevronDown, Layers, Building2, Store,
  ClipboardList, CheckSquare, Square
} from 'lucide-react';
import { Watermark } from '../components/Watermark';
import { ResidentBadge } from '../components/ResidentBadge';
import { MonthSelector } from '../components/MonthSelector';
import { LOGO_BASE64 } from '../assets/logoData';
import QRCode from 'qrcode';

// ছাপা কাগজ থেকে অনলাইন রিপোর্টে যাওয়ার ঠিকানা — ফুটারের লেখা ও QR, দুটোরই উৎস
const REPORT_LINK = 'https://nkfms-8c1a6.web.app/#/reports';

// QR-এ রিপোর্টের পরিচয়ও থাকে: #/reports?rt=<ধরন>&rm=<মাস>&rf=<ফ্ল্যাট>।
// স্ক্যান করলে ভিউ মোডে ঢুকে (AuthContext) ঠিক সেই রিপোর্টটিই খুলে যায়।
const REPORT_TYPES = ['monthly', 'selective', 'dues-list', 'cashbook', 'ledger', 'shop-rent'];
function readDeepLink() {
  const h = typeof window !== 'undefined' ? window.location.hash || '' : '';
  const qi = h.indexOf('?');
  if (qi === -1 || !/^#\/?reports$/.test(h.slice(0, qi))) return null;
  const p = new URLSearchParams(h.slice(qi + 1));
  return {
    rt: REPORT_TYPES.includes(p.get('rt')) ? p.get('rt') : null,
    rm: /^[0-9]{4}-[0-9]{2}$/.test(p.get('rm') || '') ? p.get('rm') : null,
    rf: p.get('rf') || null
  };
}

// জমা পড়েনি বোঝাতে লাল '-'; ছাপার সময়ও রঙটি যেন থেকে যায় (styles/print.css)
const DASH = <span className="dash">-</span>;

/**
 * আয়-ব্যয় খতিয়ানের এক পাশ (আদায় বা খরচ) ছাপার সারিতে ভাঙা।
 *
 * উপ-লাইনহীন সারি → একটি সারি: [ক্রমিক] [বিবরণ] [পরিমাণ]
 * উপ-লাইনসহ সারি  → শিরোনামের একটি সারি, তারপর প্রতিটি লাইনের সারি;
 *                    ক্রমিকের ঘরটি সবগুলো জুড়ে থাকে (rowSpan) — কাগজে
 *                    যেভাবে মার্জ করা থাকে ঠিক সেভাবেই।
 */
function cashbookCells(entries) {
  const cell = { padding: '2.5px 6px', verticalAlign: 'middle' };
  const out = [];

  entries.forEach((e, idx) => {
    const lines = e.lines || [];
    const serial = U.bnDigits(idx + 1);

    if (!lines.length) {
      out.push([
        <td key="s" style={{ ...cell, textAlign: 'center' }}>{serial}</td>,
        <td key="t" style={{ ...cell, textAlign: 'left' }}>{e.title}</td>,
        <td key="a" style={{ ...cell, textAlign: 'right' }}>
          {U.bnNumber(Calc.ledgerRowAmount(e))}
        </td>
      ]);
      return;
    }

    out.push([
      <td key="s" rowSpan={lines.length + 1} style={{ ...cell, textAlign: 'center' }}>
        {serial}
      </td>,
      <td key="t" colSpan={2} style={{ ...cell, textAlign: 'left', fontWeight: 600 }}>
        {e.title}
      </td>
    ]);

    lines.forEach((l, li) => {
      out.push([
        <td key={`t${li}`} style={{ ...cell, textAlign: 'left', paddingLeft: '16px' }}>
          {l.text}
        </td>,
        <td
          key={`a${li}`}
          style={
            l.due
              ? { ...cell, textAlign: 'center', color: '#b91c1c',
                  fontWeight: 700, background: '#fee2e2' }
              : { ...cell, textAlign: 'right' }
          }
        >
          {l.due ? 'বকেয়া' : U.bnNumber(l.amount)}
        </td>
      ]);
    });
  });

  return out;
}

const CASHBOOK_BLANK = [
  <td key="b1">&nbsp;</td>,
  <td key="b2">&nbsp;</td>,
  <td key="b3">&nbsp;</td>
];

export function ReportView({
  defaultReport = 'monthly',
  selectiveFlatIds = null,
  autoPrint = false,
  onAutoPrintDone
}) {
  const { data, selectedMonth, setSelectedMonth, setMonthLock } = useData();

  // QR ডিপ-লিংক একবারই পড়া হয় (রিফ্রেশে যেন বারবার টেনে না ধরে, নিচের
  // এফেক্টে প্রয়োগের পর ঠিকানা থেকে প্যারামিটার মুছে ফেলা হয়)
  const deepLinkRef = useRef(readDeepLink());
  const deep = deepLinkRef.current;

  const [reportType, setReportType] = useState((deep && deep.rt) || defaultReport);
  const [selectedLedgerFlatId, setSelectedLedgerFlatId] = useState(
    (deep && deep.rt === 'ledger' && deep.rf) || data.flats[0]?.id || ''
  );
  // বকেয়া বিবরণীর QR-এ বাছাই করা ফ্ল্যাটের তালিকাও থাকে (rf=fA-1,fB-2…)
  const [deepSelectiveIds] = useState(() =>
    deep && deep.rt === 'selective' && deep.rf ? deep.rf.split(',') : null
  );

  // ---- মাসভিত্তিক বকেয়া লিস্ট — কোন কোন ফ্ল্যাট ----
  // null মানে "যাদের বকেয়া আছে সবাই"। বকেয়া পাতা থেকে বাছাই করে এলে বা
  // QR-এ তালিকা থাকলে সেটিই বসে; এখানকার বাছাই-ঘর থেকেও বদলানো যায়।
  const [duesListIds, setDuesListIds] = useState(() => {
    if (deep && deep.rt === 'dues-list' && deep.rf) return deep.rf.split(',');
    if (defaultReport === 'dues-list' && selectiveFlatIds && selectiveFlatIds.length) {
      return selectiveFlatIds;
    }
    return null;
  });
  const [duesPickerOpen, setDuesPickerOpen] = useState(false);

  const s = data.settings;
  const monthShort = U.monthLabelShort(selectedMonth);

  const { rows, totals } = Calc.summary(data, selectedMonth);

  // অন্য পাতা থেকে "প্রিন্ট ও PDF" চেপে এলে ছাপার ঘরটি নিজে থেকেই আসে।
  // সামান্য দেরি — নইলে ফন্ট ও বিন্যাস বসার আগেই ব্রাউজার ছবি নিয়ে নেয়।
  useEffect(() => {
    if (!autoPrint) return;
    const t = setTimeout(() => {
      window.print();
      if (onAutoPrintDone) onAutoPrintDone();
    }, 600);
    return () => clearTimeout(t);
  }, [autoPrint, onAutoPrintDone]);

  // আয়-ব্যয় হিসাবায়ন — আদায়কারীদের সারি ledgerSummary নিজেই বসিয়ে দেয়
  // আয়-ব্যয় হিসাবায়ন খুললেই আগের মাস দেখানো — চলতি মাস এখনো চলছে,
  // তার হিসাব অসম্পূর্ণ বলে খুলেই সেটি দেখালে ভুল বোঝাবুঝি হয়। কেবল
  // ট্যাবে ঢোকার মুহূর্তে চলতি মাস বাছা থাকলে সরানো হয়; ড্রপডাউন থেকে
  // পরে যেকোনো মাস (চলতি মাসও) দেখা যায়। লেজার-এন্ট্রি পাতার "ছাপুন"
  // দিয়ে এলে (autoPrint) নয় — তখন যে মাসে এন্ট্রি হচ্ছিল সেটিই ছাপে।
  const autoPrintRef = useRef(autoPrint);
  useEffect(() => { autoPrintRef.current = autoPrint; }, [autoPrint]);
  const cashNudgeRef = useRef(null);
  useEffect(() => {
    if (reportType === 'cashbook' && !autoPrintRef.current) {
      setSelectedMonth((m) => {
        if (m !== U.currentMonth()) return m;
        cashNudgeRef.current = { from: m, to: U.addMonths(m, -1) };
        return cashNudgeRef.current.to;
      });
    }
    return () => {
      // আয়-ব্যয় থেকে বেরোনোর সময়: মাসটি আমরাই নামিয়ে থাকলে, আর
      // ব্যবহারকারী মাঝখানে নিজে না বদলে থাকলে, আগের মাস ফিরিয়ে দিই —
      // নইলে মাসিক সারসংক্ষেপে ফিরে অবাক হতে হয় কেন মাস পিছিয়ে আছে।
      const nudge = cashNudgeRef.current;
      cashNudgeRef.current = null;
      if (reportType === 'cashbook' && nudge) {
        setSelectedMonth((m) => (m === nudge.to ? nudge.from : m));
      }
    };
  }, [reportType, setSelectedMonth]);

  // QR ডিপ-লিংকের মাস প্রয়োগ — ইচ্ছে করে উপরের আয়-ব্যয় এফেক্টের *পরে*
  // ঘোষণা করা: মাউন্টে দুটোই চললে শেষ কথা QR-এর মাসেরই থাকে। প্রয়োগ
  // শেষে ঠিকানা থেকে প্যারামিটার মুছে দেওয়া হয়, যাতে পরে পেজ রিফ্রেশ
  // করলে বা অন্য রিপোর্টে গেলে পুরনো প্যারামিটার আবার টেনে না ধরে।
  useEffect(() => {
    if (!deepLinkRef.current) return;
    const d = deepLinkRef.current;
    deepLinkRef.current = null;
    if (d.rm) setSelectedMonth(d.rm);
    window.history.replaceState(null, '', '#/reports');
  }, [setSelectedMonth]);

  const cash = Calc.ledgerSummary(data, selectedMonth);
  const cashDeficit = cash.balance < 0;
  // মাসটি এখনো চলছে — এর হিসাব মাস শেষ হওয়ার আগে তৈরি হওয়ার কথা নয়
  const cashRunning = selectedMonth === U.currentMonth();
  const cashIn = cashbookCells(cash.income);
  const cashOut = cashbookCells(cash.expense);
  // Legal পাতায় ১৩px হরফে ~৩৭ সারি পর্যন্ত ধরে। ৩৬-এর বেশি হলে
  // আপনা-আপনি ছোট মাপে নেমে আসে, যাতে ছাপা সবসময় এক পাতায় থাকে।
  const cashRowCount = Math.max(cashIn.length, cashOut.length);

  const getCollectorName = (colId) => {
    const c = (s.collectors || []).find((x) => x.id === colId);
    return c ? (c.bn || c.en) : '';
  };

  // ---- বকেয়া বিবরণী ----
  // উপরের ড্রপডাউনে যে মাস বাছা, বিবরণী ঠিক সেই মাস পর্যন্তই হিসাব করে।
  // আগে এক মাস আগে পর্যন্ত ধরা হতো (চলতি মাসের আদায়ের সময় পার হয়নি
  // বলে), কিন্তু তাতে বাছাই করা মাস আর ছাপা মাস আলাদা হয়ে বিভ্রান্তি হতো।
  const duesUpToMonth = selectedMonth;

  // ফ্ল্যাটভিত্তিক লেজার সবসময় গত মাস পর্যন্ত। চলতি মাস এখনো শেষ হয়নি,
  // তাই তার জমা-বকেয়া দেখানো বিভ্রান্তিকর। মাসটি নির্বাচিত মাসের উপর
  // নির্ভর করে না — আজকের তারিখ থেকেই ঠিক হয়।
  const ledgerMonth = U.addMonths(U.currentMonth(), -1);
  const ledgerMonthLabel = U.monthLabel(ledgerMonth);
  const ledgerMonthShort = U.monthLabelShort(ledgerMonth);

  // এই ট্যাব খোলা থাকলে নেভবারের মাস ড্রপডাউন নিষ্ক্রিয় থাকে
  useEffect(() => {
    setMonthLock(
      reportType === 'ledger'
        ? { month: ledgerMonth,
            reason: `ফ্ল্যাটভিত্তিক লেজার সবসময় ${ledgerMonthLabel} পর্যন্ত — মাস বদলানো যাবে না` }
        : null
    );
    return () => setMonthLock(null);
  }, [reportType, ledgerMonth, ledgerMonthLabel, setMonthLock]);
  // বকেয়া পাতা থেকে এলে তার বাছাই, QR স্ক্যানে এলে QR-এর তালিকা — কোনোটাই
  // না থাকলে সব ফ্ল্যাট। QR-এর তালিকায় অচেনা আইডি থাকলে ফিল্টারে বাদ পড়ে,
  // সব অচেনা হলে সব ফ্ল্যাটে নেমে আসে।
  const effSelectiveIds =
    (selectiveFlatIds && selectiveFlatIds.length ? selectiveFlatIds : null) || deepSelectiveIds;
  let targetFlats = effSelectiveIds
    ? data.flats.filter((f) => effSelectiveIds.includes(f.id))
    : data.flats;
  if (!targetFlats.length) targetFlats = data.flats;
  const selectiveStatuses = targetFlats.map((f) => Calc.flatStatus(data, f, duesUpToMonth));

  // ---- মাসভিত্তিক বকেয়া লিস্ট ----
  // প্রতিটি নির্বাচিত ফ্ল্যাটের চার্জ শুরুর মাস থেকে নির্বাচিত মাস পর্যন্ত
  // পুরো লেজার: কোন মাসে কত ধার্য, কত জমা, জের কত। কোনো বাছাই না থাকলে
  // যাদের বকেয়া আছে তারা সবাই।
  const allFlatsSorted = data.flats.slice().sort((a, b) => (a.serial || 0) - (b.serial || 0));
  const duesCandidateIds = duesListIds
    ? new Set(duesListIds)
    : new Set(
        allFlatsSorted
          .filter((f) => Calc.flatStatus(data, f, duesUpToMonth).due > 0)
          .map((f) => f.id)
      );
  const duesList = allFlatsSorted
    .filter((f) => duesCandidateIds.has(f.id))
    .map((f) => {
      const rows = Calc.ledger(data, f, duesUpToMonth);
      const status = Calc.flatStatus(data, f, duesUpToMonth);
      // যেসব মাসের টাকা পুরো জমা পড়েনি — তার প্রথম ও শেষ মাস থেকেই
      // "বকেয়া কোন মাস হতে কোন মাস পর্যন্ত" লেখা হয়
      const unpaidRows = rows.filter((r) => r.month && r.charge > r.paid);
      return {
        flat: f,
        rows,
        status,
        startMonth: Calc.flatStartMonth(f, data.settings),
        monthCount: rows.filter((r) => r.month && r.charge > 0).length,
        unpaidMonths: rows.filter((r) => r.charge > r.paid).length,
        firstUnpaid: unpaidRows.length ? unpaidRows[0].month : null,
        lastUnpaid: unpaidRows.length ? unpaidRows[unpaidRows.length - 1].month : null
      };
    });
  // "অক্টোবর-২৫ হতে অক্টোবর-২৬" — বকেয়া না থাকলে '—'
  const duesRangeLabel = (d, br = false) => {
    if (!d.firstUnpaid) return '—';
    if (d.firstUnpaid === d.lastUnpaid) return U.monthLabelShort(d.firstUnpaid);
    return br ? (
      <>
        {U.monthLabelShort(d.firstUnpaid)} হতে<br />{U.monthLabelShort(d.lastUnpaid)}
      </>
    ) : `${U.monthLabelShort(d.firstUnpaid)} হতে ${U.monthLabelShort(d.lastUnpaid)}`;
  };
  const duesTotals = duesList.reduce(
    (acc, d) => {
      acc.charged += d.status.opening + d.status.charged;
      acc.paid += d.status.paid;
      acc.due += d.status.due;
      acc.unpaidMonths += d.unpaidMonths;
      return acc;
    },
    { charged: 0, paid: 0, due: 0, unpaidMonths: 0 }
  );
  // ছকের গঠন: মাস সারিতে, ফ্ল্যাট কলামে (দোকান ভাড়ার "খ" ছকের মতো)।
  // মাসের সীমা: নির্বাচিতদের মধ্যে সবচেয়ে আগের চার্জ-শুরুর মাস থেকে
  // নির্বাচিত মাস পর্যন্ত। ফ্ল্যাট বেশি হলে ১০টি করে আলাদা ছক — প্রতিটি
  // নিজের পাতায়, যাতে A4 খাড়া পাতায় ঘরগুলো পড়ার মতো চওড়া থাকে।
  const duesMonths = (() => {
    if (!duesList.length) return [];
    const fromIdx = Math.min(...duesList.map((d) => U.monthIndex(d.startMonth)));
    const toIdx = U.monthIndex(duesUpToMonth);
    const out = [];
    for (let i = fromIdx; i <= toIdx; i += 1) out.push(U.indexToMonth(i));
    return out;
  })();
  const duesHasOpening = duesList.some((d) => d.status.opening > 0);
  const duesCols = duesList.map((d) => {
    const byMonth = new Map(d.rows.filter((r) => r.month).map((r) => [r.month, r]));
    const startIdx = U.monthIndex(d.startMonth);
    return {
      ...d,
      cells: duesMonths.map((m) => {
        const r = byMonth.get(m);
        const idx = U.monthIndex(m);
        const chargeable = idx >= startIdx && U.monthIndex(Calc.flatEndMonth(d.flat, m)) >= idx;
        return { month: m, chargeable, charge: r ? r.charge : 0, paid: r ? r.paid : 0 };
      })
    };
  });
  const DUES_COLS_PER_PAGE = 10;
  const duesChunks = [];
  for (let i = 0; i < duesCols.length; i += DUES_COLS_PER_PAGE) {
    duesChunks.push(duesCols.slice(i, i + DUES_COLS_PER_PAGE));
  }
  const duesPickerToggle = (id) => {
    setDuesListIds((prev) => {
      const cur = prev ? prev.slice() : Array.from(duesCandidateIds);
      return cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    });
  };

  // হেডারের তারিখ = রিপোর্ট যতটুকু সময় ঢেকেছে তার শেষ দিন। লেজার ছাড়া
  // বাকি সব রিপোর্ট নির্বাচিত মাস পর্যন্ত, তাই তারিখও সেই মাসের শেষ দিন।
  const headDateMonth = reportType === 'ledger' ? ledgerMonth : selectedMonth;

  // ---- ফোনে "এক নজরে পুরো পাতা" ----
  // শিটটি সবসময় আসল A4 মাপে (৭৯৪px) আঁকা হয়; ফোনে তাই পাশে সরিয়ে
  // দেখতে হয়। এই টগলটি চাপলে পুরো পাতাটি পর্দার মাপে ছোট করে দেখানো
  // হয় — লেখা ছোট হলেও টেবিলের গড়ন ও কোন তথ্য কোথায় তা এক নজরে বোঝা
  // যায়। ছাপায় এর কোনো প্রভাব নেই (print.css এ zoom: 1 !important)।
  const scrollRef = useRef(null);
  // ফোনে পাতাটি প্রথমে এক নজরে (ছোট করে পুরোটা) দেখানো হয় — খুলেই
  // A4-র এক কোণা দেখলে নতুন ব্যবহারকারী দিশা পান না। "আসল মাপ" চাপলে
  // পড়ার মাপে গিয়ে পাশে সরিয়ে দেখা যায়। ডেস্কটপে আগের মতোই পুরো মাপ।
  const [fitSheet, setFitSheet] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 900
  );
  const [fitZoom, setFitZoom] = useState(0.46);
  useEffect(() => {
    if (!fitSheet) return;
    const measure = () => {
      const el = scrollRef.current;
      if (!el || !el.clientWidth) return;
      // শিটের প্রকৃত প্রস্থ — আয়-ব্যয় আড়াআড়ি (১১২৩px), বাকিগুলো ৭৯৪px
      const sheet = el.querySelector('.print-sheet');
      const sheetW = (sheet && sheet.offsetWidth) || 794;
      setFitZoom(Math.min(1, el.clientWidth / sheetW));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
    // reportType বদলালে শিটের প্রস্থও বদলায় (আয়-ব্যয় আড়াআড়ি) — তাই নতুন করে মাপা
  }, [fitSheet, reportType]);

  const ledgerFlat = data.flats.find((f) => f.id === selectedLedgerFlatId) || data.flats[0];
  const ledgerRows = ledgerFlat ? Calc.ledger(data, ledgerFlat, ledgerMonth) : [];
  const ledgerStatus = ledgerFlat ? Calc.flatStatus(data, ledgerFlat, ledgerMonth) : null;

  // ---- দোকান ভাড়া বিবরণী ----
  // উপরের টেবিল: নির্বাচিত মাসের খতিয়ানে (জমার মাস) দোকান ভাড়া খাতে কত উঠল,
  // কোন দোকান থেকে। নিচের ছক: গত ১২ মাসের (ভাড়ার মাস) দোকান × মাস — কোন
  // মাসের ভাড়া জমা পড়েছে, কোনটি বকেয়া, এক নজরে।
  // "খ" ছক: সফটওয়্যারের শুরুর মাস (আগস্ট-২৪) থেকে নির্বাচিত মাস পর্যন্ত সব মাস।
  // মাস অনেক, তাই মাসগুলো সারিতে আর দোকানগুলো কলামে — A4-এ ধরে।
  const shopMatrixFrom = s.startMonth || '2024-08';
  const shopMatrix = Calc.shopRentMatrix(data, shopMatrixFrom, selectedMonth);
  const shopGridElec = shopMatrix.rows.reduce((s2, r) => s2 + r.totals.electricity, 0);
  const shopGridTotal = shopMatrix.rows.reduce((s2, r) => s2 + r.totals.rent + r.totals.other, 0) + shopGridElec;
  // পুরোনো কাগজের একত্রিত "দোকান ভাড়া ও বিবিধ আয়" (সেটিংসে shopRentLegacy)
  const shopLegacy = Calc.shopRentLegacy(data);
  const shopLegacyTotal = shopLegacy.reduce((s2, l) => s2 + l.amount, 0);
  const shopLegacyFrom = shopLegacy.length ? shopLegacy[0].fromMonth : shopMatrixFrom;
  const shopLegacyTo = shopLegacy.length ? shopLegacy[shopLegacy.length - 1].toMonth : shopMatrixFrom;
  const shopLegacyLabel = s.shopRentLegacyLabel || 'পূর্বের একত্রিত আদায়';
  // রিপোর্টের পুরো সময়কাল — পুরোনো কাগজের শুরু (আগস্ট-২৩) থেকে নির্বাচিত মাস পর্যন্ত
  const shopReportFrom = shopLegacy.length ? shopLegacyFrom : shopMatrixFrom;
  const shopReportMonths = Math.max(0, U.monthIndex(selectedMonth) - U.monthIndex(shopReportFrom) + 1);

  // QR কোডটি ব্রাউজারেই আঁকা হয় (কোনো বাইরের সার্ভিসে যায় না)। লিংকে এখন
  // খোলা রিপোর্টের পরিচয়ও থাকে — যে রিপোর্ট ছাপা, স্ক্যানে সেটিই খুলবে।
  // লেজারের মাস কোডেই বাঁধা (সবসময় গত মাস), তাই লেজারে rm পাঠানো হয় না —
  // পরে স্ক্যান করলে তখনকার হালনাগাদ লেজারটিই দেখাবে।
  const qrLink = (() => {
    const q = new URLSearchParams({ rt: reportType });
    if (reportType === 'ledger') {
      if (ledgerFlat) q.set('rf', ledgerFlat.id);
    } else {
      q.set('rm', selectedMonth);
      if (reportType === 'selective' && effSelectiveIds && targetFlats.length < data.flats.length) {
        q.set('rf', targetFlats.map((f) => f.id).join(','));
      }
      // হাতে বাছাই করা তালিকা থাকলে QR-এও সেটি যায়; "সব বকেয়া" হলে নয় —
      // তখন স্ক্যানের দিনের হালনাগাদ বকেয়াদারই দেখাবে
      if (reportType === 'dues-list' && duesListIds && duesList.length) {
        q.set('rf', duesList.map((d) => d.flat.id).join(','));
      }
    }
    return REPORT_LINK + '?' + q.toString();
  })();
  const [qrDataUrl, setQrDataUrl] = useState('');
  useEffect(() => {
    QRCode.toDataURL(qrLink, { errorCorrectionLevel: 'M', margin: 1, scale: 8 })
      .then(setQrDataUrl)
      .catch(() => {});
  }, [qrLink]);

  // ---- প্রতিটি ছাপা পাতার সাধারণ অংশ ----
  // মাসভিত্তিক বকেয়া লিস্ট একাধিক পাতায় ছাপে; প্রতিটি পাতা যেন নিজেই
  // পূর্ণাঙ্গ হয় — লেটারহেড, মাঝে জলছাপ, স্বাক্ষর ও QR — তাই এই তিনটি
  // অংশ আলাদা করে রাখা, এক পাতার রিপোর্টগুলোও এগুলোই ব্যবহার করে।
  const headBlock = (
    <div className="print-head">
      <div className="head-logo">
        <img src={LOGO_BASE64} alt="Logo" />
        <div className="logo-label">NKFMS</div>
      </div>
      <div className="head-center">
        <div className="society">{s.societyName}</div>
        <div className="committee">{s.committeeName}</div>
        <div className="title">
          {reportType === 'monthly' && `সার্ভিস চার্জ জমা ও বকেয়া হিসাবায়ন সারসংক্ষেপ (${monthShort} পর্যন্ত)`}
          {reportType === 'selective' && `ফ্ল্যাট মালিকদের বকেয়া সার্ভিস চার্জ বিবরণী (${U.monthLabel(duesUpToMonth)} পর্যন্ত)`}
          {/* এক লাইনে রাখতে ছোট শিরোনাম — "ফ্ল্যাট মালিকদের" অংশটি বাদ,
              ছকের কলামেই তো মালিকদের নাম */}
          {reportType === 'dues-list' && (
            <span style={{ whiteSpace: 'nowrap' }}>
              {`মাসভিত্তিক সার্ভিস চার্জ জমা ও বকেয়া লিস্ট (${U.monthLabel(duesUpToMonth)} পর্যন্ত)`}
            </span>
          )}
          {reportType === 'cashbook' && `সার্ভিস হিসাবায়ন সারসংক্ষেপ (${monthShort})`}
          {reportType === 'ledger' && `ফ্ল্যাটভিত্তিক সার্ভিস চার্জ লেজার ও বকেয়া বিবরণী (${ledgerMonthLabel} পর্যন্ত)`}
          {reportType === 'shop-rent' && `দোকান ভাড়া আদায় ও বকেয়া বিবরণী (${monthShort})`}
        </div>
      </div>
      <div className="head-date">
        তারিখ: {U.monthEndDateLabel(headDateMonth)}
        {reportType === 'ledger' && ledgerFlat && (
          <div style={{ fontSize: '10.5px', marginTop: '2px' }}>
            ফ্ল্যাট: <b className="flat-no">{ledgerFlat.flatNo}</b>
          </div>
        )}
      </div>
    </div>
  );

  const signsBlock = (
    <div className="print-signs" style={{ marginTop: '30px' }}>
      {(s.signatories || []).map((sig) => (
        <div key={sig.id} className="s">
          <div className="line"></div>
          <div className="sd">স্বাক্ষরিত/-</div>
          <div className="nm">{sig.name}</div>
          <div className="dg">{sig.designation}</div>
          <div className="dg">{s.committeeName}</div>
        </div>
      ))}
    </div>
  );

  // ছাপা কাগজ থেকে সরাসরি অনলাইন রিপোর্টে যাওয়ার পথ
  const footerLinkBlock = (
    <div className="print-footer-link">
      {qrDataUrl && <img className="qr" src={qrDataUrl} alt="QR কোড" title={qrLink} />}
      <div className="txt">
        <div className="t1">এই রিপোর্টটি সরাসরি অনলাইনে দেখতে QR কোডটি স্ক্যান করুন, অথবা ব্রাউজারে লিখুন:</div>
        <div className="t2">{REPORT_LINK}</div>
      </div>
    </div>
  );

  // মাসভিত্তিক বকেয়া লিস্টের পাতাগুলো: ১০টি ফ্ল্যাটের প্রতিটি ছক এক পাতা,
  // একাধিক ফ্ল্যাট হলে শেষে সারসংক্ষেপের পাতা
  const duesPages = duesChunks.map((cols, i) => ({ kind: 'chunk', cols, index: i }));
  if (duesList.length > 1) duesPages.push({ kind: 'summary' });
  if (!duesPages.length) duesPages.push({ kind: 'empty' });

  return (
    <div className="page-body">
      {/* Top Toolbar (Hidden on Print) */}
      <div
        className="card no-print"
        style={{
          padding: '14px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px'
        }}
      >
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={() => setReportType('monthly')}
            className={`btn btn-sm ${reportType === 'monthly' ? 'btn-primary' : 'btn-outline'}`}
          >
            মাসিক সারসংক্ষেপ রিপোর্ট
          </button>
          <button
            onClick={() => setReportType('selective')}
            className={`btn btn-sm ${reportType === 'selective' ? 'btn-primary' : 'btn-outline'}`}
          >
            বকেয়া বিবরণী রিপোর্ট
          </button>
          <button
            onClick={() => setReportType('dues-list')}
            className={`btn btn-sm ${reportType === 'dues-list' ? 'btn-primary' : 'btn-outline'}`}
          >
            <ClipboardList size={14} /> বকেয়া লিস্ট (মাসভিত্তিক)
          </button>
          <button
            onClick={() => setReportType('cashbook')}
            className={`btn btn-sm ${reportType === 'cashbook' ? 'btn-primary' : 'btn-outline'}`}
          >
            আয়-ব্যয় হিসাবায়ন
          </button>
          <button
            onClick={() => setReportType('ledger')}
            className={`btn btn-sm ${reportType === 'ledger' ? 'btn-primary' : 'btn-outline'}`}
          >
            ফ্ল্যাটভিত্তিক লেজার স্টেটমেন্ট
          </button>
          <button
            onClick={() => setReportType('shop-rent')}
            className={`btn btn-sm ${reportType === 'shop-rent' ? 'btn-primary' : 'btn-outline'}`}
          >
            <Store size={14} /> দোকান ভাড়া বিবরণী
          </button>

          {/* ফ্ল্যাট বাছাইয়ের ঘরটি আগে ডান কোণে প্রিন্ট বোতামের পাশে ছিল,
              চোখে পড়ত না। লেজার বোতামের ঠিক পাশে আনা হলো — যে বোতামটি
              চেপে এখানে আসা হয়, তার গায়েই বাছাইয়ের ঘর।              */}
          {reportType === 'ledger' && (
            <div className="ledger-flat-picker">
              <span className="picker-icon" aria-hidden="true">
                <Building2 size={15} />
              </span>
              <label htmlFor="ledger-flat">ফ্ল্যাট সিলেক্ট করুন</label>
              {/* নেটিভ select-এর তীরটি ব্রাউজারভেদে আলাদা দেখায়, তাই নিজের
                  তীর বসানো — ঘরটি সব জায়গায় একই রকম লাগে।            */}
              <div className="picker-select">
                <select
                  id="ledger-flat"
                  value={selectedLedgerFlatId}
                  onChange={(e) => setSelectedLedgerFlatId(e.target.value)}
                >
                  {data.flats.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.flatNo} — {f.ownerName}
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} className="picker-chevron" aria-hidden="true" />
              </div>
              <span className="picker-count" title="মোট ফ্ল্যাট">
                {U.bnDigits(data.flats.length)}টি
              </span>
            </div>
          )}
        </div>

        <div className="report-toolbar-actions">
          {/* হিসাবের মাস — আগে উপরের নেভবারে ছিল, রিপোর্টের বোতামগুলো থেকে
              দূরে বলে চোখে পড়ত না। প্রিন্ট বোতামের পাশে আনা হলো।        */}
          <MonthSelector id="report-month" />

          <button
            onClick={() => window.print()}
            className="btn btn-success btn-print"
          >
            <Printer size={16} />
            <span>
              প্রিন্ট / PDF ডাউনলোড
              {/* ফোনে কীবোর্ড নেই, তাই শর্টকাটটি সেখানে দেখানো হয় না */}
              <span className="only-desktop"> (Ctrl + P)</span>
            </span>
          </button>
        </div>
      </div>

      {/* মাসভিত্তিক বকেয়া লিস্ট — কোন কোন ফ্ল্যাট ছাপা হবে তার বাছাই-ঘর।
          বকেয়া পাতা থেকে বাছাই করে এলে সেটিই বসে থাকে; এখানেও যোগ-বাদ
          করা যায়। কিছু না বাছলে যাদের বকেয়া আছে তারা সবাই।          */}
      {reportType === 'dues-list' && (
        <div className="card no-print dues-flat-picker">
          <div className="dp-head">
            <div className="dp-title">
              <ClipboardList size={16} />
              <span>
                ফ্ল্যাট বাছাই: <b>{U.bnDigits(duesList.length)} টি</b> নির্বাচিত
                {!duesListIds && <span className="dp-auto"> (যাদের বকেয়া আছে সবাই)</span>}
              </span>
            </div>
            <div className="dp-actions">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setDuesListIds(null)}>
                সব বকেয়াদার
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setDuesListIds(allFlatsSorted.map((f) => f.id))}
              >
                সব ফ্ল্যাট
              </button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setDuesListIds([])}>
                সব বাদ
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setDuesPickerOpen((v) => !v)}
              >
                {duesPickerOpen ? 'তালিকা গুটান' : 'ফ্ল্যাট বাছুন'}
              </button>
            </div>
          </div>
          {duesPickerOpen && (
            <div className="dp-grid">
              {allFlatsSorted.map((f) => {
                const on = duesCandidateIds.has(f.id);
                const st = Calc.flatStatus(data, f, duesUpToMonth);
                return (
                  <button
                    type="button"
                    key={f.id}
                    className={`dp-chip${on ? ' on' : ''}${st.due > 0 ? ' has-due' : ''}`}
                    onClick={() => duesPickerToggle(f.id)}
                  >
                    {on ? <CheckSquare size={14} /> : <Square size={14} />}
                    <span className="dp-flat">{f.flatNo}</span>
                    <span className="dp-name">{f.ownerName}</span>
                    {st.due > 0 && <span className="dp-due">{U.bnNumber(st.due)}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ফোনে রিপোর্ট পাশে সরিয়ে দেখতে হয় — সেটি জানিয়ে দেওয়া */}
      <div className="report-scroll-hint no-print">
        <span>↔</span>
        <span>
          {fitSheet
            ? 'পুরো পাতা এক নজরে — লেখা পড়তে আসল মাপে ফিরুন'
            : 'পুরো রিপোর্ট দেখতে আঙুল দিয়ে পাশে সরান'}
        </span>
        <button
          type="button"
          className="btn-fit"
          onClick={() => setFitSheet((v) => !v)}
        >
          {fitSheet ? 'আসল মাপ' : 'এক নজরে পুরো পাতা'}
        </button>
      </div>

      {/* ফোনে শিটটি পাশে সরিয়ে দেখার ঘর। ডেস্কটপে এটি নিছক একটি
          মোড়ক — কোনো প্রভাব ফেলে না।                              */}
      {/* আয়-ব্যয়ের সারি অনেক — Legal (৮.৫×১৪") লম্বা পাতায় A4-এর চেয়ে
          ২ ইঞ্চি বেশি উচ্চতা, তাই ব্যস্ত মাসও বড় হরফে এক পাতায় ধরে। এই
          স্টাইলটি কেবল আয়-ব্যয় ট্যাব খোলা থাকলেই থাকে — অন্য রিপোর্ট
          আগের মতোই A4-এ ছাপা হয়।                                      */}
      {reportType === 'cashbook' && <style>{'@page { size: legal; }'}</style>}
      <div
        className={fitSheet ? 'report-scroll is-fit' : 'report-scroll'}
        ref={scrollRef}
        style={fitSheet ? { '--fit-zoom': fitZoom } : undefined}
      >
      {/* Printable Sheet Container */}
      <div
        className={`card print-sheet${reportType === 'cashbook' ? ' is-legal' : ''}`}
        style={{
          background: '#ffffff',
          boxShadow: 'var(--shadow-lg)',
          borderRadius: 'var(--radius-md)',
          padding: '24px 28px',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Centered Watermark ও 3-Column Header — মাসভিত্তিক বকেয়া লিস্ট
            ছাড়া সব রিপোর্টে শিটের উপরে একবার; ওই লিস্টে প্রতি পাতায় আলাদা */}
        {reportType !== 'dues-list' && <Watermark logoSrc={LOGO_BASE64} opacity={0.12} />}
        {reportType !== 'dues-list' && headBlock}

        {/* REPORT 1: Monthly Summary */}
        {reportType === 'monthly' && (
          <>
            <table className="print-table tbl-monthly">
              <thead>
                <tr>
                  <th style={{ width: '6%' }}>ক্রমিক<br />নং</th>
                  <th style={{ width: '32%', textAlign: 'left' }}>ফ্ল্যাট মালিকের নাম<br />(ফ্ল্যাট নম্বর ক্রম অনুযায়ী)</th>
                  <th className="th-flat" style={{ width: '9%' }}>ফ্ল্যাট<br />নং</th>
                  <th className="th-paid" style={{ width: '14%', textAlign: 'right' }}>{monthShort} জমা<br />(i)</th>
                  <th className="th-due" style={{ width: '17%', textAlign: 'right' }}>মোট বকেয়া পাওনা<br />{monthShort} পর্যন্ত (ii)</th>
                  <th style={{ width: '22%' }}>{monthShort} জমার<br />স্বাক্ষর</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const paidCell = r.monthPaid > 0 ? U.bnNumber(r.monthPaid) : DASH;
                  // অগ্রীম প্রদানকারীর সারি সবুজ রঙে চিহ্নিত হয় — সবাই যেন এক নজরে দেখেন
                  const isAdvance = r.due <= 0 && r.advance > 0;
                  // বকেয়া থাকলে অঙ্কটি লাল, অগ্রীম থাকলে সবুজ — টাকা কার
                  // দিকে পাওনা তা এক পলকেই বোঝা যায়।
                  const dueCell = r.due > 0
                    ? <span className="due-amount">{U.bnNumber(r.due)}</span>
                    : (isAdvance
                        ? <span className="advance-tag">অগ্রীম {U.bnNumber(r.advance)}</span>
                        : <span className="no-due">নেই</span>);
                  const sigNames = r.collectorIds.map(getCollectorName).filter(Boolean);
                  const sigCell = sigNames.length ? sigNames.join(', ') : DASH;

                  return (
                    <tr key={r.flat.id} className={isAdvance ? 'advance-row' : undefined}>
                      <td style={{ textAlign: 'center' }}>{U.bnDigits(r.flat.serial)}</td>
                      <td style={{ textAlign: 'left' }}><b>{r.flat.ownerName}</b></td>
                      <td style={{ textAlign: 'center' }}><b className="flat-no">{r.flat.flatNo}</b></td>
                      <td className="col-paid" style={{ textAlign: 'right' }}>{paidCell}</td>
                      <td style={{ textAlign: 'right', fontWeight: r.due > 0 ? 700 : 400 }}>{dueCell}</td>
                      <td style={{ textAlign: 'center', fontSize: '9px', color: '#334155' }}>{sigCell}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="3" style={{ textAlign: 'right' }}>সর্বমোট</td>
                  <td className="col-paid" style={{ textAlign: 'right' }}>{U.bnNumber(totals.monthCollected)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {totals.totalDue > 0
                      ? <span className="due-amount">{U.bnNumber(totals.totalDue)}</span>
                      : U.bnNumber(totals.totalDue)}
                  </td>
                  <td>&nbsp;</td>
                </tr>
              </tfoot>
            </table>

            <div className="print-totals">
              <div className="box">
                {monthShort} মাসে মোট প্রদানকৃত টাকার পরিমাণ:{' '}
                <b className="amt-paid">{U.bnNumber(totals.monthCollected)}/-</b>
              </div>
              <div className="box">
                মোট বকেয়া সার্ভিস চার্জ:{' '}
                <b className="amt-due">{U.bnNumber(totals.totalDue)}/-</b>
              </div>
              <div className="box">
                মোট অগ্রীম প্রদান:{' '}
                <b className="amt-advance">{U.bnNumber(totals.totalAdvance)}/-</b>
              </div>
            </div>

            <div className="print-note">
              <span className="print-note-tag">বি.দ্র.</span>
              <span>
                “{monthShort} জমা” ঘরে {DASH} চিহ্ন যেখানে রয়েছে, সেই ফ্ল্যাটের {monthShort}{' '}
                মাসের ধার্য সার্ভিস চার্জ <b>{U.bnNumber(Calc.rateForMonth(s, selectedMonth))}/-</b>{' '}
                এখনো জমা পড়েনি।
              </span>
            </div>

            <div className="print-signs">
              {(s.signatories || []).map((sig) => (
                <div key={sig.id} className="s">
                  <div className="line"></div>
                  <div className="sd">স্বাক্ষরিত/-</div>
                  <div className="nm">{sig.name}</div>
                  <div className="dg">{sig.designation}</div>
                  <div className="dg">{s.committeeName}</div>
                </div>
              ))}
            </div>

            <div className="print-foot">
              মোট ফ্ল্যাট: {U.bnDigits(totals.flatCount)} &nbsp;|&nbsp; {monthShort} মাসে জমা দিয়েছেন {U.bnDigits(totals.paidThisMonth)} জন &nbsp;|&nbsp; নীলকণ্ঠ ফ্ল্যাট মালিক সমিতি সার্ভিস চার্জ সফটওয়্যার দ্বারা প্রস্তুত
            </div>
          </>
        )}

        {/* REPORT 4: আয়-ব্যয় হিসাবায়ন — কাগজের মতো পাশাপাশি দুটি খতিয়ান */}
        {reportType === 'cashbook' && (
          <>
            <table className={`print-table cashbook-table${cashRowCount > 36 ? ' is-dense' : ''}`}>
              <thead>
                <tr>
                  <th style={{ width: '6%' }}>ক্রমিক<br />নং</th>
                  <th className="th-income" style={{ width: '33%' }}>আদায়ের বিবরণ (+)</th>
                  <th className="th-income" style={{ width: '11%' }}>আদায়ের<br />পরিমান</th>
                  <th style={{ width: '6%' }}>ক্রমিক<br />নং</th>
                  <th className="th-expense" style={{ width: '33%' }}>খরচের বিবরণ (−)</th>
                  <th className="th-expense" style={{ width: '11%' }}>খরচের<br />পরিমান</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: Math.max(cashIn.length, cashOut.length) }).map((_, i) => (
                  <tr key={i}>
                    {cashIn[i] || CASHBOOK_BLANK}
                    {cashOut[i] || CASHBOOK_BLANK}
                  </tr>
                ))}
                {cashIn.length === 0 && cashOut.length === 0 && (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '18px' }}>
                      {monthShort} মাসের কোনো আদায় বা খরচ এখনো লেখা হয়নি।
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="2" className="tf-income" style={{ textAlign: 'center' }}>
                    মোট আদায়ের পরিমান
                  </td>
                  <td className="tf-income" style={{ textAlign: 'right' }}>
                    {U.bnNumber(cash.totalIncome)}
                  </td>
                  <td colSpan="2" className="tf-expense" style={{ textAlign: 'center' }}>
                    মোট খরচের পরিমান
                  </td>
                  <td className="tf-expense" style={{ textAlign: 'right' }}>
                    {U.bnNumber(cash.totalExpense)}
                  </td>
                </tr>
                <tr>
                  {/* ঘাটতি চোখে পড়া দরকার — তাই লাল, উদ্বৃত্ত হলে সবুজ */}
                  <td
                    colSpan="6"
                    className={cashDeficit ? 'cash-short' : undefined}
                    style={{
                      textAlign: 'center',
                      background: cashDeficit ? '#fee2e2' : '#fef9c3',
                      color: cashDeficit ? '#b91c1c' : cash.balance === 0 ? '#334155' : '#15803d'
                    }}
                  >
                    {cash.balance === 0
                      ? 'আয় ও ব্যয় সমান'
                      : cashDeficit
                        ? 'ক্যাশ ঘাটতি রয়েছে'
                        : 'ক্যাশ উদ্বৃত্ত রয়েছে'}{' '}
                    = &nbsp;
                    <b style={{ fontSize: '12px' }}>
                      {cashDeficit ? '−' : ''}
                      {U.bnNumber(Math.abs(cash.balance))}
                    </b>
                    &nbsp; টাকা
                  </td>
                </tr>

                {/* বিশেষ নোট — কাগজের মতো যোগফলের নিচে, পুরো পাতা জুড়ে।
                    টাকার অঙ্ক নয়, তাই কোনো যোগফলে ধরা হয় না।          */}
                {cash.notes.map((n, i) => (
                  <tr key={n.id} className="cashbook-note">
                    <td style={{ textAlign: 'center' }}>
                      {U.bnDigits(cash.expense.length + i + 1)}
                    </td>
                    <td colSpan="5" style={{ textAlign: 'left', fontWeight: 400 }}>
                      {n.title}
                      {(n.lines || []).map((l, li) => (
                        <div key={li} style={{ marginTop: '2px' }}>{l.text}</div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tfoot>
            </table>

            {cashRunning ? (
              <div className="cashbook-warning">
                <b>{monthShort} মাস এখনো চলছে।</b> মাসের হিসাব মাস শেষ হওয়ার পর তৈরি হয় —
                এখানে যা দেখাচ্ছে তা কেবল আজ পর্যন্ত লেখা এন্ট্রি, সম্পূর্ণ হিসাব নয়।
                এটি ছাপিয়ে সমিতিতে দেবেন না।
              </div>
            ) : cash.incomplete ? (
              <div className="cashbook-warning">
                <b>এই হিসাবটি এখনো সম্পূর্ণ নয়।</b> {monthShort} মাসের কোনো খরচ লেখা হয়নি,
                তাই উপরের যোগফলকে উদ্বৃত্ত হিসেবে ধরা যাবে না। খরচের খাতগুলো
                বসানোর পর হিসাবটি ছাপাবেন।
              </div>
            ) : null}

            <div className="print-signs" style={{ marginTop: '26px' }}>
              {(s.signatories || []).map((sig) => (
                <div key={sig.id} className="s">
                  <div className="line"></div>
                  <div className="sd">স্বাক্ষরিত/-</div>
                  <div className="nm">{sig.name}</div>
                  <div className="dg">{sig.designation}</div>
                  <div className="dg">{s.committeeName}</div>
                </div>
              ))}
            </div>

            <div className="print-foot">
              {monthShort} মাসের আদায় ও খরচের হিসাব &nbsp;|&nbsp; আদায়ের সারি{' '}
              {U.bnDigits(cash.income.length)}টি, খরচের সারি {U.bnDigits(cash.expense.length)}টি
              &nbsp;|&nbsp; নীলকণ্ঠ ফ্ল্যাট মালিক সমিতি সার্ভিস চার্জ সফটওয়্যার দ্বারা প্রস্তুত
            </div>
          </>
        )}

        {/* REPORT 2: Selective Defaulters */}
        {reportType === 'selective' && (
          <>
            <table className="print-table tbl-selective">
              <thead>
                <tr>
                  <th style={{ width: '5%' }}>ক্রম</th>
                  <th className="th-flat" style={{ width: '8%' }}>ফ্ল্যাট</th>
                  {/* নাম ২০% → ২৫%, মোবাইল ১২% → ৭%।
                      "বসবাসরত অবস্থায়" ব্যাজটি নামের পাশে বসতে ২১৪px
                      জায়গা লাগত, ছিল মাত্র ২০৭px — তাই প্রতিবার নিচের
                      লাইনে নেমে সারিটি ৪৩px থেকে ৭০px হয়ে যেত।
                      মোবাইলের ঘরে ১১ অঙ্কের নম্বরই যথেষ্ট, বাড়তি
                      জায়গাটুকু নামের কলামে দেওয়া হলো।              */}
                  <th style={{ width: '23%', textAlign: 'left' }}>মালিকের নাম</th>
                  <th style={{ width: '7%' }}>মোবাইল</th>
                  <th className="th-charge" style={{ width: '11%', textAlign: 'right' }}>ধার্যকৃত<br />চার্জ</th>
                  <th className="th-paid" style={{ width: '11%', textAlign: 'right' }}>মোট<br />জমা</th>
                  {/* মাসের লাইনটি এক লাইনে রাখতে nowrap — ভাঙলে হেডার তিন
                      লাইনে গড়িয়ে সারিটা অকারণে উঁচু হয়ে যায় */}
                  <th className="th-due" style={{ width: '15%', textAlign: 'right' }}>
                    বর্তমান বকেয়া<br />
                    <span style={{ whiteSpace: 'nowrap' }}>
                      ({U.monthLabel(duesUpToMonth).replace(' ', '-')} পর্যন্ত)
                    </span>
                  </th>
                  <th style={{ width: '11%' }}>সমতুল্য</th>
                </tr>
              </thead>
              <tbody>
                {selectiveStatuses.map((st, idx) => {
                  const eqMonths = st.monthRate > 0 ? Math.round(st.due / st.monthRate) : 0;
                  return (
                    <tr key={st.flat.id}>
                      <td style={{ textAlign: 'center' }}>{U.bnDigits(idx + 1)}</td>
                      <td style={{ textAlign: 'center' }}><b className="flat-no">{st.flat.flatNo}</b></td>
                      {/* বকেয়া বিবরণীতে "বসবাসরত অবস্থায়" ব্যাজটি দেখানো হয় না —
                          এই কাগজের বিষয় শুধু কে কত টাকা পাওনা রেখেছেন।     */}
                      <td style={{ textAlign: 'left' }}>
                        <b>{st.flat.ownerName}</b>
                      </td>
                      <td style={{ textAlign: 'center', fontSize: '9.5px', color: '#334155' }}>{st.flat.phone || '—'}</td>
                      <td className="col-charge" style={{ textAlign: 'right' }}>{U.bnNumber(st.charged)}</td>
                      <td className="col-paid" style={{ textAlign: 'right' }}>{U.bnNumber(st.paid)}</td>
                      {/* বকেয়া থাকলে অঙ্কটি লাল — কার কাছে পাওনা আছে তা এক
                          পলকেই চোখে পড়ে; শূন্য হলে স্বাভাবিক রঙেই থাকে।  */}
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>
                        {st.due > 0
                          ? <span className="due-amount">{U.bnNumber(st.due)}</span>
                          : '০'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {st.due > 0
                          ? <span className="due-months">{U.bnDigits(eqMonths)} মাস</span>
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="4" style={{ textAlign: 'right' }}>সর্বমোট</td>
                  <td style={{ textAlign: 'right' }}>{U.bnNumber(selectiveStatuses.reduce((a, b) => a + b.charged, 0))}</td>
                  <td style={{ textAlign: 'right' }}>{U.bnNumber(selectiveStatuses.reduce((a, b) => a + b.paid, 0))}</td>
                  <td style={{ textAlign: 'right' }}>{U.bnNumber(selectiveStatuses.reduce((a, b) => a + b.due, 0))}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>

            <div className="print-signs" style={{ marginTop: '30px' }}>
              {(s.signatories || []).map((sig) => (
                <div key={sig.id} className="s">
                  <div className="line"></div>
                  <div className="sd">স্বাক্ষরিত/-</div>
                  <div className="nm">{sig.name}</div>
                  <div className="dg">{sig.designation}</div>
                  <div className="dg">{s.committeeName}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* REPORT 2খ: মাসভিত্তিক বকেয়া লিস্ট — মাস সারিতে, নির্বাচিত ফ্ল্যাট
            মালিকেরা কলামে। প্রতিটি ঘরে সেই মাসে সেই ফ্ল্যাটের জমা; জমা না
            পড়লে লাল '-' ও লালচে ঘর, আংশিক হলে হলুদ, চার্জ প্রযোজ্য না হলে
            ধূসর। নিচে ফ্ল্যাটওয়ারি মোট ধার্য, মোট জমা, বকেয়া ও অপরিশোধিত
            মাস। ১০টির বেশি ফ্ল্যাট হলে ১০টি করে আলাদা ছক, আলাদা পাতায়। */}
        {reportType === 'dues-list' && (
          <>
            {/* ছাপার জলছাপ — position: fixed, তাই ব্রাউজার প্রতিটি কাগজের
                ঠিক মাঝে এটি আবার আঁকে। পর্দায় লুকানো; পর্দায় প্রতিটি
                পাতার নিজের জলছাপ (নিচে, .dues-page-এর ভেতরে) দেখা যায়। */}
            <div className="watermark-container dues-print-wm" aria-hidden="true">
              <img className="watermark-img" src={LOGO_BASE64} alt="" />
            </div>
            {duesPages.map((page, pi) => {
              const cols = page.cols || [];
              const ci = page.index || 0;
              const sum = (fn) => cols.reduce((t, c) => t + fn(c), 0);
              return (
                <div className="dues-page" key={pi}>
                  <Watermark logoSrc={LOGO_BASE64} opacity={0.12} />
                  {headBlock}

                  {pi === 0 && (
                    <div className="dues-list-intro">
                      নির্বাচিত ফ্ল্যাট: <b>{U.bnDigits(duesList.length)} টি</b>
                      {duesMonths.length > 0 && (
                        <>
                          {' '}&nbsp;|&nbsp; {U.monthLabelShort(duesMonths[0])} হতে {U.monthLabelShort(duesUpToMonth)}{' '}
                          (মোট {U.bnDigits(duesMonths.length)} মাস) — ঘরে সেই মাসের জমার টাকা
                        </>
                      )}
                      &nbsp;|&nbsp; <span className="key unpaid">লাল '-'</span> = জমা পড়েনি,{' '}
                      <span className="key partial">হলুদ</span> = আংশিক জমা,{' '}
                      <span className="key na">ধূসর</span> = সে মাসে চার্জ প্রযোজ্য নয়
                    </div>
                  )}

                  {page.kind === 'empty' && (
                    <div className="print-note">
                      <span className="print-note-tag">বি.দ্র.</span>
                      <span>কোনো ফ্ল্যাট নির্বাচিত নেই। উপরের "ফ্ল্যাট বাছুন" থেকে ফ্ল্যাট বেছে নিন।</span>
                    </div>
                  )}

                  {page.kind === 'chunk' && (
                <div className="dues-chunk">
                  {duesChunks.length > 1 && (
                    <div className="dues-chunk-caption">
                      ছক {U.bnDigits(ci + 1)}/{U.bnDigits(duesChunks.length)}: ফ্ল্যাট{' '}
                      <b className="flat-no">{cols[0].flat.flatNo}</b> হতে{' '}
                      <b className="flat-no">{cols[cols.length - 1].flat.flatNo}</b>
                    </div>
                  )}
                  <table className={`print-table tbl-dues-matrix${duesMonths.length > 30 ? ' is-dense' : ''}`}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', width: '14%' }}>মাস</th>
                        {cols.map((c) => (
                          <th key={c.flat.id} className="th-flat">
                            <span className="flat-no">{c.flat.flatNo}</span>
                            <div className="nm">{c.flat.ownerName}</div>
                          </th>
                        ))}
                        <th className="th-paid" style={{ width: '10%' }}>মোট<br />জমা</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="meta-row">
                        <td style={{ textAlign: 'left' }}>সার্ভিস চার্জ গণনা শুরু</td>
                        {cols.map((c) => (
                          <td key={c.flat.id} style={{ textAlign: 'center' }}>
                            {U.monthLabelShort(c.startMonth)}
                          </td>
                        ))}
                        <td></td>
                      </tr>
                      {duesHasOpening && (
                        <tr className="meta-row">
                          <td style={{ textAlign: 'left' }}>প্রারম্ভিক বকেয়া</td>
                          {cols.map((c) => (
                            <td
                              key={c.flat.id}
                              className={c.status.opening > 0 ? 'unpaid' : undefined}
                              style={{ textAlign: 'center' }}
                            >
                              {c.status.opening > 0
                                ? <span className="due-amount">{U.bnNumber(c.status.opening)}</span>
                                : ''}
                            </td>
                          ))}
                          <td></td>
                        </tr>
                      )}
                      {duesMonths.map((m, mi) => {
                        const rowTotal = sum((c) => c.cells[mi].paid);
                        return (
                          <tr key={m}>
                            <td style={{ textAlign: 'left' }}><b>{U.monthLabel(m)}</b></td>
                            {cols.map((c) => {
                              const cell = c.cells[mi];
                              const blank = !cell.chargeable && !cell.paid;
                              const cls = blank
                                ? 'na'
                                : cell.paid <= 0
                                  ? 'unpaid'
                                  : cell.paid < cell.charge
                                    ? 'partial'
                                    : 'col-paid';
                              return (
                                <td
                                  key={c.flat.id}
                                  className={cls}
                                  style={{ textAlign: 'center' }}
                                  title={cell.charge ? `ধার্য ${U.bnNumber(cell.charge)}` : undefined}
                                >
                                  {blank ? '' : cell.paid > 0 ? U.bnNumber(cell.paid) : DASH}
                                </td>
                              );
                            })}
                            <td className="col-paid" style={{ textAlign: 'right' }}>
                              {rowTotal ? U.bnNumber(rowTotal) : DASH}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td className="col-charge" style={{ textAlign: 'left' }}>মোট ধার্য</td>
                        {cols.map((c) => (
                          <td key={c.flat.id} className="col-charge" style={{ textAlign: 'center' }}>
                            {U.bnNumber(c.status.opening + c.status.charged)}
                          </td>
                        ))}
                        <td className="col-charge" style={{ textAlign: 'right' }}>
                          {U.bnNumber(sum((c) => c.status.opening + c.status.charged))}
                        </td>
                      </tr>
                      <tr>
                        <td className="col-paid" style={{ textAlign: 'left' }}>মোট জমা</td>
                        {cols.map((c) => (
                          <td key={c.flat.id} className="col-paid" style={{ textAlign: 'center' }}>
                            {U.bnNumber(c.status.paid)}
                          </td>
                        ))}
                        <td className="col-paid" style={{ textAlign: 'right' }}>
                          {U.bnNumber(sum((c) => c.status.paid))}
                        </td>
                      </tr>
                      <tr className="due-row">
                        <td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>
                          <span className="due-amount">বকেয়া<br />({monthShort} পর্যন্ত)</span>
                        </td>
                        {cols.map((c) => (
                          <td key={c.flat.id} style={{ textAlign: 'center' }}>
                            {c.status.due > 0
                              ? <span className="due-amount">{U.bnNumber(c.status.due)}</span>
                              : c.status.advance > 0
                                ? <span className="advance-tag">অগ্রীম {U.bnNumber(c.status.advance)}</span>
                                : '০'}
                          </td>
                        ))}
                        <td style={{ textAlign: 'right' }}>
                          <span className="due-amount">{U.bnNumber(sum((c) => c.status.due))}</span>
                        </td>
                      </tr>
                      <tr className="range-row">
                        <td style={{ textAlign: 'left' }}>বকেয়া যে মাস হতে<br />যে মাস পর্যন্ত</td>
                        {cols.map((c) => (
                          <td key={c.flat.id} style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            {duesRangeLabel(c, true)}
                          </td>
                        ))}
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                  )}

            {page.kind === 'summary' && (
              <div className="dues-summary">
                <div className="dues-summary-title">নির্বাচিত ফ্ল্যাটসমূহের সারসংক্ষেপ</div>
                <table className="print-table tbl-dues-summary">
                  <thead>
                    <tr>
                      <th style={{ width: '5%' }}>ক্রম</th>
                      <th className="th-flat" style={{ width: '8%' }}>ফ্ল্যাট</th>
                      <th style={{ width: '18%', textAlign: 'left' }}>মালিকের নাম</th>
                      <th style={{ width: '13%' }}>সার্ভিস চার্জ<br />গণনা শুরু</th>
                      <th className="th-due" style={{ width: '22%' }}>বকেয়া যে মাস হতে<br />যে মাস পর্যন্ত</th>
                      <th className="th-charge" style={{ width: '11%', textAlign: 'right' }}>মোট ধার্য</th>
                      <th className="th-paid" style={{ width: '11%', textAlign: 'right' }}>মোট জমা</th>
                      <th className="th-due" style={{ width: '12%', textAlign: 'right' }}>বকেয়া</th>
                    </tr>
                  </thead>
                  <tbody>
                    {duesList.map((d, idx) => (
                      <tr key={d.flat.id}>
                        <td style={{ textAlign: 'center' }}>{U.bnDigits(idx + 1)}</td>
                        <td style={{ textAlign: 'center' }}><b className="flat-no">{d.flat.flatNo}</b></td>
                        <td style={{ textAlign: 'left' }}><b>{d.flat.ownerName}</b></td>
                        <td style={{ textAlign: 'center' }}>{U.monthLabelShort(d.startMonth)}</td>
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {d.firstUnpaid
                            ? <span className="due-amount">{duesRangeLabel(d)}</span>
                            : '—'}
                        </td>
                        <td className="col-charge" style={{ textAlign: 'right' }}>
                          {U.bnNumber(d.status.opening + d.status.charged)}
                        </td>
                        <td className="col-paid" style={{ textAlign: 'right' }}>{U.bnNumber(d.status.paid)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>
                          {d.status.due > 0
                            ? <span className="due-amount">{U.bnNumber(d.status.due)}</span>
                            : '০'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'right' }}>সর্বমোট</td>
                      <td className="col-charge" style={{ textAlign: 'right' }}>{U.bnNumber(duesTotals.charged)}</td>
                      <td className="col-paid" style={{ textAlign: 'right' }}>{U.bnNumber(duesTotals.paid)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <span className="due-amount">{U.bnNumber(duesTotals.due)}</span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

                  {/* পাতার নিচে: স্বাক্ষর, ফুটার ও QR — প্রতি পাতায় */}
                  <div className="dues-page-bottom">
                    {/* সভার সিদ্ধান্ত — কেবল এই বকেয়া লিস্টেই, প্রতিটি পাতার
                        নিচে, স্বাক্ষরের আগে */}
                    <div className="print-note print-note-sm dues-note">
                      <span className="print-note-tag">বিশেষ দ্রষ্টব্য:</span>
                      <span>
                        গত ০৯ই অক্টোবর, ২০২৬ তারিখে জরুরী বিশেষ সভায় যৌথ মালিকানায় (০৭ জন) নির্মাণাধীন
                        ফ্ল্যাট (A-9 ও C-9) এর জন্য প্রযোজ্য বকেয়া সার্ভিস চার্জ জুন-২০২৫ থেকে কার্যকর করা
                        হবে বলে সিদ্ধান্ত গৃহীত হয়।
                      </span>
                    </div>
                    {signsBlock}
                    <div className="print-foot">
                      নির্বাচিত ফ্ল্যাট: {U.bnDigits(duesList.length)} টি &nbsp;|&nbsp; সর্বমোট বকেয়া:{' '}
                      {U.bnTaka(duesTotals.due)} ({U.monthLabel(duesUpToMonth)} পর্যন্ত) &nbsp;|&nbsp;
                      পাতা {U.bnDigits(pi + 1)}/{U.bnDigits(duesPages.length)} &nbsp;|&nbsp;
                      নীলকণ্ঠ ফ্ল্যাট মালিক সমিতি সার্ভিস চার্জ সফটওয়্যার দ্বারা প্রস্তুত
                    </div>
                    {footerLinkBlock}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* REPORT 3: Ledger Statement */}
        {reportType === 'ledger' && ledgerFlat && ledgerStatus && (
          <>
            <div style={{ marginBottom: '8px', fontSize: '11px', color: '#1e293b' }}>
              ফ্ল্যাট নং: <b className="flat-no">{ledgerFlat.flatNo}</b> &nbsp;|&nbsp; 
              মালিকের নাম: <b className="owner-name">{ledgerFlat.ownerName}</b> &nbsp;|&nbsp; 
              মোবাইল: <b>{ledgerFlat.phone || '—'}</b>
            </div>

            <table className="print-table tbl-ledger">
              <thead>
                <tr>
                  <th style={{ width: '32%', textAlign: 'left' }}>মাস / বিবরণ</th>
                  <th className="th-charge" style={{ width: '16%', textAlign: 'right' }}>ধার্য চার্জ</th>
                  <th className="th-paid" style={{ width: '16%', textAlign: 'right' }}>জমা</th>
                  <th style={{ width: '18%', textAlign: 'center' }}>আদায়কারী</th>
                  <th className="th-due" style={{ width: '18%', textAlign: 'right' }}>বকেয়া টাকা</th>
                </tr>
              </thead>
              <tbody>
                {ledgerRows.map((lr, idx) => (
                  <tr key={idx}>
                    <td style={{ textAlign: 'left' }}>
                      <b>{lr.label}</b>
                      {Calc.isResidentMonth(ledgerFlat, lr.month) && (
                        <ResidentBadge flat={ledgerFlat} />
                      )}
                    </td>
                    <td className="col-charge" style={{ textAlign: 'right' }}>
                      {lr.charge ? U.bnNumber(lr.charge) : DASH}
                    </td>
                    <td className="col-paid" style={{ textAlign: 'right' }}>
                      {lr.paid ? U.bnNumber(lr.paid) : DASH}
                    </td>
                    <td style={{ textAlign: 'center', fontSize: '9px', color: '#334155' }}>
                      {lr.collectorIds.map(getCollectorName).filter(Boolean).join(', ') || DASH}
                    </td>
                    {/* বকেয়া থাকলেই কেবল লাল — শূন্য হলে স্বাভাবিক, নইলে রঙের
                        অর্থ হারায়                                          */}
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>
                      {lr.balance > 0
                        ? <span className="due-amount">{U.bnNumber(lr.balance)}</span>
                        : U.bnNumber(lr.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ textAlign: 'right' }}>সর্বমোট</td>
                  <td className="col-charge" style={{ textAlign: 'right' }}>
                    {U.bnNumber(ledgerStatus.opening + ledgerStatus.charged)}
                  </td>
                  <td className="col-paid" style={{ textAlign: 'right' }}>{U.bnNumber(ledgerStatus.paid)}</td>
                  <td></td>
                  <td style={{ textAlign: 'right' }}>
                    {ledgerStatus.balance > 0
                      ? <span className="due-amount">{U.bnNumber(ledgerStatus.balance)}</span>
                      : U.bnNumber(ledgerStatus.balance)}
                  </td>
                </tr>
              </tfoot>
            </table>

            <div className="print-totals" style={{ marginTop: '12px' }}>
              <div className="box">
                মোট পরিশোধিত ({ledgerMonthShort} পর্যন্ত):{' '}
                <b className="amt-paid">{U.bnNumber(ledgerStatus.paid)}/-</b>
              </div>
              <div className="box" style={{ border: '2px solid #000' }}>
                বকেয়া পাওনা ({ledgerMonthShort} পর্যন্ত):{' '}
                <b className="amt-due">{U.bnNumber(ledgerStatus.due)}/-</b>
              </div>
            </div>

            <div className="print-signs" style={{ marginTop: '30px' }}>
              {(s.signatories || []).map((sig) => (
                <div key={sig.id} className="s">
                  <div className="line"></div>
                  <div className="sd">স্বাক্ষরিত/-</div>
                  <div className="nm">{sig.name}</div>
                  <div className="dg">{sig.designation}</div>
                  {/* কমিটির নাম — অন্য দুই রিপোর্টে ছিল, লেজারে বাদ পড়েছিল */}
                  <div className="dg">{s.committeeName}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* REPORT 5: দোকান ভাড়া — মাসভিত্তিক, দোকানওয়ারি */}
        {reportType === 'shop-rent' && (
          <>
            <div className="shop-report-caption">
              দোকানওয়ারি ভাড়া জমার ছক — {U.monthLabelShort(shopMatrixFrom)} হতে {monthShort} (ভাড়ার মাস অনুযায়ী)
            </div>
            <table className={`print-table tbl-shop-matrix${shopMatrix.months.length > 30 ? ' is-dense' : ''}`}>
              <thead>
                <tr>
                  <th rowSpan={2} style={{ textAlign: 'left', width: '18%' }}>ভাড়ার মাস</th>
                  {shopMatrix.rows.map((r) => (
                    <th key={r.shop.id} colSpan={2} className="th-paid grp">
                      {U.bnDigits(r.shop.shopNo)}নং দোকান
                      {r.shop.tenantName && (
                        <div style={{ fontSize: '8.5px', fontWeight: 400, color: '#475569' }}>{r.shop.tenantName}</div>
                      )}
                    </th>
                  ))}
                  <th rowSpan={2} className="th-paid grp" style={{ width: '11%' }}>মোট জমা</th>
                </tr>
                <tr>
                  {shopMatrix.rows.map((r) => (
                    <React.Fragment key={r.shop.id}>
                      <th className="th-paid sub grp">ভাড়া</th>
                      <th className="sub">বিদ্যুৎ<br />বিল</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* পুরোনো কাগজের একত্রিত আদায় — দোকানওয়ারি ভাঙা নেই, তাই পুরো সারি জুড়ে */}
                {shopLegacy.map((l) => (
                  <tr key={l.id} className="legacy-row">
                    <td style={{ textAlign: 'left', fontWeight: 600 }}>
                      {U.monthLabelShort(l.fromMonth)} হতে {U.monthLabelShort(l.toMonth)}
                    </td>
                    <td colSpan={Math.max(1, shopMatrix.rows.length * 2)} className="grp" style={{ textAlign: 'left', fontSize: '9.5px' }}>
                      {l.label}
                    </td>
                    <td className="col-paid grp" style={{ textAlign: 'right' }}>{U.bnNumber(l.amount)}</td>
                  </tr>
                ))}
                {shopMatrix.months.map((m, mi) => {
                  const ct = shopMatrix.colTotals[mi];
                  const rowTotal = ct.rent + ct.other + ct.electricity;
                  return (
                    <tr key={m}>
                      <td style={{ textAlign: 'left' }}><b>{U.monthLabel(m)}</b></td>
                      {shopMatrix.rows.map((r) => {
                        const c = r.cells[mi];
                        const paid = c.rent + c.other;
                        const tip = c.paidMonths.length ? `জমার মাস: ${c.paidMonths.map(U.monthLabelShort).join(', ')}` : undefined;
                        return (
                          <React.Fragment key={r.shop.id}>
                            <td
                              className={`grp ${!c.chargeable ? 'na' : paid > 0 ? 'col-paid' : 'unpaid'}`}
                              style={{ textAlign: 'center' }}
                              title={tip}
                            >
                              {!c.chargeable ? '' : paid > 0 ? U.bnNumber(paid) : DASH}
                            </td>
                            <td className={!c.chargeable ? 'na' : undefined} style={{ textAlign: 'center' }} title={tip}>
                              {c.electricity > 0 ? U.bnNumber(c.electricity) : ''}
                            </td>
                          </React.Fragment>
                        );
                      })}
                      <td className="col-paid grp" style={{ textAlign: 'right' }}>{rowTotal ? U.bnNumber(rowTotal) : DASH}</td>
                    </tr>
                  );
                })}
                {!shopMatrix.rows.length && (
                  <tr>
                    <td colSpan={2} style={{ textAlign: 'center', padding: '14px' }}>দোকানের তালিকা খালি।</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ textAlign: 'right' }}>দোকানওয়ারি মোট জমা</td>
                  {shopMatrix.rows.map((r) => (
                    <React.Fragment key={r.shop.id}>
                      <td className="col-paid grp" style={{ textAlign: 'center' }}>
                        {U.bnNumber(r.totals.rent + r.totals.other)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {r.totals.electricity ? U.bnNumber(r.totals.electricity) : ''}
                      </td>
                    </React.Fragment>
                  ))}
                  <td className="col-paid grp" style={{ textAlign: 'right' }}>{U.bnNumber(shopGridTotal)}</td>
                </tr>
                {shopLegacy.length > 0 && (
                  <tr>
                    <td colSpan={shopMatrix.rows.length * 2 + 1} style={{ textAlign: 'right' }}>
                      সর্বমোট দোকান ভাড়া আদায়
                    </td>
                    <td className="col-paid grp" style={{ textAlign: 'right' }}>{U.bnNumber(shopGridTotal + shopLegacyTotal)}</td>
                  </tr>
                )}
              </tfoot>
            </table>

            <div className="print-totals">
              {shopLegacy.length > 0 && (
                <div className="box">
                  {shopLegacyLabel} ({U.monthLabelShort(shopLegacyFrom)} হতে {U.monthLabelShort(shopLegacyTo)}) পর্যন্ত
                  দোকান ভাড়া ও বিবিধ হতে আয়:{' '}
                  <b className="amt-paid">{U.bnNumber(shopLegacyTotal)}/-</b>
                </div>
              )}
              <div className="box">
                দোকানওয়ারি জমা ({U.monthLabelShort(shopMatrixFrom)} হতে {monthShort}), ভাড়া ও বিদ্যুৎ বিলসহ:{' '}
                <b className="amt-paid">{U.bnNumber(shopGridTotal)}/-</b>
                <div style={{ fontSize: '10px', fontWeight: 400, marginTop: '2px' }}>
                  এর মধ্যে বিদ্যুৎ বিল {U.bnNumber(shopGridElec)}/-
                </div>
              </div>
              <div className="box" style={{ border: '2px solid #000' }}>
                সর্বমোট আদায় ({U.monthLabelShort(shopLegacy.length ? shopLegacyFrom : shopMatrixFrom)} হতে {monthShort} পর্যন্ত):{' '}
                <b className="amt-paid">{U.bnNumber(shopGridTotal + shopLegacyTotal)}/-</b>
              </div>
            </div>

            <div className="print-note print-note-sm">
              <span className="print-note-tag">বি.দ্র.</span>
              <span>
                ছকটি ভাড়ার মাস অনুযায়ী — ঘরে অঙ্ক থাকলে ঐ মাসের ভাড়া জমা পড়েছে, {DASH} থাকলে
                বকেয়া, ফাঁকা ঘর মানে ঐ মাসে দোকানটি ভাড়ায় ছিল না। প্রতিটি দোকানের পাশের কলামে ঐ মাসের
                বিদ্যুৎ বিল; মোট জমায় ভাড়া ও বিদ্যুৎ বিল দুটোই আছে, বকেয়ার হিসাবে শুধু ভাড়া।
                {shopLegacy.length > 0 && (
                  <> উপরের ধূসর সারিগুলো পুরোনো কাগজের একত্রিত হিসাব — দোকানওয়ারি ভাঙা নেই, বকেয়ার হিসাবেও ধরা হয়নি।</>
                )}
              </span>
            </div>

            <div className="print-signs">
              {(s.signatories || []).map((sig) => (
                <div key={sig.id} className="s">
                  <div className="line"></div>
                  <div className="sd">স্বাক্ষরিত/-</div>
                  <div className="nm">{sig.name}</div>
                  <div className="dg">{sig.designation}</div>
                  <div className="dg">{s.committeeName}</div>
                </div>
              ))}
            </div>

            <div className="print-foot">
              মোট দোকান: {U.bnDigits(shopMatrix.rows.length)} &nbsp;|&nbsp; {U.monthLabelShort(shopReportFrom)} হতে {monthShort} এর{' '}
              (মোট {U.bnDigits(shopReportMonths)} মাস) &nbsp;|&nbsp; নীলকণ্ঠ ফ্ল্যাট মালিক সমিতি সার্ভিস চার্জ সফটওয়্যার দ্বারা প্রস্তুত
            </div>
          </>
        )}

        {/* সব রিপোর্টের নিচে: ছাপা কাগজ থেকে সরাসরি অনলাইন রিপোর্টে যাওয়ার পথ।
            মাসভিত্তিক বকেয়া লিস্টে এটি প্রতি পাতায় আলাদা করে বসে। */}
        {reportType !== 'dues-list' && footerLinkBlock}
      </div>
      </div>
    </div>
  );
}
