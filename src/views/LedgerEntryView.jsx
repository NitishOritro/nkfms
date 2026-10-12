import React, { useState, useMemo, useEffect } from 'react';
import {
  Plus, Trash2, Pencil, Check, X, ChevronUp, ChevronDown,
  Wand2, CornerDownRight, Printer, AlertTriangle
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import * as Calc from '../utils/calc';
import * as U from '../utils/format';

// খরচের চেনা খাতগুলো — এক চাপে শিরোনাম বসিয়ে দেয়, প্রতিবার টাইপ করতে হয় না
const EXPENSE_PRESETS = [
  'কমন পানির (WASA) বিল',
  'কমন বিদ্যুৎ (ELECTRICITY) বিল',
  'কেয়ারটেকারকে বেতন প্রদান',
  'বিবিধ খরচ',
  'লিফট রক্ষণাবেক্ষণ',
  'মেরামত ও সংস্কার'
];

// "দোকানের ভাড়া আদায়" এখানে নেই — সেটি "দোকান ভাড়া এন্ট্রি" পাতা থেকে
// নিজে থেকে বসে (source: 'shop-rent'); হাতে লিখলে দ্বিগুণ হিসাব হয়ে যেত।
const INCOME_PRESETS = [
  'ভবনের কমন ফান্ড হতে গ্রহণ',
  'অন্যান্য আদায়'
];

const emptyDraft = (side, month, serial) => ({
  id: '',
  month,
  side,
  serial,
  title: '',
  lines: [],
  amount: '',
  source: 'manual',
  refId: '',
  note: ''
});

/* ==========================================================================
   একটি সারি সম্পাদনার ফর্ম
   ========================================================================== */
function RowForm({ draft, setDraft, onSave, onCancel, presets }) {
  const lines = draft.lines || [];
  const linesTotal = lines.reduce((s, l) => s + (l.due ? 0 : Number(l.amount) || 0), 0);

  const setLine = (i, patch) => {
    const next = lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l));
    setDraft({ ...draft, lines: next });
  };

  return (
    <div className="card" style={{ padding: '16px', background: '#f8fafc' }}>
      <div className="form-group" style={{ marginBottom: '12px' }}>
        <label className="form-label">বিবরণ / শিরোনাম</label>
        <input
          className="form-input"
          value={draft.title}
          autoFocus
          placeholder="যেমন: কমন পানির (WASA) বিল (JULY-26)"
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
        {presets.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                className="btn btn-outline btn-sm"
                style={{ fontSize: '11px', padding: '3px 9px' }}
                onClick={() => setDraft({ ...draft, title: p })}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* উপ-লাইন না থাকলে সরাসরি একটি অঙ্ক */}
      {lines.length === 0 && (
        <div className="form-group" style={{ marginBottom: '12px' }}>
          <label className="form-label">পরিমাণ (টাকা)</label>
          <input
            className="form-input"
            type="number"
            min="0"
            value={draft.amount}
            placeholder="0"
            onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
            style={{ maxWidth: '220px' }}
          />
        </div>
      )}

      {/* উপ-লাইন — কাগজে যেগুলো মার্জ-করা ঘরের ভেতরে থাকে */}
      {lines.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <label className="form-label">উপ-লাইন</label>
          {lines.map((l, i) => (
            <div
              key={i}
              style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}
            >
              <CornerDownRight size={15} color="#94a3b8" style={{ flexShrink: 0 }} />
              <input
                className="form-input"
                value={l.text}
                placeholder="বিবরণ"
                onChange={(e) => setLine(i, { text: e.target.value })}
                style={{ flex: 1 }}
              />
              {l.due ? (
                <div
                  style={{
                    width: '130px', textAlign: 'center', fontWeight: 700,
                    color: '#b91c1c', background: '#fee2e2', border: '1px solid #fecaca',
                    borderRadius: '8px', padding: '8px 0'
                  }}
                >
                  বকেয়া
                </div>
              ) : (
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  value={l.amount}
                  placeholder="0"
                  onChange={(e) => setLine(i, { amount: e.target.value })}
                  style={{ width: '130px', textAlign: 'right' }}
                />
              )}
              <label
                title="টাকাটা এখনো দেওয়া হয়নি — যোগফলে ধরা হবে না"
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap', cursor: 'pointer'
                }}
              >
                <input
                  type="checkbox"
                  checked={!!l.due}
                  onChange={(e) => setLine(i, { due: e.target.checked })}
                />
                বকেয়া
              </label>
              <button
                type="button"
                className="btn-icon"
                title="এই লাইনটি বাদ দিন"
                onClick={() => setDraft({ ...draft, lines: lines.filter((_, x) => x !== i) })}
                style={{ color: '#dc2626' }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <div
            style={{
              textAlign: 'right', fontWeight: 700, fontSize: '12.5px',
              color: '#0f172a', paddingRight: '46px', marginTop: '4px'
            }}
          >
            উপ-লাইনের যোগফল: ৳{U.bnNumber(linesTotal)}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() =>
            setDraft({ ...draft, lines: [...lines, { text: '', amount: '' }], amount: '' })
          }
        >
          <Plus size={14} /> উপ-লাইন যোগ করুন
        </button>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn btn-outline btn-sm" onClick={onCancel}>
          <X size={14} /> বাতিল
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onSave}
          disabled={!draft.title.trim()}
        >
          <Check size={14} /> সেভ করুন
        </button>
      </div>
    </div>
  );
}

/* ==========================================================================
   বিশেষ নোট — টাকার অঙ্ক নয়, ঘোষণা। কাগজে যোগফলের নিচে বসে।
   ========================================================================== */
function NoteForm({ draft, setDraft, onSave, onCancel }) {
  return (
    <div className="card" style={{ padding: '16px', background: '#fffbeb' }}>
      <div className="form-group" style={{ marginBottom: '12px' }}>
        <label className="form-label">নোটের লেখা</label>
        <textarea
          className="form-input"
          rows={4}
          autoFocus
          value={draft.title}
          placeholder="যেমন: পর্যাপ্ত ফান্ডের স্বল্পতার কারণে এপ্রিল-২৬ মাসের নিরাপত্তা প্রহরীর বেতন ১২,০০০/- টাকা প্রদান করা সম্ভব হচ্ছে না।"
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          style={{ resize: 'vertical', lineHeight: 1.7 }}
        />
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ flex: 1, fontSize: '11px', color: '#92400e' }}>
          এই লেখাটি কোনো যোগফলে ধরা হবে না — রিপোর্টে মোট আদায়-খরচের নিচে বসবে।
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={onCancel}>
          <X size={14} /> বাতিল
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onSave}
          disabled={!draft.title.trim()}
        >
          <Check size={14} /> সেভ করুন
        </button>
      </div>
    </div>
  );
}

/* ==========================================================================
   এক পাশের (আদায় বা খরচ) তালিকা
   ========================================================================== */
function LedgerSide({ side, month, rows, total, isReadOnly, onEdit, onDelete, onMove, editingId, form }) {
  const isIncome = side === 'income';
  const accent = isIncome ? '#059669' : '#dc2626';
  const tint = isIncome ? '#ecfdf5' : '#fef2f2';

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
      <div
        className="card-header"
        style={{ background: tint, borderBottom: `2px solid ${accent}` }}
      >
        <div className="card-title" style={{ color: accent }}>
          {isIncome ? 'আদায়ের বিবরণ (+)' : 'খরচের বিবরণ (−)'}
        </div>
        <div style={{ fontWeight: 700, fontSize: '15.5px', color: accent }}>
          ৳{U.bnNumber(total)}
        </div>
      </div>

      <div style={{ padding: '12px' }}>
        {rows.length === 0 && editingId !== `new-${side}` && (
          <div style={{ padding: '26px 10px', textAlign: 'center', color: '#94a3b8' }}>
            এখনো কোনো {isIncome ? 'আদায়' : 'খরচ'} লেখা হয়নি।
          </div>
        )}

        {rows.map((e, i) => {
          if (editingId === e.id) return <div key={e.id} style={{ marginBottom: '10px' }}>{form}</div>;
          const lines = e.lines || [];
          return (
            <div
              key={e.id}
              style={{
                border: '1px solid #e2e8f0', borderRadius: '8px',
                padding: '10px 12px', marginBottom: '8px', background: '#fff'
              }}
            >
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span
                  style={{
                    minWidth: '22px', height: '22px', borderRadius: '6px', flexShrink: 0,
                    background: '#f1f5f9', color: '#64748b', fontSize: '11px',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
                  }}
                >
                  {U.bnDigits(i + 1)}
                </span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, lineHeight: 1.5 }}>{e.title}</div>

                  {e.source !== 'manual' && (
                    <span
                      className="pill"
                      style={{
                        marginTop: '4px', fontSize: '10px',
                        background: '#eff6ff', color: '#1d4ed8'
                      }}
                    >
                      {e.source === 'collector'
                        ? e.auto
                          ? `আদায়ের হিসাব থেকে নিজে বসেছে${e.note ? ' — ' + e.note : ''}`
                          : 'আদায়ের হিসাব থেকে (হাতে বদলানো)'
                        : e.source === 'shop-rent'
                          ? e.auto
                            ? `দোকান ভাড়া এন্ট্রি থেকে নিজে বসেছে${e.note ? ' — ' + e.note : ''}`
                            : 'দোকান ভাড়ার সারি (হাতে লেখা)'
                          : 'আগের মাস থেকে'}
                    </span>
                  )}

                  {lines.map((l, li) => (
                    <div
                      key={li}
                      style={{
                        display: 'flex', justifyContent: 'space-between', gap: '10px',
                        fontSize: '12px', color: '#475569', marginTop: '3px'
                      }}
                    >
                      <span>↳ {l.text}</span>
                      <span style={{ whiteSpace: 'nowrap' }}>
                        {l.due ? (
                          <b style={{ color: '#b91c1c' }}>বকেয়া</b>
                        ) : (
                          U.bnNumber(l.amount)
                        )}
                      </span>
                    </div>
                  ))}
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {U.bnNumber(Calc.ledgerRowAmount(e))}
                  </div>
                  {!isReadOnly && (
                    <div style={{ display: 'flex', gap: '2px', marginTop: '4px' }}>
                      {!e.auto && (
                        <>
                          <button className="btn-icon" title="উপরে" onClick={() => onMove(e, -1)}>
                            <ChevronUp size={14} />
                          </button>
                          <button className="btn-icon" title="নিচে" onClick={() => onMove(e, 1)}>
                            <ChevronDown size={14} />
                          </button>
                        </>
                      )}
                      <button
                        className="btn-icon"
                        title={e.auto ? 'বদলে নিজের মতো লিখুন' : 'সম্পাদনা'}
                        onClick={() => onEdit(e)}
                      >
                        <Pencil size={14} />
                      </button>
                      {!e.auto && (
                        <button
                          className="btn-icon"
                          title="মুছুন"
                          onClick={() => onDelete(e)}
                          style={{ color: '#dc2626' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {editingId === `new-${side}` && <div style={{ marginTop: '4px' }}>{form}</div>}

        {!isReadOnly && editingId !== `new-${side}` && (
          <button
            className="btn btn-outline btn-sm"
            style={{ width: '100%', marginTop: '4px' }}
            onClick={() => onEdit(null, side)}
          >
            <Plus size={15} /> নতুন {isIncome ? 'আদায়' : 'খরচ'} যোগ করুন
          </button>
        )}
      </div>
    </div>
  );
}

/* ==========================================================================
   পাতা
   ========================================================================== */
export function LedgerEntryView({ onOpenPrint }) {
  const {
    data, selectedMonth, setSelectedMonth,
    setLedgerEntry, deleteLedgerEntry, bulkSetLedgerEntries, addToast
  } = useData();
  const { isReadOnly } = useAuth();

  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);

  // একটি মাসের জমা-খরচের হিসাব সেই মাস শেষ হওয়ার পরেই তৈরি হয় — কাগজেও
  // আগস্টের সারসংক্ষেপের তারিখ ৩১শে আগস্ট, বানানো হয় সেপ্টেম্বরে। তাই এই
  // পাতাটি খুললে চলতি মাস নয়, আগের মাসেই যায়। উপরের মাস-বাছাইয়ের ঘর দিয়ে
  // অন্য মাসে যাওয়া যায়, আর সেই পছন্দ এরপর আর বদলানো হয় না।
  const [monthFixed, setMonthFixed] = useState(false);
  useEffect(() => {
    if (monthFixed) return;
    setMonthFixed(true);
    if (selectedMonth === U.currentMonth()) {
      setSelectedMonth(U.addMonths(selectedMonth, -1));
    }
  }, [monthFixed, selectedMonth, setSelectedMonth]);

  // চলতি মাস এখনো শেষ হয়নি — তবু কেউ সেটি বেছে নিলে জানিয়ে দেওয়া
  const isRunningMonth = selectedMonth === U.currentMonth();

  const summary = useMemo(() => Calc.ledgerSummary(data, selectedMonth), [data, selectedMonth]);
  const carryover = useMemo(() => Calc.carryoverRow(data, selectedMonth), [data, selectedMonth]);

  const ledgerReady = data.ledgerReady !== false;

  // আদায়কারীদের সারি ledgerSummary নিজেই বসিয়ে দেয় (summary.autoCount)।
  // আগের মাসের ঘাটতিটি নিজে বসে না — সেটি হিসাবরক্ষণের সিদ্ধান্ত, আর একবার
  // বসে গেলে স্থির থাকা দরকার, নইলে মাসের শেকল পিছন থেকে বদলাতে থাকবে।
  const carryoverMissing =
    carryover &&
    ![...summary.income, ...summary.expense].some((e) => e.source === 'carryover');

  const startEdit = (entry, side) => {
    if (entry) {
      setEditingId(entry.id);
      setDraft({
        ...entry,
        // নিজে-বসা সারি সম্পাদনা করলে সেটি ডাটাবেজে নতুন সারি হিসেবে স্থায়ী হয়
        id: entry.auto ? '' : entry.id,
        serial: entry.auto ? summary.income.length : entry.serial,
        amount: entry.lines?.length ? '' : String(entry.amount || '')
      });
    } else {
      const rows =
        side === 'income' ? summary.income : side === 'note' ? summary.notes : summary.expense;
      setEditingId(`new-${side}`);
      setDraft(emptyDraft(side, selectedMonth, rows.length + 1));
    }
  };

  const saveDraft = () => {
    setLedgerEntry({ ...draft, month: selectedMonth });
    setEditingId(null);
    setDraft(null);
  };

  const handleDelete = (entry) => {
    if (window.confirm(`"${entry.title}" সারিটি মুছে ফেলবেন?`)) deleteLedgerEntry(entry.id);
  };

  // ক্রম বদল — দুটি সারির serial অদল-বদল
  const handleMove = (entry, dir) => {
    const rows =
      entry.side === 'income'
        ? summary.income
        : entry.side === 'note'
          ? summary.notes
          : summary.expense;
    const i = rows.findIndex((r) => r.id === entry.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= rows.length) return;
    bulkSetLedgerEntries([
      { ...rows[i], serial: j + 1 },
      { ...rows[j], serial: i + 1 }
    ]);
  };

  const applyCarryover = () => {
    const rows = carryover.side === 'income' ? summary.income : summary.expense;
    setLedgerEntry({
      id: '',
      month: selectedMonth,
      side: carryover.side,
      serial: rows.length + 1,
      title: carryover.title,
      lines: [],
      amount: carryover.amount,
      source: 'carryover',
      refId: '',
      note: ''
    });
    addToast('আগের মাসের সারিটি বসানো হয়েছে।', 'success');
  };

  const noteForm = draft && draft.side === 'note' && (
    <NoteForm
      draft={draft}
      setDraft={setDraft}
      onSave={saveDraft}
      onCancel={() => { setEditingId(null); setDraft(null); }}
    />
  );

  const form = draft && draft.side !== 'note' && (
    <RowForm
      draft={draft}
      setDraft={setDraft}
      onSave={saveDraft}
      onCancel={() => { setEditingId(null); setDraft(null); }}
      presets={draft.side === 'income' ? INCOME_PRESETS : EXPENSE_PRESETS}
    />
  );

  const deficit = summary.balance < 0;
  const balanced = summary.balance === 0;

  return (
    <div className="page-body">
      <div className="card" style={{ marginBottom: '18px' }}>
        <div className="card-header">
          <div>
            <div className="card-title">
              {U.monthLabel(selectedMonth)} — সার্ভিস হিসাবায়ন সারসংক্ষেপ
            </div>
            {isRunningMonth && (
              <div
                style={{
                  marginTop: '4px', fontSize: '11.5px', color: '#b45309',
                  background: '#fef3c7', border: '1px solid #fcd34d',
                  borderRadius: '6px', padding: '5px 10px', display: 'inline-block'
                }}
              >
                {U.monthLabel(selectedMonth)} মাস এখনো চলছে — হিসাব সাধারণত মাস শেষ হলে
                তৈরি হয়। উপরে মাস বদলে নিতে পারেন।
              </div>
            )}
            <div className="card-sub">
              জমা ও খরচের প্রতিটি খাত এখানে লিখুন — যোগফল ও ঘাটতি সফটওয়্যার নিজেই হিসাব করবে।
              {summary.autoCount > 0 && (
                <>
                  {' '}আদায়কারীদের <b>{U.bnDigits(summary.autoCount)}টি সারি</b> আদায়ের
                  হিসাব থেকে নিজে থেকেই বসে গেছে।
                </>
              )}
              {summary.autoShopCount > 0 && (
                <>
                  {' '}দোকান ভাড়ার <b>{U.bnDigits(summary.autoShopCount)}টি সারি</b> দোকান
                  ভাড়া এন্ট্রি থেকে নিজে থেকেই বসে গেছে।
                </>
              )}
              {summary.autoDisabled && (
                <>
                  {' '}এই মাসের হিসাব কাগজ থেকে হুবহু তোলা — আদায়কারীদের সারি এখানে
                  নিজে থেকে বসে না ({U.monthLabelShort(data.settings.ledgerAutoFromMonth)} থেকে বসে)।
                </>
              )}
            </div>
          </div>
          {onOpenPrint && (
            <button className="btn btn-outline btn-sm" onClick={onOpenPrint}>
              <Printer size={15} /> প্রিন্ট ও PDF
            </button>
          )}
        </div>
      </div>

      {!ledgerReady && (
        <div className="card" style={{ marginBottom: '18px', borderColor: '#fca5a5' }}>
          <div style={{ padding: '16px', display: 'flex', gap: '12px' }}>
            <AlertTriangle size={20} color="#dc2626" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div style={{ fontWeight: 700, color: '#b91c1c', marginBottom: '4px' }}>
                ডাটাবেজে হিসাবের টেবিলটি এখনো তৈরি হয়নি
              </div>
              <div style={{ color: '#7f1d1d', fontSize: '12.5px' }}>
                Supabase-এর SQL Editor-এ <b>supabase/06_ledger.sql</b> ফাইলটি একবার চালিয়ে
                নিন, তারপর এই পাতাটি রিফ্রেশ করুন। ততক্ষণ এখানে কিছু সেভ হবে না।
              </div>
            </div>
          </div>
        </div>
      )}

      {/* আগের মাসের ঘাটতি — এটিই একমাত্র সারি যা নিজে থেকে বসে না */}
      {!isReadOnly && ledgerReady && carryoverMissing && (
        <div className="card" style={{ marginBottom: '18px', borderColor: '#bfdbfe' }}>
          <div style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
              <Wand2 size={17} color="#1d4ed8" />
              <b style={{ color: '#1e40af' }}>আগের মাসের হিসাব থেকে</b>
            </div>
            <div style={{ fontSize: '12.5px', color: '#334155' }}>
              {carryover.title} — {U.bnNumber(carryover.amount)}
            </div>
            <button className="btn btn-outline btn-sm" style={{ marginTop: '10px' }} onClick={applyCarryover}>
              <Plus size={14} /> এই সারিটি বসান
            </button>
          </div>
        </div>
      )}

      {summary.incomplete && (
        <div
          style={{
            marginBottom: '18px', padding: '12px 16px', borderRadius: '10px',
            background: '#fef3c7', border: '1px solid #fcd34d', color: '#78350f',
            fontSize: '12.5px'
          }}
        >
          <b>{U.monthLabel(selectedMonth)} মাসের খরচ এখনো লেখা হয়নি।</b> আদায়ের
          সারিগুলো নিজে থেকে বসেছে বলে নিচে একটি উদ্বৃত্ত দেখা যাচ্ছে — কিন্তু খরচ
          বসানোর আগে সেটি আসল হিসাব নয়।
        </div>
      )}

      <div className="ledger-grid">
        <LedgerSide
          side="income"
          month={selectedMonth}
          rows={summary.income}
          total={summary.totalIncome}
          isReadOnly={isReadOnly}
          onEdit={startEdit}
          onDelete={handleDelete}
          onMove={handleMove}
          editingId={editingId}
          form={form}
        />
        <LedgerSide
          side="expense"
          month={selectedMonth}
          rows={summary.expense}
          total={summary.totalExpense}
          isReadOnly={isReadOnly}
          onEdit={startEdit}
          onDelete={handleDelete}
          onMove={handleMove}
          editingId={editingId}
          form={form}
        />
      </div>

      {/* বিশেষ নোট — কাগজে যেমন যোগফলের নিচে বসে, এখানেও তাই */}
      <div className="ledger-notes">
        <div className="ln-head">
          <span>বিশেষ নোট</span>
          <span className="ln-hint">টাকার অঙ্ক নয় — যোগফলে ধরা হবে না</span>
        </div>

        {summary.notes.length === 0 && editingId !== 'new-note' && (
          <div className="ln-empty">কোনো নোট লেখা হয়নি।</div>
        )}

        {summary.notes.map((n, i) =>
          editingId === n.id ? (
            <div key={n.id} style={{ marginBottom: '10px' }}>{noteForm}</div>
          ) : (
            <div key={n.id} className="ln-item">
              <span className="ln-num">{U.bnDigits(i + 1)}</span>
              <div className="ln-text">{n.title}</div>
              {!isReadOnly && (
                <div className="ln-acts">
                  <button className="btn-icon" title="উপরে" onClick={() => handleMove(n, -1)}>
                    <ChevronUp size={14} />
                  </button>
                  <button className="btn-icon" title="নিচে" onClick={() => handleMove(n, 1)}>
                    <ChevronDown size={14} />
                  </button>
                  <button className="btn-icon" title="সম্পাদনা" onClick={() => startEdit(n)}>
                    <Pencil size={14} />
                  </button>
                  <button
                    className="btn-icon"
                    title="মুছুন"
                    onClick={() => handleDelete(n)}
                    style={{ color: '#dc2626' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          )
        )}

        {editingId === 'new-note' && <div style={{ marginTop: '4px' }}>{noteForm}</div>}

        {!isReadOnly && editingId !== 'new-note' && (
          <button
            className="btn btn-outline btn-sm"
            style={{ width: '100%', marginTop: '4px' }}
            onClick={() => startEdit(null, 'note')}
          >
            <Plus size={15} /> নতুন নোট যোগ করুন
          </button>
        )}
      </div>

      {/* ফলাফল — খতিয়ানের অঙ্কটাই দেখানো: আদায় − খরচ = ফলাফল */}
      <div className={`ledger-total ${balanced ? 'is-even' : deficit ? 'is-short' : 'is-over'}`}>
        <div className="ledger-total-row">
          <div className="lt-box lt-in">
            <div className="lt-label">মোট আদায়ের পরিমান</div>
            <div className="lt-value">৳{U.bnNumber(summary.totalIncome)}</div>
            <div className="lt-sub">{U.bnDigits(summary.income.length)} টি খাত</div>
          </div>

          <div className="lt-op" aria-hidden="true">−</div>

          <div className="lt-box lt-out">
            <div className="lt-label">মোট খরচের পরিমান</div>
            <div className="lt-value">৳{U.bnNumber(summary.totalExpense)}</div>
            <div className="lt-sub">{U.bnDigits(summary.expense.length)} টি খাত</div>
          </div>

          <div className="lt-op" aria-hidden="true">=</div>

          <div className="lt-box lt-result">
            <div className="lt-label">
              {balanced ? 'আয় ও ব্যয় সমান' : deficit ? 'ক্যাশ ঘাটতি রয়েছে' : 'ক্যাশ উদ্বৃত্ত রয়েছে'}
            </div>
            <div className="lt-value">
              {deficit ? '−' : ''}৳{U.bnNumber(Math.abs(summary.balance))}
            </div>
            <div className="lt-sub">
              {balanced
                ? 'কোনো ঘাটতি বা উদ্বৃত্ত নেই'
                : deficit
                  ? 'পরের মাসের খরচে বহন করতে হবে'
                  : 'পরের মাসের আদায়ে যোগ হবে'}
            </div>
          </div>
        </div>

        {/* দুই পাশের অনুপাত — কোনটি কতটা বড় এক নজরে বোঝা যায় */}
        {(summary.totalIncome > 0 || summary.totalExpense > 0) && (
          <div className="lt-bars">
            <div className="lt-bar">
              <span
                className="lt-fill lt-fill-in"
                style={{
                  width: `${(summary.totalIncome /
                    Math.max(summary.totalIncome, summary.totalExpense, 1)) * 100}%`
                }}
              />
            </div>
            <div className="lt-bar">
              <span
                className="lt-fill lt-fill-out"
                style={{
                  width: `${(summary.totalExpense /
                    Math.max(summary.totalIncome, summary.totalExpense, 1)) * 100}%`
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
