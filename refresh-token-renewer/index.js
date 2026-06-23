import * as fs from "fs";
import * as https from "https";
import jwt from "jsonwebtoken";
import express from "express";
import { v4 as uuidv4 } from 'uuid';
import { createClient } from 'redis';

import { verifyAPIkey } from './module/verifyApiKey.js';

// Read .env
const port = process.env.PORT || 3006;
const redisUrl = process.env.REDIS_URL;

// Initialize and connect Redis ONCE
const redisClient = createClient({ url: redisUrl });
redisClient.on('error', err => console.error('Redis Client Error', err));
redisClient.connect().catch(console.error);

// Read files (Adding 'utf8' ensures the keys are read as strings, which jwt.sign expects for RS256)
// Key
const refreshTokenPrivateKey = fs.readFileSync('./refresh-token/private.pem', 'utf8');
const refreshTokenPublicKey = fs.readFileSync('./refresh-token/public.pem', 'utf8');
const accessTokenPrivateKey = fs.readFileSync('./access-token/private.pem', 'utf8');

const app = express();
app.use(express.json());



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

// Server
const options = {
    key: fs.readFileSync('./ssl/refresh-token-renewer.key', 'utf8'),
    cert: fs.readFileSync('./ssl/refresh-token-renewer.crt', 'utf8'),
};

const server = https.createServer(options, app);

server.listen(port, () => {
    console.log(`App listening on PORT: ${port}`);
});