import * as fs from "fs";
import jwt from "jsonwebtoken";
import { UAParser } from 'ua-parser-js';
import { v4 as uuidv4 } from 'uuid';
import { createClient } from 'redis';

const redisUrl = process.env.REDIS_URL;

// 1. Read keys ONCE at startup
const refreshKey = fs.readFileSync('./refresh-token/private.pem', 'utf8');
const accessKey = fs.readFileSync('./access-token/private.pem', 'utf8');

// 2. Initialize and connect Redis ONCE
const redisClient = createClient({ url: redisUrl });
redisClient.on('error', err => console.error('Redis Client Error', err));
redisClient.connect().catch(console.error);

/**
 * Generates an access token and a refresh token.
 * @param {Object} userData - The base user profile from the database/auth API.
 * @param {string} userAgent - The user-agent string from the request header.
 * @param {string} authenMethod - The method used to authenticate (e.g., 'password', 'pin').
 * @returns {Object} Contains the accessToken, refreshToken, and the enriched profile.
 */
export const generateAuthTokens = async (userData, userAgent, authenMethod) => {

    // Safely extract the device from the User-Agent
    const parser = new UAParser(userAgent);
    const result = parser.getResult();

    const browserName = result.browser.name ?? '';
    const browserVersion = result.browser.version ?? '';
    const deviceType = result.device.type ?? '';
    const deviceModel = result.device.model ?? '';
    const deviceVendor = result.device.vendor ?? '';
    const osName = result.os.name ?? '';
    const osVersion = result.os.version ?? '';

    const device = `${browserName} ${browserVersion} ${deviceType} ${deviceModel} ${deviceVendor} ${osName} ${osVersion}`.replace(/\s+/g, ' ').trim();

    // Create a new enriched profile object
    const enrichedProfile = {
        ...userData,
        authenMethod: authenMethod, // Now uses the parameter
        device: device,
        loginDate: Date.now()
    };

    const jti = uuidv4();
    const family_id = uuidv4();
    const enrichedProfileRefreshToken = {
        ...userData,
        authenMethod: authenMethod, // Now uses the parameter
        device: device,
        loginDate: Date.now(),
        jti: jti,
        family_id: family_id
    };

    try {
        // Create access token
        const accessToken = jwt.sign(enrichedProfile, accessKey, {
            algorithm: 'RS256',
            expiresIn: '15m'
        });

        // Create refresh token
        const refreshToken = jwt.sign(enrichedProfileRefreshToken, refreshKey, {
            algorithm: 'RS256',
            expiresIn: '7d'
        });

        // Redis refreshToken
        // WHITELIST IN REDIS: Store the jti with a 7-day expiration (604800 seconds)
        // We use the jti as the key
        // Store in Redis as 'valid'
        await redisClient.setEx(`refresh_token:${jti}`, 604800, 'valid');

        return { accessToken, refreshToken, enrichedProfile };
    } catch (err) {
        throw new Error("Failed to generate authentication tokens");
    }
};