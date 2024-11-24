import { S3Client, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand } from '@aws-sdk/client-s3';
import express from 'express';
import multer from 'multer';
import config from '../../config/config.js';
import { createGunzip, createInflate } from 'zlib';
import { Readable } from 'stream';
import validateToken from '../middleware/jwt-auth.js';

const router = express.Router();

// Use memory storage instead of disk
const upload = multer({ storage: multer.memoryStorage() });

// Add debug logging for S3 configuration
console.log('S3 Config:', {
    region: config.S3.region,
    endpoint: config.S3.endpoint,
    bucket: config.S3.bucket,
    hasAccessKey: !!config.S3.accessKeyId,
    hasSecretKey: !!config.S3.secretAccessKey
});

// Configure S3Client with explicit credentials
const s3Client = new S3Client({
    region: config.S3.region || 'us-east-1',
    endpoint: config.S3.endpoint,
    credentials: {
        accessKeyId: config.S3.accessKeyId || '',
        secretAccessKey: config.S3.secretAccessKey || ''
    },
    forcePathStyle: true  // Important for MinIO and other S3-compatible services
});

// Add validation middleware
const validateS3Config = (req, res, next) => {
    if (!config.S3.accessKeyId || !config.S3.secretAccessKey) {
        return res.status(500).json({ error: 'S3 credentials not configured' });
    }
    if (!config.S3.bucket) {
        return res.status(500).json({ error: 'S3 bucket not configured' });
    }
    next();
};

// Add JWT validation to all upload routes
router.use(validateToken);

// Add the validation middleware to all routes
router.post('/upload_chunk', validateS3Config, upload.single('chunk'), async (req, res) => {
    try {
        const { 
            fileId, 
            chunkNumber, 
            uploadId, 
            fileExtension,
            compressed,
            originalSize 
        } = req.body;
        
        const file = req.file;
        const isCompressed = compressed === 'true';

        if (!file || !uploadId || !chunkNumber || !fileId) {
            return res.status(400).json({ 
                error: 'Missing required parameters',
                received: { 
                    hasFile: !!file, 
                    fileId,
                    chunkNumber,
                    uploadId,
                    compressed: isCompressed
                }
            });
        }

        const key = fileExtension ? `${fileId}.${fileExtension}` : fileId;
        let uploadBuffer = file.buffer;

        // Decompress if the chunk was compressed
        if (isCompressed) {
            try {
                const decompressor = createInflate();
                const chunks = [];
                
                const readable = Readable.from(file.buffer);
                readable.pipe(decompressor);

                for await (const chunk of decompressor) {
                    chunks.push(chunk);
                }

                uploadBuffer = Buffer.concat(chunks);
                
                console.log('Decompression stats:', {
                    originalSize: parseInt(originalSize),
                    compressedSize: file.size,
                    decompressedSize: uploadBuffer.length,
                    compressionRatio: (file.size / parseInt(originalSize)).toFixed(2)
                });
                
            } catch (error) {
                console.error('Decompression error:', error);
                return res.status(400).json({ 
                    error: 'Failed to decompress chunk',
                    details: error.message 
                });
            }
        }

        const uploadPartResponse = await s3Client.send(new UploadPartCommand({
            Bucket: config.S3.bucket,
            Key: key,
            PartNumber: parseInt(chunkNumber),
            UploadId: uploadId,
            Body: uploadBuffer,
            ContentLength: uploadBuffer.length
        }));

        console.log('Upload part response:', {
            ETag: uploadPartResponse.ETag,
            PartNumber: parseInt(chunkNumber),
            Key: key
        });

        res.json({
            eTag: uploadPartResponse.ETag,
            partNumber: parseInt(chunkNumber)
        });

    } catch (error) {
        console.error('Error uploading chunk:', error);
        res.status(500).json({
            error: 'Error uploading chunk',
            details: error.message,
            received: {
                fileId: req.body.fileId,
                chunkNumber: req.body.chunkNumber,
                uploadId: req.body.uploadId,
                fileExtension: req.body.fileExtension,
                compressed: req.body.compressed,
                originalSize: req.body.originalSize,
                hasFile: !!req.file
            }
        });
    }
});

router.post('/complete_upload', validateS3Config, async (req, res) => {
    try {
        const { fileId, filename, parts, uploadId, fileExtension } = req.body;
        const key = fileExtension ? `${fileId}.${fileExtension}` : fileId;

        if (!parts || !Array.isArray(parts) || parts.length === 0) {
            return res.status(400).json({ 
                error: 'Invalid parts array',
                received: parts 
            });
        }

        // Validate and sort parts
        const sortedParts = parts
            .map(part => ({
                partNumber: parseInt(part.partNumber),  // Changed from PartNumber
                eTag: part.eTag  // Changed from ETag
            }))
            .sort((a, b) => a.partNumber - b.partNumber);

        // Validate part numbers are sequential
        for (let i = 0; i < sortedParts.length; i++) {
            if (sortedParts[i].partNumber !== i + 1) {
                return res.status(400).json({
                    error: 'Non-sequential part numbers',
                    parts: sortedParts
                });
            }
        }

        console.log('Completing upload:', {
            fileId,
            uploadId,
            partsCount: sortedParts.length,
            parts: sortedParts
        });

        const completeResponse = await s3Client.send(new CompleteMultipartUploadCommand({
            Bucket: config.S3.bucket,
            Key: key,
            UploadId: uploadId,
            MultipartUpload: {
                Parts: sortedParts.map(part => ({
                    PartNumber: part.partNumber,  // AWS SDK expects PartNumber
                    ETag: part.eTag              // AWS SDK expects ETag
                }))
            }
        }));

        console.log('Complete upload response:', completeResponse);

        res.json({ 
            location: completeResponse.Location,
            key: completeResponse.Key,
            fileExtension
        });

    } catch (error) {
        console.error('Error completing upload:', error);
        res.status(500).json({
            error: 'Error completing upload',
            details: error.message,
            received: req.body
        });
    }
});

// Add endpoint to initiate multipart upload
router.post('/start_upload', validateS3Config, async (req, res) => {
    try {
        const { fileId, fileExtension } = req.body;  // Get fileExtension from request body
        
        if (!fileId) {
            return res.status(400).json({
                error: 'Missing fileId',
                received: req.body
            });
        }
  
        const key = fileExtension ? `${fileId}.${fileExtension}` : fileId;

        console.log('Starting upload:', {
            fileId,
            fileExtension,
            key
        });

        const createResponse = await s3Client.send(new CreateMultipartUploadCommand({
            Bucket: config.S3.bucket, 
            Key: key,
        }));

        res.json({
            uploadId: createResponse.UploadId,
            key: createResponse.Key
        });

    } catch (error) {
        console.error('Error starting upload:', error);
        res.status(500).json({
            error: 'Error starting upload',
            details: error.message,
            received: { fileId: req.body.fileId, fileExtension: req.body.fileExtension }
        });
    }
});

export default router;