FROM node:18-slim

# Set the working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install --no-cache

# Copy the application code
COPY . .

# Create the uploads directory
RUN mkdir -p uploads

# Expose port 8000
EXPOSE 8000

# Start the application
CMD ["npm", "start"]