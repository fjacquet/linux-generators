# syntax=docker/dockerfile:1

# --- build stage: produce the static bundle, served from root ('/') ---
# (The GitHub Pages build uses base '/linux-generators/'; for the container the
#  app is served at the domain root, so override Vite's base to '/'.)
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build -- --base=/

# --- serve stage: nginx serving the static bundle ---
FROM nginx:1.27-alpine AS serve
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
# nginx:alpine already runs `nginx -g 'daemon off;'` as its default CMD.
