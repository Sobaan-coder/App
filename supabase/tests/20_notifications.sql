\set ON_ERROR_STOP 1
set client_min_messages = warning;
-- Runs after 10_*: data exists for 'My Restaurant'.
select test.eq(public._fmt_money(250000, 'PKR'), 'Rs 2,500', 'money format PKR');
select test.eq(public._fmt_money(100050, 'USD'), '$1,000.50', 'money format USD cents');
select test.eq((select count(*) from public.notifications where type = 'low_stock') >= 0, true, 'low stock notifications table ok');
-- Make Ali's balance stale so a reminder is generated.
update public.transactions set transaction_date = now() - interval '40 days'
  where customer_id = (select id from public.customers where name = 'Ali');
select public.generate_scheduled_notifications() as created \gset
select test.eq((select count(*) from public.notifications where type = 'customer_payment_due')::int, 1, 'payment reminder created');
select public.generate_scheduled_notifications() as created_again \gset
select test.eq((select count(*) from public.notifications where type = 'customer_payment_due')::int, 1, 'reminders are deduplicated');
set role authenticated;
select test.login('owner.a@example.com');
select test.throws($$select public.generate_scheduled_notifications()$$, 'permission denied', 'clients cannot trigger cron job');
select test.eq((select count(*) from public.notifications where type = 'customer_payment_due')::int, 1, 'owner sees reminder');
update public.notifications set read_at = now();
select test.throws($$update public.notifications set title = 'x'$$, 'permission denied', 'only read_at is writable');
select test.login('owner.b@example.com');
select test.eq((select count(*) from public.notifications where type = 'customer_payment_due')::int, 0, 'B cannot see A notifications');
reset role;
-- Low stock trigger: drop burger stock below minimum (5)
select test.eq((select count(*) from public.notifications n join public.products p on (n.data->>'product_id')::uuid = p.id
  where n.type = 'low_stock' and p.name = 'Zinger Burger')::int, 0, 'no low-stock alert yet');
set role authenticated;
select test.login('owner.a@example.com');
select public.adjust_inventory(id, 'waste', 13, 'test') from public.products where name = 'Zinger Burger';
reset role;
select test.eq((select count(*) from public.notifications n join public.products p on (n.data->>'product_id')::uuid = p.id
  where n.type = 'low_stock' and p.name = 'Zinger Burger')::int, 1, 'low-stock alert created');
select 'NOTIFICATION TESTS PASSED' as result;
