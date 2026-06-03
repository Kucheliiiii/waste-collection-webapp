CREATE DATABASE IF NOT EXISTS awc_new;
USE awc_new;

DROP TABLE IF EXISTS activity_logs;
DROP TABLE IF EXISTS pickup_assignments;
DROP TABLE IF EXISTS pickup_requests;
DROP TABLE IF EXISTS collector_profiles;
DROP TABLE IF EXISTS trucks;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS zones;

CREATE TABLE zones (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  zone_name VARCHAR(80) NOT NULL UNIQUE,
  latitude DECIMAL(9,6) NOT NULL,
  longitude DECIMAL(9,6) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  phone VARCHAR(25) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('resident', 'collector', 'admin', 'super_admin') NOT NULL,
  address_line VARCHAR(255) NULL,
  zone_id INT UNSIGNED NULL,
  account_status ENUM('active', 'suspended') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_zone FOREIGN KEY (zone_id) REFERENCES zones(id)
    ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE TABLE trucks (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  truck_code VARCHAR(30) NOT NULL UNIQUE,
  plate_number VARCHAR(20) NOT NULL UNIQUE,
  model_name VARCHAR(80) NOT NULL,
  capacity_kg INT UNSIGNED NOT NULL,
  average_speed_kmh DECIMAL(5,2) NOT NULL DEFAULT 28.00,
  current_zone_id INT UNSIGNED NOT NULL,
  truck_status ENUM('available', 'assigned', 'maintenance', 'inactive') NOT NULL DEFAULT 'available',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_trucks_zone FOREIGN KEY (current_zone_id) REFERENCES zones(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE collector_profiles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL UNIQUE,
  employee_code VARCHAR(30) NOT NULL UNIQUE,
  home_zone_id INT UNSIGNED NOT NULL,
  current_zone_id INT UNSIGNED NOT NULL,
  availability_status ENUM('available', 'busy', 'off_duty') NOT NULL DEFAULT 'available',
  total_assigned INT UNSIGNED NOT NULL DEFAULT 0,
  total_completed INT UNSIGNED NOT NULL DEFAULT 0,
  average_rating DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_collector_user FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_collector_home_zone FOREIGN KEY (home_zone_id) REFERENCES zones(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_collector_current_zone FOREIGN KEY (current_zone_id) REFERENCES zones(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE pickup_requests (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  request_code VARCHAR(30) NOT NULL UNIQUE,
  resident_user_id INT UNSIGNED NOT NULL,
  zone_id INT UNSIGNED NOT NULL,
  pickup_address VARCHAR(255) NOT NULL,
  pickup_latitude DECIMAL(9,6) NULL,
  pickup_longitude DECIMAL(9,6) NULL,
  waste_type ENUM('household', 'organic', 'recyclable', 'e_waste', 'bulk') NOT NULL,
  estimated_weight_kg DECIMAL(6,2) NULL,
  actual_weight_kg DECIMAL(6,2) NULL,
  charged_amount DECIMAL(10,2) NULL,
  charge_currency CHAR(3) NULL,
  preferred_pickup_date DATE NULL,
  notes TEXT NULL,
  request_status ENUM('pending', 'assigned', 'in_progress', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_requests_user FOREIGN KEY (resident_user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_requests_zone FOREIGN KEY (zone_id) REFERENCES zones(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE pickup_assignments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  request_id INT UNSIGNED NOT NULL,
  collector_user_id INT UNSIGNED NOT NULL,
  truck_id INT UNSIGNED NOT NULL,
  assigned_by_user_id INT UNSIGNED NULL,
  assignment_status ENUM('assigned', 'accepted', 'in_progress', 'completed', 'failed', 'cancelled') NOT NULL DEFAULT 'assigned',
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_assign_request FOREIGN KEY (request_id) REFERENCES pickup_requests(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_assign_collector_user FOREIGN KEY (collector_user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_assign_truck FOREIGN KEY (truck_id) REFERENCES trucks(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_assign_by_user FOREIGN KEY (assigned_by_user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  INDEX idx_assign_request (request_id),
  INDEX idx_assign_collector (collector_user_id),
  INDEX idx_assign_status (assignment_status)
);

CREATE TABLE activity_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_user_id INT UNSIGNED NULL,
  request_id INT UNSIGNED NULL,
  assignment_id INT UNSIGNED NULL,
  activity_type ENUM('registration', 'login', 'request_created', 'request_assigned', 'pickup_started', 'pickup_confirmed', 'status_update', 'collector_update', 'report_view') NOT NULL,
  details VARCHAR(255) NOT NULL,
  ip_address VARCHAR(45) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_logs_actor FOREIGN KEY (actor_user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_logs_request FOREIGN KEY (request_id) REFERENCES pickup_requests(id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_logs_assignment FOREIGN KEY (assignment_id) REFERENCES pickup_assignments(id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  INDEX idx_logs_created (created_at),
  INDEX idx_logs_type (activity_type)
);
