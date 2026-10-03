# Block catalog

Generated from `docs/atlas/blocks.json` by `node scripts/build-atlas.mjs`. Do not edit by hand.

## Block types

- **Agent**: An LLM running a tool-calling loop (plan, call tool, observe, repeat) with its own context, scoped tools and a written brief. Used where the path to the answer is not known in advance.
- **ML model**: A trained model doing one narrow job (classify, extract, embed, forecast, transcribe). No loop and no tools: input in, prediction out, with a confidence.
- **Deterministic code**: Ordinary software: same input, same output. Algorithms, rules, math, schedulers, solvers. Every number shown to a decision-maker comes from here or from a store.
- **External API / feed**: Licensed or public data delivered by a provider over an API, push stream, SFTP or webhook. Preferred over scraping whenever one exists.
- **Data store**: Where state lives: graphs, documents, vectors, time-series, logs. Versioned, permissioned and queryable as of any point in time.
- **Infrastructure**: Runtime plumbing: streaming, workflow engines, gateways and compute fleets that everything else runs on.
- **Human in the loop**: A step where a person must review, approve or correct. Encoded as a workflow with deadlines and escalation, not left to email.
- **Interface**: What people see and touch. Every number on screen links back to the engine run or document that produced it.

## L0 World Sensing

Continuously and automatically acquire everything happening outside the company: news, policy, markets, logistics, climate, cyber, competitors, social signals.

### Source Registry

*Data store + Deterministic code* · The catalog of every external source the system watches: 40k to 80k entries, each with access method, coverage, reliability and legal basis.

**How it works**

1. Each entry records the URL patterns or API endpoint, access method (licensed API, push stream, RSS, sitemap crawl, headless crawl), language, country, topics, and the ontology objects it covers (for example 'covers: Port of Kaohsiung, Taiwan MOEA, TSMC').
2. It also stores a reliability prior, typical lead time versus other sources, cost, and the legal basis for collection (licence ID, ToS reference, robots.txt status).
3. It is seeded from licensed source directories and curated per-industry lists (regulators, ministries, exchanges, ports, trade bodies, company IR pages, court dockets, patent offices, job boards, app stores).
4. The Source Discovery Agent proposes additions with evidence. Paid or sensitive sources need human approval before activation.
5. A coverage map is computed nightly: for every high-weight ontology object, how many independent, timely sources cover it. Gaps go to the discovery agent.

| | |
|---|---|
| Inputs | Curated lists; Discovery agent proposals; Licence and ToS metadata |
| Outputs | Crawl and subscription configs; Coverage gaps |
| Feeds into | Adaptive Crawl Scheduler, Real-time Stream Listeners, Licensed Feeds & APIs |
| Built with | Postgres + versioned YAML in git; coverage job in Python |
| Scale | 40k–80k sources; config changes take effect in under a minute |
| Guardrails | No source is activated without a recorded legal basis. Sources whose ToS forbid automated access are stored as 'manual only'. |

### Source Discovery Agent

*Agent* · Continuously hunts for better or missing sources and proves their value by backtesting before proposing them.

**How it works**

1. Reads the coverage-gap list (for example: 'Supplier in Vietnam with only 1 English-language source').
2. Searches the web and follows citations inside the articles that broke past stories first, to find primary sources (local-language outlets, provincial regulators, port authority notices, union channels).
3. Backtests each candidate: fetches its archive and checks whether it would have reported past events earlier or more accurately than current sources.
4. Scores uniqueness, lead time, accuracy and noise, then files a proposal with that evidence to the Source Registry.
5. Runs weekly per region and immediately when a new country or supplier enters the ontology.

| | |
|---|---|
| Inputs | Coverage gaps; Precedent library (past events); Web search |
| Outputs | Scored source proposals |
| Feeds into | Source Registry |
| Built with | Frontier LLM with tools: web.search, web.fetch, archive.backtest, registry.propose |
| Scale | Hundreds of candidates evaluated per week |
| Guardrails | Read-only tools. Cannot activate sources; can only propose them. A legal hook blocks proposals that would need ToS violation or credential sharing. |

### Adaptive Crawl Scheduler

*Deterministic code* · Decides what to fetch next, every second, so that important sources that change often are checked often, and everything else is checked cheaply.

**How it works**

1. For each source, estimates its change rate from history (Poisson change model with exponential smoothing). A page that changes hourly is revisited every few minutes; a static annual report page every few days.
2. Priority = change rate × source importance × exposure of the ontology objects it covers. Jobs go into sharded priority queues.
3. Politeness: per-domain rate limits, robots.txt and crawl-delay honoured, daily per-domain budgets, conditional GETs (ETag / Last-Modified) so unchanged pages cost almost nothing.
4. Surge mode: when Fusion detects a forming storyline (say, a port strike in Rotterdam), every source tagged to that geography and topic is boosted for a set window, for example every 30 seconds for 6 hours.
5. URL canonicalisation and seen-hash sets stop the same item being fetched twice.

| | |
|---|---|
| Inputs | Source Registry configs; Surge signals from Fusion; Fetch results (changed / unchanged) |
| Outputs | Fetch jobs |
| Feeds into | Fetcher Fleet |
| Built with | Go service on Redis/Kafka queues; batch backfills on Temporal |
| Scale | 50M–200M fetch decisions per day; hot loop under 10 ms per decision |
| Guardrails | Hard per-domain ceilings that surge mode cannot exceed. Kill switch per source and per domain. |

### Fetcher Fleet

*Infrastructure + Deterministic code* · The machines that actually retrieve pages, files, documents and media, and archive an immutable copy of every raw response.

**How it works**

1. Tier 1: lightweight HTTP clients (Go/Rust) handle about 90% of fetches: HTML, RSS, sitemaps, JSON endpoints.
2. Tier 2: a pool of headless Chromium (Playwright) for JavaScript-heavy pages. Pages are rendered, then the DOM is snapshotted.
3. Tier 3: document fetchers for PDF, XLS and DOC, plus audio and video (earnings calls, press conferences, parliamentary sessions).
4. Every raw response is written to object storage as WARC with a content hash, so any fact can later be traced to the exact bytes seen.
5. Workers autoscale on Kubernetes and run in regions close to the sources for low latency.

| | |
|---|---|
| Inputs | Fetch jobs |
| Outputs | Raw documents to the parser; WARC archive |
| Feeds into | Parse & Extract, Change Detector |
| Built with | Kubernetes, Playwright, Go/Rust fetchers, S3-compatible object store |
| Scale | Thousands of concurrent fetches; median fetch-to-archive under 2 s |
| Guardrails | No CAPTCHA solving and no login bypass. Pages that block automation are skipped and flagged for a licensed alternative. Authenticated fetches use licensed credentials only. |

### Licensed Feeds & APIs

*External API / feed* · Paid and official data delivered by providers. Faster, cleaner and legally safer than scraping, so used first wherever available.

**How it works**

1. News and wires: Reuters, AP, Bloomberg, Dow Jones, PTI, regional wires.
2. Event databases: GDELT, ACLED (conflict), sanctions lists (OFAC, EU, UN, UK, India MEA).
3. Markets: equities, rates, FX, commodities, freight indices, memory and component spot prices, credit spreads, war-risk premiums.
4. Official sources: central banks, statistics offices, gazettes, regulators (SEC EDGAR, SEBI, RBI, Federal Register, EUR-Lex), court filings, patent offices.
5. Physical world: AIS ship positions, ADS-B flights, satellite imagery and tasking, weather and climate models, seismic data, power grid status.
6. Business signals: company filings, earnings-call transcripts, job postings, app-store data, web traffic panels, customs and bill-of-lading records.

| | |
|---|---|
| Inputs | Provider contracts |
| Outputs | Structured records and documents to the Event Bus |
| Feeds into | Event Bus, Parse & Extract |
| Built with | Provider SDKs, websockets, SFTP drops, REST pollers |
| Scale | Push feeds arrive in under 1 s; batch feeds daily |
| Guardrails | Licence scope is enforced per field. Restricted fields carry a marking so they never reach users or outputs the licence excludes. |

### Real-time Stream Listeners

*Deterministic code* · Persistent connections that react in under a second to things that cannot wait for a crawl.

**How it works**

1. Holds open connections to wire push alerts, market data ticks, AIS and ADS-B streams, regulator RSS, seismic alerts, cyber threat-intel feeds (CVE, CISA KEV, ransomware leak-site monitors) and licensed social firehoses.
2. Normalises each message into a common envelope (source, time, geo, raw payload) and publishes it straight to the Event Bus.
3. Health-checks every stream and fails over to a backup provider when one goes silent. Silence on a normally busy stream is itself emitted as a signal.

| | |
|---|---|
| Inputs | Push streams |
| Outputs | Normalised messages on the bus |
| Feeds into | Event Bus |
| Built with | Rust/Go long-lived consumers |
| Scale | Sub-second end to end |
| Guardrails | Back-pressure handling so that a firehose spike cannot starve other topics. |

### Parse & Extract

*ML model + Deterministic code* · Turns raw bytes in any format and language into clean, timestamped, machine-readable documents.

**How it works**

1. Detects the format, removes boilerplate (menus, ads, cookie banners) and extracts the main text with its publish time, author and dateline.
2. A layout model reads PDFs: tables stay tables, footnotes are separated, and scanned pages go through OCR.
3. Audio and video are transcribed by speech recognition with speaker diarisation (who said what on an earnings call).
4. Detects the language and translates into the working language while keeping the original, so analysts can check the source wording.
5. Outputs a normalised Document object with hashes linking back to the WARC archive.

| | |
|---|---|
| Inputs | Raw documents |
| Outputs | Normalised documents |
| Feeds into | Event Bus |
| Built with | trafilatura-class extractors, document layout models, Whisper-class ASR, NMT models on GPU batch |
| Scale | About 1M documents/day; p50 under 3 s per document |
| Guardrails | Extraction confidence is stored. Low-confidence parses (bad OCR) are marked so downstream steps weight them less. |

### Change Detector

*Deterministic code + ML model* · Watches living documents (laws, tariff schedules, competitor price pages, sanctions lists, supplier terms) and reports exactly what changed and whether it matters.

**How it works**

1. Keeps the last version of each watched page or file.
2. On every fetch it computes a structural diff of the DOM or text and ignores cosmetic changes (dates, layout, ads).
3. A small classifier labels the significance of each change, for example 'Clause 4.2 penalty raised from 2% to 5%' or 'Model X price cut ₹1.2 lakh'.
4. Emits a ChangeEvent with before and after text and the diff.

| | |
|---|---|
| Inputs | Fetched versions |
| Outputs | ChangeEvents |
| Feeds into | Event Bus |
| Built with | Diff service + fine-tuned small classifier |
| Scale | Millions of watched documents |
| Guardrails | Both versions are stored in the archive, so every claimed change can be shown side by side. |

## L1 Enterprise Intake

Pull in everything inside the company (systems, documents, conversations, plant data, org structure) for every department and sub-department. This is the second brain's intake.

### Enterprise Connector Mesh

*External API / feed + Deterministic code* · 200+ connectors that continuously sync every internal system, inside the company's own network.

**How it works**

1. Transactional systems: ERP (SAP, Oracle), CRM (Salesforce), HR (Workday, SuccessFactors), procurement, treasury, contract management, service desk (ServiceNow), PLM and BOM, dealer management.
2. Knowledge and communication: SharePoint, OneDrive, Google Drive, Confluence, Jira, Teams and Slack channels, email (Exchange or Gmail, opt-in mailboxes), meeting transcripts, wikis, git repos.
3. Plant floor and operations: MES, SCADA and historians via OPC-UA or MQTT, quality systems, maintenance (CMMS), energy meters.
4. Analytics: data warehouses and lakes (Snowflake, Databricks, BigQuery) and BI tools (Power BI, Tableau) including their metric definitions.
5. Sync modes: change-data-capture for databases (Debezium), delta queries and webhooks for SaaS, incremental crawl for file shares, streaming for plant data.
6. Each connector registers its schema and that system's permission model with the Permission Mirror.

| | |
|---|---|
| Inputs | Internal systems |
| Outputs | Records, documents and events to the bus |
| Feeds into | Permission Mirror, Document Intelligence Pipeline, Event Bus, Process Mining, KPI Tree & Metric Layer |
| Built with | Debezium, Kafka Connect, vendor APIs, OPC-UA/MQTT gateways; deployed in the customer VPC or on-prem |
| Scale | Minutes-fresh for business systems, seconds for plant data |
| Guardrails | Data stays inside the company perimeter. Mailbox and chat ingestion is opt-in per team, with retention matching company policy. |

### Permission Mirror

*Deterministic code* · Copies who-can-see-what from every source system, so the AI can never show anyone something they could not open themselves.

**How it works**

1. For every ingested item, captures the source system's permissions: SharePoint groups, Drive shares, channel membership, ERP roles, row-level security in the warehouse.
2. Maps every identity to one corporate identity (Okta or Entra ID).
3. Attaches ACL tags to every chunk, object and row. Permission changes in the source propagate within minutes.
4. Enforcement happens at query time as a pre-filter in retrieval and in ontology queries, not as an after-the-fact check.
5. Compartments (M&A, legal privilege, HR investigations, board papers) need an explicit grant, even for the MD.

| | |
|---|---|
| Inputs | Source ACLs; Identity provider |
| Outputs | ACL tags on all content |
| Feeds into | Knowledge & Document Store, Identity & Access |
| Built with | Policy store + OPA/Cedar evaluation, cached per user |
| Scale | Under 5 ms ACL check per retrieval |
| Guardrails | Fail closed: if the ACL is unknown, the item is invisible. |

### Document Intelligence Pipeline

*ML model* · Reads every internal document, works out what it is, who it belongs to and what it is about, then links it to the ontology.

**How it works**

1. Parses every format (PDF, Word, slides, spreadsheets, email threads, chat threads, transcripts) and chunks along the document's structure: sections, whole tables, one slide per chunk.
2. Entity linking: 'Line 3', 'Part 57-A12', 'Supplier Bharat Forge', 'Project Phoenix' all become links to ontology objects.
3. Classifies the department and sub-department (from owner, location and content), the document type (SOP, policy, contract, report, minutes, spec, plan), the process it supports, and its sensitivity (PII, price-sensitive, privileged).
4. Judges authority and freshness: is this the current version, or superseded, a draft, or a personal copy? Near-duplicates are collapsed.
5. Writes summaries at three levels (one line, one paragraph, one page) and embeddings, so search and agents can work at the right zoom level.

| | |
|---|---|
| Inputs | Documents from connectors |
| Outputs | Chunks, links, labels and summaries to the Knowledge Store |
| Feeds into | Knowledge & Document Store, Org & Expertise Graph, Department Twins |
| Built with | Layout models, fine-tuned classifiers, embedding models, small LLM for summaries; GPU batch |
| Scale | Tens of millions of documents in the initial load; incremental after that |
| Guardrails | PII is detected and tagged. Summaries inherit the ACL of their source, and a summary never mixes chunks with different ACLs. |

### Org & Expertise Graph

*Deterministic code + ML model* · The living map of thousands of departments, sub-departments, teams, roles and people, plus who actually knows what.

**How it works**

1. Builds the hierarchy (company, business unit, department, sub-department, team, role, person) from HR records, directory groups and cost centres, with reporting lines.
2. Generated from data, not drawn by hand, so 3,000 departments are no harder than 30. Re-orgs flow in automatically.
3. Infers expertise from authored documents, resolved tickets, code commits, approvals and meeting participation, for example 'Priya in Paint Shop Pune is the go-to person for PLC config on Line 2'.
4. Assigns an owner to every ontology object (supplier, plant, KPI, product) so alerts and questions are routed to a person, not a mailbox.

| | |
|---|---|
| Inputs | HR system; Directory; Activity metadata |
| Outputs | Org graph; Expertise index; Object owners |
| Feeds into | Department Twins, Enterprise Ontology, Digests & Alerts |
| Built with | Graph store + scoring models |
| Scale | Daily refresh, plus immediate updates on HR events |
| Guardrails | Expertise inference uses metadata only, never message content. Employees can see and correct their own expertise profile. |

### Process Mining

*Deterministic code* · Reconstructs how work actually flows (procure-to-pay, order-to-cash, production, hiring) from system event logs.

**How it works**

1. Pulls event logs (case ID, activity, timestamp, resource) from ERP, MES, ticketing and CRM.
2. Discovers process graphs and their variants, with cycle times and waiting times per step.
3. Finds bottlenecks and conformance gaps (where real practice deviates from the SOP).
4. Publishes processes as ontology objects, so an impact can flow through a process, for example 'customs +5 days means these order-to-cash variants slip by 9 days'.

| | |
|---|---|
| Inputs | Event logs |
| Outputs | Process objects; Bottleneck and deviation signals |
| Feeds into | Enterprise Ontology, Weak-Signal & Anomaly Detector |
| Built with | PM4Py / Celonis-class algorithms on the lakehouse |
| Scale | Nightly rebuild; streaming conformance checks |
| Guardrails | Person-level resources are aggregated to role level by default. |

### KPI Tree & Metric Layer

*Deterministic code + Human in the loop* · One governed definition of every metric, arranged as a driver tree from EBITDA down to a single machine's uptime.

**How it works**

1. Harvests metric definitions from BI tools and the semantic layer (dbt metrics, Power BI measures).
2. Finance and department heads confirm each definition: formula, source tables, owner, refresh rate and target.
3. Builds the driver tree: EBITDA from revenue (volume × price × mix) and costs, then down by business unit, product, plant, line and machine.
4. This tree lets any operational change be translated into money and into a named accountable owner.

| | |
|---|---|
| Inputs | BI and semantic layer; Finance input |
| Outputs | KPI objects and driver tree |
| Feeds into | Enterprise Ontology, Financial Translator, Temporal Store |
| Built with | Semantic layer (dbt/MetricFlow-class) + review UI |
| Scale | Thousands of KPIs |
| Guardrails | Agents may only query metrics through this layer, never ad-hoc SQL on raw tables, so every number has one definition. |

### Tacit Knowledge Capture Agent

*Agent + Human in the loop* · Captures what is in people's heads (decisions, reasons, tricks of the trade) before it walks out of the door.

**How it works**

1. With consent, reads meeting transcripts and extracts decisions, their rationale, owners and deadlines into Decision Log objects.
2. Spots gaps: processes with no SOP, experts nearing exit, SOPs that contradict what process mining shows actually happens.
3. Schedules 15-minute interviews with the relevant expert, asks targeted questions, and drafts a knowledge article from the answers.
4. The expert reviews and approves the article before it is published to the knowledge base.

| | |
|---|---|
| Inputs | Transcripts; Process deviations; Org graph |
| Outputs | Decision logs; Reviewed knowledge articles |
| Feeds into | Knowledge & Document Store, Precedent & Decision Memory |
| Built with | LLM with tools: transcripts.read, calendar.propose, kb.draft |
| Scale | Continuous |
| Guardrails | Nothing is published without the expert's approval. Transcript use is opt-in per meeting series. |

### Department Twins

*Data store + Agent* · An automatically maintained profile of every department: mandate, KPIs, processes, systems, documents, people, risks and dependencies.

**How it works**

1. For each node in the org graph, assembles a profile: mandate, headcount, KPIs and their current values, processes owned, systems used, key documents, open risks, active projects, and dependencies on other departments and on world objects.
2. Example: 'Paint Shop, Pune: 312 people, OEE 81%, depends on 3 chemical suppliers, 1 water utility and 2 REACH-regulated substances.'
3. Refreshed daily, and immediately when a linked object changes.
4. Department Liaison agents use it as their grounding. The Department Pulse UI renders it.

| | |
|---|---|
| Inputs | Org graph; Knowledge Store; KPIs; Ontology |
| Outputs | Department profiles |
| Feeds into | Department Liaison Agents, Department Pulse |
| Built with | Materialised views + LLM-written narrative sections |
| Scale | One per org node, thousands in total |
| Guardrails | Narrative sections cite their sources. The profile respects each viewer's ACLs. |

## L2 Fusion Fabric

Turn millions of raw items into a few thousand deduplicated, scored, entity-resolved storylines with full provenance.

### Event Bus

*Infrastructure* · The backbone everything flows through, replayable and schema-checked.

**How it works**

1. Topics: raw.docs, raw.changes, raw.ticks, enterprise.cdc, signals, storylines, impacts, alerts, actions.
2. A schema registry (Protobuf/Avro) rejects malformed messages at the edge.
3. Hot retention of 30 days, then compacted into the lakehouse (Iceberg) indefinitely, so any period can be replayed through the pipeline.
4. Exactly-once processing with the stream processor.

| | |
|---|---|
| Inputs | All producers |
| Outputs | All consumers |
| Feeds into | Stream Processor, Event Extraction & Storylines, Entity Resolution |
| Built with | Kafka / Redpanda, Iceberg |
| Scale | Millions of messages per second headroom |
| Guardrails | Per-topic ACLs; enterprise topics never leave the customer VPC. |

### Stream Processor

*Deterministic code* · Real-time math on every stream: normalise, enrich, aggregate and flag anomalies within a second.

**How it works**

1. Normalises units, currencies and time zones, and geocodes place names to coordinates and ontology places.
2. Computes windowed aggregates such as price moves as z-scores, vessel counts per strait per hour, or scrap rate per line per shift.
3. Runs threshold and anomaly rules (for example 'tanker transits through Hormuz down 70% in 2 h') and emits Signal events.
4. Enriches records with ontology IDs where they are already known.

| | |
|---|---|
| Inputs | Bus topics |
| Outputs | Signals |
| Feeds into | Event Extraction & Storylines, Weak-Signal & Anomaly Detector |
| Built with | Apache Flink |
| Scale | Under 1 s |
| Guardrails | Rules are versioned and backtested before deployment. |

### Entity Resolution

*ML model + Deterministic code* · Works out that 'TSMC', '台積電', 'Taiwan Semiconductor Mfg Co Ltd' and a customs consignee code are one and the same company.

**How it works**

1. Blocking: cheap keys (normalised name, country, phonetic code) shrink the candidate pairs.
2. Exact matches on identifiers: LEI, DUNS, ISIN, company registration numbers, IMO (ships), GLN, tax IDs.
3. A learned matcher (fine-tuned cross-encoder) compares names, addresses, transliterations and context across scripts.
4. Graph clustering merges matches into entities with a confidence score. Low-confidence pairs go to a data-steward review queue.
5. Entity linking ties every mention in text to an ontology ID.

| | |
|---|---|
| Inputs | Mentions and records |
| Outputs | Resolved entity IDs |
| Feeds into | World Ontology, Enterprise Ontology, Event Extraction & Storylines |
| Built with | Splink-class probabilistic linkage + transformer cross-encoder |
| Scale | Above 98% precision on the top 10k objects |
| Guardrails | Merges are reversible and logged. A human approves merges of high-importance objects. |

### Event Extraction & Storylines

*ML model* · Turns about a million documents a day into about 20,000 storylines, each one real-world event told once.

**How it works**

1. An extraction model converts each document into structured claims: event type (from a taxonomy of about 300), actors, place, time, magnitude, and modality (rumoured, announced, confirmed or denied).
2. Online clustering joins claims about the same real-world event across sources and languages into a Storyline with a timeline.
3. Tracks the storyline's trajectory (escalating, stable, resolving) and spots contradictions between sources.
4. Hands each storyline to Credibility scoring and the Relevance Router.

| | |
|---|---|
| Inputs | Documents; Signals; ChangeEvents |
| Outputs | Storylines |
| Feeds into | Credibility & Corroboration, Relevance Router |
| Built with | Fine-tuned extraction LLM + streaming clustering over embeddings |
| Scale | Under 5 s from document to storyline update |
| Guardrails | Every claim keeps its quote span and source document. |

### Credibility & Corroboration

*ML model + Deterministic code* · Answers 'how sure are we this is real?' before anyone acts.

**How it works**

1. Uses source reliability priors learned from each source's track record.
2. Counts independent corroboration, discounting syndicated copies of the same wire story.
3. Checks for primary sources and official confirmation, and whether physical sensors agree (do the AIS, satellite or market data match the claim?).
4. Looks for disinformation markers: coordinated accounts, freshly registered domains, recycled images.
5. Outputs a confidence from 0 to 1 and a status (rumour, likely, confirmed or refuted) that drives escalation thresholds.

| | |
|---|---|
| Inputs | Storylines |
| Outputs | Scored storylines |
| Feeds into | Relevance Router, Provenance Ledger |
| Built with | Bayesian scoring + classifiers |
| Scale | Re-scored on every new claim |
| Guardrails | Low-confidence items can only go to Watch, never straight to the CXO, unless the potential impact is extreme. In that case the item is shown as 'unconfirmed'. |

### Provenance Ledger

*Data store* · An append-only record linking every fact to the exact bytes it came from and what was known when.

**How it works**

1. Records fact, document hash, fetch time, source, and extractor model version.
2. Bitemporal: stores both when something was true and when we learned it, so the question 'What did we know at 09:14?' has an exact answer.
3. Powers the citation link behind every number and sentence in the cockpit, plus replay and audit.

| | |
|---|---|
| Inputs | All extraction steps |
| Outputs | Lineage queries |
| Feeds into | Audit & Observability, Verifier |
| Built with | Append-only log on the lakehouse + graph index |
| Scale | Billions of rows |
| Guardrails | Immutable; deletion only under legal-hold rules, and the deletion itself is logged. |

## L3 Knowledge Core

One ontology for the world and the enterprise, joined by dependency edges, plus document memory, time-series, precedents and governed actions.

### World Ontology

*Data store* · Typed objects for the outside world: countries, regulators, markets, commodities, companies, infrastructure, people and technologies.

**How it works**

1. Object types: Country, Region, City, Regulator, Law/Regulation, Policy instrument, Market, Commodity, Currency, Company (competitor, supplier, customer, partner), Facility (fab, mine, port, refinery, plant), Route/Lane, Infrastructure (grid, pipeline, cable), Person (official, executive), Technology, Event, Storyline.
2. Link types: located_in, owns, supplies, regulates, trades_with, competes_with, sanctions, depends_on.
3. Populated from licensed reference data, filings, customs records and resolved entities from Fusion. Updated continuously.

| | |
|---|---|
| Inputs | Resolved entities; Reference data |
| Outputs | Graph for traversal and queries |
| Feeds into | Dependency Bridge Graph |
| Built with | Property graph (Neo4j / TigerGraph / Neptune) + Postgres metadata |
| Scale | Tens of millions of objects |
| Guardrails | Every property carries provenance and a last-verified time. |

### Enterprise Ontology

*Data store* · Typed objects for the company itself: entities, departments, plants, products, parts, customers, contracts, projects, KPIs, risks and policies.

**How it works**

1. Object types: Legal entity, Business unit, Department, Team, Person, Plant, Line, Machine, Product, SKU, BOM item, Supplier relationship, Contract, Customer, Channel, Project, Process, KPI, Risk, Policy, Decision.
2. Built from connectors, process mining, the KPI layer and the org graph. Every object has an owner.
3. Kinetic layer: Action Types and Functions are attached to these objects.

| | |
|---|---|
| Inputs | Connectors; Org graph; Process mining; KPI layer |
| Outputs | Enterprise graph |
| Feeds into | Dependency Bridge Graph, Action Types & Functions |
| Built with | Same graph platform as the World Ontology, logically separated |
| Scale | Millions of objects |
| Guardrails | Object and property level ACLs inherited from the Permission Mirror. |

### Dependency Bridge Graph

*Data store + Deterministic code + Human in the loop* · The moat: weighted, typed edges that say exactly how the company depends on the world.

**How it works**

1. Edge types: supplies (share of spend, substitutability, lead time, inventory buffer), sells_in (revenue share by market), regulated_by, priced_in (currency, commodity index), financed_by (lenders, rate type), competes_with, depends_on_infra (port, grid, water, telecom, cloud region), employs_in (labour market), reputational_exposure.
2. Built from BOMs and supplier master data, ERP spend, customs records (which reveal tier-2 to tier-N suppliers), revenue by geography, the debt book, and LLM reading of contracts and SOPs to propose dependencies.
3. Proposed edges need confirmation by the object owner before they carry full weight.
4. A coverage score per business unit shows how much of its spend, revenue and cost is mapped, so blind spots are visible.

| | |
|---|---|
| Inputs | Both ontologies; Contracts; Customs data; ERP spend |
| Outputs | Weighted dependency edges |
| Feeds into | Impact Propagation Engine, Relevance Router |
| Built with | Graph store + edge-building pipelines |
| Scale | Millions of edges; incremental updates |
| Guardrails | Edge weights carry uncertainty ranges, and propagation uses those ranges instead of point values. |

### Knowledge & Document Store

*Data store* · The second brain's memory: every chunk of every document, searchable by meaning, keyword and relationship, filtered by permission.

**How it works**

1. Hybrid retrieval: keyword (BM25) plus dense vectors plus graph expansion (pull chunks linked to the same ontology objects).
2. Boosts recent and authoritative content (the current SOP over an old draft), then a reranker orders the results.
3. An ACL pre-filter runs before ranking, so restricted text never enters a model's context.
4. Every chunk knows its department, process, ontology links, version and owner.

| | |
|---|---|
| Inputs | Document Intelligence output; Tacit knowledge articles |
| Outputs | Ranked, cited passages |
| Feeds into | Second Brain Q&A, Context Engine & Company Memory, Department Liaison Agents |
| Built with | OpenSearch/Vespa + vector index + cross-encoder reranker |
| Scale | Billions of chunks; under 300 ms retrieval |
| Guardrails | Fail closed on ACL. Retrieval logs record who saw what. |

### Temporal Store

*Data store* · Every time-series (prices, KPIs, sensors, inventory) plus as-of snapshots of the ontology.

**How it works**

1. Columnar time-series for market data, KPIs, sensor and plant data, inventory and orders.
2. Bitemporal snapshots let you query the graph as it was on any past date, which backtests depend on.
3. Provides baselines that anomaly detection and forecasting compare against.

| | |
|---|---|
| Inputs | Bus; KPI layer |
| Outputs | Series and as-of queries |
| Feeds into | Forecasting Models, Weak-Signal & Anomaly Detector, Backtester |
| Built with | ClickHouse / TimescaleDB + Iceberg time travel |
| Scale | Trillions of points |
| Guardrails | Retention tiers by data class. |

### Action Types & Functions

*Deterministic code* · The only way anything (human or agent) changes the real world: typed, permissioned, audited verbs.

**How it works**

1. Example actions: raise_po, request_allocation, qualify_alternate_source, reallocate_supply, adjust_build_plan, place_hedge, change_price_or_incentive, launch_campaign, update_sop, revoke_partner_access, notify_stakeholders, open_war_room.
2. Each action defines a parameter schema, preconditions, approval policy, side effects (which system it writes to), undo semantics and an audit record.
3. Functions are versioned, unit-tested business logic over objects, for example days_of_cover, margin_at_risk, exposure, substitutability.

| | |
|---|---|
| Inputs | Approved proposals |
| Outputs | Writes to ERP, CRM, treasury, email and others via connectors |
| Feeds into | Enterprise Connector Mesh, Audit & Observability |
| Built with | Typed action service + function runtime (TypeScript/Python) |
| Scale | Thousands of actions per day |
| Guardrails | No raw writes. Every action passes Hooks, Autonomy Levels and Approvals. |

### Precedent & Decision Memory

*Data store* · What happened last time, both in the world and inside this company.

**How it works**

1. A curated library of 5k to 10k world events since 1990 (wars, pandemics, crises, rate shocks, disasters, sanctions, strikes, cyberattacks), each with measured impact curves on prices, volumes and lead times by sector.
2. The company's own decision log: what was decided, why, by whom, the alternatives rejected, and what actually happened afterwards.
3. Searchable by event type, sector, geography and similarity, for analogies such as 'this resembles the 2021 Suez blockage at three times the duration'.

| | |
|---|---|
| Inputs | Curated history; Decision logs; Outcome tracker |
| Outputs | Analogies and calibration data |
| Feeds into | Transfer Function Library, Geopolitics & Policy Analyst, Red Team |
| Built with | Document store + structured impact tables |
| Scale | Growing every week |
| Guardrails | Analogies are always shown with how they differ from the current case. |

### Transfer Function Library

*ML model + Deterministic code* · The quantitative rules of how a shock moves along an edge: how much, how fast, with what spread.

**How it works**

1. Holds one response function per combination of edge type and event type. Example: policy rate +100 bp leads to entry-segment auto-loan demand −x% after a 2–3 month lag. Another: local currency −5% raises imported-content cost by y%.
2. Estimated from history using distributed-lag and Bayesian hierarchical models, pooled across similar companies and sectors.
3. Where data is thin, uses expert priors elicited from the company's own specialists, explicitly marked as such.
4. Versioned, backtested, with uncertainty bands that feed the simulators.

| | |
|---|---|
| Inputs | Temporal store; Precedents; Expert input |
| Outputs | Response functions |
| Feeds into | Impact Propagation Engine, Scenario Simulator |
| Built with | PyMC / NumPyro, statsmodels |
| Scale | Thousands of functions |
| Guardrails | Every function shows its backtest error. Functions with poor fit are flagged in any brief that uses them. |

## L4 Reasoning Engines

Deterministic and statistical engines that answer: does this matter, how does it spread, how much money, and what is the best response.

### Relevance Router

*ML model + Deterministic code* · Decides, for every storyline in the world, whether it matters to this company, and to whom.

**How it works**

1. Graph proximity: how many weighted hops separate the storyline's objects from enterprise objects through bridge edges.
2. Semantic similarity to the company's risk register, strategy documents and current projects.
3. A classifier trained on what leaders historically opened, acted on or dismissed.
4. Routes each storyline to Ignore, Watch (logged), Notify department owner, or Escalate to CXO, with an explanation such as 'Escalated because Supplier X (12% of brake spend) is 2 hops away'.
5. Out of about 20k storylines a day, a typical company sees around 50 escalations and a few hundred department notifications.

| | |
|---|---|
| Inputs | Scored storylines; Bridge graph; Strategy docs |
| Outputs | Routed, explained storylines |
| Feeds into | Event-Type Taxonomy, Impact Propagation Engine, Orchestrator, Impact Feed |
| Built with | Graph queries + small ranking model |
| Scale | Under 1 s per storyline |
| Guardrails | Thresholds are tuned against backtests to keep the miss rate on historical material events near zero. |

### Event-Type Taxonomy

*Data store + Deterministic code* · What makes the system general: about 300 event types, each mapped to how it usually hits a company.

**How it works**

1. Families: geopolitical and security; trade and sanctions; regulation and policy; monetary and macro; markets and commodities; natural hazards and climate; health; labour and social; technology and cyber; competitor moves; customer and demand shifts; supplier and partner distress; legal and litigation; reputation and media; internal operations.
2. Each type lists default propagation channels (which edge types to traverse), relevant transfer functions, which specialist agents to wake, which departments usually care, and which playbook to load.
3. New types are added when the learning loop finds storylines that fit no existing type well.

| | |
|---|---|
| Inputs | Storyline event types |
| Outputs | Propagation plan for the engines and agents |
| Feeds into | Impact Propagation Engine, Playbook Library |
| Built with | Versioned config + mapping service |
| Scale | About 300 types, 15 families |
| Guardrails | Unknown types fall back to full-graph propagation and always wake the orchestrator. |

### Impact Propagation Engine

*Deterministic code* · Walks the graph from the event to the P&L, hop by hop, and returns ranked impact paths with explanations.

**How it works**

1. Starts from the world objects the storyline touches, following only the channels the taxonomy prescribes for that event type.
2. At each hop it applies the transfer function and subtracts buffers (inventory, contractual protection, hedges, alternate sources).
3. Repeats as Monte Carlo over the edge uncertainties, so the result is a distribution of impact over time, not one number.
4. Prunes paths below the materiality threshold and returns the top paths, each with a readable chain, for example 'Port closure → 3 suppliers → 2 parts → Plant B → Model Y → −₹40–90 Cr in Q3'.
5. Paths for the top 200 standing scenarios are kept precomputed, so a real event becomes a lookup plus refinement.

| | |
|---|---|
| Inputs | Storyline; Bridge graph; Transfer functions |
| Outputs | Impact distributions and paths |
| Feeds into | Scenario Simulator, Financial Translator, Orchestrator, Cascade View |
| Built with | GPU graph engine (cuGraph) + NumPy/JAX Monte Carlo |
| Scale | 2–8 s over millions of edges |
| Guardrails | Deterministic given a seed, so every run is reproducible by its run ID. |

### Scenario Simulator

*Deterministic code* · Plays out 'what if it lasts two weeks, three months, a year?' across inventory, capacity, demand and cash.

**How it works**

1. Uses system-dynamics models of stocks and flows (inventory, orders, capacity, cash) built automatically from ontology structure.
2. Uses agent-based models where behaviour matters: competitors repricing, customers switching, suppliers allocating.
3. Scenario parameters (duration, severity, policy response) come from the analyst agents or from sliders in the Scenario Lab.
4. Runs on a branch of the ontology, so nothing touches production data, and outputs fan charts per KPI.

| | |
|---|---|
| Inputs | Impact paths; Scenario parameters |
| Outputs | KPI distributions over time |
| Feeds into | Decision Optimizer, Financial Translator, Scenario Lab |
| Built with | Custom SD engine + Mesa-class ABM, GPU Monte Carlo |
| Scale | 10k runs in 5–20 s |
| Guardrails | Model assumptions are listed in every output. |

### Forecasting Models

*ML model* · Calibrated forecasts with honest uncertainty: demand, prices, lead times, FX, attrition, cash.

**How it works**

1. Combines time-series foundation models with gradient-boosted models that use exogenous drivers.
2. Conformal prediction gives intervals that hold their stated coverage.
3. Nowcasting from alternative data (web traffic, shipping, job postings) where official data lags.

| | |
|---|---|
| Inputs | Temporal store; Signals |
| Outputs | Forecast distributions |
| Feeds into | Scenario Simulator, Decision Optimizer |
| Built with | TS foundation models, LightGBM, conformal wrappers |
| Scale | Millions of series, refreshed daily or on trigger |
| Guardrails | Coverage is monitored. A model is demoted if its intervals stop holding. |

### Decision Optimizer

*Deterministic code* · Finds the best responses (allocation, buy-ahead, production plan, pricing, hedges) and shows the trade-offs.

**How it works**

1. Formulates the decision as mixed-integer or constraint programming over the ontology: capacities, contracts, budgets and decision rights become constraints.
2. Robust or stochastic optimisation across simulated scenarios, so the plan holds up even when the forecast is wrong.
3. Returns a Pareto set of options (cost against risk against time) with shadow prices, for example 'one more unit of part P is worth ₹14,000 this quarter'.

| | |
|---|---|
| Inputs | Simulations; Forecasts; Constraints |
| Outputs | Ranked option plans |
| Feeds into | Financial Translator, Orchestrator |
| Built with | Gurobi / OR-Tools CP-SAT |
| Scale | Seconds to minutes depending on size |
| Guardrails | Infeasibility is reported with the binding constraint, not hidden. |

### Financial Translator

*Deterministic code* · Turns every operational impact into money: P&L, cash, balance sheet, covenants and guidance, by business unit and quarter.

**How it works**

1. Mirrors the FP&A driver model using the KPI tree.
2. Maps volume, price, cost and timing deltas to revenue, gross margin, EBITDA, working capital and cash per business unit and per quarter.
3. Checks covenant headroom and the gap against public guidance, and gives an EPS lens for listed companies.

| | |
|---|---|
| Inputs | Impact distributions; Option plans; KPI tree |
| Outputs | Financial impact ranges |
| Feeds into | Brief Writer, Decision Brief |
| Built with | Driver-based model service |
| Scale | Under 1 s per scenario |
| Guardrails | Reconciled monthly against actual FP&A figures. Drift is flagged. |

### Weak-Signal & Anomaly Detector

*ML model* · Notices trouble before it is news, outside and inside the company.

**How it works**

1. External leading indicators: a supplier's hiring freeze or mass job deletions, changed payment terms, late shipments, executive departures, rising credit spreads, chatter on local forums.
2. Internal anomalies: scrap rate, warranty claims, complaint tickets, dealer CRM notes, attrition in one team, a budget burn rate, unusual access patterns.
3. Bayesian change-point detection compares each series against its seasonal baseline.
4. Correlates co-occurring anomalies into a 'pre-event' storyline.

| | |
|---|---|
| Inputs | Signals; Temporal store; Process deviations |
| Outputs | Pre-event storylines |
| Feeds into | Relevance Router |
| Built with | Change-point models, isolation forests, correlation rules |
| Scale | Continuous |
| Guardrails | Person-level signals (for example attrition) are aggregated and need HR-approved purposes. |

### Backtester

*Deterministic code* · Replays history through the whole pipeline to prove the system would have worked.

**How it works**

1. Picks a past event and rewinds every store to its state at that time using bitemporal as-of queries.
2. Replays the raw feeds and measures: was it detected, how early, was the impact estimate right, and did the recommendation beat what was actually done?
3. Runs on every change to models, rules, prompts or playbooks.

| | |
|---|---|
| Inputs | Temporal store; Archive; Precedents |
| Outputs | Scorecards |
| Feeds into | Evals & Calibration Harness |
| Built with | Pipeline replay on Iceberg time travel |
| Scale | Hundreds of scenarios per night |
| Guardrails | Results gate releases (see Evals). |

## L5 Agent Harness

The Claude Code pattern applied to a company: an orchestrator, specialist subagents, playbooks, tools, hooks and autonomy levels.

### Orchestrator

*Agent* · The lead agent. It owns one situation from escalation to a finished Decision Brief.

**How it works**

1. Triggered by an escalation from the Relevance Router or by a user question.
2. Loads the playbook for the event type, the company memory, and the impact paths found so far.
3. Writes scoped briefs and fans out specialist subagents in parallel. Each works in its own context and returns about one page.
4. Calls engines (propagation, simulation, optimiser, financial translator) through tools. It plans and explains, it does not compute.
5. Reconciles conflicting findings, sends the draft to the Verifier and the Red Team, then hands it to the Brief Writer.
6. Stays alive for days as a durable workflow while a situation evolves, and re-briefs when tripwires fire.

| | |
|---|---|
| Inputs | Escalation or question; Playbook; Memory |
| Outputs | Draft brief; Action proposals |
| Feeds into | Geopolitics & Policy Analyst, Markets & Macro Analyst, Supply Chain & Operations Analyst, Finance Analyst, Customer & Competition Analyst, Legal & Regulatory Analyst, Department Liaison Agents, Verifier, Red Team, Brief Writer |
| Built with | Frontier LLM via Agent SDK loop on Temporal |
| Scale | Typical run 20–40 s; long-lived for war rooms |
| Guardrails | Bounded token and time budgets, read-only by default. It can only propose actions. |

### Geopolitics & Policy Analyst

*Agent* · Estimates how a political, security or policy situation is likely to unfold, and how long it will last.

**How it works**

1. Reads the storyline, primary statements and expert commentary, plus precedent analogies.
2. Produces scenario branches with probabilities and durations, each with its reasoning and the indicators that would confirm or kill it.
3. Returns structured parameters the simulator can use directly.

| | |
|---|---|
| Inputs | Storyline; Precedents; Knowledge search |
| Outputs | Scenario set with probabilities |
| Feeds into | Scenario Simulator, Orchestrator |
| Built with | LLM + tools: storyline.read, precedent.search, web.fetch (allow-listed) |
| Scale | 5–15 s |
| Guardrails | Read-only. Probabilities are tracked for calibration. |

### Markets & Macro Analyst

*Agent* · Reads what markets are pricing (rates, FX, commodities, spreads) and what that implies.

**How it works**

1. Pulls market moves and implied volatility, and compares them with precedent reactions.
2. Calls forecasters for price paths and explains how the shock passes through cost lines.
3. Flags hedge positions and their effectiveness.

| | |
|---|---|
| Inputs | Market data; Forecasts; Treasury book |
| Outputs | Market impact view |
| Feeds into | Orchestrator |
| Built with | LLM + tools: market.query, forecast.get, metrics.query |
| Scale | 5–15 s |
| Guardrails | Read-only. |

### Supply Chain & Operations Analyst

*Agent* · Traces physical effects: parts, suppliers, plants, logistics, capacity.

**How it works**

1. Inspects impact paths, days of cover, open purchase orders, alternate sources and logistics options.
2. Asks the optimiser for allocation and recovery plans.
3. Names the plants, lines and products at risk, with dates.

| | |
|---|---|
| Inputs | Impact paths; Inventory; Supplier data |
| Outputs | Operational impact and recovery options |
| Feeds into | Decision Optimizer, Orchestrator |
| Built with | LLM + tools: ontology.traverse, metrics.query, optimize.solve |
| Scale | 10–20 s |
| Guardrails | Read-only. It can draft action proposals but cannot execute them. |

### Finance Analyst

*Agent* · The CFO's lens: P&L, cash, covenants, guidance, cost of each option.

**How it works**

1. Runs the financial translator on each scenario and option.
2. Checks liquidity, covenant headroom and guidance gaps.
3. Prices each option's cost and its reversibility.

| | |
|---|---|
| Inputs | Impact distributions; Options |
| Outputs | Financial view per option |
| Feeds into | Orchestrator |
| Built with | LLM + tools: fin.translate, metrics.query |
| Scale | 5–10 s |
| Guardrails | Read-only. Price-sensitive outputs are marked restricted. |

### Customer & Competition Analyst

*Agent* · Demand, pricing, competitor moves, channel and brand effects.

**How it works**

1. Reads CRM and dealer signals, web demand proxies, competitor actions and sentiment.
2. Calls forecasters and agent-based market simulations for share and cannibalisation.
3. Proposes commercial responses (pricing, incentives, campaigns, inventory placement).

| | |
|---|---|
| Inputs | CRM; Demand signals; Competitor storylines |
| Outputs | Commercial impact and options |
| Feeds into | Orchestrator, Scenario Simulator |
| Built with | LLM + tools: metrics.query, forecast.get, sim.run |
| Scale | 10–20 s |
| Guardrails | Read-only. |

### Legal & Regulatory Analyst

*Agent* · Maps new obligations, contractual rights and compliance exposure.

**How it works**

1. Reads the regulation or event and the change diff, and maps obligations to the processes and departments affected.
2. Searches contracts for force majeure, allocation, price-adjustment and termination clauses relevant to the event.
3. Drafts a compliance gap list with owners and deadlines.

| | |
|---|---|
| Inputs | Regulation text; Contracts; Processes |
| Outputs | Obligations, rights and gaps |
| Feeds into | Orchestrator, Department Liaison Agents |
| Built with | LLM + tools: knowledge.search (contracts compartment), ontology.query |
| Scale | 10–30 s |
| Guardrails | Privileged material stays in the legal compartment. Output carries the legal marking. |

### Department Liaison Agents

*Agent* · One on-demand agent per department that speaks for it: knows its SOPs, projects, people and constraints.

**How it works**

1. Spun up for any department the impact paths touch, from Treasury and Procurement to Paint Shop Line 2 or Dealer Marketing North.
2. Grounded in that Department Twin and only that department's documents (ACL-scoped).
3. Answers 'what does this mean for us, specifically?' in the department's own language and references the actual SOPs and current projects.
4. Drafts department-level actions and routes them to the right owner via the org graph.
5. This is how the second brain plugs into decisions: thousands of departments, each with a voice when it matters.

| | |
|---|---|
| Inputs | Department Twin; Department documents; Impact paths |
| Outputs | Department impact notes and draft actions |
| Feeds into | Orchestrator |
| Built with | LLM + tools: knowledge.search (scoped), metrics.query (scoped), action.propose |
| Scale | Dozens in parallel |
| Guardrails | Strict ACL scope. A liaison cannot read other departments' restricted content. |

### Red Team

*Agent* · Attacks the leading recommendation before the MD sees it, and its dissent is shown in full.

**How it works**

1. Gets the draft recommendation and the evidence behind it.
2. Argues the strongest case against it: alternative explanations, base rates, overreaction risk, second-order effects, the scenario where it is the wrong call.
3. Must quantify, for example 'If the blockade ends within 3 weeks (p=0.3), option A loses ₹X Cr against waiting.'
4. The orchestrator must respond to each point. Unresolved points are shown in the brief.

| | |
|---|---|
| Inputs | Draft brief; Evidence |
| Outputs | Dissent memo |
| Feeds into | Orchestrator, Brief Writer |
| Built with | LLM (can be a different model family for diversity) |
| Scale | 5–15 s |
| Guardrails | Cannot be skipped for escalated briefs. |

### Verifier

*Agent + Deterministic code* · Checks every number and claim in a brief against its source before it ships.

**How it works**

1. Deterministic checks: every number must cite an engine run ID or metric query, and the cited value must match.
2. Every factual sentence must cite a document. An LLM judge checks that the cited passage actually supports the sentence.
3. Permission check: is the reader allowed to see every cited source? If not, the claim is removed or generalised.
4. Unsupported claims are sent back to the orchestrator.

| | |
|---|---|
| Inputs | Draft brief; Provenance |
| Outputs | Verified brief or rejection list |
| Feeds into | Brief Writer |
| Built with | Rule engine + LLM judge |
| Scale | 2–5 s |
| Guardrails | Briefs cannot be published without a pass. |

### Brief Writer

*Agent* · Writes the Decision Brief in the house style, at the right depth for the reader.

**How it works**

1. Structure: headline, so-what in one sentence, impact by business unit and quarter (as ranges), options with cost, time to impact, reversibility and confidence, recommendation, Red Team dissent, tripwires to watch.
2. Tailors the depth: the MD gets one screen; a department head gets their slice with the actions they own.

| | |
|---|---|
| Inputs | Verified findings |
| Outputs | Decision Brief |
| Feeds into | Decision Brief, Digests & Alerts |
| Built with | LLM with a structured output schema |
| Scale | 3–6 s |
| Guardrails | Cannot introduce new numbers. The schema forces citations. |

### Second Brain Q&A

*Agent* · Anyone in the company can ask anything and get a cited answer from documents and data they are allowed to see.

**How it works**

1. Plans the search: which departments, document types and metrics are relevant.
2. Retrieves ACL-filtered passages from the knowledge store and pulls figures through the metric layer (no free-form SQL).
3. Answers with citations. When knowledge is missing or contradictory, it says so and names the expert to ask, from the expertise graph.
4. Unanswered questions become knowledge gaps for the Tacit Knowledge agent.

| | |
|---|---|
| Inputs | Question; Knowledge Store; Metric layer |
| Outputs | Cited answer; Knowledge gaps |
| Feeds into | Ask the Company, Tacit Knowledge Capture Agent |
| Built with | LLM + tools: knowledge.search, metrics.query, org.expert |
| Scale | 2–8 s |
| Guardrails | Answers are only drawn from what the asker can open. Every retrieval is logged. |

### Tool Registry & MCP Gateway

*Deterministic code* · Every capability exposed as a typed tool, so agents can do exactly what they are allowed to and nothing else.

**How it works**

1. Tools: ontology.query, ontology.traverse, knowledge.search, metrics.query, sim.run, forecast.get, optimize.solve, fin.translate, precedent.search, web.fetch (allow-listed), action.propose, notify.route.
2. External systems are reached through MCP servers and appear as namespaced tools.
3. Read-only tools run in parallel. Mutating tools run sequentially, and every call passes through Hooks.
4. Each subagent receives an allow-list of tools in its definition.

| | |
|---|---|
| Inputs | Tool calls |
| Outputs | Tool results |
| Feeds into | Hooks & Policy Engine |
| Built with | Agent SDK tool runtime + MCP |
| Scale | Thousands of calls per minute |
| Guardrails | Tool outputs from external content are wrapped as data and can never become instructions. |

### Playbook Library

*Data store* · The company's crisis doctrine, written as loadable skills: steps, thresholds, decision rights, comms.

**How it works**

1. One playbook per event family (for example sanctions, rate shock, supplier distress, plant incident, cyber, competitor launch, extreme weather, product recall, social-media crisis) plus company-specific variants.
2. Each specifies which subagents to wake, which engines to run, materiality thresholds, who decides at what amount, and communication templates.
3. Loaded on demand (progressive disclosure) to keep agent context small.
4. Authored by strategy and risk teams, and improved by the Playbook Miner.

| | |
|---|---|
| Inputs | Authors; Playbook Miner |
| Outputs | Instructions loaded into agents |
| Feeds into | Orchestrator |
| Built with | Versioned Markdown skills in git |
| Scale | Dozens to hundreds |
| Guardrails | Changes need review and approval, like code. |

### Context Engine & Company Memory

*Deterministic code + ML model* · Builds exactly the right context for each agent, and keeps long sessions sharp.

**How it works**

1. Company memory is the equivalent of the company's CLAUDE.md: strategy, risk appetite, red lines (for example 'never single-source safety-critical parts'), the MD's preferences, and standing decisions.
2. Assembles each agent's context: playbook, relevant ontology slice, retrieved passages, memory.
3. Compacts long war-room sessions into summaries. The ontology stays the source of truth, so summaries cannot drift from facts.

| | |
|---|---|
| Inputs | Memory; Retrieval; Ontology |
| Outputs | Agent contexts |
| Feeds into | Orchestrator |
| Built with | Context builder service + summariser model |
| Scale | Per agent call |
| Guardrails | Memory edits need approval by the memory owner. |

### Hooks & Policy Engine

*Deterministic code* · Policy that runs before and after every tool call and every proposed action, as code.

**How it works**

1. Before a call: checks the delegation-of-authority matrix, spend limits, covenants, sanctions screening of counterparties, data residency, and purpose of access.
2. It can allow, deny, require approval, modify parameters, or attach context.
3. After a call: logs, attaches provenance, and triggers follow-ups (for example notifying a compliance officer).

| | |
|---|---|
| Inputs | Tool calls; Proposals |
| Outputs | Allow, deny or ask decisions |
| Feeds into | Autonomy Levels, Human Approval Workflow, Audit & Observability |
| Built with | OPA / Cedar policies in git |
| Scale | Under 10 ms per evaluation |
| Guardrails | Fail closed. Policies are tested like code. |

### Autonomy Levels

*Deterministic code* · How much an agent may do on its own, set per action type and per department.

**How it works**

1. Level 0, Observe: read only.
2. Level 1, Recommend: draft actions for humans.
3. Level 2, Act with approval: one-tap approve, then execution.
4. Level 3, Bounded autonomy: execute within limits (for example auto-reorder under ₹5 Cr, auto-notify the department owner) and report after.
5. Promotion to a higher level is earned from track record in the Outcome Tracker, and a global switch drops everything to Level 0.

| | |
|---|---|
| Inputs | Policy config; Track record |
| Outputs | Allowed autonomy per action |
| Feeds into | Human Approval Workflow |
| Built with | Config + policy engine |
| Scale | Instant |
| Guardrails | Defaults to the lowest level for new action types. |

### Durable Workflow Runtime

*Infrastructure* · Keeps long investigations, approvals and schedules alive through failures, with full traces.

**How it works**

1. Every agent run, approval wait and scheduled digest is a durable workflow with retries, timeouts and checkpoints.
2. OpenTelemetry traces connect signal, storyline, agent steps, tool calls, brief and action.

| | |
|---|---|
| Inputs | Workflow starts |
| Outputs | Reliable execution |
| Feeds into | Audit & Observability |
| Built with | Temporal, OpenTelemetry |
| Scale | Millions of workflows |
| Guardrails | Replays are deterministic. |

## L6 Trust Plane

Identity, permissions, model gateway, injection defence, audit, evals and approvals. These cut across every other layer.

### Identity & Access

*Deterministic code* · Who you are and what you may see or do, across every layer.

**How it works**

1. SSO via the corporate identity provider, with MFA and device posture.
2. Role-based plus attribute-based access (role, department, geography, purpose, data marking).
3. Compartments for M&A, legal privilege, HR and board papers, plus break-glass access with an automatic audit alert.

| | |
|---|---|
| Inputs | IdP; Policies |
| Outputs | Access decisions |
| Feeds into | Permission Mirror |
| Built with | Okta / Entra ID, Cedar / OPA |
| Scale | Instant |
| Guardrails | Quarterly access reviews are automated. |

### Model Gateway

*Infrastructure* · One controlled doorway to every AI model.

**How it works**

1. Routes each task to the right model: a frontier LLM for reasoning, small fast models for extraction and classification, on-prem open models for the most sensitive data.
2. Zero-retention agreements with providers, PII redaction where required, caching, and cost and latency budgets per workflow.
3. Fails over between providers.

| | |
|---|---|
| Inputs | Model calls |
| Outputs | Model responses |
| Feeds into | Audit & Observability |
| Built with | LLM gateway + private endpoints |
| Scale | Thousands of requests per second |
| Guardrails | Data-class rules decide which models may see which data. |

### Content Safety & Injection Shield

*ML model + Deterministic code* · Stops scraped content from steering the agents, and stops agents from overreaching.

**How it works**

1. External text enters agent context only as quoted data inside typed objects, never as raw HTML.
2. A classifier scans ingested content for instruction-like injection attempts and quarantines hits.
3. A separate safety model reviews each proposed action for scope creep, policy breach or signs of manipulation, similar in spirit to an auto-mode classifier.

| | |
|---|---|
| Inputs | Ingested content; Proposed actions |
| Outputs | Quarantine flags; Action vetoes |
| Feeds into | Hooks & Policy Engine |
| Built with | Classifier models + rules |
| Scale | Inline |
| Guardrails | Vetoes are logged and reviewed. |

### Audit & Observability

*Data store* · An immutable record of everything: every signal, agent step, tool call, approval and override.

**How it works**

1. Append-only audit log with tamper-evident hashing.
2. End-to-end traces from raw signal to action.
3. Cost and token accounting per workflow, department and use case.
4. Any brief can be replayed exactly as it was produced.

| | |
|---|---|
| Inputs | All layers |
| Outputs | Audit queries, dashboards |
| Feeds into | Evals & Calibration Harness |
| Built with | Append-only store + OpenTelemetry backend |
| Scale | Billions of events |
| Guardrails | Read access to the audit log is itself audited. |

### Evals & Calibration Harness

*Deterministic code + Human in the loop* · Proves the system is right often enough, and catches regressions before release.

**How it works**

1. Golden scenario suites for each event family, drawn from history with known outcomes.
2. Brier scores for probability claims, interval coverage for forecasts, and impact-estimate error against actuals.
3. Human ratings of brief quality by real executives.
4. Any change to models, prompts, playbooks or rules must pass the suite.

| | |
|---|---|
| Inputs | Backtests; Outcomes; Ratings |
| Outputs | Release gates; Scorecards |
| Feeds into | Calibration & Model Updates |
| Built with | Eval framework + CI |
| Scale | Nightly and on every change |
| Guardrails | Failing evals block deploys. |

### Human Approval Workflow

*Human in the loop* · The right person approves the right action in time, from anywhere.

**How it works**

1. The delegation-of-authority matrix is encoded: who can approve what, up to which amount, and what needs two signatures.
2. Mobile approval with biometric confirmation, and reason capture for approvals and rejections.
3. Time-boxed escalation: if no one responds within N minutes, the request goes to the next authority.

| | |
|---|---|
| Inputs | Action proposals |
| Outputs | Approved or rejected actions |
| Feeds into | Action Types & Functions |
| Built with | Workflow on Temporal + mobile app |
| Scale | Seconds to minutes |
| Guardrails | Approvals are bound to the exact parameters. Any change needs re-approval. |

## L7 Cockpit

One screen per role: the MD sees money at risk and decisions; a department head sees their department; anyone can ask the company a question.

### Situation Room

*Interface* · A live world map with what is happening, overlaid on where the company is exposed.

**How it works**

1. Shows a globe or map with live storylines sized by confidence and coloured by materiality.
2. Company exposure layers: plants, suppliers, markets, routes, offices, data centres.
3. Click a storyline for its timeline, sources and impact paths.

| | |
|---|---|
| Inputs | Storylines; Exposure |
| Outputs | Navigation into cascades and briefs |
| Feeds into | Cascade View, Decision Brief |
| Built with | deck.gl / MapLibre, WebSockets |
| Scale | Live |
| Guardrails | Shows only what the viewer may see. |

### Impact Feed

*Interface* · The ranked list of what matters right now, ordered by money at risk × confidence × urgency.

**How it works**

1. Personalised by role: the MD sees enterprise-level items; a plant head sees their plant.
2. Each item shows a one-line so-what, a range, a confidence chip and a time-to-impact.

| | |
|---|---|
| Inputs | Routed storylines; Impacts |
| Outputs | Drill-down |
| Feeds into | Decision Brief |
| Built with | Web app |
| Scale | Live |
| Guardrails | Unconfirmed items are labelled as such. |

### Cascade View

*Interface* · The chain from event to P&L as an interactive graph.

**How it works**

1. Lays out the event, world objects, bridge edges, enterprise objects and KPIs left to right.
2. Edge thickness shows impact share. Click any node for its data and provenance.
3. Toggle scenarios to watch the cascade change.

| | |
|---|---|
| Inputs | Impact paths |
| Outputs | Drill-down |
| Feeds into | Scenario Lab |
| Built with | Sigma.js / Cytoscape |
| Scale | Interactive |
| Guardrails | Shows uncertainty bands, not single numbers. |

### Scenario Lab

*Interface* · Sliders for 'what if' (duration, severity, our response) with fan charts that update in seconds.

**How it works**

1. Each slider maps to a simulator parameter. Results stream back as fan charts per KPI.
2. Save, compare and share scenarios. They run on ontology branches.

| | |
|---|---|
| Inputs | Simulator |
| Outputs | Saved scenarios |
| Feeds into | Decision Brief |
| Built with | Web app + Observable Plot |
| Scale | 5–20 s per rerun |
| Guardrails | Lab runs never touch production data. |

### Decision Brief

*Interface* · The main screen: what happened, what it means for us, what we can do, what it costs, what we recommend and why we might be wrong.

**How it works**

1. Headline and so-what, then impact by business unit and quarter as ranges.
2. Three or four options with cost, time to impact, reversibility and confidence, the recommendation, Red Team dissent, and tripwires.
3. Every number is clickable down to its run or document.

| | |
|---|---|
| Inputs | Brief Writer output |
| Outputs | Approve, modify or reject |
| Feeds into | Action Console |
| Built with | Web + mobile |
| Scale | Readable in under a minute |
| Guardrails | Shows when the brief was produced and what has changed since. |

### Action Console

*Interface* · Approve, and the system does it: typed actions fire into the real systems with an audit trail.

**How it works**

1. Shows the proposed actions with exact parameters, owner, approver chain and expected effect.
2. One-tap approve or modify. Status tracks execution in ERP, CRM, treasury or email.

| | |
|---|---|
| Inputs | Proposals |
| Outputs | Executed actions |
| Feeds into | Human Approval Workflow |
| Built with | Web + mobile |
| Scale | Seconds |
| Guardrails | Bound to the approvals workflow. |

### Ask the Company

*Interface* · Search box and chat over the whole company's knowledge, for every employee.

**How it works**

1. Ask in plain language, for example 'What is our SOP for a supplier force-majeure notice?' or 'Who knows the paint-line PLC?'
2. Answers come with citations and an expert to contact. Follow-up questions keep context.

| | |
|---|---|
| Inputs | Second Brain Q&A |
| Outputs | Answers; Feedback |
| Feeds into | Human Feedback & Stewardship |
| Built with | Web, Teams/Slack app, mobile |
| Scale | Seconds |
| Guardrails | Answers are permission-scoped. |

### Department Pulse

*Interface* · Every department on one map: health, KPIs, risks, and exposure to what is happening right now.

**How it works**

1. A zoomable treemap of thousands of departments, sized by cost or headcount and coloured by KPI health or current exposure.
2. Drill from business unit to department, sub-department and team. Each shows its Department Twin.

| | |
|---|---|
| Inputs | Department Twins; Impacts |
| Outputs | Drill-down |
| Feeds into | Decision Brief |
| Built with | Web app |
| Scale | Live |
| Guardrails | Permission-scoped. |

### Digests & Alerts

*Interface* · The right message to the right person on the channel they actually read.

**How it works**

1. A morning brief per role, plus push alerts for escalations.
2. Delivered by Teams, Slack, WhatsApp Business, email or voice.
3. Routed to object owners through the org graph, with acknowledgement tracking.

| | |
|---|---|
| Inputs | Briefs; Routed storylines |
| Outputs | Delivered messages |
| Feeds into | Human Feedback & Stewardship |
| Built with | Notification service |
| Scale | Seconds |
| Guardrails | Quiet hours, with critical alerts overriding them. |

## L8 Learning Loop

Compare what was predicted with what happened, then recalibrate sources, models, thresholds and playbooks.

### Outcome Tracker

*Deterministic code* · For every brief and decision, records what was predicted and what then happened.

**How it works**

1. Stores the predictions, chosen option and alternatives at decision time.
2. At each horizon, pulls actual KPIs and computes the error and attribution.
3. Feeds the decision log and the precedent library.

| | |
|---|---|
| Inputs | Briefs; Actions; KPIs |
| Outputs | Scored outcomes |
| Feeds into | Calibration & Model Updates, Precedent & Decision Memory |
| Built with | Batch jobs |
| Scale | Continuous |
| Guardrails | Counterfactuals are labelled as estimates. |

### Calibration & Model Updates

*Deterministic code + ML model* · Gets measurably better every month.

**How it works**

1. Updates source reliability priors, transfer functions (Bayesian updates), relevance-router labels (what leaders opened, acted on or ignored) and alert thresholds.
2. Retrains extraction and classification models from steward corrections.
3. Every update must pass Evals before it ships.

| | |
|---|---|
| Inputs | Outcomes; Feedback; Evals |
| Outputs | New model and parameter versions |
| Feeds into | Relevance Router, Transfer Function Library, Credibility & Corroboration |
| Built with | ML pipelines + registry |
| Scale | Weekly |
| Guardrails | Rollback is one click. |

### Playbook Miner

*Agent + Human in the loop* · Turns experience into doctrine.

**How it works**

1. Reads war-room transcripts, briefs and outcomes.
2. Proposes edits to playbooks: new steps, better thresholds, missing departments.
3. Owners review the proposals like pull requests.

| | |
|---|---|
| Inputs | Transcripts; Outcomes |
| Outputs | Playbook change proposals |
| Feeds into | Playbook Library |
| Built with | LLM agent |
| Scale | After every major situation |
| Guardrails | Proposals only; humans merge. |

### Human Feedback & Stewardship

*Human in the loop + Interface* · Every correction a person makes fixes the system for everyone.

**How it works**

1. Thumbs and corrections in every UI, for example 'this supplier no longer supplies us' or 'wrong department'.
2. Data stewards triage the queue and fix ontology edges, entity merges and labels.
3. Fixes are applied with provenance and feed training data.

| | |
|---|---|
| Inputs | User feedback |
| Outputs | Corrections |
| Feeds into | Calibration & Model Updates, Dependency Bridge Graph |
| Built with | Steward queue UI |
| Scale | Continuous |
| Guardrails | Audited edits only. |

## Scenario traces

### Taiwan Strait blockade

*Geopolitical & security · reader: Auto OEM MD*

1. **Real-time Stream Listeners**: AIS shows Taiwan Strait transits down 85% in 2 hours while wire flashes arrive. Silence on Taiwan port feeds is itself a signal.
2. **Event Extraction & Storylines**: 4,100 articles in 23 languages collapse into one storyline: 'PLA blockade of Taiwan', status escalating.
3. **Credibility & Corroboration**: Confirmed by AIS, 3 governments and war-risk premium moves. Confidence 0.93.
4. **Relevance Router**: Bridge edges: 41 suppliers within 2 hops of Taiwanese fabs and OSATs. Escalated to the CXO.
5. **Impact Propagation Engine**: Chips flow to ECUs, infotainment and ADAS modules, then to tier-1s, then to vehicle programs. Memory prices and freight are separate channels.
6. **Geopolitics & Policy Analyst**: Three branches: 2-week standoff (0.35), 3-month quarantine (0.45), 12-month+ blockade (0.20).
7. **Scenario Simulator**: 10k runs per branch on inventory and capacity. Units at risk by month.
8. **Decision Optimizer**: Option set: buy-ahead sizing, reallocation to highest-margin programs, de-contenting.
9. **Financial Translator**: EBITDA at risk shown as a range per quarter and per business unit.
10. **Red Team**: 'Panic buying at spot peak locks in losses if branch 1 occurs.' Quantified.
11. **Verifier**: All 27 numbers traced to run IDs.
12. **Decision Brief**: On the MD's screen at T+60 s with four options and one-tap approval.

### Surprise rate hike of 50 bp

*Monetary & macro · reader: CFO / MD*

1. **Licensed Feeds & APIs**: The central bank's policy statement arrives on its official feed at 10:00:03. Consensus had expected no change.
2. **Event Extraction & Storylines**: Event type Monetary.PolicyRate: +50 bp, hawkish guidance.
3. **Relevance Router**: Bridge edges: financed_by (floating-rate debt), sells_in (retail-financed demand), priced_in (currency). Escalated.
4. **Transfer Function Library**: Transfer functions: EMI change maps to entry-segment demand with a 2–3 month lag. Floating debt reprices next quarter.
5. **Markets & Macro Analyst**: Bond and currency reactions read. Treasury hedge book checked.
6. **Customer & Competition Analyst**: Demand forecast revised for loan-financed segments. Competitor financing offers scanned.
7. **Department Liaison Agents**: Treasury liaison: refinancing windows. Marketing liaison: a financing-scheme template from last cycle's decision log.
8. **Financial Translator**: Interest cost up and volume down, per quarter.
9. **Decision Brief**: Options: subvented-EMI scheme with the captive lender, fix part of the floating debt, shift the product mix.

### New EU carbon-border rule

*Regulation & policy · reader: Chief Compliance / MD*

1. **Change Detector**: An EUR-Lex implementing act changed: embedded-emissions reporting moves from transitional to definitive, with a penalty schedule.
2. **Event Extraction & Storylines**: Regulation.Adopted. Scope: steel, aluminium and derivatives. Effective date and penalties extracted.
3. **Relevance Router**: regulated_by edges: EU-bound exports and EU subsidiaries importing covered inputs. Department notifications go to Compliance, Procurement and Export Sales.
4. **Legal & Regulatory Analyst**: Obligations mapped to processes. Supplier contracts lack emissions-data clauses (14 contracts).
5. **Process Mining**: No current process captures supplier emissions data. The gap is shown in the procure-to-pay flow.
6. **Department Liaison Agents**: The Procurement liaison drafts supplier data requests. The Sustainability liaison finds the existing carbon-accounting SOP and its gaps.
7. **Financial Translator**: Certificate cost exposure per year under three carbon price paths.
8. **Decision Brief**: A compliance plan with owners and deadlines, plus actions: notify_stakeholders to 60 suppliers and update_sop.

### Competitor price cut

*Competitive moves · reader: Head of Sales / MD*

1. **Change Detector**: Competitor configurator pages show a 9% price cut on a rival model.
2. **Weak-Signal & Anomaly Detector**: Dealer CRM notes mentioning the rival rose 3× in 48 h, before the press covered it.
3. **Relevance Router**: competes_with edge to two of our models in the same segment and cities.
4. **Customer & Competition Analyst**: Share-of-search, configurator traffic and test-drive bookings analysed.
5. **Scenario Simulator**: Agent-based market model gives share loss under three response strategies.
6. **Decision Optimizer**: Incentive budget allocated by city and variant to protect margin.
7. **Department Liaison Agents**: The Marketing liaison drafts a campaign brief. The Dealer Network liaison drafts a dealer communication.
8. **Decision Brief**: Options: match price, targeted incentives, value bundle, or hold. Each comes with volume and margin ranges.

### Heatwave and weak monsoon

*Natural hazards & climate · reader: COO / MD*

1. **Licensed Feeds & APIs**: Weather-service and ECMWF forecasts show a 10-day heatwave, a monsoon deficit of 18%, and satellite soil moisture falling.
2. **Event Extraction & Storylines**: Two linked storylines: Natural.Heatwave and Climate.MonsoonDeficit.
3. **Relevance Router**: Plants depend_on_infra for water and power, rural districts carry sells_in revenue share, and employs_in links to shop-floor labour.
4. **Impact Propagation Engine**: Three channels: plant water stress and power cuts, rural demand down, worker heat-safety limits.
5. **Department Liaison Agents**: EHS liaison: the heat-stress SOP and shift rules. Plant liaison: water storage days. Rural Sales liaison: dealer stock.
6. **Decision Optimizer**: Shift re-timing, water-tanker contracts and dealer inventory rebalancing.
7. **Decision Brief**: Actions sent to the plant heads, with the MD informed of the demand impact.

### Ransomware at a key supplier

*Technology & cyber · reader: CISO / COO*

1. **Real-time Stream Listeners**: A ransomware leak-site monitor posts a victim name.
2. **Entity Resolution**: The leak-site name resolves to the legal entity of a tier-1 supplier.
3. **Weak-Signal & Anomaly Detector**: Internal corroboration: that supplier's EDI shipment notices stopped 6 hours ago.
4. **Credibility & Corroboration**: External claim plus internal silence gives confidence 0.88.
5. **Relevance Router**: Sole-sourced parts, plus a shared VPN link into our network.
6. **Supply Chain & Operations Analyst**: Days of cover per part: 4 to 11 days. Alternate sources found for 3 of 7 parts.
7. **Legal & Regulatory Analyst**: Shared-data review: which of our data the supplier held, and the notification duties.
8. **Hooks & Policy Engine**: The action revoke_partner_access needs CISO approval. The policy routes it.
9. **Human Approval Workflow**: CISO approves on mobile in 4 minutes.
10. **Decision Brief**: The COO sees the parts-at-risk plan, alternate sourcing and production resequencing.

### Scrap spike on Line 3

*Internal operations · reader: Plant head*

1. **Enterprise Connector Mesh**: MES historian data streams in over OPC-UA.
2. **Stream Processor**: Scrap rate at the Line 3 weld station reaches z = 4.1 on the night shift.
3. **Weak-Signal & Anomaly Detector**: It co-occurs with a new adhesive batch from a supplier and an SOP revision last week.
4. **Knowledge & Document Store**: Finds the SOP revision diff and a supplier deviation-notice email that nobody actioned.
5. **Org & Expertise Graph**: Routes to the process engineer with the strongest expertise on that station.
6. **Department Liaison Agents**: The Quality liaison drafts containment: quarantine the batch and revert the SOP step.
7. **Financial Translator**: Scrap cost per shift and warranty-risk exposure.
8. **Impact Feed**: Shown to the plant head, not the MD, because it is below MD materiality.
9. **Outcome Tracker**: Fix logged. Scrap back to baseline in 2 shifts. The transfer function is updated.
