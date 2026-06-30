FROM node:22-alpine
WORKDIR /app
COPY deriv-proxy.js .
RUN npm init -y > /dev/null 2>&1 && npm install ws@^8.21.0
EXPOSE 8091
CMD ["node", "deriv-proxy.js"]
