-- Concurrence : deux encaissements simultanés sur le même mois.
-- Lancer session-a et session-b en parallèle (voir README de supabase/tests).

-- session A
begin;
set local role authenticated;
select ecrire_encaissement(jsonb_build_object('paiement', jsonb_build_object('id','pay_a','bail_id','bail_mv2sha0h010','locataire_id',(select locataire_id from baux where id='bail_mv2sha0h010'),'date','2026-10-24','montant',5000,'mode','especes','reference','','note','','detail',null,'libelles',null,'created_at',now()),'allocations', jsonb_build_array(jsonb_build_object('loyer_id','loy_mv2shj8e011','montant',5000,'detail',null)),'loyers','[]'::jsonb))->>'montant' as a_enregistre;
select pg_sleep(3);
commit;
select 'A validee' as info;

-- session B (lancée une seconde après A)
\set ON_ERROR_STOP 0
begin;
set local role authenticated;
select pg_sleep(1);
select ecrire_encaissement(jsonb_build_object('paiement', jsonb_build_object('id','pay_b','bail_id','bail_mv2sha0h010','locataire_id',(select locataire_id from baux where id='bail_mv2sha0h010'),'date','2026-10-24','montant',12000,'mode','especes','reference','','note','','detail',null,'libelles',null,'created_at',now()),'allocations', jsonb_build_array(jsonb_build_object('loyer_id','loy_mv2shj8e011','montant',12000,'detail',null)),'loyers','[]'::jsonb));
rollback;
