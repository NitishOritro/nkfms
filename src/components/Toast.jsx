import React from 'react';
import { useData } from '../context/DataContext';
import { CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react';

// ---------------------------------------------------------------------------
//  নিশ্চিতকরণ পপ-আপ
//
//  আগে এটি পর্দার নিচ-ডানে ছোট টোস্ট ছিল — চোখ এড়িয়ে যেত। এখন পর্দার
//  মাঝখানে কার্ড হয়ে আসে: রঙিন আইকন, শিরোনাম, বার্তা ও "ঠিক আছে" বোতাম।
//
//  বন্ধ হয় তিনভাবে — "ঠিক আছে" চাপলে, পর্দার যেকোনো জায়গায় ক্লিক করলে,
//  আর কিছু না করলে কয়েক সেকেন্ড পর নিজে থেকেই (DataContext-এর টাইমার)।
//  ফলে পরপর অনেক এন্ট্রি দেওয়ার সময় প্রতিবার ক্লিক করা বাধ্যতামূলক নয়।
// ---------------------------------------------------------------------------

const KIND = {
  success: { Icon: CheckCircle2, title: 'সফল হয়েছে' },
  error: { Icon: AlertCircle, title: 'সমস্যা হয়েছে' },
  warning: { Icon: AlertTriangle, title: 'সতর্কতা' },
};

export function ToastContainer() {
  const { toasts, removeToast } = useData();

  if (!toasts.length) return null;

  const closeAll = () => toasts.forEach((t) => removeToast(t.id));

  return (
    <div className="toast-overlay no-print" onClick={closeAll} role="presentation">
      {toasts.map((t) => {
        const kind = KIND[t.type] || KIND.success;
        const { Icon } = kind;
        return (
          <div
            key={t.id}
            className={`toast-card ${t.type || 'success'}`}
            role="alertdialog"
            aria-label={kind.title}
          >
            <div className="toast-icon">
              <Icon size={32} strokeWidth={2.2} />
            </div>
            <div className="toast-title">{kind.title}</div>
            <div className="toast-msg">{t.message}</div>
            <button type="button" className="toast-ok" onClick={() => removeToast(t.id)}>
              ঠিক আছে
            </button>
          </div>
        );
      })}
    </div>
  );
}
