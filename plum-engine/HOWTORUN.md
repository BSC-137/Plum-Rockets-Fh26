# How to run the app

1. Open two terminals
2. Run the Rust server:
```
cd backend
cargo watch -x run
```
3. Run the React server:
```
cd frontend
npm run dev
```

You will need to refresh to see the changes on the Rust backend, but cargo watch recompiles everything automatically on file changes.