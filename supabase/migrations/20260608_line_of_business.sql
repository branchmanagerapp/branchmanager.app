-- Line of Business tag on jobs + invoices: 'tree' | 'snow' | 'smartlawn'.
-- Lets the same Second Nature Tree books split per division (Smart Lawn is a
-- DBA, snow is a seasonal line) for per-line revenue/P&L. Nullable → falls back
-- to keyword classification when unset. Non-breaking ADD COLUMN.

ALTER TABLE public.jobs     ADD COLUMN IF NOT EXISTS line_of_business text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS line_of_business text;
