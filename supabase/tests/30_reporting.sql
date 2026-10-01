\set ON_ERROR_STOP 1
set client_min_messages = warning;
set role authenticated;
select test.login('owner.a@example.com');
select id as biz_a from public.businesses where name = 'My Restaurant' \gset
select test.eq((select count(*) > 0 from public.report_transactions(:'biz_a', 'today')), true, 'export rows for today');
select test.eq((select count(*) from public.report_transactions(:'biz_a', 'today') where items like '%Zinger Burger%') > 0, true,
  'items are summarised');
select test.login('owner.b@example.com');
select test.throws(format($$select * from public.report_transactions(%L)$$, :'biz_a'), 'not_found:business', 'B cannot export A');
reset role;
select 'REPORTING TESTS PASSED' as result;
