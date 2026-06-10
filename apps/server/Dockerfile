FROM node:20-alpine

# Install wget for Docker healthcheck
RUN apk add --no-cache wget

WORKDIR /app

# Copy package files first for layer caching
COPY package*.json ./

# Install all dependencies (including devDependencies for nodemon)
RUN npm ci

# Copy source code
COPY . .

EXPOSE 5000

# Use nodemon for hot-reload in development
CMD ["npm", "run", "dev"]
