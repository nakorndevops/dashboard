const path = require('node:path');
const https = require('node:https');
const fs = require('node:fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const verifyToken = require('./module/continueIfLogin.js');
const mysql = require('mysql2/promise');

// Secret
const clientSecret = fs.readFileSync('./jwt/client-secret.jwt', 'utf8');

// Helper function to read secrets securely
function getSecret(filePath, secretName) {
  try {
    const secret = fs.readFileSync(filePath, 'utf8').trim();
    if (!secret) throw new Error("File is empty");
    console.log(`Successfully read ${secretName} from secret.`);
    return secret;
  } catch (err) {
    console.error(`CRITICAL: Failed to read ${secretName}:`, err.message);
    process.exit(1);
  }
}

// Get Monitor DB password from Docker secret
const monitorDBPassword = getSecret('/run/secrets/or-monitor-db-password', 'Monitor DB password');

const app = express();
const port = process.env.PORT || 3006;
const hosxpApiUrl = process.env.HOSXP_API_URL;

// Middleware Setup
app.use(express.json());
app.use(cookieParser());
app.use('/image', express.static(path.join(__dirname, 'image')));
app.use('/style', express.static(path.join(__dirname, 'style')));

// MysQL Connection Pool
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