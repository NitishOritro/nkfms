import React, { useMemo } from 'react';
import { CalendarDays, Inbox, Printer, Store, Pencil } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import * as Calc from '../utils/calc';
import * as U from '../utils/format';

/* ==========================================================================
   মাসভিত্তিক দোকান ভাড়া আদায় — সব মাস

   প্রতি মাসে (যে মাসের খতিয়ানে টাকা উঠেছে) দোকান ভাড়া বাবদ কী এন্ট্রি হয়েছে,
   নতুন থেকে পুরোনো ক্রমে। ভিউ মোডেও দেখা যায়; এন্ট্রি হয় "দোকান ভাড়া
   এন্ট্রি" পাতায়।
   ========================================================================== */
export function ShopRentMonthlyView({ onOpenPrint, onOpenEntry }) {
  const { data, selectedMonth, setSelectedMonth } = useData();
  const { isReadOnly } = useAuth();

  const shopsReady = data.shopsReady !== false;
  const monthly = useMemo(() => Calc.shopRentMonthlyList(data), [data]);
  const shopCount = Calc.shopsSorted(data).length;
  // পুরোনো কাগজের একত্রিত আদায় (দোকানওয়ারি ভাঙা নেই)
  const legacy = useMemo(() => Calc.shopRentLegacy(data), [data]);
  const legacyTotal = legacy.reduce((s, l) => s + l.amount, 0);
  // অ্যাডভান্স (জামানত) — সব দোকান মিলিয়ে, আজ পর্যন্ত
  const deposit = useMemo(() => Calc.shopDepositTotals(data), [data]);
  const hasDeposit = deposit.received > 0 || deposit.refunded > 0;

  const num = (v) => (v ? U.bnNumber(v) : <span style={{ color: '#cbd5e1' }}>—</span>);

  // একটি মাসের সারি থেকে ঐ মাসের ছাপার রিপোর্টে যাওয়া
  const printMonth = (month) => {
    setSelectedMonth(month);
    if (onOpenPrint) onOpenPrint();
  };

  return (
    <div className="page-body">
      <div className="card" style={{ marginBottom: '18px' }}>
        <div className="card-header">
          <div>
            <div className="card-title">
              <CalendarDays size={18} color="var(--primary)" />
              <span>মাসভিত্তিক দোকান ভাড়া আদায় — সব মাস</span>
            </div>
            <div className="card-sub">
              যে মাসের হিসাবে (খতিয়ানে) টাকা উঠেছে সেই মাস ধরে; বন্ধনীতে কোন মাসের ভাড়া।
              মোট দোকান {U.bnDigits(shopCount)} টি।
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {!isReadOnly && onOpenEntry && (
              <button className="btn btn-outline btn-sm" onClick={onOpenEntry}>
                <Pencil size={14} /> দোকান ভাড়া এন্ট্রি
              </button>
            )}
            {onOpenPrint && (
              <button className="btn btn-primary btn-sm" onClick={onOpenPrint}>
                <Printer size={15} /> প্রিন্ট ও PDF ({U.monthLabelShort(selectedMonth)})
              </button>
            )}
          </div>
        </div>
      </div>

      {!shopsReady && (
        <div className="card" style={{ marginBottom: '18px', padding: '16px', color: '#b91c1c' }}>
          ডাটাবেজে দোকান ভাড়ার টেবিল এখনো তৈরি হয়নি — Supabase-এ <b>sql/shop-rent.sql</b> চালান।
        </div>
      )}

      <div className="metrics-grid" style={{ marginBottom: '16px' }}>
        <div className="metric-card success">
          <div className="metric-label">সর্বমোট দোকান ভাড়া খাতে জমা</div>
          <div className="metric-value" style={{ color: 'var(--success)' }}>{U.bnTaka(monthly.grand.total)}</div>
          <div className="metric-sub">{U.bnDigits(monthly.grand.monthCount)} মাসে, সব দোকান মিলিয়ে</div>
        </div>
        <div className="metric-card primary">
          <div className="metric-label">এর মধ্যে ভাড়া</div>
          <div className="metric-value" style={{ color: 'var(--primary)' }}>{U.bnTaka(monthly.grand.rent)}</div>
          <div className="metric-sub">অন্যান্য/সমন্বয় {U.bnTaka(monthly.grand.other)}</div>
        </div>
        <div className="metric-card warning">
          <div className="metric-label">এর মধ্যে বিদ্যুৎ বিল</div>
          <div className="metric-value" style={{ color: 'var(--warning-dark)' }}>{U.bnTaka(monthly.grand.electricity)}</div>
          <div className="metric-sub">দোকানের কারেন্ট বিল বাবদ আদায়</div>
        </div>
        {/* অ্যাডভান্স (জামানত) — কোনো দোকানে থাকলে তবেই; আয় নয়, ভাড়াটিয়ার জমা */}
        {(deposit.received > 0 || deposit.refunded > 0) && (
          <div className="metric-card danger">
            <div className="metric-label">অ্যাডভান্স (জামানত) জমা আছে</div>
            <div className="metric-value" style={{ color: 'var(--danger)' }}>{U.bnTaka(deposit.balance)}</div>
            <div className="metric-sub">
              {U.bnDigits(deposit.shopCount)} দোকান • গ্রহণ {U.bnTaka(deposit.received)} − ভাড়ায় সমন্বয় {U.bnTaka(deposit.adjusted)}
              {deposit.refunded > 0 && ` − ফেরত ${U.bnTaka(deposit.refunded)}`}
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-body flush">
          <div className="table-container">
            <table className="data-table shop-monthly">
              <thead>
                <tr>
                  <th style={{ minWidth: '130px' }}>জমার মাস</th>
                  <th>কোন দোকান থেকে কী</th>
                  <th className="amount">ভাড়া</th>
                  <th className="amount">বিদ্যুৎ বিল</th>
                  <th className="amount">অন্যান্য</th>
                  <th className="amount">মোট</th>
                  {hasDeposit && <th className="amount" title="অ্যাডভান্স (জামানত) নগদে গ্রহণ (+) / ফেরত (−) — ভাড়ার মোটে নয়">অ্যাডভান্স</th>}
                  <th style={{ width: '60px' }}></th>
                </tr>
              </thead>
              <tbody>
                {monthly.list.length ? monthly.list.map((m) => (
                  <tr key={m.month} className={m.month === selectedMonth ? 'is-selected' : undefined}>
                    <td>
                      <b>{U.monthLabel(m.month)}</b>
                      <div style={{ fontSize: '10.5px', color: '#64748b' }}>{m.rows.length ? `${U.bnDigits(m.totals.shopCount)} টি দোকান` : '—'}</div>
                    </td>
                    <td>
                      {!m.rows.length && (
                        <span style={{ color: '#94a3b8', fontSize: '12px' }}>এ মাসের হিসাবে দোকান ভাড়ার কোনো জমা নেই</span>
                      )}
                      {m.rows.map((r) => (
                        <div key={r.shop.id} className="shop-monthly-line">
                          <b>{Calc.shopLabel(r.shop)}</b>
                          {r.shop.tenantName ? ` (${r.shop.tenantName})` : ''}:{' '}
                          {r.rent > 0 && <span>ভাড়া {r.rentMonths.length ? `(${r.rentMonths.map(U.monthLabelShort).join(', ')}) ` : ''}{U.bnNumber(r.rent)}</span>}
                          {r.electricity > 0 && <span>{r.rent > 0 ? ' • ' : ''}বিদ্যুৎ বিল {U.bnNumber(r.electricity)}</span>}
                          {r.other > 0 && <span>{r.rent > 0 || r.electricity > 0 ? ' • ' : ''}অন্যান্য {U.bnNumber(r.other)}</span>}
                          {r.adjust > 0 && (
                            <span style={{ color: '#64748b' }}>{r.total > 0 ? ' • ' : ''}অ্যাডভান্স থেকে সমন্বয় {U.bnNumber(r.adjust)} (নগদ নয়)</span>
                          )}
                          {r.deposit > 0 && (
                            <span style={{ color: 'var(--warning-dark)' }}>{r.total > 0 || r.adjust > 0 ? ' • ' : ''}অ্যাডভান্স গ্রহণ {U.bnNumber(r.deposit)}</span>
                          )}
                          {r.refund > 0 && (
                            <span style={{ color: '#dc2626' }}>{r.total > 0 || r.adjust > 0 || r.deposit > 0 ? ' • ' : ''}অ্যাডভান্স ফেরত {U.bnNumber(r.refund)}</span>
                          )}
                          {r.notes.length > 0 && (
                            <div style={{ fontSize: '11px', color: '#64748b' }}>{r.notes.join('; ')}</div>
                          )}
                        </div>
                      ))}
                    </td>
                    <td className="amount">{num(m.totals.rent)}</td>
                    <td className="amount">{num(m.totals.electricity)}</td>
                    <td className="amount">{num(m.totals.other)}</td>
                    <td className="amount" style={{ fontWeight: 700, color: 'var(--success)' }}>{m.totals.total ? U.bnNumber(m.totals.total) : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                    {hasDeposit && (
                      <td className="amount">
                        {m.totals.deposit > 0 && <div style={{ color: 'var(--warning-dark)' }}>+{U.bnNumber(m.totals.deposit)}</div>}
                        {m.totals.refund > 0 && <div style={{ color: '#dc2626' }}>−{U.bnNumber(m.totals.refund)}</div>}
                        {!m.totals.deposit && !m.totals.refund && <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                    )}
                    <td>
                      {onOpenPrint && m.rows.length > 0 && (
                        <button className="btn-icon" title={`${U.monthLabel(m.month)} এর রিপোর্ট ছাপুন`} onClick={() => printMonth(m.month)}>
                          <Printer size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={hasDeposit ? 8 : 7} className="empty-state">
                      <div className="empty-state-icon"><Inbox size={24} /></div>
                      <div className="empty-state-title">এখনো কোনো মাসে দোকান ভাড়ার এন্ট্রি নেই</div>
                      {!isReadOnly && onOpenEntry && (
                        <button type="button" className="btn btn-primary" onClick={onOpenEntry}>
                          <Store size={16} /> <span>এন্ট্রি শুরু করুন</span>
                        </button>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
              {(monthly.list.length > 0 || legacy.length > 0) && (
                <tfoot>
                  <tr style={{ fontWeight: 700, background: 'var(--bg-muted)' }}>
                    <td colSpan="2">সর্বমোট ({U.bnDigits(monthly.grand.monthCount)} মাস)</td>
                    <td className="amount">{U.bnNumber(monthly.grand.rent)}</td>
                    <td className="amount">{U.bnNumber(monthly.grand.electricity)}</td>
                    <td className="amount">{U.bnNumber(monthly.grand.other)}</td>
                    <td className="amount" style={{ color: 'var(--success)' }}>{U.bnNumber(monthly.grand.total)}</td>
                    {hasDeposit && (
                      <td className="amount" style={{ fontSize: '11.5px' }}>
                        <div style={{ color: 'var(--warning-dark)' }}>+{U.bnNumber(monthly.grand.deposit)}</div>
                        {monthly.grand.refund > 0 && <div style={{ color: '#dc2626' }}>−{U.bnNumber(monthly.grand.refund)}</div>}
                      </td>
                    )}
                    <td></td>
                  </tr>
                  {/* পুরোনো কাগজের একত্রিত আদায় — মাসওয়ারি তালিকার নিচে আলাদা করে */}
                  {legacy.map((l) => (
                    <tr key={l.id} style={{ background: '#f8fafc', color: '#475569' }}>
                      <td>
                        <b>{U.monthLabelShort(l.fromMonth)} হতে {U.monthLabelShort(l.toMonth)}</b>
                        <div style={{ fontSize: '10.5px' }}>পূর্বের একত্রিত হিসাব</div>
                      </td>
                      <td style={{ fontSize: '12px' }}>{l.label}</td>
                      <td className="amount" colSpan="3"></td>
                      <td className="amount" style={{ fontWeight: 700 }}>{U.bnNumber(l.amount)}</td>
                      {hasDeposit && <td></td>}
                      <td></td>
                    </tr>
                  ))}
                  {legacy.length > 0 && (
                    <tr style={{ fontWeight: 700, background: 'var(--bg-muted)' }}>
                      <td colSpan="5">সর্বমোট (পূর্বের একত্রিত {U.bnNumber(legacyTotal)} সহ)</td>
                      <td className="amount" style={{ color: 'var(--primary-dark)' }}>{U.bnNumber(monthly.grand.total + legacyTotal)}</td>
                      {hasDeposit && <td></td>}
                      <td></td>
                    </tr>
                  )}
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
