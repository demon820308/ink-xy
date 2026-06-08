-- Drop tables if they exist
DROP TABLE IF EXISTS devices;
DROP TABLE IF EXISTS licenses;

-- Create licenses table
CREATE TABLE licenses (
  key TEXT PRIMARY KEY,
  expires_at TEXT,               -- NULL initially (means not yet activated)
  validity_days INTEGER NOT NULL, -- Validity duration in days starting from first activation
  max_devices INTEGER NOT NULL,
  is_active INTEGER DEFAULT 1    -- 1 = Active, 0 = Blocked/Deactivated
);

-- Create devices table
CREATE TABLE devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,
  machine_uuid TEXT NOT NULL,
  activated_at TEXT NOT NULL,
  FOREIGN KEY (key) REFERENCES licenses(key),
  UNIQUE(key, machine_uuid)      -- Prevent duplicate device activation records
);

-- Insert test licenses (relative to local time around 2026/2027)
-- 1. Unactivated Key: 30 days validity, 2 devices limit
INSERT INTO licenses (key, expires_at, validity_days, max_devices, is_active)
VALUES ('KEY-TEST-UNACTIVATED', NULL, 30, 2, 1);

-- 2. Already Activated Key: 2 devices limit, expires Dec 31, 2027
INSERT INTO licenses (key, expires_at, validity_days, max_devices, is_active)
VALUES ('KEY-TEST-ACTIVE-2DEV', '2027-12-31T23:59:59Z', 30, 2, 1);

-- 3. Already Activated Device bound to KEY-TEST-ACTIVE-2DEV
INSERT INTO devices (key, machine_uuid, activated_at)
VALUES ('KEY-TEST-ACTIVE-2DEV', 'UUID-test-comp1', '2026-06-08T00:00:00Z');

-- 4. Expired Key: expired in 2025
INSERT INTO licenses (key, expires_at, validity_days, max_devices, is_active)
VALUES ('KEY-TEST-EXPIRED', '2025-01-01T00:00:00Z', 30, 2, 1);

-- 5. Blocked/Disabled Key
INSERT INTO licenses (key, expires_at, validity_days, max_devices, is_active)
VALUES ('KEY-TEST-BLOCKED', NULL, 365, 3, 0);
