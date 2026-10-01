// Unit/integration tests use the dedicated test database (never your real data).
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/command_center_test";
process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-123456";
process.env.ENCRYPTION_KEY ??= "test-encryption-key-test-encryption-key";
process.env.STORAGE_DIR = "./storage-test";
process.env.ALLOW_SIGNUP = "true";
process.env.ALLOW_PRIVATE_URLS = "false";
