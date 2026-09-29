// ---------------------------------------------------------------------------
//  লোকাল ডাটা মুড — Supabase-এর নকল ক্লায়েন্ট
//
//  `npm run dev:local` দিয়ে চালালে আসল Supabase-এর বদলে এই ক্লায়েন্টটি বসে।
//  ডাটা আসে backups/ ফোল্ডারের সবচেয়ে নতুন ব্যাকআপ থেকে (vite দেয়
//  /__local-data__ পথে), আর সব লেখা থাকে শুধু এই ব্রাউজারের localStorage-এ —
//  লাইভ ডাটাবেজে একটি বাইটও যায় না।
//
//  DataContext/AuthContext-এর ব্যবহৃত Supabase API-র ঠিক যতটুকু দরকার
//  ততটুকুই নকল করা হয়েছে: from().select/eq/order/range/single,
//  upsert/insert/update/delete, এবং auth.getSession/onAuthStateChange/
//  signInWithPassword/signOut। অ্যাডমিন লগইন: যেকোনো ইমেইল+পাসওয়ার্ডে ঢোকে।
//
//  স্যান্ডবক্স গোড়া থেকে শুরু করতে: ঠিকানায় ?resetlocal=1 যোগ করে খুলুন।
// ---------------------------------------------------------------------------

const DB_KEY = 'nkfms-local-db-v1';
const SESSION_KEY = 'nkfms-local-session';

export function createLocalClient() {
  // ?resetlocal=1 — জমে থাকা স্যান্ডবক্স মুছে আবার ব্যাকআপ থেকে শুরু
  try {
    if (new URLSearchParams(window.location.search).has('resetlocal')) {
      localStorage.removeItem(DB_KEY);
      localStorage.removeItem(SESSION_KEY);
    }
  } catch { /* উপেক্ষা */ }

  let db = null;
  let loading = null;

  const persist = () => {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch { /* জায়গা নেই? চলুক */ }
  };

  const ensureDb = () => {
    if (db) return Promise.resolve(db);
    if (loading) return loading;
    loading = (async () => {
      try {
        const stored = localStorage.getItem(DB_KEY);
        if (stored) { db = JSON.parse(stored); return db; }
      } catch { /* নষ্ট হলে নতুন করে আনা হবে */ }
      const res = await fetch('/__local-data__');
      if (!res.ok) {
        throw new Error(
          'ব্যাকআপ পাওয়া যায়নি (' + res.status + ')। backups/ ফোল্ডারে ' +
          'full-backup.json আছে কি না দেখুন — না থাকলে আগে ব্যাকআপ নামান।'
        );
      }
      db = await res.json();
      persist();
      return db;
    })();
    return loading;
  };

  function from(table) {
    const st = { op: 'select', select: '*', filters: [], single: false, order: null, payload: null, conflict: ['id'] };
    const api = {
      select(sel) { st.select = sel || '*'; return api; },
      eq(col, val) { st.filters.push([col, val]); return api; },
      order(col, opts) { st.order = { col, asc: !opts || opts.ascending !== false }; return api; },
      range() { return api; },
      single() { st.single = true; return api; },
      upsert(payload, opts) {
        st.op = 'upsert'; st.payload = payload;
        st.conflict = ((opts && opts.onConflict) || 'id').split(',');
        return api;
      },
      insert(payload) { st.op = 'insert'; st.payload = payload; return api; },
      update(patch) { st.op = 'update'; st.payload = patch; return api; },
      delete() { st.op = 'delete'; return api; },
      then(onOk, onErr) { return exec().then(onOk, onErr); },
    };

    async function exec() {
      try {
        await ensureDb();
      } catch (e) {
        return { data: null, error: { message: e.message } };
      }
      if (!Array.isArray(db[table])) db[table] = [];
      const rows = db[table];
      const match = (r) => st.filters.every(([c, v]) => r[c] === v);

      if (st.op === 'select') {
        let out = rows.filter(match);
        if (st.order) {
          const { col, asc } = st.order;
          out = [...out].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (asc ? 1 : -1));
        }
        if (st.select !== '*') {
          const cols = st.select.split(',').map((c) => c.trim());
          out = out.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])));
        }
        if (st.single) {
          return out.length
            ? { data: out[0], error: null }
            : { data: null, error: { message: 'সারি পাওয়া যায়নি: ' + table } };
        }
        return { data: out, error: null };
      }

      if (st.op === 'upsert' || st.op === 'insert') {
        const list = Array.isArray(st.payload) ? st.payload : [st.payload];
        for (const p of list) {
          const i = rows.findIndex((r) => st.conflict.every((k) => r[k] === p[k]));
          if (i >= 0) {
            if (st.op === 'insert') return { data: null, error: { message: 'আগে থেকেই আছে' } };
            rows[i] = { ...rows[i], ...p };
          } else {
            rows.push({ ...p });
          }
        }
        persist();
        return { data: null, error: null };
      }

      if (st.op === 'update') {
        rows.filter(match).forEach((r) => Object.assign(r, st.payload));
        persist();
        return { data: null, error: null };
      }

      if (st.op === 'delete') {
        db[table] = rows.filter((r) => !match(r));
        persist();
        return { data: null, error: null };
      }

      return { data: null, error: { message: 'অজানা অপারেশন' } };
    }

    return api;
  }

  // ---- auth (নকল) ---------------------------------------------------------
  const listeners = new Set();
  const readSession = () => {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
  };
  const auth = {
    async getSession() { return { data: { session: readSession() } }; },
    onAuthStateChange(cb) {
      listeners.add(cb);
      return { data: { subscription: { unsubscribe() { listeners.delete(cb); } } } };
    },
    async signInWithPassword({ email }) {
      const s = { user: { id: 'local-admin', email, user_metadata: { name: 'লোকাল অ্যাডমিন' } } };
      try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* উপেক্ষা */ }
      listeners.forEach((cb) => cb('SIGNED_IN', s));
      return { data: { session: s }, error: null };
    },
    async signOut() {
      try { localStorage.removeItem(SESSION_KEY); } catch { /* উপেক্ষা */ }
      listeners.forEach((cb) => cb('SIGNED_OUT', null));
      return { error: null };
    },
  };

  return { from, auth };
}
