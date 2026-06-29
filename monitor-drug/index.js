import * as fs from 'fs';
import { createClient } from 'redis';

// Define configuration constants
const CHECK_INTERVAL_MS = 120000; // Check every 2 minutes
const mophAlertUrl = process.env.MOPH_ALERT_URL;

console.log("Initializing Event Monitor Service...");

// 1. Safely load secrets
let clientSecret = '';
let redisPassword = '';

try {
    clientSecret = fs.readFileSync('./jwt/client-secret.jwt', 'utf8').trim();
} catch (err) {
    console.error("CRITICAL: Failed to read client secret:", err.message);
    process.exit(1);
}

try {
    redisPassword = fs.readFileSync('/run/secrets/redis-subscribe', 'utf8').trim();
    console.log("Successfully read Redis password from secret.");
} catch (err) {
    console.error("CRITICAL: Failed to read Redis password from secret:", err.message);
    process.exit(1);
}

// 2. Initialize Redis Client
const redisClient = createClient({
    socket: {
        host: 'redis-subscribe', // Must match docker-compose container_name
        port: 6379
    },
    password: redisPassword
});

redisClient.on('error', err => console.error('Redis Client Error', err));

async function startMonitor() {
    // FIX: You must explicitly connect the client in Node Redis v4+
    try {
        await redisClient.connect();
        console.log('Redis Client Connected');
    } catch (err) {
        console.error('Failed to connect to Redis:', err);
        process.exit(1);
    }

    console.log("Starting Event Monitor loop...");

    // 3. The Checking Function
    async function check() {
        try {
            console.log("Scanning active visits for pharmacy updates...");

            // Fetch all keys matching the pattern
            const keys = await redisClient.keys('active_visit:*');

            // If no keys are found, keys might be undefined or empty. Exit early safely.
            if (!keys || keys.length === 0) {
                return;
            }

            for (const key of keys) {
                // Safety check: explicitly convert to string to guarantee .split() works
                const keyString = String(key);
                const hn = keyString.split(':')[1];

                const visitData = await redisClient.hGetAll(keyString);

                // Skip if we are missing essential data
                if (!visitData || !visitData.vn) continue;

                // --- MOCK CHECK: Replace with actual Lab/Pharmacy DB queries ---
                const isDrugReady = await checkDrugDatabase(hn, visitData.vn);

                if (isDrugReady && visitData.pharmacy_status === 'pending') {
                    console.log(`Drug ready for HN: ${hn}. Sending message to patient...`);

                    const messageText = `Your drug is ready, patient ${hn}.`;

                    // Send alert to MOPH_ALERT
                    const payload = {
                        "cid": [
                            "3769900072101"
                        ],
                        "messages": [
                            {
                                "text": "HN " + hn + "/n" + "คุณ " + visitData.fname + " " + visitData.lname + "\n ยาของคุณพร้อมแล้ว \n รับยาได้ที่ห้องยาหมายเลข 31 \n ช่อง 2-4 \n อาคารอุบัติเหตุและฉุกเฉิน ชั้น 1",
                                "type": "text"
                            }
                        ],
                        "message_title": "ทดสอบระบบ Alert 3.1",
                        "message_html": "<div><strong>สวัสดีครับ ยินดีต้อนรับสู่สำนักสุขภาพดิจิทัล</strong></div>",
                        "message_text": "ทดสอบระบบ Alert 3.1",
                        "message_type": "HPT"
                    };

                    try {
                        const response = await fetch(mophAlertUrl, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${clientSecret}`
                            },
                            body: JSON.stringify(payload)
                        });

                        if (response.ok) {
                            // Update Redis state so we don't alert them again today
                            await redisClient.hSet(key, 'pharmacy_status', 'notified');
                            console.log(`Successfully notified HN: ${hn}`);
                        } else {
                            console.error(`Failed to notify HN: ${hn}. Status: ${response.status}`);
                        }
                    } catch (fetchErr) {
                        console.error(`Network error notifying HN: ${hn}`, fetchErr);
                    }

                }
            }
        } catch (error) {
            console.error("Error during monitor cycle:", error);
        } finally {
            // Schedule the NEXT run only AFTER this run has completely finished
            setTimeout(check, CHECK_INTERVAL_MS);
        }
    }

    // Kick off the first checking cycle
    check();
}

// Dummy function to simulate checking an external database for drug availability
async function checkDrugDatabase(hn, vn) {
    // In production, query your pharmacy database here
    return Math.random() > 0.8; // Randomly returns true 20% of the time for testing
    // return false;
}

// Start the service
startMonitor();