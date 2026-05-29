// utils/matcher.js
import natural from 'natural'; // npm install natural

export function fuzzyMatch(userIngredients, recipeIngredients) {
    const userOwned = userIngredients.map(i => i.name.toLowerCase().trim());

    let matchedCount = 0;
    const missingItems = [];

    recipeIngredients.forEach(reqItem => {
        const reqName = reqItem.name.toLowerCase().trim();

        const isMatch = userOwned.some(owned => {
            if (owned === reqName) return true;
            if (owned.includes(reqName) || reqName.includes(owned)) return true;
            // Levenshtein distance — handles typos + plurals
            const distance = natural.LevenshteinDistance(owned, reqName);
            return distance <= 2;
        });

        if (isMatch) matchedCount++;
        else missingItems.push(reqItem);
    });

    return { matchedCount, missingItems };
}