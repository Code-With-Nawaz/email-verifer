require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const multer = require('multer');
const dns = require('dns');
const { MongoClient } = require('mongodb');
const path = require('path');

const app = express();
const port = process.env.PORT || 5000; // Use port from .env or default to 5000

// Replace <db_password> with your actual password
const url = process.env.MONGODB_URI; // MongoDB URI from .env
const dbName = process.env.DB_NAME; // Database name from .env
const collectionName = process.env.COLLECTION_NAME; // Collection name from .env

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use(express.static('public')); // Serve static files from 'public' directory

// Global variable to control verification
let verificationRunning = false;

// Route to serve the HTML page
app.get('/view-emails', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'emails.html'));
});

// Route to upload emails
app.post('/upload', upload.single('file'), async (req, res) => {
    const fileBuffer = req.file.buffer.toString('utf-8').split('\n');
    const emails = fileBuffer.map(email => email.trim()).filter(email => email);

    // Log the emails to the console
    console.log('Uploaded Emails:', emails);

    const client = new MongoClient(url);

    try {
        await client.connect();
        const database = client.db(dbName);
        const collection = database.collection(collectionName);

        // Insert emails into the database
        const bulkOps = emails.map(email => {
            const domain = email.split('@')[1];
            return {
                updateOne: {
                    filter: { email },
                    update: { $set: { email, domain, status: 'pending' } },
                    upsert: true
                }
            };
        });
        await collection.bulkWrite(bulkOps);

        console.log('Emails uploaded to the database.');
        res.json({ message: 'Emails uploaded successfully. Verification in progress.' });

        // Start email verification process
        verificationRunning = true; // Set verification to running
        await verifyEmails();
    } catch (error) {
        console.error('Error uploading emails:', error);
        res.status(500).json({ error: 'Error uploading emails' });
    } finally {
        await client.close();
    }
});

// Function to perform email verification
async function verifyEmails() {
    const client = new MongoClient(url);

    try {
        await client.connect();
        const database = client.db(dbName);
        const collection = database.collection(collectionName);

        // Find pending emails
        const emailsToVerify = await collection.find({ status: 'pending' }).toArray();

        if (emailsToVerify.length === 0) {
            console.log('No pending emails to verify.');
            return;
        }

        console.log('Starting verification for pending emails:', emailsToVerify.map(doc => doc.email));

        for (const emailDoc of emailsToVerify) {
            if (!verificationRunning) {
                console.log('Verification stopped.');
                break;
            }

            const { email } = emailDoc;
            const domain = email.split('@')[1];

            try {
                const mxRecords = await new Promise((resolve, reject) => {
                    dns.resolveMx(domain, (err, records) => {
                        if (err) reject(err);
                        else resolve(records);
                    });
                });

                console.log(`Valid email: ${email} - MX records:`, mxRecords);
                await collection.updateOne({ email }, { $set: { status: 'valid', domain, mxRecords } });
            } catch (err) {
                console.error(`Invalid email: ${email} - ${err.message}`);
                await collection.updateOne({ email }, { $set: { status: 'invalid', domain } });
            }
        }

        console.log('Email verification process completed.');
    } catch (error) {
        console.error('Error during email verification:', error);
    } finally {
        await client.close();
    }
}

// Route to manually start email verification
app.get('/start-verification', async (req, res) => {
    if (verificationRunning) {
        res.json({ message: 'Email verification is already running.' });
        return;
    }

    verificationRunning = true; // Set verification to running
    try {
        await verifyEmails();
        res.json({ message: 'Email verification process started.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Route to stop email verification
app.get('/stop-verification', (req, res) => {
    verificationRunning = false; // Set verification to stopped
    res.json({ message: 'Email verification process stopped.' });
});

// Route to get all email details
app.get('/get-all-emails', async (req, res) => {
    const client = new MongoClient(url);

    try {
        await client.connect();
        const database = client.db(dbName);
        const collection = database.collection(collectionName);

        // Retrieve all emails from the database
        const emails = await collection.find({}).toArray();

        // Send the data as a JSON response
        res.json(emails);
    } catch (error) {
        console.error('Error retrieving email details:', error);
        res.status(500).json({ error: 'Error retrieving email details' });
    } finally {
        await client.close();
    }
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
    console.log(`To start verification: http://localhost:${port}/start-verification`);
    console.log(`To stop verification: http://localhost:${port}/stop-verification`);
    console.log(`To get all emails: http://localhost:${port}/get-all-emails`);
    console.log(`To view emails: http://localhost:${port}/view-emails`);
});