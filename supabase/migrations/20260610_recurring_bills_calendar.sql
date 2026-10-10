-- ─────────────────────────────────────────────────────────────────────────────
-- Seed recurring auto-debit BILLS into calendar_events (type='bill', red 💸).
-- Purpose: surface the recurring payments on the Schedule calendar so Doug can
-- keep the M&T 0606 balance ahead of them and avoid NSFs (which blocked the
-- KM100 telehandler financing). Amounts/days are from the Mar–May 2026 M&T
-- statements. June's early-month bills already posted; only 6/27 (Chase) is
-- still upcoming this month, then full Jul–Dec.
-- Single-day events; no recurrence engine yet — extend or rebuild as recurring later.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.calendar_events (tenant_id, type, title, person, start_date, end_date, color, notes)
VALUES
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'bill', 'RAM truck (Chase) $1,004.91', NULL, '2026-06-27', '2026-06-27', '#c62828', 'RAM 2500 payment — Chase ext transfer ~27th'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'bill', 'Erie Insurance $1,114.58', NULL, '2026-07-01', '2026-07-01', '#c62828', 'Auto/GL insurance — auto-debit ~1st'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'bill', 'Blue Bridge lease $1,912.56', NULL, '2026-07-01', '2026-07-01', '#c62828', 'Bucket-truck lease — auto-debit ~1st (has bounced before)'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'bill', 'NYSIF workers comp $85.88', NULL, '2026-07-06', '2026-07-06', '#c62828', 'Workers comp — auto-debit ~6th'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'bill', 'Optimum internet $107.03', NULL, '2026-07-09', '2026-07-09', '#c62828', 'Cable/internet — auto-debit ~9th'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'bill', 'RAM truck (Chase) $1,004.91', NULL, '2026-07-27', '2026-07-27', '#c62828', 'RAM 2500 payment — Chase ext transfer ~27th'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'bill', 'Erie Insurance $1,114.58', NULL, '2026-08-01', '2026-08-01', '#c62828', 'Auto/GL insurance — auto-debit ~1st'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'bill', 'Blue Bridge lease $1,912.56', NULL, '2026-08-01', '2026-08-01', '#c62828', 'Bucket-truck lease — auto-debit ~1st (has bounced before)'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'bill', 'NYSIF workers comp $85.88', NULL, '2026-08-06', '2026-08-06', '#c62828', 'Workers comp — auto-debit ~6th'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'bill', 'Optimum internet $107.03', NULL, '2026-08-09', '2026-08-09', '#c62828', 'Cable/internet — auto-debit ~9th'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'bill', 'RAM truck (Chase) $1,004.91', NULL, '2026-08-27', '2026-08-27', '#c62828', 'RAM 2500 payment — Chase ext transfer ~27th'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'bill', 'Erie Insurance $1,114.58', NULL, '2026-09-01', '2026-09-01', '#c62828', 'Auto/GL insurance — auto-debit ~1st'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'bill', 'Blue Bridge lease $1,912.56', NULL, '2026-09-01', '2026-09-01', '#c62828', 'Bucket-truck lease — auto-debit ~1st (has bounced before)'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'bill', 'NYSIF workers comp $85.88', NULL, '2026-09-06', '2026-09-06', '#c62828', 'Workers comp — auto-debit ~6th'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'bill', 'Optimum internet $107.03', NULL, '2026-09-09', '2026-09-09', '#c62828', 'Cable/internet — auto-debit ~9th'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'bill', 'RAM truck (Chase) $1,004.91', NULL, '2026-09-27', '2026-09-27', '#c62828', 'RAM 2500 payment — Chase ext transfer ~27th'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'bill', 'Erie Insurance $1,114.58', NULL, '2026-10-01', '2026-10-01', '#c62828', 'Auto/GL insurance — auto-debit ~1st'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'bill', 'Blue Bridge lease $1,912.56', NULL, '2026-10-01', '2026-10-01', '#c62828', 'Bucket-truck lease — auto-debit ~1st (has bounced before)'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'bill', 'NYSIF workers comp $85.88', NULL, '2026-10-06', '2026-10-06', '#c62828', 'Workers comp — auto-debit ~6th'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'bill', 'Optimum internet $107.03', NULL, '2026-10-09', '2026-10-09', '#c62828', 'Cable/internet — auto-debit ~9th'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'bill', 'RAM truck (Chase) $1,004.91', NULL, '2026-10-27', '2026-10-27', '#c62828', 'RAM 2500 payment — Chase ext transfer ~27th'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'bill', 'Erie Insurance $1,114.58', NULL, '2026-11-01', '2026-11-01', '#c62828', 'Auto/GL insurance — auto-debit ~1st'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'bill', 'Blue Bridge lease $1,912.56', NULL, '2026-11-01', '2026-11-01', '#c62828', 'Bucket-truck lease — auto-debit ~1st (has bounced before)'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'bill', 'NYSIF workers comp $85.88', NULL, '2026-11-06', '2026-11-06', '#c62828', 'Workers comp — auto-debit ~6th'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'bill', 'Optimum internet $107.03', NULL, '2026-11-09', '2026-11-09', '#c62828', 'Cable/internet — auto-debit ~9th'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'bill', 'RAM truck (Chase) $1,004.91', NULL, '2026-11-27', '2026-11-27', '#c62828', 'RAM 2500 payment — Chase ext transfer ~27th'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'bill', 'Erie Insurance $1,114.58', NULL, '2026-12-01', '2026-12-01', '#c62828', 'Auto/GL insurance — auto-debit ~1st'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'bill', 'Blue Bridge lease $1,912.56', NULL, '2026-12-01', '2026-12-01', '#c62828', 'Bucket-truck lease — auto-debit ~1st (has bounced before)'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'bill', 'NYSIF workers comp $85.88', NULL, '2026-12-06', '2026-12-06', '#c62828', 'Workers comp — auto-debit ~6th'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'bill', 'Optimum internet $107.03', NULL, '2026-12-09', '2026-12-09', '#c62828', 'Cable/internet — auto-debit ~9th'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'bill', 'RAM truck (Chase) $1,004.91', NULL, '2026-12-27', '2026-12-27', '#c62828', 'RAM 2500 payment — Chase ext transfer ~27th')
ON CONFLICT DO NOTHING;
