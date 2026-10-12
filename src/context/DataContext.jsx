import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as U from '../utils/format';
import {
  supabase,
  hasSupabaseConfig,
  flatFromRow,
  flatToRow,
  paymentFromRow,
  paymentToRow,
  ledgerFromRow,
  ledgerToRow,
  shopFromRow,
  shopToRow,
  shopRentFromRow,
  shopRentToRow
} from '../lib/supabase';

const DataContext = createContext();

// ============================================================================
//  ডাটার একমাত্র উৎস — Supabase (PostgreSQL)
//  ব্রাউজারের localStorage বা ক্যাশে কোনো হিসাব রাখা হয় না, তাই Chrome, Edge,
//  Firefox — যে কম্পিউটার বা ফোন থেকেই খুলুন, সবসময় একই ডাটা দেখা যায়।
//
//  পড়া  : সবাই পারে (ভিউ মোড)
//  লেখা : কেবল লগইন করা ব্যবহারকারী — সুরক্ষা ডাটাবেজেই (Row Level Security),
//         তাই ব্রাউজারের কোড বদলেও কেউ হিসাব পাল্টাতে পারবে না।
// ============================================================================

const SCREEN_STYLE = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  padding: '24px',
  background: '#f1f5f9'
};

const newId = (prefix) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export function DataProvider({ children }) {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [session, setSession] = useState(null);
  const [toasts, setToasts] = useState([]);
  // ডিফল্ট মাস = চলতি মাস। আগে '2026-08' হার্ডকোড ছিল, ফলে সময় এগোলে
  // সফটওয়্যার পুরনো মাসেই আটকে থাকত।
  const [selectedMonth, setSelectedMonth] = useState(() => U.currentMonth());

  // কোনো কোনো পাতায় মাস বদলানো অর্থহীন (যেমন ফ্ল্যাটভিত্তিক লেজার —
  // সেটি সবসময় গত মাস পর্যন্ত)। সেই পাতা খোলা থাকলে এখানে মাসটি বসে
  // যায়, আর নেভবারের ড্রপডাউন নিষ্ক্রিয় হয়ে সেই মাসই দেখায়।
  const [monthLock, setMonthLock] = useState(null);

  const canWrite = Boolean(session);

  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const removeToast = (id) => setToasts((prev) => prev.filter((t) => t.id !== id));

  // ---- ডাটাবেজ থেকে সব পড়া ------------------------------------------------
  const loadAll = useCallback(async () => {
    if (!hasSupabaseConfig) {
      setLoadError('Supabase সংযোগের তথ্য (.env) পাওয়া যায়নি।');
      return;
    }
    try {
      const [settingsRes, flatsRes, paymentsRes, ledgerRes, shopsRes, shopRentsRes] = await Promise.all([
        supabase.from('app_settings').select('data').eq('id', 1).single(),
        supabase.from('flats').select('*').order('serial', { ascending: true }),
        // ১০০০ সারির ডিফল্ট সীমা ছাড়িয়ে যাওয়া ঠেকাতে সুস্পষ্ট range
        supabase.from('payments').select('*').range(0, 99999),
        supabase.from('ledger_entries').select('*').range(0, 99999),
        supabase.from('shops').select('*').order('serial', { ascending: true }),
        supabase.from('shop_rents').select('*').range(0, 99999)
      ]);

      if (settingsRes.error) throw settingsRes.error;
      if (flatsRes.error) throw flatsRes.error;
      if (paymentsRes.error) throw paymentsRes.error;

      // ledger_entries টেবিলটি এখনো তৈরি না হয়ে থাকলেও অ্যাপ যেন চালু থাকে —
      // শুধু আয়-ব্যয়ের পাতাটি খালি দেখাবে, বাকি সব আগের মতোই চলবে।
      if (ledgerRes.error) {
        console.warn('ledger_entries পড়া যায়নি (supabase/06_ledger.sql চালানো হয়েছে?):', ledgerRes.error.message);
      }
      // দোকান ভাড়ার টেবিল দুটিও ঐচ্ছিক — sql/shop-rent.sql না চালানো থাকলে
      // কেবল "দোকান ভাড়া" পাতাটি সতর্কবার্তা দেখাবে, বাকি সব চলবে।
      const shopsError = shopsRes.error || shopRentsRes.error;
      if (shopsError) {
        console.warn('shops / shop_rents পড়া যায়নি (sql/shop-rent.sql চালানো হয়েছে?):', shopsError.message);
      }

      setData({
        version: 1,
        settings: settingsRes.data.data,
        flats: (flatsRes.data || []).map(flatFromRow),
        payments: (paymentsRes.data || []).map(paymentFromRow),
        ledgerEntries: ledgerRes.error ? [] : (ledgerRes.data || []).map(ledgerFromRow),
        ledgerReady: !ledgerRes.error,
        shops: shopsError ? [] : (shopsRes.data || []).map(shopFromRow),
        shopRents: shopsError ? [] : (shopRentsRes.data || []).map(shopRentFromRow),
        shopsReady: !shopsError
      });
      setLoadError(null);
    } catch (e) {
      console.error('ডাটাবেজ থেকে ডাটা আনা যায়নি:', e);
      setLoadError(e.message || String(e));
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ট্যাবে ফিরে এলে (শেষ পড়ার অন্তত ১ মিনিট পর) ডাটাবেজ থেকে আবার পড়া।
  // Supabase ড্যাশবোর্ডে SQL চালিয়ে বা অন্য ডিভাইস থেকে এন্ট্রি দিয়ে এলে
  // খোলা ট্যাবটি পুরোনো হিসাব দেখাত, F5 না চাপা পর্যন্ত বোঝার উপায় ছিল না।
  useEffect(() => {
    let last = Date.now();
    const refetch = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (Date.now() - last < 60 * 1000) return;
      last = Date.now();
      loadAll();
    };
    document.addEventListener('visibilitychange', refetch);
    window.addEventListener('focus', refetch);
    return () => {
      document.removeEventListener('visibilitychange', refetch);
      window.removeEventListener('focus', refetch);
    };
  }, [loadAll]);

  // ---- লগইনের অবস্থা ------------------------------------------------------
  useEffect(() => {
    supabase.auth.getSession().then(({ data: d }) => setSession(d.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // ---- লেখার সাধারণ মোড়ক ---------------------------------------------------
  // স্থানীয় অবস্থা সাথে সাথে বদলায় (পর্দা দ্রুত সাড়া দেয়), তারপর ডাটাবেজে লেখা
  // হয়। ব্যর্থ হলে জানিয়ে দিয়ে ডাটাবেজ থেকে আবার পড়া হয়, যাতে পর্দায় কখনো ভুল
  // হিসাব থেকে না যায়।
  const guard = () => {
    if (!canWrite) {
      addToast('পরিবর্তন সংরক্ষণ করতে লগইন করুন।', 'error');
      return false;
    }
    return true;
  };

  const runWrite = async (task, failMessage) => {
    try {
      const { error } = await task();
      if (error) throw error;
      return true;
    } catch (e) {
      console.error(failMessage, e);
      addToast(`${failMessage} (${e.message || e})`, 'error');
      loadAll();
      return false;
    }
  };

  // ---- জমার এন্ট্রি --------------------------------------------------------
  const getPayment = (flatId, month) =>
    data.payments.find((p) => p.flatId === flatId && p.month === month) || null;

  const setPayment = (flatId, month, paymentObj) => {
    if (!guard()) return;
    const existing = data.payments.find((p) => p.flatId === flatId && p.month === month);
    const record = {
      id: existing ? existing.id : newId('p'),
      flatId,
      month,
      amount: Number(paymentObj.amount) || 0,
      collectorId: paymentObj.collectorId || '',
      receivedOn: paymentObj.receivedOn || U.monthEndIso(month),
      note: paymentObj.note || ''
    };

    setData((prev) => {
      const idx = prev.payments.findIndex((p) => p.flatId === flatId && p.month === month);
      const list = [...prev.payments];
      if (idx >= 0) list[idx] = record;
      else list.push(record);
      return { ...prev, payments: list };
    });

    runWrite(
      () => supabase.from('payments').upsert(paymentToRow(record), { onConflict: 'flat_id,month' }),
      'এন্ট্রি সংরক্ষণ করা যায়নি'
    );
  };

  const deletePayment = (flatId, month) => {
    if (!guard()) return;
    setData((prev) => ({
      ...prev,
      payments: prev.payments.filter((p) => !(p.flatId === flatId && p.month === month))
    }));
    runWrite(
      () => supabase.from('payments').delete().eq('flat_id', flatId).eq('month', month),
      'এন্ট্রি মুছে ফেলা যায়নি'
    ).then((ok) => ok && addToast('এন্ট্রি মুছে ফেলা হয়েছে।', 'warning'));
  };

  const bulkSetPayments = (newPaymentsList) => {
    if (!guard()) return;
    const map = new Map(data.payments.map((p) => [`${p.flatId}_${p.month}`, p]));
    const records = newPaymentsList.map((np) => {
      const existing = map.get(`${np.flatId}_${np.month}`);
      return {
        id: existing ? existing.id : newId('p'),
        flatId: np.flatId,
        month: np.month,
        amount: Number(np.amount) || 0,
        collectorId: np.collectorId || (existing ? existing.collectorId : ''),
        receivedOn: np.receivedOn || U.monthEndIso(np.month),
        note: np.note || ''
      };
    });

    setData((prev) => {
      const m = new Map(prev.payments.map((p) => [`${p.flatId}_${p.month}`, p]));
      records.forEach((r) => m.set(`${r.flatId}_${r.month}`, r));
      return { ...prev, payments: Array.from(m.values()) };
    });

    runWrite(
      () =>
        supabase.from('payments').upsert(records.map(paymentToRow), { onConflict: 'flat_id,month' }),
      'এন্ট্রিগুলো সংরক্ষণ করা যায়নি'
    ).then((ok) => ok && addToast('সকল এন্ট্রি সফলভাবে সংরক্ষিত হয়েছে।', 'success'));
  };

  // ---- আয়-ব্যয় খতিয়ান -----------------------------------------------------
  // উপ-লাইন থাকলে শিরোনামের অঙ্ক সবসময় তাদের যোগফল — হাতে বসানো অঙ্ক আর
  // ভেতরের লাইনগুলো কখনো আলাদা হয়ে যেতে পারবে না।
  const normalizeLedger = (e, existing) => {
    const lines = (e.lines || [])
      .filter((l) => (l.text || '').trim() !== '' || Number(l.amount) || l.due)
      .map((l) =>
        l.due
          ? { text: (l.text || '').trim(), amount: 0, due: true }
          : { text: (l.text || '').trim(), amount: Number(l.amount) || 0 }
      );
    return {
      id: existing ? existing.id : e.id || newId('l'),
      month: e.month,
      side: e.side,
      serial: e.serial ?? null,
      title: (e.title || '').trim(),
      lines,
      amount: lines.length
        ? lines.reduce((sum, l) => sum + (l.due ? 0 : l.amount), 0)
        : Number(e.amount) || 0,
      source: e.source || 'manual',
      refId: e.refId || '',
      note: e.note || ''
    };
  };

  const ledgerEntries = (month, side) =>
    (data.ledgerEntries || [])
      .filter((e) => e.month === month && (!side || e.side === side))
      .sort((a, b) => (a.serial ?? 999) - (b.serial ?? 999));

  const setLedgerEntry = (entry) => {
    if (!guard()) return null;
    const existing = (data.ledgerEntries || []).find((x) => x.id === entry.id);
    const record = normalizeLedger(entry, existing);

    setData((prev) => {
      const list = [...(prev.ledgerEntries || [])];
      const idx = list.findIndex((x) => x.id === record.id);
      if (idx >= 0) list[idx] = record;
      else list.push(record);
      return { ...prev, ledgerEntries: list };
    });

    runWrite(
      () => supabase.from('ledger_entries').upsert(ledgerToRow(record), { onConflict: 'id' }),
      'খতিয়ানের সারি সংরক্ষণ করা যায়নি'
    );
    return record;
  };

  const deleteLedgerEntry = (id) => {
    if (!guard()) return;
    setData((prev) => ({
      ...prev,
      ledgerEntries: (prev.ledgerEntries || []).filter((x) => x.id !== id)
    }));
    runWrite(
      () => supabase.from('ledger_entries').delete().eq('id', id),
      'খতিয়ানের সারি মুছে ফেলা যায়নি'
    ).then((ok) => ok && addToast('সারিটি মুছে ফেলা হয়েছে।', 'warning'));
  };

  const bulkSetLedgerEntries = (entries) => {
    if (!guard()) return;
    const byId = new Map((data.ledgerEntries || []).map((x) => [x.id, x]));
    const records = entries.map((e) => normalizeLedger(e, byId.get(e.id)));

    setData((prev) => {
      const m = new Map((prev.ledgerEntries || []).map((x) => [x.id, x]));
      records.forEach((r) => m.set(r.id, r));
      return { ...prev, ledgerEntries: Array.from(m.values()) };
    });

    runWrite(
      () =>
        supabase.from('ledger_entries').upsert(records.map(ledgerToRow), { onConflict: 'id' }),
      'খতিয়ানের সারিগুলো সংরক্ষণ করা যায়নি'
    ).then((ok) => ok && addToast('সারিগুলো সংরক্ষিত হয়েছে।', 'success'));
  };

  // ---- দোকান ও দোকান ভাড়া ---------------------------------------------------
  const normalizeShop = (s, existing) => ({
    id: existing ? existing.id : s.id || newId('shop'),
    serial: Number(s.serial) || (existing ? existing.serial : (data.shops || []).length + 1),
    shopNo: (s.shopNo || '').trim(),
    tenantName: (s.tenantName || '').trim(),
    phone: (s.phone || '').trim(),
    monthlyRent: Number(s.monthlyRent) || 0,
    rentHistory: (Array.isArray(s.rentHistory) ? s.rentHistory : [])
      .filter((h) => h && /^\d{4}-\d{2}$/.test(h.fromMonth || ''))
      .map((h) => ({ fromMonth: h.fromMonth, rate: Number(h.rate) || 0 }))
      .sort((a, b) => U.monthIndex(a.fromMonth) - U.monthIndex(b.fromMonth)),
    electricityShare: Number(s.electricityShare) || 0,
    active: s.active !== false,
    joinMonth: s.joinMonth || '',
    closedFrom: s.closedFrom || '',
    note: (s.note || '').trim()
  });

  const saveShop = (shopData) => {
    if (!guard()) return null;
    const existing = (data.shops || []).find((x) => x.id === shopData.id);
    const record = normalizeShop(shopData, existing);
    setData((prev) => {
      const list = [...(prev.shops || [])];
      const idx = list.findIndex((x) => x.id === record.id);
      if (idx >= 0) list[idx] = record;
      else list.push(record);
      return { ...prev, shops: list };
    });
    runWrite(
      () => supabase.from('shops').upsert(shopToRow(record), { onConflict: 'id' }),
      'দোকানের তথ্য সংরক্ষণ করা যায়নি'
    ).then(
      (ok) =>
        ok &&
        addToast(existing ? 'দোকানের তথ্য হালনাগাদ হয়েছে।' : 'নতুন দোকান যুক্ত হয়েছে।', 'success')
    );
    return record;
  };

  // দোকান মুছলে তার সব আদায়ও মুছে যায় (ডাটাবেজে ON DELETE CASCADE)
  const deleteShop = (shopId) => {
    if (!guard()) return;
    setData((prev) => ({
      ...prev,
      shops: (prev.shops || []).filter((x) => x.id !== shopId),
      shopRents: (prev.shopRents || []).filter((r) => r.shopId !== shopId)
    }));
    runWrite(
      () => supabase.from('shops').delete().eq('id', shopId),
      'দোকান মুছে ফেলা যায়নি'
    ).then((ok) => ok && addToast('দোকান ও তার সব আদায় মুছে ফেলা হয়েছে।', 'warning'));
  };

  // একটি দোকানের একটি মাসের (rentMonth) ভাড়া/বিদ্যুৎ/অন্যান্য — শূন্য অঙ্ক
  // মানে সারিটি মুছে ফেলা; নইলে (shop, rentMonth, kind) ধরে upsert।
  const saveShopRents = (entries) => {
    if (!guard()) return;
    const keyOf = (r) => `${r.shopId}_${r.rentMonth}_${r.kind || 'rent'}`;
    const byKey = new Map((data.shopRents || []).map((r) => [keyOf(r), r]));

    const upserts = [];
    const deleteIds = [];
    entries.forEach((e) => {
      const kind = e.kind || 'rent';
      const existing = byKey.get(`${e.shopId}_${e.rentMonth}_${kind}`);
      const amount = Number(e.amount) || 0;
      if (amount <= 0) {
        if (existing) deleteIds.push(existing.id);
        return;
      }
      upserts.push({
        id: existing ? existing.id : `sr-${e.shopId}-${e.rentMonth}-${kind}`,
        shopId: e.shopId,
        rentMonth: e.rentMonth,
        paidMonth: e.paidMonth || e.rentMonth,
        kind,
        amount,
        collectorId: e.collectorId || '',
        receivedOn: e.receivedOn || U.monthEndIso(e.paidMonth || e.rentMonth),
        note: (e.note || '').trim()
      });
    });
    if (!upserts.length && !deleteIds.length) return;

    setData((prev) => {
      const m = new Map((prev.shopRents || []).map((r) => [r.id, r]));
      deleteIds.forEach((id) => m.delete(id));
      upserts.forEach((r) => m.set(r.id, r));
      return { ...prev, shopRents: Array.from(m.values()) };
    });

    runWrite(async () => {
      if (deleteIds.length) {
        const { error } = await supabase.from('shop_rents').delete().in('id', deleteIds);
        if (error) return { error };
      }
      if (upserts.length) {
        return supabase
          .from('shop_rents')
          .upsert(upserts.map(shopRentToRow), { onConflict: 'shop_id,rent_month,kind' });
      }
      return { error: null };
    }, 'দোকান ভাড়ার এন্ট্রি সংরক্ষণ করা যায়নি').then(
      (ok) => ok && addToast('দোকান ভাড়ার এন্ট্রি সংরক্ষিত হয়েছে।', 'success')
    );
  };

  // ---- ফ্ল্যাট -------------------------------------------------------------
  const updateFlat = (flatId, flatData) => {
    if (!guard()) return;
    const merged = { ...data.flats.find((f) => f.id === flatId), ...flatData, id: flatId };
    setData((prev) => ({
      ...prev,
      flats: prev.flats.map((f) => (f.id === flatId ? merged : f))
    }));
    runWrite(
      () => supabase.from('flats').upsert(flatToRow(merged), { onConflict: 'id' }),
      'ফ্ল্যাটের তথ্য সংরক্ষণ করা যায়নি'
    ).then((ok) => ok && addToast('ফ্ল্যাটের তথ্য হালনাগাদ করা হয়েছে।', 'success'));
  };

  const addFlat = (flatData) => {
    if (!guard()) return;
    const newFlat = {
      id: newId('f'),
      serial: Number(flatData.serial) || data.flats.length + 1,
      flatNo: flatData.flatNo || '',
      ownerName: flatData.ownerName || '',
      openingDue: Number(flatData.openingDue) || 0,
      phone: flatData.phone || '',
      note: flatData.note || '',
      active: flatData.active !== false,
      joinMonth: flatData.joinMonth || '',
      closedFrom: flatData.closedFrom || ''
    };
    setData((prev) => ({ ...prev, flats: [...prev.flats, newFlat] }));
    runWrite(
      () => supabase.from('flats').insert(flatToRow(newFlat)),
      'নতুন ফ্ল্যাট যোগ করা যায়নি'
    ).then((ok) => ok && addToast('নতুন ফ্ল্যাট যুক্ত করা হয়েছে।', 'success'));
  };

  // ---- সেটিংস / আদায়কারী / স্বাক্ষরকারী -------------------------------------
  const saveSettings = (nextSettings, successMessage) => {
    if (!guard()) return;
    setData((prev) => ({ ...prev, settings: nextSettings }));
    runWrite(
      () => supabase.from('app_settings').update({ data: nextSettings }).eq('id', 1),
      'সেটিংস সংরক্ষণ করা যায়নি'
    ).then((ok) => ok && addToast(successMessage, 'success'));
  };

  const updateSettings = (newSettings) =>
    saveSettings({ ...data.settings, ...newSettings }, 'সেটিংস সংরক্ষণ করা হয়েছে।');

  const updateCollectors = (collectors) =>
    saveSettings({ ...data.settings, collectors }, 'আদায়কারী তালিকা সংরক্ষিত হয়েছে।');

  const updateSignatories = (signatories) =>
    saveSettings({ ...data.settings, signatories }, 'স্বাক্ষরকারী তালিকা সংরক্ষিত হয়েছে।');

  // ---- ব্যাকআপ -------------------------------------------------------------
  const exportBackupJson = () => {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
      d.getDate()
    ).padStart(2, '0')}`;
    a.href = url;
    a.download = `nkfms-backup-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addToast('ব্যাকআপ JSON ফাইল ডাউনলোড হয়েছে।', 'success');
  };

  const importBackupJson = async (jsonObj) => {
    if (!guard()) return false;
    if (!jsonObj || !Array.isArray(jsonObj.flats) || !Array.isArray(jsonObj.payments)) {
      addToast('ভুল ফাইল ফরম্যাট। সঠিক JSON ব্যাকআপ ফাইল নির্বাচন করুন।', 'error');
      return false;
    }
    try {
      if (jsonObj.settings) {
        const { error } = await supabase
          .from('app_settings')
          .update({ data: jsonObj.settings })
          .eq('id', 1);
        if (error) throw error;
      }
      const { error: fErr } = await supabase
        .from('flats')
        .upsert(jsonObj.flats.map(flatToRow), { onConflict: 'id' });
      if (fErr) throw fErr;

      // বড় তালিকা ভাগে ভাগে পাঠানো হয়
      const rows = jsonObj.payments.map(paymentToRow);
      for (let i = 0; i < rows.length; i += 200) {
        const { error: pErr } = await supabase
          .from('payments')
          .upsert(rows.slice(i, i + 200), { onConflict: 'flat_id,month' });
        if (pErr) throw pErr;
      }
      // দোকান ও দোকান ভাড়া — ব্যাকআপে থাকলে (পুরোনো ব্যাকআপে নেই)
      if (Array.isArray(jsonObj.shops) && jsonObj.shops.length) {
        const { error: sErr } = await supabase
          .from('shops')
          .upsert(jsonObj.shops.map(shopToRow), { onConflict: 'id' });
        if (sErr) throw sErr;
      }
      if (Array.isArray(jsonObj.shopRents) && jsonObj.shopRents.length) {
        const srows = jsonObj.shopRents.map(shopRentToRow);
        for (let i = 0; i < srows.length; i += 200) {
          const { error: rErr } = await supabase
            .from('shop_rents')
            .upsert(srows.slice(i, i + 200), { onConflict: 'id' });
          if (rErr) throw rErr;
        }
      }
      await loadAll();
      addToast('ব্যাকআপ ফাইল থেকে সকল ডেটা ডাটাবেজে তোলা হয়েছে।', 'success');
      return true;
    } catch (e) {
      console.error('ব্যাকআপ থেকে তোলা যায়নি:', e);
      addToast(`ব্যাকআপ তোলা যায়নি (${e.message || e})`, 'error');
      return false;
    }
  };

  // আগে এটি ডিফল্ট ডাটা বসাত; এখন ডাটাবেজই একমাত্র উৎস, তাই আবার পড়ে নেয়
  const resetToDefault = async () => {
    await loadAll();
    addToast('ডাটাবেজ থেকে সর্বশেষ ডেটা আবার লোড করা হয়েছে।', 'success');
  };

  // ---- পর্দা ---------------------------------------------------------------
  if (loadError) {
    return (
      <div style={SCREEN_STYLE}>
        <div style={{ maxWidth: '540px', textAlign: 'center' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#b91c1c', marginBottom: '10px' }}>
            ডাটাবেজ থেকে ডাটা আনা যায়নি
          </h2>
          <p style={{ fontSize: '14px', color: '#475569', lineHeight: 1.6 }}>
            ইন্টারনেট সংযোগ আছে কিনা দেখুন। সমস্যা থাকলে Supabase প্রজেক্টটি চালু আছে কিনা
            যাচাই করুন।
          </p>
          <pre
            style={{ marginTop: '12px', fontSize: '12px', color: '#64748b', whiteSpace: 'pre-wrap' }}
          >
            {loadError}
          </pre>
          <button onClick={loadAll} className="btn btn-primary" style={{ marginTop: '16px' }}>
            আবার চেষ্টা করুন
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={SCREEN_STYLE}>
        <div style={{ textAlign: 'center', color: '#475569' }}>
          <div style={{ fontSize: '15px', fontWeight: 600 }}>ডাটা লোড হচ্ছে…</div>
          <div style={{ fontSize: '12.5px', marginTop: '6px' }}>ডাটাবেজ থেকে আনা হচ্ছে</div>
        </div>
      </div>
    );
  }

  return (
    <DataContext.Provider
      value={{
        data,
        canWrite,
        reload: loadAll,
        ledgerEntries,
        setLedgerEntry,
        deleteLedgerEntry,
        bulkSetLedgerEntries,
        selectedMonth,
        setSelectedMonth,
        monthLock,
        setMonthLock,
        getPayment,
        setPayment,
        deletePayment,
        bulkSetPayments,
        updateFlat,
        addFlat,
        saveShop,
        deleteShop,
        saveShopRents,
        updateSettings,
        updateCollectors,
        updateSignatories,
        exportBackupJson,
        importBackupJson,
        resetToDefault,
        toasts,
        addToast,
        removeToast
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  return useContext(DataContext);
}
