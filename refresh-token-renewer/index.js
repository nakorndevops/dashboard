import path from 'node:path';
import { fileURLToPath } from 'node:url';
import https from "node:https";
import fs from "node:fs";
import express from "express";
import jwt from "jsonwebtoken";
import { createClient } from 'redis';
import { v4 as uuidv4 } from 'uuid';

// 1. Import local modules
import { verifyAPIkey } from './module/verifyApiKey.js';
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

// 8. Read RSA keys for signing and verifying tokens
const refreshTokenPrivateKey = fs.readFileSync('./refresh-token/private.pem', 'utf8');
const refreshTokenPublicKey = fs.readFileSync('./refresh-token/public.pem', 'utf8');
const accessTokenPrivateKey = fs.readFileSync('./access-token/private.pem', 'utf8');

// --- ROUTES ---

app.post("/renew", verifyAPIkey, async (req, res) => {

    const refreshToken = req.body.refreshToken;

    if (!refreshToken) return res.status(401).json({ error: 'No refresh token' });

    try {
        // Verify refreshToken and Get payload
        let payload;
        try {
            payload = jwt.verify(refreshToken, refreshTokenPublicKey, { algorithms: ['RS256'] });
        } catch (err) {
            return res.status(403).json({ error: "Access Denied: Invalid token" });
        }

        const { iat, exp, ...refreshTokenPayload } = payload;

        // 1. Check if this token family has been blacklisted due to a previous breach
        const isBlacklisted = await redisClient.get(`family_blacklist:${payload.family_id}`);
        if (isBlacklisted) {
            throw new Error('Token family compromised. Force re-authentication.');
        }

        // 2. Check the specific token's status
        const tokenStatus = await redisClient.get(`refresh_token:${payload.jti}`);
        if (!tokenStatus) {
            throw new Error('Unknown or expired refresh token');
        }

        // 3. BREACH DETECTION: If the token was already used!
        if (tokenStatus === 'used') {
            // Blacklist the entire family. Any valid tokens currently in the wild are now useless.
            await redisClient.setEx(`family_blacklist:${payload.family_id}`, 604800, 'true');
            console.warn(`[SECURITY] Replay attack detected for family ${payload.family_id}. Session revoked.`);
            throw new Error('Breach detected');
        }

        // 4. NORMAL FLOW: Token is valid (Every thing OK).
        // Mark the old refreshToken as 'used' (leaving a tombstone). We use its remaining TTL so tombstones don't build up forever.
        const remainingTtl = await redisClient.ttl(`refresh_token:${payload.jti}`);
        if (remainingTtl > 0) {
            await redisClient.setEx(`refresh_token:${payload.jti}`, remainingTtl, 'used');
        }

        // 5. Issue the NEW rotated tokens
        const { jti, family_id, ...accessTokenPayload } = refreshTokenPayload;

        // New accessToken
        const accessTokenOptions = {
            algorithm: 'RS256',
            expiresIn: '15m'
        };
        let newAccessToken;
        try {
            newAccessToken = jwt.sign(accessTokenPayload, accessTokenPrivateKey, accessTokenOptions);
        } catch (err) {
            return res.status(500).json({ error: "Failed to generate access token" });
        }

        // New refreshToken with new jti but same family_id
        const new_jti = uuidv4();
        refreshTokenPayload.jti = new_jti;

        const refreshTokenOptions = {
            algorithm: 'RS256',
            expiresIn: '7d'
        };
        let newRefreshToken;
        try {
            newRefreshToken = jwt.sign(refreshTokenPayload, refreshTokenPrivateKey, refreshTokenOptions);
        } catch (err) {
            return res.status(500).json({ error: "Failed to generate refresh token" });
        }

        // Store newRefreshToken as valid
        await redisClient.setEx(`refresh_token:${new_jti}`, 604800, 'valid');

        res.status(200).json({ "accessToken": newAccessToken, "refreshToken": newRefreshToken, "payload": accessTokenPayload });
        
    } catch (err) {

        return res.status(401).json({ error: 'Session expired or compromised. Please log in again.' });

    }

});

// --- SERVER INITIALIZATION ---

const options = {
  key: fs.readFileSync(path.join(__dirname, "ssl", "refresh-token-renewer.key")),
  cert: fs.readFileSync(path.join(__dirname, "ssl", "refresh-token-renewer.crt")),
};

https.createServer(options, app).listen(port, () => {
  console.log(`App listening on PORT: ${port}`);
});