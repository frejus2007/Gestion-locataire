-- Supplément de caution à l'encaissement.
--
-- À exécuter une fois dans l'éditeur SQL de Supabase, puis relancer
-- supabase/fonctions.sql (les fonctions ecrire_encaissement et
-- supprimer_paiement y sont mises à jour).

alter table paiements
  add column if not exists supplement_caution integer not null default 0;
