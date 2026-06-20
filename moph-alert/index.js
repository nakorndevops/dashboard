import * as fs from "fs";
import * as https from "https";
import express from "express";

import { verifyAPIkey } from './module/verifyApiKey.js';

// Read .env
const port = process.env.PORT || 3006;
const mophAlertUrl = process.env.MOPH_ALERT_URL;
const clientKey = process.env.CLIENT_KEY;
const secretKey = process.env.SECRET_KEY;

const app = express();
app.use(express.json());

// Route
app.post("/", verifyAPIkey, async (req, res) => {

  const body = req.body || {};
  const cid = body.cid || '';
  const messages = body.messages || '';
  const message_title = body.message_title || '';
  const message_html = body.message_html || '';
  const message_text = body.message_text || '';
  const message_type = body.message_type || '';

  if (!cid || !messages) {
    return res.status(400).json({ error: "cid and messages are required" });
  }

  const sendMessages = await fetch(mophAlertUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'client-key': clientKey,
      'secret-key': secretKey
    },
    body: JSON.stringify({
      "cid": cid,
      "messages": messages,
      "message_title": message_title,
      "message_html": message_html,
      "message_text": message_text,
      "message_type": message_type
    })
  });

  const sendMessagesResult = await sendMessages.json();

  if (sendMessages.status != 200) {
    return res.status(sendMessages.status).json(sendMessagesResult);
  }

  res.status(200).json(sendMessagesResult);
});

// Server
const options = {
  key: fs.readFileSync('./ssl/moph-alert.key', 'utf8'),
  cert: fs.readFileSync('./ssl/moph-alert.crt', 'utf8'),
};

const server = https.createServer(options, app);

server.listen(port, () => {
  console.log(`App listening on PORT: ${port}`);
});