import * as fs from "fs";
import * as https from "https";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";

import { verifyAPIkey } from './module/verifyApiKey.js';

// 1. Properly resolve __dirname in ES Modules for file reading
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read .env variables
const port = process.env.PORT || 3006;
const mophAlertUrl = process.env.MOPH_ALERT_URL;
const clientKey = process.env.CLIENT_KEY;
const secretKey = process.env.SECRET_KEY;

// Optional but recommended: Warn if critical env vars are missing at startup
if (!mophAlertUrl || !clientKey || !secretKey) {
  console.warn("WARNING: Missing required environment variables (MOPH_ALERT_URL, CLIENT_KEY, SECRET_KEY).");
}

const app = express();
app.use(express.json());

// Route
app.post("/", verifyAPIkey, async (req, res) => {
  try {
    // 2. Destructure the body with fallback default values
    const {
      cid = '',
      messages = '',
      message_title = '',
      message_html = '',
      message_text = '',
      message_type = ''
    } = req.body || {};

    if (!cid || !messages) {
      return res.status(400).json({ error: "cid and messages are required" });
    }

    // 3. Make the API request
    const response = await fetch(mophAlertUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'client-key': clientKey,
        'secret-key': secretKey
      },
      // Object shorthand is cleaner here
      body: JSON.stringify({
        cid,
        messages,
        message_title,
        message_html,
        message_text,
        message_type
      })
    });

    // 4. Safely parse the response (APIs sometimes return HTML/Text on 500 errors)
    let responseData;
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      responseData = await response.json();
    } else {
      responseData = { message: await response.text() };
    }

    // 5. Use response.ok to cover all 2xx success status codes
    if (!response.ok) {
      console.error(`External API Error [${response.status}]:`, responseData);
      return res.status(response.status).json(responseData);
    }

    return res.status(200).json(responseData);

  } catch (error) {
    // 6. Catch network failures, DNS issues, or timeouts
    console.error("Internal Server Error:", error);
    return res.status(500).json({ 
      error: "An internal server error occurred while contacting the alert service." 
    });
  }
});

// Server configuration
// 7. Use absolute paths to guarantee the certs are found regardless of the working directory
const options = {
  key: fs.readFileSync(path.join(__dirname, 'ssl', 'moph-alert.key'), 'utf8'),
  cert: fs.readFileSync(path.join(__dirname, 'ssl', 'moph-alert.crt'), 'utf8'),
};

const server = https.createServer(options, app);

server.listen(port, () => {
  console.log(`App listening on PORT: ${port}`);
});