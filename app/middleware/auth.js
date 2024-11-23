import config from '../../config/config.js';

const validateApiKey = (req, res, next) => {
    const apiKey = req.header('X-API-Key');

    if (!apiKey || apiKey !== config.API_KEY) {
        return res.status(401).json({ error: 'Invalid API key' });
    }

    next();
};

export default validateApiKey;