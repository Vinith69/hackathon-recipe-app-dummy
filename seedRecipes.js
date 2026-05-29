// MUST BE AT THE VERY TOP OF SEEDRECIPES.JS
import dns from 'node:dns';
dns.setServers(['8.8.8.8', '8.8.4.4']); // Forces Node.js to use Google Public DNS

import 'dotenv/config';
import mongoose from 'mongoose';
import { GoogleGenAI, Type } from '@google/genai';
import Recipe from './models/Recipe.js';


const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function seedDatabase() {
    try {
        console.log('Connecting to MongoDB Atlas...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Successfully connected to MongoDB cloud.');

        // Optional: Clear existing recipes to prevent duplicates during testing
        await Recipe.deleteMany({});
        console.log('Cleared older database listings.');

        console.log('Asking Gemini to generate 25 core culinary master recipes... (Please hold)');

        const prompt = `
      Generate a diverse catalog of exactly 25 staple recipes from various international cuisines 
      (including North Indian, South Indian, Italian, Mexican, Asian, Mediterranean, and American Barbecue).
      Ensure you include popular dishes using common proteins like chicken, fish, paneer, potatoes, lentils, rice, flour, eggs, and ribeye steak.
      For each ingredient in full_ingredients_list, provide a lowercase matching name string, numeric amount, and standard unit.
      The 'search_tags' array must contain an array of the names of the core ingredients in lowercase for quick matching.
    `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        catalog: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    title: { type: Type.STRING },
                                    cuisine_style: { type: Type.STRING },
                                    brief_summary: { type: Type.STRING },
                                    search_tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                                    full_ingredients_list: {
                                        type: Type.ARRAY,
                                        items: {
                                            type: Type.OBJECT,
                                            properties: {
                                                name: { type: Type.STRING },
                                                amount: { type: Type.NUMBER },
                                                unit: {
                                                    type: Type.STRING,
                                                    description: 'Strictly use metric abbreviations only: g, kg, ml, l, or pieces. Never use words like container, cup, or packet.'
                                                }
                                            },
                                            required: ['name', 'amount', 'unit']
                                        }
                                    },
                                    cooking_steps: {
                                        type: Type.ARRAY,
                                        items: {
                                            type: Type.OBJECT,
                                            properties: {
                                                step_number: { type: Type.NUMBER },
                                                instruction: { type: Type.STRING },
                                                duration_min: { type: Type.NUMBER, description: 'Estimated minutes for this step. 0 if instant.' },
                                                tip: { type: Type.STRING, description: 'Optional helpful tip for this step. Empty string if none.' }
                                            },
                                            required: ['step_number', 'instruction', 'duration_min', 'tip']
                                        }
                                    }
                                },
                                required: ['title', 'cuisine_style', 'brief_summary', 'search_tags', 'full_ingredients_list', 'cooking_steps']
                            }
                        }
                    },
                    required: ['catalog']
                }
            }
        });

        const parsedData = JSON.parse(response.text);

        // Save the array straight to MongoDB
        await Recipe.insertMany(parsedData.catalog);
        console.log(`Successfully seeded ${parsedData.catalog.length} high-fidelity recipes into Atlas!`);

    } catch (error) {
        console.error('Seeding cycle interrupted:', error.message || error);
    } finally {
        await mongoose.connection.close();
        console.log('Database connection closed safely.');
        process.exit(0);
    }
}

seedDatabase();
