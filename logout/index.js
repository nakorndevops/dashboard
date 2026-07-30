import path from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import fs from 'node:fs';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { createClient } from 'redis';

// 1. Import local modules
import { getSecret } from './module/getSecret.js';

// 2. Recreate __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 3. Get Docker secret
const redisPassword = getSecret('/run/secrets/redis-token', 'Redis password');

// 4. Get environment variables
const port = process.env.PORT || 3006;

// 5. Middleware Setup
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/image', express.static(path.join(__dirname, 'image')));
app.use('/style', express.static(path.join(__dirname, 'style')));

// 6. Redis Client Setup
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

// 7. Redis Event Handlers
redisClient.on('error', err => console.error('Redis Client Error', err));
redisClient.on('connect', () => console.log('Redis Client Connected'));
redisClient.on('reconnecting', () => console.log('Redis Client Reconnecting...'));
redisClient.connect().catch(console.error);

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