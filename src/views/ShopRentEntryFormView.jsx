import React, { useState, useMemo, useEffect } from 'react';
import { useData } from '../context/DataContext';
import * as Calc from '../utils/calc';
import * as U from '../utils/format';
import { Store, Lock, Save, AlertTriangle, Eye, Info, Zap, Trash2 } from 'lucide-react';

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
  // ফর্মের দুই রূপ: 'rent' = ভাড়া/বিদ্যুৎ আদায় (অ্যাডভান্স থেকে সমন্বয়সহ),
  // 'deposit' = অ্যাডভান্স (জামানত) গ্রহণ বা ফেরত
  const [mode, setMode] = useState('rent');
  // ভাড়ার কতটা ভাড়াটিয়ার অ্যাডভান্স থেকে কেটে সমন্বয় হলো — নগদ নয়
  const [adjustAmount, setAdjustAmount] = useState('');
  // বিদ্যুৎ বিলের কতটা অ্যাডভান্স থেকে কাটা হলো — নগদ নয়, জামানত কমে
  const [elecAdjustAmount, setElecAdjustAmount] = useState('');
  const [depKind, setDepKind] = useState('advance'); // 'advance' | 'advance-refund'
  const [depMonth, setDepMonth] = useState(selectedMonth);
  const [depAmount, setDepAmount] = useState('');
  // আগের এন্ট্রি থাকলে: 'add' = আগের অঙ্কের সাথে যোগ, 'replace' = বদল
  const [overwriteMode, setOverwriteMode] = useState('');

  const shops = useMemo(() => Calc.shopsSorted(data), [data]);
  const collectors = data.settings.collectors || [];
  const shop = shops.find((s) => s.id === shopId) || null;
  // ভাড়াটিয়ার ইতিহাস থাকলে — কার খাতায় লিখছি (ডিফল্ট বর্তমানজন)
  const tenancies = useMemo(() => (shop ? Calc.shopTenancies(shop) : []), [shop]);
  const [tenancyId, setTenancyId] = useState('');
  useEffect(() => {
    const cur = shop ? Calc.shopCurrentTenancy(shop) : null;
    setTenancyId(cur ? cur.id : '');
  }, [shop]);
  const tenancy = tenancies.find((t) => t.id === tenancyId) || null;
  // এই দোকানের (এই ভাড়াটিয়ার) অ্যাডভান্স খাতা — আজ পর্যন্ত: গ্রহণ − সমন্বয় − ফেরত
  const deposit = useMemo(
    () => (shop ? Calc.shopDeposit(data, shop, undefined, tenancy || undefined) : null),
    [data, shop, tenancy]
  );
  // অন্য (আগের) ভাড়াটিয়াদের খাতা — ফেরত বাকি থাকলে চোখে পড়ুক
  const depositByTenancy = useMemo(() => (shop ? Calc.shopDepositByTenancy(data, shop) : []), [data, shop]);

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
    // চুক্তিতে মাসে কাটার হার থাকলে ও অ্যাডভান্স জমা থাকলে সেটি নিজে বসে (বদলানো যায়)
    const dep = Calc.shopDeposit(data, shop, undefined, Calc.shopCurrentTenancy(shop) || undefined);
    setAdjustAmount(dep.balance > 0 && dep.monthlyAdjust > 0 ? String(Math.min(dep.monthlyAdjust, dep.balance)) : '');
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
  // অ্যাডভান্স থেকে সমন্বয় — নগদ ভাড়া বসানোর পর যে মাসে যতটা পাওনা বাকি,
  // সেখানে ক্রমে; শেষ মাসে যা বাকি
  const adjustNum = Number(adjustAmount) || 0;
  const adjustAllocation = useMemo(() => {
    if (!shop || adjustNum <= 0 || !selectedRentMonths.length) return [];
    const cashBy = new Map(allocation.map((a) => [a.month, a.amount]));
    let remaining = adjustNum;
    const last = selectedRentMonths.length - 1;
    return selectedRentMonths.map((m, i) => {
      const room = Math.max(0, Calc.shopRentForMonth(shop, m) - (cashBy.get(m) || 0));
      const take = i === last ? remaining : Math.min(room, remaining);
      remaining -= take;
      return { month: m, amount: take };
    }).filter((a) => a.amount > 0);
  }, [shop, adjustNum, selectedRentMonths, allocation]);
  const existingAdjust = useMemo(
    () => shopRents.filter((r) => r.kind === 'advance-adjust' && adjustAllocation.some((a) => a.month === r.rentMonth)),
    [shopRents, adjustAllocation]
  );
  // বিদ্যুৎ বিল অ্যাডভান্স থেকে — বিলের মাসগুলোতে ভাগ: নির্ধারিত অংশ থাকলে
  // সেটি, নইলে সমান ভাগ; শেষ মাসে যা বাকি (নগদ বিলের মতোই)
  const elecAdjustNum = Number(elecAdjustAmount) || 0;
  const elecAdjustAllocation = useMemo(() => {
    if (elecAdjustNum <= 0 || !elecMonths.length) return [];
    const share = shop && Number(shop.electricityShare) > 0
      ? Number(shop.electricityShare)
      : Math.floor(elecAdjustNum / elecMonths.length);
    let remaining = elecAdjustNum;
    const last = elecMonths.length - 1;
    return elecMonths.map((m, i) => {
      const take = i === last ? remaining : Math.min(share, remaining);
      remaining -= take;
      return { month: m, amount: take };
    }).filter((a) => a.amount > 0);
  }, [shop, elecAdjustNum, elecMonths]);
  const existingElecAdjust = useMemo(
    () => shopRents.filter((r) => r.kind === 'advance-adjust-elec' && elecAdjustAllocation.some((a) => a.month === r.rentMonth)),
    [shopRents, elecAdjustAllocation]
  );
  // অ্যাডভান্স গ্রহণ/ফেরত — ঐ মাসে একই ধরনের এন্ট্রি আগে থাকলে
  const depNum = Number(depAmount) || 0;
  const existingDep = useMemo(
    () => (depMonth ? shopRents.find((r) => r.kind === depKind && r.rentMonth === depMonth) || null : null),
    [shopRents, depKind, depMonth]
  );
  const existingLabels = mode === 'deposit'
    ? (existingDep ? [`${U.monthLabelShort(existingDep.rentMonth)} ${Calc.shopKindLabel(existingDep.kind)} ${U.bnTaka(existingDep.amount)}`] : [])
    : [
      ...existingRent.map((r) => `${U.monthLabelShort(r.rentMonth)} ভাড়া ${U.bnTaka(r.amount)}`),
      ...existingElec.map((r) => `${U.monthLabelShort(r.rentMonth)} বিদ্যুৎ বিল ${U.bnTaka(r.amount)}`),
      ...existingAdjust.map((r) => `${U.monthLabelShort(r.rentMonth)} অ্যাডভান্স সমন্বয় ${U.bnTaka(r.amount)}`),
      ...existingElecAdjust.map((r) => `${U.monthLabelShort(r.rentMonth)} বিদ্যুৎ বিল অ্যাডভান্স থেকে ${U.bnTaka(r.amount)}`)
    ];
  const hasExisting = existingLabels.length > 0;

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
    setAdjustAmount('');
    setElecAdjustAmount('');
    setDepAmount('');
    setDepKind('advance');
    if (!keepMonth) { setPaidMonth(selectedMonth); setDepMonth(selectedMonth); }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!canWrite) {
      setError('সংরক্ষণ করতে অ্যাডমিন হিসেবে লগইন করুন। ভিউ মোডে কেবল দেখা যায়।');
      return;
    }
    if (!shop) { setError(mode === 'deposit' ? 'কোন দোকানের অ্যাডভান্স, নির্বাচন করুন।' : 'কোন দোকানের ভাড়া, নির্বাচন করুন।'); return; }

    // ---- অ্যাডভান্স (জামানত) গ্রহণ / ফেরত ----
    if (mode === 'deposit') {
      if (!depMonth) { setError('কোন মাসের হিসাবে, নির্বাচন করুন।'); return; }
      if (depNum <= 0) { setError('অ্যাডভান্সের টাকার অঙ্ক লিখুন (০ এর বেশি)।'); return; }
      if (!collectorId) { setError(depKind === 'advance' ? 'কে গ্রহণ করলেন, নির্বাচন করুন।' : 'কে ফেরত দিলেন, নির্বাচন করুন।'); return; }
      if (existingDep && !overwriteMode) {
        setError('এই মাসে একই ধরনের এন্ট্রি আগে থেকেই আছে। নিচে বেছে নিন — যোগ হবে, নাকি বদলে যাবে।');
        return;
      }
      const amount = existingDep && overwriteMode === 'add' ? Number(existingDep.amount) + depNum : depNum;
      if (depKind === 'advance-refund' && deposit) {
        // বদলের বেলায় আগের ফেরতটি ব্যালেন্সে ফিরে আসে, তারপর নতুনটি যায়
        const available = deposit.balance + (existingDep ? Number(existingDep.amount) : 0);
        if (amount > available) {
          setError(`অ্যাডভান্স জমা আছে মাত্র ${U.bnTaka(Math.max(0, available))} — এর বেশি ফেরত লেখা যাবে না।`);
          return;
        }
      }
      saveShopRents([{
        shopId: shop.id, rentMonth: depMonth, kind: depKind, amount,
        paidMonth: depMonth, collectorId, note: note.trim(),
        tenancyId: tenancy ? tenancy.id : ''
      }]);
      addToast(
        `${Calc.shopLabel(shop)} — ${U.monthLabel(depMonth)} মাসের হিসাবে অ্যাডভান্স ${depKind === 'advance' ? 'গ্রহণ' : 'ফেরত'} ${U.bnTaka(depNum)} সংরক্ষিত হয়েছে।`,
        'success'
      );
      resetForm(true);
      return;
    }

    // ---- ভাড়া / বিদ্যুৎ আদায় ----
    if (!paidMonth) { setError('জমার মাস নির্বাচন করুন।'); return; }
    if (rentNum <= 0 && elecNum <= 0 && adjustNum <= 0 && elecAdjustNum <= 0) {
      setError('দোকান ভাড়া, বিদ্যুৎ বিল বা অ্যাডভান্স থেকে সমন্বয় — অন্তত একটির টাকার অঙ্ক লিখুন (০ এর বেশি)।');
      return;
    }
    if (adjustNum > 0 && !selectedRentMonths.length) {
      setError('অ্যাডভান্স থেকে কোন মাসের ভাড়া কাটছেন, "হতে – পর্যন্ত" ঠিক করে দিন।');
      return;
    }
    if (elecAdjustNum > 0 && !elecMonths.length) {
      setError('অ্যাডভান্স থেকে কোন মাসের বিদ্যুৎ বিল কাটছেন, বিলের "হতে – পর্যন্ত" ঠিক করে দিন।');
      return;
    }
    if (adjustNum + elecAdjustNum > 0) {
      // বদলের বেলায় ঐ মাসগুলোর আগের সমন্বয় ব্যালেন্সে ফিরে আসে
      const freed = overwriteMode === 'replace'
        ? [...existingAdjust, ...existingElecAdjust].reduce((s, r) => s + Number(r.amount), 0)
        : 0;
      const available = (deposit ? deposit.balance : 0) + freed;
      if (adjustNum + elecAdjustNum > available) {
        setError(`অ্যাডভান্স জমা আছে মাত্র ${U.bnTaka(Math.max(0, available))} — ভাড়া ও বিদ্যুৎ মিলিয়ে এর বেশি সমন্বয় করা যাবে না।`);
        return;
      }
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
    adjustAllocation.forEach((a) => {
      const prev = existingAdjust.find((r) => r.rentMonth === a.month);
      const amount = prev && overwriteMode === 'add' ? Number(prev.amount) + a.amount : a.amount;
      entries.push({
        shopId: shop.id, rentMonth: a.month, kind: 'advance-adjust', amount,
        paidMonth, collectorId, note: trimmedNote,
        tenancyId: (Calc.shopTenancyFor(shop, a.month) || tenancy || {}).id || ''
      });
    });
    elecAdjustAllocation.forEach((a) => {
      const prev = existingElecAdjust.find((r) => r.rentMonth === a.month);
      const amount = prev && overwriteMode === 'add' ? Number(prev.amount) + a.amount : a.amount;
      entries.push({
        shopId: shop.id, rentMonth: a.month, kind: 'advance-adjust-elec', amount,
        paidMonth, collectorId, note: trimmedNote,
        tenancyId: (Calc.shopTenancyFor(shop, a.month) || tenancy || {}).id || ''
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
    if (adjustNum > 0) parts.push(`অ্যাডভান্স থেকে সমন্বয় ${U.bnTaka(adjustNum)} (নগদ নয়)`);
    if (elecNum > 0) {
      const eLabel = elecMonths.length === 1
        ? U.monthLabelShort(elecMonths[0])
        : `${U.monthLabelShort(elecFrom)} হতে ${U.monthLabelShort(elecTo)}, ${U.bnDigits(elecMonths.length)} মাস`;
      parts.push(`বিদ্যুৎ বিল ${U.bnTaka(elecNum)} (${eLabel})`);
    }
    if (elecAdjustNum > 0) parts.push(`বিদ্যুৎ বিল অ্যাডভান্স থেকে সমন্বয় ${U.bnTaka(elecAdjustNum)} (নগদ নয়)`);
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
              <span>{mode === 'deposit' ? 'দোকানের অ্যাডভান্স (জামানত) — গ্রহণ / ফেরত' : 'দোকান ভাড়া এন্ট্রি ফর্ম'}</span>
            </div>
            <div className="card-subtitle">
              {mode === 'deposit'
                ? 'অ্যাডভান্স ভাড়া নয় — সমিতির কাছে ভাড়াটিয়ার জমা, দোকান ছাড়লে ফেরতযোগ্য। মাসে মাসে ভাড়া থেকে কাটা হলে সেটি "ভাড়া আদায়" ফর্মে লিখুন।'
                : 'দোকান নির্বাচন করলে বর্তমান বকেয়া ও প্রথম বকেয়া মাস নিজে থেকেই বসে যাবে। জমার মাস অনুযায়ী মাসিক হিসাব সারসংক্ষেপ ও খতিয়ানে উঠবে।'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {/* ফর্মের দুই রূপ */}
            <div style={{ display: 'inline-flex', border: '1px solid var(--border, #cbd5e1)', borderRadius: '8px', overflow: 'hidden' }}>
              <button
                type="button"
                className={`btn btn-sm ${mode === 'rent' ? 'btn-primary' : 'btn-outline'}`}
                style={{ borderRadius: 0, border: 'none' }}
                onClick={() => { setMode('rent'); setError(''); setOverwriteMode(''); }}
              >
                ভাড়া আদায়
              </button>
              <button
                type="button"
                className={`btn btn-sm ${mode === 'deposit' ? 'btn-primary' : 'btn-outline'}`}
                style={{ borderRadius: 0, border: 'none' }}
                onClick={() => { setMode('deposit'); setError(''); setOverwriteMode(''); }}
              >
                অ্যাডভান্স গ্রহণ / ফেরত
              </button>
            </div>
            <button type="button" onClick={() => resetForm(false)} className="btn btn-outline btn-sm">
              ফর্ম খালি করুন
            </button>
          </div>
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

          {mode === 'rent' && (
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
                    {Calc.shopLabel(s)} ভাড়া আদায়{Calc.shopTenantName(s) ? ` — ${Calc.shopTenantName(s)}` : ''}
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
              {/* ভাড়াটিয়ার অ্যাডভান্স (জামানত) জমা থাকলে — কতটা সেখান থেকে কেটে সমন্বয় */}
              {deposit && (deposit.balance > 0 || adjustNum > 0) && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
                  <label htmlFor="srf-adjust" style={{ fontSize: '12px', color: 'var(--text-muted)', flexShrink: 0 }}>
                    অ্যাডভান্স থেকে সমন্বয়
                  </label>
                  <input
                    id="srf-adjust"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="1"
                    className="form-input"
                    value={adjustAmount}
                    onChange={(e) => { setAdjustAmount(e.target.value); setError(''); }}
                    placeholder="0"
                    disabled={!canWrite}
                    style={{ flex: 1, minWidth: 0 }}
                  />
                </div>
              )}
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
                {deposit && deposit.balance > 0 && (
                  <>
                    {' '}· অ্যাডভান্স জমা আছে <b>{U.bnTaka(deposit.balance)}</b>
                    {deposit.monthlyAdjust > 0 && `, চুক্তিতে মাসে ${U.bnTaka(deposit.monthlyAdjust)} কাটা`}
                    {canWrite && selectedRentMonths.length > 0 && (
                      <>
                        {' '}
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => {
                            // নগদ বাদে যতটা পাওনা বাকি, ততটা অ্যাডভান্স থেকে (জমার মধ্যে)
                            const due = Math.max(0, chargedTotal - rentNum);
                            setAdjustAmount(String(Math.min(due, deposit.balance)));
                            setError('');
                          }}
                        >
                          বাকি পুরোটা অ্যাডভান্স থেকে
                        </button>
                      </>
                    )}
                  </>
                )}
                {adjustAllocation.length > 1 && (
                  <> · সমন্বয় মাসওয়ারি: {adjustAllocation.map((a) => `${U.monthLabelShort(a.month)} ${U.bnNumber(a.amount)}`).join(', ')}</>
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
              {/* বিলের কতটা অ্যাডভান্স (জামানত) থেকে কাটা — নগদ নয় */}
              {deposit && (deposit.balance > 0 || elecAdjustNum > 0) && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
                  <label htmlFor="srf-elec-adjust" style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    অ্যাডভান্স থেকে
                  </label>
                  <input
                    id="srf-elec-adjust"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="1"
                    className="form-input"
                    value={elecAdjustAmount}
                    onChange={(e) => { setElecAdjustAmount(e.target.value); setError(''); }}
                    placeholder="0"
                    disabled={!canWrite}
                    style={{ flex: 1, minWidth: 0 }}
                    title="বিদ্যুৎ বিলের যে অংশ ভাড়াটিয়ার অ্যাডভান্স (জামানত) থেকে কেটে নেওয়া হলো — নগদ ওঠেনি"
                  />
                </div>
              )}
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
                {deposit && deposit.balance > 0 && (
                  <> · বিলও অ্যাডভান্স থেকে কাটা যায় (জমা {U.bnTaka(deposit.balance - adjustNum)}) — "অ্যাডভান্স থেকে" ঘরে লিখুন, নগদ ওঠবে না</>
                )}
                {elecAdjustAllocation.length > 1 && (
                  <> · অ্যাডভান্স থেকে মাসওয়ারি: {elecAdjustAllocation.map((a) => `${U.monthLabelShort(a.month)} ${U.bnNumber(a.amount)}`).join(', ')}</>
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
                <li>আগে এন্ট্রি থাকা মাসে সংরক্ষণের আগে সতর্ক করা হবে। দোকান যোগ/সম্পাদনা ও পূর্ণ ছক — "দোকানওয়ারি ভাড়ার হিসাব" পাতায়।</li>
                <li>ভাড়াটিয়ার অ্যাডভান্স (জামানত) জমা থাকলে "অ্যাডভান্স থেকে সমন্বয়" ঘরে কাটার অঙ্ক লিখুন — ভাড়া পরিশোধ ধরা হবে, নগদ ওঠেনি বলে খতিয়ানে স্মারক হিসেবে থাকবে।</li>
              </ul>
            </div>
          </div>
          )}

          {/* ================= অ্যাডভান্স (জামানত) গ্রহণ / ফেরত ================= */}
          {mode === 'deposit' && (
          <div className="charge-form-grid">
            {/* ---- দোকান ---- */}
            <div className="charge-field">
              <label className="charge-field-label" htmlFor="srd-shop">কোন দোকানের অ্যাডভান্স</label>
              <select
                id="srd-shop"
                className="form-select"
                value={shopId}
                onChange={(e) => { setShopId(e.target.value); setError(''); }}
              >
                <option value="">— দোকান নির্বাচন করুন —</option>
                {shops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {Calc.shopLabel(s)}{Calc.shopTenantName(s) ? ` — ${Calc.shopTenantName(s)}` : ''}
                  </option>
                ))}
              </select>
              {/* একাধিক ভাড়াটিয়া থাকলে — কার অ্যাডভান্স */}
              {tenancies.length > 0 && (
                <select
                  className="form-select"
                  value={tenancyId}
                  onChange={(e) => { setTenancyId(e.target.value); setOverwriteMode(''); setError(''); }}
                  style={{ marginTop: '8px' }}
                  title="কোন ভাড়াটিয়ার অ্যাডভান্স"
                >
                  {tenancies.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.tenantName || 'নামহীন'} — {U.monthLabelShort(t.fromMonth)} হতে {t.toMonth ? U.monthLabelShort(t.toMonth) : 'চলছে'}
                    </option>
                  ))}
                </select>
              )}
              <span className="charge-field-hint">
                {shop && deposit
                  ? <>চুক্তির অ্যাডভান্স <b>{U.bnTaka(deposit.agreed)}</b>{deposit.monthlyAdjust > 0 && <>, মাসে {U.bnTaka(deposit.monthlyAdjust)} কাটা</>}{(tenancy ? tenancy.note : shop.advanceNote) ? ` · ${tenancy ? tenancy.note : shop.advanceNote}` : ''}</>
                  : <>মোট {U.bnDigits(shops.length)}টি চালু দোকান; চুক্তির অঙ্ক দোকানের তথ্যে লিখে রাখুন</>}
              </span>
            </div>

            {/* ---- জমা আছে (স্বয়ংক্রিয়) ---- */}
            <div className="charge-field">
              <label className="charge-field-label" htmlFor="srd-bal">অ্যাডভান্স জমা আছে</label>
              <input
                id="srd-bal"
                type="text"
                className={`form-input is-auto ${deposit && deposit.balance > 0 ? 'is-advance' : ''}`}
                value={deposit ? U.bnTaka(deposit.balance) : ''}
                placeholder="দোকান নির্বাচন করলে এখানে বসবে"
                readOnly
                tabIndex={-1}
              />
              <span className="charge-field-hint">
                <Lock size={12} />{' '}
                {deposit
                  ? `গ্রহণ ${U.bnTaka(deposit.received)} − সমন্বয় ${U.bnTaka(deposit.adjusted)}${deposit.adjustedElec > 0 ? ` (ভাড়া ${U.bnTaka(deposit.adjustedRent)}, বিদ্যুৎ ${U.bnTaka(deposit.adjustedElec)})` : ''} − ফেরত ${U.bnTaka(deposit.refunded)}`
                  : 'স্বয়ংক্রিয় — গ্রহণ, সমন্বয় ও ফেরতের হিসাব থেকে'}
              </span>
            </div>

            {/* ---- কী লিখছেন ---- */}
            <div className="charge-field">
              <span className="charge-field-label">কী লিখছেন</span>
              <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', padding: '9px 0' }}>
                <label className="form-confirm" style={{ margin: 0 }}>
                  <input
                    type="radio"
                    name="srd-kind"
                    checked={depKind === 'advance'}
                    onChange={() => { setDepKind('advance'); setOverwriteMode(''); setError(''); }}
                    disabled={!canWrite}
                  />
                  <span>অ্যাডভান্স <b>গ্রহণ</b> (নগদ ঢুকল)</span>
                </label>
                <label className="form-confirm" style={{ margin: 0 }}>
                  <input
                    type="radio"
                    name="srd-kind"
                    checked={depKind === 'advance-refund'}
                    onChange={() => { setDepKind('advance-refund'); setOverwriteMode(''); setError(''); }}
                    disabled={!canWrite}
                  />
                  <span>অ্যাডভান্স <b>ফেরত</b> (নগদ বেরোল)</span>
                </label>
              </div>
              <span className="charge-field-hint">
                গ্রহণ খতিয়ানে আলাদা আয়ের সারি, ফেরত খরচের সারি — "দোকানের ভাড়া আদায়" সারিতে নয়
              </span>
            </div>

            {/* ---- মাস ---- */}
            <div className="charge-field">
              <label className="charge-field-label" htmlFor="srd-month">কোন মাসের হিসাবে (জমার মাস)</label>
              <select
                id="srd-month"
                className="form-select"
                value={depMonth}
                onChange={(e) => { setDepMonth(e.target.value); setOverwriteMode(''); setError(''); }}
                disabled={!canWrite}
              >
                {paidMonths.map((m) => (
                  <option key={m} value={m}>{U.monthLabel(m)}</option>
                ))}
              </select>
              <span className="charge-field-hint">
                পুরোনো অ্যাডভান্স (আগে নেওয়া) ঢোকাতে সেই পুরোনো মাসটি দিন — শুরুর ব্যালেন্স হিসেবে ধরা হবে
              </span>
            </div>

            {/* ---- টাকা ---- */}
            <div className="charge-field">
              <label className="charge-field-label" htmlFor="srd-amount">টাকার পরিমাণ</label>
              <input
                id="srd-amount"
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                className="form-input"
                value={depAmount}
                onChange={(e) => { setDepAmount(e.target.value); setError(''); }}
                placeholder={deposit && depKind === 'advance' && deposit.agreed > 0 ? String(deposit.agreed) : '0'}
                disabled={!canWrite}
              />
              <span className="charge-field-hint">
                {canWrite && deposit && depKind === 'advance' && deposit.agreed > deposit.received ? (
                  <button type="button" className="link-btn" onClick={() => { setDepAmount(String(deposit.agreed - deposit.received)); setError(''); }}>
                    চুক্তির বাকি {U.bnTaka(deposit.agreed - deposit.received)} বসান
                  </button>
                ) : canWrite && deposit && depKind === 'advance-refund' && deposit.balance > 0 ? (
                  <button type="button" className="link-btn" onClick={() => { setDepAmount(String(deposit.balance)); setError(''); }}>
                    পুরো জমা {U.bnTaka(deposit.balance)} ফেরত
                  </button>
                ) : (
                  'টাকার অঙ্ক লিখুন'
                )}
              </span>
            </div>

            {/* ---- কে ---- */}
            <div className="charge-field">
              <label className="charge-field-label" htmlFor="srd-collector">
                {depKind === 'advance' ? 'কে গ্রহণ করলেন' : 'কে ফেরত দিলেন'}
              </label>
              <select
                id="srd-collector"
                className="form-select"
                value={collectorId}
                onChange={(e) => { setCollectorId(e.target.value); setError(''); }}
                disabled={!canWrite}
              >
                <option value="">— নির্বাচন করুন —</option>
                {collectors.map((c) => (
                  <option key={c.id} value={c.id}>{c.bn || c.en}</option>
                ))}
              </select>
              <span className="charge-field-hint">খতিয়ানের সারিতে এঁর নামে বসবে</span>
            </div>

            {/* ---- মন্তব্য ---- */}
            <div className="charge-field">
              <label className="charge-field-label" htmlFor="srd-note">মন্তব্য (ঐচ্ছিক)</label>
              <input
                id="srd-note"
                type="text"
                className="form-input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="যেমন: চুক্তি ০১-০৭-২০২৫; পুরোনো অ্যাডভান্স, আদায়কারীর খাতা অনুযায়ী"
                disabled={!canWrite}
              />
              <span className="charge-field-hint">খতিয়ানের সারির পাশে ও অ্যাডভান্স খাতায় দেখাবে</span>
            </div>

            {/* ---- এই দোকানের অ্যাডভান্স খাতা / সহায়িকা ---- */}
            <div className="charge-field charge-help">
              <div className="charge-help-title">
                <Info size={14} /> {shop && deposit && deposit.history.length ? `${Calc.shopLabel(shop)}-এর অ্যাডভান্স খাতা` : 'মনে রাখবেন'}
              </div>
              {/* একাধিক ভাড়াটিয়া: প্রত্যেকের খাতার ব্যালেন্স — আগেরজনের ফেরত বাকি থাকলে লাল */}
              {depositByTenancy.length > 1 && (
                <ul style={{ marginBottom: '6px' }}>
                  {depositByTenancy.map((d) => (
                    <li key={d.tenancy.id} style={{ color: d.tenancy.toMonth && d.balance > 0 ? '#b91c1c' : undefined }}>
                      {d.tenancy.tenantName || 'নামহীন'} ({U.monthLabelShort(d.tenancy.fromMonth)} হতে {d.tenancy.toMonth ? U.monthLabelShort(d.tenancy.toMonth) : 'চলছে'}):
                      জমা আছে <b>{U.bnTaka(d.balance)}</b>
                      {d.tenancy.toMonth && d.balance > 0 ? ' — ছেড়ে গেছেন, ফেরত বাকি' : ''}
                      {canWrite && d.tenancy.toMonth && d.balance > 0 && (
                        <>
                          {' '}
                          <button
                            type="button"
                            className="link-btn"
                            onClick={() => {
                              // ছাড়ার পরের মাসে (জমার মাসের তালিকায় থাকলে) পুরো জমা ফেরত — ঘরগুলো ভরে দেয়, সংরক্ষণ আপনি
                              const next = U.addMonths(d.tenancy.toMonth, 1);
                              setTenancyId(d.tenancy.id);
                              setDepKind('advance-refund');
                              setDepAmount(String(d.balance));
                              setDepMonth(paidMonths.includes(next) ? next : paidMonths[paidMonths.length - 1] || next);
                              if (!note) setNote(`${d.tenancy.tenantName || 'আগের ভাড়াটিয়া'}-কে জামানতের বাকি ফেরত`);
                              setOverwriteMode('');
                              setError('');
                            }}
                          >
                            ফেরত লিখুন
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {shop && deposit && deposit.history.length ? (
                <ul>
                  {deposit.history.map((r) => (
                    <li key={r.id}>
                      {U.monthLabelShort(r.rentMonth)}: {Calc.shopKindLabel(r.kind)} <b>{U.bnTaka(r.amount)}</b>
                      {Calc.SHOP_ADJUST_KINDS.includes(r.kind) && r.paidMonth !== r.rentMonth ? ` (${U.monthLabelShort(r.paidMonth)} এর হিসাবে)` : ''}
                      {r.note ? ` — ${r.note}` : ''}
                      {canWrite && (r.kind === 'advance' || r.kind === 'advance-refund') && (
                        <>
                          {' '}
                          <button type="button" className="link-btn" style={{ color: '#b91c1c' }} title="ভুল এন্ট্রি হলে এই সারিটি মুছুন"
                            onClick={() => {
                              if (!window.confirm(`${U.monthLabelShort(r.rentMonth)} মাসের ${Calc.shopKindLabel(r.kind)} ${U.bnTaka(r.amount)} সারিটি মুছে ফেলবেন?`)) return;
                              saveShopRents([{ shopId: shop.id, rentMonth: r.rentMonth, kind: r.kind, amount: 0 }]);
                              addToast(`${Calc.shopLabel(shop)} — ${U.monthLabelShort(r.rentMonth)} মাসের ${Calc.shopKindLabel(r.kind)} ${U.bnTaka(r.amount)} মুছে ফেলা হয়েছে।`, 'success');
                            }}>
                            <Trash2 size={12} /> মুছুন
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                  <li>এখন জমা আছে <b>{U.bnTaka(deposit.balance)}</b></li>
                </ul>
              ) : (
                <ul>
                  <li>অ্যাডভান্স ভাড়া নয় — সমিতির কাছে ভাড়াটিয়ার জমা, দোকান ছাড়লে ফেরতযোগ্য।</li>
                  <li>মাসে মাসে ভাড়া থেকে কাটা হলে সেটি "ভাড়া আদায়" ফর্মে "অ্যাডভান্স থেকে সমন্বয়" ঘরে লিখুন।</li>
                  <li>কোনো দোকানের পুরোনো অ্যাডভান্স থাকলে পুরোনো মাস দিয়ে এখানে ঢোকান; আগে কাটা অংশ ঐ মাসগুলোর সমন্বয় হিসেবে "দোকানওয়ারি ভাড়ার হিসাব" ছকে।</li>
                </ul>
              )}
            </div>
          </div>
          )}

          {/* ---- আগে থেকে এন্ট্রি থাকলে সতর্কতা ---- */}
          {hasExisting && (
            <div className="form-warn">
              <AlertTriangle size={18} />
              <div>
                <div>
                  <b>{Calc.shopLabel(shop)}</b>-এর নির্বাচিত মাসে ইতিমধ্যে এন্ট্রি আছে:{' '}
                  {existingLabels.join(', ')}
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
                <span className="s-value">{Calc.shopTenantName(shop, mode === 'deposit' ? depMonth : (fromMonth || paidMonth)) || '—'}</span>
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
                <span className="s-label">{mode === 'deposit' ? (depKind === 'advance' ? 'অ্যাডভান্স গ্রহণ' : 'অ্যাডভান্স ফেরত') : 'নগদ জমা (ভাড়া + বিদ্যুৎ)'}</span>
                <span className="s-value" style={{ color: (mode === 'deposit' ? depNum : rentNum + elecNum) > 0 ? 'var(--success-dark)' : 'var(--text-main)' }}>
                  {U.bnTaka(mode === 'deposit' ? depNum : rentNum + elecNum)}
                </span>
              </div>
              {mode === 'rent' && adjustNum > 0 && (
                <div className="s-item">
                  <span className="s-label">অ্যাডভান্স থেকে ভাড়া সমন্বয়</span>
                  <span className="s-value" style={{ color: 'var(--warning-dark)' }}>{U.bnTaka(adjustNum)}</span>
                </div>
              )}
              {mode === 'rent' && elecAdjustNum > 0 && (
                <div className="s-item">
                  <span className="s-label">অ্যাডভান্স থেকে বিদ্যুৎ বিল</span>
                  <span className="s-value" style={{ color: 'var(--warning-dark)' }}>{U.bnTaka(elecAdjustNum)}</span>
                </div>
              )}
              {deposit && (deposit.received > 0 || deposit.agreed > 0) && (
                <div className="s-item">
                  <span className="s-label">অ্যাডভান্স জমা আছে</span>
                  <span className="s-value" style={{ color: 'var(--warning-dark)' }}>{U.bnTaka(deposit.balance)}</span>
                </div>
              )}
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
            জমার তারিখ ধরা হবে {(mode === 'deposit' ? depMonth : paidMonth) ? U.monthLabel(mode === 'deposit' ? depMonth : paidMonth) : 'জমার'} মাসের শেষ দিন।
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
