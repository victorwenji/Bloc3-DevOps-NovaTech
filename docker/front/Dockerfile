FROM node:22-alpine

WORKDIR /app

COPY frontend/package*.json ./frontend/

RUN cd frontend && npm ci

COPY frontend ./frontend

ARG REACT_APP_API_URL=/api
ENV REACT_APP_API_URL=$REACT_APP_API_URL

ENV PORT=3005
ENV HOST=0.0.0.0

RUN cd frontend && npm run build

RUN npm install -g serve

EXPOSE 3005

CMD ["sh", "-c", "cd frontend && serve -s build -l 3005"]