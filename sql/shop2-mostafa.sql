-- =====================================================================
--  ২নং দোকান — ভাড়াটিয়া মোস্তফা, জামানত (অ্যাডভান্স) ২০,০০০
--  ---------------------------------------------------------------------
--  আগে চালাতে হবে: sql/shop-advance.sql, sql/shop-tenancy.sql
--
--  কমিটির বিবরণ (১১ নভেম্বর ২০২৬): ২ নং দোকানের ভাড়াটিয়ার নাম মোস্তফা,
--  তাঁর কাছ থেকে অ্যাডভান্স নেওয়া হয়েছে ২০,০০০/-।
--
--  ধরে নেওয়া (নিশ্চিত হলে বদলান):
--    [ক] জামানত দোকান নেওয়ার সময়ই, অর্থাৎ জুলাই-২৫ এর হিসাবে (দোকানের
--        join_month)। পুরোনো খতিয়ান কাগজ থেকে তোলা, তাই ঐ মাসে স্বয়ংক্রিয়
--        সারি বসবে না — দ্বিগুণ হবে না। অন্য মাসে হলে নিচে rent_month ও
--        paid_month দুটোই বদলান।
--    [খ] জামানত থেকে ভাড়া কাটা হয় না (advanceAdjust 0)। অক্টোবর-২৫ থেকে
--        কোনো ভাড়ার এন্ট্রি নেই — বকেয়া দেখাচ্ছে। ভাড়া যদি জামানত থেকে
--        সমন্বয় হয়ে থাকে, "দোকান ভাড়া এন্ট্রি ফর্ম → অ্যাডভান্স থেকে সমন্বয়"-এ
--        মাসগুলো লিখুন।
--    [গ] মাসিক ভাড়া ৩,০০০ — দোকানের ঘরে যা আছে (tenancy-তে rent খালি, তাই
--        দোকানের হারই ধরা হবে)।
--
--  Supabase SQL Editor-এ পুরো ফাইল একবারে চালান। ON CONFLICT DO NOTHING,
--  তাই দ্বিতীয়বার চালালে দ্বিগুণ হবে না।
-- =====================================================================

-- ধাপ ১ — ভাড়াটিয়ার ইতিহাস: মোস্তফা, জুলাই-২৫ হতে চলছে, জামানত ২০,০০০
UPDATE shops SET
  tenancies = '[
    {"id":"t-mostafa", "tenantName":"মোস্তফা", "phone":"", "fromMonth":"2025-07", "toMonth":"",
     "rent":"", "advanceAmount":20000, "advanceAdjust":0, "note":"জামানত ২০,০০০"}
  ]'::jsonb,
  tenant_name = 'মোস্তফা',
  advance_amount = 20000,
  updated_at = now()
WHERE id = 'shop-2';

-- ধাপ ২ — জামানত গ্রহণ ২০,০০০ (জুলাই-২৫ এর হিসাবে — ধরে নেওয়া [ক])
INSERT INTO shop_rents (id, shop_id, rent_month, paid_month, kind, amount, collector_id, received_on, note, tenancy_id) VALUES
  ('sr-shop-2-2025-07-advance', 'shop-2', '2025-07', '2025-07', 'advance', 20000, 'c3', '2025-07-31',
   'দোকান ভাড়া নেওয়ার সময় জামানত', 't-mostafa')
ON CONFLICT (id) DO NOTHING;

-- ধাপ ৩ — আগের ভাড়ার সারিগুলো মোস্তফার খাতায়
UPDATE shop_rents SET tenancy_id = 't-mostafa', updated_at = now()
WHERE shop_id = 'shop-2' AND tenancy_id IS NULL;

-- দেখে নিন
SELECT id, rent_month, paid_month, kind, amount, tenancy_id
FROM shop_rents WHERE shop_id = 'shop-2' ORDER BY rent_month, kind;
