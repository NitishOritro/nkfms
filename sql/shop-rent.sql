-- =====================================================================
--  দোকান ভাড়া — আলাদা টেবিল ও পুরোনো ডাটা তোলা
--
--  চালানোর জায়গা : Supabase Dashboard → SQL Editor
--  তৈরি          : ২০২৬-১০-১২
--
--  এতদিন দোকানের ভাড়া আয়-ব্যয় খতিয়ানের income সারির ভেতরে ফ্রি-টেক্সট
--  উপ-লাইন হিসেবে লেখা হতো। এখন দুটি আলাদা টেবিল:
--    shops       — দোকানের তালিকা (নম্বর, ভাড়াটিয়া, মাসিক ভাড়া)
--    shop_rents  — প্রতিটি আদায় (কোন দোকান, কোন মাসের ভাড়া, কোন মাসের
--                  হিসাবে জমা, ভাড়া/বিদ্যুৎ/অন্যান্য, টাকা, আদায়কারী)
--
--  অ্যাপ এর পর থেকে shop_rents থেকেই খতিয়ানে "দোকানের ভাড়া আদায়" সারিটি
--  নিজে থেকে বসায় (source = 'shop-rent')। পুরোনো মাসের হাতে লেখা সারিগুলো
--  অক্ষত থাকে — ধাপ ৫ তাদের source বদলে দেয়, যাতে একই মাসে স্বয়ংক্রিয়
--  সারিটি দ্বিতীয়বার না বসে (দ্বিগুণ হিসাব ঠেকাতে)।
--
--  ⚠️  ধাপ ১ (টেবিল) ও ধাপ ২ (RLS) না চালালে অ্যাপে দোকান ভাড়ার পাতা
--      "টেবিল তৈরি হয়নি" দেখাবে, বাকি সব আগের মতোই চলবে।
-- =====================================================================


-- ---------------------------------------------------------------------
--  ধাপ ১ — টেবিল
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shops (
  id                text PRIMARY KEY,
  serial            integer,
  shop_no           text NOT NULL,
  tenant_name       text DEFAULT '',
  phone             text DEFAULT '',
  monthly_rent      numeric DEFAULT 0,
  -- ভাড়া বদলালে কোন মাস থেকে কত: [{"fromMonth":"2026-07","rate":3000}]
  rent_history      jsonb,
  -- মাসিক বিদ্যুৎ বিলের অংশ (এন্ট্রির ঘরে ডিফল্ট হিসেবে বসে)
  electricity_share numeric DEFAULT 0,
  active            boolean DEFAULT true,
  join_month        text,          -- কোন মাস থেকে ভাড়া ধরা হবে (YYYY-MM)
  closed_from       text,          -- কোন মাস থেকে আর ভাড়া ধরা হবে না
  note              text DEFAULT '',
  updated_at        timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shop_rents (
  id            text PRIMARY KEY,
  shop_id       text NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  rent_month    text NOT NULL,     -- কোন মাসের ভাড়া (YYYY-MM)
  paid_month    text NOT NULL,     -- কোন মাসের হিসাবে (খতিয়ানে) জমা (YYYY-MM)
  kind          text NOT NULL DEFAULT 'rent',   -- 'rent' | 'electricity' | 'other'
  amount        numeric NOT NULL DEFAULT 0,
  collector_id  text DEFAULT '',
  received_on   text DEFAULT '',
  note          text DEFAULT '',
  updated_at    timestamptz DEFAULT now(),
  CONSTRAINT shop_rents_kind_chk CHECK (kind IN ('rent', 'electricity', 'other')),
  CONSTRAINT shop_rents_unique UNIQUE (shop_id, rent_month, kind)
);

CREATE INDEX IF NOT EXISTS shop_rents_paid_month_idx ON shop_rents (paid_month);


-- ---------------------------------------------------------------------
--  ধাপ ২ — Row Level Security (payments টেবিলের মতোই)
--  পড়া: সবাই (ভিউ মোড)। লেখা: কেবল লগইন করা ব্যবহারকারী।
-- ---------------------------------------------------------------------
ALTER TABLE shops      ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_rents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shops read all"        ON shops;
DROP POLICY IF EXISTS "shops write auth"      ON shops;
DROP POLICY IF EXISTS "shop_rents read all"   ON shop_rents;
DROP POLICY IF EXISTS "shop_rents write auth" ON shop_rents;

CREATE POLICY "shops read all"   ON shops FOR SELECT USING (true);
CREATE POLICY "shops write auth" ON shops FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "shop_rents read all"   ON shop_rents FOR SELECT USING (true);
CREATE POLICY "shop_rents write auth" ON shop_rents FOR ALL TO authenticated
  USING (true) WITH CHECK (true);


-- ---------------------------------------------------------------------
--  ধাপ ৩ — দোকানের তালিকা
--  খতিয়ানে ১, ৩ ও ৪ নং দোকানের ভাড়া পাওয়া গেছে। ভাড়াটিয়ার নাম
--  খতিয়ানে নেই — অ্যাপের "দোকান ভাড়া" পাতা থেকে পরে বসিয়ে নিন।
--  ২ নং দোকান থাকলে ঐ পাতা থেকেই যোগ করা যাবে।
-- ---------------------------------------------------------------------
INSERT INTO shops (id, serial, shop_no, tenant_name, monthly_rent, rent_history, electricity_share, join_month, note) VALUES
  ('shop-1', 1, '১', '', 3500, NULL, 750, '2025-11', ''),
  ('shop-3', 3, '৩', '', 2500, NULL, 0,   '2025-05', 'আগস্ট-২৫ হতে মার্চ-২৬ পর্যন্ত ৮ মাসের ভাড়া একত্রে ৭,৫০০/- নগদ আদায় হয়েছে — আগস্ট-২৫ মাসের ভাড়ার ঘরে বসানো (এপ্রিল-২৬ খতিয়ানের বিশেষ নোট দেখুন)'),
  ('shop-4', 4, '৪', '', 3000,
     '[{"fromMonth":"2025-09","rate":2500},{"fromMonth":"2026-07","rate":3000}]'::jsonb,
     750, '2025-09', '')
ON CONFLICT (id) DO NOTHING;


-- ---------------------------------------------------------------------
--  ধাপ ৪ — পুরোনো আদায় (খতিয়ানের উপ-লাইন থেকে হাতে মিলিয়ে বসানো)
--  paid_month = যে মাসের খতিয়ানে লেখা ছিল;  rent_month = যে মাসের ভাড়া।
--  আদায়কারী সব ক্ষেত্রেই c3 (শিশির কুমার দাস)।
--  বিদ্যুৎ বিল "১ ও ৪ নং দোকানের" একসাথে লেখা ছিল — দুই দোকানে সমান ভাগ।
-- ---------------------------------------------------------------------
INSERT INTO shop_rents (id, shop_id, rent_month, paid_month, kind, amount, collector_id, received_on, note) VALUES
  -- অক্টোবর-২৫ খতিয়ান (l-2025-10-i2)
  ('sr-shop-3-2025-05-rent', 'shop-3', '2025-05', '2025-10', 'rent', 2500, 'c3', '2025-10-31', ''),
  ('sr-shop-3-2025-06-rent', 'shop-3', '2025-06', '2025-10', 'rent', 2500, 'c3', '2025-10-31', ''),
  ('sr-shop-3-2025-07-rent', 'shop-3', '2025-07', '2025-10', 'rent', 2500, 'c3', '2025-10-31', ''),
  ('sr-shop-4-2025-09-rent', 'shop-4', '2025-09', '2025-10', 'rent', 2500, 'c3', '2025-10-31', ''),
  -- নভেম্বর-২৫ (l-2025-11-i1)
  ('sr-shop-4-2025-10-rent', 'shop-4', '2025-10', '2025-11', 'rent', 2500, 'c3', '2025-11-30', ''),
  ('sr-shop-4-2025-10-electricity', 'shop-4', '2025-10', '2025-11', 'electricity', 3500, 'c3', '2025-11-30', '৪ নং দোকানের ভাড়া কারেন্ট বিল আদায়'),
  -- ডিসেম্বর-২৫ (l-2025-12-i2)
  ('sr-shop-1-2025-11-rent', 'shop-1', '2025-11', '2025-12', 'rent', 3500, 'c3', '2025-12-31', ''),
  ('sr-shop-4-2025-11-rent', 'shop-4', '2025-11', '2025-12', 'rent', 2500, 'c3', '2025-12-31', ''),
  -- জানুয়ারি-২৬ (l-2026-01-i2)
  ('sr-shop-1-2025-12-rent', 'shop-1', '2025-12', '2026-01', 'rent', 3500, 'c3', '2026-01-31', ''),
  ('sr-shop-4-2025-12-rent', 'shop-4', '2025-12', '2026-01', 'rent', 2500, 'c3', '2026-01-31', ''),
  -- ফেব্রুয়ারি-২৬ (l-2026-02-i2)
  ('sr-shop-1-2026-01-rent', 'shop-1', '2026-01', '2026-02', 'rent', 3500, 'c3', '2026-02-28', ''),
  ('sr-shop-4-2026-01-rent', 'shop-4', '2026-01', '2026-02', 'rent', 2500, 'c3', '2026-02-28', ''),
  ('sr-shop-1-2026-01-electricity', 'shop-1', '2026-01', '2026-02', 'electricity', 500, 'c3', '2026-02-28', 'দোকানের বিদ্যুৎ বিল ১,০০০/- — দুই দোকানে সমান ভাগ'),
  ('sr-shop-4-2026-01-electricity', 'shop-4', '2026-01', '2026-02', 'electricity', 500, 'c3', '2026-02-28', 'দোকানের বিদ্যুৎ বিল ১,০০০/- — দুই দোকানে সমান ভাগ'),
  -- মার্চ-২৬ (l-2026-03-i2)
  ('sr-shop-1-2026-02-rent', 'shop-1', '2026-02', '2026-03', 'rent', 3500, 'c3', '2026-03-31', ''),
  ('sr-shop-4-2026-02-rent', 'shop-4', '2026-02', '2026-03', 'rent', 2500, 'c3', '2026-03-31', ''),
  ('sr-shop-1-2026-02-electricity', 'shop-1', '2026-02', '2026-03', 'electricity', 500, 'c3', '2026-03-31', ''),
  ('sr-shop-4-2026-02-electricity', 'shop-4', '2026-02', '2026-03', 'electricity', 500, 'c3', '2026-03-31', ''),
  -- এপ্রিল-২৬ (l-2026-04-i2)
  ('sr-shop-1-2026-03-rent', 'shop-1', '2026-03', '2026-04', 'rent', 3500, 'c3', '2026-04-30', ''),
  ('sr-shop-4-2026-03-rent', 'shop-4', '2026-03', '2026-04', 'rent', 2500, 'c3', '2026-04-30', ''),
  ('sr-shop-1-2026-03-electricity', 'shop-1', '2026-03', '2026-04', 'electricity', 500, 'c3', '2026-04-30', ''),
  ('sr-shop-4-2026-03-electricity', 'shop-4', '2026-03', '2026-04', 'electricity', 500, 'c3', '2026-04-30', ''),
  -- ৮ মাসের ভাড়া একসাথে: একটি সারিতে একটিই ভাড়ার মাস রাখা যায়, তাই প্রথম
  -- মাস (আগস্ট-২৫) এর ঘরে পুরো ৭,৫০০ বসানো; নোটে পুরো সময়কাল লেখা আছে।
  ('sr-shop-3-2025-08-rent', 'shop-3', '2025-08', '2026-04', 'rent', 7500, 'c3', '2026-04-30', 'আগস্ট-২৫ হতে মার্চ-২৬ পর্যন্ত মোট ৮ মাসের ভাড়া একত্রে নগদ আদায় — বিশেষ নোট দেখুন'),
  -- মে-২৬ (l-2026-05-i2)
  ('sr-shop-1-2026-04-rent', 'shop-1', '2026-04', '2026-05', 'rent', 3500, 'c3', '2026-05-31', ''),
  ('sr-shop-4-2026-04-rent', 'shop-4', '2026-04', '2026-05', 'rent', 2500, 'c3', '2026-05-31', ''),
  ('sr-shop-1-2026-04-electricity', 'shop-1', '2026-04', '2026-05', 'electricity', 500, 'c3', '2026-05-31', ''),
  ('sr-shop-4-2026-04-electricity', 'shop-4', '2026-04', '2026-05', 'electricity', 500, 'c3', '2026-05-31', ''),
  -- জুন-২৬ (l-2026-06-i2)
  ('sr-shop-1-2026-05-rent', 'shop-1', '2026-05', '2026-06', 'rent', 3500, 'c3', '2026-06-30', ''),
  ('sr-shop-4-2026-05-rent', 'shop-4', '2026-05', '2026-06', 'rent', 2500, 'c3', '2026-06-30', ''),
  ('sr-shop-1-2026-05-electricity', 'shop-1', '2026-05', '2026-06', 'electricity', 500, 'c3', '2026-06-30', ''),
  ('sr-shop-4-2026-05-electricity', 'shop-4', '2026-05', '2026-06', 'electricity', 500, 'c3', '2026-06-30', ''),
  -- জুলাই-২৬ (l-2026-07-i1)
  ('sr-shop-1-2026-06-rent', 'shop-1', '2026-06', '2026-07', 'rent', 3500, 'c3', '2026-07-31', ''),
  ('sr-shop-4-2026-06-rent', 'shop-4', '2026-06', '2026-07', 'rent', 2500, 'c3', '2026-07-31', ''),
  ('sr-shop-1-2026-06-electricity', 'shop-1', '2026-06', '2026-07', 'electricity', 750, 'c3', '2026-07-31', ''),
  ('sr-shop-4-2026-06-electricity', 'shop-4', '2026-06', '2026-07', 'electricity', 750, 'c3', '2026-07-31', ''),
  -- আগস্ট-২৬ (l-2026-08-i5)
  ('sr-shop-1-2026-07-rent', 'shop-1', '2026-07', '2026-08', 'rent', 3500, 'c3', '2026-08-31', ''),
  ('sr-shop-3-2026-04-rent', 'shop-3', '2026-04', '2026-08', 'rent', 2500, 'c3', '2026-08-31', ''),
  ('sr-shop-3-2026-05-rent', 'shop-3', '2026-05', '2026-08', 'rent', 2500, 'c3', '2026-08-31', ''),
  ('sr-shop-4-2026-07-rent', 'shop-4', '2026-07', '2026-08', 'rent', 3000, 'c3', '2026-08-31', ''),
  ('sr-shop-1-2026-07-electricity', 'shop-1', '2026-07', '2026-08', 'electricity', 750, 'c3', '2026-08-31', ''),
  ('sr-shop-4-2026-07-electricity', 'shop-4', '2026-07', '2026-08', 'electricity', 750, 'c3', '2026-08-31', '')
ON CONFLICT (id) DO NOTHING;


-- ---------------------------------------------------------------------
--  ধাপ ৫ — পুরোনো খতিয়ানের সারিগুলোকে "দোকান ভাড়া" উৎস হিসেবে চিহ্নিত
--  এতে ঐ মাসগুলোতে অ্যাপ আর স্বয়ংক্রিয় সারি বসাবে না; হাতে লেখা সারিটিই
--  থাকবে (টাকার অঙ্ক বদলায় না)।
--
--  ৫ক) ledger_entries.source কলামে CHECK কনস্ট্রেইন্ট (ledger_source_ck)
--      আছে, যা কেবল 'manual' | 'collector' | 'carryover' চেনে। নতুন মান
--      'shop-rent' ঢোকাতে আগে সেটি বদলে নিতে হয় — নইলে নিচের UPDATE
--      "violates check constraint ledger_source_ck" দিয়ে থেমে যায়।
--      আগের সংজ্ঞা দেখতে চাইলে:
--        SELECT pg_get_constraintdef(oid) FROM pg_constraint
--        WHERE conname = 'ledger_source_ck';
-- ---------------------------------------------------------------------
ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_source_ck;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_source_ck
  CHECK (source IN ('manual', 'collector', 'carryover', 'shop-rent'));

--  ৫খ) এবার সারিগুলো চিহ্নিত করা
UPDATE ledger_entries
SET source = 'shop-rent', ref_id = 'c3'
WHERE id IN (
  'l-2025-10-i2', 'l-2025-11-i1', 'l-2025-12-i2', 'l-2026-01-i2',
  'l-2026-02-i2', 'l-2026-03-i2', 'l-2026-04-i2', 'l-2026-05-i2',
  'l-2026-06-i2', 'l-2026-07-i1', 'l-2026-08-i5'
);


-- ---------------------------------------------------------------------
--  ধাপ ৬ — মিলিয়ে দেখুন
--  প্রতিটি paid_month এর যোগফল ঐ মাসের খতিয়ানের সারির অঙ্কের সমান হওয়া উচিত:
--    2025-10 → 10000, 2025-11 → 6000, 2025-12 → 6000, 2026-01 → 6000,
--    2026-02 → 7000, 2026-03 → 7000, 2026-04 → 14500, 2026-05 → 7000,
--    2026-06 → 7000, 2026-07 → 7500, 2026-08 → 13000
-- ---------------------------------------------------------------------
SELECT r.paid_month, sum(r.amount) AS shop_rents_total, l.amount AS ledger_amount
FROM shop_rents r
LEFT JOIN ledger_entries l ON l.month = r.paid_month AND l.source = 'shop-rent'
GROUP BY r.paid_month, l.amount
ORDER BY r.paid_month;

SELECT s.shop_no, r.kind, count(*) AS sari, sum(r.amount) AS mot
FROM shop_rents r JOIN shops s ON s.id = r.shop_id
GROUP BY s.shop_no, r.kind ORDER BY s.shop_no, r.kind;
