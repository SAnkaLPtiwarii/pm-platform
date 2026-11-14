# PM Platform

A project and task management app with a FastAPI backend, React frontend, PostgreSQL
database, and JWT-based authentication.

## Features

- User registration, login, refresh, and logout.
- Project creation and management, membership management, and project activity history.
- Task creation and management, assignment, status/priority, and due dates.
- Dashboard statistics, protected frontend routes, and policy-based authorization.
- Audit events for important actions.

## Run the full app with Docker

Docker Desktop with Docker Compose is required. From the repository root, run:

```cmd
docker compose up --build
```

Compose starts PostgreSQL, the API, and the frontend. The backend applies Alembic
migrations before starting. A root `.env` file is optional; defaults are provided by
`docker-compose.yml`. The root `.env.example` lists Compose settings.

- Frontend: <http://localhost:3000>
- API documentation: <http://localhost:8000/docs>
- API health check: <http://localhost:8000/health>

Stop the stack with **Ctrl+C** or `docker compose down`. To also delete the local
database volume, run `docker compose down -v`; this permanently removes its data.

The Compose defaults are for local development, not production. Set a strong
`JWT_SECRET_KEY` and database password before using a deployed environment.

For Vite development outside Docker, copy
[`frontend/.env.example`](frontend/.env.example) to `frontend/.env.local` and set
`VITE_API_URL` to the URL of the backend you are running.

## API checks with Postman

Start the Docker stack, import
[`postman/pm-platform.postman_collection.json`](postman/pm-platform.postman_collection.json)
into Postman, then run the collection with the Collection Runner. Requests share
collection variables and should be run in order. The collection defaults to
`http://localhost:8000` and checks API responses, including authorization cases.

## CI

GitHub Actions runs [`.github/workflows/ci.yml`](.github/workflows/ci.yml) on pushes to
`main`, pull requests, or manual dispatch. It runs backend linting, migrations and
tests; frontend linting, tests and build; then builds and smoke-tests the Docker stack.
Coverage is uploaded as a workflow artifact.

CI is verification only: it does not deploy the app or provide a public domain. Its
`localhost` URLs are inside the temporary GitHub Actions runner.

## Project layout

```text
backend/
  app/
    api/routers/       # auth, dashboard, health, projects, tasks
    core/              # settings, security, exceptions, logging
    models/            # SQLAlchemy models
    policies/          # authorization policies
    repositories/      # database access
    schemas/           # API request and response schemas
    services/          # application and audit services
  alembic/             # database migrations
  tests/               # unit and API tests
  Dockerfile
frontend/
  src/
    auth/              # authentication context
    components/        # layout, route guards, reusable UI
    lib/               # API client and frontend types
    pages/             # dashboard, login, registration, projects, tasks
    test/              # frontend tests
  Dockerfile
  nginx.conf
postman/pm-platform.postman_collection.json
.github/workflows/ci.yml
docker-compose.yml
```

## Checks run by CI

Backend commands (from `backend/`, with PostgreSQL available):

```cmd
ruff check .
ruff format --check .
alembic upgrade head
alembic check
pytest --cov=app --cov-report=term-missing --cov-report=xml
```

Frontend commands (from `frontend/`):

```cmd
npm ci
npm run lint
npm test
npm run build
```
