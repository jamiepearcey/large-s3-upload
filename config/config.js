import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load the appropriate .env file based on NODE_ENV
const envFile = process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}` : '.env';
dotenv.config({ 
    path: path.join(__dirname, '..', envFile)
});

const config = {
    PORT: process.env.PORT || 3000,
    API_KEY: process.env.API_KEY || 'default-dev-key',
    USE_S3: process.env.USE_S3 === 'true',
    DISABLE_CORS: process.env.DISABLE_CORS === 'true',
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
