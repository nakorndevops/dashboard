import * as fs from 'fs';
import mysql from 'mysql2/promise';
import { getSecret } from './module/getSecret.js';

// --- Configuration & Secrets ---
const POLLING_INTERVAL_MS = 10000; // Poll every 10 seconds
const mophAlertUrl = process.env.MOPH_ALERT_URL;

// Safely load secrets
let clientSecret = '';

try {
    clientSecret = fs.readFileSync('./jwt/client-secret.jwt', 'utf8').trim();
} catch (err) {
    console.error("CRITICAL: Failed to read client secret:", err.message);
    process.exit(1);
}

// Read passwords from Docker secrets
const regDBPassword = getSecret('/run/secrets/subscribe-db-password', 'Subscribe DB password');
const hosxpPassword = getSecret('/run/secrets/hosxp-db-password', 'HOSxP DB password');

// --- Database Connections ---
const subscribeDb = mysql.createPool({
    host: process.env.SUBSCRIBE_DB_HOST,
    user: process.env.SUBSCRIBE_DB_USER,
    database: process.env.SUBSCRIBE_DB_NAME,
    password: regDBPassword,
    connectionLimit: 10
});

const hosDb = mysql.createPool({
    host: process.env.HOSXP_HOST,
    user: process.env.HOSXP_USER,
    database: process.env.HOSXP_DATABASE,
    password: hosxpPassword,
    charset: process.env.HOSXP_CHAR_SET || 'utf8',
    connectionLimit: 10
});

// --- State Management ---
let latest_oapp_id = null;

// --- Helper: Send Message to MOPH Alert ---
async function sendAlertMessage(appt) {
    const line_flex_message = {
        type: "bubble",
        body: {
            type: "box",
            layout: "vertical",
            contents: [
                { type: "text", text: "แจ้งเตือนนัดหมายใหม่", weight: "bold", size: "xl" },
                { type: "text", text: `วันที่: ${appt.nextdate} เวลา: ${appt.nexttime}` },
                { type: "text", text: `คลินิก: ${appt.name}` },
                { type: "text", text: `แพทย์: ${appt.doctor_name}` } 
            ]
        }
    };

    const messageText = `คุณมีนัดหมายใหม่วันที่ ${appt.nextdate} เวลา ${appt.nexttime} ที่ ${appt.name}`;
    const messageHTML = `<p>คุณมีนัดหมายใหม่วันที่ <b>${appt.nextdate}</b> เวลา <b>${appt.nexttime}</b> ที่ <b>${appt.name}</b></p>`;

    const payload = {
        cid: [`${appt.cid}`],
        messages: [
            {
                type: "flex",
                altText: "แจ้งนัดหมาย",
                contents: line_flex_message
            }
        ],
        message_title: "แจ้งนัดหมาย",
        message_text: messageText,
        message_html: messageHTML,
        message_type: "HPT"
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

        if (!response.ok) {
            console.error(`Failed to send alert for CID ${appt.cid}: ${response.statusText}`);
        } else {
            console.log(`Successfully sent alert for OAPP_ID: ${appt.oapp_id}`);
        }
    } catch (error) {
        console.error(`Error sending request for CID ${appt.cid}:`, error.message);
    }
}

// --- Main Polling Logic ---
async function pollAppointments() {
    try {
        // 1. Get all registered HNs
        const [registeredUsers] = await subscribeDb.query('SELECT hn FROM registerList');
        
        if (registeredUsers.length > 0) {
            const hns = registeredUsers.map(user => user.hn);

            // 2. Fetch new appointments
            const query = `
                SELECT 
                  oapp.oapp_id, oapp.hn, oapp.nextdate, oapp.nexttime, 
                  clinic.name, kskdepartment.department, 
                  doctor.name AS doctor_name, spclty.name AS spclty_name, 
                  oapp.app_cause, oapp.contact_point, 
                  oapp.note, oapp.note1, oapp.note2, 
                  oapp.lab_list_text, oapp.xray_list_text,
                  patient.cid, patient.fname, patient.lname, 
                  pttype.name AS pttype_name
                FROM oapp
                  INNER JOIN doctor ON doctor.code = oapp.doctor
                  INNER JOIN clinic ON clinic.clinic = oapp.clinic
                  INNER JOIN kskdepartment ON kskdepartment.depcode = oapp.depcode
                  INNER JOIN spclty ON spclty.spclty = oapp.spclty
                  INNER JOIN patient ON patient.hn = oapp.hn
                  INNER JOIN pttype ON pttype.pttype = oapp.next_pttype
                WHERE 
                  oapp.hn IN (?) 
                  AND oapp.oapp_id > ?
                ORDER BY oapp.oapp_id ASC;
            `;

            const [newAppointments] = await hosDb.query(query, [hns, latest_oapp_id]);

            // 3. Process and send alerts
            for (const appt of newAppointments) {
                await sendAlertMessage(appt);
                
                // 4. Update latest_oapp_id safely
                latest_oapp_id = appt.oapp_id;
            }
        }
    } catch (error) {
        console.error("Error during polling cycle:", error.message);
    } finally {
        // 5. Schedule the next execution ONLY after this one completes
        // The finally block guarantees the loop continues even if an error occurs above
        setTimeout(pollAppointments, POLLING_INTERVAL_MS);
    }
}

// --- Initialization ---
async function startService() {
    try {
        console.log("Initializing monitor-appointment service...");
        
        // Find the current max oapp_id on startup
        const [rows] = await hosDb.query('SELECT MAX(oapp_id) AS max_id FROM oapp');
        latest_oapp_id = rows[0].max_id || 0; 
        
        console.log(`Initialization complete. Starting polling from latest_oapp_id: ${latest_oapp_id}`);

        // Trigger the first polling cycle immediately
        pollAppointments();
    } catch (error) {
        console.error("Failed to start service:", error.message);
        process.exit(1);
    }
}

startService();