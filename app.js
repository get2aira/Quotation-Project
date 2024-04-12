const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const csvParser = require("csv-parser");
const fs = require("fs");
const path = require("path");
const Listing = require('./models/listing'); // Ensure this path is correct
const bodyParser = require('body-parser');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Middleware
app.use(bodyParser.json()); // Parse JSON bodies
app.use(express.static('public')); // Serve static files from the 'public' directory

const MONGO_URL = "mongodb://127.0.0.1:27017/wanderlust";

mongoose.connect(MONGO_URL, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("Connected to DB"))
    .catch((err) => console.error("Error connecting to DB:", err));

app.post("/upload-csv", upload.single('csvFile'), (req, res) => {
    const filePath = req.file.path;
    let results = [];

    fs.createReadStream(filePath)
        .pipe(csvParser({
            mapHeaders: ({ header }) => header.trim(), // Trim headers
            mapValues: ({ header, value }) => header === 'PricePerPiece' ? parseFloat(value.trim()) : value.trim()
        }))
        .on('data', (row) => {
            const record = {
                'Model No': row['Model No'].trim(),
                'Model Name': row['Model Name'].trim(),
                'Vendor Name': row['Vendor Name'].trim(),
                'Category': row['Category'].trim(),
                'Tags': row['Tags'].split(',').map(tag => tag.trim()),
                'PricePerPiece': isNaN(parseFloat(row['PricePerPiece'])) ? 0 : parseFloat(row['PricePerPiece']),
                'Pictures': row['Pictures'].trim()
            };
            results.push(record);
        })
        .on('end', () => {
            Listing.insertMany(results)
                .then(() => {
                    fs.unlinkSync(filePath); // Delete the file after processing
                    res.send("File uploaded and data inserted to MongoDB");
                })
                .catch(err => {
                    console.error('Error saving data to MongoDB', err);
                    res.status(500).send('An internal server error occurred');
                });
        });
});

app.get('/api/filters', async (req, res) => {
    try {
        const vendors = await Listing.distinct('Vendor Name');
        const categories = await Listing.distinct('Category');
        const tags = await Listing.distinct('Tags');
        res.json({ vendors, categories, tags });
    } catch (err) {
        console.error('Error when fetching filters:', err);
        res.status(500).json({ error: 'Failed to fetch filters' });
    }
});

app.post('/api/filter-listings', async (req, res) => {
    try {
        const query = {};
        const { minPrice, maxPrice, vendors, categories, tags } = req.body;

        if (minPrice !== undefined) {
            query['PricePerPiece'] = { ...query['PricePerPiece'], $gte: minPrice };
        }
        if (maxPrice !== undefined) {
            query['PricePerPiece'] = { ...query['PricePerPiece'], $lte: maxPrice };
        }
        if (vendors && vendors.length) {
            query['Vendor Name'] = { $in: vendors };
        }
        if (categories && categories.length) {
            query['Category'] = { $in: categories };
        }
        if (tags && tags.length) {
            query['Tags'] = { $all: tags };
        }

        const listings = await Listing.find(query);
        res.json(listings);
    } catch (err) {
        console.error('Error when filtering listings:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
  
  // Middleware to serve static files from the 'public' directory
  app.use(express.static('public'));
  
// Routes for serving HTML pages
app.get("/Quotation.html", (req, res) => {
    res.sendFile(path.join(__dirname, 'public/Quotation.html'));
});
app.get("/filtered-results.html", (req, res) => {
    res.sendFile(path.join(__dirname, 'public/filtered-results.html'));
});

app.get("/index.html", (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get("/products.html", (req, res) => {
    res.sendFile(path.join(__dirname, 'public/products.html'));
});

// API endpoint to get listings from MongoDB
app.get("/api/listings", async (req, res) => {
    try {
        const listings = await Listing.find({});
        res.json(listings);
    } catch (err) {
        res.status(500).send(err);
    }
});


// Root route
app.get("/", (req, res) => {
    res.send("Welcome to the Product Listing API.");
});

// Start the server
app.listen(8080, () => {
    console.log("SERVER IS Running, proceed ahead");
});
