import mongoose from 'mongoose';

const RecipeSchema = new mongoose.Schema({
    title: { type: String, required: true },
    cuisine_style: { type: String, required: true },
    brief_summary: { type: String, required: true },
    // Structural tags to instantly search and cross-reference ingredients in lowercase
    search_tags: [{ type: String, index: true }],
    full_ingredients_list: [
        {
            name: { type: String, required: true },
            amount: { type: Number, required: true },
            unit: { type: String, required: true }
        }
    ],
    cooking_steps: [{ type: String, required: true }]
});

export default mongoose.model('Recipe', RecipeSchema);
