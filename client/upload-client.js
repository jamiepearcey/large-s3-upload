class FileUploader {
    constructor(config) {
        this.config = config;
        this.baseUrl = config.baseUrl.replace(/\/+$/, '');
        this.chunkSize = config.chunkSize || 1024 * 1024; // Default 1MB
        this.apiKey = config.apiKey;
        this.maxParallelUploads = config.maxParallelUploads || 3; // Default parallel uploads
        this.useCompression = config.useCompression !== false; // Enable by default
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

    async uploadFile(file, callbacks = {}) {
        const fileId = crypto.randomUUID();
        const totalChunks = Math.ceil(file.size / this.chunkSize);
        const fileExtension = file.name.split('.').pop();

        // Initialize timing stats
        const stats = {
            startTime: Date.now(),
            endTime: null,
            totalTime: null,
            uploadSpeed: null,
            compressionRatio: null,
            totalCompressedSize: 0,
            originalSize: file.size
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
                    parallelUploads: this.maxParallelUploads
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

    async _sendRequest(path, options = {}) {
        const url = `${this.baseUrl}${path}`;
        const headers = {
            'X-Api-Key': this.apiKey,
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
}

export { FileUploader };