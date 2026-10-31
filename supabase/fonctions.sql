-- Fonctions de transaction de l'application, à exécuter une fois après schema.sql.
--
-- Chaque fonction s'exécute en une seule transaction côté base : tout passe, ou
-- rien. Les verrous posés ici empêchent deux encaissements simultanés d'imputer
-- le même mois, ce que Firestore ne savait pas faire côté client.
--
-- Idempotent : relançable sans effet de bord.

-- --- Contraintes -------------------------------------------------------------

-- Un bail ne porte qu'un loyer par mois. L'application le supposait déjà ; la
-- base le garantit désormais, même en cas de génération concurrente.
create unique index if not exists loyers_bail_periode on loyers (bail_id, periode);

-- Supprimer un immeuble ne doit pas supprimer les lots loués, ni les dépenses
-- qui s'y rattachent : leur lien est effacé, le reste est conservé.
alter table lots drop constraint if exists lots_immeuble_id_fkey;
alter table lots add constraint lots_immeuble_id_fkey
  foreign key (immeuble_id) references immeubles(id) on delete set null;

alter table depenses drop constraint if exists depenses_immeuble_id_fkey;
alter table depenses add constraint depenses_immeuble_id_fkey
  foreign key (immeuble_id) references immeubles(id) on delete set null;

-- --- Recalcul des statuts ----------------------------------------------------

-- Un loyer est « paye », « partiel » ou « impaye » d'après ce qui lui est imputé.
-- La base recalcule elle-même ce statut : l'application ne peut plus le fausser.
create or replace function recalculer_statuts(ids text[])
returns void
language sql
as $$
  update loyers l
  set statut = case
    when s.paye <= 0 then 'impaye'
    when s.paye >= l.montant_du then 'paye'
    else 'partiel'
  end
  from (
    select x.id,
           coalesce((select sum(a.montant) from paiement_allocations a where a.loyer_id = x.id), 0) as paye
    from loyers x
    where x.id = any(ids)
  ) s
  where l.id = s.id;
$$;

-- --- Encaissement ------------------------------------------------------------

-- Écrit un encaissement complet.
--
-- `p` contient :
--   paiement     : la ligne du paiement (colonnes de `paiements`, en snake_case)
--   allocations  : [{ loyer_id, montant, detail }] — un mois réglé par entrée
--   loyers       : les loyers à créer ou à mettre à jour (charges, mois d'avance),
--                  sous forme complète : colonnes de `loyers`
--
-- Le bail est verrouillé d'abord : deux encaissements sur le même bail passent
-- l'un après l'autre. Chaque mois est alors relu, et l'imputation refusée si elle
-- dépasserait le reste dû.
create or replace function ecrire_encaissement(p jsonb)
returns jsonb
language plpgsql
as $$
declare
  pid text := p->'paiement'->>'id';
  bail text := p->'paiement'->>'bail_id';
  x jsonb;
  ligne loyers%rowtype;
  autre integer;
  deja integer;
  paye integer;
  ids text[];
begin
  perform 1 from baux where id = bail for update;
  if not found then
    raise exception 'Bail introuvable';
  end if;

  -- Loyers créés ou corrigés. Le montant dû passe à sa valeur finale avant les
  -- contrôles, puisque les charges de ce versement en font partie.
  for x in select value from jsonb_array_elements(coalesce(p->'loyers', '[]'::jsonb)) loop
    insert into loyers
    select (r).* from (select jsonb_populate_record(null::loyers, x) as r) s
    on conflict (id) do update set
      bail_id = excluded.bail_id,
      periode = excluded.periode,
      loyer = excluded.loyer,
      eau = excluded.eau,
      electricite = excluded.electricite,
      ordures = excluded.ordures,
      degats = excluded.degats,
      autre1 = excluded.autre1,
      autre2 = excluded.autre2,
      montant_du = excluded.montant_du;
  end loop;

  insert into paiements
  select (r).* from (select jsonb_populate_record(null::paiements, p->'paiement') as r) s;

  -- Le supplément de caution s'ajoute à la caution déjà versée du bail.
  update baux
  set caution_versee = coalesce(caution_versee, 0) + coalesce((p->'paiement'->>'supplement_caution')::integer, 0),
      updated_at = now()
  where id = bail;

  insert into paiement_allocations (paiement_id, loyer_id, montant, detail)
  select pid,
         a.v->>'loyer_id',
         (a.v->>'montant')::integer,
         nullif(a.v->'detail', 'null'::jsonb)
  from jsonb_array_elements(p->'allocations') as a(v);

  -- Contrôle de chaque mois, dans l'ordre des identifiants : deux encaissements
  -- ne peuvent pas poser leurs verrous dans un ordre croisé.
  for ligne in
    select l.* from loyers l
    where l.id in (select loyer_id from paiement_allocations where paiement_id = pid)
    order by l.id
    for update
  loop
    select coalesce(sum(montant), 0) into autre
    from paiement_allocations
    where loyer_id = ligne.id and paiement_id <> pid;

    select montant into deja
    from paiement_allocations
    where loyer_id = ligne.id and paiement_id = pid;

    if deja > ligne.montant_du - autre then
      raise exception 'Montant trop élevé pour % : il reste % FCFA à payer',
        ligne.periode, greatest(ligne.montant_du - autre, 0);
    end if;
  end loop;

  select coalesce(array_agg(loyer_id), '{}') into ids
  from paiement_allocations where paiement_id = pid;
  perform recalculer_statuts(ids);

  return (select to_jsonb(p2) from paiements p2 where p2.id = pid);
end;
$$;

-- --- Quittances --------------------------------------------------------------

-- Émet la quittance d'un paiement, ou renvoie celle qui existe déjà.
--
-- La numérotation passe par le compteur, verrouillé le temps de la transaction :
-- deux émissions simultanées ne peuvent pas recevoir le même numéro.
create or replace function emettre_quittance(p_paiement_id text, q jsonb)
returns jsonb
language plpgsql
as $$
declare
  existante quittances%rowtype;
  valeur integer;
  annee integer;
  num text;
begin
  select * into existante from quittances where paiement_id = p_paiement_id limit 1;
  if found then
    return to_jsonb(existante);
  end if;

  perform 1 from paiements where id = p_paiement_id;
  if not found then
    raise exception 'Paiement introuvable';
  end if;

  insert into counters (name, value) values ('quittances', 1)
  on conflict (name) do update set value = counters.value + 1
  returning value into valeur;

  annee := extract(year from now() at time zone 'Africa/Porto-Novo');
  num := 'Q-' || annee || '-' || lpad(valeur::text, 6, '0');

  insert into quittances
  select (r).* from (
    select jsonb_populate_record(
      null::quittances,
      q || jsonb_build_object(
        'id', 'quittance_' || num,
        'numero', num,
        'sequence', valeur,
        'annee', annee,
        'paiement_id', p_paiement_id
      )
    ) as r
  ) s;

  return (select to_jsonb(q2) from quittances q2 where q2.numero = num);
end;
$$;

-- --- Suppressions ------------------------------------------------------------
--
-- Chaque suppression emporte ce qui en dépend, dans une seule transaction. Les
-- mêmes règles qu'avant : on ne supprime pas un historique par accident.

create or replace function supprimer_paiement(p_id text)
returns jsonb
language plpgsql
as $$
declare
  ids text[];
  qids text[];
begin
  select coalesce(array_agg(loyer_id), '{}') into ids
  from paiement_allocations where paiement_id = p_id;

  select coalesce(array_agg(id), '{}') into qids
  from quittances where paiement_id = p_id;

  -- Retirer le paiement retire aussi le supplément de caution qu'il avait ajouté.
  update baux
  set caution_versee = coalesce(caution_versee, 0) - coalesce(
        (select supplement_caution from paiements where id = p_id), 0),
      updated_at = now()
  where id = (select bail_id from paiements where id = p_id);

  delete from quittances where paiement_id = p_id;
  delete from paiement_allocations where paiement_id = p_id;
  delete from paiements where id = p_id;

  -- Les loyers concernés redeviennent dus, ou partiellement réglés.
  perform recalculer_statuts(ids);

  return jsonb_build_object('paiement', p_id, 'quittances', to_jsonb(qids));
end;
$$;

create or replace function supprimer_loyer(p_id text)
returns void
language plpgsql
as $$
begin
  if exists (select 1 from paiement_allocations where loyer_id = p_id) then
    raise exception 'Ce mois porte déjà un encaissement. Supprimez d''abord le paiement : une quittance a été émise pour lui.';
  end if;
  delete from loyers where id = p_id;
end;
$$;

create or replace function supprimer_bail(p_id text)
returns void
language plpgsql
as $$
declare
  pays text[];
begin
  select coalesce(array_agg(id), '{}') into pays from paiements where bail_id = p_id;

  delete from quittances where bail_id = p_id or paiement_id = any(pays);
  delete from paiement_allocations where paiement_id = any(pays);
  delete from paiements where id = any(pays);
  delete from loyers where bail_id = p_id;
  delete from baux where id = p_id;
end;
$$;

create or replace function supprimer_locataire(p_id text)
returns void
language plpgsql
as $$
declare
  bails text[];
  pays text[];
begin
  select coalesce(array_agg(id), '{}') into bails from baux where locataire_id = p_id;
  select coalesce(array_agg(id), '{}') into pays
  from paiements where locataire_id = p_id or bail_id = any(bails);

  delete from quittances
  where locataire_id = p_id or bail_id = any(bails) or paiement_id = any(pays);
  delete from paiement_allocations where paiement_id = any(pays);
  delete from paiements where id = any(pays);
  delete from loyers where bail_id = any(bails);
  delete from baux where id = any(bails);
  delete from locataires where id = p_id;
end;
$$;

create or replace function supprimer_lot(p_id text)
returns void
language plpgsql
as $$
begin
  if exists (select 1 from baux where lot_id = p_id) then
    raise exception 'Ce logement est occupé : clôturez d''abord le bail du locataire.';
  end if;
  delete from lots where id = p_id;
end;
$$;

-- Supprime un immeuble et ses lots libres. Les lots loués restent, sans immeuble
-- rattaché : un bail ne doit jamais perdre son logement.
create or replace function supprimer_immeuble(p_id text)
returns void
language plpgsql
as $$
begin
  delete from lots
  where immeuble_id = p_id
    and id not in (select lot_id from baux where lot_id is not null);
  delete from immeubles where id = p_id;
end;
$$;

-- --- Diffusion en temps réel -------------------------------------------------
--
-- L'application écoute les changements de ces tables. Ajoutées une fois : ajouter
-- une table déjà présente ne fait rien de mal, mais produit une erreur. D'où le
-- bloc protégé.
do $$
declare
  t text;
begin
  foreach t in array array['proprietaire', 'immeubles', 'lots', 'locataires', 'baux',
                           'loyers', 'paiements', 'paiement_allocations', 'quittances', 'depenses']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end;
$$;
