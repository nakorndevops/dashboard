const path = require('node:path');
const https = require('node:https');
const fs = require('node:fs');
const express = require('express');
const { middleware, LineBotClient } = require('@line/bot-sdk');

// 1. Setup LINE Webhook Middleware Configuration
const middlewareConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

// 2. Create the new v11 Unified Client
const client = LineBotClient.fromChannelAccessToken({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

const app = express();

// 3. Webhook Route
// The middleware securely verifies the X-Line-Signature header
app.post('/', middleware(middlewareConfig), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error('LINE Bot Error:', err);
      res.status(500).end();
    });
});

// 4. Event Handler Logic
async function handleEvent(event) {
  // Ignore non-message events or non-text messages
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  // Create an echo reply
  const echoMessage = { type: 'text', text: `You said: ${event.message.text}` };

  // Use the v11 unified client method signature
  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [echoMessage],
  });
}

// 5. Start Server
const port = process.env.PORT || 3006; // Matching your 3006 convention
const options = {
  key: fs.readFileSync(path.join(__dirname, "ssl", "webhook.key")),
  cert: fs.readFileSync(path.join(__dirname, "ssl", "webhook.crt")),
};

https.createServer(options, app).listen(port, () => {
  console.log(`App listening on PORT: ${port}`);
});