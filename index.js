import express from 'express';
import multer from 'multer'; // For handling multi-part form data (images)
import { generateRecipeFeed, getRecipeDetails, scanRawIngredients } from './recipeService.js';
import fs from 'fs';


const app = express();
const upload = multer({ dest: 'uploads/' }); // Temporary storage for pictures

app.use(express.json());

// Endpoint for Step 1
app.post('/api/scan-ingredients', upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No image provided' });

        // Call the updated service
        const result = await scanRawIngredients(req.file.path);

        // Return structured object containing name and quantity pairs
        return res.json(result);
    } catch (err) {
        console.error("Express Router Error Handling Response:", err);
        return res.status(500).json({ error: 'Failed to safely parse image metadata' });
    } finally {
        // Safe async-guaranteed clean up block
        if (req.file && fs.existsSync(req.file.path)) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (unlinkError) {
                console.error("Temporary file cleanup deferred:", unlinkError.message);
            }
        }
    }
});


// Endpoint for Step 2
// Endpoint 1: Fetch the feed array containing 20 item structures
app.post('/api/recipes/feed', async (req, res) => {
    try {
        const { finalIngredients } = req.body;
        const page = parseInt(req.query.page) || 1;
        const cuisine = req.query.cuisine || 'Global';

        const feedData = await generateRecipeFeed(finalIngredients, page, cuisine);
        return res.json(feedData);
    } catch (err) {
        return res.status(500).json({ error: 'Failed to generate recipe grid feed' });
    }
});

// Endpoint 2: Fetch specific steps on click selection
app.post('/api/recipes/details', async (req, res) => {
    try {
        const { recipeTitle, finalIngredients } = req.body;
        if (!recipeTitle) return res.status(400).json({ error: 'Recipe title is required' });

        const instructions = await getRecipeDetails(recipeTitle, finalIngredients);
        return res.json(instructions);
    } catch (err) {
        return res.status(500).json({ error: 'Failed to generate step matrix' });
    }
});


app.listen(3000, () => console.log('Recipe backend running on port 3000'));
