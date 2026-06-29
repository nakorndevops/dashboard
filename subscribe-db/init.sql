-- 1. Create Database
CREATE DATABASE IF NOT EXISTS subscribe_db 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE subscribe_db;

-- 2. Create Table
CREATE TABLE IF NOT EXISTS registerList (
    hn VARCHAR(9) NOT NULL,              
    subscribe_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (hn)
);