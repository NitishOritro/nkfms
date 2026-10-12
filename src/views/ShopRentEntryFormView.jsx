import React, { useState, useMemo, useEffect } from 'react';
import { useData } from '../context/DataContext';
import * as Calc from '../utils/calc';
import * as U from '../utils/format';
import { Store, Lock, Save, AlertTriangle, Eye, Info, Zap } from 'lucide-react';

// ============================================================================
//  দোকান ভাড়া এন্ট্রি ফর্ম
//  --------------------------------------------------------------------------
//  "সার্ভিস চার্জ এন্ট্রি ফর্ম"-এর আদলে, দোকান ভাড়ার দৈনন্দিন এন্ট্রির ফর্ম।
//  (দোকানওয়ারি পূর্ণ ছক, দোকান যোগ/সম্পাদনা — "দোকান ভাড়া এন্ট্রি" পাতায়)
//
//  দুই রকম মাস, দুটোই এখানে আলাদা ঘরে:
//      জমার মাস  (paidMonth) — কোন মাসের খতিয়ানে টাকাটা উঠল; মাসিক হিসাব
//                               সারসংক্ষেপ ও খতিয়ানে এই মাসেই দেখাবে
//      ভাড়ার মাস (rentMonth) — কোন কোন মাসের ভাড়া; "হতে – পর্যন্ত" দিলে
//                               প্রতি মাসে আলাদা সারি হয়, বকেয়ার হিসাব এতে
//
//  ঘরগুলো দুই কলামের গ্রিডে:
//      দোকান             |  বর্তমান বকেয়া      (দোকান থেকে নিজে বসে)
//      জমার মাস          |  ভাড়ার মাস (হতে – পর্যন্ত)
//      দোকান ভাড়ার টাকা  |  আদায়কারী
//      বিদ্যুৎ (কারেন্ট) বিল |  মন্তব্য
//
//  এক অঙ্কে একাধিক মাসের ভাড়া দিলে মাসওয়ারি ভাগ হয় — প্রতিটি মাসে তার
//  ধার্য হার, শেষ মাসে যা বাকি থাকে। আগে এন্ট্রি থাকা মাসে চুপচাপ লেখা
//  হয় না — যোগ না বদল, সুস্পষ্টভাবে বেছে নিতে হয়।
// ============================================================================

const rangeMonths = (from, to) => {
  if (!from || !to) return [];
  const a = U.monthIndex(from);
  const b = U.monthIndex(to);
  if (b < a) return [];
  const list = [];
  for (let i = a; i <= b; i += 1) list.push(U.indexToMonth(i));
  return list;
};

export function ShopRentEntryFormView() {
  const { data, selectedMonth, saveShopRents, canWrite, addToast } = useData();

  const [shopId, setShopId] = useState('');
  const [paidMonth, setPaidMonth] = useState(selectedMonth);
  const [fromMonth, setFromMonth] = useState('');
  const [toMonth, setToMonth] = useState('');
  const [rentAmount, setRentAmount] = useState('');
  const [elecAmount, setElecAmount] = useState('');
  // বিদ্যুৎ বিল কোন কোন মাসের — হাতে না বদলালে ভাড়ার মাসের পরিসরই
  const [elecFrom, setElecFrom] = useState('');
  const [elecTo, setElecTo] = useState('');
  const [elecMonthTouched, setElecMonthTouched] = useState(false);
  const [collectorId, setCollectorId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  // আগের এন্ট্রি থাকলে: 'add' = আগের অঙ্কের সাথে যোগ, 'replace' = বদল
  const [overwriteMode, setOverwriteMode] = useState('');

  const shops = useMemo(() => Calc.shopsSorted(data), [data]);
  const collectors = data.settings.collectors || [];
  const shop = shops.find((s) => s.id === shopId) || null;

  // জমার মাস — সার্ভিস চার্জ ফর্মের মতোই, শুরুর মাস থেকে চলতি মাস পর্যন্ত
  const paidMonths = useMemo(() => Calc.monthOptions(data), [data]);

  // ভাড়ার মাসের তালিকা — দোকানের শুরুর মাস থেকে, অগ্রীম দেওয়ার সুযোগ রেখে
  // চলতি মাসের পরের ১২ মাস পর্যন্ত
  const rentMonths = useMemo(() => {
    const start = shop ? Calc.shopStartMonth(shop, data.settings) : data.settings.startMonth || '2024-08';
    const end = U.addMonths(Calc.lastSelectableMonth(data), 12);
    return rangeMonths(start, end);
  }, [data, shop]);

  // দোকানের মাসওয়ারি খাতা — কোন মাসের ভাড়া বাকি, তা থেকে ডিফল্ট মাস বসে
  const ledgerRows = useMemo(() => {
    if (!shop) return [];
    return Calc.shopLedger(data, shop, Calc.lastSelectableMonth(data));
  }, [data, shop]);
  const unpaidMonths = useMemo(
    () => ledgerRows.filter((r) => r.charge > 0 && r.paid < r.charge).map((r) => r.month),
    [ledgerRows]
  );

  // দোকান বদলালে ভাড়ার মাস নিজে বসে: প্রথম বকেয়া মাস, না থাকলে জমার মাস
  useEffect(() => {
    if (!shop) { setFromMonth(''); setToMonth(''); return; }
    const first = unpaidMonths[0] || paidMonth;
    setFromMonth(first);
    setToMonth(first);
    setOverwriteMode('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  // "পর্যন্ত" কখনো "হতে"-এর আগে নয়
  useEffect(() => {
    if (fromMonth && toMonth && U.monthIndex(toMonth) < U.monthIndex(fromMonth)) setToMonth(fromMonth);
  }, [fromMonth, toMonth]);

  // বিদ্যুৎ বিলের মাস — হাতে না বদলালে ভাড়ার "হতে – পর্যন্ত" পরিসরই,
  // ভাড়ার মাস না থাকলে জমার মাস
  useEffect(() => {
    if (elecMonthTouched) return;
    setElecFrom(fromMonth || paidMonth);
    setElecTo(toMonth || fromMonth || paidMonth);
  }, [fromMonth, toMonth, paidMonth, elecMonthTouched]);
  useEffect(() => {
    if (elecFrom && elecTo && U.monthIndex(elecTo) < U.monthIndex(elecFrom)) setElecTo(elecFrom);
  }, [elecFrom, elecTo]);

  const selectedRentMonths = useMemo(() => rangeMonths(fromMonth, toMonth), [fromMonth, toMonth]);
  const elecMonths = useMemo(() => rangeMonths(elecFrom, elecTo), [elecFrom, elecTo]);
  const chargedTotal = useMemo(
    () => (shop ? selectedRentMonths.reduce((s, m) => s + Calc.shopRentForMonth(shop, m), 0) : 0),
    [shop, selectedRentMonths]
  );

  // বর্তমান বকেয়া — জমার মাস পর্যন্ত, এ মাসের ধার্য ও জমাসহ
  const status = useMemo(() => {
    if (!shop || !paidMonth) return null;
    return Calc.shopStatus(data, shop, paidMonth);
  }, [data, shop, paidMonth]);

  const rentNum = Number(rentAmount) || 0;
  const elecNum = Number(elecAmount) || 0;

  // একটি অঙ্ক মাসওয়ারি ভাগ: প্রতি মাসে তার ধার্য হার, শেষ মাসে যা বাকি
  const allocation = useMemo(() => {
    if (!shop || rentNum <= 0 || !selectedRentMonths.length) return [];
    let remaining = rentNum;
    const last = selectedRentMonths.length - 1;
    return selectedRentMonths.map((m, i) => {
      const rate = Calc.shopRentForMonth(shop, m);
      const take = i === last ? remaining : Math.min(rate, remaining);
      remaining -= take;
      return { month: m, rate, amount: take };
    }).filter((a) => a.amount > 0);
  }, [shop, rentNum, selectedRentMonths]);

  // নির্বাচিত মাসগুলোতে আগে থেকে এন্ট্রি আছে কিনা
  const shopRents = useMemo(() => (shop ? Calc.shopRentsOf(data, shop.id) : []), [data, shop]);
  const existingRent = useMemo(
    () => shopRents.filter((r) => r.kind === 'rent' && allocation.some((a) => a.month === r.rentMonth)),
    [shopRents, allocation]
  );
  // বিদ্যুৎ বিল মাসওয়ারি ভাগ: দোকানে নির্ধারিত অংশ থাকলে প্রতি মাসে সেটি,
  // নইলে সমান ভাগ; দুই ক্ষেত্রেই শেষ মাসে যা বাকি
  const elecAllocation = useMemo(() => {
    if (elecNum <= 0 || !elecMonths.length) return [];
    const share = shop && Number(shop.electricityShare) > 0
      ? Number(shop.electricityShare)
      : Math.floor(elecNum / elecMonths.length);
    let remaining = elecNum;
    const last = elecMonths.length - 1;
    return elecMonths.map((m, i) => {
      const take = i === last ? remaining : Math.min(share, remaining);
      remaining -= take;
      return { month: m, amount: take };
    }).filter((a) => a.amount > 0);
  }, [shop, elecNum, elecMonths]);
  const existingElec = useMemo(
    () => shopRents.filter((r) => r.kind === 'electricity' && elecAllocation.some((a) => a.month === r.rentMonth)),
    [shopRents, elecAllocation]
  );
  const hasExisting = existingRent.length > 0 || existingElec.length > 0;

  const collectorName = (id) => {
    const c = collectors.find((x) => x.id === id);
    return c ? c.bn || c.en : '';
  };

  const dueText = () => {
    if (!status) return '';
    if (status.advance > 0) return `${U.bnTaka(status.advance)} (অগ্রীম জমা)`;
    return U.bnTaka(status.due);
  };

  const resetForm = (keepMonth = false) => {
    setShopId('');
    setFromMonth('');
    setToMonth('');
    setRentAmount('');
    setElecAmount('');
    setElecMonthTouched(false);
    setCollectorId('');
    setNote('');
    setError('');
    setOverwriteMode('');
    if (!keepMonth) setPaidMonth(selectedMonth);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!canWrite) {
      setError('সংরক্ষণ করতে অ্যাডমিন হিসেবে লগইন করুন। ভিউ মোডে কেবল দেখা যায়।');
      return;
    }
    if (!shop) { setError('কোন দোকানের ভাড়া, নির্বাচন করুন।'); return; }
    if (!paidMonth) { setError('জমার মাস নির্বাচন করুন।'); return; }
    if (rentNum <= 0 && elecNum <= 0) {
      setError('দোকান ভাড়া বা বিদ্যুৎ বিল — অন্তত একটির টাকার অঙ্ক লিখুন (০ এর বেশি)।');
      return;
    }
    if (rentNum > 0 && !selectedRentMonths.length) {
      setError('ভাড়া কোন কোন মাসের, "হতে – পর্যন্ত" ঠিক করে দিন।');
      return;
    }
    if (elecNum > 0 && !elecMonths.length) {
      setError('কারেন্ট বিল কোন কোন মাসের, "হতে – পর্যন্ত" ঠিক করে দিন।');
      return;
    }
    if (!collectorId) { setError('দোকান ভাড়া আদায়কারী নির্বাচন করুন।'); return; }
    if (hasExisting && !overwriteMode) {
      setError('নির্বাচিত মাসে আগে থেকেই এন্ট্রি আছে। নিচে বেছে নিন — আগের অঙ্কের সাথে যোগ হবে, নাকি বদলে যাবে।');
      return;
    }

    const trimmedNote = note.trim();
    const entries = [];
    allocation.forEach((a) => {
      const prev = existingRent.find((r) => r.rentMonth === a.month);
      const amount = prev && overwriteMode === 'add' ? Number(prev.amount) + a.amount : a.amount;
      entries.push({
        shopId: shop.id, rentMonth: a.month, kind: 'rent', amount,
        paidMonth, collectorId, note: trimmedNote
      });
    });
    elecAllocation.forEach((a) => {
      const prev = existingElec.find((r) => r.rentMonth === a.month);
      const amount = prev && overwriteMode === 'add' ? Number(prev.amount) + a.amount : a.amount;
      entries.push({
        shopId: shop.id, rentMonth: a.month, kind: 'electricity', amount,
        paidMonth, collectorId, note: trimmedNote
      });
    });
    saveShopRents(entries);

    const parts = [];
    if (rentNum > 0) {
      const mLabel = selectedRentMonths.length === 1
        ? U.monthLabelShort(selectedRentMonths[0])
        : `${U.monthLabelShort(fromMonth)} হতে ${U.monthLabelShort(toMonth)}, ${U.bnDigits(selectedRentMonths.length)} মাস`;
      parts.push(`ভাড়া ${U.bnTaka(rentNum)} (${mLabel})`);
    }
    if (elecNum > 0) {
      const eLabel = elecMonths.length === 1
        ? U.monthLabelShort(elecMonths[0])
        : `${U.monthLabelShort(elecFrom)} হতে ${U.monthLabelShort(elecTo)}, ${U.bnDigits(elecMonths.length)} মাস`;
      parts.push(`বিদ্যুৎ বিল ${U.bnTaka(elecNum)} (${eLabel})`);
    }
    addToast(
      `${Calc.shopLabel(shop)} — ${U.monthLabel(paidMonth)} মাসের হিসাবে ${parts.join(' ও ')} সংরক্ষিত হয়েছে।`,
      'success'
    );
    resetForm(true); // পরের এন্ট্রির জন্য জমার মাসটি রেখে দেওয়া হয়
  };

  const unpaidHint = () => {
    if (!shop) return 'দোকান নির্বাচন করলে বকেয়া মাসগুলো দেখাবে';
    if (!unpaidMonths.length) return 'কোনো মাসের ভাড়া বাকি নেই';
    const shown = unpaidMonths.slice(0, 4).map(U.monthLabelShort).join(', ');
    const more = unpaidMonths.length > 4 ? ` … (মোট ${U.bnDigits(unpaidMonths.length)} মাস)` : '';
    return `বাকি: ${shown}${more}`;
  };

  return (
    <div className="page-body">
      <form onSubmit={handleSubmit} className="card charge-form-card">
        <div className="card-header">
          <div>
            <div className="card-title">
              <Store size={18} color="var(--primary)" />
              <span>দোকান ভাড়া এন্ট্রি ফর্ম</span>
            </div>
            <div className="card-subtitle">
              দোকান নির্বাচন করলে বর্তমান বকেয়া ও প্রথম বকেয়া মাস নিজে থেকেই বসে যাবে।
              জমার মাস অনুযায়ী মাসিক হিসাব সারসংক্ষেপ ও খতিয়ানে উঠবে।
            </div>
          </div>
          <button type="button" onClick={() => resetForm(false)} className="btn btn-outline btn-sm">
            ফর্ম খালি করুন
          </button>
        </div>

        <div className="card-body">
          {!canWrite && (
            <div className="form-notice">
              <Eye size={17} />
              <span>
                আপনি <b>ভিউ মোডে</b> আছেন — তথ্য দেখা যাবে, সংরক্ষণ করা যাবে না।
                সংরক্ষণ করতে অ্যাডমিন হিসেবে লগইন করুন।
              </span>
            </div>
          )}

          <div className="charge-form-grid">
            {/* ---- ১. কোন দোকানের ভাড়া ---- */}
            <div className="charge-field">
              <label className="charge-field-label" htmlFor="srf-shop">দোকান ভাড়া কোনটার</label>
              <select
                id="srf-shop"
                className="form-select"
                value={shopId}
                onChange={(e) => { setShopId(e.target.value); setError(''); }}
              >
                <option value="">— দোকান নির্বাচন করুন —</option>
                {shops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {Calc.shopLabel(s)} ভাড়া আদায়{s.tenantName ? ` — ${s.tenantName}` : ''}
                  </option>
                ))}
              </select>
              <span className="charge-field-hint">
                {shop
                  ? <>ধার্য ভাড়া <b>{U.bnTaka(Calc.shopRentForMonth(shop, paidMonth))}</b>/মাস{shop.phone ? ` · ${U.bnDigits(shop.phone)}` : ''}</>
                  : <>মোট {U.bnDigits(shops.length)}টি চালু দোকান</>}
              </span>
            </div>

            {/* ---- ২. বর্তমান বকেয়া (স্বয়ংক্রিয়) ---- */}
            <div className="charge-field">
              <label className="charge-field-label" htmlFor="srf-due">বর্তমান বকেয়া ভাড়া</label>
              <input
                id="srf-due"
                type="text"
                className={`form-input is-auto ${status && status.due > 0 ? 'is-due' : ''} ${
                  status && status.advance > 0 ? 'is-advance' : ''
                }`}
                value={dueText()}
                placeholder="দোকান নির্বাচন করলে এখানে বসবে"
                readOnly
                tabIndex={-1}
              />
              <span className="charge-field-hint">
                <Lock size={12} /> {unpaidHint()}
              </span>
            </div>

            {/* ---- ৩. জমার মাস ---- */}
            <div className="charge-field">
              <label className="charge-field-label" htmlFor="srf-paid">দোকান ভাড়া কোন মাসে তোলা হচ্ছে (জমার মাস)</label>
              <select
                id="srf-paid"
                className="form-select"
                value={paidMonth}
                onChange={(e) => { setPaidMonth(e.target.value); setOverwriteMode(''); setError(''); }}
              >
                {paidMonths.map((m) => (
                  <option key={m} value={m}>{U.monthLabel(m)}</option>
                ))}
              </select>
              <span className="charge-field-hint">
                এই মাসের মাসিক হিসাব সারসংক্ষেপ ও খতিয়ানে "দোকানের ভাড়া আদায়" সারিতে উঠবে
              </span>
            </div>

            {/* ---- ৪. ভাড়ার মাস (হতে – পর্যন্ত) ---- */}
            <div className="charge-field">
              <label className="charge-field-label" htmlFor="srf-from">দোকান ভাড়া কোন কোন মাসের জন্য</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select
                  id="srf-from"
                  className="form-select"
                  value={fromMonth}
                  onChange={(e) => { setFromMonth(e.target.value); setOverwriteMode(''); setError(''); }}
                  disabled={!shop}
                  style={{ flex: 1, minWidth: 0 }}
                >
                  <option value="">— হতে —</option>
                  {rentMonths.map((m) => (
                    <option key={m} value={m}>{U.monthLabel(m)}</option>
                  ))}
                </select>
                <span style={{ color: 'var(--text-muted)', fontSize: '12px', flexShrink: 0 }}>পর্যন্ত</span>
                <select
                  id="srf-to"
                  className="form-select"
                  value={toMonth}
                  onChange={(e) => { setToMonth(e.target.value); setOverwriteMode(''); setError(''); }}
                  disabled={!shop}
                  style={{ flex: 1, minWidth: 0 }}
                >
                  <option value="">— পর্যন্ত —</option>
                  {rentMonths
                    .filter((m) => !fromMonth || U.monthIndex(m) >= U.monthIndex(fromMonth))
                    .map((m) => (
                      <option key={m} value={m}>{U.monthLabel(m)}</option>
                    ))}
                </select>
              </div>
              <span className="charge-field-hint">
                {selectedRentMonths.length
                  ? <>{U.bnDigits(selectedRentMonths.length)} মাস, ধার্য মোট <b>{U.bnTaka(chargedTotal)}</b> — এক মাস হলে দুটোতেই একই মাস</>
                  : 'এক মাস হলে "হতে" ও "পর্যন্ত" দুটোতেই একই মাস'}
              </span>
            </div>

            {/* ---- ৫. দোকান ভাড়ার টাকা ---- */}
            <div className="charge-field">
              <label className="charge-field-label" htmlFor="srf-rent">দোকান ভাড়ার পরিমাণ</label>
              <input
                id="srf-rent"
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                className="form-input"
                value={rentAmount}
                onChange={(e) => { setRentAmount(e.target.value); setError(''); }}
                placeholder={String(chargedTotal || 0)}
                disabled={!canWrite}
              />
              <span className="charge-field-hint">
                {canWrite && chargedTotal > 0 ? (
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => { setRentAmount(String(chargedTotal)); setError(''); }}
                  >
                    ধার্য {U.bnTaka(chargedTotal)} বসান
                  </button>
                ) : (
                  'টাকার অঙ্ক লিখুন'
                )}
                {allocation.length > 1 && (
                  <> · মাসওয়ারি: {allocation.map((a) => `${U.monthLabelShort(a.month)} ${U.bnNumber(a.amount)}`).join(', ')}</>
                )}
              </span>
            </div>

            {/* ---- ৬. আদায়কারী ---- */}
            <div className="charge-field">
              <label className="charge-field-label" htmlFor="srf-collector">দোকান ভাড়া আদায়কারী</label>
              <select
                id="srf-collector"
                className="form-select"
                value={collectorId}
                onChange={(e) => { setCollectorId(e.target.value); setError(''); }}
                disabled={!canWrite}
              >
                <option value="">— আদায়কারী নির্বাচন করুন —</option>
                {collectors.map((c) => (
                  <option key={c.id} value={c.id}>{c.bn || c.en}</option>
                ))}
              </select>
              <span className="charge-field-hint">
                মোট {U.bnDigits(collectors.length)} জন আদায়কারী
              </span>
            </div>

            {/* ---- ৭. বিদ্যুৎ (কারেন্ট) বিল ---- */}
            <div className="charge-field">
              <label className="charge-field-label" htmlFor="srf-elec">কারেন্ট বিল (বিদ্যুৎ)</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  id="srf-elec"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  className="form-input"
                  value={elecAmount}
                  onChange={(e) => { setElecAmount(e.target.value); setError(''); }}
                  placeholder={shop && shop.electricityShare ? String(shop.electricityShare) : '0'}
                  disabled={!canWrite}
                  style={{ flex: 1, minWidth: 0 }}
                />
              </div>
              {/* বিল কোন কোন মাসের — ভাড়ার মাসের পরিসর নিজে বসে, দরকারে বদলানো যায় */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
                <select
                  id="srf-elec-from"
                  className="form-select"
                  value={elecFrom}
                  onChange={(e) => { setElecFrom(e.target.value); setElecMonthTouched(true); setOverwriteMode(''); setError(''); }}
                  disabled={!canWrite || !shop}
                  style={{ flex: 1, minWidth: 0 }}
                  title="বিদ্যুৎ বিল কোন মাস হতে"
                >
                  <option value="">— হতে —</option>
                  {rentMonths.map((m) => (
                    <option key={m} value={m}>{U.monthLabel(m)}</option>
                  ))}
                </select>
                <span style={{ color: 'var(--text-muted)', fontSize: '12px', flexShrink: 0 }}>পর্যন্ত</span>
                <select
                  id="srf-elec-to"
                  className="form-select"
                  value={elecTo}
                  onChange={(e) => { setElecTo(e.target.value); setElecMonthTouched(true); setOverwriteMode(''); setError(''); }}
                  disabled={!canWrite || !shop}
                  style={{ flex: 1, minWidth: 0 }}
                  title="বিদ্যুৎ বিল কোন মাস পর্যন্ত"
                >
                  <option value="">— পর্যন্ত —</option>
                  {rentMonths
                    .filter((m) => !elecFrom || U.monthIndex(m) >= U.monthIndex(elecFrom))
                    .map((m) => (
                      <option key={m} value={m}>{U.monthLabel(m)}</option>
                    ))}
                </select>
              </div>
              <span className="charge-field-hint">
                <Zap size={12} />{' '}
                {canWrite && shop && shop.electricityShare > 0 && elecMonths.length > 0 ? (
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => { setElecAmount(String(shop.electricityShare * elecMonths.length)); setError(''); }}
                  >
                    নির্ধারিত {U.bnTaka(shop.electricityShare)} × {U.bnDigits(elecMonths.length)} মাস = {U.bnTaka(shop.electricityShare * elecMonths.length)} বসান
                  </button>
                ) : (
                  'না থাকলে খালি রাখুন'
                )}
                {' '}· বিলের মাস নিজে বসে ভাড়ার মাসের পরিসরই, দরকারে বদলান
                {elecAllocation.length > 1 && (
                  <> · মাসওয়ারি: {elecAllocation.map((a) => `${U.monthLabelShort(a.month)} ${U.bnNumber(a.amount)}`).join(', ')}</>
                )}
              </span>
            </div>

            {/* ---- ৮. মন্তব্য ---- */}
            <div className="charge-field">
              <label className="charge-field-label" htmlFor="srf-note">মন্তব্য (ঐচ্ছিক)</label>
              <input
                id="srf-note"
                type="text"
                className="form-input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="যেমন: রসিদ নং, আংশিক জমা, সমন্বয়ের কারণ"
                disabled={!canWrite}
              />
              <span className="charge-field-hint">খতিয়ানের "দোকানের ভাড়া আদায়" সারির পাশে দেখাবে</span>
            </div>

            {/* ---- ৯. সহায়িকা ---- */}
            <div className="charge-field charge-help" style={{ gridColumn: '1 / -1' }}>
              <div className="charge-help-title">
                <Info size={14} /> মনে রাখবেন
              </div>
              <ul>
                <li><b>জমার মাস</b> = কোন মাসের ক্যাশে টাকাটা উঠল; <b>ভাড়ার মাস</b> = কোন মাসের ভাড়া। দুটো আলাদা হতে পারে (যেমন নভেম্বরে অক্টোবরের ভাড়া)।</li>
                <li>এক অঙ্কে কয়েক মাসের ভাড়া দিলে প্রতিটি মাসে তার ধার্য হার, শেষ মাসে বাকিটা — আলাদা সারি হয়ে বসে।</li>
                <li>বিদ্যুৎ বিল ভাড়ার বকেয়ার হিসাবে ঢোকে না, খতিয়ানে ও রিপোর্টে আলাদা দেখায়।</li>
                <li>আগে এন্ট্রি থাকা মাসে সংরক্ষণের আগে সতর্ক করা হবে। দোকান যোগ/সম্পাদনা ও পূর্ণ ছক — "দোকান ভাড়া এন্ট্রি" পাতায়।</li>
              </ul>
            </div>
          </div>

          {/* ---- আগে থেকে এন্ট্রি থাকলে সতর্কতা ---- */}
          {hasExisting && (
            <div className="form-warn">
              <AlertTriangle size={18} />
              <div>
                <div>
                  <b>{Calc.shopLabel(shop)}</b>-এর নির্বাচিত মাসে ইতিমধ্যে এন্ট্রি আছে:{' '}
                  {existingRent.map((r) => `${U.monthLabelShort(r.rentMonth)} ভাড়া ${U.bnTaka(r.amount)}`).join(', ')}
                  {existingRent.length > 0 && existingElec.length > 0 ? ', ' : ''}
                  {existingElec.map((r) => `${U.monthLabelShort(r.rentMonth)} বিদ্যুৎ বিল ${U.bnTaka(r.amount)}`).join(', ')}
                  । নতুন অঙ্ক কীভাবে ধরা হবে, বেছে নিন:
                </div>
                <label className="form-confirm">
                  <input
                    type="radio"
                    name="srf-overwrite"
                    checked={overwriteMode === 'add'}
                    onChange={() => { setOverwriteMode('add'); setError(''); }}
                    disabled={!canWrite}
                  />
                  <span>আগের অঙ্কের সাথে <b>যোগ</b> হবে</span>
                </label>
                <label className="form-confirm">
                  <input
                    type="radio"
                    name="srf-overwrite"
                    checked={overwriteMode === 'replace'}
                    onChange={() => { setOverwriteMode('replace'); setError(''); }}
                    disabled={!canWrite}
                  />
                  <span>আগের এন্ট্রি মুছে শুধু নতুন অঙ্কটি থাকবে</span>
                </label>
              </div>
            </div>
          )}

          {error && <div className="form-error">{error}</div>}

          {/* ---- নির্বাচিত দোকানের সংক্ষিপ্ত তথ্য ---- */}
          {shop && status && (
            <div className="charge-form-summary">
              <div className="s-item">
                <span className="s-label">দোকান</span>
                <span className="s-value">{Calc.shopLabel(shop)}</span>
              </div>
              <div className="s-item">
                <span className="s-label">ভাড়াটিয়া</span>
                <span className="s-value">{shop.tenantName || '—'}</span>
              </div>
              <div className="s-item">
                <span className="s-label">ভাড়ার মাস</span>
                <span className="s-value">
                  {selectedRentMonths.length
                    ? selectedRentMonths.length === 1
                      ? U.monthLabelShort(fromMonth)
                      : `${U.monthLabelShort(fromMonth)} – ${U.monthLabelShort(toMonth)} (${U.bnDigits(selectedRentMonths.length)})`
                    : '—'}
                </span>
              </div>
              <div className="s-item">
                <span className="s-label">আদায়কারী</span>
                <span className="s-value">{collectorName(collectorId) || '—'}</span>
              </div>
              <div className="s-item">
                <span className="s-label">মোট জমা (ভাড়া + বিদ্যুৎ)</span>
                <span className="s-value" style={{ color: rentNum + elecNum > 0 ? 'var(--success-dark)' : 'var(--text-main)' }}>
                  {U.bnTaka(rentNum + elecNum)}
                </span>
              </div>
              <div className="s-item">
                <span className="s-label">{status.advance > 0 ? 'বর্তমান অগ্রীম' : 'বর্তমান বকেয়া'}</span>
                <span
                  className="s-value"
                  style={{
                    color: status.advance > 0
                      ? 'var(--success-dark)'
                      : status.due > 0 ? 'var(--danger)' : 'var(--text-main)'
                  }}
                >
                  {U.bnTaka(status.advance > 0 ? status.advance : status.due)}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <span className="charge-form-foot-note">
            জমার তারিখ ধরা হবে {paidMonth ? U.monthLabel(paidMonth) : 'জমার'} মাসের শেষ দিন।
          </span>
          <button type="button" onClick={() => resetForm(false)} className="btn btn-outline">
            বাতিল
          </button>
          <button type="submit" className="btn btn-primary" disabled={!canWrite}>
            <Save size={17} />
            <span>সংরক্ষণ করুন</span>
          </button>
        </div>
      </form>
    </div>
  );
}
