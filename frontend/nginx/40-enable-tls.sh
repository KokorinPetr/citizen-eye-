#!/bin/sh
# Runs before nginx starts (nginx image: /docker-entrypoint.d/). Turns on HTTPS only when an
# origin certificate is mounted; otherwise the site is served on port 80 only.
set -e
if [ -f /etc/nginx/certs/origin.pem ] && [ -f /etc/nginx/certs/origin.key ]; then
    cp /etc/nginx/optional/tls.conf /etc/nginx/conf.d/tls.conf
    echo "civic-eye: origin certificate found, HTTPS on :443 enabled"
else
    rm -f /etc/nginx/conf.d/tls.conf
    echo "civic-eye: no certificate in /etc/nginx/certs, serving HTTP on :80 only"
fi
