import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load the appropriate .env file based on NODE_ENV
const envFile = process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}` : '.env';
const result = dotenv.config({ 
    path: path.join(__dirname, '..', envFile)
});

// Add debug logging
if (result.error) {
    console.error('Error loading .env file:', result.error);
}
console.log('Environment:', process.env.NODE_ENV);
console.log('Loaded env file:', envFile);
console.log('Current env variables:', {
    AWS_REGION: process.env.AWS_REGION,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_BUCKET: process.env.S3_BUCKET,
    // Don't log sensitive credentials
});

const config = {
    PORT: process.env.PORT || 3000,
    API_KEY: process.env.API_KEY || 'default-dev-key',
    USE_S3: process.env.USE_S3 === 'true',
    S3: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION || 'us-east-1',
        bucket: process.env.S3_BUCKET,
        endpoint: process.env.S3_ENDPOINT,
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true'
    }
};

export default config; 
