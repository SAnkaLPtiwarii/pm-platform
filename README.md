# PM Platform

A lightweight project management platform in the spirit of Trello and Jira: users create projects, invite members, and track tasks on a list or a drag-and-drop board. Access is controlled by a centralized **Policy-Based Access Control (PBAC)** engine whose rules live in a YAML file, not in code.

[![CI](https://github.com/YOUR_GITHUB_USER/pm-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_GITHUB_USER/pm-platform/actions/workflows/ci.yml)

- **Backend:** FastAPI, SQLAlchemy 2.0, Alembic, PostgreSQL
- **Client:** React 19 + TypeScript (Vite), TanStack Query, Tailwind CSS
- **Authentication:** JWT access tokens plus rotating refresh tokens
- **Authorization:** PBAC (no roles anywhere), rules in `backend/app/policies/policies.yaml`
- **Delivery:** Docker Compose (one command), GitHub Actions CI

## Table of contents

1. [Quick start](#quick-start)
2. [Features](#features)
3. [Architecture overview](#architecture-overview)
4. [Authorization: PBAC](#authorization-policy-based-access-control)
5. [Data model](#data-model)
6. [Technology choices](#technology-choices)
7. [Setup instructions](#setup-instructions)
8. [Docker instructions](#docker-instructions)
9. [Environment variables](#environment-variables)
10. [API documentation](#api-documentation)
11. [Testing](#testing)
12. [CI/CD](#cicd)
13. [Bonus features](#bonus-features)
14. [Assumptions made](#assumptions-made)
15. [Trade-offs considered](#trade-offs-considered)
16. [Git workflow](#git-workflow)

---

## Quick start

Requires Docker with Docker Compose v2. Nothing else is needed, and no `.env` file has to be created.

```bash
git clone https://github.com/YOUR_GITHUB_USER/pm-platform.git
cd pm-platform
docker compose up --build
```

| What | URL |
|---|---|
| Web app | http://localhost:3000 |
| API | http://localhost:8000 |
| Swagger UI (OpenAPI) | http://localhost:8000/docs |
| ReDoc | http://localhost:8000/redoc |
| Health check | http://localhost:8000/health |

Open the web app, register an account, create a project, and add tasks. The database schema is created automatically by the migrations when the backend container starts.

The default `JWT_SECRET_KEY` in `docker-compose.yml` is for local use only. See [Environment variables](#environment-variables) before deploying anywhere.

---

## Features

**Authentication**
- Registration, login, logout, `GET /auth/me`
- Passwords hashed with Argon2; JWT access tokens (15 min) and single-use rotating refresh tokens (7 days)
- Logout revokes the refresh token on the server
- Token validation on every protected route, with consistent `401` responses

**Projects**
- Create, view, update, delete; archive and unarchive through the `status` field
- Add and remove members by email (the owner cannot be removed)
- Paginated list with search and status filter; per-project member and task counters

**Tasks**
- Create, view, update, delete
- Attributes: title, description, status (`todo`, `in_progress`, `completed`), priority (`low`, `medium`, `high`), assignee, due date, creator, timestamps
- Search (title and description), filter by status, priority and assignee, pagination
- Status changes with a three-button control in the list, or by dragging cards between board columns (tabs and move buttons on phones, where dragging would fight with scrolling)

**Dashboard:** total projects, active projects, total tasks, completed tasks, pending tasks.

**Activity timeline:** per-project history of who did what, backed by an audit log.

**User experience:** responsive layout, form validation (client and server), loading indicators, empty states, error states with retry, toast feedback, and buttons that disappear when the policy engine says the action is not allowed.

---

## Architecture overview

```
 Browser (React SPA, port 3000, served by nginx)
        |  JSON over HTTPS/HTTP, Bearer access token
        v
 FastAPI (port 8000)
   routers   ->  parse and validate input, call a service, shape the response
   services  ->  business logic; call authorize(...) and repositories
   policies  ->  the ONLY place authorization decisions are made (PBAC engine + YAML)
   repos     ->  SQLAlchemy queries, nothing else
        |
        v
 PostgreSQL 16 (Alembic migrations)
```

Each layer only talks to the layer below it:

- **Routers** (`app/api/routers`) are thin. They never contain business rules or authorization checks.
- **Services** (`app/services`) hold the business logic and call `authorize(user, action, resource)` before acting. They contain no `if user.id == project.owner_id` style checks.
- **Policy layer** (`app/policies`) loads `policies.yaml`, validates it at startup, and answers allow or deny.
- **Repositories** (`app/repositories`) contain queries only, including the SQL filter that restricts project lists to a user's memberships.
- **Cross-cutting code** lives in `app/core`: settings (environment based), security (hashing and tokens), logging, and centralized exception handling that turns every error into one JSON shape.

Every successful state-changing action writes an **audit log** row in the same database transaction as the change, so the log cannot disagree with the data.

### Repository layout

```
.
├── backend/
│   ├── app/
│   │   ├── api/            routers, dependencies (auth, pagination)
│   │   ├── core/           config, security, logging, exceptions
│   │   ├── db/             engine, session, declarative base
│   │   ├── models/         SQLAlchemy models and enums
│   │   ├── policies/       PBAC engine, condition checks, policies.yaml
│   │   ├── repositories/   data access
│   │   ├── schemas/        Pydantic request and response models
│   │   ├── services/       business logic
│   │   └── main.py         application factory
│   ├── alembic/            migration environment and versions
│   ├── tests/              unit/ and api/ test suites
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── auth/           auth context
│   │   ├── components/     UI kit, layout, project panels, task board
│   │   ├── lib/            API client, types, formatting
│   │   ├── pages/          Login, Register, Dashboard, Projects, ProjectDetails, TaskDetails
│   │   └── test/           Vitest tests
│   ├── nginx.conf
│   └── Dockerfile
├── postman/                Postman collection with tests
├── .github/workflows/      CI pipeline
├── docker-compose.yml
└── .env.example
```

### Request flow example: `PATCH /tasks/{id}` with `{"status": "completed"}`

1. The router validates the body and resolves the current user from the bearer token.
2. `TaskService.update` loads the task with its project and members.
3. `authorize(user, "task:view", task)` hides tasks from non-members (`404`).
4. `authorize(user, "task:update", task)` allows only the creator or the assignee (`403` otherwise).
5. Because the new status is `completed`, `authorize(user, "task:complete", task, changes=...)` is evaluated against the state the task **would** have after the change: it needs an assignee and a filled title, description, due date and priority.
6. The change and its audit entry are committed together.

---

## Authorization: Policy-Based Access Control

Authorization is attribute based: a decision depends on the user, the action, and the state of the resource (owner, membership, creator, assignee, status). There are **no roles** in the schema or the code. "Owner" is a relationship (`projects.owner_id`), not a role.

Every decision goes through one function:

```python
authorize(user, "project:delete", project)   # raises 403 unless a policy allows it
```

### The policies

| Action | Rule |
|---|---|
| `project:create` | Any authenticated user |
| `project:view` | The user is a member of the project |
| `project:update` | The user is the project owner |
| `project:delete` | The user is the project owner |
| `project:manage_members` | The user is the project owner |
| `task:create` | The user is a project member |
| `task:view` | The user is a project member |
| `task:update` | The user created the task **or** the task is assigned to the user |
| `task:delete` | The user is the project owner **and** the task status is `todo` |
| `task:complete` | The task has an assignee **and** title, description, due date and priority are all filled in |

### Configurable rules (YAML)

The rules are data. This is the delete policy exactly as it appears in `backend/app/policies/policies.yaml`:

```yaml
- id: task-delete
  action: task:delete
  description: A task can be deleted only while Todo, and only by the project owner.
  conditions:
    all:
      - is_project_owner
      - task_status_is: todo
```

- **Conditions** are small named checks implemented once in `conditions.py`: `is_authenticated`, `is_project_owner`, `is_project_member`, `is_task_creator`, `is_task_assignee`, `task_status_is`, `has_assignee`, `required_fields_present`.
- **Operators** combine them: `all`, `any`, `not`.
- **Effects:** a policy can `allow` (default) or `deny`.
- **Evaluation:** a matching `deny` always wins; otherwise any matching `allow` grants access; otherwise the request is **denied** (default deny, including for unknown actions).
- **Fail fast:** the file is validated when the app starts (unknown conditions, wrong arguments, duplicate ids and typos in keys all stop the boot), so a broken policy can never silently open access.
- Point `POLICY_FILE` at another YAML file to change behaviour without touching code. For example, adding `is_project_owner` to the `any` list of `task:update` lets owners edit every task.

### Responses that hide existence

A project or task the user cannot see answers **404**, exactly like one that does not exist, so ids cannot be probed. A project the user can see but may not change answers **403** with the denied action in `error.details`.

### Hints for the UI

Project and task responses include a `permissions` object computed by the same engine (for example `{"update": false, "delete": true, "complete": false}`). The client uses it to hide buttons, so the interface can never disagree with the server.

---

## Data model

```mermaid
erDiagram
    USERS ||--o{ PROJECTS : owns
    USERS ||--o{ PROJECT_MEMBERS : "is member via"
    PROJECTS ||--o{ PROJECT_MEMBERS : has
    PROJECTS ||--o{ TASKS : contains
    USERS ||--o{ TASKS : creates
    USERS |o--o{ TASKS : "is assigned"
    USERS ||--o{ REFRESH_TOKENS : holds
    USERS |o--o{ AUDIT_LOGS : performs
```

| Table | Purpose and key constraints |
|---|---|
| `users` | UUID primary key, unique lowercase `email`, Argon2 `password_hash` |
| `projects` | `owner_id` (FK, `RESTRICT`), `status` enum (`active`, `archived`) |
| `project_members` | Composite primary key `(project_id, user_id)` so a user joins a project once; both FKs `CASCADE`; index on `user_id` for the visibility query |
| `tasks` | `project_id` (FK, `CASCADE`), `status` and `priority` enums, `assignee_id` (FK, `SET NULL`), `created_by_id` (FK, `RESTRICT`), nullable `due_date`; composite indexes on `(project_id, status)`, `(project_id, priority)` and `(project_id, created_at)` |
| `refresh_tokens` | Only the SHA-256 **hash** of each token is stored; `expires_at`, `revoked_at` |
| `audit_logs` | Append-only trail; `project_id` is deliberately **not** a foreign key so history survives deleting a project; JSONB `detail` |

Normalization and scalability notes:

- Third normal form: relationships live in their own tables, statuses are enums, and counters (tasks per project, and so on) are computed with grouped queries instead of being stored.
- UUID primary keys avoid guessable ids.
- Listing 20 projects with their counters takes a constant number of queries (page, total, members grouped, tasks grouped), not one per project.
- All schema changes are Alembic migrations in `backend/alembic/versions`.

---

## Technology choices

| Choice | Why |
|---|---|
| **FastAPI** | Automatic OpenAPI/Swagger documentation, Pydantic validation, and a dependency system that keeps the authorization layer separate from handlers |
| **SQLAlchemy 2.0 + Alembic** | Typed models, explicit queries, versioned migrations |
| **PostgreSQL 16** | Real constraints, enums, JSONB for the audit trail; SQLite behaves differently for the features used here, so tests also run on Postgres |
| **Argon2** | Memory-hard password hashing, a current recommendation over bcrypt |
| **PyJWT** | Small, well-maintained JWT implementation |
| **YAML policies** | Human-readable and commentable; rules can be reviewed and changed without code changes |
| **React + Vite + TypeScript** | Fast tooling and type-checked API models |
| **TanStack Query** | Caching, loading and error states, and request deduplication without hand-written effects |
| **React Hook Form + Zod** | Declarative validation with clear per-field messages |
| **dnd-kit** | Accessible drag and drop for the board |
| **Tailwind CSS** | Consistent responsive styling with no custom CSS to maintain |
| **Docker Compose + nginx** | One-command start; nginx serves the static production build |
| **GitHub Actions** | Lint, migrations check, tests, build and a full-stack smoke test on every push |
| **ruff, ESLint, Vitest, pytest** | Linting and testing on both sides |

---

## Setup instructions

Prerequisites: Python 3.12+, Node.js 20+, Docker (used here for the PostgreSQL database), Git.

### 1. Database

```bash
docker run --name pm-db -e POSTGRES_USER=pm_user -e POSTGRES_PASSWORD=change_me -e POSTGRES_DB=pm_db -p 5432:5432 -d postgres:16-alpine
```

If port 5432 is taken, map another one (for example `-p 5434:5432`) and use it in the URL below. For the API tests, also create a separate test database:

```bash
docker exec pm-db psql -U pm_user -d postgres -c "CREATE DATABASE pm_test"
```

### 2. Backend

Windows (cmd):

```cmd
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements-dev.txt
```

macOS / Linux:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
```

Create `backend/.env` (it is git-ignored and overrides the root `.env`):

```
DATABASE_URL=postgresql+psycopg://pm_user:change_me@localhost:5432/pm_db
JWT_SECRET_KEY=any-long-random-string
```

Apply the migrations and start the API with auto-reload:

```bash
alembic upgrade head
uvicorn app.main:app --reload
```

The API is at http://localhost:8000 and the interactive docs at http://localhost:8000/docs.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

The app runs at http://localhost:5173 and talks to `http://localhost:8000` by default. Copy `frontend/.env.example` to `frontend/.env` to change `VITE_API_URL`.

### Working with migrations

```bash
alembic upgrade head                                  # apply all migrations
alembic revision --autogenerate -m "describe change"  # create a migration from model changes
alembic check                                         # fail if models and migrations differ
alembic downgrade -1                                  # roll back one migration
```

---

## Docker instructions

```bash
docker compose up --build        # build and start db, backend and frontend
docker compose up -d --build     # same, in the background
docker compose ps                # service status and health
docker compose logs -f backend   # follow the API logs
docker compose down              # stop, keep the database volume
docker compose down -v           # stop and delete the database volume
```

- **`db`**: PostgreSQL 16 with a health check and a named volume (`pm_pgdata`). It publishes no host port, so it cannot clash with a database you already run. Only the backend can reach it.
- **`backend`**: waits for a healthy database, runs `alembic upgrade head`, then starts Uvicorn as a non-root user. It has a `/health` check that also verifies the database connection.
- **`frontend`**: a multi-stage build (Node builds the static bundle, nginx serves it). Unknown paths fall back to `index.html` so client-side routing works.
- `VITE_API_URL` is a **build argument**, because Vite bakes it into the bundle at build time. It must be the API address as the browser sees it.
- If you change `FRONTEND_PORT`, also set `CORS_ORIGINS` to the new origin.
- To use a different PostgreSQL image (for example on a machine that cannot run the default one), set `POSTGRES_IMAGE`.

---

## Environment variables

`.env.example` documents every variable. Docker Compose provides defaults for all of them, so a `.env` file is optional there.

| Variable | Default | Used by | Description |
|---|---|---|---|
| `ENVIRONMENT` | `development` (`production` in Compose) | backend | Free-form environment label |
| `LOG_LEVEL` | `INFO` | backend | Python logging level |
| `POSTGRES_USER` | `pm_user` | db, compose | Database user |
| `POSTGRES_PASSWORD` | `change_me` | db, compose | Database password. **Change it for any real deployment** |
| `POSTGRES_DB` | `pm_db` | db, compose | Database name |
| `DATABASE_URL` | built by Compose | backend | SQLAlchemy URL, `postgresql+psycopg://user:pass@host:5432/db` |
| `JWT_SECRET_KEY` | dev-only value in Compose | backend | Signing key. **Required**, and must be long and random in production |
| `JWT_ALGORITHM` | `HS256` | backend | JWT signing algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `15` | backend | Access token lifetime |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | backend | Refresh token lifetime |
| `CORS_ORIGINS` | `http://localhost:5173` (`http://localhost:3000` in Compose) | backend | Comma-separated list of allowed browser origins |
| `POLICY_FILE` | empty | backend | Path to a custom policy YAML file; empty uses the bundled one |
| `VITE_API_URL` | `http://localhost:8000` | frontend | API base URL (read at build time) |
| `TEST_DATABASE_URL` | local `pm_test` database | tests | Database for API tests. Must end in `_test` or the tests refuse to run |
| `POSTGRES_IMAGE` | `postgres:16-alpine` | compose | Override the database image |
| `BACKEND_PORT` / `FRONTEND_PORT` | `8000` / `3000` | compose | Host ports |

---

## API documentation

Interactive documentation is generated from the code:

- Swagger UI: `/docs`
- ReDoc: `/redoc`
- OpenAPI schema: `/openapi.json`
- **Postman collection:** `postman/pm-platform.postman_collection.json`. Import it and run the whole collection with the Collection Runner. It registers fresh users on every run and asserts status codes and key fields, including every authorization rule. `baseUrl` defaults to `http://localhost:8000`.

All endpoints are under `/api/v1` and, except registration, login, refresh and logout, require `Authorization: Bearer <access_token>`.

### Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Create an account |
| POST | `/auth/login` | Returns an access and a refresh token |
| POST | `/auth/refresh` | Exchange a refresh token for a new pair (rotation) |
| POST | `/auth/logout` | Revoke a refresh token |
| GET | `/auth/me` | Current user |
| GET | `/dashboard/stats` | The five dashboard statistics |
| POST | `/projects` | Create a project |
| GET | `/projects` | List my projects. Query: `page`, `page_size`, `search`, `status` |
| GET | `/projects/{id}` | Project details |
| PATCH | `/projects/{id}` | Partial update (owner) |
| DELETE | `/projects/{id}` | Delete project and its tasks (owner) |
| GET | `/projects/{id}/members` | List members |
| POST | `/projects/{id}/members` | Add a member by email (owner) |
| DELETE | `/projects/{id}/members/{user_id}` | Remove a member (owner) |
| GET | `/projects/{id}/activity` | Activity timeline, newest first |
| POST | `/projects/{id}/tasks` | Create a task |
| GET | `/projects/{id}/tasks` | List tasks. Query: `page`, `page_size`, `search`, `status`, `priority`, `assignee_id` |
| GET | `/tasks/{id}` | Task details |
| PATCH | `/tasks/{id}` | Partial update |
| DELETE | `/tasks/{id}` | Delete a task |
| GET | `/health` | Liveness and database check (outside `/api/v1`) |

### Conventions

- **Pagination:** `?page=1&page_size=20` (1 to 100). Lists return `{"items": [...], "total": 42, "page": 1, "page_size": 20}`.
- **Status codes:** `200` OK, `201` created, `204` no content, `401` not authenticated, `403` authenticated but not allowed, `404` not found or not visible, `409` conflict (duplicate email or member), `422` validation failed, `503` database unavailable.
- **Errors** always have one shape:

```json
{
  "error": {
    "code": "forbidden",
    "message": "You do not have permission to perform this action",
    "details": { "action": "task:delete" }
  }
}
```

Validation errors (`422`) put a list of `{ "field", "message" }` objects in `details`.

### Example

```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","name":"Alice","password":"Passw0rd!123"}'

curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"Passw0rd!123"}'

curl -X POST http://localhost:8000/api/v1/projects \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Website","description":"Marketing site"}'
```

---

## Testing

| Suite | What it covers | Needs a database |
|---|---|---|
| `backend/tests/unit` | Every PBAC policy with allow and deny cases, engine behaviour (default deny, deny overrides allow, unknown actions), policy file validation, password hashing, JWT handling | No |
| `backend/tests/api` | Authentication (registration, login, refresh rotation, logout, tampered and expired tokens), project and member rules, task CRUD, search, filters and pagination, the delete and completion policies, dashboard counts, audit trail and activity timeline | Yes (PostgreSQL) |
| `backend/tests/api/test_flow.py` | An end-to-end integration scenario across two users | Yes |
| `frontend/src/test` | Form validation and UI components (Vitest and Testing Library) | No |

Run them:

```bash
cd backend
pytest                                        # everything
pytest tests/unit                             # no database required
pytest --cov=app --cov-report=term-missing    # with coverage
```

```bash
cd frontend
npm test
npm run lint
```

The API tests use a separate `pm_test` database (`TEST_DATABASE_URL`). They refuse to run against any database whose name does not end in `_test`, drop and recreate the schema once per session, and truncate every table after each test. Password hashing is made cheap during tests only.

---

## CI/CD

`.github/workflows/ci.yml` runs on every push to `main` and on every pull request:

1. **backend**: install dependencies, `ruff check`, `ruff format --check`, apply the migrations to an empty PostgreSQL service container, `alembic check` (fails when a model change has no migration), then `pytest` with coverage (the report is uploaded as an artifact).
2. **frontend**: `npm ci`, ESLint, Vitest, and `npm run build` (which type-checks).
3. **docker** (runs after the two above succeed): build both images, start the whole stack with `docker compose up --wait`, then smoke-test the health endpoint, the web app, registration, login and an authenticated request. Container logs are printed on failure.

A newer push to the same branch cancels the older run. Continuous deployment is intentionally not included, since there is no target environment.

---

## Bonus features

| Bonus item | Status |
|---|---|
| Configurable PBAC engine (YAML) | Implemented |
| Refresh tokens (rotating, revocable) | Implemented |
| Audit logging | Implemented |
| Activity timeline | Implemented |
| Drag-and-drop status updates | Implemented (board view) |
| Integration tests | Implemented |
| GitHub Actions pipeline | Implemented |
| Swagger / OpenAPI and Postman collection | Implemented |
| Email notifications, file attachments, Redis caching, background jobs, WebSockets | Not implemented |

---

## Assumptions made

The specification leaves these open, so these decisions were made and are covered by tests:

1. **Only the project owner can add or remove members.** This matches "only the owner may update or delete a project".
2. **Any project member can view the project's tasks.**
3. **An assignee must be a project member.** Otherwise a task could be assigned to someone who cannot see it. This is business validation (`422`), not authorization.
4. **"All required task information" means title, description, due date and priority.** Only the title is mandatory when creating a task, and priority defaults to medium, so the rule is meaningful. The list is configurable in `policies.yaml`.
5. **"Active project" means `status = active`.** Owners can archive and unarchive a project. Archived projects stay visible and count in the totals.
6. **The project owner is not automatically allowed to edit every task.** The task-update rule is implemented literally: creator or assignee only. The owner's extra power is limited to deleting `todo` tasks, as specified. Granting more is a one-line YAML change.
7. **Tasks always start as `todo`.** Any `status` sent on creation is ignored.
8. **The owner is also stored as a member row**, so visibility is a single membership lookup. The owner cannot be removed from the project.
9. **Removing a member unassigns their tasks**, so they cannot keep edit rights (through the "assignee" rule) on a project they can no longer see.
10. **"Pending tasks" means every task that is not completed.**
11. **Dashboard statistics are scoped to the projects the user is a member of.**
12. **Email addresses are case-insensitive** (stored lowercase).
13. **Non-members get `404`, not `403`,** so the existence of a project or task is not revealed.

---

## Trade-offs considered

- **Tokens in `localStorage`.** Simple and works with a separate API origin, but a cross-site scripting bug could read them. HttpOnly cookies with CSRF protection would be stronger; this was left out to keep the client simple. The access token lives only 15 minutes, and refresh tokens are single-use.
- **Logout cannot revoke an access token that was already issued.** It revokes the refresh token, so the session cannot be extended; the access token expires within 15 minutes. A deny-list would fix that at the cost of a lookup on every request.
- **List visibility is a SQL filter, not a per-row policy call.** Calling `authorize` for each project would mean loading every project first. The rule is therefore expressed once in the policy file (for single resources) and once in the membership query (for lists). Tests assert both agree.
- **`OFFSET` pagination.** Simple and supports jumping to a page, but slows down on very large offsets; keyset pagination would scale better.
- **Search uses `ILIKE`.** Fine for the data sizes here. A `pg_trgm` index or full-text search would be the next step.
- **Audit entries are written only for successful actions,** in the same transaction as the change. A failed or denied attempt rolls back, so denials are visible in the application log (`authz` lines) but not in the table.
- **Migrations run when the backend container starts.** That makes a clean clone work in one command. With several backend replicas this should become a separate one-off job.
- **No real-time updates.** WebSockets were skipped; the board refreshes after every change you make, but not when somebody else changes a task.
- **The board loads at most 100 tasks** per project, and says so when there are more.
- **No rate limiting or email verification** on authentication, which a public deployment would need.
- **Dependencies use version ranges** (`>=`) rather than a lock file for the backend, so CI may resolve newer versions than a local machine. A lock file would make builds fully reproducible.
- **Tests build the schema from the models,** while CI separately proves that the migrations produce the same schema (`alembic upgrade head` followed by `alembic check`).

---

## Git workflow

History follows Conventional Commits with small, focused commits, built up in the order of the work: project setup, database models and migration, authentication, PBAC engine and tests, projects API, tasks API, API tests, audit logging, client application, Docker, CI, documentation.