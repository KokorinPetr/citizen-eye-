-- Runs once, on first container start. Creates a separate database for pytest.
CREATE DATABASE civic_eye_test;
\c civic_eye_test
CREATE EXTENSION IF NOT EXISTS postgis;
