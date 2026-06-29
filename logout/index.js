const path = require('node:path');
const https = require('node:https');
const fs = require('node:fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { createClient } = require('redis');

const app = express();
app.use(cookieParser());
const port = process.env.PORT || 3006;

let redisPassword = '';
try {
    redisPassword = fs.readFileSync('/run/secrets/redis-token', 'utf8').trim();
} catch (err) {
    console.error("CRITICAL: Failed to read Redis password from secret:", err.message);
    process.exit(1); // Stop the app if it can't get the password
}
console.log(redisPassword ? "Successfully read Redis password from secret." : "Redis password is empty!");

const redisClient = createClient({ 
    pingInterval: 240000, // Pings the server every 4 minutes to keep the connection active
    socket: {
        host: 'redis-token', // This must match the container_name in docker-compose
        port: 6379,        
        keepAlive: 30000, // TCP keep-alive set to 30 seconds
        reconnectStrategy: (retries) => {
            // Optional: Customize how it reconnects
            console.log(`[REDIS] Reconnecting... Attempt: ${retries}`);
            return Math.min(retries * 50, 2000); // Backoff strategy
        }
    },
    password: redisPassword
});

redisClient.on('error', err => console.error('Redis Client Error', err));
redisClient.on('connect', () => console.log('Redis Client Connected'));
redisClient.on('reconnecting', () => console.log('Redis Client Reconnecting...'));

redisClient.connect().catch(console.error);

// Middleware Setup
app.use(express.json());
app.use('/image', express.static(path.join(__dirname, 'image')));
app.use('/style', express.static(path.join(__dirname, 'style')));

// --- ROUTES ---

app.get('/', async (req, res) => {
  const { refresh_token } = req.cookies;

  if (refresh_token) {
    try {
      const decoded = jwt.decode(refresh_token);
      if (decoded && decoded.family_id) {
        // Blacklist the whole family to log this specific device out immediately
        await redisClient.setEx(`family_blacklist:${decoded.family_id}`, 7 * 24 * 60 * 60, 'true');
      }
    } catch (error) {
      console.error('Error invalidating token family', error);
    }
  }

  res.clearCookie('access_token');
  res.clearCookie('refresh_token');
  res.clearCookie('profile');
  res.sendFile(path.join(__dirname, '/html/logout.html'));
});

// --- SERVER INITIALIZATION ---

const options = {
  key: fs.readFileSync(path.join(__dirname, "ssl", "logout.key")),
  cert: fs.readFileSync(path.join(__dirname, "ssl", "logout.crt")),
};

https.createServer(options, app).listen(port, () => {
  console.log(`App listening on PORT: ${port}`);
});