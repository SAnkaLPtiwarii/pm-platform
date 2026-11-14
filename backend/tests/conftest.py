import os

# Force the TEST database before the app is imported, so tests can never touch dev data.
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://pm_user:change_me@localhost:5434/pm_test",
)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-not-for-production")
