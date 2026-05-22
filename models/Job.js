import mongoose from 'mongoose';

const JobSchema = new mongoose.Schema({
    _id: { type: String, required: true }, // The generated unique UUID string
    status: { type: String, required: true, enum: ['running', 'completed', 'failed'], default: 'running' },
    progress: { type: Number, required: true, default: 0 },
    recipeIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Recipe' }]
}, { timestamps: true });

// Auto-delete records from the database after 30 minutes to optimize cloud cluster storage space
JobSchema.index({ createdAt: 1 }, { expireAfterSeconds: 1800 });

export default mongoose.model('Job', JobSchema);
