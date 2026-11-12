import React, { useState, useMemo, useEffect } from 'react';
import {
  Store, Plus, Pencil, Trash2, Save, Printer, AlertTriangle, Check, X,
  Wallet, Inbox, CalendarDays, UserRoundPen
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

// মাসওয়ারি ঘরের খাত — শেষটি অ্যাডভান্স (জামানত) থেকে কাটা, নগদ নয় কিন্তু ভাড়া
// পরিশোধ ধরা হয়। অ্যাডভান্স গ্রহণ/ফেরত এখানে নয় — "দোকান ভাড়া এন্ট্রি ফর্ম"-এ।
const KINDS = ['rent', 'electricity', 'other', 'advance-adjust', 'advance-adjust-elec'];
// shopLedger সারিতে খাতগুলোর ঘরের নাম
// shopLedger সারিতে কোন ঘর কোন খাত (electricity = নগদ + সমন্বয় মোট, তাই নগদটি আলাদা)
const ROW_KEY = {
  rent: 'rent', electricity: 'electricityCash', other: 'other',
  'advance-adjust': 'adjust', 'advance-adjust-elec': 'electricityAdjust'
};

const emptyShop = (serial) => ({
  id: '',
  serial,
  shopNo: '',
  tenantName: '',
  phone: '',
  monthlyRent: '',
  rentHistory: [],
  electricityShare: '',
  advanceAmount: '',
  advanceAdjust: '',
  advanceNote: '',
  tenancies: [],
  active: true,
  joinMonth: U.currentMonth(),
  closedFrom: '',
  note: ''
});

const emptyTenancy = () => ({
  id: `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
  tenantName: '', phone: '', fromMonth: '', toMonth: '', rent: '', advanceAmount: '', advanceAdjust: '', note: ''
});

/* --------------------------------------------------------------------------
   জামানত গ্রহণ — এক লাইনে: চুক্তির অঙ্ক লেখা আছে অথচ গ্রহণের সারি নেই,
   তখন দোকানের ফর্মেই লিখে সেভ করা যায় (নইলে রিপোর্টে কিছুই দেখায় না)
   -------------------------------------------------------------------------- */
function DepositReceiptQuick({ amount, received = 0, existingMonth = '', defaultMonth, monthOptions, collectors, who, onSubmit }) {
  // চুক্তির ঘরে টাইপ চলাকালেই এই ঘর খুলে যায় — তাই ব্যবহারকারী নিজে না বদলানো
  // পর্যন্ত টাকার ঘর চুক্তির অঙ্কের সাথে মিলে চলে (নইলে "2" আটকে থাকত)
  const [amtEdited, setAmtEdited] = useState(null);
  const amt = amtEdited == null ? String(amount || '') : amtEdited;
  const setAmt = setAmtEdited;
  const [month, setMonth] = useState(existingMonth || defaultMonth || U.currentMonth());
  const [collectorId, setCollectorId] = useState(collectors.length === 1 ? collectors[0].id : '');
  const [err, setErr] = useState('');
  const months = monthOptions.includes(month) ? monthOptions : [month, ...monthOptions].sort();
  const submit = () => {
    const n = Number(amt) || 0;
    if (n <= 0) { setErr('টাকার অঙ্ক লিখুন।'); return; }
    if (!month) { setErr('কোন মাসের হিসাবে, বাছুন।'); return; }
    if (!collectorId) { setErr('কে গ্রহণ করলেন, বাছুন।'); return; }
    setErr('');
    onSubmit({ amount: n, month, collectorId });
  };
  return (
    <div style={{ gridColumn: '1 / -1', padding: '8px 10px', border: '1px dashed #f59e0b', borderRadius: '8px', background: '#fffbeb', marginBottom: '10px' }}>
      <div style={{ fontSize: '12px', color: '#b45309', fontWeight: 600 }}>
        {who ? `${who} — ` : ''}
        {received > 0
          ? <>জামানত গ্রহণ লেখা আছে মাত্র {U.bnTaka(received)}, চুক্তির অঙ্ক {U.bnTaka(amount)} — ভুল হলে ঠিক অঙ্ক লিখুন{existingMonth ? ` (${U.monthLabelShort(existingMonth)} মাসের সারিটি বদলে যাবে)` : ''}:</>
          : <>চুক্তির অঙ্ক লেখা আছে, কিন্তু জামানত <u>গ্রহণের</u> এন্ট্রি নেই — খতিয়ান ও রিপোর্টে দেখাবে না। এখানেই লিখুন:</>}
      </div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginTop: '6px' }}>
        <input className="form-input" type="number" min="0" value={amt} style={{ width: '120px', textAlign: 'right' }}
          onChange={(e) => setAmt(e.target.value)} />
        <select className="form-input" value={month} style={{ width: '190px' }} onChange={(e) => setMonth(e.target.value)}>
          {months.map((m) => <option key={m} value={m}>{U.monthLabel(m)} এর হিসাবে</option>)}
        </select>
        <select className="form-input" value={collectorId} style={{ width: '190px' }} onChange={(e) => setCollectorId(e.target.value)}>
          <option value="">— কে গ্রহণ করলেন —</option>
          {collectors.map((c) => <option key={c.id} value={c.id}>{c.bn || c.en}</option>)}
        </select>
        <button type="button" className="btn btn-primary btn-sm" onClick={submit}>
          <Check size={14} /> {received > 0 ? 'ঠিক করে লিখুন' : 'গ্রহণ লিখুন'}
        </button>
      </div>
      <div className="form-hint" style={{ marginTop: '4px' }}>
        এটি সাথে সাথে সেভ হয় (ফর্মের "সেভ করুন" লাগে না)। একই মাসে আগে কোনো গ্রহণ লেখা থাকলে সেটি বদলে যায়, যোগ হয় না।
        আগস্ট-২৫ বা পরের মাস বাছলে ঐ মাসের খতিয়ানে আয় হিসেবে বসবে; তার আগের মাসে কাগজের খতিয়ান, সেখানে বসবে না।
      </div>
      {err && <div className="form-error" style={{ marginTop: '4px' }}>{err}</div>}
    </div>
  );
}

/* --------------------------------------------------------------------------
   দোকানের তথ্যের ফর্ম (নতুন / সম্পাদনা)
   -------------------------------------------------------------------------- */
function ShopForm({ draft, setDraft, onSave, onCancel, monthOptions, depositByTenancy = [], deposit = null, collectors = [], onReceiveDeposit = null }) {
  const set = (patch) => setDraft({ ...draft, ...patch });
  const history = draft.rentHistory || [];
  const setHist = (i, patch) =>
    set({ rentHistory: history.map((h, idx) => (idx === i ? { ...h, ...patch } : h)) });
  // ভাড়াটিয়ার ইতিহাস — থাকলে নাম/শুরু/বন্ধ/অ্যাডভান্সের সাধারণ ঘরগুলো আর ব্যবহৃত হয় না
  const tenancies = draft.tenancies || [];
  const hasTen = tenancies.length > 0;
  const setTen = (i, patch) =>
    set({ tenancies: tenancies.map((t, idx) => (idx === i ? { ...t, ...patch } : t)) });
  // বর্তমান সাধারণ ঘরগুলো থেকে প্রথম ভাড়াটিয়ার সারি
  const startTenancies = () =>
    set({
      tenancies: [{
        ...emptyTenancy(),
        ...(draft.id ? { id: `legacy-${draft.id}` } : {}),
        tenantName: draft.tenantName || '',
        phone: draft.phone || '',
        fromMonth: draft.joinMonth || '',
        toMonth: draft.closedFrom ? U.addMonths(draft.closedFrom, -1) : '',
        rent: draft.monthlyRent || '',
        advanceAmount: draft.advanceAmount || '',
        advanceAdjust: draft.advanceAdjust || '',
        note: draft.advanceNote || ''
      }]
    });

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
        {!hasTen && (
        <div className="form-group" style={field}>
          <label className="form-label">ভাড়াটিয়ার নাম</label>
          <input className="form-input" value={draft.tenantName}
            onChange={(e) => set({ tenantName: e.target.value })} />
        </div>
        )}
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
        {!hasTen && (<>
        <div className="form-group" style={field}>
          <label className="form-label">অ্যাডভান্স (জামানত) — চুক্তির অঙ্ক</label>
          <input className="form-input" type="number" min="0" value={draft.advanceAmount}
            onChange={(e) => set({ advanceAmount: e.target.value })} />
          <div className="form-hint">শুধু তথ্য; আসল গ্রহণ "দোকান ভাড়া এন্ট্রি ফর্ম" → অ্যাডভান্স থেকে লিখুন, বা নিচের ঘরে।</div>
        </div>
        {draft.id && onReceiveDeposit && deposit && deposit.received < Number(draft.advanceAmount) && (
          <DepositReceiptQuick
            key={`dep-${draft.id}`}
            amount={Number(draft.advanceAmount)}
            received={deposit.received}
            existingMonth={(() => { const a = deposit.history.filter((r) => r.kind === 'advance'); return a.length === 1 ? a[0].rentMonth : ''; })()}
            defaultMonth={draft.joinMonth || ''}
            monthOptions={monthOptions}
            collectors={collectors}
            onSubmit={(e) => onReceiveDeposit({ ...e, tenancyId: '' })}
          />
        )}
        <div className="form-group" style={field}>
          <label className="form-label">অ্যাডভান্স থেকে মাসে কত কাটা হবে</label>
          <input className="form-input" type="number" min="0" value={draft.advanceAdjust}
            onChange={(e) => set({ advanceAdjust: e.target.value })} />
          <div className="form-hint">চুক্তি অনুযায়ী; এন্ট্রি ফর্মে ডিফল্ট বসে, বদলানো যায়। ০ = কাটা হয় না।</div>
        </div>
        <div className="form-group" style={field}>
          <label className="form-label">অ্যাডভান্সের শর্ত / মন্তব্য</label>
          <input className="form-input" value={draft.advanceNote} placeholder="যেমন: চুক্তি ০১-০৭-২০২৫, ছাড়লে ফেরত"
            onChange={(e) => set({ advanceNote: e.target.value })} />
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
        </>)}
      </div>

      {/* ভাড়াটিয়ার ইতিহাস — কে কোন মাস থেকে কোন মাস; মাঝের ফাঁক = দোকান ফাঁকা */}
      <div style={{ marginBottom: '12px', padding: '10px 12px', border: '1px dashed #cbd5e1', borderRadius: '8px', background: '#fff' }}>
        <label className="form-label">ভাড়াটিয়ার ইতিহাস {hasTen ? '' : '(ঐচ্ছিক)'}</label>
        <div className="form-hint" style={{ marginBottom: '8px' }}>
          {hasTen
            ? 'এই তালিকাই ভাড়া ধার্যের ভিত্তি: সময়কালের বাইরের মাসে দোকান ফাঁকা — বকেয়া ধরা হয় না। "পর্যন্ত" খালি = এখনো আছেন। ভাড়া খালি রাখলে দোকানের সাধারণ হার।'
            : 'দোকান কখনো ফাঁকা থেকে আবার ভাড়া হলে, বা ভাড়াটিয়া বদলালে এখানে প্রত্যেকের সময়কাল লিখুন। তালিকা থাকলে উপরের নাম/শুরু/বন্ধ/অ্যাডভান্স ঘরগুলোর বদলে এটিই ব্যবহৃত হয়।'}
        </div>
        {tenancies.map((t, i) => (
          <div key={t.id || i} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '6px 8px', alignItems: 'center', marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid #e2e8f0' }}>
            <input className="form-input" value={t.tenantName || ''} placeholder="ভাড়াটিয়ার নাম"
              onChange={(e) => setTen(i, { tenantName: e.target.value })} />
            <input className="form-input" value={t.phone || ''} placeholder="মোবাইল"
              onChange={(e) => setTen(i, { phone: e.target.value })} />
            <select className="form-input" value={t.fromMonth || ''} onChange={(e) => setTen(i, { fromMonth: e.target.value })}>
              <option value="">— হতে * —</option>
              {monthOptions.map((m) => <option key={m} value={m}>{U.monthLabel(m)} হতে</option>)}
            </select>
            <select className="form-input" value={t.toMonth || ''} onChange={(e) => setTen(i, { toMonth: e.target.value })}>
              <option value="">— এখনো আছেন —</option>
              {monthOptions.filter((m) => !t.fromMonth || U.monthIndex(m) >= U.monthIndex(t.fromMonth)).map((m) => (
                <option key={m} value={m}>{U.monthLabel(m)} পর্যন্ত</option>
              ))}
            </select>
            <input className="form-input" type="number" min="0" value={t.rent ?? ''} placeholder="মাসিক ভাড়া"
              style={{ textAlign: 'right' }} onChange={(e) => setTen(i, { rent: e.target.value })} />
            <input className="form-input" type="number" min="0" value={t.advanceAmount ?? ''} placeholder="অ্যাডভান্স (চুক্তি)"
              style={{ textAlign: 'right' }} onChange={(e) => setTen(i, { advanceAmount: e.target.value })} />
            <input className="form-input" type="number" min="0" value={t.advanceAdjust ?? ''} placeholder="মাসে কাটা"
              style={{ textAlign: 'right' }} onChange={(e) => setTen(i, { advanceAdjust: e.target.value })} />
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input className="form-input" value={t.note || ''} placeholder="শর্ত / মন্তব্য" style={{ flex: 1 }}
                onChange={(e) => setTen(i, { note: e.target.value })} />
              <button type="button" className="btn-icon" style={{ color: '#dc2626' }} title="এই ভাড়াটিয়া বাদ দিন"
                onClick={() => set({ tenancies: tenancies.filter((_, x) => x !== i) })}>
                <Trash2 size={15} />
              </button>
            </div>
            {(() => {
              const d = depositByTenancy.find((x) => x.tenancy && x.tenancy.id === t.id);
              if (!draft.id || !onReceiveDeposit || !d || t.toMonth || !(d.received < Number(t.advanceAmount))) return null;
              const adv = d.history.filter((r) => r.kind === 'advance');
              return (
                <DepositReceiptQuick
                  key={`dep-${t.id}`}
                  amount={Number(t.advanceAmount)}
                  received={d.received}
                  existingMonth={adv.length === 1 ? adv[0].rentMonth : ''}
                  defaultMonth={t.fromMonth || ''}
                  monthOptions={monthOptions}
                  collectors={collectors}
                  who={t.tenantName || 'এই ভাড়াটিয়া'}
                  onSubmit={(e) => onReceiveDeposit({ ...e, tenancyId: t.id })}
                />
              );
            })()}
            {/* "পর্যন্ত" বসানো হলো অথচ জামানত বাকি — ফেরত লেখার কথা মনে করিয়ে দেওয়া */}
            {(() => {
              const d = depositByTenancy.find((x) => x.tenancy && x.tenancy.id === t.id);
              if (!t.toMonth || !d || d.balance <= 0) return null;
              return (
                <div style={{ gridColumn: '1 / -1', fontSize: '11.5px', color: '#b91c1c' }}>
                  {t.tenantName || 'এই ভাড়াটিয়া'} {U.monthLabelShort(t.toMonth)}-এ ছেড়ে গেলেও জামানতে <b>{U.bnTaka(d.balance)}</b> জমা আছে —
                  ফেরত দিলে "দোকান ভাড়া এন্ট্রি ফর্ম → অ্যাডভান্স গ্রহণ / ফেরত"-এ লিখুন (নতুন ভাড়াটিয়ার জামানত থেকে দিলেও তা-ই)।
                </div>
              );
            })()}
          </div>
        ))}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {!hasTen && (
            <button type="button" className="btn btn-outline btn-sm" onClick={startTenancies}>
              <Plus size={14} /> উপরের তথ্য থেকে প্রথম ভাড়াটিয়া
            </button>
          )}
          <button type="button" className="btn btn-outline btn-sm"
            onClick={() => set({ tenancies: [...tenancies, emptyTenancy()] })}>
            <Plus size={14} /> {hasTen ? 'নতুন ভাড়াটিয়া যোগ করুন' : 'খালি সারি যোগ করুন'}
          </button>
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
   ভাড়াটিয়া বদল / ছাড়া — এক জায়গা থেকে: আগের ভাড়াটিয়ার শেষ মাস ও জামানত
   ফেরত, নতুন ভাড়াটিয়ার নাম-ভাড়া-শুরুর মাস ও জামানত গ্রহণ। সেভ করলে দোকানের
   ভাড়াটিয়ার ইতিহাস হালনাগাদ হয় আর অ্যাডভান্সের সারিগুলো আদায়ের খাতায় বসে।
   -------------------------------------------------------------------------- */
function TenantChangeForm({ shop, data, monthOptions, collectors, dueUpTo, onSave, onCancel }) {
  const tenancies = Calc.shopTenancies(shop);
  const hasTen = tenancies.length > 0;
  const currentMonth = U.currentMonth();
  // বর্তমান ভাড়াটিয়া — ইতিহাস থাকলে চলমানজন, নইলে দোকানের সাধারণ ঘর থেকে
  const cur = useMemo(() => {
    if (hasTen) {
      const t = Calc.shopCurrentTenancy(shop, currentMonth);
      return t && !t.toMonth ? t : null; // "পর্যন্ত" বসানো থাকলে এখন কেউ নেই
    }
    if (shop.closedFrom && U.monthIndex(shop.closedFrom) <= U.monthIndex(currentMonth)) return null;
    if (!shop.tenantName && !shop.joinMonth) return null;
    return {
      id: '', legacy: true,
      tenantName: shop.tenantName || '', phone: shop.phone || '',
      fromMonth: shop.joinMonth || Calc.shopStartMonth(shop, data.settings), toMonth: '',
      rent: '', advanceAmount: shop.advanceAmount || '', advanceAdjust: shop.advanceAdjust || '', note: shop.advanceNote || ''
    };
  }, [shop, hasTen, currentMonth, data.settings]);
  const curDeposit = useMemo(
    () => (cur ? Calc.shopDeposit(data, shop, undefined, cur.legacy ? undefined : cur) : null),
    [data, shop, cur]
  );
  const curBalance = curDeposit ? curDeposit.balance : 0;

  const [leaving, setLeaving] = useState(!!cur);
  const [toMonth, setToMonth] = useState(dueUpTo);
  const [refundNow, setRefundNow] = useState(curBalance > 0);
  const [refundAmount, setRefundAmount] = useState(curBalance > 0 ? String(curBalance) : '');
  const [refundMonth, setRefundMonth] = useState(currentMonth);
  const [refundCollector, setRefundCollector] = useState(collectors.length === 1 ? collectors[0].id : '');

  const [adding, setAdding] = useState(true);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [fromMonth, setFromMonth] = useState(cur ? U.addMonths(dueUpTo, 1) : currentMonth);
  const [rent, setRent] = useState(String(Calc.shopRentForMonth(shop, currentMonth) || ''));
  const [agreed, setAgreed] = useState('');
  const [received, setReceived] = useState('');
  const [depMonth, setDepMonth] = useState(cur ? U.addMonths(dueUpTo, 1) : currentMonth);
  const [depCollector, setDepCollector] = useState(collectors.length === 1 ? collectors[0].id : '');
  const [monthlyAdjust, setMonthlyAdjust] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  // শেষ মাস বদলালে নতুনজনের শুরু ও জামানতের মাস তার পরের মাসে
  const changeToMonth = (m) => {
    setToMonth(m);
    const next = U.addMonths(m, 1);
    setFromMonth(next);
    setDepMonth(next);
    setRefundMonth(U.monthIndex(next) > U.monthIndex(currentMonth) ? currentMonth : next);
  };

  const n = (v) => Number(v) || 0;
  const inMonths = (m) => (monthOptions.includes(m) ? monthOptions : [m, ...monthOptions].sort());
  const collectorName = (id) => { const c = collectors.find((x) => x.id === id); return c ? (c.bn || c.en) : ''; };

  const submit = () => {
    setError('');
    if (!leaving && !adding) { setError('অন্তত একটি বেছে নিন — আগের ভাড়াটিয়া ছাড়ছেন, বা নতুন ভাড়াটিয়া আসছেন।'); return; }
    if (leaving && cur) {
      if (!toMonth) { setError('আগের ভাড়াটিয়ার শেষ মাস বাছুন।'); return; }
      if (U.monthIndex(toMonth) < U.monthIndex(cur.fromMonth)) { setError('শেষ মাস শুরুর মাসের আগে হতে পারে না।'); return; }
      if (refundNow && n(refundAmount) > 0) {
        if (n(refundAmount) > curBalance) { setError(`জামানতে জমা আছে মাত্র ${U.bnTaka(curBalance)} — এর বেশি ফেরত লেখা যাবে না।`); return; }
        if (!refundCollector) { setError('জামানত কে ফেরত দিলেন, বাছুন।'); return; }
      }
    }
    if (adding) {
      if (!name.trim()) { setError('নতুন ভাড়াটিয়ার নাম লিখুন।'); return; }
      if (!fromMonth) { setError('নতুন ভাড়াটিয়া কোন মাস থেকে, বাছুন।'); return; }
      if (leaving && cur && U.monthIndex(fromMonth) <= U.monthIndex(toMonth)) {
        setError('নতুন ভাড়াটিয়ার শুরুর মাস আগেরজনের শেষ মাসের পরে হতে হবে।'); return;
      }
      if (!leaving && cur) {
        setError(`${cur.tenantName || 'আগের ভাড়াটিয়া'} এখনো চলছেন — একসাথে দুজন থাকতে পারেন না। আগে "ছেড়ে দিচ্ছেন" টিক দিন।`); return;
      }
      // আগে ছেড়ে যাওয়া সবার সময়কালের পরে শুরু হতে হবে
      const lastEnd = tenancies.reduce((m, t) => (t.toMonth && (!m || U.monthIndex(t.toMonth) > U.monthIndex(m)) ? t.toMonth : m), '');
      if (!leaving && lastEnd && U.monthIndex(fromMonth) <= U.monthIndex(lastEnd)) {
        setError(`আগের ভাড়াটিয়া ${U.monthLabelShort(lastEnd)} পর্যন্ত ছিলেন — নতুনজনের শুরু তার পরের মাস থেকে।`); return;
      }
      if (n(received) > 0 && !depCollector) { setError('জামানত কে গ্রহণ করলেন, বাছুন।'); return; }
    }

    // ---- ভাড়াটিয়ার ইতিহাস ----
    let list = tenancies.map((t) => { const c = { ...t }; delete c.legacy; return c; });
    let oldId = cur && !cur.legacy ? cur.id : '';
    if (!hasTen && cur) {
      // সাধারণ ঘরের তথ্য থেকে প্রথম সারি; ভাড়া খালি = দোকানের হার/ইতিহাস যেমন ছিল
      oldId = emptyTenancy().id;
      const first = { ...cur, id: oldId, rent: '' };
      delete first.legacy;
      list = [first];
    }
    if (leaving && cur) list = list.map((t) => (t.id === oldId ? { ...t, toMonth } : t));
    let newId = '';
    if (adding) {
      newId = emptyTenancy().id;
      list.push({
        id: newId, tenantName: name.trim(), phone: phone.trim(), fromMonth, toMonth: '',
        rent: n(rent) > 0 ? n(rent) : '',
        advanceAmount: n(agreed) > 0 ? n(agreed) : (n(received) > 0 ? n(received) : ''),
        advanceAdjust: n(monthlyAdjust) > 0 ? n(monthlyAdjust) : '',
        note: note.trim()
      });
    }
    const shopPatch = {
      ...shop,
      tenancies: list,
      tenantName: adding ? name.trim() : (leaving ? '' : shop.tenantName),
      phone: adding ? phone.trim() : (leaving ? '' : shop.phone),
      closedFrom: ''
    };

    // ---- অ্যাডভান্সের সারি (একই মাসে একই খাতের সারি থাকলে তার সাথে যোগ) ----
    const rents = [];
    const existing = (m, kind) => (data.shopRents || []).find((r) => r.shopId === shop.id && r.rentMonth === m && r.kind === kind);
    if (leaving && cur && refundNow && n(refundAmount) > 0) {
      const ex = existing(refundMonth, 'advance-refund');
      rents.push({
        shopId: shop.id, rentMonth: refundMonth, paidMonth: refundMonth, kind: 'advance-refund',
        amount: n(refundAmount) + (ex ? n(ex.amount) : 0), collectorId: refundCollector, tenancyId: oldId,
        note: `${cur.tenantName || 'আগের ভাড়াটিয়া'}-কে দোকান ছাড়ায় জামানতের বাকি ফেরত`
      });
    }
    if (adding && n(received) > 0) {
      const ex = existing(depMonth, 'advance');
      rents.push({
        shopId: shop.id, rentMonth: depMonth, paidMonth: depMonth, kind: 'advance',
        amount: n(received) + (ex ? n(ex.amount) : 0), collectorId: depCollector, tenancyId: newId,
        note: 'নতুন ভাড়াটিয়ার জামানত'
      });
    }
    onSave(shopPatch, rents);
  };

  const field = { marginBottom: '10px' };
  const box = (on) => ({
    padding: '10px 12px', border: '1px solid ' + (on ? '#cbd5e1' : '#e2e8f0'), borderRadius: '8px',
    background: on ? '#fff' : '#f1f5f9', marginBottom: '12px', opacity: on ? 1 : 0.75
  });

  return (
    <div className="card" style={{ padding: '16px', background: '#f8fafc', marginBottom: '16px' }}>
      <div style={{ fontWeight: 700, marginBottom: '6px', display: 'flex', gap: '8px', alignItems: 'center' }}>
        <Store size={17} color="var(--primary)" />
        {Calc.shopLabel(shop)} — ভাড়াটিয়া বদল / ছাড়া
      </div>
      <div className="form-hint" style={{ marginBottom: '12px' }}>
        আগের ভাড়াটিয়ার শেষ মাসের পর তাঁর ভাড়া আর ধরা হবে না; নতুন ভাড়াটিয়ার শুরুর মাস থেকে তাঁর হারে ধার্য হবে।
        মাঝে ফাঁক থাকলে দোকান ফাঁকা। জামানত গ্রহণ/ফেরত লিখলে তা ঐ মাসের খতিয়ানে নিজে বসবে।
      </div>

      {/* ক. আগের ভাড়াটিয়া */}
      <div style={box(leaving && cur)}>
        <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontWeight: 600, cursor: cur ? 'pointer' : 'default' }}>
          <input type="checkbox" checked={leaving && !!cur} disabled={!cur} onChange={(e) => setLeaving(e.target.checked)} />
          {cur
            ? <span>আগের ভাড়াটিয়া <b>{cur.tenantName || 'নামহীন'}</b> ({U.monthLabelShort(cur.fromMonth)} হতে) ছেড়ে দিচ্ছেন</span>
            : 'এখন কোনো ভাড়াটিয়া নেই (দোকান ফাঁকা)'}
        </label>
        {leaving && cur && (
          <div className="shop-form-grid" style={{ marginTop: '10px' }}>
            <div className="form-group" style={field}>
              <label className="form-label">শেষ মাস (এ মাস পর্যন্ত ভাড়া ধার্য) *</label>
              <select className="form-input" value={toMonth} onChange={(e) => changeToMonth(e.target.value)}>
                {inMonths(toMonth).filter((m) => U.monthIndex(m) >= U.monthIndex(cur.fromMonth)).map((m) => (
                  <option key={m} value={m}>{U.monthLabel(m)} পর্যন্ত</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={field}>
              <label className="form-label">জামানত জমা আছে</label>
              <div className="form-input is-auto" style={{ fontWeight: 700, color: curBalance > 0 ? 'var(--warning-dark)' : '#64748b' }}>
                {U.bnTaka(curBalance)}
              </div>
              {curDeposit && (curDeposit.received > 0 || curDeposit.refunded > 0) && (
                <div className="form-hint">
                  গ্রহণ {U.bnTaka(curDeposit.received)} − সমন্বয় {U.bnTaka(curDeposit.adjusted)} − ফেরত {U.bnTaka(curDeposit.refunded)}
                </div>
              )}
            </div>
            {curBalance > 0 && (
              <div className="form-group" style={{ ...field, gridColumn: '1 / -1' }}>
                <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={refundNow} onChange={(e) => setRefundNow(e.target.checked)} />
                  জামানতের বাকি এখনই ফেরত দেওয়া হচ্ছে (না দিলে পরে "দোকান ভাড়া এন্ট্রি ফর্ম → অ্যাডভান্স ফেরত"-এ লিখবেন)
                </label>
              </div>
            )}
            {curBalance > 0 && refundNow && (
              <div className="form-group" style={field}>
                <label className="form-label">ফেরত টাকা</label>
                <input className="form-input" type="number" min="0" max={curBalance} value={refundAmount} style={{ textAlign: 'right' }}
                  onChange={(e) => setRefundAmount(e.target.value)} />
                <div className="form-hint">নতুন ভাড়াটিয়ার জামানত থেকে দিলেও এখানেই লিখুন — খতিয়ানে খরচ হিসেবে বসবে।</div>
              </div>
            )}
            {curBalance > 0 && refundNow && (
              <div className="form-group" style={field}>
                <label className="form-label">কোন মাসের হিসাবে</label>
                <select className="form-input" value={refundMonth} onChange={(e) => setRefundMonth(e.target.value)}>
                  {inMonths(refundMonth).map((m) => <option key={m} value={m}>{U.monthLabel(m)}</option>)}
                </select>
              </div>
            )}
            {curBalance > 0 && refundNow && (
              <div className="form-group" style={field}>
                <label className="form-label">কে ফেরত দিলেন</label>
                <select className="form-input" value={refundCollector} onChange={(e) => setRefundCollector(e.target.value)}>
                  <option value="">— বাছুন —</option>
                  {collectors.map((c) => <option key={c.id} value={c.id}>{c.bn || c.en}</option>)}
                </select>
              </div>
            )}
          </div>
        )}
      </div>

      {/* খ. নতুন ভাড়াটিয়া */}
      <div style={box(adding)}>
        <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontWeight: 600, cursor: 'pointer' }}>
          <input type="checkbox" checked={adding} onChange={(e) => setAdding(e.target.checked)} />
          নতুন ভাড়াটিয়া আসছেন
        </label>
        {adding && (
          <div className="shop-form-grid" style={{ marginTop: '10px' }}>
            <div className="form-group" style={field}>
              <label className="form-label">ভাড়াটিয়ার নাম *</label>
              <input className="form-input" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="form-group" style={field}>
              <label className="form-label">মোবাইল</label>
              <input className="form-input" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="form-group" style={field}>
              <label className="form-label">কোন মাস থেকে *</label>
              <select className="form-input" value={fromMonth} onChange={(e) => { setFromMonth(e.target.value); setDepMonth(e.target.value); }}>
                {inMonths(fromMonth).map((m) => <option key={m} value={m}>{U.monthLabel(m)} হতে</option>)}
              </select>
            </div>
            <div className="form-group" style={field}>
              <label className="form-label">মাসিক ভাড়া (টাকা)</label>
              <input className="form-input" type="number" min="0" value={rent} style={{ textAlign: 'right' }} onChange={(e) => setRent(e.target.value)} />
              <div className="form-hint">খালি রাখলে দোকানের সাধারণ হার।</div>
            </div>
            <div className="form-group" style={field}>
              <label className="form-label">জামানত — চুক্তির অঙ্ক</label>
              <input className="form-input" type="number" min="0" value={agreed} style={{ textAlign: 'right' }}
                onChange={(e) => { if (!received || received === agreed) setReceived(e.target.value); setAgreed(e.target.value); }} />
            </div>
            <div className="form-group" style={field}>
              <label className="form-label">জামানত নগদে গ্রহণ (টাকা)</label>
              <input className="form-input" type="number" min="0" value={received} style={{ textAlign: 'right' }} onChange={(e) => setReceived(e.target.value)} />
              <div className="form-hint">০ রাখলে এখন গ্রহণের সারি বসবে না; পরে এন্ট্রি ফর্ম থেকে লেখা যাবে।</div>
            </div>
            {n(received) > 0 && (
              <div className="form-group" style={field}>
                <label className="form-label">কোন মাসের হিসাবে গ্রহণ</label>
                <select className="form-input" value={depMonth} onChange={(e) => setDepMonth(e.target.value)}>
                  {inMonths(depMonth).map((m) => <option key={m} value={m}>{U.monthLabel(m)}</option>)}
                </select>
              </div>
            )}
            {n(received) > 0 && (
              <div className="form-group" style={field}>
                <label className="form-label">কে গ্রহণ করলেন *</label>
                <select className="form-input" value={depCollector} onChange={(e) => setDepCollector(e.target.value)}>
                  <option value="">— বাছুন —</option>
                  {collectors.map((c) => <option key={c.id} value={c.id}>{c.bn || c.en}</option>)}
                </select>
              </div>
            )}
            <div className="form-group" style={field}>
              <label className="form-label">জামানত থেকে মাসে কত কাটা হবে</label>
              <input className="form-input" type="number" min="0" value={monthlyAdjust} style={{ textAlign: 'right' }} onChange={(e) => setMonthlyAdjust(e.target.value)} />
              <div className="form-hint">০ = কাটা হয় না, ভাড়া নগদে।</div>
            </div>
            <div className="form-group" style={field}>
              <label className="form-label">শর্ত / মন্তব্য</label>
              <input className="form-input" value={note} placeholder="যেমন: চুক্তি ০১-১১-২০২৬, ছাড়লে ফেরত" onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
        )}
      </div>

      {/* সারাংশ — সেভ করলে কী হবে */}
      <div style={{ fontSize: '12.5px', color: '#334155', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px' }}>
        <b>সেভ করলে:</b>
        <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
          {leaving && cur && <li>{cur.tenantName || 'আগের ভাড়াটিয়া'} — {U.monthLabelShort(toMonth)} পর্যন্ত; এরপর তাঁর ভাড়া ধরা হবে না।</li>}
          {leaving && cur && refundNow && n(refundAmount) > 0 && (
            <li>{U.monthLabel(refundMonth)} মাসের খতিয়ানে জামানত ফেরত {U.bnTaka(n(refundAmount))} (খরচ){refundCollector ? `, ${collectorName(refundCollector)}` : ''}।</li>
          )}
          {leaving && cur && curBalance > 0 && !(refundNow && n(refundAmount) > 0) && (
            <li style={{ color: '#b91c1c' }}>জামানতের {U.bnTaka(curBalance)} ফেরত বাকি থাকবে — পরে এন্ট্রি ফর্মে লিখবেন।</li>
          )}
          {adding && (
            <li>{name.trim() || 'নতুন ভাড়াটিয়া'} — {U.monthLabelShort(fromMonth)} হতে{n(rent) > 0 ? `, মাসিক ভাড়া ${U.bnTaka(n(rent))}` : ''}{n(agreed) > 0 ? `, জামানত চুক্তি ${U.bnTaka(n(agreed))}` : ''}।</li>
          )}
          {adding && n(received) > 0 && (
            <li>{U.monthLabel(depMonth)} মাসের খতিয়ানে জামানত গ্রহণ {U.bnTaka(n(received))} (আয়){depCollector ? `, ${collectorName(depCollector)}` : ''}।</li>
          )}
          {leaving && cur && !adding && <li>{U.monthLabelShort(U.addMonths(toMonth, 1))} হতে দোকান ফাঁকা — বকেয়া ধরা হবে না।</li>}
          {!leaving && !adding && <li>কিছুই বদলাবে না।</li>}
        </ul>
      </div>

      {error && <div className="form-error" style={{ marginBottom: '10px' }}>{error}</div>}

      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-outline btn-sm" onClick={onCancel}>
          <X size={14} /> বাতিল
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={submit}>
          <Check size={14} /> সেভ করুন
        </button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   পাতা
   -------------------------------------------------------------------------- */
// দুই পাতার মাঝে একই দোকান বাছাই থাকে (মেনু বদলালেও)
let lastSelectedShopId = '';

/**
 * mode = 'manage' — দোকানের তথ্য, সারসংক্ষেপ, ভাড়াটিয়া বদল (ডিফল্ট)
 * mode = 'entry'  — কেবল মাসভিত্তিক ভাড়ার এন্ট্রির ছক (আলাদা মেনু)
 */
export function ShopRentView({ onOpenPrint, onOpenShopLedger, onOpenMonthlyEntry, mode = 'manage' }) {
  const isEntry = mode === 'entry';
  const { data, selectedMonth, saveShop, deleteShop, saveShopRents, addToast } = useData();
  const { isReadOnly } = useAuth();

  const shopsReady = data.shopsReady !== false;
  const shops = useMemo(() => Calc.shopsSorted(data, true), [data]);
  const monthOptions = useMemo(() => Calc.monthOptions(data), [data]);
  const currentMonth = U.currentMonth();
  // বকেয়ার হিসাব গত মাস পর্যন্ত — চলতি মাসের ভাড়া এখনো পাওনা হয়নি
  const dueUpTo = U.addMonths(currentMonth, -1);

  const [selectedShopId, setSelectedShopIdState] = useState(
    () => (shops.find((s2) => s2.id === lastSelectedShopId) || shops[0] || {}).id || ''
  );
  const setSelectedShopId = (id) => { lastSelectedShopId = id; setSelectedShopIdState(id); };
  const [shopDraft, setShopDraft] = useState(null);
  const [tenantChange, setTenantChange] = useState(false);
  const [localRows, setLocalRows] = useState({});

  useEffect(() => {
    if (!shops.find((s) => s.id === selectedShopId) && shops.length) setSelectedShopId(shops[0].id);
  }, [shops, selectedShopId]);

  // দোকান বদলালে অসংরক্ষিত ঘরগুলো বাদ
  useEffect(() => { setLocalRows({}); setTenantChange(false); }, [selectedShopId]);

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
    // এই ঘরগুলোর খাত শুধু — অ্যাডভান্স গ্রহণ/ফেরতের সারি এখানে নয়
    const items = row ? row.items.filter((r) => KINDS.includes(r.kind)) : [];
    const pick = (kind) => items.find((r) => r.kind === kind);
    const notes = Array.from(new Set(items.map((r) => r.note).filter(Boolean)));
    const nextMonth = U.addMonths(month, 1);
    return {
      rent: pick('rent') ? String(pick('rent').amount) : '',
      electricity: pick('electricity') ? String(pick('electricity').amount) : '',
      other: pick('other') ? String(pick('other').amount) : '',
      'advance-adjust': pick('advance-adjust') ? String(pick('advance-adjust').amount) : '',
      'advance-adjust-elec': pick('advance-adjust-elec') ? String(pick('advance-adjust-elec').amount) : '',
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
    const adjust = Number(d['advance-adjust']) || 0;
    const elecAdjust = Number(d['advance-adjust-elec']) || 0;
    // নোটটি একটি রেকর্ডেই থাকে — অন্যান্য/সমন্বয় থাকলে সেটিতে (খতিয়ানের
    // লাইনে ঐ লেখাটাই বসে), নইলে ভাড়ায়, নইলে বিদ্যুৎ বিলে, নইলে অ্যাডভান্স সমন্বয়ে
    const noteOn = other > 0 ? 'other' : rent > 0 ? 'rent' : electricity > 0 ? 'electricity' : 'advance-adjust';
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
      { ...common, kind: 'other', amount: other, note: noteOn === 'other' ? d.note : '' },
      { ...common, kind: 'advance-adjust', amount: adjust, note: noteOn === 'advance-adjust' ? d.note : '' },
      { ...common, kind: 'advance-adjust-elec', amount: elecAdjust, note: '' }
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
    advanceAmount: String(shop.advanceAmount || ''),
    advanceAdjust: String(shop.advanceAdjust || ''),
    advanceNote: shop.advanceNote || '',
    rentHistory: (shop.rentHistory || []).map((h) => ({ ...h })),
    tenancies: (shop.tenancies || []).map((t) => ({ ...t }))
  });
  const submitShop = () => {
    const saved = saveShop(shopDraft);
    if (saved) setSelectedShopId(saved.id);
    setShopDraft(null);
  };
  // ভাড়াটিয়া বদল — দোকানের ইতিহাস ও অ্যাডভান্সের সারি একসাথে
  const submitTenantChange = (shopPatch, rents) => {
    const saved = saveShop(shopPatch);
    if (!saved) return;
    if (rents.length) saveShopRents(rents);
    addToast(`${Calc.shopLabel(saved)} — ভাড়াটিয়ার তথ্য হালনাগাদ হয়েছে।`, 'success');
    setTenantChange(false);
  };
  // দোকানের ফর্ম থেকে জামানত গ্রহণ — সাথে সাথে সেভ (ফর্ম সেভের উপর নির্ভর নয়)
  const receiveDeposit = ({ amount, month, collectorId, tenancyId }) => {
    if (!shop) return;
    saveShopRents([{
      shopId: shop.id, rentMonth: month, paidMonth: month, kind: 'advance', amount,
      collectorId, tenancyId: tenancyId || '', note: 'জামানত গ্রহণ'
    }]);
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
              {isEntry ? <CalendarDays size={18} color="var(--primary)" /> : <Store size={18} color="var(--primary)" />}
              <span>{isEntry ? 'দোকান ভাড়া — মাসভিত্তিক এন্ট্রি' : `${U.monthLabel(selectedMonth)} — দোকান ভাড়া আদায় ও হিসাব`}</span>
            </div>
            <div className="card-sub">
              {isEntry
                ? 'দোকান বেছে নিচের ছকে প্রতিটি মাসের ভাড়া, বিদ্যুৎ বিল বা অ্যাডভান্স থেকে সমন্বয় লিখে সেভ করুন। জমার মাস ধরে আয়-ব্যয় খতিয়ানে "দোকানের ভাড়া আদায়" সারিটি নিজে থেকেই বসবে।'
                : 'দোকানের তথ্য, ভাড়াটিয়া, জামানত ও বকেয়ার সারসংক্ষেপ। মাসওয়ারি ভাড়া লিখতে "মাসভিত্তিক এন্ট্রি" পাতায় যান।'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {!isReadOnly && shopsReady && !isEntry && (
              <button className="btn btn-outline btn-sm" onClick={startNewShop}>
                <Plus size={15} /> নতুন দোকান
              </button>
            )}
            {!isEntry && onOpenMonthlyEntry && shop && (
              <button className="btn btn-outline btn-sm" onClick={onOpenMonthlyEntry} title="নির্বাচিত দোকানের মাসওয়ারি ভাড়ার এন্ট্রি">
                <CalendarDays size={15} /> মাসভিত্তিক এন্ট্রি
              </button>
            )}
            {onOpenShopLedger && shop && (
              <button className="btn btn-outline btn-sm" onClick={() => onOpenShopLedger(shop.id)} title="নির্বাচিত দোকানের মাসওয়ারি খতিয়ান ছাপুন">
                <Printer size={15} /> {Calc.shopLabel(shop)}-এর খতিয়ান
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

      {tenantChange && shop && !shopDraft && (
        <TenantChangeForm
          key={shop.id}
          shop={shop}
          data={data}
          monthOptions={paidMonthOptions}
          collectors={collectors}
          dueUpTo={dueUpTo}
          onSave={submitTenantChange}
          onCancel={() => setTenantChange(false)}
        />
      )}

      {shopDraft && (
        <ShopForm
          draft={shopDraft}
          setDraft={setShopDraft}
          onSave={submitShop}
          onCancel={() => setShopDraft(null)}
          monthOptions={paidMonthOptions}
          depositByTenancy={shopDraft.id && shop && shop.id === shopDraft.id ? Calc.shopDepositByTenancy(data, shop) : []}
          deposit={shopDraft.id && shop && shop.id === shopDraft.id ? Calc.shopDeposit(data, shop) : null}
          collectors={collectors}
          onReceiveDeposit={shopDraft.id && shop && shop.id === shopDraft.id ? receiveDeposit : null}
        />
      )}

      {/* ১. দোকান বাছাই */}
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
                <span className="sp-top">
                  <span className="sp-no">{Calc.shopLabel(s)}</span>
                  <span className="sp-rent">৳{U.bnNumber(Calc.shopRentForMonth(s, currentMonth))}/মাস</span>
                </span>
                <span className="sp-name">
                  {Calc.shopTenantName(s) || (Calc.shopTenancies(s).length && !Calc.shopTenancyFor(s, currentMonth) ? 'এখন ফাঁকা' : 'ভাড়াটিয়ার নাম নেই')}
                </span>
                <span className={`sp-due${st.due > 0 ? ' has-due' : st.advance > 0 ? ' has-adv' : ''}`}>
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
          {/* ২. দোকানের তথ্য ও সারসংক্ষেপ — কেবল হিসাবের পাতায় */}
          {!isEntry && (
          <div className="metrics-grid" style={{ marginBottom: '16px' }}>
            <div className="metric-card primary">
              <div className="metric-label">{Calc.shopLabel(shop)} — মাসিক ভাড়া</div>
              <div className="metric-value" style={{ color: 'var(--primary)' }}>
                {U.bnTaka(Calc.shopRentForMonth(shop, currentMonth))}
              </div>
              <div className="metric-sub">
                {Calc.shopTenancies(shop).length ? (
                  <>
                    {/* ভাড়াটিয়ার ইতিহাস — প্রত্যেকের সময়কাল, মাঝে ফাঁকা মাস */}
                    {Calc.shopTenancies(shop).map((t, i) => (
                      <div key={t.id || i}>
                        {t.tenantName || 'নামহীন'}{t.phone ? ` • ${U.bnDigits(t.phone)}` : ''}
                        {' — '}{U.monthLabelShort(t.fromMonth)} হতে {t.toMonth ? U.monthLabelShort(t.toMonth) : 'চলছে'}
                        {Number(t.rent) > 0 ? ` • ভাড়া ${U.bnTaka(t.rent)}` : ''}
                        {Number(t.advanceAmount) > 0 ? ` • অ্যাডভান্স ${U.bnTaka(t.advanceAmount)}` : ''}
                      </div>
                    ))}
                    {(() => {
                      const vac = Calc.shopVacantMonths(shop, data.settings, currentMonth);
                      return vac.length
                        ? <div style={{ color: '#b45309' }}>ফাঁকা ছিল {U.bnDigits(vac.length)} মাস: {vac.slice(0, 6).map(U.monthLabelShort).join(', ')}{vac.length > 6 ? ' …' : ''} — বকেয়া নয়</div>
                        : null;
                    })()}
                  </>
                ) : (
                  <>
                    {shop.tenantName || 'ভাড়াটিয়ার নাম নেই'}{shop.phone ? ` • ${U.bnDigits(shop.phone)}` : ''}
                    {' • '}{U.monthLabelShort(Calc.shopStartMonth(shop, data.settings))} থেকে
                    {shop.closedFrom ? ` ${U.monthLabelShort(shop.closedFrom)} পর্যন্ত বন্ধ` : ''}
                  </>
                )}
              </div>
              {!isReadOnly && (
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                  <button className="btn btn-outline btn-sm" onClick={() => { setTenantChange(false); startEditShop(); }}>
                    <Pencil size={13} /> তথ্য বদলান
                  </button>
                  <button className="btn btn-outline btn-sm" onClick={() => { setShopDraft(null); setTenantChange(true); }}
                    title="আগের ভাড়াটিয়া ছাড়ছেন / নতুন ভাড়াটিয়া আসছেন — জামানতসহ">
                    <UserRoundPen size={13} /> ভাড়াটিয়া বদল
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
              <div className="metric-sub">
                ধার্য {U.bnTaka(status.charged)} • বিদ্যুৎ বিল {U.bnTaka(status.electricity)} (আলাদা
                {status.electricityAdjust > 0 ? `, এর ${U.bnTaka(status.electricityAdjust)} অ্যাডভান্স থেকে` : ''})
              </div>
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
                {status.paidAdjust > 0 && ` • অ্যাডভান্স থেকে সমন্বয় ${U.bnTaka(status.paidAdjust)}`}
              </div>
            </div>
            {/* অ্যাডভান্স (জামানত) — চুক্তিতে থাকলে বা কখনো নেওয়া হলে */}
            {(() => {
              const dep = Calc.shopDeposit(data, shop);
              if (!(dep.received || dep.agreed || dep.refunded)) return null;
              return (
                <div className="metric-card warning">
                  <div className="metric-label">অ্যাডভান্স (জামানত) জমা আছে</div>
                  <div className="metric-value" style={{ color: 'var(--warning-dark)' }}>{U.bnTaka(dep.balance)}</div>
                  <div className="metric-sub">
                    গ্রহণ {U.bnTaka(dep.received)} • সমন্বয় {U.bnTaka(dep.adjusted)}
                    {dep.adjustedElec > 0 && ` (ভাড়া ${U.bnTaka(dep.adjustedRent)}, বিদ্যুৎ ${U.bnTaka(dep.adjustedElec)})`}
                    {dep.refunded > 0 && ` • ফেরত ${U.bnTaka(dep.refunded)}`}
                    {dep.agreed > 0 && ` • চুক্তি ${U.bnTaka(dep.agreed)}`}
                    {dep.monthlyAdjust > 0 && `, মাসে ${U.bnTaka(dep.monthlyAdjust)} কাটা`}
                    {dep.agreed > 0 && dep.received < dep.agreed && (
                      <span style={{ color: '#b91c1c' }}> • চুক্তির চেয়ে {U.bnTaka(dep.agreed - dep.received)} কম নেওয়া/লেখা</span>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
          )}

          {/* ৩. মাসভিত্তিক এন্ট্রি — আলাদা মেনু/পাতায় */}
          {isEntry && (
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
                      <th className="amount" title="ভাড়াটিয়ার অ্যাডভান্স (জামানত) থেকে ভাড়া কেটে — নগদ নয়">অ্যাডভান্স সমন্বয়</th>
                      <th className="amount" title="বিদ্যুৎ বিলও অ্যাডভান্স (জামানত) থেকে কাটা হলে — নগদ নয়">বিদ্যুৎ বিল অ্যাড. থেকে</th>
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
                      const hasAny = row && (row.rent || row.electricity || row.other || row.adjust || row.electricityAdjust);
                      const isCurrent = m === currentMonth;
                      return (
                        <tr key={m} className={`${dirty ? 'dirty-row' : ''}${hasAny ? ' paid-row' : ''}`}>
                          <td>
                            <b>{U.monthLabel(m)}</b>
                            {isCurrent && <div style={{ fontSize: '10.5px', color: '#64748b' }}>চলতি মাস</div>}
                            {row?.tenancy?.tenantName && <div style={{ fontSize: '10.5px', color: '#64748b' }}>{row.tenancy.tenantName}</div>}
                          </td>
                          <td className="amount">
                            {row && row.charge
                              ? U.bnNumber(row.charge)
                              : row && row.vacant
                                ? <span style={{ color: '#b45309', fontSize: '11px' }} title="এ মাসে দোকান ফাঁকা ছিল — বকেয়া নয়">ফাঁকা</span>
                                : <span style={{ color: '#cbd5e1' }}>—</span>}
                          </td>
                          {KINDS.map((k) => (
                            <td key={k} className="amount">
                              {isReadOnly ? (
                                num(row ? row[ROW_KEY[k]] : 0)
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
                      <td colSpan="5" style={{ fontSize: '11.5px', fontWeight: 400, color: '#64748b' }}>
                        বকেয়া = ধার্য − (ভাড়া + অন্যান্য + অ্যাডভান্স সমন্বয়)। বিদ্যুৎ বিল (নগদ ও অ্যাডভান্স থেকে, দুটোই) বকেয়ার হিসাবে ঢোকে না।
                      </td>
                      <td className="amount">
                        {(() => {
                          // পুরো দোকানের বকেয়া — সারির balance ভাড়াটিয়া বদলালে শূন্য থেকে শুরু হয়
                          const b = ledgerRows.reduce((s, r) => s + r.charge - r.rent - r.other - r.adjust, 0);
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
          )}
        </>
      )}

      {/* ৫. এ মাসের হিসাবে সব দোকান থেকে ভাড়া খাতে কত উঠল — পাতার নিচে, ছোট কার্ড */}
      {!isEntry && (
      <div className="card card-auto" style={{ marginBottom: '18px' }}>
        <div className="card-header">
          <div>
            <div className="card-title">
              <Wallet size={17} color="var(--success)" />
              <span>{U.monthLabel(selectedMonth)} মাসের হিসাবে সব দোকান থেকে ভাড়া খাতে জমা</span>
            </div>
            <div className="card-sub">জমার মাস ধরে — আয়-ব্যয় খতিয়ানে "দোকানের ভাড়া আদায়" সারিটি এই অঙ্কেই বসে। মাস বদলাতে উপরের মাস-বাছাই ব্যবহার করুন।</div>
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
                    <td>{Calc.shopTenantName(r.shop, r.rentMonths[0] || selectedMonth) || <span style={{ color: '#94a3b8' }}>—</span>}</td>
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

      )}

    </div>
  );
}
