FROM node:12-stretch

# Add metadata about the image
LABEL maintainer="David Rolin david.rolin@rd-services.be"
LABEL description="Home Assistant Verisure alarm integration through MQTT."

# Create app dir inside container
WORKDIR /nodeapp

# Install app dependencies separately (creating a separate layer for node_modules, effectively caching them between image rebuilds)
COPY package.json .
RUN npm install

# Copy app's source files
COPY . .

# Create and use non-root user 
RUN groupadd -r nodejs \
   && useradd -m -r -g nodejs nodejs

USER nodejs

CMD ["node", "index.js"]
