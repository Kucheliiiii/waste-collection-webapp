USE awc_new;

-- Disable FK checks so we can truncate in any order
SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE activity_logs;
TRUNCATE TABLE pickup_assignments;
TRUNCATE TABLE pickup_requests;
TRUNCATE TABLE collector_profiles;
TRUNCATE TABLE trucks;
TRUNCATE TABLE users;
TRUNCATE TABLE zones;

SET FOREIGN_KEY_CHECKS = 1;

-- ── Zones (1 zone is enough for all 3 users) ──────────────────────────────────
INSERT INTO zones (zone_name, latitude, longitude) VALUES
('Wuse II', 9.076500, 7.398600);

-- ── Users: 1 resident · 1 collector · 1 admin ─────────────────────────────────
-- Passwords: resident & collector = "password123" | admin = "admin123"
INSERT INTO users (full_name, email, phone, password_hash, role, address_line, zone_id) VALUES
('Amina Bello',    'amina.bello@gmail.com',         '+2348031124466', '$2b$10$NQu5qdp9TTK8dp/uPeOkTuoK6fZ8NPNnIC9QBm7GmohQbm1iZ8LZO', 'resident',  '18 Aminu Kano Crescent, Wuse II, Abuja', 1),
('Femi Owolabi',   'femi.owolabi@awc.ng',           '+2348162348891', '$2b$10$s6Qnx8GR882Bwl3.B7zOUurvdmSLM7FLwNudZfugNJj0X5nKtCG/i', 'collector', '12 Adetokunbo Ademola Crescent, Wuse II, Abuja', 1),
('Ngozi Afolayan', 'ngozi.afolayan@awc.gov.ng',     '+2348037719001', '$2b$10$yXWqjqycbFBpf9cpKU8kPe.P1rwB6N/kN4WLE2Iy6IqP1Twl1gGaG', 'super_admin', 'AWC Secretariat, Area 11, Abuja', 1);

-- ── Truck (required for assignment) ───────────────────────────────────────────
INSERT INTO trucks (truck_code, plate_number, model_name, capacity_kg, current_zone_id, truck_status) VALUES
('TRK-W2-01', 'ABJ-521KD', 'Iveco Eurocargo', 4500, 1, 'available');

-- ── Collector profile ──────────────────────────────────────────────────────────
INSERT INTO collector_profiles (user_id, employee_code, home_zone_id, current_zone_id, availability_status, total_assigned, total_completed, average_rating) VALUES
((SELECT id FROM users WHERE email = 'femi.owolabi@awc.ng'), 'COL-ABJ-1001', 1, 1, 'available', 0, 0, 0.00);

-- ── Pickup request (1 pending request from the resident) ──────────────────────
INSERT INTO pickup_requests (request_code, resident_user_id, zone_id, pickup_address, waste_type, estimated_weight_kg, preferred_pickup_date, notes, request_status, requested_at) VALUES
('REQ-2026-0001',
  (SELECT id FROM users WHERE email = 'amina.bello@gmail.com'),
  1,
  '18 Aminu Kano Crescent, Wuse II, Abuja',
  'household',
  32.50,
  '2026-05-15',
  'Black bags by front gate.',
  'pending',
  NOW());

-- ── Activity log ──────────────────────────────────────────────────────────────
INSERT INTO activity_logs (actor_user_id, request_id, assignment_id, activity_type, details, ip_address) VALUES
((SELECT id FROM users WHERE email = 'amina.bello@gmail.com'),
 (SELECT id FROM pickup_requests WHERE request_code = 'REQ-2026-0001'),
 NULL,
 'request_created',
 'Resident submitted pickup request REQ-2026-0001.',
 '127.0.0.1');
