FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source files
COPY smidra-server.js ./
COPY job-list-widget.html ./
COPY job-list-widget-v2.html ./
COPY job-detail-widget.html ./
COPY salary-widget.html ./

# Expose port
EXPOSE 8002

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8002/health || exit 1

# Start server
CMD ["node", "smidra-server.js"]
