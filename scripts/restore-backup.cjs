// =====================================================================
//  ব্যাকআপ থেকে ডাটাবেজে ডাটা ফেরত তোলা
//
//  চালানোর নিয়ম (প্রজেক্ট ফোল্ডার থেকে):
//    node scripts/restore-backup.cjs                → কী করা হবে তা দেখায়, কিছু লেখে না
//    node scripts/restore-backup.cjs 2026-09-29     → ঐ দিনের ব্যাকআপ দেখায়, লেখে না
//    node scripts/restore-backup.cjs 2026-09-29 --yes  → সত্যিই ডাটাবেজে তোলে
//
//  তারিখ না দিলে সবচেয়ে নতুন ব্যাকআপ ফোল্ডারটি ধরা হয়।
//
//  ⚠️  এটি upsert করে — ব্যাকআপের সারিগুলো বসায়/হালনাগাদ করে, কিন্তু
//      ব্যাকআপের *পরে* ডাটাবেজে যোগ হওয়া নতুন সারি মুছে দেয় না। পুরো
//      ডাটাবেজ হুবহু ব্যাকআপের মতো করতে চাইলে আগে Supabase SQL Editor-এ
//      টেবিল খালি করে নিতে হয় — সেটি ইচ্ছাকৃতভাবে এখানে রাখা হয়নি।
// =====================================================================
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const bakRoot = path.join(root, 'backups');
const env = fs.readFileSync(path.join(root, '.env'), 'utf8');
const url = env.match(/VITE_SUPABASE_URL=(\S+)/)[1];
const key = env.match(/VITE_SUPABASE_ANON_KEY=(\S+)/)[1];

const args = process.argv.slice(2);
const write = args.includes('--yes');
const day = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) ||
  fs.readdirSync(bakRoot).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().pop();
if (!day) { console.error('কোনো ব্যাকআপ ফোল্ডার পাওয়া যায়নি'); process.exit(1); }
const dir = path.join(bakRoot, day);

const read = (t) => JSON.parse(fs.readFileSync(path.join(dir, t + '.json'), 'utf8'));

async function upsert(table, rows, conflict) {
  for (let i = 0; i < rows.length; i += 200) {
    const res = await fetch(`${url}/rest/v1/${table}?on_conflict=${conflict}`, {
      method: 'POST',
      headers: {
        apikey: key, Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(rows.slice(i, i + 200)),
    });
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}

(async () => {
  console.log(`ব্যাকআপ ফোল্ডার: backups/${day}${write ? '' : '   (কেবল দেখানো হচ্ছে — লেখা হবে না)'}\n`);
  const plan = [
    ['flats', 'id'],
    ['payments', 'flat_id,month'],
    ['ledger_entries', 'id'],
  ];
  for (const [t, conflict] of plan) {
    const rows = read(t);
    console.log(`${t.padEnd(16)} ${String(rows.length).padStart(4)} সারি ${write ? '→ তোলা হচ্ছে…' : ''}`);
    if (write) await upsert(t, rows, conflict);
  }
  const st = read('app_settings');
  console.log(`app_settings        ১ সারি ${write ? '→ তোলা হচ্ছে…' : ''}`);
  if (write) {
    const res = await fetch(`${url}/rest/v1/app_settings?id=eq.1`, {
      method: 'PATCH',
      headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: st[0].data }),
    });
    if (!res.ok) throw new Error('app_settings: HTTP ' + res.status);
  }
  console.log(write
    ? '\n✅ সব ডাটা ডাটাবেজে তোলা হয়েছে। অ্যাপ রিলোড করলেই দেখা যাবে।'
    : '\nআসলেই তুলতে চাইলে শেষে --yes যোগ করুন:\n  node scripts/restore-backup.cjs ' + day + ' --yes');
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
