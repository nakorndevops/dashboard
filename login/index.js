import path, { dirname } from 'node:path';
import https from 'node:https';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import verifyToken from './module/continueIfNotLogin.js';

// Recreate __dirname and __filename for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 3006;
const healthIdClientID = process.env.HEALTHID_CLIENT_ID;
const authorizedUrl = process.env.AUTHORIZED_URL;
const loginUrl = '/login';

// Secret
const clientSecret = fs.readFileSync('./jwt/client-secret.jwt', 'utf8');

// Middleware Setup
app.use(express.json());
app.use(cookieParser());
app.use('/image', express.static(path.join(__dirname, 'image')));
app.use('/style', express.static(path.join(__dirname, 'style')));

// --- ROUTES ---

app.get('/clientID', (req, res) => {
  res.json({ "clientID": healthIdClientID });
});

app.get('/', verifyToken, (req, res) => {
  res.sendFile(path.join(__dirname, '/html/login.html'));
});

app.post('/password', async (req, res) => {

  const userAgent = req.headers['user-agent'];
  const { username, password, setCookie } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  // Authorized with Password
  const authen = await fetch(authorizedUrl + 'password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${clientSecret}`,
    },
    body: JSON.stringify({
      "username": username,
      "password": password,
      "userAgent": userAgent
    }),
  });

  const result = await authen.json();

  if (authen.status != 200) {
    return res.status(authen.status).json(result);
  }

  if (setCookie === true) {
    res.cookie('access_token', result.accessToken, {
      httpOnly: true,
      maxAge: 900000,
      sameSite: 'lax' // 15 mins
    });

    res.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      maxAge: 604800000,
      sameSite: 'lax' // 7 days
    });

    res.cookie('profile', result.enrichedProfile, {
      httpOnly: false,
      maxAge: 604800000 // 7 days
    });
  }

  res.status(200).json(result.enrichedProfile);

});

app.get('/providerID', async (req, res) => {

  const userAgent = req.headers['user-agent'];
  const targetUrl = req.query.target || '/';
  const code = req.query.code;

  if (!code) {
    console.log('No code provided in query parameters');
    return res.status(400).redirect(`${loginUrl}?targetUrl=${encodeURIComponent(targetUrl)}`);
  }

  // Authorized with ProviderID
  const authen = await fetch(authorizedUrl + 'providerID', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${clientSecret}`,
    },
    body: JSON.stringify({
      "code": code,
      "userAgent": userAgent
    }),
  });

  const result = await authen.json();

  if (authen.status != 200) {
    console.log(`Authorization failed with status ${authen.status}:`, result);
    return res.status(authen.status).redirect(`${loginUrl}?targetUrl=${encodeURIComponent(targetUrl)}`);
  }

  res.cookie('access_token', result.accessToken, {
    httpOnly: true,
    maxAge: 900000,
    sameSite: 'lax' // 15 mins
  });

  res.cookie('refresh_token', result.refreshToken, {
    httpOnly: true,
    maxAge: 604800000,
    sameSite: 'lax' // 7 days
  });

  res.cookie('profile', result.enrichedProfile, {
    httpOnly: false,
    maxAge: 604800000 // 7 days
  });

  res.redirect(targetUrl);

});

// --- SERVER INITIALIZATION ---

const options = {
  key: fs.readFileSync(path.join(__dirname, "ssl", "login.key")),
  cert: fs.readFileSync(path.join(__dirname, "ssl", "login.crt")),
};

https.createServer(options, app).listen(port, () => {
  console.log(`App listening on PORT: ${port}`);
});