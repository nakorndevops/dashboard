import * as fs from "fs";
import * as https from "https";
import express from "express";
import cookieParser from 'cookie-parser';

// Import the new module
import { generateAuthTokens } from './module/tokenGenerator.js';
import { verifyAPIkey } from './module/verifyApiKey.js';

// Read .env
const port = process.env.PORT || 3006;
const hosxpApiUrl = process.env.HOSXP_API_URL;
const redirectUrl = process.env.REDIRECT_URL;
const healthIdUrl = process.env.HEALTHID_URL;
const healthIdClientID = process.env.HEALTHID_CLIENT_ID;
const healthIdClientSecret = process.env.HEALTHID_CLIENT_SECRET;
const providerUrl = process.env.PROVIDER_URL;
const providerClientID = process.env.PROVIDER_CLIENT_ID;
const providerSecretKey = process.env.PROVIDER_SECRET_KEY;
const profileUrl = process.env.PROFILE_URL;
const hospitalCode = process.env.HOSPITAL_CODE;

// Secret
const clientSecret = fs.readFileSync('./jwt/client-secret.jwt', 'utf8');

const app = express();
app.use(express.json());
app.use(cookieParser());

// Route
app.post("/password", verifyAPIkey, async (req, res) => {
    const { username, password, userAgent } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
    }

    try {
        // Verify username password with hosxp-api
        const authen = await fetch(hosxpApiUrl + 'authenPassword', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${clientSecret}`,
            },
            body: JSON.stringify({ username, password }),
        });

        const authenResult = await authen.json();

        if (authen.status !== 200) {
            return res.status(authen.status).json(authenResult);
        }

        // --- Token Generation Module Call ---
        const currentAuthenMethod = "password"; // Defined here for clarity
        const { accessToken, refreshToken, enrichedProfile } = await generateAuthTokens(
            authenResult,
            userAgent,
            currentAuthenMethod
        );
        // ------------------------------------

        res.json({
            "accessToken": accessToken,
            "refreshToken": refreshToken,
            "enrichedProfile": enrichedProfile,
        });

    } catch (error) {
        console.error(error);
        // This catches both fetch errors and our custom token generation error
        res.status(500).json({ error: error.message || "Internal Server Error" });
    }
});

app.post('/providerID', verifyAPIkey, async (req, res) => {
    const { code, userAgent } = req.body;

    // 1. Get healthID accessToken
    // Format the body correctly for x-www-form-urlencoded
    const healthIdAccessTokenReqBody = new URLSearchParams({
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirectUrl,
        "client_id": healthIdClientID,
        "client_secret": healthIdClientSecret
    });
    const getHealthIdAccessToken = await fetch(healthIdUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
        },
        body: healthIdAccessTokenReqBody,
    });
    const getHealthIdAccessTokenResult = await getHealthIdAccessToken.json();
    if (getHealthIdAccessToken.status != 200) {
        return res.status(getHealthIdAccessToken.status).json(getHealthIdAccessTokenResult);
    }
    const healthIdAccessToken = getHealthIdAccessTokenResult.data.access_token;

    // 2. Get ProviderID accessToken
    const getProviderIdAccessToken = await fetch(providerUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            'client_id': providerClientID,
            'secret_key': providerSecretKey,
            'token_by': 'Health ID',
            'token': healthIdAccessToken,
        }),
    });
    const getProviderIdAccessTokenResult = await getProviderIdAccessToken.json();
    if (getProviderIdAccessToken.status != 200) {
        return res.status(getProviderIdAccessToken.status).json(getProviderIdAccessTokenResult);
    }
    const providerIdAccesstoken = getProviderIdAccessTokenResult.data.access_token;

    // 3. Get User Profile
    const getUserProfile = await fetch(profileUrl, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${providerIdAccesstoken}`,
            'client-id': providerClientID,
            'secret-key': providerSecretKey,
        },
    });
    const getUserProfileResult = await getUserProfile.json();
    if (getUserProfile.status != 200) {
        return res.status(getUserProfile.status).json(getUserProfileResult);
    }
    const userProfile = getUserProfileResult.data;

    // Check hospital code
    if (userProfile.organization[0].hcode != hospitalCode) {
        return res.status(403).json({ error: "Invalid hospital code." });
    }

    // Authorized user from hosxp-api
    const authen = await fetch(hosxpApiUrl + 'authenProviderID', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${clientSecret}`,
        },
        body: JSON.stringify({
            "license_id": userProfile.organization[0].license_id,
            "firstname_th": userProfile.firstname_th,
            "lastname_th": userProfile.lastname_th,
            "hash_cid": userProfile.hash_cid,
        }),
    });
    const authenResult = await authen.json();
    if (authen.status !== 200) {
        return res.status(authen.status).json(authenResult);
    }

    // --- Token Generation Module Call ---
    const currentAuthenMethod = "providerID"; // Defined here for clarity
    const { accessToken, refreshToken, enrichedProfile } = await generateAuthTokens(
        authenResult,
        userAgent,
        currentAuthenMethod,
    );
    // ------------------------------------   

    res.json({
        "accessToken": accessToken,
        "refreshToken": refreshToken,
        "enrichedProfile": enrichedProfile,
    });

});

// Server
const options = {
    key: fs.readFileSync('./ssl/authorized-server.key', 'utf8'),
    cert: fs.readFileSync('./ssl/authorized-server.crt', 'utf8'),
};

const server = https.createServer(options, app);

server.listen(port, () => {
    console.log(`App listening on PORT: ${port}`);
});