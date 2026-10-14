FROM node:24-bookworm-slim AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM rust:1-bookworm AS backend
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY server-rust ./server-rust
COPY src-tauri ./src-tauri
RUN cargo build --locked --release -p quizcraft-server

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* \
    && useradd --system --create-home quizcraft
ENV NODE_ENV=production PORT=3001 DATABASE_PATH=/var/lib/quizcraft/quizcraft.sqlite
WORKDIR /app
COPY --from=backend /app/target/release/quizcraft-server /usr/local/bin/quizcraft-server
COPY --from=frontend /app/dist ./dist
RUN mkdir -p /var/lib/quizcraft && chown -R quizcraft:quizcraft /var/lib/quizcraft
USER quizcraft
EXPOSE 3001
CMD ["quizcraft-server"]
