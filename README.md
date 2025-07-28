# refresh-park-wait-node

A Node.js service to periodically fetch Disney World park queue-times and store them in your self-hosted PocketBase instance.

## Features
- Fetches queue-times from https://queue-times.com/parks/{park_id}/queue_times.json
- Stores ride wait times and status in PocketBase
- Runs every 5 minutes via cron
- Credentials and secrets are managed via environment variables

## Prerequisites
- Node.js v16 or higher
- A running PocketBase instance

## Setup

1. **Clone the repository** (or copy the files to your server):
   ```sh
   git clone <your-repo-url>
   cd refresh-park-wait-node
   ```

2. **Install dependencies:**
   ```sh
   npm install
   ```

3. **Configure environment variables:**
   Create a `.env` file in the project root:
   ```env
   PB_EMAIL=your@email.com
   PB_PASSWORD=yourpassword
   PB_URL=https://your-pocketbase-instance.com
   ```
   (Do not commit this file to git!)

4. **Run the service:**
   ```sh
   node queueTimesService.mjs
   ```
   The script will immediately fetch and store data, and then continue to run every 5 minutes.

## Notes
- Make sure your PocketBase instance is accessible from where this script runs.
- The `.gitignore` file is set up to exclude `node_modules` and `.env`.
- You can stop the service with `Ctrl+C`.

## Customization
- To change the parks, edit the `PARK_IDS` array in `queueTimesService.mjs`.
- To change the schedule, edit the cron expression in the same file.

## License
MIT
