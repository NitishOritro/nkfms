import React, { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import * as Calc from '../utils/calc';
import * as U from '../utils/format';
import { ClipboardList, Lock, Save, AlertTriangle, Eye, Info } from 'lucide-react';

// ============================================================================
//  সার্ভিস চার্জ এন্ট্রি ফর্ম
//  --------------------------------------------------------------------------
//  চলতি ও পরবর্তী মাসগুলোর নিয়মিত জমা এন্ট্রির মূল ফর্ম।
//  (বিগত ২৫ মাসের ব্যাকলগ ডাটার জন্য "একক ফ্ল্যাট এন্ট্রি" পেজটি আলাদা)
//
//  ঘরগুলো দুই কলামের গ্রিডে — প্রতি সারিতে সম্পর্কিত দুটি ঘর:
//      মালিকের নাম        |  ফ্ল্যাট নম্বর   (নাম থেকে নিজে বসে)
//      সার্ভিস চার্জের মাস |  পূর্বের বকেয়া   (নাম ও মাস থেকে নিজে বসে)
//      সার্ভিস চার্জের টাকা |  আদায়কারী
//      কার পার্কিং চার্জ   |  —              (ডাটাবেজে কলাম নেই, তাই নিষ্ক্রিয়)
//
//  একই ফ্ল্যাট ও একই মাসে আগে এন্ট্রি থাকলে সেটি চুপচাপ মুছে যায় না —
//  আগের অঙ্ক দেখিয়ে সুস্পষ্ট নিশ্চিতকরণ চাওয়া হয়।
// ============================================================================

export function ServiceChargeEntryFormView() {
  const { data, selectedMonth, getPayment, setPayment, canWrite, addToast } = useData();

  const [flatId, setFlatId] = useState('');
  const [month, setMonth] = useState(selectedMonth);
  const [serviceCharge, setServiceCharge] = useState('');
  const [collectorId, setCollectorId] = useState('');
  const [error, setError] = useState('');
  // আগের এন্ট্রি থাকলে কী করা হবে: 'add' = আগের জমার সাথে যোগ,
  // 'replace' = আগেরটি মুছে নতুন অঙ্ক। খালি মানে এখনো বাছা হয়নি।
  const [overwriteMode, setOverwriteMode] = useState('');

  const flats = useMemo(
    () => data.flats.slice().sort((a, b) => (a.serial || 0) - (b.serial || 0)),
    [data.flats]
  );

  const collectors = data.settings.collectors || [];
  const selectedFlat = flats.find((f) => f.id === flatId) || null;

  // মাসের তালিকা — শুরুর মাস থেকে চলতি মাস পর্যন্ত (স্বয়ংক্রিয়ভাবে এগোয়)
  const months = useMemo(() => Calc.monthOptions(data), [data]);

  // বর্তমান বকেয়া = নির্বাচিত মাস পর্যন্ত হিসাব — এ মাসের ধার্য এবং এ
  // মাসে ইতিমধ্যে দেওয়া জমাও ধরা। আগে এখানে আগের মাস পর্যন্ত দেখানো হতো;
  // তাতে এ মাসে কিছু জমা পড়ে থাকলে আদায়কারী ভুল অঙ্ক দেখতেন।
  const prevStatus = useMemo(() => {
    if (!selectedFlat || !month) return null;
    return Calc.flatStatus(data, selectedFlat, month);
  }, [data, selectedFlat, month]);

  const monthRate = useMemo(
    () => (month ? Calc.rateForMonth(data.settings, month, selectedFlat || undefined) : 0),
    [data.settings, month, selectedFlat]
  );

  // এই ফ্ল্যাট ও মাসে আগে থেকে এন্ট্রি আছে কিনা
  const existing = flatId && month ? getPayment(flatId, month) : null;

  const previousDueText = () => {
    if (!selectedFlat || !prevStatus) return '';
    if (prevStatus.advance > 0) return `${U.bnTaka(prevStatus.advance)} (অগ্রীম জমা)`;
    return U.bnTaka(prevStatus.due);
  };

  const collectorName = (id) => {
    const c = collectors.find((x) => x.id === id);
    return c ? c.bn || c.en : '';
  };

  const resetForm = (keepMonth = false) => {
    setFlatId('');
    setServiceCharge('');
    setCollectorId('');
    setError('');
    setOverwriteMode('');
    if (!keepMonth) setMonth(selectedMonth);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!canWrite) {
      setError('সংরক্ষণ করতে অ্যাডমিন হিসেবে লগইন করুন। ভিউ মোডে কেবল দেখা যায়।');
      return;
    }
    if (!flatId) { setError('ফ্ল্যাট মালিক নির্বাচন করুন।'); return; }
    if (!month) { setError('সার্ভিস চার্জের মাস নির্বাচন করুন।'); return; }

    const amount = Number(serviceCharge);
    if (!serviceCharge || Number.isNaN(amount) || amount <= 0) {
      setError('সার্ভিস চার্জের টাকার অঙ্ক লিখুন (০ এর বেশি হতে হবে)।');
      return;
    }
    if (!collectorId) { setError('সার্ভিস চার্জ আদায়কারী নির্বাচন করুন।'); return; }

    // আগের এন্ট্রি থাকলে না জানিয়ে কিছু করা হয় না — যোগ না বদল, বেছে নিতে হয়
    if (existing && !overwriteMode) {
      setError('এই মাসে আগে থেকেই একটি এন্ট্রি আছে। নিচে বেছে নিন — আগের জমার সাথে যোগ হবে, নাকি বদলে যাবে।');
      return;
    }

    const finalAmount = existing && overwriteMode === 'add'
      ? Number(existing.amount) + amount
      : amount;
    setPayment(flatId, month, { amount: finalAmount, collectorId });
    addToast(
      existing && overwriteMode === 'add'
        ? `${selectedFlat.flatNo} — আগের ${U.bnTaka(existing.amount)}-এর সাথে ${U.bnTaka(amount)} যোগ হয়ে ${U.monthLabel(month)} মাসে মোট ${U.bnTaka(finalAmount)} সংরক্ষিত হয়েছে।`
        : `${selectedFlat.flatNo} — ${U.monthLabel(month)} মাসে ${U.bnTaka(amount)} সংরক্ষিত হয়েছে।`,
      'success'
    );
    resetForm(true); // পরের এন্ট্রির জন্য মাসটি রেখে দেওয়া হয়
  };

  return (
    <div className="page-body">
      <form onSubmit={handleSubmit} className="card charge-form-card">
        <div className="card-header">
          <div>
            <div className="card-title">
              <ClipboardList size={18} color="var(--primary)" />
              <span>সার্ভিস চার্জ এন্ট্রি ফর্ম</span>
            </div>
            <div className="card-subtitle">
              ফ্ল্যাট মালিক নির্বাচন করলে ফ্ল্যাট নম্বর ও বর্তমান বকেয়া নিজে থেকেই বসে যাবে।
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
            {/* ---- ১. ফ্ল্যাট মালিকের নাম ---- */}
            <div className="charge-field">
              <label className="charge-field-label" htmlFor="scf-owner">
                ফ্ল্যাট মালিকের নাম
              </label>
              <select
                id="scf-owner"
                className="form-select"
                value={flatId}
                onChange={(e) => { setFlatId(e.target.value); setConfirmOverwrite(false); setError(''); }}
              >
                <option value="">— মালিক নির্বাচন করুন —</option>
                {flats.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.ownerName || 'নামহীন'} ({f.flatNo})
                  </option>
                ))}
              </select>
              <span className="charge-field-hint">
                মোট {U.bnDigits(flats.length)} জন মালিকের তালিকা
              </span>
            </div>

            {/* ---- ২. ফ্ল্যাট নম্বর (স্বয়ংক্রিয়) ---- */}
            <div className="charge-field">
              <label className="charge-field-label" htmlFor="scf-flat">ফ্ল্যাট নম্বর</label>
              <input
                id="scf-flat"
                type="text"
                className="form-input is-auto"
                value={selectedFlat ? selectedFlat.flatNo : ''}
                placeholder="মালিক নির্বাচন করলে এখানে বসবে"
                readOnly
                tabIndex={-1}
              />
              <span className="charge-field-hint">
                <Lock size={12} /> স্বয়ংক্রিয় — লেখা যাবে না
              </span>
            </div>

            {/* ---- ৩. সার্ভিস চার্জের মাস ---- */}
            <div className="charge-field">
              <label className="charge-field-label" htmlFor="scf-month">সার্ভিস চার্জের মাস</label>
              <select
                id="scf-month"
                className="form-select"
                value={month}
                onChange={(e) => { setMonth(e.target.value); setConfirmOverwrite(false); setError(''); }}
              >
                {months.map((m) => (
                  <option key={m} value={m}>{U.monthLabel(m)}</option>
                ))}
              </select>
              <span className="charge-field-hint">
                এ মাসের ধার্য হার: <b>{U.bnTaka(monthRate)}</b>
              </span>
            </div>

            {/* ---- ৪. বর্তমান বকেয়া (স্বয়ংক্রিয়) ---- */}
            <div className="charge-field">
              <label className="charge-field-label" htmlFor="scf-due">বর্তমান বকেয়া</label>
              <input
                id="scf-due"
                type="text"
                className={`form-input is-auto ${prevStatus && prevStatus.due > 0 ? 'is-due' : ''} ${
                  prevStatus && prevStatus.advance > 0 ? 'is-advance' : ''
                }`}
                value={previousDueText()}
                placeholder="মালিক নির্বাচন করলে এখানে বসবে"
                readOnly
                tabIndex={-1}
              />
              <span className="charge-field-hint">
                <Lock size={12} />{' '}
                {month ? `${U.monthLabel(month)} পর্যন্ত, এ মাসের জমাসহ হিসাব` : 'স্বয়ংক্রিয়'}
              </span>
            </div>

            {/* ---- ৫. সার্ভিস চার্জের টাকা ---- */}
            <div className="charge-field">
              <label className="charge-field-label" htmlFor="scf-amount">সার্ভিস চার্জের টাকা</label>
              <input
                id="scf-amount"
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                className="form-input"
                value={serviceCharge}
                onChange={(e) => { setServiceCharge(e.target.value); setError(''); }}
                placeholder={String(monthRate || 0)}
                disabled={!canWrite}
              />
              <span className="charge-field-hint">
                {canWrite && monthRate > 0 ? (
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => { setServiceCharge(String(monthRate)); setError(''); }}
                  >
                    ধার্য হার {U.bnTaka(monthRate)} বসান
                  </button>
                ) : (
                  'টাকার অঙ্ক লিখুন'
                )}
              </span>
            </div>

            {/* ---- ৬. সার্ভিস চার্জ আদায়কারী ---- */}
            <div className="charge-field">
              <label className="charge-field-label" htmlFor="scf-collector">
                সার্ভিস চার্জ আদায়কারী
              </label>
              <select
                id="scf-collector"
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

            {/* ---- ৭. কার পার্কিং চার্জ (এখনো চালু হয়নি) ---- */}
            <div className="charge-field is-disabled">
              <label className="charge-field-label" htmlFor="scf-parking">কার পার্কিং চার্জ</label>
              <input
                id="scf-parking"
                type="text"
                className="form-input is-auto"
                value=""
                placeholder="পরবর্তীতে চালু করা হবে"
                readOnly
                disabled
              />
              <span className="charge-field-hint">
                <Lock size={12} /> আপাতত বন্ধ
              </span>
            </div>

            {/* ---- ৮. সহায়িকা ----
                ফিল্ড ৭টি, গ্রিড ২ কলামের — তাই শেষ সারির ডান ঘরটি ফাঁকা
                পড়ে থাকত। এখানে কাজের নির্দেশনা বসিয়ে সেই ফাঁক পূরণ করা
                হলো, নতুন কেউ ফর্মটি ব্যবহার করলে যাতে দ্বিধা না থাকে। */}
            <div className="charge-field charge-help">
              <div className="charge-help-title">
                <Info size={14} /> মনে রাখবেন
              </div>
              <ul>
                <li>মালিক নির্বাচন করলে ফ্ল্যাট নম্বর ও বর্তমান বকেয়া নিজে থেকেই বসে।</li>
                <li>জমার তারিখ ধরা হয় নির্বাচিত মাসের শেষ দিন।</li>
                <li>একই মাসে আগে এন্ট্রি থাকলে সংরক্ষণের আগে সতর্ক করা হবে।</li>
              </ul>
            </div>
          </div>

          {/* ---- এই মাসে আগে থেকে এন্ট্রি থাকলে সতর্কতা ---- */}
          {existing && (
            <div className="form-warn">
              <AlertTriangle size={18} />
              <div>
                <div>
                  <b>{selectedFlat.flatNo}</b> ফ্ল্যাটের <b>{U.monthLabel(month)}</b> মাসে
                  ইতিমধ্যে <b>{U.bnTaka(existing.amount)}</b> জমা আছে
                  {existing.collectorId ? ` (আদায়কারী: ${collectorName(existing.collectorId)})` : ''}।
                  নতুন অঙ্কটি কীভাবে ধরা হবে, বেছে নিন:
                </div>
                <label className="form-confirm">
                  <input
                    type="radio"
                    name="scf-overwrite"
                    checked={overwriteMode === 'add'}
                    onChange={() => { setOverwriteMode('add'); setError(''); }}
                    disabled={!canWrite}
                  />
                  <span>
                    আগের জমার সাথে <b>যোগ</b> হবে
                    {Number(serviceCharge) > 0 &&
                      ` (মোট হবে ${U.bnTaka(Number(existing.amount) + Number(serviceCharge))})`}
                  </span>
                </label>
                <label className="form-confirm">
                  <input
                    type="radio"
                    name="scf-overwrite"
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

          {/* ---- নির্বাচিত মালিকের সংক্ষিপ্ত তথ্য ---- */}
          {selectedFlat && prevStatus && (
            <div className="charge-form-summary">
              <div className="s-item">
                <span className="s-label">ফ্ল্যাট</span>
                <span className="s-value">{selectedFlat.flatNo}</span>
              </div>
              <div className="s-item">
                <span className="s-label">মালিক</span>
                <span className="s-value">{selectedFlat.ownerName || '—'}</span>
              </div>
              <div className="s-item">
                <span className="s-label">মোবাইল</span>
                <span className="s-value">
                  {selectedFlat.phone ? U.bnDigits(selectedFlat.phone) : '—'}
                </span>
              </div>
              <div className="s-item">
                <span className="s-label">আদায়কারী</span>
                <span className="s-value">{collectorName(collectorId) || '—'}</span>
              </div>
              <div className="s-item">
                <span className="s-label">
                  {prevStatus.advance > 0 ? 'বর্তমান অগ্রীম' : 'বর্তমান বকেয়া'}
                </span>
                <span
                  className="s-value"
                  style={{
                    color:
                      prevStatus.advance > 0
                        ? 'var(--success-dark)'
                        : prevStatus.due > 0
                          ? 'var(--danger)'
                          : 'var(--text-main)'
                  }}
                >
                  {U.bnTaka(prevStatus.advance > 0 ? prevStatus.advance : prevStatus.due)}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <span className="charge-form-foot-note">
            জমার তারিখ ধরা হবে {month ? U.monthLabel(month) : 'নির্বাচিত মাসের'} মাসের শেষ দিন।
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
