-- =====================================================================
--  ৩নং দোকান — মোহাম্মদ হানিফ (জানু-২৫ → অক্টো-২৬) ও আবু মিয়া (নভে-২৬ →)
--  ভাড়াটিয়ার ইতিহাস, অ্যাডভান্সের খাতা ও অ্যাডভান্স থেকে সমন্বয়ের সারি
--  ---------------------------------------------------------------------
--  আগে চালাতে হবে: sql/shop-advance.sql, sql/shop-tenancy.sql,
--                   sql/shop-advance-elec.sql (নতুন kind)
--
--  হিসাব (কমিটির বিবরণ, নভেম্বর-২০২৬):
--    হানিফ: জানু-২৫ হতে অক্টো-২৬ = ২২ মাস × ২,৫০০ = ৫৫,০০০ ধার্য
--      নগদ ভাড়া ৩০,০০০ (১২ মাস — সফটওয়্যারে আগে থেকেই আছে)
--      অ্যাডভান্স ৩০,০০০ থেকে: ভাড়া ১২,৫০০ + ১২,৫০০ (১০ মাস), বিদ্যুৎ বিল ১,৪২৪
--      ফেরতযোগ্য = ৩০,০০০ − ২৫,০০০ − ১,৪২৪ = ৩,৫৭৬ → নভে-২৬ এ ফেরত
--    আবু মিয়া: নভে-২৬ থেকে, জামানত ১০,০০০ (এর থেকেই হানিফের ৩,৫৭৬ দেওয়া —
--      নগদে: আবু মিয়ার ১০,০০০ জমা, হানিফকে ৩,৫৭৬ খরচ; নিট ৬,৪২৪ ক্যাশে)
--
--  ধরে নেওয়া (নিশ্চিত হলে বদলান):
--    [ক] বিদ্যুৎ বিল ১,৪২৪ মার্চ-২৬ মাসের হিসাবে (এক মাসে)
--    [খ] আবু মিয়ার মাসিক ভাড়া ৩,৫০০ — ধাপ ৫ (ঐচ্ছিক) নভে-২৬ এর ভাড়া
--    [গ] অ্যাডভান্স থেকে ভাড়া সমন্বয়: যে মাসগুলোতে নগদ ভাড়ার সারি নেই,
--        সেগুলোতেই (ধাপ ৩ নিজে খুঁজে নেয়) — ১০ মাস হওয়ার কথা:
--        নভে-২৫ হতে মার্চ-২৬ (৫) ও জুন হতে অক্টো-২৬ (৫)। আগস্ট-২৫ এর ৭,৫০০
--        সারিটি আগে তিন মাসে ভাগ হয় (ধাপ ২ক), নইলে সেপ্টে/অক্টো-২৫ ভুলে ধরা পড়ত।
--
--  Supabase SQL Editor-এ পুরো ফাইল একবারে চালান। ON CONFLICT DO NOTHING,
--  তাই দ্বিতীয়বার চালালে দ্বিগুণ হবে না।
-- =====================================================================

-- ধাপ ০ — আগে দেখে নিন: ৩নং দোকানের কোন কোন মাসে নগদ ভাড়ার সারি আছে
SELECT rent_month, kind, amount, paid_month
FROM shop_rents WHERE shop_id = 'shop-3' ORDER BY rent_month, kind;

-- ধাপ ১ — ভাড়াটিয়ার ইতিহাস (এটিই এখন ধার্যের ভিত্তি; নভে-২৬ থেকে ভাড়া আবু মিয়ার হারে)
UPDATE shops SET
  tenancies = '[
    {"id":"t-hanif",  "tenantName":"মোহাম্মদ হানিফ", "phone":"", "fromMonth":"2025-01", "toMonth":"2026-10",
     "rent":2500, "advanceAmount":30000, "advanceAdjust":0, "note":"জামানত ৩০,০০০; ভাড়া ও বিদ্যুৎ বিল জামানত থেকে সমন্বয়"},
    {"id":"t-abumia","tenantName":"আবু মিয়া",       "phone":"", "fromMonth":"2026-11", "toMonth":"",
     "rent":3500, "advanceAmount":10000, "advanceAdjust":0, "note":"জামানত ১০,০০০; এর থেকে হানিফের বাকি ৩,৫৭৬ ফেরত"}
  ]'::jsonb,
  tenant_name = 'আবু মিয়া',
  updated_at = now()
WHERE id = 'shop-3';

-- ধাপ ২ — হানিফের অ্যাডভান্স গ্রহণ ৩০,০০০ (জানু-২৫ এর হিসাবে; পুরোনো খতিয়ান
--          কাগজ থেকে তোলা, তাই ঐ মাসে স্বয়ংক্রিয় সারি বসবে না — দ্বিগুণ হবে না)
INSERT INTO shop_rents (id, shop_id, rent_month, paid_month, kind, amount, collector_id, received_on, note, tenancy_id) VALUES
  ('sr-shop-3-2025-01-advance', 'shop-3', '2025-01', '2025-01', 'advance', 30000, 'c3', '2025-01-31',
   'দোকান ভাড়া নেওয়ার সময় জামানত', 't-hanif')
ON CONFLICT (id) DO NOTHING;

-- ধাপ ২ক — আগস্ট-২৫ এর হিসাবে এক সারিতে লেখা ৭,৫০০ আসলে আগস্ট–অক্টোবর-২৫ তিন
--           মাসের নগদ ভাড়া (৭,৫০০ + জামানত থেকে ১২,৫০০ = আগস্ট-২৫ হতে মার্চ-২৬,
--           ৮ মাস × ২,৫০০ = ২০,০০০)। তাই সারিটি তিন মাসে ভাগ — জমার মাস ও
--           আদায়কারী আগেরটাই। সারিটি ৭,৫০০ না হলে (আগেই ভাগ করা) কিছু হবে না।
INSERT INTO shop_rents (id, shop_id, rent_month, paid_month, kind, amount, collector_id, received_on, note, tenancy_id)
SELECT 'sr-shop-3-' || m || '-rent', 'shop-3', m, r.paid_month, 'rent', 2500, r.collector_id, r.received_on,
       'আগস্ট–অক্টোবর-২৫ তিন মাসের ভাড়া ৭,৫০০ একত্রে', 't-hanif'
FROM shop_rents r, unnest(ARRAY['2025-09', '2025-10']) AS m
WHERE r.shop_id = 'shop-3' AND r.rent_month = '2025-08' AND r.kind = 'rent' AND r.amount = 7500
ON CONFLICT DO NOTHING;

UPDATE shop_rents SET amount = 2500, note = 'আগস্ট–অক্টোবর-২৫ তিন মাসের ভাড়া ৭,৫০০ একত্রে', tenancy_id = 't-hanif', updated_at = now()
WHERE shop_id = 'shop-3' AND rent_month = '2025-08' AND kind = 'rent' AND amount = 7500;

-- ধাপ ৩ — অ্যাডভান্স থেকে ভাড়া সমন্বয় ২,৫০০ করে — হানিফের সময়কালে যে মাসে
--          নগদ ভাড়ার সারি নেই, সে মাসগুলোতে। মার্চ-২৬ পর্যন্তগুলো মার্চ-২৬ এর
--          হিসাবে (১২,৫০০), পরেরগুলো অক্টো-২৬ এর হিসাবে (১২,৫০০)।
INSERT INTO shop_rents (id, shop_id, rent_month, paid_month, kind, amount, collector_id, received_on, note, tenancy_id)
SELECT
  'sr-shop-3-' || m || '-advance-adjust', 'shop-3', m,
  CASE WHEN m <= '2026-03' THEN '2026-03' ELSE '2026-10' END,
  'advance-adjust', 2500, 'c3',
  CASE WHEN m <= '2026-03' THEN '2026-03-31' ELSE '2026-10-31' END,
  'জামানত থেকে ভাড়া সমন্বয়', 't-hanif'
FROM unnest(ARRAY[
  '2025-01','2025-02','2025-03','2025-04','2025-05','2025-06','2025-07','2025-08','2025-09','2025-10','2025-11','2025-12',
  '2026-01','2026-02','2026-03','2026-04','2026-05','2026-06','2026-07','2026-08','2026-09','2026-10']) AS m
WHERE NOT EXISTS (
  SELECT 1 FROM shop_rents r
  WHERE r.shop_id = 'shop-3' AND r.rent_month = m AND r.kind = 'rent' AND r.amount > 0
)
ON CONFLICT (id) DO NOTHING;

-- ধাপ ৪ — বিদ্যুৎ বিল ১,৪২৪ অ্যাডভান্স থেকে [ধরে নেওয়া: মার্চ-২৬]
INSERT INTO shop_rents (id, shop_id, rent_month, paid_month, kind, amount, collector_id, received_on, note, tenancy_id) VALUES
  ('sr-shop-3-2026-03-advance-adjust-elec', 'shop-3', '2026-03', '2026-03', 'advance-adjust-elec', 1424, 'c3', '2026-03-31',
   'বিদ্যুৎ বিল জামানত থেকে সমন্বয়', 't-hanif')
ON CONFLICT (id) DO NOTHING;

-- ধাপ ৫ — নভে-২৬: আবু মিয়ার জামানত ১০,০০০ গ্রহণ, হানিফকে বাকি ৩,৫৭৬ ফেরত
--          (খতিয়ানে: আয় ১০,০০০, খরচ ৩,৫৭৬ — দুটো আলাদা সারিতে নিজে বসবে)
INSERT INTO shop_rents (id, shop_id, rent_month, paid_month, kind, amount, collector_id, received_on, note, tenancy_id) VALUES
  ('sr-shop-3-2026-11-advance',        'shop-3', '2026-11', '2026-11', 'advance',        10000, 'c3', '2026-11-30',
   'নতুন ভাড়াটিয়ার জামানত', 't-abumia'),
  ('sr-shop-3-2026-11-advance-refund', 'shop-3', '2026-11', '2026-11', 'advance-refund',  3576, 'c3', '2026-11-30',
   'দোকান ছাড়ায় জামানতের বাকি ফেরত (আবু মিয়ার জামানত থেকে দেওয়া)', 't-hanif')
ON CONFLICT (id) DO NOTHING;

-- ধাপ ৬ (ঐচ্ছিক) — আবু মিয়ার নভে-২৬ এর ভাড়া ৩,৫০০ নগদে নেওয়া হয়ে থাকলে
--          নিচের দুই দাঁড়ি (--) তুলে দিন
-- INSERT INTO shop_rents (id, shop_id, rent_month, paid_month, kind, amount, collector_id, received_on, note, tenancy_id) VALUES
--   ('sr-shop-3-2026-11-rent', 'shop-3', '2026-11', '2026-11', 'rent', 3500, 'c3', '2026-11-30', '', 't-abumia')
-- ON CONFLICT (id) DO NOTHING;

-- ধাপ ৭ — মিলিয়ে দেখুন: adjust_rent = 25000, adjust_elec = 1424, refund = 3576,
--          hanif_balance = 0 হওয়ার কথা
SELECT
  sum(amount) FILTER (WHERE kind = 'advance' AND tenancy_id = 't-hanif')             AS hanif_received,
  sum(amount) FILTER (WHERE kind = 'advance-adjust' AND tenancy_id = 't-hanif')      AS adjust_rent,
  sum(amount) FILTER (WHERE kind = 'advance-adjust-elec' AND tenancy_id = 't-hanif') AS adjust_elec,
  sum(amount) FILTER (WHERE kind = 'advance-refund' AND tenancy_id = 't-hanif')      AS refund,
  coalesce(sum(amount) FILTER (WHERE kind = 'advance' AND tenancy_id = 't-hanif'), 0)
    - coalesce(sum(amount) FILTER (WHERE kind IN ('advance-adjust','advance-adjust-elec','advance-refund') AND tenancy_id = 't-hanif'), 0)
                                                                                      AS hanif_balance,
  sum(amount) FILTER (WHERE kind = 'advance' AND tenancy_id = 't-abumia')            AS abumia_received
FROM shop_rents WHERE shop_id = 'shop-3';

-- হানিফের সময়কালে কোন কোন মাসে সমন্বয় বসল (১০ মাস হওয়ার কথা)
SELECT rent_month, paid_month, amount FROM shop_rents
WHERE shop_id = 'shop-3' AND kind = 'advance-adjust' ORDER BY rent_month;
