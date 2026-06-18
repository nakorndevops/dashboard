#!/bin/bash

# ./reset-key.sh ~/project/key ~/project/jwt

# 1. STRICT MODE: Exit on error, undefined variables, and pipe failures
set -euo pipefail

# Configuration variables (readonly prevents accidental overwrites)
readonly KEY_LIST=("access-token" "refresh-token" "api-key")

# Resolve the directory of this script to reliably call sibling scripts
readonly SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
readonly JWT_SCRIPT="${SCRIPT_DIR}/reset-jwt.sh"

# 2. INPUT VALIDATION: Ensure BOTH target and jwt directories are provided
# Using $# checks the total number of arguments passed
if [ "$#" -lt 2 ]; then
    echo "Error: Missing required arguments."
    echo "Usage: $0 <target_directory_path> <jwt_directory_path>"
    exit 1
fi

# Use readonly for variables that shouldn't change during execution
readonly TARGET_DIR="$1"
readonly JWT_DIR="$2"
readonly API_KEY_DIR="api-key"

# 3. DEPENDENCY CHECKS: Ensure openssl and sibling scripts are available
if ! command -v openssl >/dev/null 2>&1; then
    echo "Error: 'openssl' command not found. Please install it first."
    exit 1
fi

if [ ! -x "$JWT_SCRIPT" ]; then
    echo "Error: Sibling script '$JWT_SCRIPT' not found or not executable."
    exit 1
fi

# 4. BACKUP EXISTING DIRECTORY
if [ -d "$TARGET_DIR" ]; then
    BACKUP_DIR="${TARGET_DIR}.old.$(date +%s)"
    echo "Backing up existing directory to: $BACKUP_DIR"
    mv "$TARGET_DIR" "$BACKUP_DIR"
fi

# 5. CREATE NEW TARGET DIRECTORY
echo "Creating target directory: $TARGET_DIR"
mkdir -p "$TARGET_DIR"

echo "Generating certificates..."

for cert in "${KEY_LIST[@]}"; do
    
    DIR="$TARGET_DIR/$cert"
    
    # Create sub-directory
    mkdir -p "$DIR"
    
    echo " -> Generating Keys for: $cert"
    
    # Generate .key and .crt 
    # (2>/dev/null silences OpenSSL's default chatter, while set -e ensures it still crashes if it fails)
    openssl req -x509 -nodes -days 370 -newkey rsa:2048 \
        -keyout "${DIR}/private.pem" \
        -out "${DIR}/public.pem" \
        -subj "/C=TH/ST=Trang/L=Thap Thiang/O=Trang Hospital Company/OU=Department of Digital Health/CN=${cert}/emailAddress=nakorn.devops@gmail.com" \
        2>/dev/null
    
    # 6. SECURITY: Restrict permissions on the private key
    chmod 600 "${DIR}/private.pem"
    
    echo "    Success: ${DIR}/private.pem and ${DIR}/public.pem created."
    
done

echo "----------------------------------------"
echo "Key generation complete!"

# 7. EXECUTE SIBLING SCRIPT
echo "Invoking JWT reset script..."
"$JWT_SCRIPT" "${TARGET_DIR}/${API_KEY_DIR}/private.pem" "${JWT_DIR}"