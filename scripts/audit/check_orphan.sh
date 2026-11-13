#!/bin/bash
if [ -z "$1" ]; then
  echo "Usage: $0 <path_to_file>"
  exit 1
fi
FILE="$1"
FILENAME=$(basename "$FILE")
NAME="${FILENAME%.*}"

echo "Checking $FILE (name: $NAME)..."
MATCHES=$(grep -rn "$NAME" src/ | grep -v "$FILE")
if [ -z "$MATCHES" ]; then
  echo "RESULT: ORPHAN CONFIRMED"
else
  echo "RESULT: REFERENCED EXTERNAL"
  echo "$MATCHES"
fi
