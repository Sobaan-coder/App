#!/bin/bash
# Double-click in Finder to start KHOKHAR, then open http://localhost:3000
cd "$(dirname "$0")/../.."
echo "Starting KHOKHAR… keep this window open. Opening http://localhost:3000"
( sleep 6; open http://localhost:3000 ) &
npm start
