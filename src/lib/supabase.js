import { createClient } from '@supabase/supabase-js';
import { createLocalClient } from './localClient';

// npm run dev:local (vite --mode backup) — তখন আসল ডাটাবেজের বদলে
// ব্যাকআপ-চালিত নকল ক্লায়েন্ট বসে; লাইভে কিছুই লেখা বা পড়া হয় না।
// import.meta.env.DEV দ্বিতীয় তালা: vite build সবসময় DEV=false দেয়,
// তাই ভুল করে "vite build --mode backup" চালালেও প্রোডাকশন বিল্ডে
// লোকাল-মোড ঢোকা অসম্ভব — ডেপ্লয় হওয়া সাইট সবসময় আসল ডাটাবেজে চলে।
export const isLocalDataMode = import.meta.env.DEV && import.meta.env.MODE === 'backup';

// হোস্টিংয়ে (Vercel/Netlify) Environment Variable বসানো না থাকলেও অ্যাপ যেন
// চলে — তাই সংযোগের তথ্য এখানে ডিফল্ট হিসেবে রাখা হলো।
//
// anon key গোপন নয় — এটি ব্রাউজারে যাওয়ার জন্যই তৈরি; বিল্ড করলে এমনিতেও
// এটি JS ফাইলে ছাপা হয়ে সবার কাছে পৌঁছায়। আসল সুরক্ষা ডাটাবেজের RLS
// নিয়মে — এই কী দিয়ে পড়া যায় (অ্যাপে "পাসওয়ার্ড ছাড়া দেখুন" মোড আছে),
// কিন্তু লেখা যায় না — লিখতে হলে অ্যাডমিন লগইন লাগে।
//
// service_role / secret key কখনো এখানে রাখবেন না — সেটি RLS উপেক্ষা করে।
const FALLBACK_URL = 'https://grpgntaayuwciudswfxl.supabase.co';
const FALLBACK_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdycGdudGFheXV3Y2l1ZHN3ZnhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxODgyOTEsImV4cCI6MjEwMzc2NDI5MX0.rBTlM_Ztpe4vgTEPUH2vhYWBbhbKWifIDkpylCitp4Y';

// Supabase ড্যাশবোর্ডে "Project URL" এর পাশেই REST endpoint-টি
// (.../rest/v1/) দেখায়। ভুল করে সেটি কপি করলে supabase-js আবার নিজে
// /rest/v1 জুড়ে দেয় — পথ হয় /rest/v1/rest/v1/flats, আর PostgREST
// PGRST125 "Invalid path specified in request URL" ফেরায়। তাই শেষের
// স্ল্যাশ ও /rest/v1 অংশটুকু এখানেই ছেঁটে নেওয়া হয়।
const cleanUrl = (u) =>
  (u || '').trim().replace(/\/+$/, '').replace(/\/rest\/v\d+$/, '');

// .env থাকলে সেটিই অগ্রাধিকার পায়, তাই অন্য প্রজেক্টে সরানো সহজ থাকলো।
const url = cleanUrl(import.meta.env.VITE_SUPABASE_URL) || FALLBACK_URL;
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim() || FALLBACK_ANON_KEY;

if (!url || !anonKey) {
  console.error(
    'Supabase সংযোগের তথ্য পাওয়া যায়নি। src/lib/supabase.js এর FALLBACK_URL / ' +
      'FALLBACK_ANON_KEY দেখুন, অথবা .env বসান (নমুনা: .env.example)।'
  );
}

// createClient-কে খালি স্ট্রিং দিলে সে সাথে সাথেই "supabaseUrl is required"
// ছুড়ে দেয় — মডিউল লোডেই অ্যাপ ভেঙে সাদা স্ক্রিন আসে, আর নিচের
// hasSupabaseConfig গার্ডগুলো কখনো চলার সুযোগই পায় না। তাই .env না থাকলে
// একটি নিরীহ প্লেসহোল্ডার দেওয়া হয়; এতে অ্যাপ চালু হয় এবং DataContext
// ব্যবহারকারীকে ".env পাওয়া যায়নি" বার্তাটি পরিষ্কারভাবে দেখাতে পারে।
export const supabase = isLocalDataMode
  ? createLocalClient()
  : createClient(url || 'https://placeholder.invalid', anonKey || 'placeholder-anon-key', {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    });

export const hasSupabaseConfig = Boolean(url && anonKey);

// ---------------------------------------------------------------------------
//  ডাটাবেজের কলাম (snake_case) ↔ অ্যাপের ক্ষেত্র (camelCase) রূপান্তর
// ---------------------------------------------------------------------------

export const flatFromRow = (r) => ({
  id: r.id,
  serial: r.serial,
  flatNo: r.flat_no,
  ownerName: r.owner_name || '',
  openingDue: Number(r.opening_due) || 0,
  phone: r.phone || '',
  note: r.note || '',
  active: r.active !== false,
  joinMonth: r.join_month || '',
  closedFrom: r.closed_from || '',
  // মাসভিত্তিক বিশেষ ধার্য হার, যেমন {"2024-08": 3500, "2024-09": 3500}
  // (ভবনে বসবাসরত মালিকদের জন্য)। কলামটি না থাকলে বা খালি হলে {}।
  customRates: r.custom_rates || {}
});

export const flatToRow = (f) => ({
  id: f.id,
  serial: f.serial ?? null,
  flat_no: f.flatNo,
  owner_name: f.ownerName || '',
  opening_due: Number(f.openingDue) || 0,
  phone: f.phone || '',
  note: f.note || '',
  active: f.active !== false,
  join_month: f.joinMonth || null,
  closed_from: f.closedFrom || null,
  // ফ্ল্যাট সম্পাদনা করলে যেন বিশেষ হারগুলো মুছে না যায়
  custom_rates: f.customRates && Object.keys(f.customRates).length ? f.customRates : null
});

export const paymentFromRow = (r) => ({
  id: r.id,
  flatId: r.flat_id,
  month: r.month,
  amount: Number(r.amount) || 0,
  collectorId: r.collector_id || '',
  receivedOn: r.received_on || '',
  note: r.note || ''
});

export const paymentToRow = (p) => ({
  id: p.id,
  flat_id: p.flatId,
  month: p.month,
  amount: Number(p.amount) || 0,
  collector_id: p.collectorId || '',
  received_on: p.receivedOn || '',
  note: p.note || ''
});

// ---------------------------------------------------------------------------
//  মাসিক আয়-ব্যয় খতিয়ানের সারি
// ---------------------------------------------------------------------------

export const ledgerFromRow = (r) => ({
  id: r.id,
  month: r.month,
  side: r.side,                       // 'income' | 'expense'
  serial: r.serial ?? null,
  title: r.title || '',
  // উপ-লাইন: [{ text, amount, due? }] — কাগজে মার্জ-করা ঘরের ভেতরের সারিগুলো।
  // due:true হলে অঙ্কের বদলে "বকেয়া" বসে, যোগফলেও ধরা হয় না।
  lines: Array.isArray(r.lines) ? r.lines : [],
  amount: Number(r.amount) || 0,
  source: r.source || 'manual',       // 'manual' | 'collector' | 'carryover'
  refId: r.ref_id || '',
  note: r.note || ''
});

export const ledgerToRow = (e) => ({
  id: e.id,
  month: e.month,
  side: e.side,
  serial: e.serial ?? null,
  title: e.title || '',
  lines: Array.isArray(e.lines) ? e.lines : [],
  amount: Number(e.amount) || 0,
  source: e.source || 'manual',
  ref_id: e.refId || null,
  note: e.note || ''
});
