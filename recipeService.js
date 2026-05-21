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


/**
 * STEP 2 (Upgraded): Fetches up to 20 compact recipes per page to populate a scrollable feed.
 */
export async function generateRecipeFeed(confirmedIngredients, page = 1, cuisinePreference = 'Global') {
    try {
        const ingredientsJson = JSON.stringify(confirmedIngredients);

        let cuisineInstruction = `Suggest recipes matching the cuisine theme: "${cuisinePreference}".`;
        if (cuisinePreference.toLowerCase() === 'global') {
            cuisineInstruction = `Provide a diverse mix of international cuisines (e.g., Italian, Mexican, Asian, Mediterranean, American).`;
        }

        const prompt = `
      Available Ingredients: ${ingredientsJson}.
      ${cuisineInstruction}
      
      This is request PAGE NUMBER: ${page}.
      Generate a clean list of exactly 20 distinct recipe concepts that can be made using these ingredients. 
      For each recipe, you are allowed to include 1 to 3 critical missing ingredients that the user will need to order.
      Keep descriptions brief to avoid token overflow.
    `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        current_page: { type: Type.NUMBER },
                        has_more_pages: { type: Type.BOOLEAN },
                        recipes: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    id: { type: Type.STRING, description: 'A unique slug string, e.g., spicy-ribeye-curry' },
                                    title: { type: Type.STRING },
                                    cuisine_style: { type: Type.STRING },
                                    brief_summary: { type: Type.STRING, description: 'One short sentence description.' },
                                    missing_ingredients_to_order: {
                                        type: Type.ARRAY,
                                        items: { type: Type.STRING }
                                    }
                                },
                                required: ['id', 'title', 'cuisine_style', 'brief_summary', 'missing_ingredients_to_order']
                            }
                        }
                    },
                    required: ['current_page', 'has_more_pages', 'recipes']
                }
            }
        });

        const result = JSON.parse(response.text);
        result.current_page = page;
        return result;

    } catch (error) {
        console.error('Feed Generation Error:', error.message || error);
        throw error;
    }
}

/**
 * STEP 2.5: Gets full detailed steps ONLY when a user selects a recipe from the feed.
 */
export async function getRecipeDetails(recipeTitle, availableIngredients) {
    try {
        const prompt = `Generate comprehensive, step-by-step cooking instructions for the recipe "${recipeTitle}" using these available base ingredients: ${JSON.stringify(availableIngredients)}. Include details on incorporating any missing items.`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING },
                        prep_time: { type: Type.STRING },
                        cooking_steps: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING }
                        }
                    },
                    required: ['title', 'prep_time', 'cooking_steps']
                }
            }
        });

        return JSON.parse(response.text);
    } catch (error) {
        console.error('Details Extraction Error:', error.message || error);
        throw error;
    }
}

