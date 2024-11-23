class FileUploader {
    constructor(config) {
        this.config = config;
        this.baseUrl = config.baseUrl.replace(/\/+$/, ''); // Remove trailing slashes
        this.chunkSize = config.chunkSize || 1024 * 1024; // Default 1MB
        this.apiKey = config.apiKey;
    }

    async uploadFile(file, callbacks = {}) {
        const fileId = crypto.randomUUID();
        const totalChunks = Math.ceil(file.size / this.chunkSize);
        const fileExtension = file.name.split('.').pop(); // Get file extension

        try {
            // Start multipart upload with file extension
            const startResponse = await this._sendRequest('/start_upload', {
                method: 'POST',
                body: JSON.stringify({ 
                    fileId,
                    fileExtension  // Add file extension to the request
                })
            });

            const { uploadId } = startResponse;  // Using camelCase
            const parts = [];
            let uploadedBytes = 0;

            // Upload chunks
            for (let chunkNumber = 1; chunkNumber <= totalChunks; chunkNumber++) {
                const start = (chunkNumber - 1) * this.chunkSize;
                const end = Math.min(start + this.chunkSize, file.size);
                const chunk = file.slice(start, end);
                const extension = file.name.split('.').pop();

                // Create FormData with camelCase keys
                const formData = new FormData();
                formData.append('chunk', chunk);
                formData.append('fileId', fileId);
                formData.append('uploadId', uploadId);
                formData.append('fileExtension', extension);
                formData.append('chunkNumber', chunkNumber);

                const response = await this._sendRequest('/upload_chunk', {
                    method: 'POST',
                    body: formData
                });

                parts.push({
                    partNumber: response.partNumber,  // Using camelCase
                    eTag: response.eTag              // Using camelCase
                });

                uploadedBytes += chunk.size;

                // Call progress callbacks
                if (callbacks.onProgress) {
                    callbacks.onProgress(uploadedBytes, file.size);
                }
                if (callbacks.onChunkComplete) {
                    callbacks.onChunkComplete(chunkNumber, totalChunks);
                }
            }

            // Complete multipart upload with file extension
            const completeResponse = await this._sendRequest('/complete_upload', {
                method: 'POST',
                body: JSON.stringify({
                    fileId,
                    uploadId,
                    parts,
                    filename: file.name,
                    fileExtension  // Add file extension to complete request
                })
            });

            return {
                fileId,
                location: completeResponse.location,
                key: completeResponse.key,
                fileExtension
            };

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

        // Add Content-Type header for JSON requests
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