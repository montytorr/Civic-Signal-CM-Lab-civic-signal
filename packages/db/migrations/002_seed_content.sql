-- 002_seed_content.sql
-- Launch seed content, carried over verbatim from the Supabase-era migrations:
--   topics            (old 001_initial_schema.sql)
--   polls             (old 003_seed_polls.sql, 005_seed_more_polls.sql, 011_launch_seed_content.sql)
--   source templates  (old 009_poll_proposals.sql, 010_proposal_governance.sql)
-- Every insert is idempotent (on conflict / where not exists by question), so the old
-- 012_dedupe_seed_polls.sql cleanup is not needed: a fresh database gets 43 distinct polls.

-- ─── Topics (old 001) ────────────────────────────────────────────────────────

insert into public.topics (slug, label) values
  ('geopol', 'Geopolitics'),
  ('climate', 'Climate'),
  ('econ', 'Economics'),
  ('health', 'Public Health'),
  ('science', 'Science'),
  ('elect', 'Elections'),
  ('tech', 'Technology'),
  ('energy', 'Energy')
on conflict (slug) do nothing;

-- ─── Polls (old 003) ─────────────────────────────────────────────────────────

with topic_ids as (
  select slug, id from public.topics
  where slug in ('climate', 'econ', 'geopol', 'health', 'science', 'tech', 'energy', 'elect')
)

insert into public.polls (
  topic_id,
  question,
  region,
  options,
  source_of_truth,
  resolution_criteria,
  cutoff_at,
  resolves_at,
  status
)
select
  t.id as topic_id,
  p.question,
  p.region,
  p.options::jsonb,
  p.source_of_truth,
  p.resolution_criteria,
  p.cutoff_at::timestamptz,
  p.resolves_at::timestamptz,
  'active' as status
from (
  values

  -- 1. Climate / Global
  (
    'climate',
    'Will the IPCC AR7 Synthesis Report be published before 31 December 2026?',
    'Global',
    '["Yes", "No"]',
    'IPCC.ch official publications page (https://www.ipcc.ch/reports/)',
    'Resolves Yes if the IPCC AR7 Synthesis Report appears as a published document on ipcc.ch on or before 31 December 2026 23:59 UTC. Resolves No otherwise.',
    '2026-12-24 23:59:00+00',
    '2027-01-07 23:59:00+00'
  ),

  -- 2. Economics / US
  (
    'econ',
    'Will the U.S. Federal Reserve cut its benchmark rate at the June 2026 FOMC meeting?',
    'United States',
    '["Cut", "Hold", "Raise"]',
    'Federal Reserve press release issued on the final day of the June 2026 FOMC meeting (federalreserve.gov/monetarypolicy/fomc.htm)',
    'Resolves Cut if the Federal Open Market Committee votes to lower the federal funds target range at its June 2026 meeting. Resolves Raise if the range is increased. Resolves Hold if the range is unchanged.',
    '2026-06-17 18:00:00+00',
    '2026-06-18 23:59:00+00'
  ),

  -- 3. Geopolitics / UN
  (
    'geopol',
    'Will at least 60 nations sign the High Seas Treaty implementation framework by 30 September 2026?',
    'Global',
    '["Yes", "No"]',
    'UN Division for Ocean Affairs and the Law of the Sea (DOALOS) official signatory list (un.org/depts/los)',
    'Resolves Yes if the DOALOS official signatory list records 60 or more distinct UN member state signatures on the BBNJ Agreement implementation framework on or before 30 September 2026. Resolves No otherwise.',
    '2026-09-29 23:59:00+00',
    '2026-10-07 23:59:00+00'
  ),

  -- 4. Public Health / Global
  (
    'health',
    'Will WHO declare a Public Health Emergency of International Concern in Q3 2026?',
    'Global',
    '["Yes", "No"]',
    'WHO official PHEIC declarations page (who.int/emergencies/overview)',
    'Resolves Yes if the WHO Director-General formally declares a Public Health Emergency of International Concern (PHEIC) with an announcement dated between 1 July 2026 and 30 September 2026 inclusive. Resolves No if no such declaration is issued in that window.',
    '2026-09-29 23:59:00+00',
    '2026-10-07 23:59:00+00'
  ),

  -- 5. Science / Global
  (
    'science',
    'Will SpaceX Starship complete a fully-reusable orbital flight in 2026?',
    'Global',
    '["Yes", "No"]',
    'SpaceX official mission updates (spacex.com/updates) and FAA launch licensing records',
    'Resolves Yes if SpaceX publicly confirms, and FAA records confirm, a Starship mission in which both the Super Heavy booster and Ship upper stage are recovered intact (not expended) following an orbital trajectory on or before 31 December 2026. Resolves No otherwise.',
    '2026-12-28 23:59:00+00',
    '2027-01-07 23:59:00+00'
  ),

  -- 6. Technology / EU
  (
    'tech',
    'Will the EU AI Act enforcement begin general-purpose model audits before Q4 2026?',
    'European Union',
    '["Yes", "No"]',
    'EU AI Office official enforcement notices and the Official Journal of the European Union (eur-lex.europa.eu)',
    'Resolves Yes if the EU AI Office or a designated national authority formally initiates at least one general-purpose AI model audit procedure (as defined under the AI Act Chapter V) with a notice dated before 1 October 2026. Resolves No otherwise.',
    '2026-09-29 23:59:00+00',
    '2026-10-07 23:59:00+00'
  ),

  -- 7. Energy / OPEC+
  (
    'energy',
    'Will OPEC+ announce a production cut at its next ministerial meeting?',
    'Global',
    '["Cut", "Hold", "Increase"]',
    'OPEC official communiqué published on opec.org following the next OPEC+ Joint Ministerial Monitoring Committee (JMMC) or full ministerial meeting',
    'Resolves Cut if the official post-meeting communiqué states that aggregate OPEC+ production targets are reduced relative to the prior agreement. Resolves Increase if targets are raised. Resolves Hold if targets are unchanged.',
    '2026-06-29 23:59:00+00',
    '2026-07-07 23:59:00+00'
  ),

  -- 8. Elections / France
  (
    'elect',
    'Will voter turnout in the 2027 French presidential election exceed 75%?',
    'France',
    '["Yes", "No"]',
    'French Ministry of the Interior official election results portal (interieur.gouv.fr/Elections)',
    'Resolves Yes if the Ministry of the Interior official results for the 2027 French presidential election (first or second round, whichever is referenced in the question) report a national turnout figure strictly above 75.00%. Resolves No otherwise.',
    '2027-04-27 20:00:00+00',
    '2027-05-04 23:59:00+00'
  ),

  -- 9. Geopolitics / UN Security Council
  (
    'geopol',
    'Will the UN Security Council adopt a new resolution on climate security before 2027?',
    'Global',
    '["Yes", "No"]',
    'UN Security Council official resolutions database (undocs.org/en/S/RES)',
    'Resolves Yes if a UN Security Council resolution explicitly addressing climate change as a security threat is adopted (not merely proposed or vetoed) and published in the UN resolutions database with a date on or before 31 December 2026. Resolves No otherwise.',
    '2026-12-28 23:59:00+00',
    '2027-01-07 23:59:00+00'
  ),

  -- 10. Economics / UK
  (
    'econ',
    'Will UK annual CPI inflation fall below 2% before December 2026?',
    'United Kingdom',
    '["Yes", "No"]',
    'UK Office for National Statistics (ONS) Consumer Price Index release (ons.gov.uk/economy/inflationandpriceindices)',
    'Resolves Yes if any ONS monthly CPI release published before 1 December 2026 reports a 12-month CPI rate strictly below 2.0%. Resolves No if no such release is published before that date.',
    '2026-11-30 23:59:00+00',
    '2026-12-07 23:59:00+00'
  )

) as p(
  topic_slug,
  question,
  region,
  options,
  source_of_truth,
  resolution_criteria,
  cutoff_at,
  resolves_at
)
join topic_ids t on t.slug = p.topic_slug
where not exists (select 1 from public.polls existing where existing.question = p.question);

-- ─── Polls (old 005) ─────────────────────────────────────────────────────────

with topic_ids as (
  select slug, id from public.topics
  where slug in ('climate', 'econ', 'geopol', 'health', 'science', 'tech', 'energy', 'elect')
)

insert into public.polls (
  topic_id,
  question,
  region,
  options,
  source_of_truth,
  resolution_criteria,
  cutoff_at,
  resolves_at,
  status
)
select
  t.id as topic_id,
  p.question,
  p.region,
  p.options::jsonb,
  p.source_of_truth,
  p.resolution_criteria,
  p.cutoff_at::timestamptz,
  p.resolves_at::timestamptz,
  'active' as status
from (
  values

  -- ── CLIMATE (4) ────────────────────────────────────────────────────────────

  -- 11
  (
    'climate',
    'Will global average surface temperature in 2026 be the hottest year on record?',
    'Global',
    '["Yes", "No"]',
    'WMO Global Climate Statement for 2026 (wmo.int/publication-series/wmo-global-climate-statements)',
    'Resolves Yes if the WMO annual Global Climate Statement published in early 2027 declares 2026 the warmest year on record in the combined instrumental surface temperature dataset. Resolves No if another year holds the record or the statement is inconclusive.',
    '2027-01-28 23:59:00+00',
    '2027-02-07 23:59:00+00'
  ),

  -- 12
  (
    'climate',
    'Will the Amazon basin experience a below-average dry-season fire count in 2026 compared to the 2015-2024 mean?',
    'Brazil',
    '["Yes", "No"]',
    'Brazil INPE PRODES and BDQueimadas fire monitoring database (queimadas.dgi.inpe.br)',
    'Resolves Yes if INPE reports the total Amazon basin active-fire count for July-October 2026 is strictly below the 2015-2024 mean for the same months. Resolves No otherwise.',
    '2026-11-15 23:59:00+00',
    '2026-11-30 23:59:00+00'
  ),

  -- 13
  (
    'climate',
    'Will the EU reach agreement on a common defense-plus-climate spending framework before October 2026?',
    'European Union',
    '["Yes", "No"]',
    'Official Journal of the European Union (eur-lex.europa.eu) and European Council conclusions',
    'Resolves Yes if the European Council formally adopts a joint framework explicitly linking defense and climate expenditure targets before 1 October 2026. Resolves No otherwise.',
    '2026-09-29 23:59:00+00',
    '2026-10-07 23:59:00+00'
  ),

  -- 14
  (
    'climate',
    'Will global CO2 emissions decline year-over-year in 2026 according to the IEA?',
    'Global',
    '["Yes", "No"]',
    'IEA Global Energy Review or CO2 Emissions from Energy Combustion report for 2026 (iea.org/reports)',
    'Resolves Yes if the IEA''s primary 2026 emissions report states that global energy-related CO2 emissions in 2026 were strictly lower than in 2025. Resolves No otherwise.',
    '2027-03-28 23:59:00+00',
    '2027-04-07 23:59:00+00'
  ),

  -- ── ECONOMICS (4) ──────────────────────────────────────────────────────────

  -- 15
  (
    'econ',
    'Will India''s GDP growth exceed 7% in Q2 2026 (April-June) according to the Ministry of Statistics?',
    'India',
    '["Yes", "No"]',
    'India Ministry of Statistics and Programme Implementation (MoSPI) National Accounts press release for Q2 2026-27 (mospi.gov.in)',
    'Resolves Yes if the MoSPI advance or revised estimate for April-June 2026 GDP growth at constant prices reports a rate strictly above 7.0% year-on-year. Resolves No otherwise.',
    '2026-11-28 23:59:00+00',
    '2026-12-07 23:59:00+00'
  ),

  -- 16
  (
    'econ',
    'Will the eurozone enter a technical recession (two consecutive quarters of negative GDP growth) in 2026?',
    'European Union',
    '["Yes", "No"]',
    'Eurostat GDP and main aggregates flash estimates (ec.europa.eu/eurostat/statistics-explained/index.php/GDP_and_main_aggregates)',
    'Resolves Yes if Eurostat flash estimates published in 2026 show two consecutive quarters of negative quarter-on-quarter real GDP growth in the eurozone. Resolves No if no such sequence is reported by 31 December 2026.',
    '2026-12-29 23:59:00+00',
    '2027-01-07 23:59:00+00'
  ),

  -- 17
  (
    'econ',
    'Will the Bank of Japan raise its policy rate above 1% before the end of 2026?',
    'Japan',
    '["Yes", "No"]',
    'Bank of Japan Monetary Policy Meeting statements and press releases (boj.or.jp/en/mopo/)',
    'Resolves Yes if the Bank of Japan officially sets its uncollateralised overnight call rate target or policy rate above 1.00% in any Monetary Policy Meeting statement dated on or before 31 December 2026. Resolves No otherwise.',
    '2026-12-29 23:59:00+00',
    '2027-01-07 23:59:00+00'
  ),

  -- 18
  (
    'econ',
    'Will the US unemployment rate rise above 5% at any point in 2026?',
    'United States',
    '["Yes", "No"]',
    'US Bureau of Labor Statistics monthly Employment Situation Summary (bls.gov/news.release/empsit.toc.htm)',
    'Resolves Yes if any BLS monthly Employment Situation report published in 2026 reports a seasonally-adjusted national unemployment rate strictly above 5.0%. Resolves No if no such figure appears in 2026 reports.',
    '2026-12-05 23:59:00+00',
    '2026-12-12 23:59:00+00'
  ),

  -- ── GEOPOLITICS (4) ────────────────────────────────────────────────────────

  -- 19
  (
    'geopol',
    'Will NATO formally accept a new member state in 2026?',
    'Global',
    '["Yes", "No"]',
    'NATO official membership announcements (nato.int/cps/en/natohq/topics_52044.htm)',
    'Resolves Yes if NATO issues a formal accession announcement for a new member state at any point in 2026. Resolves No if no such announcement is made before 31 December 2026.',
    '2026-12-29 23:59:00+00',
    '2027-01-07 23:59:00+00'
  ),

  -- 20
  (
    'geopol',
    'Will the WTO Appellate Body resume operations with a full bench of seven members before July 2026?',
    'Global',
    '["Yes", "No"]',
    'WTO Dispute Settlement Body meeting records and Appellate Body membership page (wto.org/english/tratop_e/dispu_e/appellate_body_e.htm)',
    'Resolves Yes if the WTO Dispute Settlement Body formally appoints enough members to restore a full seven-member Appellate Body bench before 1 July 2026. Resolves No otherwise.',
    '2026-06-29 23:59:00+00',
    '2026-07-07 23:59:00+00'
  ),

  -- 21
  (
    'geopol',
    'Will G7 leaders agree on a new Russia sanctions package at the 2026 G7 Summit?',
    'Global',
    '["Yes", "No"]',
    'Official G7 Summit communiqué (g7italy.it or the host-country portal for the 2026 Summit)',
    'Resolves Yes if the official G7 Summit communiqué published at the conclusion of the 2026 summit explicitly announces a new or expanded sanctions package targeting Russia. Resolves No otherwise.',
    '2026-06-14 23:59:00+00',
    '2026-06-21 23:59:00+00'
  ),

  -- 22
  (
    'geopol',
    'Will Israel and a new Arab state establish formal diplomatic relations in 2026?',
    'Middle East',
    '["Yes", "No"]',
    'Official government announcements from the relevant states and UN treaty registration records',
    'Resolves Yes if both the Israeli government and the government of a state with which it did not previously have formal relations jointly announce the establishment of full diplomatic relations, with an announcement dated in 2026. Resolves No otherwise.',
    '2026-12-29 23:59:00+00',
    '2027-01-07 23:59:00+00'
  ),

  -- ── PUBLIC HEALTH (3) ──────────────────────────────────────────────────────

  -- 23
  (
    'health',
    'Will the WHO approve a new malaria vaccine for wide use in sub-Saharan Africa before October 2026?',
    'Sub-Saharan Africa',
    '["Yes", "No"]',
    'WHO prequalification database and official press releases (extranet.who.int/pqweb/vaccines)',
    'Resolves Yes if the WHO issues prequalification or a positive policy recommendation for a malaria vaccine not previously approved (other than RTS,S/AS01 and R21/Matrix-M) before 1 October 2026. Resolves No otherwise.',
    '2026-09-29 23:59:00+00',
    '2026-10-07 23:59:00+00'
  ),

  -- 24
  (
    'health',
    'Will US FDA approve a new Alzheimer''s disease-modifying treatment in 2026?',
    'United States',
    '["Yes", "No"]',
    'FDA drug approvals database (fda.gov/drugs/nda-and-bla-approvals)',
    'Resolves Yes if the FDA grants full or accelerated approval to a drug with a claimed disease-modifying mechanism of action for Alzheimer''s disease, with an approval date in 2026 and distinct from previously approved agents (lecanemab, donanemab). Resolves No otherwise.',
    '2026-12-29 23:59:00+00',
    '2027-01-07 23:59:00+00'
  ),

  -- 25
  (
    'health',
    'Will global measles cases in 2026 exceed the 2023 total reported by WHO?',
    'Global',
    '["Yes", "No"]',
    'WHO Global Health Observatory measles data and the joint WHO-UNICEF annual measles report for 2026',
    'Resolves Yes if the WHO annual measles surveillance report covering 2026 (expected publication 2027) records a global total of confirmed and probable measles cases strictly higher than the 2023 total. Resolves No otherwise.',
    '2027-03-28 23:59:00+00',
    '2027-04-07 23:59:00+00'
  ),

  -- ── SCIENCE (3) ────────────────────────────────────────────────────────────

  -- 26
  (
    'science',
    'Will NASA''s Artemis III crewed Moon landing mission launch in 2026?',
    'Global',
    '["Yes", "No"]',
    'NASA official Artemis mission status page (nasa.gov/artemis) and NASA/commercial launch records',
    'Resolves Yes if Artemis III lifts off from Earth with a crew on board on or before 31 December 2026, as confirmed by NASA''s official mission updates. Resolves No otherwise.',
    '2026-12-29 23:59:00+00',
    '2027-01-07 23:59:00+00'
  ),

  -- 27
  (
    'science',
    'Will a peer-reviewed study report room-temperature ambient-pressure superconductivity confirmed by independent labs in 2026?',
    'Global',
    '["Yes", "No"]',
    'Publications in Nature, Science, or Physical Review Letters indexed by Web of Science or Scopus, with independent replication noted in the same or follow-up study by end of 2026',
    'Resolves Yes if a peer-reviewed paper reporting room-temperature (above 20°C) ambient-pressure superconductivity is published in a major journal AND at least one independent laboratory publishes a replication result, both indexed before 31 December 2026. Resolves No otherwise.',
    '2026-12-29 23:59:00+00',
    '2027-01-07 23:59:00+00'
  ),

  -- 28
  (
    'science',
    'Will the James Webb Space Telescope confirm biosignature gases in an exoplanet atmosphere in 2026?',
    'Global',
    '["Yes", "No"]',
    'NASA/ESA/CSA JWST official science publications page and the peer-reviewed paper itself (STScI JWST blog: webbtelescope.org/news)',
    'Resolves Yes if NASA, ESA, or CSA officially announces a JWST finding of confirmed biosignature gases (dimethyl sulfide, phosphine, or equivalent) in an exoplanet atmosphere, backed by a peer-reviewed paper published or accepted in 2026. Resolves No otherwise.',
    '2026-12-29 23:59:00+00',
    '2027-01-07 23:59:00+00'
  ),

  -- ── TECHNOLOGY (3) ─────────────────────────────────────────────────────────

  -- 29
  (
    'tech',
    'Will a publicly available AI model achieve a score above 90% on the MMLU benchmark in 2026?',
    'Global',
    '["Yes", "No"]',
    'MMLU leaderboard on Papers With Code (paperswithcode.com/sota/multi-task-language-understanding-on-mmlu) and the model''s official technical report',
    'Resolves Yes if any model with publicly accessible weights or API access reports a 5-shot MMLU score strictly above 90.0% on the standard test split, as listed on the Papers With Code leaderboard with a date in 2026. Resolves No otherwise.',
    '2026-12-29 23:59:00+00',
    '2027-01-07 23:59:00+00'
  ),

  -- 30
  (
    'tech',
    'Will China''s semiconductor industry produce a 5nm-class chip without foreign EUV lithography tools in 2026?',
    'China',
    '["Yes", "No"]',
    'SMIC, Huawei, or CXMT official product announcements and independent teardown reports by TechInsights or similar firms',
    'Resolves Yes if SMIC or another Chinese fab publicly ships a chip with transistor density consistent with a 5nm-class node (verified by a credible third-party teardown report) without the use of ASML EUV equipment, announced by 31 December 2026. Resolves No otherwise.',
    '2026-12-29 23:59:00+00',
    '2027-01-07 23:59:00+00'
  ),

  -- 31
  (
    'tech',
    'Will the EU Digital Markets Act result in Apple opening iPhone sideloading to all EU users in 2026?',
    'European Union',
    '["Yes", "No"]',
    'Apple Developer News and Updates (developer.apple.com/news/) and the European Commission DMA enforcement tracker',
    'Resolves Yes if Apple ships an iOS update in 2026 that enables sideloading (installation of apps from non-App-Store sources) for all EU-resident iPhone users, confirmed by Apple''s official developer notes or a European Commission compliance decision. Resolves No otherwise.',
    '2026-12-29 23:59:00+00',
    '2027-01-07 23:59:00+00'
  ),

  -- ── ENERGY (2) ─────────────────────────────────────────────────────────────

  -- 32
  (
    'energy',
    'Will global offshore wind capacity additions in 2026 exceed 25 GW according to IRENA?',
    'Global',
    '["Yes", "No"]',
    'IRENA Renewable Capacity Statistics 2027 report (irena.org/Publications/2027/Mar/Renewable-capacity-statistics-2027)',
    'Resolves Yes if the IRENA Renewable Capacity Statistics report covering year-end 2026 data reports global newly installed offshore wind capacity strictly above 25 GW for the year 2026. Resolves No otherwise.',
    '2027-04-28 23:59:00+00',
    '2027-05-07 23:59:00+00'
  ),

  -- 33
  (
    'energy',
    'Will Brent crude oil average below $70 per barrel in Q3 2026?',
    'Global',
    '["Yes", "No"]',
    'ICE Brent front-month futures daily settlement prices (theice.com/products/219/Brent-Crude-Futures) averaged over July-September 2026',
    'Resolves Yes if the arithmetic mean of daily ICE Brent front-month settlement prices for all trading days in July, August, and September 2026 is strictly below $70.00 USD per barrel. Resolves No otherwise.',
    '2026-10-05 23:59:00+00',
    '2026-10-12 23:59:00+00'
  ),

  -- ── ELECTIONS (2) ──────────────────────────────────────────────────────────

  -- 34
  (
    'elect',
    'Will the incumbent party win the 2026 German federal election?',
    'Germany',
    '["Yes", "No"]',
    'German Federal Returning Officer official election results (bundeswahlleiter.de)',
    'Resolves Yes if the party that leads (or led the largest bloc of) the outgoing federal government retains the chancellorship after the 2026 federal election, as confirmed by the Federal Returning Officer. Resolves No if a different party forms the government.',
    '2026-10-12 23:59:00+00',
    '2026-10-26 23:59:00+00'
  ),

  -- 35
  (
    'elect',
    'Will voter turnout in the 2026 Brazilian municipal elections exceed 80%?',
    'Brazil',
    '["Yes", "No"]',
    'Brazilian Superior Electoral Court (TSE) official results portal (tse.jus.br)',
    'Resolves Yes if the TSE reports national voter turnout (valid votes cast as a percentage of registered electors) strictly above 80% for the first round of the 2026 Brazilian municipal elections. Resolves No otherwise.',
    '2026-10-08 18:00:00+00',
    '2026-10-15 23:59:00+00'
  )

) as p(
  topic_slug,
  question,
  region,
  options,
  source_of_truth,
  resolution_criteria,
  cutoff_at,
  resolves_at
)
join topic_ids t on t.slug = p.topic_slug
where not exists (select 1 from public.polls existing where existing.question = p.question);

-- ─── Source templates (old 009) ──────────────────────────────────────────────

insert into public.source_templates (slug, label, region, topic_slug, source_of_truth, resolution_criteria_template) values
  ('eu-commission-official', 'EU Commission official publication', 'European Union', 'geopol', 'European Commission official press release or EUR-Lex publication', 'Resolves according to the first official European Commission or EUR-Lex publication matching the question. Drafts, leaks, and unofficial briefings do not count.'),
  ('us-federal-register', 'US Federal Register rule/action', 'United States', 'geopol', 'Federal Register publication plus named agency docket', 'Resolves according to the final Federal Register publication or named agency docket. Proposed rules do not count unless the question explicitly asks about proposal publication.'),
  ('un-official-vote', 'UN official vote record', 'United Nations', 'geopol', 'United Nations Digital Library voting record or official meeting record', 'Resolves according to the official UN voting/meeting record. Press coverage and draft resolutions do not count.'),
  ('elections-certified-result', 'Certified election result', 'Global', 'elect', 'Official election authority certified result', 'Resolves according to the final certified result from the named election authority. Projections, exit polls, and media calls do not count.'),
  ('ipcc-publication', 'IPCC publication', 'Global', 'climate', 'IPCC.ch publication page and official press release', 'Resolves YES only if the named IPCC report or synthesis is officially published on ipcc.ch by the cutoff specified in the question. Leaks and pre-publication drafts do not count.'),
  ('economic-stat-release', 'Official economic statistic release', 'Global', 'econ', 'Named official statistics agency release', 'Resolves according to the first official release from the named statistics agency. Later revisions do not change the result unless the question explicitly says revised data.')
on conflict (slug) do update set
  label = excluded.label,
  region = excluded.region,
  topic_slug = excluded.topic_slug,
  source_of_truth = excluded.source_of_truth,
  resolution_criteria_template = excluded.resolution_criteria_template;

-- ─── Source templates (old 010) ──────────────────────────────────────────────

insert into public.source_templates (slug, label, region, topic_slug, source_of_truth, resolution_criteria_template) values
  ('who-public-health-emergency', 'WHO public health emergency', 'Global', 'health', 'World Health Organization official statement and WHO.int emergency page', 'Resolves according to the first official WHO statement or emergency page update. Media reports, member-state briefings, and unofficial documents do not count.'),
  ('iea-energy-report', 'IEA energy publication', 'Global', 'climate', 'International Energy Agency official report page', 'Resolves according to the named IEA report or data release published on iea.org. Previews, speeches, and third-party coverage do not count.'),
  ('national-court-ruling', 'National court ruling', 'National', 'geopol', 'Named court docket or official judgment publication', 'Resolves according to the final published judgment or docket entry from the named court. Oral arguments, leaks, and non-final orders do not count unless explicitly named.'),
  ('central-bank-rate-decision', 'Central bank rate decision', 'National', 'econ', 'Named central bank official monetary policy statement', 'Resolves according to the official monetary policy statement from the named central bank. Market expectations and press speculation do not count.'),
  ('local-council-vote', 'Local council vote', 'Local', 'local', 'Official local council minutes, agenda result, or clerk publication', 'Resolves according to the official council record or clerk publication. Campaign statements, local press previews, and unofficial livestream comments do not count.')
on conflict (slug) do update set
  label = excluded.label,
  region = excluded.region,
  topic_slug = excluded.topic_slug,
  source_of_truth = excluded.source_of_truth,
  resolution_criteria_template = excluded.resolution_criteria_template;

-- ─── Polls (old 011) ─────────────────────────────────────────────────────────

with topic_ids as (
  select slug, id from public.topics
  where slug in ('climate', 'econ', 'geopol', 'health', 'science', 'tech', 'energy', 'elect', 'local')
), seed_polls(topic_slug, question, region, options, source_of_truth, resolution_criteria, cutoff_at, resolves_at) as (
  values
  ('geopol', 'Will the European Council formally open accession negotiations with Ukraine on all negotiation clusters before 31 December 2026?', 'European Union / Ukraine', '["Yes", "No"]', 'European Council conclusions and European Commission enlargement package publications', 'Resolves YES if official European Council conclusions or Commission enlargement documentation state that accession negotiations with Ukraine have opened on all negotiation clusters by 2026-12-31 23:59 UTC. Draft agendas, leaks, and press speculation do not count.', '2026-12-20 23:59:00+00', '2027-01-08 23:59:00+00'),
  ('econ', 'Will the ECB lower its deposit facility rate at least twice during calendar year 2026?', 'Euro area', '["Yes", "No"]', 'European Central Bank monetary policy decisions page', 'Resolves YES if ECB official monetary policy decisions record at least two decreases in the deposit facility rate with decision dates from 2026-01-01 through 2026-12-31 inclusive. Intra-meeting market pricing and speeches do not count.', '2026-12-18 23:59:00+00', '2027-01-08 23:59:00+00'),
  ('climate', 'Will the EU publish its final 2040 climate target legislation in the Official Journal before 30 June 2026?', 'European Union', '["Yes", "No"]', 'Official Journal of the European Union and EUR-Lex', 'Resolves YES if final adopted legislation setting the EU 2040 climate target is published in the Official Journal or EUR-Lex by 2026-06-30 23:59 UTC. Commission proposals, Council positions, and trilogue reports do not count as final publication.', '2026-06-20 23:59:00+00', '2026-07-08 23:59:00+00'),
  ('health', 'Will WHO declare a new Public Health Emergency of International Concern before 31 December 2026?', 'Global', '["Yes", "No"]', 'World Health Organization official Director-General statements and WHO emergency page', 'Resolves YES if the WHO Director-General formally declares a new PHEIC with an announcement dated on or before 2026-12-31. Continuations or extensions of existing PHEICs do not count unless WHO identifies a new emergency declaration.', '2026-12-24 23:59:00+00', '2027-01-08 23:59:00+00'),
  ('elect', 'Will turnout in the 2026 United States midterm House elections exceed 50% of the voting-eligible population?', 'United States', '["Yes", "No"]', 'United States Elections Project national turnout statistics', 'Resolves YES if the United States Elections Project reports national 2026 House midterm turnout above 50.0% of voting-eligible population. Preliminary media estimates do not count; use the first published national post-election dataset from the named source.', '2026-11-03 23:59:00+00', '2026-12-15 23:59:00+00'),
  ('geopol', 'Will the UN Security Council adopt a resolution explicitly authorizing a new peacekeeping mission before 31 December 2026?', 'United Nations', '["Yes", "No"]', 'United Nations Security Council official resolutions database', 'Resolves YES if a Security Council resolution adopted by 2026-12-31 explicitly authorizes creation of a new UN peacekeeping mission. Mandate renewals, statements, and failed draft resolutions do not count.', '2026-12-24 23:59:00+00', '2027-01-08 23:59:00+00'),
  ('tech', 'Will the EU AI Office publish a public GPAI model code-of-practice compliance assessment before 1 October 2026?', 'European Union', '["Yes", "No"]', 'EU AI Office official publications and European Commission digital strategy pages', 'Resolves YES if the EU AI Office or European Commission publishes a public compliance assessment or equivalent formal evaluation of at least one general-purpose AI model/code-of-practice process before 2026-10-01 00:00 UTC. Speeches, consultations, and draft templates do not count.', '2026-09-20 23:59:00+00', '2026-10-08 23:59:00+00'),
  ('econ', 'Will UK CPI inflation be at or below 2.0% in any ONS monthly release published before 31 December 2026?', 'United Kingdom', '["Yes", "No"]', 'UK Office for National Statistics CPI release table', 'Resolves YES if any ONS CPI release published before 2026-12-31 reports annual CPI inflation at or below 2.0%. Later revisions do not change the result unless the original release is withdrawn.', '2026-12-15 23:59:00+00', '2027-01-08 23:59:00+00')
)
insert into public.polls (topic_id, question, region, options, source_of_truth, resolution_criteria, cutoff_at, resolves_at, status)
select t.id, s.question, s.region, s.options::jsonb, s.source_of_truth, s.resolution_criteria, s.cutoff_at::timestamptz, s.resolves_at::timestamptz, 'active'
from seed_polls s
join topic_ids t on t.slug = s.topic_slug
where not exists (select 1 from public.polls p where p.question = s.question);
