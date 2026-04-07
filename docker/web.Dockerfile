FROM node:20-slim

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./

# Copy package.json files for dependency resolution
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

# Install dependencies
RUN pnpm install

# Copy source
COPY packages/shared packages/shared
COPY apps/web apps/web

EXPOSE 3000

CMD ["pnpm", "--filter", "web", "dev"]
