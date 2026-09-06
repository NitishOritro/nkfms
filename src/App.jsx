import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { useAuth } from './context/AuthContext';
import { Sidebar } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { ToastContainer } from './components/Toast';

import { LoginView } from './views/LoginView';
import { DashboardView } from './views/DashboardView';

// ---------------------------------------------------------------------------
//  বাকি পেজগুলো লেজি-লোড — যে পেজে ঢোকা হয় কেবল তখনই তার কোড নামে।
//  এতে মোবাইল নেটওয়ার্কে প্রথম লোড অনেক হালকা হয়; লগইন ও ড্যাশবোর্ড
//  (ঢুকেই যা দেখা যায়) আগের মতোই মূল বান্ডেলে থাকে।
// ---------------------------------------------------------------------------
const lazyView = (loader, name) => lazy(() => loader().then((m) => ({ default: m[name] })));
const LedgerEntryView = lazyView(() => import('./views/LedgerEntryView'), 'LedgerEntryView');
const MonthlyCollectionView = lazyView(() => import('./views/MonthlyCollectionView'), 'MonthlyCollectionView');
const SingleFlatEntryView = lazyView(() => import('./views/SingleFlatEntryView'), 'SingleFlatEntryView');
const MonthlySummaryView = lazyView(() => import('./views/MonthlySummaryView'), 'MonthlySummaryView');
const DefaultersView = lazyView(() => import('./views/DefaultersView'), 'DefaultersView');
const ReportView = lazyView(() => import('./views/ReportView'), 'ReportView');
const FlatManagementView = lazyView(() => import('./views/FlatManagementView'), 'FlatManagementView');
const CollectorSignatoryView = lazyView(() => import('./views/CollectorSignatoryView'), 'CollectorSignatoryView');
const SettingsBackupView = lazyView(() => import('./views/SettingsBackupView'), 'SettingsBackupView');
const ServiceChargeEntryFormView = lazyView(() => import('./views/ServiceChargeEntryFormView'), 'ServiceChargeEntryFormView');

// ---------------------------------------------------------------------------
//  পেজের নাম — ঠিকানার হ্যাশ ও ব্রাউজার ট্যাবের শিরোনাম, দুটোরই উৎস
// ---------------------------------------------------------------------------
const PAGE_TITLES = {
  dashboard: 'সার্ভিস চার্জ ড্যাশবোর্ড',
  collection: 'মাসিক আদায় এন্ট্রি',
  'charge-form': 'সার্ভিস চার্জ এন্ট্রি ফর্ম',
  'flat-entry': 'একক ফ্ল্যাট এন্ট্রি (বিগত ২৫ মাস)',
  summary: 'মাসিক হিসাবায়ন সারসংক্ষেপ',
  ledger: 'আয়-ব্যয় হিসাব',
  defaulters: 'বকেয়া ফ্ল্যাটের তালিকা',
  reports: 'অফিসিয়াল প্রিন্ট ও PDF রিপোর্ট',
  flats: 'ফ্ল্যাট ও মালিকদের তথ্য',
  collectors: 'টাকা আদায়কারী ও স্বাক্ষরকারী',
  settings: 'সফটওয়্যার সেটিংস ও ব্যাকআপ'
};

const SITE_NAME = 'নীলকণ্ঠ ফ্ল্যাট মালিক সমিতি';
const DEFAULT_TAB = 'dashboard';

// এই পাতাগুলোর ভেতরেই মাস বাছাইয়ের ঘর আছে, তাই নেভবারে আরেকটি দেখানো
// হয় না — দুটি ঘর পাশাপাশি থাকলে কোনটি কাজ করছে তা বোঝা যায় না।
const PAGE_HAS_MONTH_PICKER = ['reports', 'summary'];

// কেবল অ্যাডমিন লগইনে খোলা পেজ। ভিউ মোডে মেনু থেকে লুকানো তো থাকেই,
// কেউ ঠিকানায় সরাসরি #/collection লিখলেও যেন ঢুকতে না পারে।
// ভিউ মুডে ফ্ল্যাট মালিকদের জন্য থাকে শুধু: ড্যাশবোর্ড, মাসিক হিসাব
// সারসংক্ষেপ, বকেয়া তালিকা ও প্রিন্ট/PDF রিপোর্ট।
const ADMIN_ONLY_TABS = [
  'collection',
  'charge-form',
  'flat-entry',
  'ledger',
  'flats',
  'collectors',
  'settings'
];

/** ঠিকানার হ্যাশ (#/reports) থেকে পেজের নাম — অচেনা হলে ড্যাশবোর্ড */
function tabFromHash() {
  if (typeof window === 'undefined') return DEFAULT_TAB;
  let raw = window.location.hash || '';
  if (raw.charAt(0) === '#') raw = raw.slice(1);
  if (raw.charAt(0) === '/') raw = raw.slice(1);
  return Object.prototype.hasOwnProperty.call(PAGE_TITLES, raw) ? raw : DEFAULT_TAB;
}

export function App() {
  const { isAuthenticated, isReadOnly } = useAuth();

  // পেজের নামটি ঠিকানাতেই রাখা হয় (#/reports)। এতে —
  //   • রিফ্রেশ করলে একই পেজেই থাকা যায়, ড্যাশবোর্ডে ফিরে যেতে হয় না
  //   • ব্রাউজারের back / forward বোতাম কাজ করে
  //   • নির্দিষ্ট পেজের লিংক বুকমার্ক বা শেয়ার করা যায়
  const [currentTab, setCurrentTabState] = useState(tabFromHash);
  const [reportState, setReportState] = useState({ type: 'monthly', selectiveIds: null });
  // ছোট পর্দায় সাইডবার ড্রয়ার হয়ে যায়; বড় পর্দায় এই অবস্থার কোনো প্রভাব নেই
  const [navOpen, setNavOpen] = useState(false);

  const setCurrentTab = useCallback((tab) => {
    const next = Object.prototype.hasOwnProperty.call(PAGE_TITLES, tab) ? tab : DEFAULT_TAB;
    setCurrentTabState(next);
    if (window.location.hash !== '#/' + next) window.location.hash = '#/' + next;
  }, []);

  // back / forward বোতাম বা হাতে লেখা ঠিকানা
  useEffect(() => {
    const onHashChange = () => setCurrentTabState(tabFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // প্রথমবার হ্যাশ না থাকলে বসিয়ে দেওয়া — history-তে বাড়তি ধাপ যোগ না করে
  useEffect(() => {
    if (!window.location.hash) {
      window.history.replaceState(null, '', '#/' + DEFAULT_TAB);
    }
  }, []);

  // ভিউ মোডে অ্যাডমিন-পেজে ঢোকার চেষ্টা হলে ড্যাশবোর্ডে ফিরিয়ে দেওয়া
  useEffect(() => {
    if (isReadOnly && ADMIN_ONLY_TABS.includes(currentTab)) {
      setCurrentTab(DEFAULT_TAB);
    }
  }, [isReadOnly, currentTab, setCurrentTab]);

  // ব্রাউজার ট্যাবের নাম — কোন পেজে আছি তা ট্যাব দেখেই বোঝা যায়
  useEffect(() => {
    document.title = isAuthenticated
      ? `${PAGE_TITLES[currentTab] || 'ড্যাশবোর্ড'} — ${SITE_NAME}`
      : `লগইন — ${SITE_NAME}`;
  }, [currentTab, isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <>
        <LoginView />
        <ToastContainer />
      </>
    );
  }

  const getPageTitle = () => PAGE_TITLES[currentTab] || 'ড্যাশবোর্ড';

  const handleOpenSelectivePrint = (flatIds) => {
    setReportState({ type: 'selective', selectiveIds: flatIds });
    setCurrentTab('reports');
  };

  return (
    <div className="app-container">
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        open={navOpen}
        onClose={() => setNavOpen(false)}
      />

      <div className="main-content">
        <Navbar
          pageTitle={getPageTitle()}
          onOpenNav={() => setNavOpen(true)}
          showMonthPicker={!PAGE_HAS_MONTH_PICKER.includes(currentTab)}
        />

        {/* লেজি পেজের কোড নামতে যেটুকু সময় লাগে, তখন এই বার্তাটি দেখায় */}
        <Suspense fallback={<div className="page-loading">পেজ খুলছে…</div>}>
        {currentTab === 'dashboard' && <DashboardView setCurrentTab={setCurrentTab} />}
        {currentTab === 'collection' && !isReadOnly && <MonthlyCollectionView />}
        {currentTab === 'charge-form' && !isReadOnly && <ServiceChargeEntryFormView />}
        {currentTab === 'flat-entry' && !isReadOnly && (
          <SingleFlatEntryView onOpenLedger={() => setCurrentTab('reports')} />
        )}
        {currentTab === 'summary' && (
          <MonthlySummaryView
            onOpenPrint={() => {
              setReportState({ type: 'monthly', selectiveIds: null });
              setCurrentTab('reports');
            }}
          />
        )}
        {currentTab === 'ledger' && !isReadOnly && (
          <LedgerEntryView
            onOpenPrint={() => {
              // আয়-ব্যয়ের রিপোর্টটাই খুলবে, আর ছাপার ঘরও নিজে থেকে আসবে
              setReportState({ type: 'cashbook', selectiveIds: null, autoPrint: true });
              setCurrentTab('reports');
            }}
          />
        )}
        {currentTab === 'defaulters' && <DefaultersView onOpenSelectivePrint={handleOpenSelectivePrint} />}
        {currentTab === 'reports' && (
          <ReportView
            defaultReport={reportState.type}
            selectiveFlatIds={reportState.selectiveIds}
            autoPrint={reportState.autoPrint}
            onAutoPrintDone={() => setReportState((p) => ({ ...p, autoPrint: false }))}
          />
        )}
        {currentTab === 'flats' && !isReadOnly && <FlatManagementView />}
        {currentTab === 'collectors' && !isReadOnly && <CollectorSignatoryView />}
        {currentTab === 'settings' && !isReadOnly && <SettingsBackupView />}
        </Suspense>
      </div>

      <ToastContainer />
    </div>
  );
}

export default App;
