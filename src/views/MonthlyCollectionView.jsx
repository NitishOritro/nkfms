import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import * as Calc from '../utils/calc';
import * as U from '../utils/format';
import { Receipt, Sparkles, Save, Eraser, Printer } from 'lucide-react';
import { Modal } from '../components/Modal';
import { Pagination } from '../components/Pagination';
import { useAuth } from '../context/AuthContext';

export function MonthlyCollectionView() {
  const { data, selectedMonth, setPayment, deletePayment, bulkSetPayments, addToast } = useData();
  const { isReadOnly } = useAuth();
  const [receiptModal, setReceiptModal] = useState({ isOpen: false, flat: null, payment: null });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState('all');

  const flats = [...data.flats].sort((a, b) => (a.serial || 0) - (b.serial || 0));
  const { rows, totals } = Calc.summary(data, selectedMonth);

  // "আগের মাস পর্যন্ত বকেয়া" — এ মাসের ধার্য বা জমা কোনোটাই এতে নেই।
  // আগে এখানে দুটি কলাম ছিল (পূর্বের/নতুন বকেয়া); হিসাবটি বিভ্রান্তিকর
  // ছিল — জমা বসালে "নতুন বকেয়া" পূর্বেরটির চেয়ে বেড়ে যেত (জমা দুবার
  // বিয়োগ হতো)। এখন একটিই কলাম: গত মাস শেষে কত পাওনা ছিল।
  const prevMonth = U.addMonths(selectedMonth, -1);
  const prevDueByFlat = new Map(
    Calc.summary(data, prevMonth).rows.map((r) => [r.flat.id, r.due])
  );

  const paginatedRows = pageSize === 'all' ? rows : rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleInputChange = (flatId, field, value) => {
    const existing = data.payments.find((p) => p.flatId === flatId && p.month === selectedMonth) || {};
    const updated = {
      amount: field === 'amount' ? value : (existing.amount ?? ''),
      collectorId: field === 'collectorId' ? value : (existing.collectorId || ''),
      receivedOn: field === 'receivedOn' ? value : (existing.receivedOn || U.monthEndIso(selectedMonth)),
      note: field === 'note' ? value : (existing.note || '')
    };

    if (field === 'amount' && (value === '' || value == null)) {
      deletePayment(flatId, selectedMonth);
    } else {
      setPayment(flatId, selectedMonth, updated);
    }
  };

  // এন্ট্রি সেভ করুন — ঘরে লেখা টাকাই সেভ হয়; ঘর খালি থাকলে ধার্যকৃত চার্জ বসে যায়।
  const handleSaveEntry = (flat) => {
    const rate = Calc.rateForMonth(data.settings, selectedMonth, flat);
    const existing = data.payments.find((p) => p.flatId === flat.id && p.month === selectedMonth) || {};
    const amount = Number(existing.amount) > 0 ? Number(existing.amount) : rate;
    setPayment(flat.id, selectedMonth, {
      amount,
      collectorId: existing.collectorId || (data.settings.collectors[0]?.id || ''),
      receivedOn: existing.receivedOn || U.monthEndIso(selectedMonth),
      note: existing.note || ''
    });
    addToast(`${flat.flatNo} — ${U.bnNumber(amount)}/- টাকার এন্ট্রি সেভ হয়েছে।`);
  };

  // ডাটা ক্লীয়ার করুন — এ মাসের এন্ট্রি মুছে ফেলে।
  const handleClearEntry = (flat) => {
    deletePayment(flat.id, selectedMonth);
    addToast(`${flat.flatNo} — এ মাসের এন্ট্রি ক্লীয়ার করা হয়েছে।`, 'warning');
  };

  const handleBulkFillThisMonth = () => {
    const toUpdate = [];
    let count = 0;
    flats.forEach((f) => {
      const existing = data.payments.find((p) => p.flatId === f.id && p.month === selectedMonth);
      if (!existing || !existing.amount || Number(existing.amount) <= 0) {
        const rate = Calc.rateForMonth(data.settings, selectedMonth, f);
        toUpdate.push({
          flatId: f.id,
          month: selectedMonth,
          amount: rate,
          collectorId: data.settings.collectors[0]?.id || '',
          receivedOn: U.monthEndIso(selectedMonth)
        });
        count += 1;
      }
    });

    if (count > 0) {
      bulkSetPayments(toUpdate);
      addToast(`${U.bnDigits(count)} টি ফ্ল্যাটের সার্ভিস চার্জ পূরণ করা হয়েছে।`);
    } else {
      addToast('এই মাসের সকল ফ্ল্যাটের জমা ইতিমধ্যেই লেখা আছে।', 'warning');
    }
  };

  const handlePrintReceipt = (flat, payment) => {
    setReceiptModal({ isOpen: true, flat, payment });
  };

  return (
    <div className="page-body">
      {/* Top Action Header */}
      <div
        className="card"
        style={{
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px',
          overflow: 'visible'
        }}
      >
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)' }}>
            {U.monthLabel(selectedMonth)} — মাসিক আদায় এন্ট্রি
          </h2>
          <p style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
            নিচে প্রতিটি ফ্ল্যাটের এ মাসের জমা, আদায়কারী ও তারিখ পূরণ করুন (ইনপুট দেওয়ার সাথে সাথে অটো-সেভ হবে)।
          </p>
        </div>

        {!isReadOnly && (
          <button onClick={handleBulkFillThisMonth} className="btn btn-primary btn-sm">
            <Sparkles size={15} />
            <span>সবার জন্য ১,৫০০/- বসান</span>
          </button>
        )}
      </div>

      {/* Main Collection Table */}
      <div className="card">
        <div className="card-body flush">
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '46px', textAlign: 'center' }}>ক্রম</th>
                  <th style={{ width: '70px' }}>ফ্ল্যাট</th>
                  <th style={{ minWidth: '160px' }}>মালিকের নাম</th>
                  <th style={{ width: '130px', textAlign: 'right' }}>{U.monthLabel(prevMonth)}<br />পর্যন্ত বকেয়া</th>
                  <th style={{ width: '130px' }}>{U.monthLabel(selectedMonth)}<br />মাসে জমা</th>
                  <th style={{ width: '120px', textAlign: 'right' }}>বর্তমান বকেয়া<br />({U.monthLabel(selectedMonth).replace(' ', '-')})</th>
                  <th style={{ width: '170px' }}>আদায়কারী</th>
                  <th style={{ width: '150px' }}>জমার তারিখ</th>
                  <th style={{ width: '230px', textAlign: 'center' }}>কার্যক্রম</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((r, idx) => {
                  const flat = r.flat;
                  const payment = data.payments.find((p) => p.flatId === flat.id && p.month === selectedMonth);
                  const isPaid = payment && Number(payment.amount) > 0;
                  const prevDue = prevDueByFlat.get(flat.id) || 0;

                  return (
                    <tr key={flat.id} className={isPaid ? 'paid-row' : ''}>
                      <td style={{ textAlign: 'center', color: '#64748b' }}>{U.bnDigits(flat.serial)}</td>
                      <td><b>{flat.flatNo}</b></td>
                      <td>{flat.ownerName}</td>
                      <td style={{ textAlign: 'right', color: prevDue > 0 ? 'var(--danger)' : '#64748b', fontWeight: 600 }}>
                        {prevDue > 0 ? U.bnNumber(prevDue) : '০'}
                      </td>
                      <td>
                        <input
                          type="number"
                          step="100"
                          min="0"
                          disabled={isReadOnly}
                          className="table-input"
                          style={{ background: isReadOnly ? '#f8fafc' : '#fff', cursor: isReadOnly ? 'default' : 'auto' }}
                          value={payment ? payment.amount : ''}
                          placeholder={isReadOnly ? '—' : U.bnNumber(r.monthRate)}
                          onChange={(e) => handleInputChange(flat.id, 'amount', e.target.value)}
                        />
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: r.due > 0 ? 'var(--danger)' : 'var(--success)' }}>
                        {r.due > 0 ? U.bnNumber(r.due) : '০'}
                      </td>
                      <td>
                        <select
                          className="table-input"
                          disabled={isReadOnly}
                          style={{ background: isReadOnly ? '#f8fafc' : '#fff', cursor: isReadOnly ? 'default' : 'pointer' }}
                          value={payment ? payment.collectorId : ''}
                          onChange={(e) => handleInputChange(flat.id, 'collectorId', e.target.value)}
                        >
                          <option value="">-- আদায়কারী --</option>
                          {(data.settings.collectors || []).map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.bn || c.en}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="date"
                          disabled={isReadOnly}
                          className="table-input"
                          style={{ background: isReadOnly ? '#f8fafc' : '#fff', cursor: isReadOnly ? 'default' : 'auto' }}
                          value={payment ? payment.receivedOn : ''}
                          onChange={(e) => handleInputChange(flat.id, 'receivedOn', e.target.value)}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', flexWrap: 'nowrap' }}>
                          <button
                            onClick={() => handleSaveEntry(flat)}
                            disabled={isReadOnly}
                            className="btn btn-outline btn-sm"
                            title={`এন্ট্রি সেভ করুন (ধার্য ${U.bnNumber(r.monthRate)}/-)`}
                            style={{ padding: '3px 7px', fontSize: '11px', color: isReadOnly ? undefined : 'var(--success)' }}
                          >
                            <Save size={13} />
                            <span>সেভ</span>
                          </button>
                          <button
                            onClick={() => handlePrintReceipt(flat, payment)}
                            disabled={!isPaid}
                            className="btn btn-outline btn-sm"
                            title={isPaid ? 'রিসিট দেখুন' : 'জমা না থাকলে রিসিট দেখা যাবে না'}
                            style={{ padding: '3px 7px', fontSize: '11px', color: isPaid ? 'var(--primary)' : undefined }}
                          >
                            <Receipt size={13} />
                            <span>রিসিট</span>
                          </button>
                          <button
                            onClick={() => handleClearEntry(flat)}
                            disabled={isReadOnly || !isPaid}
                            className="btn btn-outline btn-sm"
                            title={isPaid ? 'ডাটা ক্লীয়ার করুন' : 'ক্লীয়ার করার মতো কোনো এন্ট্রি নেই'}
                            style={{ padding: '3px 7px', fontSize: '11px', color: !isReadOnly && isPaid ? '#ef4444' : undefined }}
                          >
                            <Eraser size={13} />
                            <span>ক্লীয়ার</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                  {/* ঘরগুলো উপরের ৯টি কলামের সাথে মিলিয়ে: ৪ (লেবেল) + জমা +
                      বর্তমান বকেয়া + ২ (গণনা) + কার্যক্রম                    */}
                  <td colSpan="4" style={{ textAlign: 'right' }}>এ মাসে সর্বমোট আদায়:</td>
                  <td style={{ color: 'var(--primary)', fontSize: '13.5px' }}>{U.bnTaka(totals.monthCollected)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--danger)', fontSize: '13.5px' }}>
                    {U.bnTaka(totals.totalDue)}
                  </td>
                  <td colSpan="2" style={{ color: '#64748b' }}>
                    {U.bnDigits(totals.paidThisMonth)} টি ফ্ল্যাট পরিশোধ করেছে
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <Pagination
            currentPage={currentPage}
            totalItems={rows.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setCurrentPage(1);
            }}
            pageSizeOptions={[10, 15, 25, 'all']}
          />
        </div>
      </div>

      {/* Money Receipt Modal */}
      {receiptModal.isOpen && receiptModal.flat && receiptModal.payment && (
        <Modal
          isOpen={receiptModal.isOpen}
          onClose={() => setReceiptModal({ isOpen: false, flat: null, payment: null })}
          title="সার্ভিস চার্জ আদায়ের মানি রসিদ"
          footer={
            <>
              <button onClick={() => window.print()} className="btn btn-primary">
                <Printer size={15} />
                <span>রসিদ প্রিন্ট করুন</span>
              </button>
              <button onClick={() => setReceiptModal({ isOpen: false, flat: null, payment: null })} className="btn btn-outline">
                বন্ধ করুন
              </button>
            </>
          }
        >
          <div
            style={{
              border: '2px solid #0f172a',
              borderRadius: 'var(--radius-md)',
              padding: '16px 20px',
              background: '#fafafa'
            }}
          >
            <div style={{ textAlign: 'center', borderBottom: '1px solid #cbd5e1', paddingBottom: '10px', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--society)' }}>{data.settings.societyName}</h3>
              <p style={{ fontSize: '12px', color: '#64748b' }}>{data.settings.committeeName}</p>
              <span style={{ display: 'inline-block', marginTop: '6px', background: '#0284c7', color: '#fff', padding: '2px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: 700 }}>
                সার্ভিস চার্জ আদায় রসিদ
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px', marginBottom: '12px' }}>
              <div>রসিদ নং: <b>{receiptModal.flat.flatNo}-{U.monthLabelEn(receiptModal.payment.month)}</b></div>
              <div style={{ textAlign: 'right' }}>তারিখ: <b>{U.dateLabel(receiptModal.payment.receivedOn)}</b></div>
              <div>ফ্ল্যাট নং: <b>{receiptModal.flat.flatNo}</b></div>
              <div style={{ textAlign: 'right' }}>মালিকের নাম: <b>{receiptModal.flat.ownerName}</b></div>
              <div>হিসাব মাস: <b>{U.monthLabel(receiptModal.payment.month)}</b></div>
              <div style={{ textAlign: 'right' }}>
                আদায়কারী: <b>{(data.settings.collectors.find((c) => c.id === receiptModal.payment.collectorId)?.bn) || '—'}</b>
              </div>
            </div>

            <div
              style={{
                background: '#ecfdf5',
                border: '1px dashed #10b981',
                borderRadius: 'var(--radius-md)',
                padding: '12px',
                textAlign: 'center',
                fontSize: '18px',
                fontWeight: 700,
                color: '#065f46',
                margin: '14px 0'
              }}
            >
              জমাকৃত টাকা: {U.bnTaka(receiptModal.payment.amount)}/-
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '30px', fontSize: '12px', color: '#475569' }}>
              <div style={{ borderTop: '1px solid #64748b', width: '130px', textAlign: 'center', paddingTop: '4px' }}>
                জমাদানকারীর স্বাক্ষর
              </div>
              <div style={{ borderTop: '1px solid #64748b', width: '130px', textAlign: 'center', paddingTop: '4px' }}>
                আদায়কারীর স্বাক্ষর
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
