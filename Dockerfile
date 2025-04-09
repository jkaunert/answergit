# Use official Node.js image as base
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy package files first to leverage caching
COPY package*.json ./

# Install dependencies
RUN pnpm install

# Copy only necessary files
COPY .dockerignore .
COPY package*.json .
COPY next.config.mjs .
COPY tsconfig.json .
COPY components.json .
COPY postcss.config.mjs .
COPY tailwind.config.ts .
COPY app ./app
COPY components ./components
COPY lib ./lib
COPY public ./public
COPY styles ./styles

# Expose the port
EXPOSE 3000

# Set environment variables as build arguments
ARG GITHUB_TOKEN
ENV GITHUB_TOKEN=

# Build and start the application with environment variables at runtime
CMD ["sh", "-c", "pnpm run build && pnpm start"]
