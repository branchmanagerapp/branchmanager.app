-- Nov 14 2026 (audit B6): the public booking form (book.html) reads the company's published form config.
-- Anyone may read ONLY the 'bm-booking-form' row; every other tenant_settings row stays private.
DROP POLICY IF EXISTS public_read_booking_form ON public.tenant_settings;
CREATE POLICY public_read_booking_form ON public.tenant_settings FOR SELECT TO anon, authenticated USING (key = 'bm-booking-form');
