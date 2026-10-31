-- Schéma Supabase issu des collections Firestore.
--
-- Les identifiants Firebase sont conservés tels quels (texte) : les références
-- entre documents restent valides après migration. Les dates et les périodes
-- restent du texte (« AAAA-MM-JJ », « AAAA-MM ») : l'application compare ces
-- chaînes, et les garder à l'identique évite de changer ces comparaisons.
--
-- Les règles reproduisent celles de Firestore : tout utilisateur connecté peut
-- lire et écrire, et personne d'autre.

create table proprietaire (
  id text primary key,
  nom text,
  prenoms text,
  telephone text,
  adresse text,
  ville text,
  ifu text,
  banque text,
  signature_url text,
  reception jsonb not null default '[]',
  updated_at timestamptz
);

create table immeubles (
  id text primary key,
  nom text,
  adresse text,
  ville text,
  quartier text,
  notes text,
  date_acquisition text,
  statut text,
  updated_at timestamptz
);

create table lots (
  id text primary key,
  immeuble_id text references immeubles(id),
  designation text,
  numero text,
  etage text,
  nb_pieces integer,
  loyer_reference integer,
  notes text,
  updated_at timestamptz
);

create table locataires (
  id text primary key,
  nom text,
  prenoms text,
  telephone text,
  email text,
  ifu text,
  piece_nature text,
  piece_numero text,
  notes text,
  actif boolean,
  updated_at timestamptz
);

create table baux (
  id text primary key,
  lot_id text references lots(id),
  locataire_id text references locataires(id),
  date_debut text,
  date_fin text,
  loyer_mensuel integer,
  frais_defaut jsonb,
  caution_statut text,
  caution_versee integer,
  caution_sur jsonb,
  notes text,
  updated_at timestamptz
);

create table loyers (
  id text primary key,
  bail_id text not null references baux(id),
  periode text not null,
  loyer integer,
  eau integer default 0,
  electricite integer default 0,
  ordures integer default 0,
  degats integer default 0,
  autre1 integer default 0,
  autre2 integer default 0,
  montant_du integer,
  statut text
);

create table paiements (
  id text primary key,
  bail_id text not null references baux(id),
  locataire_id text references locataires(id),
  date text,
  montant integer,
  mode text,
  reference text,
  note text,
  detail jsonb,
  libelles jsonb,
  -- Supplément de caution versé avec ce paiement, ajouté à baux.caution_versee.
  supplement_caution integer not null default 0,
  created_at timestamptz
);

-- Les allocations d'un paiement, à plat : un mois réglé par ligne.
create table paiement_allocations (
  paiement_id text not null references paiements(id),
  loyer_id text not null references loyers(id),
  montant integer not null,
  detail jsonb,
  primary key (paiement_id, loyer_id)
);

-- Les quittances figent leurs mentions à l'émission : elles ne sont pas relues
-- ailleurs, donc chaque champ est une colonne figée, et non une jointure.
create table quittances (
  id text primary key,
  numero text unique not null,
  sequence integer,
  annee integer,
  paiement_id text references paiements(id),
  bail_id text references baux(id),
  locataire_id text references locataires(id),
  periode text,
  montant integer,
  date_paiement text,
  date_emission text,
  mode text,
  detail jsonb,
  libelles jsonb,
  allocations jsonb,
  caution_sur jsonb,
  nom_locataire text,
  prenoms_locataire text,
  ifu_locataire text,
  telephone_locataire text,
  designation_lot text,
  numero_lot text,
  adresse_immeuble text,
  nom_proprietaire text,
  prenoms_proprietaire text,
  ifu_proprietaire text,
  telephone_proprietaire text,
  adresse_proprietaire text,
  ville_proprietaire text,
  created_at timestamptz
);

-- Aucune dépense n'existe encore dans Firestore : la structure suit le code
-- (`createDepense`), et les champs inconnus restent dans `donnees`.
create table depenses (
  id text primary key,
  immeuble_id text references immeubles(id),
  categorie text,
  libelle text,
  montant integer,
  date text,
  notes text,
  donnees jsonb,
  updated_at timestamptz
);

-- Compteurs (numérotation des quittances), un par nom.
create table counters (
  name text primary key,
  value integer not null
);

-- Index sur les clés de jointure utilisées par l'application.
create index on lots (immeuble_id);
create index on baux (lot_id);
create index on baux (locataire_id);
create index on loyers (bail_id, periode);
create index on paiements (bail_id);
create index on paiement_allocations (loyer_id);
create index on quittances (paiement_id);
create index on depenses (immeuble_id);

-- Règles : seul un utilisateur connecté accède aux données.
alter table proprietaire enable row level security;
alter table immeubles enable row level security;
alter table lots enable row level security;
alter table locataires enable row level security;
alter table baux enable row level security;
alter table loyers enable row level security;
alter table paiements enable row level security;
alter table paiement_allocations enable row level security;
alter table quittances enable row level security;
alter table depenses enable row level security;
alter table counters enable row level security;

create policy "connecte_acces" on proprietaire for all to authenticated using (true) with check (true);
create policy "connecte_acces" on immeubles for all to authenticated using (true) with check (true);
create policy "connecte_acces" on lots for all to authenticated using (true) with check (true);
create policy "connecte_acces" on locataires for all to authenticated using (true) with check (true);
create policy "connecte_acces" on baux for all to authenticated using (true) with check (true);
create policy "connecte_acces" on loyers for all to authenticated using (true) with check (true);
create policy "connecte_acces" on paiements for all to authenticated using (true) with check (true);
create policy "connecte_acces" on paiement_allocations for all to authenticated using (true) with check (true);
create policy "connecte_acces" on quittances for all to authenticated using (true) with check (true);
create policy "connecte_acces" on depenses for all to authenticated using (true) with check (true);
create policy "connecte_acces" on counters for all to authenticated using (true) with check (true);
