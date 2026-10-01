-- 004_assistant_name.sql — the assistant is now called KHOKHAR (کھوکھر).
-- Only renames accounts that still use the old default name; custom names are left alone.
update settings
set value = value || jsonb_build_object('name', 'KHOKHAR', 'urduName', 'کھوکھر',
                                        'aliases', '["Khokar","Kokhar","Kokar","Khokher","Khokhur","کھوکر"]'::jsonb)
where key = 'assistant' and value->>'name' = 'Saathi';
