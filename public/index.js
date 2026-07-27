import path from 'node:path';
import https from 'node:https';
import fs from 'node:fs';
import express from 'express';
import { fileURLToPath } from 'node:url';

// Recreate __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read .env
const port = process.env.PORT || 3006;

// Read files (Adding 'utf8' ensures the keys are read as strings, which jwt.sign expects for RS256)
// Key
// Client Secret
// SSL
const options = {
  key: fs.readFileSync(path.join(__dirname, "ssl", "public.key")),
  cert: fs.readFileSync(path.join(__dirname, "ssl", "public.crt")),
};

// Express
const app = express();
app.use(express.json());

// Set Path
app.use('/image', express.static(path.join(__dirname, 'image')));
app.use('/style', express.static(path.join(__dirname, 'style')));

// Create https Server
const server = https.createServer(options, app);

// Route
app.get('/', (req, res) => {
    // Join current directory with the filename for an absolute path
    res.sendFile(path.join(__dirname, '/html/welcome/index.html'));
});

app.get('/logo', (req, res) => {
    // Join current directory with the filename for an absolute path
    res.sendFile(path.join(__dirname, '/image/TrangHosLogo.png'));
});

app.get('/403', (req, res) => {
    // Join current directory with the filename for an absolute path
    res.sendFile(path.join(__dirname, '/html/error/403.html'));
});

server.listen(port, () => {
  console.log(`App listening on PORT: ${port}`);
});