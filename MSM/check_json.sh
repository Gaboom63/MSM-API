#!/bin/bash

# Ensure jq is installed
if ! command -v jq &> /dev/null; then
    echo "❌ Error: 'jq' is not installed. Install it with: sudo apt install jq"
    exit 1
fi

echo "🔍 Scanning for JSON errors starting from: $(pwd)"
echo "------------------------------------------------"

# Find all .json files and check them
find . -type f -name "*.json" | while read -r file; do
    if ! jq . "$file" > /dev/null 2>&1; then
        echo "❌ Invalid JSON: $file"
        # Optional: Print the specific error message
        jq . "$file" 2>&1 | sed 's/^/  / '
        echo "------------------------------------------------"
    fi
done

echo "✅ Scan complete."
