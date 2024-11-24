import express from 'express';
import cors from 'cors';
import config from '../config/config.js';
import uploadRouter from './routes/upload.js';

const app = express();

// Configure CORS based on environment variable
if (config.DISABLE_CORS) {
    app.use(cors({
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'X-Api-Key']
    }));
    console.log('CORS disabled - allowing all origins');
} else {
    // Add your production CORS configuration here
    app.use(cors({
        origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [],
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'X-Api-Key']
    }));
    console.log('CORS enabled with configured origins');
}

app.use('/api', uploadRouter);

const port = config.PORT;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log('Environment:', process.env.NODE_ENV || 'development');
});

export default app;