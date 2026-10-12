import React from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import * as Calc from '../utils/calc';
import * as U from '../utils/format';
import {
  CheckCircle2,
  Wallet,
  ArrowRight,
  Layers,
  AlertTriangle,
  Printer,
  Zap,
  Inbox,
  TrendingUp,
  TrendingDown,
  Minus,
  Store
} from 'lucide-react';

export function DashboardView({ setCurrentTab }) {
  const { data, selectedMonth } = useData();
  const { isReadOnly } = useAuth();

  const { totals } = Calc.summary(data, selectedMonth);
  const collectorData = Calc.collectorBreakdown(data, selectedMonth);

  // দোকান ভাড়া — এ মাসের হিসাবে (জমার মাস) কোন দোকান থেকে কত উঠল
  const shopsReady = data.shopsReady !== false;
  const shopMonth = Calc.shopRentByPaidMonth(data, selectedMonth);

  // গত মাসের সাথে তুলনা — নইলে মাসের শুরুতে "৳০ জমা / ০%" দেখে মনে হয়
  // সব ভেঙে পড়েছে, অথচ সেটাই স্বাভাবিক। তুলনা থাকলে প্রেক্ষাপট বোঝা যায়।
  const prevMonth = U.addMonths(selectedMonth, -1);
  const prevTotals = Calc.summary(data, prevMonth).totals;
  const collectedDelta = totals.monthCollected - prevTotals.monthCollected;
  const DeltaIcon = collectedDelta > 0 ? TrendingUp : collectedDelta < 0 ? TrendingDown : Minus;
  const deltaClass = collectedDelta > 0 ? 'up' : collectedDelta < 0 ? 'down' : 'flat';

  const getCollectorName = (colId) => {
    const c = (data.settings.collectors || []).find((x) => x.id === colId);
    return c ? (c.bn || c.en) : 'নির্ধারিত নয়';
  };

  const percentage = totals.flatCount
    ? Math.round((totals.paidThisMonth / totals.flatCount) * 100)
    : 0;

  const quickActions = [
    // ভিউ মোডে "একক ফ্ল্যাট এন্ট্রি" কার্ডটি দেখানো হয় না
    ...(isReadOnly ? [] : [{
      id: 'flat-entry',
      icon: Layers,
      color: '#0284c7',
      featured: true,
      title: 'একক ফ্ল্যাট এন্ট্রি',
      desc: 'একটি ফ্ল্যাটের বিগত ২৫ মাসের (আগস্ট ২০২৪ হতে আগস্ট ২০২৬) সব এন্ট্রি একসাথে দিন।'
    }]),
    // এন্ট্রির কার্ডটিও ভিউ মুডে থাকে না — ওই পাতায় ঢোকার অনুমতি নেই
    ...(isReadOnly ? [] : [{
      id: 'collection',
      icon: CheckCircle2,
      color: '#059669',
      title: 'মাসিক আদায় এন্ট্রি',
      desc: U.monthLabel(selectedMonth) + ' মাসের সকল ফ্ল্যাটের আদায় ও রসিদ তৈরি করুন।'
    }]),
    {
      id: 'defaulters',
      icon: AlertTriangle,
      color: '#dc2626',
      title: 'বকেয়া তালিকা',
      desc: 'সকল ফ্ল্যাটের মোট বকেয়া ও কত মাসের সমতুল্য বকেয়া রয়েছে তা দেখুন।'
    },
    {
      id: 'reports',
      icon: Printer,
      color: '#7c3aed',
      title: 'প্রিন্ট ও PDF রিপোর্ট',
      desc: 'মাঝখানে জলছাপ ও ৩-কলাম হেডারসহ অফিসিয়াল A4 সারসংক্ষেপ প্রিন্ট করুন।'
    }
  ];

  return (
    <div className="page-body">
      {/* উপরের ব্যানার */}
      <div className="page-banner">
        <div>
          <h2><span className="society-name">{data.settings.societyName}</span> — ড্যাশবোর্ড</h2>
          <p>
            নির্বাচিত হিসাব মাস: <b>{U.monthLabel(selectedMonth)}</b>
            &nbsp;&nbsp;•&nbsp;&nbsp; মোট ফ্ল্যাট: <b>{U.bnDigits(totals.flatCount)} টি</b>
          </p>
        </div>

        {!isReadOnly && (
          <button
            onClick={() => setCurrentTab('flat-entry')}
            className="btn btn-success"
            style={{ padding: '11px 18px' }}
          >
            <Layers size={18} />
            <span>একক ফ্ল্যাট এন্ট্রি (২৫ মাস)</span>
          </button>
        )}
      </div>

      {/* আর্থিক মেট্রিক */}
      <div className="metrics-grid">
        <div className="metric-card primary">
          <div className="metric-label">{U.monthLabel(selectedMonth)} মাসে মোট জমা</div>
          <div className="metric-value" style={{ color: 'var(--primary)' }}>
            {U.bnTaka(totals.monthCollected)}
          </div>
          <div className="metric-sub">
            {U.bnDigits(totals.paidThisMonth)} টি ফ্ল্যাট এ মাসে পরিশোধ করেছে
          </div>
          <div
            className={`metric-delta ${deltaClass}`}
            title={`${U.monthLabel(prevMonth)} মাসে জমা হয়েছিল ${U.bnTaka(prevTotals.monthCollected)}`}
          >
            <DeltaIcon size={14} />
            <span>
              {collectedDelta === 0
                ? 'গত মাসের সমান'
                : `গত মাসের চেয়ে ${U.bnTaka(Math.abs(collectedDelta))} ${collectedDelta > 0 ? 'বেশি' : 'কম'}`}
            </span>
          </div>
        </div>

        <div className="metric-card danger">
          <div className="metric-label">{U.monthLabel(selectedMonth)} পর্যন্ত মোট বকেয়া</div>
          <div className="metric-value" style={{ color: 'var(--danger)' }}>
            {U.bnTaka(totals.totalDue)}
          </div>
          <div className="metric-sub">
            {U.bnDigits(totals.defaulters)} টি ফ্ল্যাটে বকেয়া পাওনা রয়েছে
          </div>
        </div>

        <div className="metric-card success">
          <div className="metric-label">পরিশোধের অগ্রগতি হার</div>
          <div className="metric-value" style={{ color: 'var(--success)' }}>
            {U.bnDigits(percentage)}%
          </div>
          <div className="metric-sub">
            মোট {U.bnDigits(totals.flatCount)} টির মধ্যে {U.bnDigits(totals.paidThisMonth)} টি জমা
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-valuenow={percentage}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="progress-fill"
              style={{ width: Math.min(percentage, 100) + '%' }}
            />
          </div>
        </div>

        <div className="metric-card warning">
          <div className="metric-label">মোট অগ্রীম জমা</div>
          <div className="metric-value" style={{ color: 'var(--warning-dark)' }}>
            {U.bnTaka(totals.totalAdvance)}
          </div>
          <div className="metric-sub">ভবিষ্যৎ মাসসমূহের জন্য জমা</div>
        </div>
      </div>

      {/* দ্রুত কার্যক্রম */}
      <h3 className="section-title">
        <Zap size={17} color="var(--primary)" />
        দ্রুত কার্যক্রম (Quick Actions)
      </h3>
      <div className="quick-action-grid">
        {quickActions.map((a) => {
          const Icon = a.icon;
          return (
            <div
              key={a.id}
              role="button"
              tabIndex={0}
              onClick={() => setCurrentTab(a.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setCurrentTab(a.id);
                }
              }}
              className={`card action-card ${a.featured ? 'featured' : ''}`}
            >
              <div className="action-card-top">
                <div className="action-icon" style={{ background: a.color }}>
                  <Icon size={21} />
                </div>
                <ArrowRight size={18} color={a.color} />
              </div>
              <h4>{a.title}</h4>
              <p>{a.desc}</p>
            </div>
          );
        })}
      </div>

      {/* আদায়কারীভিত্তিক হিসাব */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <Wallet size={18} color="var(--primary)" />
            <span>{U.monthLabel(selectedMonth)} — আদায়কারীভিত্তিক আদায়ের হিসাব</span>
          </div>
        </div>
        <div className="card-body flush">
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>ক্রম</th>
                  <th>আদায়কারীর নাম</th>
                  <th style={{ textAlign: 'center' }}>জমাকৃত ফ্ল্যাট সংখ্যা</th>
                  <th className="amount">মোট আদায়কৃত টাকা</th>
                </tr>
              </thead>
              <tbody>
                {collectorData.length > 0 ? (
                  collectorData.map((c, idx) => (
                    <tr key={c.collectorId || idx}>
                      <td>{U.bnDigits(idx + 1)}</td>
                      <td><b>{getCollectorName(c.collectorId)}</b></td>
                      <td style={{ textAlign: 'center' }}>{U.bnDigits(c.count)} টি</td>
                      <td className="amount" style={{ fontWeight: 700, color: 'var(--primary-dark)' }}>
                        {U.bnTaka(c.amount)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4" className="empty-state">
                      <div className="empty-state-icon">
                        <Inbox size={24} />
                      </div>
                      <div className="empty-state-title">এখনো কোনো আদায় এন্ট্রি হয়নি</div>
                      <p>
                        {U.monthLabel(selectedMonth)} মাসের জমা এন্ট্রি করলে কে কত টাকা
                        আদায় করেছেন তার হিসাব এখানে দেখা যাবে।
                      </p>
                      {!isReadOnly && (
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => setCurrentTab('charge-form')}
                        >
                          <ArrowRight size={16} />
                          <span>এন্ট্রি শুরু করুন</span>
                        </button>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* দোকান ভাড়া — এ মাসের হিসাবে */}
      {shopsReady && (
        <div className="card" style={{ marginTop: '18px' }}>
          <div className="card-header">
            <div className="card-title">
              <Store size={18} color="var(--success)" />
              <span>{U.monthLabel(selectedMonth)} — দোকান ভাড়া খাতে জমা</span>
            </div>
            <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--success)' }}>
              {U.bnTaka(shopMonth.totals.total)}
            </div>
          </div>
          <div className="card-body flush">
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: '110px' }}>দোকান</th>
                    <th>ভাড়াটিয়া</th>
                    <th>কোন মাসের ভাড়া</th>
                    <th className="amount">ভাড়া</th>
                    <th className="amount">বিদ্যুৎ বিল</th>
                    <th className="amount">মোট</th>
                  </tr>
                </thead>
                <tbody>
                  {shopMonth.rows.length > 0 ? (
                    shopMonth.rows.map((r) => (
                      <tr key={r.shop.id}>
                        <td><b>{Calc.shopLabel(r.shop)}</b></td>
                        <td>{r.shop.tenantName || '—'}</td>
                        <td style={{ fontSize: '12px' }}>{r.rentMonths.map(U.monthLabelShort).join(', ') || '—'}</td>
                        <td className="amount">{r.rent ? U.bnTaka(r.rent) : '—'}</td>
                        <td className="amount">{r.electricity ? U.bnTaka(r.electricity) : '—'}</td>
                        <td className="amount" style={{ fontWeight: 700, color: 'var(--primary-dark)' }}>
                          {U.bnTaka(r.total)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" className="empty-state">
                        <div className="empty-state-icon">
                          <Inbox size={24} />
                        </div>
                        <div className="empty-state-title">
                          {U.monthLabel(selectedMonth)} মাসের হিসাবে দোকান ভাড়ার কোনো জমা নেই
                        </div>
                        {!isReadOnly && (
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => setCurrentTab('shop-rent')}
                          >
                            <ArrowRight size={16} />
                            <span>দোকান ভাড়া এন্ট্রি</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
