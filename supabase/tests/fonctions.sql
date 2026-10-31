-- Scénarios des fonctions de transaction (supabase/fonctions.sql).
-- À jouer sur une copie de la base, après schema.sql, fonctions.sql et la migration.
-- Chaque scénario est annulé : rien n'est laissé dans la base.

\set ON_ERROR_STOP 0
begin;
set local role authenticated;

\echo === 1 encaissement partiel de 5000 sur loy_mv2shj8e011 (15000 dus)
select ecrire_encaissement(jsonb_build_object(
  'paiement', jsonb_build_object('id','pay_test1','bail_id','bail_mv2sha0h010',
     'locataire_id',(select locataire_id from baux where id='bail_mv2sha0h010'),
     'date','2026-10-24','montant',5000,'mode','especes','reference','','note','',
     'detail',null,'libelles',null,'created_at',now()),
  'allocations', jsonb_build_array(jsonb_build_object('loyer_id','loy_mv2shj8e011','montant',5000,'detail',null)),
  'loyers','[]'::jsonb))->>'montant' as montant_enregistre;
select id, statut from loyers where id='loy_mv2shj8e011';

\echo === 2 depassement : 12000 alors qu il reste 10000 (doit echouer)
savepoint s2;
select ecrire_encaissement(jsonb_build_object(
  'paiement', jsonb_build_object('id','pay_test2','bail_id','bail_mv2sha0h010',
     'locataire_id',(select locataire_id from baux where id='bail_mv2sha0h010'),
     'date','2026-10-24','montant',12000,'mode','especes','reference','','note','',
     'detail',null,'libelles',null,'created_at',now()),
  'allocations', jsonb_build_array(jsonb_build_object('loyer_id','loy_mv2shj8e011','montant',12000,'detail',null)),
  'loyers','[]'::jsonb));
rollback to savepoint s2;
select id, statut from loyers where id='loy_mv2shj8e011';

\echo === 3 solde : 10000 restants, le loyer passe a paye
select ecrire_encaissement(jsonb_build_object(
  'paiement', jsonb_build_object('id','pay_test3','bail_id','bail_mv2sha0h010',
     'locataire_id',(select locataire_id from baux where id='bail_mv2sha0h010'),
     'date','2026-10-24','montant',10000,'mode','especes','reference','','note','',
     'detail',null,'libelles',null,'created_at',now()),
  'allocations', jsonb_build_array(jsonb_build_object('loyer_id','loy_mv2shj8e011','montant',10000,'detail',null)),
  'loyers','[]'::jsonb))->>'montant' as solde_enregistre;
select id, statut from loyers where id='loy_mv2shj8e011';

\echo === 4 quittances : numerotation et idempotence
select emettre_quittance('pay_test1', '{"montant":5000}'::jsonb)->>'numero' as q1;
select emettre_quittance('pay_test1', '{"montant":5000}'::jsonb)->>'numero' as q1_bis;
select emettre_quittance('pay_test3', '{"montant":10000}'::jsonb)->>'numero' as q3;

\echo === 5 suppression du paiement pay_test3 : le loyer redevient partiel
select supprimer_paiement('pay_test3')->'quittances' as quittances_supprimees;
select id, statut from loyers where id='loy_mv2shj8e011';

\echo === 6 suppression d un loyer encaisse (doit echouer)
savepoint s6;
select supprimer_loyer('loy_mv2shj8e011');
rollback to savepoint s6;

\echo === 7 suppression d un lot occupe (doit echouer)
savepoint s7;
select supprimer_lot(lot_id) from baux where lot_id is not null limit 1;
rollback to savepoint s7;

rollback;
\echo === fin : aucune donnee ecrite (rollback)
select count(*) as paiements_apres_rollback from paiements;
