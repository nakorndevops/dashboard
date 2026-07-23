-- 1. Create Database
CREATE DATABASE IF NOT EXISTS or_monitor_db
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE or_monitor_db;

-- 2. Create Table
CREATE TABLE IF NOT EXISTS operation_status (
    operation_id INT UNSIGNED NOT NULL, 
    hn VARCHAR(20) NOT NULL,              -- Increased length for flexibility
    fname VARCHAR(100),
    lname VARCHAR(100),
    room_id INT UNSIGNED,
    status_id TINYINT UNSIGNED NOT NULL, -- TINYINT is sufficient for status codes
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Good for auditing when the row entered
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    PRIMARY KEY (operation_id),
    -- INDEXING: Crucial for the Event Scheduler to run quickly without scanning the whole table
    INDEX idx_cleanup (last_updated, status_id)
);

CREATE TABLE IF NOT EXISTS status_code (
    status_id TINYINT UNSIGNED NOT NULL PRIMARY KEY, 
    status_description VARCHAR(100) NOT NULL
);

INSERT IGNORE INTO status_code (status_id, status_description) VALUES 
(1, 'รอผ่าตัด'),
(2, 'กำลังผ่าตัด'),
(3, 'อยู่ห้องพักฟื้น'),
(4, 'กลับหอผู้ป่วย'),
(5, 'กลับบ้าน'),
(6, 'ยกเลิกการผ่าตัด');

-- 3. Enable Event Scheduler 
-- NOTE: This often requires SUPER privileges. If this fails, enable it in your server config file (my.cnf)
-- or via your cloud provider's console (e.g., AWS RDS Parameter Group).
SET GLOBAL event_scheduler = ON;

-- 4. Create the Cleanup Event
CREATE EVENT IF NOT EXISTS cleanup
ON SCHEDULE EVERY 1 HOUR
ON COMPLETION PRESERVE -- Keeps the event definition even if it's disabled temporarily
DO
  DELETE FROM operation_status
  WHERE 
    -- Logic 1: Remove "Finished/Discharged" patients (Status 4, 5, 6) after 2 hours
    (status_id IN (4, 5, 6) AND last_updated < (NOW() - INTERVAL 2 HOUR)) 
    -- Logic 2: Safety net - Remove ANY stale data older than 24 hours
    OR last_updated < (NOW() - INTERVAL 12 HOUR);