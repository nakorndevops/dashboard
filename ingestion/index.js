const mysql = require('mysql2/promise');
const redis = require('redis');

// Configuration
const POLLING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let lastProcessedVn = '20231025000000'; // Initial start timestamp/VN

const port = process.env.PORT || 3006;
const mysql_host = process.env.MYSQL_HOST;
const mysql_user = process.env.MYSQL_USER;
const mysql_password = process.env.MYSQL_PASSWORD;
const mysql_database = process.env.MYSQL_DATABASE;
const char_set = process.env.CHAR_SET;

async function startIngestion() {
    console.log("Starting Ingestion Service...");

    // 1. Connect to Redis (tempList)
    // Initialize and connect Redis ONCE
    const redisClient = createClient({ url: redisUrl });
    redisClient.on('error', err => console.error('Redis Client Error', err));
    redisClient.connect().catch(console.error);

    // 2. Connect to Hospital DB (ovst)
    // Create the connection pool. The pool-specific settings are the defaults
    const hosDb = mysql.createPool({
        host: mysql_host,
        user: mysql_user,
        database: mysql_database,
        password: mysql_password,
        waitForConnections: true,
        connectionLimit: 10,
        maxIdle: 10, // max idle connections, the default value is the same as `connectionLimit`
        idleTimeout: 60000, // idle connections timeout, in milliseconds, the default value 60000
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
        charset: char_set, // Set the character set here
    });

    // 3. Connect to Registration DB (registerList)
    const regDb = await mysql.createPool({
        host: process.env.SUBSCRIBE_DB_HOST,
        user: process.env.SUBSCRIBE_DB_USER,
        password: process.env.SUBSCRIBE_DB_PASSWORD,
        database: process.env.SUBSCRIBE_DB_NAME
    });

    // 4. Polling Loop
    setInterval(async () => {
        try {
            console.log(`Polling HOS DB for new visits since VN: ${lastProcessedVn}...`);

            // Fetch new visits
            const [newVisits] = await hosDb.query(
                `SELECT hn, vn FROM ovst WHERE vn > ? ORDER BY vn ASC`,
                [lastProcessedVn]
            );

            if (newVisits.length === 0) {
                console.log("No new visits found.");
                return;
            }

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

        } catch (error) {
            console.error("Error during ingestion cycle:", error);
        }
    }, POLLING_INTERVAL_MS);
}

startIngestion();