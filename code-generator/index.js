import path from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import fs from 'node:fs';
import express from 'express';
import bwipjs from 'bwip-js';
import QRCode from 'qrcode';

// 1. Recreate __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 2. Get environment variables
const port = process.env.PORT || 3006;

// 3. Middleware Setup
const app = express();
app.use(express.json());

// --- ROUTES ---

app.get('/barcode', async (req, res) => {
    const { message } = req.query;

    if (!message) {
        return res.status(400).send('The "message" query parameter is required.');
    }

    try {

        // Generate the barcode buffer (using Code 128 format by default)
        const pngBuffer = await bwipjs.toBuffer({
            bcid: 'code128',       // Barcode type
            text: message,         // Text to encode
            scale: 3,              // 3x scaling factor
            height: 10,            // Bar height, in millimeters
            includetext: true,     // Show human-readable text
            textxalign: 'center',  // Always good to center text
        });

        // Set the proper header for a PNG image and send the buffer
        res.set('Content-Type', 'image/png');
        res.send(pngBuffer);

    } catch (error) {
        console.error('Barcode Generation Error:', error);
        res.status(500).send('Failed to generate Barcode');
    }
});

app.get('/qrcode', async (req, res) => {
    const { message } = req.query;

    if (!message) {
        return res.status(400).send('The "message" query parameter is required.');
    }

    try {

        // Generate the QR code buffer
        const pngBuffer = await QRCode.toBuffer(message, {
            type: 'png',
            margin: 2,       // White space around the QR code (default is 4)
            width: 300,      // Total width/height in pixels
            color: {
                dark: '#000000ff',  // Black dots (Hex + Alpha)
                light: '#ffffffff'  // White background
            }
        });

        // Set the proper header for a PNG image and send the buffer
        res.set('Content-Type', 'image/png');
        res.send(pngBuffer);

    } catch (error) {
        console.error('QR Code Generation Error:', error);
        res.status(500).send('Failed to generate QR Code');
    }
});

// --- SERVER INITIALIZATION ---

const options = {
    key: fs.readFileSync(path.join(__dirname, "ssl", "code-generator.key")),
    cert: fs.readFileSync(path.join(__dirname, "ssl", "code-generator.crt")),
};

https.createServer(options, app).listen(port, () => {
    console.log(`App listening on PORT: ${port}`);
});