FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci || npm install

COPY . .

# Build the Astro project
RUN npm run build

# Set environment variables for Astro
ENV HOST=0.0.0.0
ENV PORT=4321

EXPOSE 4321

CMD ["npm", "start"]
