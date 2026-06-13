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
const redisUrl = process.env.REDIS_URL;

// Initialize and connect Redis ONCE
const redisClient = createClient({ url: redisUrl });
redisClient.on('error', err => console.error('Redis Client Error', err));
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