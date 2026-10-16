#!/bin/sh

pm2 status

pm2 start ecosystem.config.cjs

# pm2 logs prompt-pilot
# pm2 logs prompt-pilot-tunnel

pm2 save