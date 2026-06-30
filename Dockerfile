FROM node:22-alpine AS builder
WORKDIR /app

# Build-time WS URL — inlined into the bundle by Vite.
# Defaults to empty (demo mode with simulated price feed).
# Set to a real WebSocket URL for live broker data.
ARG VITE_WS_URL=
ENV VITE_WS_URL=${VITE_WS_URL}

COPY package*.json ./
RUN npm ci && npm cache clean --force
COPY . .
RUN npm run build

FROM nginx:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
