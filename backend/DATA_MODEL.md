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
| `TaskRole`       | `driver`, `carrier`, `boat_operator`, `medic`, `cook`, `general`        |
| `TaskStatus`     | `open`, `filled`, `done`                                                |
| `SignupStatus`   | `going`, `completed`, `cancelled`                                       |
| `ReportSource`   | `manual`, `ai`, `seed`                                                  |
| `ReportStatus`   | `pending`, `parsed`, `failed` (Phase 4)                                 |
| `UserRole`       | `user`, `coordinator`, `admin`                                          |
| `CenterType`     | `shelter`, `supply_point`, `hospital`, `fire_station`, `police`, `other` |
| `CenterSource`   | `user`, `osm`, `bma`, `official`                                        |
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
| urgency         | Urgency              | highest urgency across merged reports (not editable) |
| status          | IncidentStatus       | default `open`                                    |
| magnitude       | smallint (0–100)     | computed, see below; indexed                      |
| location        | geography(Point)     | always from the client pin (see ARCHITECTURE.md)  |
| location_text   | text null            | "Soi 12, Lat Phrao", for humans only              |
| people_affected | int null             | estimate from reports                             |
| contact_phone   | text null            | only shown to logged-in users                     |
| report_count    | int                  | default 1, +1 on each merge                       |
| is_verified     | bool                 | 2+ independent reports or volunteer confirmation  |
| owner_id        | FK users null        | logged-in creator; can edit, resolve, reopen, delete |
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
| needed_count    | smallint     | ≥ 1                                    |
| signed_up_count | smallint     | active (`going`) signups, recounted    |
| status          | TaskStatus   | `open` → `filled` (enough people) → `done` |

`signed_up_count` is **recounted** from `volunteer_signups` after every sign-up or cancel, never
incremented, so it can't drift. It is stored so the map list (polled every 5 s) doesn't load signups.
The incident's helper counter is `helpers_signed_up / helpers_needed`, summed over tasks that are not done.

### `volunteer_signups` (module: volunteers)
| Column      | Type              | Notes                                   |
| ----------- | ----------------- | --------------------------------------- |
| user_id     | FK users          |                                         |
| incident_id | FK incidents      | denormalized for fast counting          |
| task_id     | FK incident_tasks |                                         |
| status      | SignupStatus      | `completed` when the task is marked done |

Unique partial index: (`user_id`, `incident_id`) where `status != 'cancelled'`.
A user can have at most 2 active signups on active incidents (`MAX_ACTIVE_SIGNUPS` in config).
Sign-up locks the task row (`SELECT … FOR UPDATE`) so two people can't take the last spot.

Public reads (no login needed): `GET /incidents/{id}/volunteers` (who is going, per task) and
`GET /users/{id}/signups` (which incidents a user helps with). These only expose `full_name` and
`has_vehicle`, never email or phone.

### `reports` (model `IncidentReport`, owned by the incidents module)
Every incoming message is kept, even after it has been merged. A manually created incident also
stores one report (`source = manual`), so every incident has at least one report and magnitude is
computed the same way for all of them. The `reports` module (Phase 4) is only the AI intake pipeline
that calls `incidents.service`.

| Column          | Type              | Notes                                         |
| --------------- | ----------------- | --------------------------------------------- |
| incident_id     | FK incidents null | null if AI parsing failed                     |
| reporter_id     | FK users null     | anonymous allowed                             |
| source          | ReportSource      |                                               |
| raw_text        | text              |                                               |
| urgency         | Urgency           | from this report                              |
| people_affected | int null          | from this report                              |
| magnitude       | smallint          | this report's own magnitude                   |
| location        | geography(Point)  | pin sent with the report                      |
| parsed_data     | jsonb null        | full AI output (`ParsedReport`)               |
| (Phase 4)       |                   | `status`, `language`, `ai_provider`, `ai_model` |

### `centers` (module: centers)
| Column       | Type             | Notes                           |
| ------------ | ---------------- | ------------------------------- |
| name         | text             |                                 |
| description  | text             |                                 |
| center_type  | CenterType       |                                 |
| status       | CenterStatus     | owner keeps it up to date       |
| source       | CenterSource     | `user` = created in the app     |
| location     | geography(Point) |                                 |
| address      | text null        |                                 |
| phone        | text null        | public contact for the place    |
| capacity     | int null         |                                 |
| supplies     | text[]           | NeedType values it provides     |
| owner_id     | FK users null    | null for imported official data |
| source_url   | text null        | official data only              |
| retrieved_at | timestamptz null | official data only              |

Hotlines (191, 199, 1669, 1155, 1555) are a static file `data/hotlines.json`, served by the centers module.

## Merging and magnitude

### Merging related reports (deduplication)
A new report is merged into an existing incident when all of these hold:
- the incident is `open` or `in_progress`, **or `resolved` less than 24 h ago (then it is reopened)**,
- it is within `DEDUP_RADIUS_M` (default 200 m, set in config),
- the `need_type` is the same, or the AI connector confirms that both describe the same situation.

On merge: link the report, `report_count += 1`, keep the higher `urgency`, add task roles that are
missing, update `last_report_at`, mark the incident verified if the report is independent
(different user or anonymous with a different location), then **recalculate magnitude**.

### Magnitude (0–100)
Magnitude measures how serious and well-confirmed an incident is. The frontend uses it for **marker size**
(bigger = more important), while urgency sets the colour. Functions live in
`app/modules/incidents/magnitude.py`, weights in config. It is recalculated whenever a report is
added/merged or the incident is verified.

```
report_magnitude   = urgency_points + min(people_affected, 15)
incident_magnitude = avg(report_magnitudes)
                   + min(8 × (report_count − 1), 20)    # more confirming reports → bigger
                   + 5 if verified
```
Urgency points: low 10 · medium 25 · high 45 · critical 60. Clamped to 0–100. The average keeps one
exaggerated report from inflating an incident; the bonus keeps "more reports = more important".

Example: reports of 48, 70 and 25 → avg 48 + 16 (3 reports) + 5 (verified) = **69, level 4**. The API also returns `magnitude_level` (1–5, i.e. `ceil(magnitude / 20)`) to make
marker sizing on the frontend easy.

**Priority** (sort order for volunteers) is computed and never stored:
`priority = magnitude × (1 − coverage)`, where `coverage = signed_up / needed`. A big incident that
already has enough helpers drops down the list.

Separately, the frontend can visually group *different* incidents that sit close together at low
zoom (Leaflet.markercluster). That is display only and does not change any data.
