# How to run the app

1. Open two terminals
2. Run the Rust server:
```bash
cd backend
cargo watch -x run
```
3. Run the React server:
```bash
cd frontend
npm run dev
```

You will need to refresh to see the changes on the Rust backend, but cargo watch recompiles everything automatically on file changes.

## After running (health check):
```bash
$ curl http://127.0.0.1:3000/api/ping
{"ok":true,"service":"plum-rockets-backend","sequence_id":0,"voxel_count":10}%
```

## Full voxel payload (returns seeded array)
```bash
$ curl http://127.0.0.1:3000/api/voxels
{"sequence_id":0,"voxels":[{"id":"0:0:0","x":0,"y":0,"z":0,"occupied":true,"entropy":0.02,"last_updated_seq":0},{"id":"1:0:0","x":1,"y":0,"z":0,"occupied":true,"entropy":0.04,"last_updated_seq":0},{"id":"2:0:0","x":2,"y":0,"z":0,"occupied":true,"entropy":0.08,"last_updated_seq":0},{"id":"0:1:0","x":0,"y":1,"z":0,"occupied":true,"entropy":0.1,"last_updated_seq":0},{"id":"1:1:0","x":1,"y":1,"z":0,"occupied":true,"entropy":0.12,"last_updated_seq":0},{"id":"2:1:0","x":2,"y":1,"z":0,"occupied":true,"entropy":0.16,"last_updated_seq":0},{"id":"0:2:0","x":0,"y":2,"z":0,"occupied":true,"entropy":0.18,"last_updated_seq":0},{"id":"1:2:0","x":1,"y":2,"z":0,"occupied":true,"entropy":0.2,"last_updated_seq":0},{"id":"2:2:0","x":2,"y":2,"z":0,"occupied":true,"entropy":0.24,"last_updated_seq":0},{"id":"1:1:1","x":1,"y":1,"z":1,"occupied":true,"entropy":0.3,"last_updated_seq":0}]}%                                                                        
$
```

## Initial delta (returns current state in `added`):
```bash
$ curl "http://127.0.0.1:3000/api/world/delta?since=0"
{"sequence_id":0,"added":[],"updated":[],"removed":[]}%   
```

## Simulate a world change:
```bash
$ curl -X POST http://127.0.0.1:3000/api/dev/tick
$
```
No output is expected (normal).

## Delta after mutation:
```bash
$ curl "http://127.0.0.1:3000/api/world/delta?since=0"
{"sequence_id":1,"added":[{"id":"2:1:0","x":2,"y":1,"z":0,"occupied":true,"entropy":0.62,"last_updated_seq":1},{"id":"3:1:0","x":3,"y":1,"z":0,"occupied":true,"entropy":0.81,"last_updated_seq":1},{"id":"0:2:0","x":0,"y":2,"z":0,"occupied":true,"entropy":0.55,"last_updated_seq":1},{"id":"1:1:1","x":1,"y":1,"z":1,"occupied":true,"entropy":0.78,"last_updated_seq":1}],"updated":[],"removed":[]}%
```
Should now see changed values, especially entropy and the toggled voxel.

**Nothing visible on frontend yet, but can do this to get basic wiring**:
### On page load
Fetch:
``` 
GET http://127.0.0.1:3000/api/voxels
```

### On interval
Poll:
```
GET http://127.0.0.1:3000/api/world/delta?since=<lastSequenceId>
```

### Optional demo button
Call:
```
POST http://127.0.0.1:3000/api/dev/tick
```