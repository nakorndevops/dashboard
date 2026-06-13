import * as fs from "fs";
import jwt from "jsonwebtoken";

// Read the public key once when the module loads
const apiPublicKey = fs.readFileSync('./api-key/public.pem', 'utf8');

export const verifyAPIkey = (request, response, next) => {
    const authHeader = request.headers['authorization'];
    // The token is expected to be in the format: "Bearer <token>"
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return response.status(401).json({ error: "Access Denied: No token provided" });
    }

    try {
        const verified = jwt.verify(token, apiPublicKey, { algorithms: ['RS256'] });
        next();
    } catch (err) {
        response.status(403).json({ error: "Access Denied: Invalid token" });
    }
};