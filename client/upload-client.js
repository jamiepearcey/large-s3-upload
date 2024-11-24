// Separate token generation function
export async function getUploadToken(baseUrl, apiKey) {
    const response = await fetch(`${baseUrl}/auth/token`, {
        method: 'POST',
        headers: {
            'X-Api-Key': apiKey
        }
    });

    if (!response.ok) {
        throw new Error('Failed to get upload token');
    }

    const { token, expiresIn } = await response.json();
    return {
        token,
        expiresIn,
        expiryTime: Date.now() + (expiresIn * 1000)
    };
}

export class FileUploader {
    constructor(config) {
        this.config = config;
        this.baseUrl = config.baseUrl;
        this.chunkSize = config.chunkSize || 1024 * 1024;
        this.token = config.token;
        this.tokenExpiry = config.tokenExpiry;
        this.maxParallelUploads = config.maxParallelUploads || 3;
        this.compressionMode = config.compressionMode || 'auto';
        this.useCompression = null;
        this.compressionThreshold = 0.75;
    }

    async _sendRequest(path, options = {}) {
        if (!this.token || (this.tokenExpiry && Date.now() >= this.tokenExpiry)) {
            throw new Error('Invalid or expired token');
        }

        const url = `${this.baseUrl}${path}`;
        const headers = {
            'Authorization': `Bearer ${this.token}`,
            ...options.headers
        };

        if (!(options.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
        }

        const response = await fetch(url, {
            ...options,
            headers
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(error.error || `HTTP error! status: ${response.status}`);
        }

        return response.json();
    }

    // Helper function to compress data
    async compressChunk(chunk) {
        // Convert Blob to ArrayBuffer first
        const arrayBuffer = await chunk.arrayBuffer();
        
        const compressedStream = new CompressionStream('deflate');
        const writer = compressedStream.writable.getWriter();
        
        // Write the ArrayBuffer
        writer.write(new Uint8Array(arrayBuffer));
        writer.close();

        const chunks = [];
        const reader = compressedStream.readable.getReader();
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
        }

        // Concatenate all chunks into a single Uint8Array
        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const concatenated = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
            concatenated.set(chunk, offset);
            offset += chunk.length;
        }

        // Return as Blob for FormData
        return new Blob([concatenated]);
    }
    async evaluateCompression(chunk) {
        try {
            const originalSize = chunk.size;
            const compressedBlob = await this.compressChunk(chunk);
            const compressionRatio = compressedBlob.size / originalSize;
            
            console.log('Compression evaluation:', {
                originalSize,
                compressedSize: compressedBlob.size,
                ratio: compressionRatio.toFixed(2)
            });

            // Return true if compression saves at least 25%
            return compressionRatio <= this.compressionThreshold;
        } catch (error) {
            console.error('Compression evaluation failed:', error);
            return false;
        }
    }

    async uploadFile(file, callbacks = {}) {
        const fileId = crypto.randomUUID();
        const totalChunks = Math.ceil(file.size / this.chunkSize);
        const fileExtension = file.name.split('.').pop();

        // Determine compression mode
        this.useCompression = this.compressionMode === 'enabled';
        
        // For auto mode, test first chunk
        if (this.compressionMode === 'auto') {
            const firstChunk = file.slice(0, Math.min(this.chunkSize, file.size));
            this.useCompression = await this.evaluateCompression(firstChunk);
            console.log(`Auto compression ${this.useCompression ? 'enabled' : 'disabled'} based on evaluation`);
        }

        // Initialize timing stats
        const stats = {
            startTime: Date.now(),
            endTime: null,
            totalTime: null,
            uploadSpeed: null,
            compressionRatio: null,
            totalCompressedSize: 0,
            originalSize: file.size,
            compressionMode: this.compressionMode,
            compressionEnabled: this.useCompression
        };

        try {
            const startResponse = await this._sendRequest('/start_upload', {
                method: 'POST',
                body: JSON.stringify({ 
                    fileId, 
                    fileExtension,
                    compressed: this.useCompression 
                })
            });

            const { uploadId } = startResponse;
            const parts = new Array(totalChunks);
            let uploadedBytes = 0;

            // Create array of chunk upload tasks
            const chunkTasks = [];
            for (let chunkNumber = 1; chunkNumber <= totalChunks; chunkNumber++) {
                const start = (chunkNumber - 1) * this.chunkSize;
                const end = Math.min(start + this.chunkSize, file.size);
                
                chunkTasks.push({
                    chunkNumber,
                    start,
                    end,
                    retries: 0,
                    maxRetries: 3
                });
            }

            // Process chunks with limited concurrency
            const processChunk = async (task) => {
                const { chunkNumber, start, end } = task;
                const chunk = file.slice(start, end);
                
                // Compress the chunk if compression is enabled
                const processedChunk = this.useCompression ? 
                    await this.compressChunk(chunk) : 
                    chunk;

                // Track compressed size for compression ratio calculation
                if (this.useCompression) {
                    stats.totalCompressedSize += processedChunk.size;
                }

                const formData = new FormData();
                formData.append('chunk', processedChunk);
                formData.append('fileId', fileId);
                formData.append('uploadId', uploadId);
                formData.append('fileExtension', fileExtension);
                formData.append('chunkNumber', chunkNumber);
                formData.append('compressed', this.useCompression.toString());
                formData.append('originalSize', chunk.size.toString());

                try {
                    const response = await this._sendRequest('/upload_chunk', {
                        method: 'POST',
                        body: formData
                    });

                    parts[chunkNumber - 1] = {
                        partNumber: response.partNumber,
                        eTag: response.eTag
                    };

                    uploadedBytes += chunk.size;

                    if (callbacks.onProgress) {
                        callbacks.onProgress(uploadedBytes, file.size);
                    }
                    if (callbacks.onChunkComplete) {
                        callbacks.onChunkComplete(chunkNumber, totalChunks);
                    }
                } catch (error) {
                    if (task.retries < task.maxRetries) {
                        task.retries++;
                        console.log(`Retrying chunk ${chunkNumber}, attempt ${task.retries}`);
                        return processChunk(task);
                    }
                    throw error;
                }
            };

            // Process chunks in parallel with limited concurrency
            const processBatch = async (tasks) => {
                while (tasks.length > 0) {
                    const batch = tasks.splice(0, this.maxParallelUploads);
                    await Promise.all(batch.map(task => processChunk(task)));
                }
            };

            // Start processing chunks
            await processBatch(chunkTasks);

            // Verify all parts are present
            if (parts.some(part => !part)) {
                throw new Error('Some chunks failed to upload');
            }

            // Complete multipart upload
            const completeResponse = await this._sendRequest('/complete_upload', {
                method: 'POST',
                body: JSON.stringify({
                    fileId,
                    uploadId,
                    parts,
                    filename: file.name,
                    fileExtension
                })
            });

            // Calculate final statistics
            stats.endTime = Date.now();
            stats.totalTime = (stats.endTime - stats.startTime) / 1000; // Convert to seconds
            stats.uploadSpeed = (file.size / (1024 * 1024)) / stats.totalTime; // MB/s

            if (this.useCompression) {
                stats.compressionRatio = stats.totalCompressedSize / file.size;
            }

            const result = {
                fileId,
                location: completeResponse.location,
                key: completeResponse.key,
                fileExtension,
                originalName: file.name,
                size: file.size,
                mimeType: file.type,
                stats: {
                    totalTimeSeconds: stats.totalTime.toFixed(2),
                    uploadSpeedMBps: stats.uploadSpeed.toFixed(2),
                    compressionRatio: stats.compressionRatio ? 
                        stats.compressionRatio.toFixed(2) : 
                        'compression disabled',
                    originalSizeMB: (file.size / (1024 * 1024)).toFixed(2),
                    compressedSizeMB: this.useCompression ? 
                        (stats.totalCompressedSize / (1024 * 1024)).toFixed(2) : 
                        'compression disabled',
                    totalChunks,
                    chunkSizeMB: (this.chunkSize / (1024 * 1024)).toFixed(2),
                    parallelUploads: this.maxParallelUploads,
                    compressionMode: this.compressionMode,
                    compressionEnabled: this.useCompression,
                    compressionThreshold: this.compressionThreshold
                }
            };

            if (callbacks.onFileComplete) {
                callbacks.onFileComplete(result);
            }

            return result;

        } catch (error) {
            console.error('Upload error:', error);
            throw error;
        }
    }
}