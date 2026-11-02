-- Génération automatique des loyers, chaque jour, sans intervention.
--
-- Pour chaque bail, crée la ligne de loyer de chaque mois manquant : depuis le
-- mois d'entrée jusqu'au mois courant, ou jusqu'à la fin du bail si elle vient
-- plus tôt. Un mois qui existe déjà n'est jamais touché : c'est ainsi qu'un
-- locataire qui a payé ses mois d'avance ne voit pas de doublon, et que le
-- propriétaire n'a rien à ouvrir à la main.
--
-- Chaque mois créé porte les frais par défaut du bail (eau, électricité,
-- ordures, dégâts, autres), comme le loyer. Ils ne comptent pas dans la dette.
--
-- Idempotente : la relancer ne crée rien de plus si tout est à jour.
--
-- À exécuter une fois dans l'éditeur SQL de Supabase, après fonctions.sql
-- (l'index unique loyers_bail_periode doit exister).

create or replace function generer_loyers_echus()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  b record;
  n integer := 0;
  courant text := to_char(now(), 'YYYY-MM');
  mois text;
  fin text;
  f_eau integer;
  f_electricite integer;
  f_ordures integer;
  f_degats integer;
  f_autre1 integer;
  f_autre2 integer;
begin
  for b in select * from baux loop
    f_eau := coalesce(nullif(b.frais_defaut->>'eau', '')::integer, 0);
    f_electricite := coalesce(nullif(b.frais_defaut->>'electricite', '')::integer, 0);
    f_ordures := coalesce(nullif(b.frais_defaut->>'ordures', '')::integer, 0);
    f_degats := coalesce(nullif(b.frais_defaut->>'degats', '')::integer, 0);
    f_autre1 := coalesce(nullif(b.frais_defaut->>'autre1', '')::integer, 0);
    f_autre2 := coalesce(nullif(b.frais_defaut->>'autre2', '')::integer, 0);
    -- Le dernier mois à générer : la fin du bail, sans dépasser le mois courant.
    fin := case
      when b.date_fin is not null and b.date_fin <> '' then least(substr(b.date_fin, 1, 7), courant)
      else courant
    end;
    mois := coalesce(nullif(substr(coalesce(b.date_debut, ''), 1, 7), ''), courant);

    while mois <= fin loop
      insert into loyers (id, bail_id, periode, loyer, eau, electricite, ordures, degats, autre1, autre2, montant_du, statut)
      values (
        'loy_' || replace(gen_random_uuid()::text, '-', ''),
        b.id, mois, b.loyer_mensuel,
        f_eau, f_electricite, f_ordures, f_degats, f_autre1, f_autre2,
        b.loyer_mensuel + f_eau + f_electricite + f_ordures + f_degats + f_autre1 + f_autre2,
        'impaye'
      )
      on conflict (bail_id, periode) do nothing;
      if found then n := n + 1; end if;

      mois := to_char(to_date(mois || '-01', 'YYYY-MM-DD') + interval '1 month', 'YYYY-MM');
    end loop;
  end loop;
  return n;
end;
$$;

-- Rattrapage unique : les mois déjà créés sans aucun paiement reprennent les
-- frais par défaut du bail. Un mois qui porte un paiement n'est pas touché.
update loyers l
set eau = coalesce(nullif(b.frais_defaut->>'eau', '')::integer, 0),
    electricite = coalesce(nullif(b.frais_defaut->>'electricite', '')::integer, 0),
    ordures = coalesce(nullif(b.frais_defaut->>'ordures', '')::integer, 0),
    degats = coalesce(nullif(b.frais_defaut->>'degats', '')::integer, 0),
    autre1 = coalesce(nullif(b.frais_defaut->>'autre1', '')::integer, 0),
    autre2 = coalesce(nullif(b.frais_defaut->>'autre2', '')::integer, 0),
    montant_du = l.loyer
      + coalesce(nullif(b.frais_defaut->>'eau', '')::integer, 0)
      + coalesce(nullif(b.frais_defaut->>'electricite', '')::integer, 0)
      + coalesce(nullif(b.frais_defaut->>'ordures', '')::integer, 0)
      + coalesce(nullif(b.frais_defaut->>'degats', '')::integer, 0)
      + coalesce(nullif(b.frais_defaut->>'autre1', '')::integer, 0)
      + coalesce(nullif(b.frais_defaut->>'autre2', '')::integer, 0)
from baux b
where b.id = l.bail_id
  and not exists (select 1 from paiement_allocations a where a.loyer_id = l.id);

-- Tous les jours à 00 h 05 UTC (01 h 05 à Cotonou). Chaque jour, pas seulement
-- le 1er : un bail créé en cours de mois a son loyer du jour même, et une
-- exécution manquée est rattrapée le lendemain.
--
-- Nécessite l'extension pg_cron, à activer dans Supabase : Database > Extensions.
create extension if not exists pg_cron;

select cron.schedule(
  'generer-loyers-echus',
  '5 0 * * *',
  $$select generer_loyers_echus()$$
);
