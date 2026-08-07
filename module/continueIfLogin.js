import jwt from 'jsonwebtoken';
import fs from 'node:fs';

const refreshTokenRenewURL = process.env.REFRESH_TOKEN_RENEW_URL;
const loginURL = '/login';
const permissionGroup = JSON.parse(process.env.PERMISSION_GROUP) || [];
const accessTokenPublicKey = fs.readFileSync('./access-token/public.pem', 'utf8');
const clientSecret = fs.readFileSync('./jwt/client-secret.jwt', 'utf8');

const verifyToken = async (req, res, next) => {
  const { access_token, refresh_token, profile } = req.cookies;

  // Isolated URL components
  const protocol = req.protocol;          // "http" or "https"
  const host = req.get('host');           // "localhost:3000" or "example.com"
  const path = req.originalUrl;          // The original request path (e.g., "/dashboard")
  const mainPath = process.env.MAIN_PATH;

  // Construct the complete URL
  const targetUrl = encodeURI(`${protocol}://${host}${mainPath}`);

  // Construct the redirect URL for login
  const redirectUrl = `${loginURL}?targetUrl=${targetUrl}`;

  // 0. If no tokens exist, immediately reject and send to login
  if (!access_token && !refresh_token) {
    if (path === '/') {
      return res.redirect(redirectUrl);
    } else {
      return res.status(401).json({ error: "Unauthorized. Please log in." });
    }
  }

  // 1. Check if the user's position_id is in the allowed permission group
  if (permissionGroup.length > 0 && profile) {
    if (!permissionGroup.includes(profile.position_id)) {
      if (path === '/') {
        return res.redirect('/403');
      } else {
        return res.status(403).json({
          "error": "Forbidden",
          "error_description": "You do not have permission to access this resource."
        });
      }
    }
  }

  // 2. Try validating the existing access token
  if (access_token) {
    try {
      jwt.verify(access_token, accessTokenPublicKey, { algorithms: ['RS256'] });
      return next(); // Success! Proceed to the protected route
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

        return next(); // Success! Proceed to the protected route
      }
    } catch (err) {
      console.error("Token renewal failed:", err.message);
    }
  }

  // 4. If all checks fail (or fetch fails), reject and send to login
  res.clearCookie('access_token');
  res.clearCookie('refresh_token');
  res.clearCookie('profile');

  if (path === '/') {
    return res.redirect(redirectUrl);
  } else {
    return res.status(400).json({
      "error": "invalid_grant",
      "error_description": "The refresh token is invalid, expired, or revoked."
    });
  }
};

// Use ES Module export default instead of module.exports
export default verifyToken;