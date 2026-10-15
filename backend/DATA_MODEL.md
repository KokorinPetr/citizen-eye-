# Data Model — Civic Eye

PostgreSQL + PostGIS. Every table gets `id UUID` (primary key) plus `created_at` / `updated_at`
from a shared mixin in `app/core/base_model.py`. UUIDs are used so ids in public URLs can't be guessed.
Points are stored as `location geography(Point, 4326)` with a GiST index. The API exposes `lat` / `lng`.

## Entity overview

```
users ──< refresh_tokens
  │
  ├──< volunteer_signups >── incident_tasks >── incidents ──< reports
  │              └────────────────────────────────┘ (signup.incident_id)
  └──< reports (reporter_user_id, nullable: reports can be anonymous)

centers        (independent map layer)
```

## Enums (`StrEnum`, stored as Postgres enums)

| Enum             | Values                                                                  |
| ---------------- | ----------------------------------------------------------------------- |
| `NeedType`       | `evacuation`, `food`, `water`, `medicine`, `medical`, `boat`, `shelter`, `other` |
| `Urgency`        | `low`, `medium`, `high`, `critical`                                     |
| `IncidentStatus` | `open`, `in_progress`, `resolved`                                       |
| `LocationSource` | `client` (map tap / GPS), `geocoded`, `unresolved`                      |
| `TaskRole`       | `driver`, `carrier`, `boat_operator`, `medic`, `cook`, `general`        |
| `TaskStatus`     | `open`, `filled`, `done`                                                |
| `SignupStatus`   | `going`, `arrived`, `cancelled`                                         |
| `ReportStatus`   | `pending`, `parsed`, `failed`                                           |
| `UserRole`       | `user`, `coordinator`, `admin`                                          |
| `CenterType`     | `shelter`, `hospital`, `fire_station`, `police`, `other`                |
| `CenterStatus`   | `open`, `full`, `closed`, `unknown`                                     |

## Tables

### `users` (module: auth)
| Column          | Type          | Notes                                  |
| --------------- | ------------- | -------------------------------------- |
| email           | varchar unique| stored lowercased (by the schema)      |
| password_hash   | text          | argon2                                 |
| full_name       | text          |                                        |
| phone           | text null     | private, never returned in public APIs |
| has_vehicle     | bool          | default false                          |
| role            | UserRole      | default `user`                         |
| is_active       | bool          | default true                           |

### `refresh_tokens` (module: auth)
| Column         | Type             | Notes                              |
| -------------- | ---------------- | ---------------------------------- |
| user_id        | FK users         | on delete cascade                  |
| jti_hash       | text unique      | sha256 of the token `jti`          |
| expires_at     | timestamptz      |                                    |
| revoked_at     | timestamptz null | set on rotation/logout             |
| replaced_by_id | FK self null     | rotation chain, used to detect reuse |

### `incidents` (module: incidents)
| Column          | Type                 | Notes                                             |
| --------------- | -------------------- | ------------------------------------------------- |
| title           | text                 | short, AI-generated or manual                     |
| summary         | text                 | merged description                                |
| need_type       | NeedType             | primary need                                      |
| urgency         | Urgency              | highest urgency across merged reports             |
| status          | IncidentStatus       | default `open`                                    |
| magnitude       | smallint (0–100)     | computed, see below; indexed                      |
| location        | geography(Point) null| null only when `location_source = unresolved`     |
| location_source | LocationSource       |                                                   |
| location_text   | text                 | "Soi 12, Lat Phrao" as extracted                  |
| district        | text null            |                                                   |
| people_affected | int null             | estimate from reports                             |
| report_count    | int                  | default 1, +1 on each merge                       |
| is_verified     | bool                 | 2+ independent reports or volunteer confirmation  |
| created_by_id   | FK users null        | manual creation                                   |
| last_report_at  | timestamptz          | latest merged report                              |
| resolved_at     | timestamptz null     |                                                   |

Indexes: GiST(`location`), (`status`, `need_type`), (`magnitude` desc).

### `incident_tasks` (module: incidents)
One incident has one or more tasks, e.g. "1 driver + 2 carriers". A manually created incident with
no tasks gets one `general` task automatically, so sign-ups always attach to a task.

| Column       | Type         | Notes                         |
| ------------ | ------------ | ----------------------------- |
| incident_id  | FK incidents | on delete cascade             |
| title        | text         | "Carry elderly woman to boat" |
| role         | TaskRole     |                               |
| needed_count | smallint     | ≥ 1                           |
| status       | TaskStatus   | `filled` when signups reach needed |

The incident's helper counter (`3 of 5`) is **computed**: the sum of active signups over the sum of `needed_count`.
It is not stored, so it can never drift out of sync.

### `volunteer_signups` (module: volunteers)
| Column      | Type              | Notes                                   |
| ----------- | ----------------- | --------------------------------------- |
| user_id     | FK users          |                                         |
| incident_id | FK incidents      | denormalized for fast counting          |
| task_id     | FK incident_tasks |                                         |
| status      | SignupStatus      | `arrived` can mark incident verified    |

Unique partial index: (`user_id`, `incident_id`) where `status != 'cancelled'`.

### `reports` (module: reports)
Every incoming message is kept, even after it has been merged, for audit and verification.

| Column           | Type                  | Notes                                     |
| ---------------- | --------------------- | ----------------------------------------- |
| incident_id      | FK incidents null     | null until parsed / if parsing failed     |
| reporter_user_id | FK users null         | anonymous allowed                         |
| raw_text         | text                  |                                           |
| language         | text null             | detected: `th`, `en`, `ru`                |
| client_location  | geography(Point) null | GPS / map tap sent with the report        |
| parsed_data      | jsonb null            | full AI output (`ParsedReport`)           |
| status           | ReportStatus          |                                           |
| was_merged       | bool                  | true if attached to an existing incident  |
| ai_provider      | text null             | e.g. `anthropic`, `openai`, `fake`        |
| ai_model         | text null             |                                           |

### `centers` (module: centers)
| Column       | Type             | Notes                           |
| ------------ | ---------------- | ------------------------------- |
| name         | text             |                                 |
| name_local   | text null        | Thai name                       |
| center_type  | CenterType       |                                 |
| status       | CenterStatus     |                                 |
| location     | geography(Point) |                                 |
| district     | text null        |                                 |
| address      | text null        |                                 |
| phone        | text null        | public (official numbers)       |
| capacity     | int null         |                                 |
| source_name  | text             | `osm`, `bma`, `manual`          |
| source_url   | text             |                                 |
| retrieved_at | timestamptz      |                                 |

Hotlines (191, 199, 1669, 1155, 1555) are a static file `data/hotlines.json`, served by the centers module.

## Merging and magnitude

### Merging related reports (deduplication)
A new report is merged into an existing incident when all of these hold:
- the incident is `open` or `in_progress`,
- it is within `DEDUP_RADIUS_M` (default 200 m, set in config),
- the `need_type` is the same, or the AI connector confirms that both describe the same situation.

On merge: link the report, `report_count += 1`, keep the higher `urgency`, add task roles that are
missing, update `last_report_at`, mark the incident verified if the report is independent
(different user or anonymous with a different location), then **recalculate magnitude**.

### Magnitude (0–100)
Magnitude measures how serious and well-confirmed an incident is. The frontend uses it for **marker size**
(bigger = more important), while urgency sets the colour. It is computed by one function,
`calculate_magnitude()` in `app/modules/incidents/magnitude.py`, with the weights in config. It is
recalculated whenever a report is merged, urgency changes, or the incident is verified.

| Factor           | Points                                                |
| ---------------- | ----------------------------------------------------- |
| Urgency          | low 10 · medium 25 · high 45 · critical 60            |
| Report count     | +8 per extra report, max +20                          |
| People affected  | +1 per person, max +15                                |
| Verified         | +5                                                    |

Clamped to 0–100. The API also returns `magnitude_level` (1–5, i.e. `ceil(magnitude / 20)`) to make
marker sizing on the frontend easy.

**Priority** (sort order for volunteers) is computed and never stored:
`priority = magnitude × (1 − coverage)`, where `coverage = signed_up / needed`. A big incident that
already has enough helpers drops down the list.

Separately, the frontend can visually group *different* incidents that sit close together at low
zoom (Leaflet.markercluster). That is display only and does not change any data.
