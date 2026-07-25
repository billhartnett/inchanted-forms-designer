FROM node:20-slim AS build

WORKDIR /workspace

# Copy the monorepo because backend/api depends on shared, wave8, and wave9.
COPY . .

# Avoid recursive self-reference installs inside backend/api.
RUN npm pkg delete dependencies.inchanted-forms-designer --prefix backend/api

# Install package dependencies with npm only.
RUN npm --prefix shared install
RUN npm --prefix wave8 install
RUN npm --prefix wave9 install
RUN npm --prefix backend/api install

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

WORKDIR /app/backend/api

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# Express host over emitted JS build artifacts.
CMD ["npm", "run", "start:express"]
