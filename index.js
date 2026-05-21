// TOP OF SERVER.JS
import dns from 'node:dns';
dns.setServers(['8.8.8.8', '8.8.4.4']); // Ensures stable cloud Atlas lookup connection

import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import fs from 'fs';
import { GoogleGenAI, Type } from '@google/genai';
import { getPaginatedRecipeFeed } from './recipeService.js';
import Recipe from './models/Recipe.js';

const app = express();
const upload = multer({ dest: 'uploads/' }); // Temp folder for storage
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.use(express.json());

// Establish connection to live Cloud Cluster
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Database Router connected to Atlas.'))
    .catch(err => console.error('Database connection error:', err));


/**
 * STEP 1: SCANNING PHOTO ENDPOINT (AI Vision Execution)
 * Expects a multi-part form upload with the key name 'photo'
 */
app.post('/api/scan-ingredients', upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No photo provided for processing' });

        // Read local temporary file and convert to base64 stream properties
        const fileBuffer = fs.readFileSync(req.file.path);
        const base64Image = fileBuffer.toString('base64');

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
                {
                    inlineData: {
                        data: base64Image,
                        mimeType: req.file.mimetype,
                    },
                },
                'Analyze this image and list every raw ingredient you see. Break down the quantity into a pure numerical amount and a standard unit (e.g. g, kg, ml, pieces, tbsp, tsp, bunch).',
            ],
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        ingredients_found: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    name: { type: Type.STRING },
                                    amount: { type: Type.NUMBER, description: 'Numeric value only. Decimals allowed.' },
                                    unit: { type: Type.STRING, description: 'e.g., g, kg, pieces, tbsp, tsp, cup, packet' },
                                    raw_display_text: { type: Type.STRING, description: 'Combined text string, e.g., "500g", "2 pieces"' }
                                },
                                required: ['name', 'amount', 'unit', 'raw_display_text']
                            }
                        }
                    },
                    required: ['ingredients_found']
                },
            },
        });

        return res.json(JSON.parse(response.text));

    } catch (err) {
        console.error("Scanning Error:", err.message || err);
        return res.status(500).json({ error: 'Failed to process ingredient image' });
    } finally {
        // Safe async cleanup block to prevent server from running out of disk space
        if (req.file && fs.existsSync(req.file.path)) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (unlinkError) {
                console.error("Temporary file cleanup deferred:", unlinkError.message);
            }
        }
    }
});


/**
 * STEP 2: HIGH-SPEED MATCHING FEED ENDPOINT (MongoDB Lookups)
 * Expects: { "finalIngredients": [{ "name": "ribeye steak" }, { "name": "paprika" }] }
 */
app.post('/api/recipes/feed', async (req, res) => {
    try {
        const { finalIngredients } = req.body;
        const page = parseInt(req.query.page) || 1;
        const cuisine = req.query.cuisine || 'Global';

        if (!finalIngredients || !Array.isArray(finalIngredients)) {
            return res.status(400).json({ error: 'Payload requires a structural ingredient array.' });
        }

        const feedResult = await getPaginatedRecipeFeed(finalIngredients, page, cuisine);
        return res.json(feedResult);
    } catch (err) {
        return res.status(500).json({ error: 'Failed to cross-reference database vectors.' });
    }
});


/**
 * STEP 3: DETAILS FETCH (Instant 0ms AI Cooking Steps Fetch)
 * URL Format: /api/recipes/details/65f1234abcd56789effe1234
 */
app.get('/api/recipes/details/:id', async (req, res) => {
    try {
        const recipe = await Recipe.findById(req.params.id);
        if (!recipe) return res.status(404).json({ error: 'Recipe entry not found.' });

        return res.json({
            title: recipe.title,
            cuisine_style: recipe.cuisine_style,
            full_ingredients_list: recipe.full_ingredients_list,
            cooking_steps: recipe.cooking_steps
        });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to parse document properties.' });
    }
});

app.listen(3000, () => console.log('Recipe backend running on port 3000'));
