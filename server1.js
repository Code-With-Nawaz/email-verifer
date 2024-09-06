const express = require('express');
const multer = require('multer');
const dns = require('dns');
const { MongoClient } = require('mongodb');

const app = express();
const port = 5000;

const url = 'mongodb://localhost:27017'; // Replace with your MongoDB connection string
const dbName = 'emailChecker';
const collectionName = 'emails'; // Specify the collection name

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use(express.static('public'));

app.post('/upload', upload.single('file'), async (req, res) => {
    const fileBuffer = req.file.buffer.toString('utf-8').split('\n');
    const validEmails = [];
    const invalidEmails = [];

    const client = new MongoClient(url, { useNewUrlParser: true, useUnifiedTopology: true });

    try {
        await client.connect();
        const database = client.db(dbName);

        // Check if the collection exists, create it if not
        const collections = await database.listCollections().toArray();
        const collectionExists = collections.some(coll => coll.name === collectionName);

        if (!collectionExists) {
            await database.createCollection(collectionName);
            console.log(`Collection '${collectionName}' created.`);
        }

        const collection = database.collection(collectionName);

        async function extractDomain(email) {
            const [, domain] = email.split('@');
            return domain;
        }

        for (const email of fileBuffer) {
            const trimmedEmail = email.trim();
            const domain = await extractDomain(trimmedEmail);

            try {
                const mxRecords = await new Promise((resolve, reject) => {
                    dns.resolveMx(domain, (err, records) => {
                        if (err) reject(err);
                        else resolve(records);
                    });
                });

                console.log(`Valid email: ${trimmedEmail} - MX records:`, mxRecords);
                validEmails.push({ email: trimmedEmail, domain, mxRecords });
                await collection.insertOne({ email: trimmedEmail, domain, status: 'valid', mxRecords });
            } catch (err) {
                console.error(`Invalid email: ${trimmedEmail} - ${err.message}`);
                invalidEmails.push({ email: trimmedEmail, domain });
                await collection.insertOne({ email: trimmedEmail, domain, status: 'invalid' });
            }
        }

        console.log('All emails processed.');
        res.json({ validEmails, invalidEmails });
    } finally {
        await client.close();
    }
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
