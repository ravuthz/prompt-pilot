#!/bin/sh
set -eu

cd "$(dirname "$0")"
exec bun run mcp-server.ts
