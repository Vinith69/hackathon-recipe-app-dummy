import 'dotenv/config';
import { GoogleGenAI, Type } from '@google/genai';
import fs from 'fs';

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

/**
 * STEP 1: Scans an uploaded image and returns ingredients with separated amounts and units.
 */
export async function scanRawIngredients(imagePath) {
    try {
        const fileBuffer = fs.readFileSync(imagePath);
        const base64Image = fileBuffer.toString('base64');

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
                {
                    inlineData: {
                        data: base64Image,
                        mimeType: 'image/jpeg',
                    },
                },
                'Analyze this image and list every raw ingredient you see. Break down the quantity into a pure numerical amount and a standard unit (e.g. g, kg, ml, pieces, tbsp, tsp, bunch).',
            ],
            config: {
                responseMimeType: 'application/json',
                // Enforces a strict, unchanging schema structure directly at the engine layer
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        ingredients_found: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    name: {
                                        type: Type.STRING
                                    },
                                    amount: {
                                        type: Type.NUMBER,
                                        description: 'The pure numerical value of the quantity. Use decimals if needed (e.g., 0.5, 1.5, 2).'
                                    },
                                    unit: {
                                        type: Type.STRING,
                                        description: 'The standard measurement unit like g, kg, pieces, tbsp, tsp, packet, cup, or ml.'
                                    },
                                    raw_display_text: {
                                        type: Type.STRING,
                                        description: 'The complete human-readable string combined (e.g., "500g", "2 tablespoons").'
                                    }
                                },
                                required: ['name', 'amount', 'unit', 'raw_display_text']
                            }
                        }
                    },
                    required: ['ingredients_found']
                },
            },
        });

        return JSON.parse(response.text);
    } catch (error) {
        console.error('Detailed Scan Error:', error.message || error);
        throw error;
    }
}


import Recipe from './models/Recipe.js';

/**
 * HIGH-SPEED DATABASE FEED ENGINE
 * Queries MongoDB, performs array matching, and generates delivery deep links.
 */
export async function getPaginatedRecipeFeed(userIngredients, page = 1, cuisinePreference = 'Global') {
    try {
        const limit = 20;
        const skip = (page - 1) * limit;

        // Convert all user ingredient names to lowercase for robust matching
        const userOwnedNames = userIngredients.map(item => item.name.toLowerCase().trim());

        // 1. Build Database Query Matrix
        let query = {};
        if (cuisinePreference.toLowerCase() !== 'global') {
            query.cuisine_style = { $regex: new RegExp(cuisinePreference, 'i') };
        }

        // Fetch recipes matching the cuisine filter
        const totalCount = await Recipe.countDocuments(query);
        const databaseRecipes = await Recipe.find(query);

        // 2. Mathematical Ingredient Cross-Examination
        const calculatedFeed = databaseRecipes.map(recipe => {
            const missingItems = [];
            let matchedCount = 0;

            // Compare what the user owns vs what the database requires
            recipe.full_ingredients_list.forEach(reqItem => {
                const cleanedName = reqItem.name.toLowerCase().trim();
                if (userOwnedNames.includes(cleanedName)) {
                    matchedCount++;
                } else {
                    // Format structural display text for the frontend checklist
                    missingItems.push({
                        name: reqItem.name,
                        amount: reqItem.amount,
                        unit: reqItem.unit,
                        display_text: `${reqItem.amount} ${reqItem.unit} ${reqItem.name}`
                    });
                }
            });

            // 3. Blinkit Deep-Linking Search Parameterization
            // Generates universal search query strings to load inside web views or intent routers
            const blinkitSearchUrls = missingItems.map(item => {
                const searchString = encodeURIComponent(`${item.name}`);
                return {
                    item_name: item.name,
                    blinkit_url: `https://blinkit.com{searchString}`,
                    swiggy_url: `https://swiggy.com{searchString}`
                };
            });

            return {
                id: recipe._id,
                title: recipe.title,
                cuisine_style: recipe.cuisine_style,
                brief_summary: recipe.brief_summary,
                missing_ingredients_to_order: missingItems,
                delivery_links: blinkitSearchUrls,
                match_percentage: Math.round((matchedCount / recipe.full_ingredients_list.length) * 100)
            };
        });

        // 4. Sort by best match percentage, then apply pagination slicing
        const sortedFeed = calculatedFeed
            .sort((a, b) => b.match_percentage - a.match_percentage)
            .slice(skip, skip + limit);

        return {
            current_page: page,
            has_more_pages: skip + limit < totalCount,
            total_available: totalCount,
            recipes: sortedFeed
        };

    } catch (error) {
        console.error('Database Engine Splicing Error:', error);
        throw error;
    }
}


