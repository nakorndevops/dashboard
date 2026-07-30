import path from 'node:path';
import https from 'node:https';
import fs from 'node:fs';
import express from 'express';
import cookieParser from 'cookie-parser';
import mysql from 'mysql2/promise';
import { fileURLToPath } from 'node:url';

// 1. Import local modules
import verifyToken from './module/continueIfLogin.js';
import { getSecret } from './module/getSecret.js';

// 2. Recreate __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 3. Get Docker secret
const monitorDBPassword = getSecret('/run/secrets/or-monitor-db-password', 'Monitor DB password');

// 4. Get environment variables
const port = process.env.PORT || 3006;
const hosxpApiUrl = process.env.HOSXP_API_URL;

// 5. Middleware Setup
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/image', express.static(path.join(__dirname, 'image')));
app.use('/style', express.static(path.join(__dirname, 'style')));

// 6. MySQL Connection Pool
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
  res.sendFile(path.join(__dirname, '/html/monitor.html'));
});

app.get('/manual', (req, res) => {
    res.sendFile(path.join(__dirname, '/image/manual.png'));
});

app.post('/statusList', verifyToken, async (req, res) => {
  try {
    const myQuery = `select status_id, status_description from status_code;`;
    const [rows] = await orMonitorDb.query(myQuery);

    if (rows.length === 0) {
      return res.status(404).json({ error: "No status found" });
    }
    res.status(200).json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post('/patientList', verifyToken, async (req, res) => {
  try {
    const myQuery = `SELECT hn, fname, lname, status_id FROM operation_status;`;
    const [rows] = await orMonitorDb.query(myQuery);
    res.status(200).json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// --- SERVER INITIALIZATION ---

const options = {
  key: fs.readFileSync(path.join(__dirname, "ssl", "or-monitor.key")),
  cert: fs.readFileSync(path.join(__dirname, "ssl", "or-monitor.crt")),
};

https.createServer(options, app).listen(port, () => {
  console.log(`App listening on PORT: ${port}`);
});