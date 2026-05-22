import Recipe from './models/Recipe.js';
import Job from './models/Job.js'; // Import your new database model
import { GoogleGenAI, Type } from '@google/genai';
import crypto from 'crypto';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * HIGH-SPEED MAIN ROUTE SEARCH ENGINE (Returns results or initializes DB job state entry)
 */
export async function getPaginatedRecipeFeed(userIngredients, page = 1, cuisinePreference = 'Global') {
    try {
        const limit = 20;
        const skip = (page - 1) * limit;
        const userOwnedNames = userIngredients.map(item => item.name.toLowerCase().trim());

        let query = {};
        if (cuisinePreference.toLowerCase() !== 'global') {
            query.cuisine_style = { $regex: new RegExp(cuisinePreference, 'i') };
        }
        const databaseRecipes = await Recipe.find(query);

        const calculatedFeed = databaseRecipes.map(recipe => {
            const missingItems = [];
            let matchedCount = 0;

            recipe.full_ingredients_list.forEach(reqItem => {
                const cleanedName = reqItem.name.toLowerCase().trim();
                if (userOwnedNames.includes(cleanedName)) {
                    matchedCount++;
                } else {
                    missingItems.push({
                        name: reqItem.name,
                        amount: reqItem.amount,
                        unit: reqItem.unit,
                        display_text: `${reqItem.amount} ${reqItem.unit} ${reqItem.name}`
                    });
                }
            });

            const blinkitSearchUrls = missingItems.map(item => {
                const searchString = encodeURIComponent(item.name);
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

        const filteredFeed = calculatedFeed.filter(item => item.match_percentage > 0);

        // IF 0 MATCHES -> CREATE PERSISTENT BACKGROUND JOB IN MONGO
        if (filteredFeed.length === 0) {
            const jobId = crypto.randomUUID();

            // Save initial state entry inside Atlas collection
            await Job.create({ _id: jobId, status: 'running', progress: 5, recipeIds: [] });

            // Run background generator asynchronously without blocking response
            startBackgroundGeneration(jobId, userIngredients, cuisinePreference);

            return {
                status: "processing",
                job_id: jobId,
                message: "Please wait while the AI Chef creates recipes for your unique ingredients!",
                recipes: []
            };
        }

        const sortedFeed = filteredFeed
            .sort((a, b) => b.match_percentage - a.match_percentage)
            .slice(skip, skip + limit);

        return {
            status: "complete",
            current_page: page,
            has_more_pages: skip + limit < filteredFeed.length,
            recipes: sortedFeed
        };

    } catch (error) {
        console.error('Engine Parsing Error:', error);
        throw error;
    }
}

/**
 * BACKGROUND BATCH COMPILER ENGINE WITH DIRECT DB INTERACTION
 */
async function startBackgroundGeneration(jobId, userIngredients, cuisinePreference) {
    const targetCount = 15;
    const batchSize = 5;
    const ingredientsListStr = userIngredients.map(i => `${i.amount} ${i.unit} ${i.name}`).join(', ');
    let allGeneratedIds = [];

    try {
        for (let currentBatch = 0; currentBatch < targetCount; currentBatch += batchSize) {
            const prompt = `
        The user wants to cook but only has these core items: [${ingredientsListStr}].
        Generate exactly ${batchSize} fresh, creative recipes matching the cuisine concept: "${cuisinePreference}".
        Each recipe can include 1 to 4 extra missing items they need to order. Do not duplicate recipes within this run.
        The 'search_tags' array must contain an array of the names of the core ingredients in lowercase.
      `;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            recipes: {
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
                                                properties: { name: { type: Type.STRING }, amount: { type: Type.NUMBER }, unit: { type: Type.STRING } },
                                                required: ['name', 'amount', 'unit']
                                            }
                                        },
                                        cooking_steps: { type: Type.ARRAY, items: { type: Type.STRING } }
                                    },
                                    required: ['title', 'cuisine_style', 'brief_summary', 'search_tags', 'full_ingredients_list', 'cooking_steps']
                                }
                            }
                        },
                        required: ['recipes']
                    }
                }
            });

            const parsedData = JSON.parse(response.text);

            const savedDocs = await Recipe.insertMany(parsedData.recipes);
            const batchIds = savedDocs.map(doc => doc._id);
            allGeneratedIds = [...allGeneratedIds, ...batchIds];

            const calculatedProgress = Math.round(((currentBatch + batchSize) / targetCount) * 100);

            // Update persistent database document state incrementally
            await Job.findByIdAndUpdate(jobId, {
                progress: Math.min(calculatedProgress, 95),
                recipeIds: allGeneratedIds
            });
        }

        // Explicitly update status to completed when fully finished
        await Job.findByIdAndUpdate(jobId, { status: 'completed', progress: 100 });
        console.log(`Persistent Job Matrix [${jobId}] verified and logged successfully.`);

    } catch (error) {
        console.error(`Persistent Job Error [${jobId}]:`, error.message);
        await Job.findByIdAndUpdate(jobId, { status: 'failed', progress: 0 });
    }
}
