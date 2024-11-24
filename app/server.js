import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import path from 'path';
import uploadRoutes from './routes/upload.js';
import authRoutes from './routes/auth.js';
import config from '../config/config.js';

const app = express();

// Configure CORS based on environment variable
if (config.DISABLE_CORS) {
    app.use(cors({
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'X-Api-Key', 'Authorization']
    }));
    console.log('CORS disabled - allowing all origins');
} else {
    app.use(cors({
        origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [],
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'X-Api-Key', 'Authorization']
    }));
    console.log('CORS enabled with configured origins');
}

// Add these lines to define __dirname when using ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Move this line BEFORE any authentication middleware
app.use('/client', express.static(path.join(__dirname, '../client')));

// Serve test files in development
if (process.env.NODE_ENV !== 'production') {
    app.use('/test', express.static(path.join(__dirname, '../test')));
}

// Add these before your routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add auth routes BEFORE upload routes
app.use('/api/auth', authRoutes);
app.use('/api', uploadRoutes);

app.listen(config.PORT, () => {
    console.log(`Server running on port ${config.PORT}`);
    console.log('Environment:', process.env.NODE_ENV || 'development');
    console.log('Auth endpoint:', '/api/auth/token');
});