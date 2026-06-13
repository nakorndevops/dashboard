import * as fs from "fs";
import * as https from "https";
import crypto from 'node:crypto';
import express from "express";
import mysql from "mysql2/promise";

import { verifyAPIkey } from './module/verifyApiKey.js';

// Read .env
const port = process.env.PORT || 3006;
const mysql_host = process.env.MYSQL_HOST;
const mysql_user = process.env.MYSQL_USER;
const mysql_password = process.env.MYSQL_PASSWORD;
const mysql_database = process.env.MYSQL_DATABASE;
const char_set = process.env.CHAR_SET;

const app = express();
app.use(express.json());

// Create the connection pool. The pool-specific settings are the defaults
const pool = mysql.createPool({
  host: mysql_host,
  user: mysql_user,
  database: mysql_database,
  password: mysql_password,
  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 10, // max idle connections, the default value is the same as `connectionLimit`
  idleTimeout: 60000, // idle connections timeout, in milliseconds, the default value 60000
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  charset: char_set, // Set the character set here
});

// หาคนไข้ตาม ward
app.post("/ward", verifyAPIkey, async (request, response) => {

  try {

    const license = request.body.license;

    if (!license) {

      return response.status(400).json({ error: "License number is required" });

    }

    const myQuery = `
        SELECT
            w.name AS ward_name    
        FROM
            an_stat AS ast
        INNER JOIN
            doctor AS d ON ast.dx_doctor = d.code
        INNER JOIN
            ward AS w ON ast.ward = w.ward
        WHERE
            d.licenseno  = ?
            AND ast.dchdate IS NULL
        GROUP BY ward_name      
    `;

    const [rows] = await pool.query(myQuery, [license]);

    if (rows.length === 0) {
      return response.status(404).json({ error: "No patient founded" });
    }

    const ward = rows.map(row => row.ward_name);

    response.status(200).json(ward);

  } catch (err) {

    console.error(err);

    response.status(500).json({ error: "Error executing query" });

  }

});

// Ward List
app.post("/wardList", verifyAPIkey, async (request, response) => {

  try {

    const myQuery = `select ward,name,shortname from ward where ward_active = 'Y' order by ward`;

    const [rows] = await pool.query(myQuery);

    if (rows.length === 0) {
      return response.status(404).json({ error: "No wards found" });
    }

    response.status(200).json(rows);

  } catch (err) {

    console.error(err);

    response.status(500).json({ error: "Error executing query" });

  }

});

// Meal List
app.post("/mealList", verifyAPIkey, async (request, response) => {

  try {

    const myQuery = `SELECT meal, name FROM meal`;

    const [rows] = await pool.query(myQuery);

    if (rows.length === 0) {
      return response.status(404).json({ error: "No meals found" });
    }

    response.status(200).json(rows);

  } catch (err) {

    console.error(err);

    response.status(500).json({ error: "Error executing query" });

  }

});

// Nutrition type List
app.post("/nutritionTypeList", verifyAPIkey, async (request, response) => {

  try {

    const myQuery = `SELECT \`code\`, \`name\` FROM nutrition_type`;

    const [rows] = await pool.query(myQuery);

    if (rows.length === 0) {
      return response.status(404).json({ error: "No nutrition type found" });
    }

    response.status(200).json(rows);

  } catch (err) {

    console.error(err);

    response.status(500).json({ error: "Error executing query" });

  }

});

// Authen
app.post("/authenPassword", verifyAPIkey, async (request, response) => {

  try {

    const username = request.body.username;

    const password = request.body.password;

    if (!username || !password) {
      return response.status(400).json({ error: "Username and password are required" });
    }

    const myQuery = `
      SELECT
        officer.officer_doctor_code as 'code',
        doctor.fname,
        doctor.lname,
        doctor.licenseno,
        doctor_position.name as 'position',
        doctor.position_id,
        officer.officer_login_password_md5,
        opduser.passweb
      FROM
        officer
        INNER JOIN doctor ON officer.officer_doctor_code = doctor.code
        INNER JOIN doctor_position ON doctor_position.id = doctor.position_id
        INNER JOIN opduser ON opduser.doctorcode = doctor.code
      WHERE
        officer.officer_login_name = ?
        AND doctor.active = 'Y';
    `;

    const [rows] = await pool.query(myQuery, [username]);

    if (rows.length === 0) {
      return response.status(401).json({ error: "Invalid username or password or inactive account" });
    }

    const user = rows[0];

    const verifiedResultOfficer = verifyMD5(password, user.officer_login_password_md5);
    if (verifiedResultOfficer) {
      delete user.officer_login_password_md5;
      delete user.passweb;
      return response.status(200).json(user);
    }

    const verifiedResultOpduser = verifyMD5(password, user.passweb);
    if (verifiedResultOpduser) {
      delete user.officer_login_password_md5;
      delete user.passweb;
      return response.status(200).json(user);
    }

    response.status(401).json({ error: "Invalid username or password" });

  } catch (err) {

    console.error(err);

    response.status(500).json({ error: "Error executing query" });

  }

});

// Authen ProviderID
app.post("/authenProviderID", verifyAPIkey, async (request, response) => {
  const profile = request.body;

  const license_id = profile.license_id;
  const firstname_th = profile.firstname_th;
  const lastname_th = profile.lastname_th;
  const hash_cid = profile.hash_cid;

  let queryVariable;
  let queryVariable2;
  let myQuery;
  if (license_id) {
    queryVariable = '_' + license_id;
    myQuery = `
      SELECT
        officer.officer_doctor_code as 'code',
        doctor.fname,
        doctor.lname,
        doctor.licenseno,
        doctor_position.name as 'position',
        doctor.position_id
      FROM
        officer
        INNER JOIN doctor ON officer.officer_doctor_code = doctor.code
        INNER JOIN doctor_position ON doctor_position.id = doctor.position_id
        INNER JOIN opduser ON opduser.doctorcode = doctor.code
      WHERE
        doctor.licenseno LIKE ?
        AND doctor.active = 'Y';
    `;
  } else {
    queryVariable = firstname_th;
    queryVariable2 = lastname_th;
    myQuery = `
      SELECT
        officer.officer_doctor_code as 'code',
        doctor.fname,
        doctor.lname,
        doctor.licenseno,
        doctor_position.name as 'position',
        doctor.position_id
      FROM
        officer
        INNER JOIN doctor ON officer.officer_doctor_code = doctor.code
        INNER JOIN doctor_position ON doctor_position.id = doctor.position_id
        INNER JOIN opduser ON opduser.doctorcode = doctor.code
      WHERE
        doctor.fname = ?
        AND doctor.lname = ?
        AND doctor.active = 'Y';
    `;
  }

  try {

    const [rows] = await pool.query(myQuery, [queryVariable, queryVariable2]);

    if (rows.length === 0) {
      return response.status(404).json({ error: "No users found" });
    }

    const user = rows[0];

    if (license_id) {
      return response.status(200).json(user);
    }

    // If user do not have license_id verify hash_cid instead
    const cid = user.licenseno.slice(1);
    const verifyResult = verifyStringHash(cid, hash_cid);
    if (!verifyResult) {
      return response.status(401).json({ error: "Incorrect citizen ID" });
    }

    response.status(200).json(user);

  } catch (err) {

    console.error(err);

    response.status(500).json({ error: "Error executing query" });

  }

});

// Food
app.post("/food", verifyAPIkey, async (request, response) => {

  try {

    const meal = request.body.meal;
    const ward = request.body.ward;
    if (!meal || !ward) {
      return response.status(400).json({ error: "In complete variable" });
    }

    let myQuery = `
    SELECT
      ipt.hn AS \`HN\`,
      patient.fname AS \`ชื่อ\`,
      patient.lname AS \`สกุล\`,
      ipt.ward as \`Ward\`, 
      iptadm.bedno AS \`เตียง\`,
      TIMESTAMPDIFF(YEAR, patient.birthday, CURDATE()) AS \`Age (years)\`,
      TIMESTAMPDIFF(MONTH, patient.birthday, CURDATE()) % 12 AS \`Age (months)\`,
      TIMESTAMPDIFF(
        DAY,
        DATE_ADD(patient.birthday, INTERVAL TIMESTAMPDIFF(MONTH, patient.birthday, CURDATE()) MONTH),
        CURDATE()
      ) AS \`Age (days)\`,
      patient.sex as \`sex\`,
      religion.\`name\` AS \`ศาสนา\`,
      religion.religion AS \`religion_code\`,
      opdscreen.bw AS \`น้ำหนัก\`,
      opdscreen.height AS \`ส่วนสูง\`,
      opdscreen.bps AS \`systolic BP\`,
      opdscreen.bpd AS \`diastolic BP\`,
      nutrition_type.\`name\` AS \`Type\`,
      nutrition_type.\`code\` AS \`type_code\`,      
      nutrition_items.\`name\` AS \`Item\`,
      nutrition_items.nutrition_items_id AS \`items_id\`,
      ipt_food_menu.qty AS \`จำนวน\`,
      ipt_food_menu.\`comment\`,
      -- Blood Sugar Date (Code 3)
      (
        SELECT
          lh.order_date
        FROM
          lab_head lh
          INNER JOIN lab_order lo ON lo.lab_order_number = lh.lab_order_number
        WHERE
          lh.hn = ipt.hn
          AND lo.lab_items_code = 3
          AND lo.lab_order_result IS NOT NULL
        ORDER BY
          lh.order_date DESC,
          lh.lab_order_number DESC
          LIMIT 1
      ) AS \`Blood Sugar Date\`,
      -- Blood Sugar Result (Code 3)
      (
        SELECT
          lo.lab_order_result
        FROM
          lab_head lh
          INNER JOIN lab_order lo ON lo.lab_order_number = lh.lab_order_number
        WHERE
          lh.hn = ipt.hn
          AND lo.lab_items_code = 3
          AND lo.lab_order_result IS NOT NULL
        ORDER BY
          lh.order_date DESC,
          lh.lab_order_number DESC
          LIMIT 1
      ) AS \`Blood Sugar Result\`,
      -- HbA1c Date (Code 45)
      (
        SELECT
          lh.order_date
        FROM
          lab_head lh
          INNER JOIN lab_order lo ON lo.lab_order_number = lh.lab_order_number
        WHERE
          lh.hn = ipt.hn
          AND lo.lab_items_code = 45
          AND lo.lab_order_result IS NOT NULL
        ORDER BY
          lh.order_date DESC,
          lh.lab_order_number DESC
          LIMIT 1
      ) AS \`HbA1c Date\`,
      -- HbA1c Result (Code 45)
      (
        SELECT
          lo.lab_order_result
        FROM
          lab_head lh
          INNER JOIN lab_order lo ON lo.lab_order_number = lh.lab_order_number
        WHERE
          lh.hn = ipt.hn
          AND lo.lab_items_code = 45
          AND lo.lab_order_result IS NOT NULL
        ORDER BY
          lh.order_date DESC,
          lh.lab_order_number DESC
          LIMIT 1
      ) AS \`HbA1c Result\`,
      -- Creatinine Date (Code 6)
      (
        SELECT
          lh.order_date
        FROM
          lab_head lh
          INNER JOIN lab_order lo ON lo.lab_order_number = lh.lab_order_number
        WHERE
          lh.hn = ipt.hn
          AND lo.lab_items_code = 6
          AND lo.lab_order_result IS NOT NULL
        ORDER BY
          lh.order_date DESC,
          lh.lab_order_number DESC
          LIMIT 1
      ) AS \`Creatinine Date\`,
      -- Creatinine Result (Code 6)
      (
        SELECT
          lo.lab_order_result
        FROM
          lab_head lh
          INNER JOIN lab_order lo ON lo.lab_order_number = lh.lab_order_number
        WHERE
          lh.hn = ipt.hn
          AND lo.lab_items_code = 6
          AND lo.lab_order_result IS NOT NULL
        ORDER BY
          lh.order_date DESC,
          lh.lab_order_number DESC
          LIMIT 1
      ) AS \`Creatinine Result\`,
      -- Na Date (Code 12)
      (
        SELECT
          lh.order_date
        FROM
          lab_head lh
          INNER JOIN lab_order lo ON lo.lab_order_number = lh.lab_order_number
        WHERE
          lh.hn = ipt.hn
          AND lo.lab_items_code = 12
          AND lo.lab_order_result IS NOT NULL
        ORDER BY
          lh.order_date DESC,
          lh.lab_order_number DESC
          LIMIT 1
      ) AS \`Na Date\`,
      -- Na Result (Code 12)
      (
        SELECT
          lo.lab_order_result
        FROM
          lab_head lh
          INNER JOIN lab_order lo ON lo.lab_order_number = lh.lab_order_number
        WHERE
          lh.hn = ipt.hn
          AND lo.lab_items_code = 12
          AND lo.lab_order_result IS NOT NULL
        ORDER BY
          lh.order_date DESC,
          lh.lab_order_number DESC
          LIMIT 1
      ) AS \`Na Result\`,
      -- K Date (Code 13)
      (
        SELECT
          lh.order_date
        FROM
          lab_head lh
          INNER JOIN lab_order lo ON lo.lab_order_number = lh.lab_order_number
        WHERE
          lh.hn = ipt.hn
          AND lo.lab_items_code = 13
          AND lo.lab_order_result IS NOT NULL
        ORDER BY
          lh.order_date DESC,
          lh.lab_order_number DESC
          LIMIT 1
      ) AS \`K Date\`,
      -- K Result (Code 13)
      (
        SELECT
          lo.lab_order_result
        FROM
          lab_head lh
          INNER JOIN lab_order lo ON lo.lab_order_number = lh.lab_order_number
        WHERE
          lh.hn = ipt.hn
          AND lo.lab_items_code = 13
          AND lo.lab_order_result IS NOT NULL
        ORDER BY
          lh.order_date DESC,
          lh.lab_order_number DESC
          LIMIT 1
      ) AS \`K Result\`,
      -- PO4 Date (Code 38)
      (
        SELECT
          lh.order_date
        FROM
          lab_head lh
          INNER JOIN lab_order lo ON lo.lab_order_number = lh.lab_order_number
        WHERE
          lh.hn = ipt.hn
          AND lo.lab_items_code = 38
          AND lo.lab_order_result IS NOT NULL
        ORDER BY
          lh.order_date DESC,
          lh.lab_order_number DESC
          LIMIT 1
      ) AS \`PO4 Date\`,
      -- PO4 Result (Code 38)
      (
        SELECT
          lo.lab_order_result
        FROM
          lab_head lh
          INNER JOIN lab_order lo ON lo.lab_order_number = lh.lab_order_number
        WHERE
          lh.hn = ipt.hn
          AND lo.lab_items_code = 38
          AND lo.lab_order_result IS NOT NULL
        ORDER BY
          lh.order_date DESC,
          lh.lab_order_number DESC
          LIMIT 1
      ) AS \`PO4 Result\`,
      -- TG Date (Code 9)
      (
        SELECT
          lh.order_date
        FROM
          lab_head lh
          INNER JOIN lab_order lo ON lo.lab_order_number = lh.lab_order_number
        WHERE
          lh.hn = ipt.hn
          AND lo.lab_items_code = 9
          AND lo.lab_order_result IS NOT NULL
        ORDER BY
          lh.order_date DESC,
          lh.lab_order_number DESC
          LIMIT 1
      ) AS \`TG Date\`,
      -- TG Result (Code 9)
      (
        SELECT
          lo.lab_order_result
        FROM
          lab_head lh
          INNER JOIN lab_order lo ON lo.lab_order_number = lh.lab_order_number
        WHERE
          lh.hn = ipt.hn
          AND lo.lab_items_code = 9
          AND lo.lab_order_result IS NOT NULL
        ORDER BY
          lh.order_date DESC,
          lh.lab_order_number DESC
          LIMIT 1
      ) AS \`TG Result\`,
      -- LDL Date (Code 11)
      (
        SELECT
          lh.order_date
        FROM
          lab_head lh
          INNER JOIN lab_order lo ON lo.lab_order_number = lh.lab_order_number
        WHERE
          lh.hn = ipt.hn
          AND lo.lab_items_code = 11
          AND lo.lab_order_result IS NOT NULL
        ORDER BY
          lh.order_date DESC,
          lh.lab_order_number DESC
          LIMIT 1
      ) AS \`LDL Date\`,
      -- LDL Result (Code 11)
      (
        SELECT
          lo.lab_order_result
        FROM
          lab_head lh
          INNER JOIN lab_order lo ON lo.lab_order_number = lh.lab_order_number
        WHERE
          lh.hn = ipt.hn
          AND lo.lab_items_code = 11
          AND lo.lab_order_result IS NOT NULL
        ORDER BY
          lh.order_date DESC,
          lh.lab_order_number DESC
          LIMIT 1
      ) AS \`LDL Result\`,
      -- AST Date (Code 23)
      (
        SELECT
          lh.order_date
        FROM
          lab_head lh
          INNER JOIN lab_order lo ON lo.lab_order_number = lh.lab_order_number
        WHERE
          lh.hn = ipt.hn
          AND lo.lab_items_code = 23
          AND lo.lab_order_result IS NOT NULL
        ORDER BY
          lh.order_date DESC,
          lh.lab_order_number DESC
          LIMIT 1
      ) AS \`AST Date\`,
      -- AST Result (Code 23)
      (
        SELECT
          lo.lab_order_result
        FROM
          lab_head lh
          INNER JOIN lab_order lo ON lo.lab_order_number = lh.lab_order_number
        WHERE
          lh.hn = ipt.hn
          AND lo.lab_items_code = 23
          AND lo.lab_order_result IS NOT NULL
        ORDER BY
          lh.order_date DESC,
          lh.lab_order_number DESC
          LIMIT 1
      ) AS \`AST Result\`,
      -- ALT Date (Code 24)
      (
        SELECT
          lh.order_date
        FROM
          lab_head lh
          INNER JOIN lab_order lo ON lo.lab_order_number = lh.lab_order_number
        WHERE
          lh.hn = ipt.hn
          AND lo.lab_items_code = 24
          AND lo.lab_order_result IS NOT NULL
        ORDER BY
          lh.order_date DESC,
          lh.lab_order_number DESC
          LIMIT 1
      ) AS \`ALT Date\`,
      -- ALT Result (Code 24)
      (
        SELECT
          lo.lab_order_result
        FROM
          lab_head lh
          INNER JOIN lab_order lo ON lo.lab_order_number = lh.lab_order_number
        WHERE
          lh.hn = ipt.hn
          AND lo.lab_items_code = 24
          AND lo.lab_order_result IS NOT NULL
        ORDER BY
          lh.order_date DESC,
          lh.lab_order_number DESC
          LIMIT 1
      ) AS \`ALT Result\`
    FROM
      \`ipt_food_menu\`
      INNER JOIN nutrition_items ON ipt_food_menu.nutrition_items_id = nutrition_items.nutrition_items_id
      INNER JOIN ipt ON ipt.an = ipt_food_menu.an
      INNER JOIN ward ON ipt.ward = ward.ward
      INNER JOIN iptadm ON iptadm.an = ipt_food_menu.an
      INNER JOIN nutrition_type ON nutrition_type.\`code\` = nutrition_items.nutrition_type
      INNER JOIN meal ON ipt_food_menu.meal = meal.meal
      INNER JOIN food_date ON food_date.date_id = ipt_food_menu.date_id
      INNER JOIN patient ON ipt.hn = patient.hn
      INNER JOIN religion ON religion.religion = patient.religion
      INNER JOIN opdscreen ON opdscreen.vn = ipt.vn
    WHERE
      ipt_food_menu.date_id = WEEKDAY(CURDATE()) + 1
      AND ipt.dchdate IS NULL
      AND ipt_food_menu.meal = ?      
    `;

    const condition_all = `
    ORDER BY
      ipt.ward,
      religion.religion,
      nutrition_type.\`code\`,
      nutrition_items.nutrition_items_id,
      iptadm.bedno;
    `;

    const condition_ward = `
      AND ipt.ward = ?
    ORDER BY
      religion.religion,
      nutrition_type.\`code\`,
      nutrition_items.nutrition_items_id,    
      iptadm.bedno;
    `;

    if (ward == "XX") {
      myQuery = myQuery + condition_all;
    } else {
      myQuery = myQuery + condition_ward;
    }

    const [rows] = await pool.query(myQuery, [meal, ward]);

    if (rows.length === 0) {
      return response.status(404).json({ error: "No food list" });
    }

    response.status(200).json(rows);

  } catch (err) {

    console.error(err);

    response.status(500).json({ error: "Error executing query" });

  }

});

function verifyMD5(plainPassword, knownHash) {
  // Generate MD5 hash of the plainPassword
  const generatedHash = crypto.createHash('md5').update(plainPassword).digest('hex');

  // Compare with the known hash
  return ((generatedHash === knownHash) || (generatedHash === knownHash.toLowerCase()) || (generatedHash === knownHash.toUpperCase()));
}

function verifyStringHash(plainText, expectedHash) {
  // 1. Generate the SHA-256 hash from the input data
  const generatedHash = crypto
    .createHash('sha256')
    .update(plainText)
    .digest('hex'); // Returns a 64-character hex string

  // 2. Convert both hashes to buffers for a secure comparison
  const bufferA = Buffer.from(generatedHash, 'hex');
  const bufferB = Buffer.from(expectedHash, 'hex');

  // 3. Mitigate timing attacks by comparing lengths and using timingSafeEqual
  if (bufferA.length !== bufferB.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufferA, bufferB);
}

// Server
const options = {
  key: fs.readFileSync('./ssl/hosxp-api.key', 'utf8'),
  cert: fs.readFileSync('./ssl/hosxp-api.crt', 'utf8'),
};

const server = https.createServer(options, app);

server.listen(port, () => {
  console.log(`App listening on PORT: ${port}`);
});