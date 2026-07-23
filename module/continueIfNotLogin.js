const jwt = require('jsonwebtoken');
const fs = require('node:fs');

const refreshTokenRenewURL = process.env.REFRESH_TOKEN_RENEW_URL;
const accessTokenPublicKey = fs.readFileSync('./access-token/public.pem', 'utf8');
const clientSecret = fs.readFileSync('./jwt/client-secret.jwt', 'utf8');

const verifyToken = async (req, res, next) => {
  const { access_token, refresh_token } = req.cookies;

  const targetUrl = req.query.targetUrl || '/';

  // 1. If no tokens exist, immediately reject and send to login
  if (!access_token && !refresh_token) {
    return next();
  }

  // 2. Try validating the existing access token
  if (access_token) {
    try {
      jwt.verify(access_token, accessTokenPublicKey, { algorithms: ['RS256'] });
      return res.redirect(targetUrl); // Success! Proceed to the protected route
    } catch (err) {
      // Token is invalid/expired. Fall through to the refresh logic below.
    }
  }

  // 3. Try renewing with the refresh token
  if (refresh_token) {
    try {
      const response = await fetch(refreshTokenRenewURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${clientSecret}`,
        },
        body: JSON.stringify({ refreshToken: refresh_token }),
      });

      if (response.ok) {
        const { accessToken, refreshToken, payload } = await response.json();
        const cookieOptions = { httpOnly: true, sameSite: 'lax' };

        // Set new cookies
        res.cookie('access_token', accessToken, { ...cookieOptions, maxAge: 900000 }); // 15 mins
        res.cookie('refresh_token', refreshToken, { ...cookieOptions, maxAge: 604800000 }); // 7 days
        res.cookie('profile', payload, { 
          httpOnly: false, // Allows client-side JS to read it
          maxAge: 604800000   // 7 days
        });     

        return res.redirect(targetUrl); // Success! Proceed to the protected route
      }
    } catch (err) {
      console.error("Token renewal failed:", err.message);
    }
  }

  // 4. If all checks fail (or fetch fails), reject and send to login
  res.clearCookie('access_token');
  res.clearCookie('refresh_token');
  res.clearCookie('profile');  
  next();
};

module.exports = verifyToken;