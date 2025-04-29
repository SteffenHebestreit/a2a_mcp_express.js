# Use an official Node.js runtime as a parent image
FROM node:18-alpine AS builder

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (or yarn.lock)
COPY package*.json ./

# Install app dependencies including devDependencies needed for build
RUN npm install

# Copy the rest of the application's source code
COPY . .

# Compile TypeScript to JavaScript
RUN npm run build

# --- Production Stage ---
FROM node:18-alpine

WORKDIR /usr/src/app

# Copy package.json and package-lock.json for production dependencies
COPY package*.json ./

# Install only production dependencies
RUN npm install --omit=dev

# Copy the compiled JavaScript code from the builder stage
COPY --from=builder /usr/src/app/dist ./dist

# Copy .env file (or rely on environment variables provided by docker-compose)
# COPY .env ./.env

# Make port 3000 available
EXPOSE 3000

# Define the command to run your compiled app
CMD [ "node", "dist/server.js" ]
