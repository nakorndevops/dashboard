import mysql from 'mysql2/promise';
import { createClient } from 'redis';

// Configuration
const POLLING_INTERVAL_MS = 300000; // 5 minutes

let lastProcessedVn = vnYesterday() + '235959';

const port = process.env.PORT || 3006;

const hosxpHost = process.env.HOSXP_HOST;
const hosxpUser = process.env.HOSXP_USER;
const hosxpPassword = process.env.HOSXP_PASSWORD;
const hosxpDatabase = process.env.HOSXP_DATABASE;
const hosxpCharSet = process.env.HOSXP_CHAR_SET; 

const regDBHost = process.env.SUBSCRIBE_DB_HOST;
const regDBUser = process.env.SUBSCRIBE_DB_USER;
const regDBPassword = process.env.SUBSCRIBE_DB_PASSWORD;
const regDBName = process.env.SUBSCRIBE_DB_NAME;

const redisUrl = process.env.REDIS_URL;

// 1. Connect to Redis (tempList)
// Initialize Redis ONCE
const redisClient = createClient({ url: redisUrl });
redisClient.on('error', err => console.error('Redis Client Error', err));

// 2. Connect to Hospital DB (ovst)
// Create the connection pool. The pool-specific settings are the defaults
const hosDb = mysql.createPool({
    host: hosxpHost,
    user: hosxpUser,
    database: hosxpDatabase,
    password: hosxpPassword,
    charset: hosxpCharSet, 
});

// 3. Connect to Registration DB (registerList)
// (Removed the 'await' here because createPool is synchronous)
const regDb = mysql.createPool({
    host: regDBHost,
    user: regDBUser,
    password: regDBPassword,
    database: regDBName
});

async function startIngestion() {
    let limitProcessedVN = vnTomorrow() + '000000'; 

    console.log("Starting Ingestion Service...");

    // Connect to Redis
    await redisClient.connect();

    // 4. The Polling Function
    async function poll() {
        try {
            console.log(`Polling HOS DB for new visits since VN: ${lastProcessedVn} to VN: ${limitProcessedVN}...`);

            // Fetch new visits
            const [newVisits] = await hosDb.query(
                `SELECT hn, vn FROM ovst WHERE vn > ? AND vn < ? ORDER BY vn ASC`, 
                [lastProcessedVn, limitProcessedVN]
            );

            if (newVisits.length > 0) {
                // Extract HNs to check against registerList
                const hnsToCheck = newVisits.map(v => v.hn);

                // Check which of these HNs are registered for alerts
                const [registeredPatients] = await regDb.query(
                    `SELECT hn FROM registerList WHERE hn IN (?)`, 
                    [hnsToCheck]
                );

                const registeredHNs = new Set(registeredPatients.map(p => p.hn));

                // Process matches and push to Redis tempList
                for (const visit of newVisits) {
                    if (registeredHNs.has(visit.hn)) {
                        const redisKey = `active_visit:${visit.hn}`;
                        
                        // Store visit data as a Redis Hash
                        await redisClient.hSet(redisKey, {
                            vn: visit.vn,
                            lab_status: 'pending',
                            pharmacy_status: 'pending'
                        });

                        // Set TTL (Expire after 18 hours to auto-cleanup tomorrow)
                        await redisClient.expire(redisKey, 18 * 60 * 60);
                        
                        console.log(`Added HN ${visit.hn} (VN: ${visit.vn}) to Redis tempList.`);
                    }
                    
                    // Update High-Water Mark
                    lastProcessedVn = visit.vn; 
                }
            } else {
                console.log("No new visits found.");
            }

        } catch (error) {
            console.error("Error during ingestion cycle:", error);
        } finally {
            // Schedule the NEXT run only AFTER this run has completely finished (or errored out)
            setTimeout(poll, POLLING_INTERVAL_MS);
        }
    }

    // Kick off the first polling cycle
    poll();
}

startIngestion();

function vnToday() {
  const now = new Date();

  // 1. Get the Buddhist Year (Gregorian Year + 543) and extract the last 2 digits
  const buddhistYear = now.getFullYear() + 543;
  const yy = String(buddhistYear).slice(-2);

  // 2. Get the current month (getMonth is 0-indexed, so we add 1)
  const mm = String(now.getMonth() + 1).padStart(2, '0');

  // 3. Get the current date
  const dd = String(now.getDate()).padStart(2, '0');

  // Combine them all together
  const twelveDigitNumber = `${yy}${mm}${dd}`;
  
  return twelveDigitNumber;
}

function vnYesterday() {
  const now = new Date();
  now.setDate(now.getDate() - 1);

  // 1. Get the Buddhist Year (Gregorian Year + 543) and extract the last 2 digits
  const buddhistYear = now.getFullYear() + 543;
  const yy = String(buddhistYear).slice(-2);

  // 2. Get the current month (getMonth is 0-indexed, so we add 1)
  const mm = String(now.getMonth() + 1).padStart(2, '0');

  // 3. Get the current date
  const dd = String(now.getDate()).padStart(2, '0');

  // Combine them all together
  const twelveDigitNumber = `${yy}${mm}${dd}`;
  
  return twelveDigitNumber;
}

function vnTomorrow() {
  const now = new Date();
  now.setDate(now.getDate() + 1);

  // 1. Get the Buddhist Year (Gregorian Year + 543) and extract the last 2 digits
  const buddhistYear = now.getFullYear() + 543;
  const yy = String(buddhistYear).slice(-2);

  // 2. Get the current month (getMonth is 0-indexed, so we add 1)
  const mm = String(now.getMonth() + 1).padStart(2, '0');

  // 3. Get the current date
  const dd = String(now.getDate()).padStart(2, '0');

  // Combine them all together
  const twelveDigitNumber = `${yy}${mm}${dd}`;
  
  return twelveDigitNumber;
}