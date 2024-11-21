const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR);
}

// Multer for parsing multipart form-data
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const fileId = req.body.file_id;
        const chunkDir = path.join(UPLOAD_DIR, fileId);
        if (!fs.existsSync(chunkDir)) {
            fs.mkdirSync(chunkDir);
        }
        cb(null, chunkDir);
    },
    filename: (req, file, cb) => {
        cb(null, req.body.chunk_number);
    }
});
const upload = multer({ storage });

router.get('/test', (req, res) => {
    return res.status(200).json({ message: 'Test' });
})

router.post('/upload_chunk', upload.single('file'), (req, res) => {
    const { file_id, chunk_number } = req.body;

    if (!file_id || chunk_number === undefined) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    return res.status(200).json({ message: 'Chunk uploaded successfully' });
});

router.post('/complete_upload', (req, res) => {
    const { file_id, filename } = req.body;

    if (!file_id || !filename) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const chunkDir = path.join(UPLOAD_DIR, file_id);
    const finalFilePath = path.join(UPLOAD_DIR, filename);

    if (!fs.existsSync(chunkDir)) {
        return res.status(400).json({ error: 'File ID not found' });
    }

    const chunkFiles = fs.readdirSync(chunkDir).sort((a, b) => parseInt(a) - parseInt(b));

    const writeStream = fs.createWriteStream(finalFilePath);
    chunkFiles.forEach(chunk => {
        const chunkPath = path.join(chunkDir, chunk);
        const data = fs.readFileSync(chunkPath);
        writeStream.write(data);
        fs.unlinkSync(chunkPath); // Clean up chunk
    });
    writeStream.end();

    fs.rmdirSync(chunkDir); // Remove the chunk directory

    return res.status(200).json({ message: 'File upload complete', filename });
});

module.exports = router;
