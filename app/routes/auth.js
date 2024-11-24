import express from 'express';
import jwt from 'jsonwebtoken';
import config from '../../config/config.js';

const router = express.Router();

router.post('/token', async (req, res) => {
    const apiKey = req.header('X-Api-Key');
    
    if (!apiKey || apiKey !== config.API_KEY) {
        return res.status(401).json({ error: 'Invalid API key' });
    }

    try {
        // Create a short-lived upload token (e.g., 1 hour)
        const token = jwt.sign(
            { 
                type: 'upload',
                timestamp: Date.now() 
            }, 
            config.JWT_SECRET, 
            { expiresIn: '1h' }
        );

        res.json({ 
            token,
            expiresIn: 3600 // 1 hour in seconds
        });
    } catch (error) {
        console.error('Token generation error:', error);
        res.status(500).json({ error: 'Failed to generate token' });
    }
});

export default router; 