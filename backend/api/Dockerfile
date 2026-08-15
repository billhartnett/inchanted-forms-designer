FROM node:20-slim AS build

WORKDIR /workspace

# Copy the monorepo because backend/api depends on shared, wave8, and wave9.
COPY . .

# Install package dependencies from committed lockfiles.
RUN npm --prefix shared ci
RUN npm --prefix wave9 ci
RUN npm --prefix backend/api ci

# Build dependency order: shared -> wave8 -> wave9 -> backend/api.
RUN npm --prefix shared run build
RUN npm --prefix wave8 run build
RUN npm --prefix wave9 run build
RUN npm --prefix backend/api run build

FROM node:20-slim AS runtime

WORKDIR /app

# Keep runtime layout identical to build layout for file: dependencies and script roots.
COPY --from=build /workspace /app

# Production runtime should only include runtime dependencies.
RUN find /app -type d -name node_modules -prune -exec rm -rf {} +
RUN npm --prefix /app/backend/api ci --omit=dev
RUN chown -R node:node /app

WORKDIR /app/backend/api

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

USER node

# Express host over emitted JS build artifacts.
CMD ["npm", "run", "start:express"]
