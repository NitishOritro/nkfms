import React, { useState, useEffect, useRef } from 'react';
import { useData } from '../context/DataContext';
import * as Calc from '../utils/calc';
import * as U from '../utils/format';
import { Printer, FileText, ChevronLeft, ChevronDown, Layers, Building2 } from 'lucide-react';
import { Watermark } from '../components/Watermark';
import { ResidentBadge } from '../components/ResidentBadge';
import { MonthSelector } from '../components/MonthSelector';
import { LOGO_BASE64 } from '../assets/logoData';
import QRCode from 'qrcode';

// ছাপা কাগজ থেকে অনলাইন রিপোর্টে যাওয়ার ঠিকানা — ফুটারের লেখা ও QR, দুটোরই উৎস
const REPORT_LINK = 'https://nkfms-8c1a6.web.app/#/reports';

// QR-এ রিপোর্টের পরিচয়ও থাকে: #/reports?rt=<ধরন>&rm=<মাস>&rf=<ফ্ল্যাট>।
// স্ক্যান করলে ভিউ মোডে ঢুকে (AuthContext) ঠিক সেই রিপোর্টটিই খুলে যায়।
const REPORT_TYPES = ['monthly', 'selective', 'cashbook', 'ledger'];
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
    }
    return REPORT_LINK + '?' + q.toString();
  })();
  const [qrDataUrl, setQrDataUrl] = useState('');
  useEffect(() => {
    QRCode.toDataURL(qrLink, { errorCorrectionLevel: 'M', margin: 1, scale: 8 })
      .then(setQrDataUrl)
      .catch(() => {});
  }, [qrLink]);

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
        {/* Centered Watermark */}
        <Watermark logoSrc={LOGO_BASE64} opacity={0.12} />

        {/* 3-Column Header */}
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
              {reportType === 'cashbook' && `সার্ভিস হিসাবায়ন সারসংক্ষেপ (${monthShort})`}
              {reportType === 'ledger' && `ফ্ল্যাটভিত্তিক সার্ভিস চার্জ লেজার ও বকেয়া বিবরণী (${ledgerMonthLabel} পর্যন্ত)`}
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

        {/* সব রিপোর্টের নিচে: ছাপা কাগজ থেকে সরাসরি অনলাইন রিপোর্টে যাওয়ার পথ */}
        <div className="print-footer-link">
          {qrDataUrl && <img className="qr" src={qrDataUrl} alt="QR কোড" title={qrLink} />}
          <div className="txt">
            <div className="t1">এই রিপোর্টটি সরাসরি অনলাইনে দেখতে QR কোডটি স্ক্যান করুন, অথবা ব্রাউজারে লিখুন:</div>
            <div className="t2">{REPORT_LINK}</div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
