import path, { dirname } from 'node:path';
import https from 'node:https';
import fs from 'node:fs';
import express from 'express';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'node:url';

// Import local modules (make sure the file extension is included, e.g., .js)
import verifyToken from './module/continueIfLogin.js';

// Reconstruct __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Secret
const clientSecret = fs.readFileSync('./jwt/client-secret.jwt', 'utf8');

const app = express();
const port = process.env.PORT || 3006;
const hosxpApiUrl = process.env.HOSXP_API_URL;

// Middleware Setup
app.use(express.json());
app.use(cookieParser());
app.use('/image', express.static(path.join(__dirname, 'image')));
app.use('/style', express.static(path.join(__dirname, 'style')));

// --- ROUTES ---

// Protected Route (Requires valid tokens)
app.get('/', verifyToken, (req, res) => {
  res.sendFile(path.join(__dirname, '/html/food-dashboard.html'));
});

app.post('/wardList', verifyToken, async (req, res) => {
    const getWardList = await fetch(hosxpApiUrl + '/wardList', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${clientSecret}`,
        },
    });
    const wardList = await getWardList.json();

    if (getWardList.status != 200) {
        return res.status(getWardList.status).json(wardList);
    }

    res.status(getWardList.status).json(wardList);
});

app.post('/mealList', verifyToken, async (req, res) => {
    const getMealList = await fetch(hosxpApiUrl + '/mealList', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${clientSecret}`,
        },
    });
    const mealList = await getMealList.json();

    if (getMealList.status != 200) {
        return res.status(getMealList.status).json(mealList);
    }

    res.status(getMealList.status).json(mealList);
});

app.post('/nutritionTypeList', verifyToken, async (req, res) => {
    const getNutritionTypeList = await fetch(hosxpApiUrl + '/nutritionTypeList', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${clientSecret}`,
        },
    });
    const nutritionTypeList = await getNutritionTypeList.json();

    if (getNutritionTypeList.status != 200) {
        return res.status(getNutritionTypeList.status).json(nutritionTypeList);
    }

    res.status(getNutritionTypeList.status).json(nutritionTypeList);
});

app.post('/food', verifyToken, async (req, res) => {
    const ward = req.body.ward;
    const meal = req.body.meal;

    if (!ward || !meal) {
        return res.status(400).json({ error: "Ward and Meal are required" });
    }

    const getFood = await fetch(hosxpApiUrl + '/food', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${clientSecret}`,
        },
        body: JSON.stringify({
            'ward': ward,
            'meal': meal,
        }),
    });
    const food = await getFood.json();

    if (getFood.status != 200) {
        return res.status(getFood.status).json(food);
    }

    res.status(getFood.status).json(food);
});

// --- SERVER INITIALIZATION ---

const options = {
  key: fs.readFileSync(path.join(__dirname, "ssl", "nutrition.key")),
  cert: fs.readFileSync(path.join(__dirname, "ssl", "nutrition.crt")),
};

https.createServer(options, app).listen(port, () => {
  console.log(`App listening on PORT: ${port}`);
});