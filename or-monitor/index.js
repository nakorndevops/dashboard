const path = require('node:path');
const https = require('node:https');
const fs = require('node:fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const verifyToken = require('./module/continueIfLogin.js');
const mysql = require('mysql2/promise');

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