const path = require('node:path');
const https = require('node:https');
const fs = require('node:fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const verifyToken = require('./module/continueIfNotLogin.js');

const app = express();
const port = process.env.PORT || 3006;
const healthIdClientID = process.env.HEALTHID_CLIENT_ID;
const authorizedUrl = process.env.AUTHORIZED_URL;
const callbackUrl = process.env.CALLBACK_URL;
const loginUrl = process.env.LOGIN_URL;

// Secret
const clientSecret = fs.readFileSync('./jwt/client-secret.jwt', 'utf8');

// Middleware Setup
app.use(express.json());
app.use(cookieParser());
app.use('/image', express.static(path.join(__dirname, 'image')));
app.use('/style', express.static(path.join(__dirname, 'style')));

// --- ROUTES ---

app.get('/clientID', verifyToken, (req, res) => {
  res.json({ "clientID": healthIdClientID });
});

app.get('/', verifyToken, (req, res) => {
  res.sendFile(path.join(__dirname, '/html/login.html'));
});

app.post('/password', verifyToken, async (req, res) => {

  const userAgent = req.headers['user-agent'];
  const { username, password } = req.body;

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
    maxAge: 900000 // 15 mins
  });

  res.status(200).redirect(callbackUrl);

});

app.get('/providerID', verifyToken, async (req, res) => {

  const userAgent = req.headers['user-agent'];
  const code = req.query.code;
  if (!code) {
    //return res.status(400).sendFile(path.join(__dirname, '/html/login.html'));
    return res.status(400).redirect(loginUrl);
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
    return res.status(authen.status).redirect(loginUrl);
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
    maxAge: 900000 // 15 mins
  });

  res.status(200).redirect(callbackUrl);

});

// --- SERVER INITIALIZATION ---

const options = {
  key: fs.readFileSync(path.join(__dirname, "ssl", "login.key")),
  cert: fs.readFileSync(path.join(__dirname, "ssl", "login.crt")),
};

https.createServer(options, app).listen(port, () => {
  console.log(`App listening on PORT: ${port}`);
});