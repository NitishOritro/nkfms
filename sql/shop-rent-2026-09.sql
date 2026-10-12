-- =====================================================================
--  দোকান ভাড়া — সেপ্টেম্বর-২৬ খতিয়ানের আগস্ট-২৬ এর ভাড়া তোলা
--
--  চালানোর জায়গা : Supabase Dashboard → SQL Editor
--  তৈরি          : ২০২৬-১০-১২   (sql/shop-rent.sql চালানোর পরে)
--
--  মূল মাইগ্রেশনটি ২৯-০৯-২০২৬ এর ব্যাকআপ থেকে বানানো। তার পরে সেপ্টেম্বর-২৬
--  খতিয়ানে হাতে একটি সারি লেখা হয়েছে (l-muqi2to6-q6ti, ৮,০০০/-):
--    ১নং দোকানের ভাড়া (আগস্ট-২৬) ৩,৫০০ + ৪নং দোকানের ভাড়া (আগস্ট-২৬) ৩,০০০
--    + ১ ও ৪ নং দোকানের কারেন্ট বিল (আগস্ট-২৬) ১,৫০০
--  সেটি shop_rents-এ ছিল না, তাই রিপোর্টে আগস্ট-২৬ বকেয়া দেখাচ্ছিল।
--
--  সারিটির source এখন 'collector' (ref_id c3) — অর্থাৎ সেপ্টেম্বরের
--  আদায়কারী-সারিটি সম্পাদনা করে এটি লেখা হয়েছিল, আর সার্ভিস চার্জের ৬,০০০/-
--  আলাদা 'manual' সারিতে আছে। নিচে দুটোর source অদল-বদল করা হয়: দোকানের
--  সারিটি 'shop-rent' হবে (দোকান ভাড়ার স্বয়ংক্রিয় সারি ঠেকাবে), আর সার্ভিস
--  চার্জের সারিটি 'collector' হবে (আদায়কারীর স্বয়ংক্রিয় সারি ঠেকাবে)। এতে
--  সেপ্টেম্বর-২৬ এর আয়ের যোগফল এক টাকাও বদলায় না।
-- =====================================================================

-- ধাপ ১ — আগস্ট-২৬ এর ভাড়া ও বিদ্যুৎ বিল (জমার মাস সেপ্টেম্বর-২৬)
INSERT INTO shop_rents (id, shop_id, rent_month, paid_month, kind, amount, collector_id, received_on, note) VALUES
  ('sr-shop-1-2026-08-rent',        'shop-1', '2026-08', '2026-09', 'rent',        3500, 'c3', '2026-09-30', ''),
  ('sr-shop-4-2026-08-rent',        'shop-4', '2026-08', '2026-09', 'rent',        3000, 'c3', '2026-09-30', ''),
  ('sr-shop-1-2026-08-electricity', 'shop-1', '2026-08', '2026-09', 'electricity',  750, 'c3', '2026-09-30', '১ ও ৪ নং দোকানের কারেন্ট বিল ১,৫০০/- — দুই দোকানে সমান ভাগ'),
  ('sr-shop-4-2026-08-electricity', 'shop-4', '2026-08', '2026-09', 'electricity',  750, 'c3', '2026-09-30', '১ ও ৪ নং দোকানের কারেন্ট বিল ১,৫০০/- — দুই দোকানে সমান ভাগ')
ON CONFLICT (id) DO NOTHING;

-- ধাপ ২ — খতিয়ানের সারি দুটির source অদল-বদল
UPDATE ledger_entries SET source = 'shop-rent', ref_id = 'c3'
WHERE id = 'l-muqi2to6-q6ti';           -- দোকানের ভাড়া আদায় (৮,০০০)

UPDATE ledger_entries SET source = 'collector', ref_id = 'c3'
WHERE id = 'l-muqiocae-zucy';           -- সার্ভিস চার্জ বাবদ আদায় (৬,০০০)

-- ধাপ ৩ — মিলিয়ে দেখুন: 2026-09 → shop_rents 8000, ledger 8000
SELECT r.paid_month, sum(r.amount) AS shop_rents_total, l.amount AS ledger_amount, l.source
FROM shop_rents r
LEFT JOIN ledger_entries l ON l.month = r.paid_month AND l.source = 'shop-rent'
WHERE r.paid_month = '2026-09'
GROUP BY r.paid_month, l.amount, l.source;

SELECT id, title, amount, source, ref_id
FROM ledger_entries WHERE month = '2026-09' AND side = 'income' ORDER BY serial;
