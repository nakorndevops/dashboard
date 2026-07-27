import * as fs from 'fs';
import mysql from 'mysql2/promise';
import { createClient } from 'redis';
import { getSecret } from './module/getSecret.js';

// Define configuration constants
const CHECK_INTERVAL_MS = 60000; // Check every 1 minutes
const mophAlertUrl = process.env.MOPH_ALERT_URL;

console.log("Initializing Event Monitor Service...");

// 1. Safely load secrets
let clientSecret = '';

try {
    clientSecret = fs.readFileSync('./jwt/client-secret.jwt', 'utf8').trim();
} catch (err) {
    console.error("CRITICAL: Failed to read client secret:", err.message);
    process.exit(1);
}

// Read Secrets
const hosxpPassword = getSecret('/run/secrets/hosxp-db-password', 'HOSxP DB password');
const redisPassword = getSecret('/run/secrets/redis-subscribe', 'Redis password');

// 2. Initialize Redis Client
const redisClient = createClient({
    socket: {
        host: 'redis-subscribe', // Must match docker-compose container_name
        port: 6379
    },
    password: redisPassword
});
redisClient.on('error', err => console.error('Redis Client Error', err));

// 3. Initialized mySQL connection pools (HOSxP)
const hosDb = mysql.createPool({
    host: process.env.HOSXP_HOST,
    user: process.env.HOSXP_USER,
    database: process.env.HOSXP_DATABASE,
    password: hosxpPassword,
    charset: process.env.HOSXP_CHAR_SET,
    connectionLimit: 10 // Added connection limit for safety
});

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
                const vn = keyString.split(':')[1];

                const visitData = await redisClient.hGetAll(keyString);

                // Skip if we are missing essential data
                if (!visitData || !vn) continue;

                // Check Drug Ready
                const [drugStatus] = await hosDb.query(
                    `SELECT
                        rq.queue_series AS series,
                        rq.new_rx_queue AS queue,
                        kd.dispense_room AS dispense_room,
                        kd.dispense_channel AS counter
                    FROM
                        ovst AS o
                        INNER JOIN rx_queue_new AS rq ON o.vn = rq.vn
                        INNER JOIN kskdepartment AS kd ON o.main_dep = kd.depcode
                    WHERE
                        o.vn = ?
                        AND kd.depcode NOT IN ('429', '999')
                        AND rq.queue_series IS NOT NULL
                        AND rq.new_rx_queue IS NOT NULL
                        AND kd.dispense_room IS NOT NULL
                        AND EXISTS (SELECT 1 FROM rx_operator AS ro WHERE ro.vn = o.vn AND ro.prepare_rx = 'Y');`,
                    [vn]
                );

                if (drugStatus.length > 0 && visitData.pharmacy_status === 'pending') {

                    console.log(`Drug ready for VN: ${vn}. Sending message to patient...`);

                    const row = drugStatus[0];

                    let building = '';
                    let room = '';

                    if (row.dispense_room == '183') {
                        room = "ห้องยาผู้ป่วยนอกหมายเลข 13"
                        building = "อาคารอำนวยการชั้น 1";
                    } else if (row.dispense_room == '184') {
                        room = "ห้องยาผู้ป่วยนอกหมายเลข 31"
                        building = "อาคารอุบัติเหตุและฉุกเฉิน ชั้น 1";
                    } else if (row.dispense_room == '392') {
                        room = "ห้องยาศูนย์สุขภาพชุมชนเมือง ชั้น 1";
                        building = "อาคารศูนย์สุขภาพชุมชนเมือง";
                    }

                    const messageHTML = `
                    <strong>
                    <p>คิวรับยาที่ ${row.series}-${row.queue}</p>                    
                    <p>HN ${visitData.hn}</p>
                    <p>คุณ${visitData.fname} ${visitData.lname}</p>
                    <p>ยาของคุณพร้อมแล้ว รับยาได้ที่</p>
                    <p>${room}</p>
                    <p>ช่องรับยา ${row.counter}</p>                  
                    <p>${building}</p>
                    </strong>
                    `;
                    
                    const messageText = `คุณ${visitData.fname} ${visitData.lname}`;

                    const payload = {
                        cid: [
                            visitData.cid 
                        ],
                        messages: [
                            {
                                type: "flex",
                                altText: "แจ้งเตือนคิวรับยา",
                                contents: {
                                    type: "bubble",
                                    body: {
                                        type: "box",
                                        layout: "vertical",
                                        contents: [
                                            {
                                                type: "image",
                                                url: "https://dhdoctor.tranghos.moph.go.th/logo",
                                                size: "xs"
                                            },
                                            {
                                                type: "text",
                                                text: `คิวรับยา ${row.series}-${row.queue}`,
                                                weight: "bold",
                                                size: "xl",
                                                color: "#dc3545",
                                                align: "center"
                                            },
                                            {
                                                type: "box",
                                                layout: "vertical",
                                                margin: "lg",
                                                spacing: "sm",
                                                contents: [
                                                    {
                                                        type: "box",
                                                        layout: "baseline",
                                                        spacing: "sm",
                                                        contents: [
                                                            {
                                                                type: "text",
                                                                text: `HN ${visitData.hn}`,
                                                                wrap: true,
                                                                color: "#666666",
                                                                size: "md",
                                                                flex: 5,
                                                                weight: "bold"
                                                            }
                                                        ]
                                                    },
                                                    {
                                                        type: "box",
                                                        layout: "baseline",
                                                        spacing: "sm",
                                                        contents: [
                                                            {
                                                                type: "text",
                                                                text: `คุณ${visitData.fname} ${visitData.lname}`,
                                                                wrap: true,
                                                                color: "#666666",
                                                                size: "md",
                                                                flex: 5,
                                                                weight: "regular"
                                                            }
                                                        ]
                                                    },
                                                    {
                                                        type: "box",
                                                        layout: "vertical",
                                                        contents: [
                                                            {
                                                                type: "text",
                                                                text: "ยาของท่านพร้อมแล้ว รับยาได้ที่",
                                                                color: "#dc3545",
                                                                size: "md",
                                                                weight: "bold"
                                                            }
                                                        ]
                                                    },
                                                    {
                                                        type: "box",
                                                        layout: "vertical",
                                                        contents: [
                                                            {
                                                                type: "text",
                                                                text: `${room}`,
                                                                size: "md",
                                                                color: "#0d6efd",
                                                                weight: "bold"
                                                            }
                                                        ]
                                                    },
                                                    {
                                                        type: "box",
                                                        layout: "vertical",
                                                        contents: [
                                                            {
                                                                type: "text",
                                                                text: `ช่องรับยา ${row.counter}`,
                                                                size: "md",
                                                                weight: "bold",
                                                                color: "#0d6efd"
                                                            }
                                                        ]
                                                    },
                                                    {
                                                        type: "box",
                                                        layout: "vertical",
                                                        contents: [
                                                            {
                                                                type: "text",
                                                                text: building,
                                                                size: "md",
                                                                color: "#0d6efd",
                                                                weight: "bold"
                                                            }
                                                        ]
                                                    }
                                                ]
                                            }
                                        ],
                                        spacing: "none",
                                        margin: "none"
                                    }
                                }
                            }
                        ],
                        "message_title": "แจ้งเตือนคิวรับยา",
                        "message_text": messageText,
                        "message_html": messageHTML,
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
                            console.log(`Successfully notified VN: ${vn}`);
                        } else {
                            console.error(`Failed to notify VN: ${vn}. Status: ${response.status}`);
                        }
                    } catch (fetchErr) {
                        console.error(`Network error notifying VN: ${vn}`, fetchErr);
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

// Start the service
startMonitor();