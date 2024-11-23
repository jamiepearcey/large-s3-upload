import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import path from 'path';
import { S3Client } from '@aws-sdk/client-s3';
import multer from 'multer';
import { Upload } from '@aws-sdk/lib-storage';
import dotenv from 'dotenv';
import uploadRoutes from './routes/upload.js';
import config from '../config/config.js';

const app = express();

app.use(cors());

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

app.use('/api', uploadRoutes);

app.listen(config.PORT, () => {
    console.log(`Server running on port ${config.PORT}`);
});