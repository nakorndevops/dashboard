import path from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import fs from 'node:fs';
import express from 'express';
import cookieParser from 'cookie-parser';
import mysql from 'mysql2/promise';

// 1. Import local modules
import verifyToken from './module/continueIfLogin.js';
import { getSecret } from './module/getSecret.js';

// 2. Recreate __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 3. Get Client Secret
const clientSecret = fs.readFileSync('./jwt/client-secret.jwt', 'utf8');

// 4. Get Docker secret
const monitorDBPassword = getSecret('/run/secrets/or-monitor-db-password', 'Monitor DB password');

// 5. Get environment variables
const port = process.env.PORT || 3006;
const hosxpApiUrl = process.env.HOSXP_API_URL;

// 6. Middleware Setup
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/image', express.static(path.join(__dirname, 'image')));
app.use('/style', express.static(path.join(__dirname, 'style')));

// 7. MySQL Connection Pool
const orMonitorDb = mysql.createPool({
  host: process.env.MONITOR_DB_HOST,
  user: process.env.MONITOR_DB_USER,
  database: process.env.MONITOR_DB_NAME,
  password: monitorDBPassword,
  charset: 'utf8mb4',
  connectionLimit: 10
});

// --- ROUTES ---

// Protected Route (Requires valid tokens)
app.get('/', verifyToken, (req, res) => {
  res.sendFile(path.join(__dirname, '/html/checkpoint.html'));
});

app.post('/getPatientProfile', verifyToken, async (req, res) => {
  const { hn } = req.body;

  try {
    const getProfile = await fetch(hosxpApiUrl + '/getPatientOperationData', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${clientSecret}`,
      },
      body: JSON.stringify({ hn }),
    });

    const profile = await getProfile.json();

    res.status(getProfile.status).json(profile);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post('/getPatientStatus', verifyToken, async (req, res) => {
  const { operation_id } = req.body;

  try {
    const myQuery = `SELECT status_id FROM operation_status where operation_id = ?;`;
    const [rows] = await orMonitorDb.query(myQuery, [operation_id]);

    res.status(200).json(rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post('/setPatientStatus', verifyToken, async (req, res) => {
  const { operation_id, hn, fname, lname, status_id, room_id } = req.body;

  try {
    const myQuery = `
      INSERT INTO operation_status (operation_id, hn, fname, lname, status_id, room_id)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
      status_id = ?;
    `;

    const [rows] = await orMonitorDb.query(myQuery, [operation_id, hn, fname, lname, status_id, room_id, status_id]);

    res.status(200).json({ message: "Data updated successfully." });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// --- SERVER INITIALIZATION ---

const options = {
  key: fs.readFileSync(path.join(__dirname, "ssl", "or-checkpoint.key")),
  cert: fs.readFileSync(path.join(__dirname, "ssl", "or-checkpoint.crt")),
};

https.createServer(options, app).listen(port, () => {
  console.log(`App listening on PORT: ${port}`);
});