import React, { useState, useMemo, useEffect } from 'react';
import {
  Store, Plus, Pencil, Trash2, Save, Printer, AlertTriangle, Check, X,
  Wallet, Inbox, CalendarDays
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import * as Calc from '../utils/calc';
import * as U from '../utils/format';

/* ==========================================================================
   দোকান ভাড়া — আদায়ের এন্ট্রি ও দোকানওয়ারি হিসাব

   দুই রকম মাস:
     ভাড়ার মাস (rentMonth) — কোন মাসের ভাড়া; এর উপর বকেয়ার হিসাব
     জমার মাস  (paidMonth) — কোন মাসের খতিয়ানে টাকাটা উঠল; খতিয়ানের
                            "দোকানের ভাড়া আদায়" সারিটি এই মাস ধরে নিজে বসে
   ========================================================================== */

const KINDS = ['rent', 'electricity', 'other'];

const emptyShop = (serial) => ({
  id: '',
  serial,
  shopNo: '',
  tenantName: '',
  phone: '',
  monthlyRent: '',
  rentHistory: [],
  electricityShare: '',
  active: true,
  joinMonth: U.currentMonth(),
  closedFrom: '',
  note: ''
});

/* --------------------------------------------------------------------------
   দোকানের তথ্যের ফর্ম (নতুন / সম্পাদনা)
   -------------------------------------------------------------------------- */
function ShopForm({ draft, setDraft, onSave, onCancel, monthOptions }) {
  const set = (patch) => setDraft({ ...draft, ...patch });
  const history = draft.rentHistory || [];
  const setHist = (i, patch) =>
    set({ rentHistory: history.map((h, idx) => (idx === i ? { ...h, ...patch } : h)) });

  const field = { marginBottom: '10px' };

  return (
    <div className="card" style={{ padding: '16px', background: '#f8fafc', marginBottom: '16px' }}>
      <div style={{ fontWeight: 700, marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
        <Store size={17} color="var(--primary)" />
        {draft.id ? 'দোকানের তথ্য সম্পাদনা' : 'নতুন দোকান'}
      </div>

      <div className="shop-form-grid">
        <div className="form-group" style={field}>
          <label className="form-label">ক্রমিক</label>
          <input className="form-input" type="number" min="1" value={draft.serial}
            onChange={(e) => set({ serial: e.target.value })} />
        </div>
        <div className="form-group" style={field}>
          <label className="form-label">দোকান নং *</label>
          <input className="form-input" value={draft.shopNo} autoFocus placeholder="যেমন: ২"
            onChange={(e) => set({ shopNo: e.target.value })} />
        </div>
        <div className="form-group" style={field}>
          <label className="form-label">ভাড়াটিয়ার নাম</label>
          <input className="form-input" value={draft.tenantName}
            onChange={(e) => set({ tenantName: e.target.value })} />
        </div>
        <div className="form-group" style={field}>
          <label className="form-label">মোবাইল</label>
          <input className="form-input" value={draft.phone}
            onChange={(e) => set({ phone: e.target.value })} />
        </div>
        <div className="form-group" style={field}>
          <label className="form-label">মাসিক ভাড়া (টাকা) *</label>
          <input className="form-input" type="number" min="0" value={draft.monthlyRent}
            onChange={(e) => set({ monthlyRent: e.target.value })} />
          <div className="form-hint">ভাড়া বদলালে নিচে "ভাড়ার ইতিহাস"-এ কোন মাস থেকে কত, লিখুন।</div>
        </div>
        <div className="form-group" style={field}>
          <label className="form-label">মাসিক বিদ্যুৎ বিলের অংশ</label>
          <input className="form-input" type="number" min="0" value={draft.electricityShare}
            onChange={(e) => set({ electricityShare: e.target.value })} />
          <div className="form-hint">এন্ট্রির ঘরে ডিফল্ট হিসেবে বসে; না থাকলে ০।</div>
        </div>
        <div className="form-group" style={field}>
          <label className="form-label">ভাড়া ধরা শুরু (মাস) *</label>
          <select className="form-input" value={draft.joinMonth}
            onChange={(e) => set({ joinMonth: e.target.value })}>
            {monthOptions.map((m) => <option key={m} value={m}>{U.monthLabel(m)}</option>)}
          </select>
        </div>
        <div className="form-group" style={field}>
          <label className="form-label">ভাড়া বন্ধ (কোন মাস থেকে)</label>
          <select className="form-input" value={draft.closedFrom}
            onChange={(e) => set({ closedFrom: e.target.value })}>
            <option value="">— চালু আছে —</option>
            {monthOptions.map((m) => <option key={m} value={m}>{U.monthLabel(m)}</option>)}
          </select>
        </div>
      </div>

      {/* ভাড়ার ইতিহাস */}
      <div style={{ marginBottom: '10px' }}>
        <label className="form-label">ভাড়ার ইতিহাস (ঐচ্ছিক)</label>
        {history.map((h, i) => (
          <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
            <select className="form-input" value={h.fromMonth || ''} style={{ maxWidth: '220px' }}
              onChange={(e) => setHist(i, { fromMonth: e.target.value })}>
              <option value="">মাস বাছুন</option>
              {monthOptions.map((m) => <option key={m} value={m}>{U.monthLabel(m)} থেকে</option>)}
            </select>
            <input className="form-input" type="number" min="0" value={h.rate ?? ''} placeholder="ভাড়া"
              style={{ width: '140px', textAlign: 'right' }}
              onChange={(e) => setHist(i, { rate: e.target.value })} />
            <button type="button" className="btn-icon" style={{ color: '#dc2626' }} title="বাদ দিন"
              onClick={() => set({ rentHistory: history.filter((_, x) => x !== i) })}>
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-outline btn-sm"
          onClick={() => set({ rentHistory: [...history, { fromMonth: '', rate: '' }] })}>
          <Plus size={14} /> ভাড়া বদলের সারি যোগ করুন
        </button>
      </div>

      <div className="form-group" style={field}>
        <label className="form-label">নোট</label>
        <input className="form-input" value={draft.note}
          onChange={(e) => set({ note: e.target.value })} />
      </div>

      <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px', marginBottom: '14px', cursor: 'pointer' }}>
        <input type="checkbox" checked={draft.active !== false}
          onChange={(e) => set({ active: e.target.checked })} />
        দোকানটি চালু (তালিকা ও রিপোর্টে দেখাবে)
      </label>

      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-outline btn-sm" onClick={onCancel}>
          <X size={14} /> বাতিল
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={onSave}
          disabled={!String(draft.shopNo).trim() || !draft.joinMonth}>
          <Check size={14} /> সেভ করুন
        </button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   পাতা
   -------------------------------------------------------------------------- */
export function ShopRentView({ onOpenPrint }) {
  const { data, selectedMonth, saveShop, deleteShop, saveShopRents } = useData();
  const { isReadOnly } = useAuth();

  const shopsReady = data.shopsReady !== false;
  const shops = useMemo(() => Calc.shopsSorted(data, true), [data]);
  const monthOptions = useMemo(() => Calc.monthOptions(data), [data]);
  const currentMonth = U.currentMonth();
  // বকেয়ার হিসাব গত মাস পর্যন্ত — চলতি মাসের ভাড়া এখনো পাওনা হয়নি
  const dueUpTo = U.addMonths(currentMonth, -1);

  const [selectedShopId, setSelectedShopId] = useState(shops[0]?.id || '');
  const [shopDraft, setShopDraft] = useState(null);
  const [localRows, setLocalRows] = useState({});

  useEffect(() => {
    if (!shops.find((s) => s.id === selectedShopId) && shops.length) setSelectedShopId(shops[0].id);
  }, [shops, selectedShopId]);

  // দোকান বদলালে অসংরক্ষিত ঘরগুলো বাদ
  useEffect(() => { setLocalRows({}); }, [selectedShopId]);

  const shop = shops.find((s) => s.id === selectedShopId) || null;

  const collectors = data.settings.collectors || [];
  const collectorName = (id) => {
    const c = collectors.find((x) => x.id === id);
    return c ? (c.bn || c.en) : '';
  };

  // ---- এ মাসে (জমার মাস) দোকান ভাড়া খাতে কত উঠল ----
  const monthSummary = useMemo(() => Calc.shopRentByPaidMonth(data, selectedMonth), [data, selectedMonth]);
  // সব মাসের তালিকা আলাদা পাতায় — ShopRentMonthlyView (মেনু: মাসভিত্তিক দোকান ভাড়া)

  // ---- নির্বাচিত দোকানের মাসভিত্তিক সারি ----
  const months = useMemo(() => {
    if (!shop) return [];
    const list = [];
    const from = U.monthIndex(Calc.shopStartMonth(shop, data.settings));
    const to = U.monthIndex(currentMonth);
    for (let i = from; i <= to; i += 1) list.push(U.indexToMonth(i));
    return list;
  }, [shop, data.settings, currentMonth]);

  const ledgerRows = useMemo(
    () => (shop ? Calc.shopLedger(data, shop, currentMonth) : []),
    [data, shop, currentMonth]
  );
  const rowByMonth = useMemo(() => {
    const m = {};
    ledgerRows.forEach((r) => { m[r.month] = r; });
    return m;
  }, [ledgerRows]);

  const status = shop ? Calc.shopStatus(data, shop, dueUpTo) : null;

  // সর্বশেষ যিনি এই দোকানের টাকা তুলেছেন — নতুন ঘরে ডিফল্ট
  const lastCollector = useMemo(() => {
    if (!shop) return '';
    const items = Calc.shopRentsOf(data, shop.id)
      .filter((r) => r.collectorId)
      .sort((a, b) => U.monthIndex(b.paidMonth) - U.monthIndex(a.paidMonth));
    return items[0]?.collectorId || '';
  }, [data, shop]);

  const paidMonthOptions = useMemo(() => {
    // জমার মাস: তালিকার সব মাস + চলতি মাসের পরের মাস (মাস শেষের হিসাব আগেই লিখলে)
    const extra = U.addMonths(currentMonth, 1);
    return monthOptions.includes(extra) ? monthOptions : [...monthOptions, extra];
  }, [monthOptions, currentMonth]);

  const baseDraft = (month) => {
    const row = rowByMonth[month];
    const items = row ? row.items : [];
    const pick = (kind) => items.find((r) => r.kind === kind);
    const notes = Array.from(new Set(items.map((r) => r.note).filter(Boolean)));
    const nextMonth = U.addMonths(month, 1);
    return {
      rent: pick('rent') ? String(pick('rent').amount) : '',
      electricity: pick('electricity') ? String(pick('electricity').amount) : '',
      other: pick('other') ? String(pick('other').amount) : '',
      paidMonth: items[0]?.paidMonth || (U.monthIndex(nextMonth) <= U.monthIndex(currentMonth) ? nextMonth : currentMonth),
      collectorId: items[0]?.collectorId || lastCollector,
      note: notes.join('; ')
    };
  };

  const draftFor = (month) => localRows[month] || baseDraft(month);
  const isDirty = (month) => {
    const d = localRows[month];
    if (!d) return false;
    const b = baseDraft(month);
    return KINDS.some((k) => String(d[k] || '') !== String(b[k] || '')) ||
      d.paidMonth !== b.paidMonth || d.collectorId !== b.collectorId || (d.note || '') !== (b.note || '');
  };
  const dirtyMonths = months.filter(isDirty);

  const setField = (month, field, value) =>
    setLocalRows((prev) => ({ ...prev, [month]: { ...draftFor(month), [field]: value } }));

  // একটি মাসের তিন খাত → তিনটি রেকর্ড (০ হলে মুছে যায়)
  const recordsFor = (month) => {
    const d = draftFor(month);
    const rent = Number(d.rent) || 0;
    const electricity = Number(d.electricity) || 0;
    const other = Number(d.other) || 0;
    // নোটটি একটি রেকর্ডেই থাকে — অন্যান্য/সমন্বয় থাকলে সেটিতে (খতিয়ানের
    // লাইনে ঐ লেখাটাই বসে), নইলে ভাড়ায়, নইলে বিদ্যুৎ বিলে
    const noteOn = other > 0 ? 'other' : rent > 0 ? 'rent' : 'electricity';
    const common = {
      shopId: shop.id,
      rentMonth: month,
      paidMonth: d.paidMonth || month,
      collectorId: d.collectorId || '',
      receivedOn: U.monthEndIso(d.paidMonth || month)
    };
    return [
      { ...common, kind: 'rent', amount: rent, note: noteOn === 'rent' ? d.note : '' },
      { ...common, kind: 'electricity', amount: electricity, note: noteOn === 'electricity' ? d.note : '' },
      { ...common, kind: 'other', amount: other, note: noteOn === 'other' ? d.note : '' }
    ];
  };

  const saveMonth = (month) => {
    saveShopRents(recordsFor(month));
    setLocalRows((prev) => { const n = { ...prev }; delete n[month]; return n; });
  };

  const saveAll = () => {
    const recs = dirtyMonths.flatMap(recordsFor);
    if (!recs.length) return;
    saveShopRents(recs);
    setLocalRows({});
  };

  const clearMonth = (month) => {
    if (!window.confirm(`${U.monthLabel(month)} মাসের সব এন্ট্রি মুছে ফেলবেন?`)) return;
    saveShopRents(KINDS.map((kind) => ({ shopId: shop.id, rentMonth: month, kind, amount: 0 })));
    setLocalRows((prev) => { const n = { ...prev }; delete n[month]; return n; });
  };

  // ---- দোকানের তথ্য ----
  const startNewShop = () => setShopDraft(emptyShop(shops.length + 1));
  const startEditShop = () => shop && setShopDraft({
    ...shop,
    monthlyRent: String(shop.monthlyRent || ''),
    electricityShare: String(shop.electricityShare || ''),
    rentHistory: (shop.rentHistory || []).map((h) => ({ ...h }))
  });
  const submitShop = () => {
    const saved = saveShop(shopDraft);
    if (saved) setSelectedShopId(saved.id);
    setShopDraft(null);
  };
  const removeShop = () => {
    if (!shop) return;
    const n = Calc.shopRentsOf(data, shop.id).length;
    if (!window.confirm(
      `${Calc.shopLabel(shop)} মুছে ফেলবেন? এর ${U.bnDigits(n)}টি আদায়ের এন্ট্রিও মুছে যাবে।`
    )) return;
    deleteShop(shop.id);
  };

  const num = (v) => (v ? U.bnNumber(v) : <span style={{ color: '#cbd5e1' }}>—</span>);

  return (
    <div className="page-body">
      {/* শিরোনাম */}
      <div className="card" style={{ marginBottom: '18px' }}>
        <div className="card-header">
          <div>
            <div className="card-title">
              <Store size={18} color="var(--primary)" />
              <span>{U.monthLabel(selectedMonth)} — দোকান ভাড়া আদায় ও হিসাব</span>
            </div>
            <div className="card-sub">
              কোন দোকান থেকে কোন মাসের ভাড়া কত উঠল, এখানে লিখুন। জমার মাস ধরে
              আয়-ব্যয় খতিয়ানে "দোকানের ভাড়া আদায়" সারিটি নিজে থেকেই বসবে।
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {!isReadOnly && shopsReady && (
              <button className="btn btn-outline btn-sm" onClick={startNewShop}>
                <Plus size={15} /> নতুন দোকান
              </button>
            )}
            {onOpenPrint && (
              <button className="btn btn-primary btn-sm" onClick={onOpenPrint}>
                <Printer size={15} /> প্রিন্ট ও PDF
              </button>
            )}
          </div>
        </div>
      </div>

      {!shopsReady && (
        <div className="card" style={{ marginBottom: '18px', borderColor: '#fca5a5' }}>
          <div style={{ padding: '16px', display: 'flex', gap: '12px' }}>
            <AlertTriangle size={20} color="#dc2626" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div style={{ fontWeight: 700, color: '#b91c1c', marginBottom: '4px' }}>
                ডাটাবেজে দোকান ভাড়ার টেবিল এখনো তৈরি হয়নি
              </div>
              <div style={{ color: '#7f1d1d', fontSize: '12.5px' }}>
                Supabase-এর SQL Editor-এ <b>sql/shop-rent.sql</b> ফাইলটি একবার চালিয়ে নিন,
                তারপর পাতাটি রিফ্রেশ করুন। ততক্ষণ এখানে কিছু সেভ হবে না।
              </div>
            </div>
          </div>
        </div>
      )}

      {shopDraft && (
        <ShopForm
          draft={shopDraft}
          setDraft={setShopDraft}
          onSave={submitShop}
          onCancel={() => setShopDraft(null)}
          monthOptions={paidMonthOptions}
        />
      )}

      {/* ১. এ মাসের হিসাবে দোকান ভাড়া খাতে কত উঠল */}
      <div className="card" style={{ marginBottom: '18px' }}>
        <div className="card-header">
          <div className="card-title">
            <Wallet size={17} color="var(--success)" />
            <span>{U.monthLabel(selectedMonth)} মাসের হিসাবে দোকান ভাড়া খাতে জমা</span>
          </div>
          <div style={{ fontWeight: 700, fontSize: '15.5px', color: 'var(--success)' }}>
            ৳{U.bnNumber(monthSummary.totals.total)}
          </div>
        </div>
        <div className="card-body flush">
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '90px' }}>দোকান</th>
                  <th>ভাড়াটিয়া</th>
                  <th>কোন মাসের ভাড়া</th>
                  <th className="amount">ভাড়া</th>
                  <th className="amount">বিদ্যুৎ বিল</th>
                  <th className="amount">অন্যান্য</th>
                  <th className="amount">মোট</th>
                  <th>আদায়কারী</th>
                </tr>
              </thead>
              <tbody>
                {monthSummary.rows.length ? monthSummary.rows.map((r) => (
                  <tr key={r.shop.id}>
                    <td><b>{Calc.shopLabel(r.shop)}</b></td>
                    <td>{r.shop.tenantName || <span style={{ color: '#94a3b8' }}>—</span>}</td>
                    <td style={{ fontSize: '12px' }}>
                      {r.rentMonths.map(U.monthLabelShort).join(', ') || '—'}
                      {r.notes.length > 0 && (
                        <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>
                          {r.notes.join('; ')}
                        </div>
                      )}
                    </td>
                    <td className="amount">{num(r.rent)}</td>
                    <td className="amount">{num(r.electricity)}</td>
                    <td className="amount">{num(r.other)}</td>
                    <td className="amount" style={{ fontWeight: 700, color: 'var(--primary-dark)' }}>{U.bnNumber(r.total)}</td>
                    <td style={{ fontSize: '12px' }}>{r.collectorIds.map(collectorName).filter(Boolean).join(', ') || '—'}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="8" className="empty-state">
                      <div className="empty-state-icon"><Inbox size={24} /></div>
                      <div className="empty-state-title">
                        {U.monthLabel(selectedMonth)} মাসের হিসাবে দোকান ভাড়ার কোনো জমা নেই
                      </div>
                      <p>নিচে দোকান বেছে ভাড়ার মাসের ঘরে টাকা লিখুন, "জমার মাস" ঘরে এই মাসটি বাছুন।</p>
                    </td>
                  </tr>
                )}
              </tbody>
              {monthSummary.rows.length > 0 && (
                <tfoot>
                  <tr style={{ fontWeight: 700, background: 'var(--bg-muted)' }}>
                    <td colSpan="3">মোট ({U.bnDigits(monthSummary.totals.shopCount)} টি দোকান)</td>
                    <td className="amount">{U.bnNumber(monthSummary.totals.rent)}</td>
                    <td className="amount">{U.bnNumber(monthSummary.totals.electricity)}</td>
                    <td className="amount">{U.bnNumber(monthSummary.totals.other)}</td>
                    <td className="amount" style={{ color: 'var(--success)' }}>{U.bnNumber(monthSummary.totals.total)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      {/* ২. দোকান বাছাই */}
      {shops.length > 0 && (
        <div className="shop-pills">
          {shops.map((s) => {
            const st = Calc.shopStatus(data, s, dueUpTo);
            return (
              <button
                key={s.id}
                type="button"
                className={`shop-pill${s.id === selectedShopId ? ' active' : ''}${s.active === false ? ' inactive' : ''}`}
                onClick={() => setSelectedShopId(s.id)}
              >
                <span className="sp-no">{Calc.shopLabel(s)}</span>
                <span className="sp-name">{s.tenantName || 'ভাড়াটিয়ার নাম নেই'}</span>
                <span className={`sp-due${st.due > 0 ? ' has-due' : ''}`}>
                  {st.due > 0 ? `বকেয়া ৳${U.bnNumber(st.due)}` : st.advance > 0 ? `অগ্রীম ৳${U.bnNumber(st.advance)}` : 'বকেয়া নেই'}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {shopsReady && !shops.length && !shopDraft && (
        <div className="card" style={{ padding: '26px', textAlign: 'center', color: '#64748b' }}>
          এখনো কোনো দোকান যোগ করা হয়নি।{' '}
          {!isReadOnly && (
            <button className="link-btn" type="button" onClick={startNewShop}>প্রথম দোকানটি যোগ করুন</button>
          )}
        </div>
      )}

      {shop && status && (
        <>
          {/* ৩. দোকানের তথ্য ও সারসংক্ষেপ */}
          <div className="metrics-grid" style={{ marginBottom: '16px' }}>
            <div className="metric-card primary">
              <div className="metric-label">{Calc.shopLabel(shop)} — মাসিক ভাড়া</div>
              <div className="metric-value" style={{ color: 'var(--primary)' }}>
                {U.bnTaka(Calc.shopRentForMonth(shop, currentMonth))}
              </div>
              <div className="metric-sub">
                {shop.tenantName || 'ভাড়াটিয়ার নাম নেই'}{shop.phone ? ` • ${U.bnDigits(shop.phone)}` : ''}
                {' • '}{U.monthLabelShort(Calc.shopStartMonth(shop, data.settings))} থেকে
                {shop.closedFrom ? ` ${U.monthLabelShort(shop.closedFrom)} পর্যন্ত বন্ধ` : ''}
              </div>
              {!isReadOnly && (
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                  <button className="btn btn-outline btn-sm" onClick={startEditShop}>
                    <Pencil size={13} /> তথ্য বদলান
                  </button>
                  <button className="btn btn-outline btn-sm" style={{ color: '#dc2626' }} onClick={removeShop}>
                    <Trash2 size={13} /> মুছুন
                  </button>
                </div>
              )}
            </div>
            <div className="metric-card success">
              <div className="metric-label">মোট ভাড়া জমা ({U.monthLabelShort(dueUpTo)} পর্যন্ত)</div>
              <div className="metric-value" style={{ color: 'var(--success)' }}>{U.bnTaka(status.paid)}</div>
              <div className="metric-sub">ধার্য {U.bnTaka(status.charged)} • বিদ্যুৎ বিল {U.bnTaka(status.electricity)} (আলাদা)</div>
            </div>
            <div className={`metric-card ${status.due > 0 ? 'danger' : 'warning'}`}>
              <div className="metric-label">{status.due > 0 ? 'বকেয়া ভাড়া' : 'অগ্রীম'} ({U.monthLabelShort(dueUpTo)} পর্যন্ত)</div>
              <div className="metric-value" style={{ color: status.due > 0 ? 'var(--danger)' : 'var(--warning-dark)' }}>
                {U.bnTaka(status.due > 0 ? status.due : status.advance)}
              </div>
              <div className="metric-sub">
                {status.due > 0 && status.monthRate > 0
                  ? `প্রায় ${U.bnDigits(Math.round(status.due / status.monthRate))} মাসের সমতুল্য`
                  : 'সব মাসের ভাড়া পরিশোধিত'}
              </div>
            </div>
          </div>

          {/* ৪. মাসভিত্তিক এন্ট্রি */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <CalendarDays size={17} color="var(--primary)" />
                <span>{Calc.shopLabel(shop)} — মাসভিত্তিক ভাড়ার এন্ট্রি</span>
              </div>
              {!isReadOnly && dirtyMonths.length > 0 && (
                <button className="btn btn-success btn-sm" onClick={saveAll}>
                  <Save size={15} /> সব সেভ করুন ({U.bnDigits(dirtyMonths.length)})
                </button>
              )}
            </div>
            <div className="card-body flush">
              <div className="table-container shop-grid-wrap">
                <table className="data-table shop-grid">
                  <thead>
                    <tr>
                      <th style={{ minWidth: '120px' }}>ভাড়ার মাস</th>
                      <th className="amount">ধার্য</th>
                      <th className="amount">ভাড়া জমা</th>
                      <th className="amount">বিদ্যুৎ বিল</th>
                      <th className="amount">অন্যান্য</th>
                      <th>জমার মাস (খতিয়ান)</th>
                      <th>আদায়কারী</th>
                      <th>নোট</th>
                      <th className="amount">বকেয়া</th>
                      {!isReadOnly && <th style={{ width: '90px' }}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {months.map((m) => {
                      const row = rowByMonth[m];
                      const d = draftFor(m);
                      const dirty = isDirty(m);
                      const hasAny = row && (row.rent || row.electricity || row.other);
                      const isCurrent = m === currentMonth;
                      return (
                        <tr key={m} className={`${dirty ? 'dirty-row' : ''}${hasAny ? ' paid-row' : ''}`}>
                          <td>
                            <b>{U.monthLabel(m)}</b>
                            {isCurrent && <div style={{ fontSize: '10.5px', color: '#64748b' }}>চলতি মাস</div>}
                          </td>
                          <td className="amount">{row && row.charge ? U.bnNumber(row.charge) : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                          {KINDS.map((k) => (
                            <td key={k} className="amount">
                              {isReadOnly ? (
                                num(row ? row[k] : 0)
                              ) : (
                                <input
                                  className="table-input"
                                  type="number"
                                  min="0"
                                  value={d[k]}
                                  placeholder={k === 'rent' && row && row.charge ? String(row.charge) : k === 'electricity' && shop.electricityShare ? String(shop.electricityShare) : '0'}
                                  style={{ textAlign: 'right', minWidth: '84px' }}
                                  onChange={(e) => setField(m, k, e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter' && dirty) saveMonth(m); }}
                                />
                              )}
                            </td>
                          ))}
                          <td>
                            {isReadOnly ? (
                              (row?.paidMonths || []).map(U.monthLabelShort).join(', ') || '—'
                            ) : (
                              <select className="table-input" value={d.paidMonth} style={{ minWidth: '140px' }}
                                onChange={(e) => setField(m, 'paidMonth', e.target.value)}>
                                {paidMonthOptions.map((pm) => (
                                  <option key={pm} value={pm}>{U.monthLabel(pm)}</option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td>
                            {isReadOnly ? (
                              (row?.collectorIds || []).map(collectorName).join(', ') || '—'
                            ) : (
                              <select className="table-input" value={d.collectorId} style={{ minWidth: '150px' }}
                                onChange={(e) => setField(m, 'collectorId', e.target.value)}>
                                <option value="">— আদায়কারী —</option>
                                {collectors.map((c) => (
                                  <option key={c.id} value={c.id}>{c.bn || c.en}</option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td>
                            {isReadOnly ? (d.note || '—') : (
                              <input className="table-input" value={d.note} placeholder="নোট"
                                style={{ minWidth: '140px' }}
                                onChange={(e) => setField(m, 'note', e.target.value)} />
                            )}
                          </td>
                          <td className="amount" style={{ fontWeight: 700 }}>
                            {row && row.balance > 0
                              ? <span style={{ color: 'var(--danger)' }}>{U.bnNumber(row.balance)}</span>
                              : row && row.balance < 0
                                ? <span style={{ color: 'var(--success)' }}>অগ্রীম {U.bnNumber(-row.balance)}</span>
                                : '০'}
                          </td>
                          {!isReadOnly && (
                            <td>
                              <div style={{ display: 'flex', gap: '2px', justifyContent: 'flex-end' }}>
                                {dirty && (
                                  <button className="btn-icon" title="এই মাস সেভ করুন" style={{ color: 'var(--success)' }}
                                    onClick={() => saveMonth(m)}>
                                    <Save size={15} />
                                  </button>
                                )}
                                {hasAny && (
                                  <button className="btn-icon" title="এই মাসের এন্ট্রি মুছুন" style={{ color: '#dc2626' }}
                                    onClick={() => clearMonth(m)}>
                                    <Trash2 size={15} />
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ fontWeight: 700, background: 'var(--bg-muted)' }}>
                      <td>মোট</td>
                      <td className="amount">{U.bnNumber(ledgerRows.reduce((s, r) => s + r.charge, 0))}</td>
                      <td className="amount">{U.bnNumber(ledgerRows.reduce((s, r) => s + r.rent, 0))}</td>
                      <td className="amount">{U.bnNumber(ledgerRows.reduce((s, r) => s + r.electricity, 0))}</td>
                      <td className="amount">{U.bnNumber(ledgerRows.reduce((s, r) => s + r.other, 0))}</td>
                      <td colSpan="3" style={{ fontSize: '11.5px', fontWeight: 400, color: '#64748b' }}>
                        বকেয়া = ধার্য − (ভাড়া + অন্যান্য)। বিদ্যুৎ বিল বকেয়ার হিসাবে ঢোকে না।
                      </td>
                      <td className="amount">
                        {(() => {
                          const last = ledgerRows[ledgerRows.length - 1];
                          const b = last ? last.balance : 0;
                          return b > 0
                            ? <span style={{ color: 'var(--danger)' }}>{U.bnNumber(b)}</span>
                            : b < 0 ? <span style={{ color: 'var(--success)' }}>অগ্রীম {U.bnNumber(-b)}</span> : '০';
                        })()}
                      </td>
                      {!isReadOnly && <td></td>}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
