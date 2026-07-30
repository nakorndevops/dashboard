import path from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import fs from 'node:fs';
import express from 'express';

// 1. Recreate __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 2. Get environment variables
const port = process.env.PORT || 3006;

// 3. Middleware Setup
const app = express();
app.use(express.json());
app.use('/image', express.static(path.join(__dirname, 'image')));
app.use('/style', express.static(path.join(__dirname, 'style')));

// --- ROUTES ---

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

// --- SERVER INITIALIZATION ---

const options = {
  key: fs.readFileSync(path.join(__dirname, "ssl", "public.key")),
  cert: fs.readFileSync(path.join(__dirname, "ssl", "public.crt")),
};

https.createServer(options, app).listen(port, () => {
  console.log(`App listening on PORT: ${port}`);
});