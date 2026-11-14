-- ---------------------------------------------------------------------------
-- Jeu de démonstration COMPLET — version SQL de scripts/seed-complet.mts,
-- pour une base sans accès direct (console SQL Supabase).
--
-- Même algorithme, même générateur pseudo-aléatoire (Park et Miller, calcul
-- entier exact) : les deux versions produisent les mêmes données.
--
-- Prérequis : le seed de base (entité ent_demo_maroc). Ajoute 2 centres
-- d'affaires, 60 clients fictifs « Société démo NN », 24 mois d'historique
-- de notes (reprise du stock), watch list, lignes d'engagement (dont des cas
-- de rapprochement saisie / T24), bilans, dossiers décidés, un groupe
-- d'affaires et des cours de change.
--
-- Rejouable : identifiants « demo_ », INSERT ... ON CONFLICT DO NOTHING.
-- N'efface rien.
--
-- Usage :
--   psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f prisma/sql/18-seed-complet-demonstration.sql
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  s bigint := 42;
  r float8;
  sch_today date := (now() AT TIME ZONE 'utc')::date;
  today date;
  bank_path text;
  bank_level int;
  grp text;
  segs text[] := ARRAY['TPE','PME','PME','GE'];
  ents text[] := ARRAY['ent_ca_casa','ent_ca_rabat','ent_demo_maroc'];
  forms text[] := ARRAY['SA','SARL','SARL_AU','SAS'];
  sectors text[] := ARRAY['NMAE_C','NMAE_F','NMAE_G','NMAE_H','NMAE_I','NMAE_J'];
  cities text[] := ARRAY['Casablanca','Rabat','Salé','Kénitra','Tanger','Tétouan','Fès','Meknès','Marrakech','Agadir'];
  officers text[] := ARRAY['CA0101','CA0107','CA0203','CA0310'];
  i int; k int; c int; n text; cp text;
  seg text; ent text; lf text; sec text; city text; officer text;
  start date; d date; dt date; dates date[];
  expo float8; g int; grade text; asof text; exposure float8;
  in_t24 boolean; auth float8; used float8; late boolean; odays int;
  wl_date date; ent_date date;
  yr int; fy int; ca float8; achats float8; ext float8; perso float8; dot float8; interets float8;
  avant float8; impots float8; rn float8; immo float8; stocks float8; clients float8; treso_a float8;
  actif float8; capital float8; reserves float8; dettes float8; treso_p float8; fournisseurs float8;
  sub date; dec_at timestamp; rejected boolean;
  ref text;
BEGIN
  today := make_date(extract(year FROM sch_today)::int, extract(month FROM sch_today)::int, least(extract(day FROM sch_today)::int, 28));
  SELECT path, level INTO bank_path, bank_level FROM corp_scoring.entities WHERE id = 'ent_demo_maroc';
  IF bank_path IS NULL THEN RAISE EXCEPTION 'Entité ent_demo_maroc absente : appliquez d''abord le seed de base.'; END IF;

  -- Centres d'affaires.
  INSERT INTO corp_scoring.entities (id, code, name, type, "parentId", path, level, country, currency, "updatedAt")
  VALUES ('ent_ca_casa', 'CA-CASA', 'Centre d''affaires Casablanca', 'BUSINESS_CENTER', 'ent_demo_maroc', bank_path || 'ent_ca_casa/', bank_level + 1, 'MA', 'MAD', now()),
         ('ent_ca_rabat', 'CA-RABAT', 'Centre d''affaires Rabat', 'BUSINESS_CENTER', 'ent_demo_maroc', bank_path || 'ent_ca_rabat/', bank_level + 1, 'MA', 'MAD', now())
  ON CONFLICT DO NOTHING;

  -- Cours de change.
  INSERT INTO corp_scoring.exchange_rates (id, currency, "effectiveDate", rate, source, "createdBy")
  SELECT 'demo_fx_' || x.cur || '_' || to_char(date_trunc('month', today), 'YYYY-MM-DD'), x.cur, to_char(date_trunc('month', today), 'YYYY-MM-DD'), x.rate, 'Démonstration (cours indicatif)', 'seed-complet'
  FROM (VALUES ('EUR', 10.85), ('USD', 9.96), ('XOF', 0.01654)) AS x(cur, rate)
  ON CONFLICT DO NOTHING;

  -- Groupe d'affaires.
  INSERT INTO corp_scoring.economic_groups (id, code, name, "entityId", "createdBy", "updatedAt")
  VALUES ('demo_grp_atlas', 'GRP-DEMO-ATLAS', 'Groupe Atlas Démonstration (fictif)', 'ent_demo_maroc', 'seed-complet', now())
  ON CONFLICT DO NOTHING;
  SELECT id INTO grp FROM corp_scoring.economic_groups WHERE "entityId" = 'ent_demo_maroc' AND code = 'GRP-DEMO-ATLAS';

  FOR i IN 0..59 LOOP
    n := lpad((i + 1)::text, 2, '0');
    cp := 'demo_cp_' || n;
    s := s * 16807 % 2147483647; r := s / 2147483647.0::float8; seg := segs[1 + floor(r * 4)::int];
    s := s * 16807 % 2147483647; r := s / 2147483647.0::float8; ent := ents[1 + floor(r * 3)::int];
    s := s * 16807 % 2147483647; r := s / 2147483647.0::float8;
    start := (date_trunc('month', today) + make_interval(months => -26 + floor(r * 6)::int))::date + (extract(day FROM today)::int - 1);
    in_t24 := i % 3 <> 2;
    s := s * 16807 % 2147483647; r := s / 2147483647.0::float8;
    expo := floor((CASE seg WHEN 'GE' THEN 80 + r * 400 WHEN 'PME' THEN 10 + r * 60 ELSE 1 + r * 6 END) * 1e6 + 0.5);
    s := s * 16807 % 2147483647; r := s / 2147483647.0::float8; lf := forms[1 + floor(r * 4)::int];
    s := s * 16807 % 2147483647; r := s / 2147483647.0::float8; sec := sectors[1 + floor(r * 6)::int];
    s := s * 16807 % 2147483647; r := s / 2147483647.0::float8; city := cities[1 + floor(r * 10)::int];
    s := s * 16807 % 2147483647; r := s / 2147483647.0::float8; officer := officers[1 + floor(r * 4)::int];

    INSERT INTO corp_scoring.counterparties (id, name, "entityId", country, currency, ice, rc, "legalForm", "sectorCode", city, segment, "commercialSegment",
      "accountOfficer", "dataSource", "coreBankingId", "coreBankingSyncedAt", "economicGroupId", "createdAt", "updatedAt")
    VALUES (cp, 'Société démo ' || n || ' (fictive)', ent, 'MA', 'MAD', '9' || substr((100000000000000 + i * 7919)::text, 2), (10000 + i * 37)::text, lf, sec, city, seg, seg,
      officer, CASE WHEN in_t24 THEN 'T24' ELSE 'SAISIE' END, CASE WHEN in_t24 THEN (200100 + i)::text END, CASE WHEN in_t24 THEN today::timestamp END,
      CASE WHEN i < 4 THEN grp END, ((date_trunc('month', start) + interval '-1 month')::date + (extract(day FROM start)::int - 1))::timestamp, now())
    ON CONFLICT DO NOTHING;

    -- Historique des notes.
    s := s * 16807 % 2147483647; r := s / 2147483647.0::float8; g := 2 + floor(r * 7)::int;
    dates := ARRAY[]::date[];
    d := CASE WHEN i >= 54 THEN (date_trunc('month', today) + interval '-8 months')::date + (extract(day FROM today)::int - 1) ELSE start END;
    WHILE d <= today LOOP
      dates := dates || d;
      IF i >= 48 AND i < 54 THEN
        d := (date_trunc('month', d) + interval '30 months')::date + (extract(day FROM d)::int - 1);
      ELSE
        s := s * 16807 % 2147483647; r := s / 2147483647.0::float8;
        d := (date_trunc('month', d) + make_interval(months => 11 + floor(r * 3)::int))::date + (extract(day FROM d)::int - 1);
      END IF;
    END LOOP;
    FOR k IN 0..coalesce(array_length(dates, 1), 0) - 1 LOOP
      dt := dates[k + 1];
      IF k > 0 THEN
        s := s * 16807 % 2147483647; r := s / 2147483647.0::float8;
        g := greatest(1, least(11, g + CASE WHEN r < 0.18 THEN -1 WHEN r < 0.62 THEN 0 WHEN r < 0.85 THEN 1 WHEN r < 0.95 THEN 2 ELSE 3 END));
      END IF;
      grade := CASE WHEN g >= 11 THEN 'DEF1' ELSE g::text END;
      asof := to_char((date_trunc('month', dt) + interval '-3 months')::date + (extract(day FROM dt)::int - 1), 'YYYY-MM-DD');
      s := s * 16807 % 2147483647; r := s / 2147483647.0::float8;
      exposure := floor(expo * (0.9 + 0.2 * r) + 0.5);
      INSERT INTO corp_scoring.rating_runs (id, "counterpartyId", "modelId", "modelVersion", "engineVersion", "asOfDate", segment, outcome, "engineGrade", "cappedGrade", "finalGrade",
        "inputSnapshot", "resultSnapshot", "exposureBase", "requestedBy", origin, "idempotencyKey", "createdAt")
      VALUES ('demo_run_' || n || '_' || k, cp, 'REPRISE_STOCK', 'historique', 'reprise', asof, seg, CASE WHEN g >= 11 THEN 'DEFAULTED' ELSE 'RATED' END, grade, grade, grade,
        json_build_object('source', 'REPRISE_STOCK', 'noteOrigine', grade, 'modeleOrigine', 'Démonstration', 'commentaire', 'Historique fictif de démonstration',
          'segmentationData', json_build_object('globalBankExposure', exposure::bigint))::text,
        '{"source":"REPRISE_STOCK"}', exposure, 'seed-complet', 'REPRISE', 'demo:' || cp || ':' || asof, dt::timestamp)
      ON CONFLICT DO NOTHING;
    END LOOP;

    -- Watch list.
    IF g >= 8 AND g < 11 THEN
      s := s * 16807 % 2147483647; r := s / 2147483647.0::float8;
      IF r < 0.8 THEN
        s := s * 16807 % 2147483647; r := s / 2147483647.0::float8;
        wl_date := (date_trunc('month', today) + make_interval(months => -(2 + floor(r * 7)::int)))::date + (extract(day FROM today)::int - 1);
        INSERT INTO corp_scoring.committee_decisions (id, "counterpartyId", kind, level, "committeeDate", reference, motif, "effectiveDate", status, "recordedBy")
        VALUES ('demo_wl_' || n || '_e', cp, 'WL_ENTREE', CASE WHEN g >= 10 THEN 'WL3' WHEN g = 9 THEN 'WL2' ELSE 'WL1' END, wl_date::text, 'PV-DEMO-' || n,
          'Dégradation de la situation financière', wl_date::text, 'EFFECTIVE', 'seed-complet')
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;
    IF i % 7 = 0 THEN
      ent_date := (date_trunc('month', today) + interval '-20 months')::date + (extract(day FROM today)::int - 1);
      INSERT INTO corp_scoring.committee_decisions (id, "counterpartyId", kind, level, "committeeDate", reference, motif, "effectiveDate", status, "recordedBy")
      VALUES ('demo_wl_' || n || '_a', cp, 'WL_ENTREE', 'WL1', ent_date::text, 'PV-DEMO-A' || n, 'Retards de paiement répétés', ent_date::text, 'EFFECTIVE', 'seed-complet'),
             ('demo_wl_' || n || '_b', cp, 'WL_SORTIE', NULL, ((date_trunc('month', ent_date) + interval '6 months')::date + (extract(day FROM ent_date)::int - 1))::text, 'PV-DEMO-B' || n,
              'Régularisation des impayés', ((date_trunc('month', ent_date) + interval '6 months')::date + (extract(day FROM ent_date)::int - 1))::text, 'EFFECTIVE', 'seed-complet')
      ON CONFLICT DO NOTHING;
    END IF;

    -- Lignes d'engagement.
    auth := floor(expo * 0.9 + 0.5);
    s := s * 16807 % 2147483647; r := s / 2147483647.0::float8;
    used := floor(auth * (0.5 + r * 0.65) + 0.5);
    late := false;
    IF g >= 8 THEN
      s := s * 16807 % 2147483647; r := s / 2147483647.0::float8; late := r < 0.5;
    END IF;
    IF in_t24 THEN
      odays := NULL;
      IF late THEN s := s * 16807 % 2147483647; r := s / 2147483647.0::float8; odays := 30 + floor(r * 200)::int; END IF;
      ref := (200100 + i)::text;
      INSERT INTO corp_scoring.credit_facilities (id, "counterpartyId", source, reference, "typeCode", authorized, outstanding, overdue, "overdueDays", guarantees, "asOfDate", "recordedBy")
      VALUES ('demo_fac_' || n || '_1', cp, 'API', ref || '.0001', 'FACILITE_CAISSE', floor(auth * 0.3 + 0.5), floor(used * 0.3 + 0.5), NULL, NULL, 'Caution personnelle des dirigeants', today::text, 'seed-complet'),
             ('demo_fac_' || n || '_2', cp, 'API', ref || '.0002', 'CMT', floor(auth * 0.6 + 0.5), floor(used * 0.6 + 0.5), CASE WHEN late THEN floor(used * 0.05 + 0.5) ELSE 0 END, odays, 'Nantissement du matériel', today::text, 'seed-complet'),
             ('demo_fac_' || n || '_3', cp, 'API', ref || '.0003', 'CAUTION_MARCHES', floor(auth * 0.1 + 0.5), floor(auth * 0.05 + 0.5), NULL, NULL, NULL, today::text, 'seed-complet')
      ON CONFLICT DO NOTHING;
      IF i % 9 = 1 OR i % 9 = 4 THEN
        INSERT INTO corp_scoring.credit_facilities (id, "counterpartyId", source, reference, "typeCode", authorized, outstanding, reconciliation, "matchedReference", "reconciledBy", "reconciledAt", "asOfDate", "recordedBy")
        VALUES ('demo_fac_' || n || '_m1', cp, 'SAISIE', '', 'FACILITE_CAISSE', floor(auth * 0.3 + 0.5), floor(used * 0.28 + 0.5),
                CASE WHEN i % 9 = 4 THEN 'RAPPROCHEE' END, CASE WHEN i % 9 = 4 THEN ref || '.0001' END, CASE WHEN i % 9 = 4 THEN 'seed-complet' END, CASE WHEN i % 9 = 4 THEN today::timestamp END, today::text, 'seed-complet'),
               ('demo_fac_' || n || '_m2', cp, 'SAISIE', '', 'DECOUVERT', floor(auth * 0.05 + 0.5), floor(auth * 0.02 + 0.5),
                CASE WHEN i % 9 = 4 THEN 'CONSERVEE' END, NULL, CASE WHEN i % 9 = 4 THEN 'seed-complet' END, CASE WHEN i % 9 = 4 THEN today::timestamp END, today::text, 'seed-complet')
        ON CONFLICT DO NOTHING;
      END IF;
    ELSIF i % 2 = 0 THEN
      INSERT INTO corp_scoring.credit_facilities (id, "counterpartyId", source, reference, "typeCode", authorized, outstanding, guarantees, "asOfDate", "recordedBy")
      VALUES ('demo_fac_' || n || '_s1', cp, 'SAISIE', '', 'FACILITE_CAISSE', floor(auth * 0.4 + 0.5), floor(used * 0.4 + 0.5), 'Caution personnelle des dirigeants', today::text, 'seed-complet'),
             ('demo_fac_' || n || '_s2', cp, 'SAISIE', '', 'CMT', floor(auth * 0.6 + 0.5), floor(used * 0.6 + 0.5), 'Hypothèque', today::text, 'seed-complet')
      ON CONFLICT DO NOTHING;
    END IF;

    -- Bilans du référentiel.
    IF i % 2 = 0 THEN
      yr := extract(year FROM today)::int - 1;
      FOR k IN 0..1 LOOP
        fy := yr - k;
        s := s * 16807 % 2147483647; r := s / 2147483647.0::float8;
        ca := floor(expo * (1.6 + r) * (CASE WHEN k = 1 THEN 0.92 ELSE 1 END) + 0.5);
        achats := floor(ca * 0.55 + 0.5); ext := floor(ca * 0.12 + 0.5); perso := floor(ca * 0.14 + 0.5); dot := floor(ca * 0.04 + 0.5); interets := floor(expo * 0.06 + 0.5);
        avant := ca - achats - ext - perso - dot - interets;
        impots := greatest(0, floor(avant * 0.3 + 0.5));
        rn := avant - impots;
        immo := floor(ca * 0.5 + 0.5); stocks := floor(ca * 0.15 + 0.5); clients := floor(ca * 0.25 + 0.5); treso_a := floor(ca * 0.04 + 0.5);
        actif := immo + stocks + clients + treso_a;
        capital := floor(actif * 0.2 + 0.5); reserves := floor(actif * 0.15 + 0.5); dettes := floor(expo * 0.6 + 0.5); treso_p := floor(expo * 0.1 + 0.5);
        fournisseurs := actif - capital - reserves - rn - dettes - treso_p;
        CONTINUE WHEN fournisseurs < 0;
        INSERT INTO corp_scoring.financial_statements (id, "counterpartyId", "fiscalYear", "closingDate", "statementModel", certified, "values", source, "createdBy", "updatedAt")
        VALUES ('demo_fs_' || n || '_' || fy, cp, fy::text, fy || '-12-31', CASE WHEN seg = 'TPE' THEN 'SIMPLIFIE' ELSE 'NORMAL' END, seg <> 'TPE',
          json_build_object('IMMO_CORPORELLES', immo::bigint::text, 'STOCKS', stocks::bigint::text, 'CREANCES_CLIENTS', clients::bigint::text, 'TRESORERIE_ACTIF', treso_a::bigint::text,
            'TOTAL_ACTIF_DECLARE', actif::bigint::text, 'CAPITAL', capital::bigint::text, 'PRIMES_RESERVES', reserves::bigint::text, 'RESULTAT_EXERCICE_BILAN', rn::bigint::text,
            'DETTES_FINANCEMENT', dettes::bigint::text, 'FOURNISSEURS', fournisseurs::bigint::text, 'TRESORERIE_PASSIF', treso_p::bigint::text, 'TOTAL_PASSIF_DECLARE', actif::bigint::text,
            'VENTES_BIENS_SERVICES', ca::bigint::text, 'ACHATS_CONSOMMES', achats::bigint::text, 'AUTRES_CHARGES_EXTERNES', ext::bigint::text, 'CHARGES_PERSONNEL', perso::bigint::text,
            'DOTATIONS_EXPLOITATION', dot::bigint::text, 'CHARGES_INTERETS', interets::bigint::text, 'IMPOTS_RESULTATS', impots::bigint::text, 'RESULTAT_NET_DECLARE', rn::bigint::text)::text,
          'REPRISE_STOCK', 'seed-complet', now())
        ON CONFLICT DO NOTHING;
      END LOOP;
    END IF;

    -- Dossiers décidés.
    FOR c IN 0..1 LOOP
      s := s * 16807 % 2147483647; r := s / 2147483647.0::float8;
      sub := (date_trunc('month', today) + make_interval(months => -(1 + floor(r * 11)::int)))::date + (extract(day FROM today)::int - 1);
      s := s * 16807 % 2147483647; r := s / 2147483647.0::float8;
      dec_at := sub::timestamp + make_interval(days => 3 + floor(r * 25)::int);
      CONTINUE WHEN dec_at > today::timestamp;
      s := s * 16807 % 2147483647; r := s / 2147483647.0::float8;
      rejected := r < 0.12;
      INSERT INTO corp_scoring.rating_cases (id, "counterpartyId", "modelId", "asOfDate", status, "draftInput", "createdBy", "submittedBy", "submittedAt", "decidedBy", "decidedAt", "decisionComment", "updatedAt")
      VALUES ('demo_case_' || n || '_' || c, cp, 'CORP_STD_V1', sub::text, CASE WHEN rejected THEN 'REJECTED' ELSE 'VALIDATED' END, '{}', 'demo.analyste', 'demo.analyste', sub::timestamp,
        'demo.validateur', dec_at, 'Dossier fictif de démonstration.', now())
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;
