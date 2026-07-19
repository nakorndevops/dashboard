#!/bin/bash

# ./reset-jwt.sh ~/project/key/api-key/private.pem ~/project/jwt

# 1. STRICT MODE: Exit on error, undefined variables, and pipe failures
set -euo pipefail

# Configuration variables (readonly prevents accidental overwrites)
readonly JWT_LIST=("authorized-server" "login" "nutrition" "monitor-drug" "monitor-appointment")

# 2. INPUT VALIDATION: Ensure both arguments are provided
if [ "$#" -ne 2 ]; then
    echo "Error: Private key path and target directory must be provided."
    echo "Usage: $0 <path_to_private_key> <target_directory_path>"
    exit 1
fi

PRIVATE_KEY="$1"
TARGET_DIR="$2"

# Ensure the private key file exists
if [ ! -f "$PRIVATE_KEY" ]; then
    echo "Error: Private key file not found at: $PRIVATE_KEY"
    exit 1
fi

# Backup existing directory
if [ -d "$TARGET_DIR" ]; then
    BACKUP_DIR="${TARGET_DIR}.old.$(date +%s)"
    echo "Backing up existing directory to: $BACKUP_DIR"
    mv "$TARGET_DIR" "$BACKUP_DIR"
fi

# Create new target directory
echo "Creating target directory: $TARGET_DIR"
mkdir -p "$TARGET_DIR"

echo "Generating JWT..."

for cert in "${JWT_LIST[@]}"; do
    
    DIR="$TARGET_DIR/$cert"
    OUTPUT_FILE="${DIR}/client-secret.jwt"
    
    # Create sub directory
    mkdir -p "$DIR"
    
    echo " -> Generating JWT for: $cert"
        
    # Generate .jwt payload
    PAYLOAD=$(jq -n -c --arg c "${cert}" '{user: $c, usertype: "app"}')
    
    # Encode JWT using the provided private key
    jwt encode --alg RS256 --secret "@${PRIVATE_KEY}" "$PAYLOAD" > "$OUTPUT_FILE"
    
    # 4. SECURITY: Restrict permissions on the generated secret file
    chmod 600 "$OUTPUT_FILE"
    
    echo "    Success: $OUTPUT_FILE created."
    
done

echo "----------------------------------------"
echo "Done!"