import * as fs from 'fs';
import mysql from 'mysql2/promise';

// 1. Import local modules
import { getSecret } from './module/getSecret.js';

// 2. Get Client Secret
const clientSecret = fs.readFileSync('./jwt/client-secret.jwt', 'utf8');

// 3. Get Docker secret
const regDBPassword = getSecret('/run/secrets/subscribe-db-password', 'Subscribe DB password');
const hosxpPassword = getSecret('/run/secrets/hosxp-db-password', 'HOSxP DB password');

// 4. Get environment variables
const pollingInterval = parseInt(process.env.POLLING_INTERVAL_MS) || 10000; // Poll every 10 seconds
const mophAlertUrl = process.env.MOPH_ALERT_URL;

// 5. Global variable setting
let latest_oapp_id = null;

// 6. MySQL Connection Pool
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

// --- Core Logic ---

// --- Helper: Send Message to MOPH Alert ---
async function sendAlertMessage(appt) {

    let appointmentNote = '';
    if (appt.note) {
        appointmentNote += `${appt.note}`;
    }
    if (appt.note1) {
        appointmentNote += `\n${appt.note1}`;
    }
    if (appt.note2) {
        appointmentNote += `\n${appt.note2}`;
    }

    console.log(appt);

    const line_flex_message = {
        "type": "bubble",
        "size": "giga",
        "header": {
            "type": "box",
            "layout": "horizontal",
            "spacing": "md",
            "alignItems": "center",
            "contents": [
                {
                    "type": "image",
                    "url": "https://dhdoctor.tranghos.moph.go.th/logo",
                    "size": "xxs",
                    "aspectRatio": "1:1",
                    "flex": 1
                },
                {
                    "type": "box",
                    "layout": "vertical",
                    "contents": [
                        {
                            "type": "text",
                            "text": "โรงพยาบาลศูนย์ตรัง",
                            "weight": "bold",
                            "size": "xl",
                            "color": "#E5F4FF"
                        },
                        {
                            "type": "text",
                            "text": "บัตรนัด",
                            "color": "#E5F4FF",
                            "size": "md",
                            "weight": "bold"
                        }
                    ],
                    "flex": 3
                }
            ],
            "backgroundColor": "#1877F2",
            "paddingAll": "md",
            "flex": 4
        },
        "body": {
            "type": "box",
            "layout": "vertical",
            "spacing": "sm",
            "paddingAll": "md",
            "contents": [
                {
                    "type": "text",
                    "text": `HN ${appt.hn}`,
                    "weight": "bold",
                    "size": "xl",
                    "color": "#0083B0",
                    "wrap": true
                },
                {
                    "type": "text",
                    "text": `${appt.pname}${appt.fname} ${appt.lname}`,
                    "weight": "bold",
                    "size": "xl",
                    "color": "#0083B0",
                    "wrap": true
                },
                {
                    "type": "box",
                    "layout": "horizontal",
                    "contents": [
                        {
                            "type": "text",
                            "text": "อายุ",
                            "size": "md",
                            "color": "#888888",
                            "wrap": true,
                            "flex": 2
                        },
                        {
                            "type": "text",
                            "text": `${appt.age}`,
                            "size": "md",
                            "color": "#333333",
                            "wrap": true,
                            "flex": 10
                        }
                    ],
                    "flex": 12
                },
                {
                    "type": "box",
                    "layout": "horizontal",
                    "contents": [
                        {
                            "type": "text",
                            "text": "สิทธิ",
                            "size": "md",
                            "color": "#888888",
                            "wrap": true,
                            "flex": 2
                        },
                        {
                            "type": "text",
                            "text": `${appt.pttype}`,
                            "size": "md",
                            "color": "#333333",
                            "wrap": true,
                            "flex": 10
                        }
                    ],
                    "flex": 12
                },
                {
                    "type": "text",
                    "text": `🚨 แพ้ยา: ${appt.drugAllergy ?? '-'}`,
                    "size": "md",
                    "color": "#FF3333",
                    "weight": "bold"
                },
                {
                    "type": "separator",
                    "margin": "sm"
                },
                {
                    "type": "box",
                    "layout": "horizontal",
                    "contents": [
                        {
                            "type": "text",
                            "text": "วันนัด",
                            "size": "xl",
                            "color": "#888888",
                            "wrap": true,
                            "flex": 3
                        },
                        {
                            "type": "text",
                            "text": `${appt.nextdate}   ⏰ ${appt.nexttime} น.`,
                            "weight": "bold",
                            "size": "xl",
                            "color": "#1DB446",
                            "margin": "none",
                            "flex": 9
                        }
                    ],
                    "flex": 12
                },
                {
                    "type": "box",
                    "layout": "horizontal",
                    "contents": [
                        {
                            "type": "text",
                            "text": "พบแพทย์",
                            "size": "md",
                            "color": "#888888",
                            "wrap": true,
                            "flex": 3
                        },
                        {
                            "type": "text",
                            "text": `${appt.doctor}`,
                            "size": "md",
                            "color": "#333333",
                            "wrap": true,
                            "flex": 9
                        }
                    ],
                    "flex": 12
                },
                {
                    "type": "box",
                    "layout": "horizontal",
                    "contents": [
                        {
                            "type": "text",
                            "text": "คลินิก",
                            "size": "md",
                            "color": "#888888",
                            "wrap": true,
                            "flex": 3
                        },
                        {
                            "type": "text",
                            "text": `${appt.clinic}`,
                            "size": "md",
                            "color": "#333333",
                            "wrap": true,
                            "flex": 9
                        }
                    ],
                    "flex": 12
                },
                {
                    "type": "box",
                    "layout": "horizontal",
                    "contents": [
                        {
                            "type": "text",
                            "text": "ติดต่อที่",
                            "size": "md",
                            "color": "#888888",
                            "wrap": true,
                            "flex": 3
                        },
                        {
                            "type": "text",
                            "text": `${appt.department}`,
                            "size": "md",
                            "color": "#333333",
                            "wrap": true,
                            "flex": 9
                        }
                    ],
                    "flex": 12
                },
                {
                    "type": "separator",
                    "margin": "sm",
                    "color": "#E54D2E"
                },
                {
                    "type": "text",
                    "text": "📌 การปฏิบัติตัวก่อนพบแพทย์",
                    "weight": "bold",
                    "size": "md",
                    "color": "#E54D2E"
                },
                {
                    "type": "text",
                    "text": `${appointmentNote ?? '-'}`,
                    "wrap": true,
                    "size": "sm",
                    "color": "#666666"
                },
                {
                    "type": "separator",
                    "margin": "sm"
                },
                {
                    "type": "text",
                    "text": `🧪 LAB: ${appt.lab_list_text ?? '-'}`,
                    "size": "xs",
                    "color": "#333333",
                    "wrap": true
                },
                {
                    "type": "text",
                    "text": `🩻 เอกซเรย์: ${appt.xray_list_text ?? '-'}`,
                    "size": "xs",
                    "color": "#333333"
                },
                {
                    "type": "separator",
                    "margin": "sm"
                },
                {
                    "type": "image",
                    "url": `https://dhdoctor.tranghos.moph.go.th/code-generator/barcode?message=${appt.hn}`,
                    "align": "center",
                    "size": "xxl",
                    "gravity": "center",
                    "aspectRatio": "2:1",
                    "aspectMode": "fit",
                    "margin": "xxl"
                }
            ]
        }
    };

    const messageText = `คุณมีนัดหมายใหม่วันที่ ${appt.nextdate} เวลา ${appt.nexttime} ที่ ${appt.clinic} พบแพทย์ ${appt.doctor} ติดต่อที่ ${appt.department}`;
    const messageHTML = `<p>คุณมีนัดหมายใหม่วันที่ <b>${appt.nextdate}</b> เวลา <b>${appt.nexttime}</b> ที่ <b>${appt.clinic}</b> พบแพทย์ <b>${appt.doctor}</b> ติดต่อที่ <b>${appt.department}</b></p>`;

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
            oapp.oapp_id AS oapp_id,
            oapp.hn AS hn,
            pttype.name AS pttype,
            CONCAT(DAY(oapp.nextdate), '/', MONTH(oapp.nextdate), '/', YEAR(oapp.nextdate) + 543) AS nextdate,
            CONCAT(
                IF(HOUR(oapp.nexttime) = 0, 
                   DATE_FORMAT(oapp.nexttime, '%H:%i'), 
                   DATE_FORMAT(oapp.nexttime, '%k:%i')
                )
            ) AS nexttime,
            clinic.name AS clinic,
            kskdepartment.department AS department,
            doctor.name AS doctor,
            oapp.note AS note,
            oapp.note1 AS note1,
            oapp.note2 AS note2,
            oapp.lab_list_text AS lab_list_text,
            oapp.xray_list_text AS xray_list_text,
            patient.pname AS pname,
            patient.fname AS fname,
            patient.lname AS lname,
            patient.cid AS cid,
            CONCAT(
                TIMESTAMPDIFF(YEAR, patient.birthday, CURDATE()),
                ' ปี ',
                TIMESTAMPDIFF(MONTH, patient.birthday, CURDATE()) % 12,
                ' เดือน ',
                DATEDIFF(
                CURDATE(),
                DATE_ADD(
                    DATE_ADD(patient.birthday, INTERVAL TIMESTAMPDIFF(YEAR, patient.birthday, CURDATE()) YEAR),
                    INTERVAL(TIMESTAMPDIFF(MONTH, patient.birthday, CURDATE()) % 12) MONTH
                )
                ),
                ' วัน'
            ) AS age,
            allergy.drugAllergy
            FROM
            oapp
            INNER JOIN pttype ON oapp.next_pttype = pttype.pttype
            INNER JOIN clinic ON oapp.clinic = clinic.clinic
            INNER JOIN kskdepartment ON oapp.depcode = kskdepartment.depcode
            INNER JOIN doctor ON oapp.doctor = doctor.code
            INNER JOIN patient ON oapp.hn = patient.hn
            LEFT JOIN (
                SELECT 
                hn, 
                GROUP_CONCAT(agent SEPARATOR ', ') AS drugAllergy
                FROM opd_allergy
                GROUP BY hn
            ) AS allergy ON oapp.hn = allergy.hn            
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
        setTimeout(pollAppointments, pollingInterval);
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