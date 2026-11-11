-- =====================================================================
--  অ্যাডভান্স (জামানত) থেকে বিদ্যুৎ বিল সমন্বয় — নতুন kind
--  ---------------------------------------------------------------------
--  বাস্তব ঘটনা (৩নং দোকান, নভেম্বর-২০২৬): ভাড়াটিয়া ভাড়ার সাথে বিদ্যুৎ
--  বিলও অ্যাডভান্স থেকে কাটিয়ে নিয়েছেন। তাই advance-adjust (ভাড়া) এর
--  পাশে advance-adjust-elec (বিদ্যুৎ বিল) — জামানত কমে, বিল পরিশোধ ধরা
--  হয়, নগদ ওঠে না (খতিয়ানে স্মারক)।
--
--  Supabase SQL Editor-এ পুরো ফাইল একবারে চালান। একাধিকবার চালালেও
--  ক্ষতি নেই। আগে sql/shop-advance.sql ও sql/shop-tenancy.sql চালানো থাকতে হবে।
-- =====================================================================

ALTER TABLE shop_rents DROP CONSTRAINT IF EXISTS shop_rents_kind_chk;
ALTER TABLE shop_rents ADD CONSTRAINT shop_rents_kind_chk
  CHECK (kind IN ('rent', 'electricity', 'other',
                  'advance', 'advance-adjust', 'advance-adjust-elec', 'advance-refund'));

-- মিলিয়ে দেখুন
SELECT pg_get_constraintdef(oid) AS kind_check
FROM pg_constraint WHERE conname = 'shop_rents_kind_chk';
