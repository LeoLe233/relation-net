#!/bin/sh
cd -- "$(dirname -- "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then
  python3 start-local.py
else
  echo "Python 3 is required. Install it from python.org, then try again."
fi
printf '\nPress Enter to close...'
read -r answer
