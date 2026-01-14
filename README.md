# KanBan
Lightweight Kanban task board with a React + TypeScript frontend and an Express + MongoDB backend.

## Setup

1) Install dependencies:
```
npm install
```

2) Configure environment:
- `client/.env.example` -> `client/.env`
- `server/.env.example` -> `server/.env`

3) Run the API:
```
npm run dev:server
```

4) Run the frontend:
```
npm run dev
```


## Run MongoDB Locally

macOS (Homebrew):
```
brew tap mongodb/brew
brew install mongodb-community@7.0
brew services start mongodb-community@7.0
```

Linux (systemd):
```
sudo systemctl start mongod
sudo systemctl status mongod
```

Docker (any OS):
```
docker run --name kanban-mongo -p 27017:27017 -d mongo:7
```
