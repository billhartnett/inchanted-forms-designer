FROM node:20-slim AS build

ARG REQUIRE_RP9_EXTRACTOR_EMBEDDINGS=0

WORKDIR /workspace

# Copy the monorepo because backend/api depends on shared, wave8, and wave9.
COPY . .

# Install package dependencies from committed lockfiles.
RUN npm --prefix shared ci
RUN npm --prefix wave9 ci
RUN npm --prefix backend/api ci
RUN npm --prefix frontend ci

# Build dependency order: shared -> wave8 -> wave9 -> backend/api.
RUN npm --prefix shared run build
RUN npm --prefix wave8 run build
RUN npm --prefix wave9 run build
RUN npm --prefix backend/api run build
RUN npm --prefix frontend run build

# Fail the image build unless the compiled RP-8 projector validates its packaged artifacts.
RUN cd backend/api && PRODUCTION_BASELINE=RP-8 node -e \
	"const runtime=require('./dist/services/rp8OntologyRuntime.js').validateActiveRp8Runtime(); if(runtime.metadata.restorePoint!=='RP-8') process.exit(1)"
RUN cd backend/api && PRODUCTION_BASELINE=RP-8 SEMANTIC_BASELINE=RP-9 DEPLOYMENT_ENVIRONMENT=staging node -e \
	"const runtime=require('./dist/services/semanticOntologyRuntime.js').validateConfiguredSemanticRuntime(); if(runtime.metadata.restorePoint!=='RP-9') process.exit(1)"
RUN if [ "${REQUIRE_RP9_EXTRACTOR_EMBEDDINGS}" = "1" ]; then \
	node -e "const x=require('/workspace/acord-artifacts/rp9-extractor-embeddings.json'); if(x.provider!=='openai'||x.activation?.scope!=='staging'||x.entries?.length!==18) process.exit(1)"; \
	fi
RUN test -f /workspace/backend/api/dist/services/rp8OntologyRuntime.js
RUN test -f /workspace/backend/api/dist/services/rp9OntologyRuntime.js
RUN test -f /workspace/backend/api/dist/services/semanticOntologyRuntime.js
RUN test "$(find /workspace/backend/api/dist -type f -name '*wave8Gating*' | wc -l)" -eq 0
RUN ! grep -R -E 'wave8Gating|WAVE8_GATE|header_requires_supervision_boost' /workspace/backend/api/dist

FROM node:20-slim AS runtime

WORKDIR /app

# Keep runtime layout identical to build layout for file: dependencies and script roots.
COPY --from=build /workspace /app
COPY --from=build /workspace/test-fixtures/pdf /app/test-fixtures/pdf

# Extraction regression fixtures are a required ACA runtime asset.
RUN test "$(find /app/test-fixtures/pdf -maxdepth 1 -type f -name '*.pdf' | wc -l)" -gt 0

# Production runtime should only include runtime dependencies.
RUN find /app -type d -name node_modules -prune -exec rm -rf {} +
RUN npm --prefix /app/backend/api ci --omit=dev
# Runtime executes emitted JavaScript only; exclude TypeScript sources and test code.
RUN rm -rf /app/backend/api/src /app/backend/api/tests
RUN chown -R node:node /app

WORKDIR /app/backend/api

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

USER node

# Express host over emitted JS build artifacts.
CMD ["npm", "run", "start:express"]
