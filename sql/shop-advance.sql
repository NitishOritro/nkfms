-- =====================================================================
--  দোকানের অ্যাডভান্স (জামানত) — গ্রহণ, মাসিক ভাড়া থেকে সমন্বয়, ফেরত
--  ---------------------------------------------------------------------
--  নিয়ম (কমিটির সিদ্ধান্ত, নভেম্বর-২০২৬):
--    • দোকান ভাড়া দেওয়ার সময় ভাড়াটিয়ার কাছ থেকে অ্যাডভান্স নেওয়া হয়।
--      এটি ভাড়া নয় — সমিতির কাছে ভাড়াটিয়ার টাকা (দায়), ফেরতযোগ্য।
--    • চুক্তি অনুযায়ী মাসে মাসে ভাড়া থেকে কেটে (সমন্বয়) শেষ করা যায়;
--      অঙ্কটি নমনীয় — চুক্তির হার, আলোচনা, বা ভাড়া না দিলে পুরো ভাড়া।
--    • দোকান ছাড়লে যা বাকি থাকে তা ফেরত।
--
--  সফটওয়্যারে তিনটি ঘটনা shop_rents টেবিলেই তিনটি নতুন kind হিসেবে:
--    advance         অ্যাডভান্স গ্রহণ — নগদ ঢোকে; rent_month = paid_month =
--                    যে মাসে নেওয়া হলো; খতিয়ানে আলাদা আয়ের সারি
--    advance-adjust  ভাড়া থেকে সমন্বয় — নগদ নয়; rent_month = যে মাসের
--                    ভাড়া কাটা হলো; ঐ মাসের ভাড়া পরিশোধিত ধরা হয়
--    advance-refund  ফেরত — নগদ বেরোয়; খতিয়ানে খরচের সারি
--  ব্যালেন্স = গ্রহণ − সমন্বয় − ফেরত (হিসাব থেকেই বেরোয়, আলাদা রাখা নেই)।
--
--  পুরোনো অ্যাডভান্স (আগে নেওয়া) থাকলে পরে "অ্যাডভান্স গ্রহণ/ফেরত" ফর্ম
--  থেকে পুরোনো মাস দিয়ে ঢোকানো যাবে — শুরুর ব্যালেন্স হিসেবে।
--
--  Supabase SQL Editor-এ পুরো ফাইল একবারে চালান। আগে/পরে একাধিকবার
--  চালালেও ক্ষতি নেই (IF NOT EXISTS / DROP IF EXISTS)।
-- =====================================================================

-- ধাপ ১ — দোকানের চুক্তির তথ্য (দোকান সম্পাদনা ফর্মে দেখায়)
ALTER TABLE shops ADD COLUMN IF NOT EXISTS advance_amount numeric DEFAULT 0;  -- চুক্তির অ্যাডভান্স
ALTER TABLE shops ADD COLUMN IF NOT EXISTS advance_adjust numeric DEFAULT 0;  -- মাসে কত কাটা হবে (০ = কাটা হয় না)
ALTER TABLE shops ADD COLUMN IF NOT EXISTS advance_note   text    DEFAULT ''; -- চুক্তির শর্ত, তারিখ ইত্যাদি

-- ধাপ ২ — shop_rents.kind এ তিনটি নতুন ধরন
ALTER TABLE shop_rents DROP CONSTRAINT IF EXISTS shop_rents_kind_chk;
ALTER TABLE shop_rents ADD CONSTRAINT shop_rents_kind_chk
  CHECK (kind IN ('rent', 'electricity', 'other', 'advance', 'advance-adjust', 'advance-refund'));

-- ধাপ ৩ — মিলিয়ে দেখুন
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'shops' AND column_name LIKE 'advance%'
ORDER BY column_name;

SELECT pg_get_constraintdef(oid) AS kind_check
FROM pg_constraint WHERE conname = 'shop_rents_kind_chk';
