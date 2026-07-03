import * as fs from 'fs';
import mysql from 'mysql2/promise';
import { createClient } from 'redis';

// --- Configuration ---
const POLLING_INTERVAL_MS = 60000; // 1 minutes
let lastProcessedVn = '000000000000'; 

// Helper function to read secrets securely
function getSecret(filePath, secretName) {
    try {
        const secret = fs.readFileSync(filePath, 'utf8').trim();
        if (!secret) throw new Error("File is empty");
        console.log(`Successfully read ${secretName} from secret.`);
        return secret;
    } catch (err) {
        console.error(`CRITICAL: Failed to read ${secretName}:`, err.message);
        process.exit(1); 
    }
}

// Read Secrets
const hosxpPassword = getSecret('/run/secrets/hosxp-db-password', 'HOSxP DB password');
const regDBPassword = getSecret('/run/secrets/subscribe-db-password', 'Registration DB password');
const redisPassword = getSecret('/run/secrets/redis-subscribe', 'Redis password');

// --- Database Connections ---
const redisClient = createClient({
    socket: {
        host: 'redis-subscribe',
        port: 6379
    },
    password: redisPassword
});

redisClient.on('error', err => console.error('Redis Client Error', err));
redisClient.on('connect', () => console.log('Redis Client Connected'));

const hosDb = mysql.createPool({
    host: process.env.HOSXP_HOST,
    user: process.env.HOSXP_USER,
    database: process.env.HOSXP_DATABASE,
    password: hosxpPassword,
    charset: process.env.HOSXP_CHAR_SET,
    connectionLimit: 10 // Added connection limit for safety
});

const regDb = mysql.createPool({
    host: process.env.SUBSCRIBE_DB_HOST,
    user: process.env.SUBSCRIBE_DB_USER,
    database: process.env.SUBSCRIBE_DB_NAME,
    password: regDBPassword,
    connectionLimit: 10
});

// --- Core Logic ---
async function poll() {
    try {
        console.log(`Polling HOS DB for new visits from VN: ${lastProcessedVn} ...`);

        const [newVisits] = await hosDb.query(
            `SELECT ovst.hn, ovst.vn, ovst.main_dep, patient.fname as fname, patient.lname as lname, patient.cid as cid, kskdepartment.department
             FROM ovst 
             INNER JOIN patient ON ovst.hn = patient.hn 
             INNER JOIN kskdepartment ON ovst.main_dep = kskdepartment.depcode
             WHERE ovst.vstdate = curdate() 
               AND ovst.vsttime <= CURTIME() 
               AND ovst.ovstist IN ('01', '02', '03', '04') 
               AND ovst.vn > ? 
             ORDER BY ovst.vn ASC`,
            [lastProcessedVn]
        );            

        if (newVisits.length > 0) {
            const hnsToCheck = newVisits.map(v => v.hn);

            const [registeredPatients] = await regDb.query(
                `SELECT hn FROM registerList WHERE hn IN (?)`,
                [hnsToCheck]
            );

            // FIXED: Using a Set for O(1) lookups instead of an improperly formatted Map
            const registeredHNs = new Set(registeredPatients.map(p => p.hn));

            for (const visit of newVisits) {
                if (registeredHNs.has(visit.hn)) {
                    const redisKey = `active_visit:${visit.vn}`;

                    // Ensure all values passed to Redis are strings to avoid type errors
                    await redisClient.hSet(redisKey, {
                        hn: String(visit.hn),
                        cid: String(visit.cid || ''),
                        fname: String(visit.fname || ''),
                        lname: String(visit.lname || ''),
                        department: String(visit.department || ''),
                        lab_status: 'pending',
                        pharmacy_status: 'pending'
                    });

                    // Set TTL (Expire after 18 hours)
                    await redisClient.expire(redisKey, 18 * 60 * 60);

                    console.log(`Added HN ${visit.hn} VN ${visit.vn} ${visit.fname} ${visit.lname} (CID: ${visit.cid}) to Redis tempList.`);
                }

                // Update High-Water Mark inside the loop so if it crashes, it resumes accurately
                lastProcessedVn = visit.vn;
            }
        } else {
            console.log("No new visits found.");
        }

    } catch (error) {
        console.error("Error during ingestion cycle:", error);
    } finally {
        setTimeout(poll, POLLING_INTERVAL_MS);
    }
}

async function startIngestion() {
    console.log("Starting Ingestion Service...");
    await redisClient.connect();
    poll();
}

// --- Graceful Shutdown ---
async function shutdown() {
    console.log("Shutting down gracefully...");
    await redisClient.quit();
    await hosDb.end();
    await regDb.end();
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Initialize
startIngestion();