# Large S3 Upload Service

A Node.js service for handling large file uploads with support for both local storage and S3-compatible storage services (AWS S3, MinIO, etc.).

## Environment Configuration

The application uses environment-specific configuration files for different deployment scenarios.

### Configuration Files

- `.env.example` - Template showing all required environment variables
- `.env.development` - Development environment settings
- `.env.production` - Production environment settings (can be overridden by Docker environment variables)

### Environment Variables

```bash
# Server Configuration
PORT=3000                         # Application port
API_KEY=your-api-key             # API key for authentication

# Storage Configuration
USE_S3=true                      # Set to true for S3 storage, false for local storage
S3_BUCKET=my-bucket             # S3 bucket name
AWS_REGION=us-east-1            # S3 region
AWS_ACCESS_KEY_ID=access-key    # S3 access key
AWS_SECRET_ACCESS_KEY=secret    # S3 secret key
S3_ENDPOINT=http://minio:9000   # Custom S3 endpoint (for MinIO or other S3-compatible services)
```

## API Authentication

All API endpoints require an API key to be included in the request headers:

```bash
X-API-Key: your-api-key
```

Example curl request:
```bash
curl -X POST \
  http://localhost:3000/api/upload_chunk \
  -H 'X-API-Key: your-api-key' \
  -H 'Content-Type: multipart/form-data' \
  -F 'file=@chunk1' \
  -F 'file_id=123' \
  -F 'chunk_number=1'
```

## Implementation Details

### Project Structure
```
large-s3-upload/
├── app/
│   ├── middleware/
│   │   └── auth.js           # API key authentication middleware
│   ├── routes/
│   │   └── upload.js         # Upload route handlers
│   └── server.js             # Express server setup
├── config/
│   └── config.js             # Configuration management
├── test/
│   ├── index.html           # Test upload interface
│   └── upload.js            # Test upload client
├── .env.example             # Example environment variables
├── .env.development         # Development environment settings
├── .env.production          # Production environment settings
├── Dockerfile              # Docker configuration
└── package.json            # Project dependencies
```

### Key Features

1. **Environment-based Configuration**
   - Separate configs for development and production
   - Environment variable override support
   - S3 endpoint customization for MinIO compatibility

2. **API Security**
   - API key authentication for all endpoints
   - Configurable API keys per environment
   - Request validation middleware

3. **Storage Options**
   - Local file system storage
   - S3-compatible storage (AWS S3, MinIO)
   - Runtime storage selection via configuration

4. **Chunked Upload Support**
   - Temporary chunk storage
   - Ordered chunk assembly
   - Automatic chunk cleanup

5. **Error Handling**
   - Detailed error responses
   - Upload validation
   - Storage error management

## API Endpoints

### Health Check
- `GET /api/health`
  - Headers: `X-API-Key: your-api-key`
  - Response: `{ "message": "Test" }`

### Upload Chunk
- `POST /api/upload_chunk`
  - Headers: 
    - `X-API-Key: your-api-key`
    - `Content-Type: multipart/form-data`
  - Body:
    - `file`: File chunk
    - `file_id`: Unique identifier for the file
    - `chunk_number`: Sequential number of the chunk
  - Response: `{ "message": "Chunk uploaded successfully" }`

### Complete Upload
- `POST /api/complete_upload`
  - Headers: `X-API-Key: your-api-key`
  - Body:
    - `file_id`: Unique identifier for the file
    - `filename`: Final filename
  - Response: `{ "message": "File upload complete", "filename": "example.txt", "storage": "s3" }`

## Deployment

### Local Development

1. Copy the example environment file:
   ```bash
   cp .env.example .env.development
   ```

2. Modify `.env.development` with your settings

3. Install dependencies:
   ```bash
   npm install
   ```

4. Start the development server:
   ```bash
   npm run start:dev
   ```

### Production Deployment with Docker

1. Build the Docker image:
   ```bash
   docker build -t large-s3-upload .
   ```

2. Run the container with environment variables:
   ```bash
   docker run -d \
     -p 3000:3000 \
     -e PORT=3000 \
     -e API_KEY=your-secure-api-key \
     -e USE_S3=true \
     -e S3_BUCKET=your-bucket \
     -e AWS_REGION=your-region \
     -e AWS_ACCESS_KEY_ID=your-key \
     -e AWS_SECRET_ACCESS_KEY=your-secret \
     -e S3_ENDPOINT=http://your-minio:9000 \
     large-s3-upload
   ```

### Docker Compose Example

```yaml
version: '3.8'
services:
  upload-service:
    build: .
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
      - API_KEY=your-secure-api-key
      - USE_S3=true
      - S3_BUCKET=your-bucket
      - AWS_REGION=us-east-1
      - AWS_ACCESS_KEY_ID=your-key
      - AWS_SECRET_ACCESS_KEY=your-secret
      - S3_ENDPOINT=http://minio:9000
    depends_on:
      - minio

  minio:
    image: minio/minio
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      - MINIO_ROOT_USER=your-access-key
      - MINIO_ROOT_PASSWORD=your-secret-key
    command: server /data --console-address ":9001"
    volumes:
      - minio-data:/data

volumes:
  minio-data:
```

## Security Considerations

1. **API Security**
   - Use strong, unique API keys
   - Rotate API keys periodically
   - Store API keys securely
   - Use HTTPS in production

2. **Storage Security**
   - Secure S3 bucket policies
   - Encrypted storage in transit and at rest
   - Regular security audits
   - Proper file cleanup

3. **Environment Security**
   - Never commit .env files to version control
   - Use secrets management in production
   - Regular credential rotation
   - Principle of least privilege

4. **Upload Security**
   - File size limits
   - File type validation
   - Malware scanning (recommended)
   - Rate limiting

## Troubleshooting

1. **API Authentication Issues**
   - Verify API key is correctly set in environment variables
   - Check API key is being sent in X-API-Key header
   - Ensure API key matches between client and server

2. **S3 Connection Issues**
   - Verify S3 endpoint is accessible
   - Check credentials are correct
   - Ensure bucket exists and is accessible
   - Verify network connectivity
   - Check S3 endpoint format

3. **Upload Failures**
   - Check disk space for local storage
   - Verify write permissions
   - Check network connectivity for S3 uploads
   - Verify chunk order and completeness
   - Check file size limits

4. **Docker Issues**
   - Ensure environment variables are properly set
   - Check container logs: `docker logs container-name`
   - Verify network connectivity between containers
   - Check volume permissions
   - Verify port mappings

## Development Notes

1. **Local Testing**
   - Use the provided test interface in `test/index.html`
   - Monitor the uploads directory for local storage
   - Use MinIO console for S3 storage verification

2. **Debugging**
   - Check application logs
   - Use environment-specific configurations
   - Monitor chunk assembly process
   - Verify storage configuration

3. **Performance Optimization**
   - Adjust chunk size based on needs
   - Monitor memory usage during uploads
   - Consider implementing upload progress
   - Optimize concurrent uploads

4. **Maintenance**
   - Regular dependency updates
   - Security patch management
   - Log rotation
   - Temporary file cleanup

## Client Library Usage

### Browser Usage