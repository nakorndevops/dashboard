#!/bin/bash

# 1. STRICT MODE: Exit on error, undefined variables, and pipe failures
set -euo pipefail

# Configuration variables (readonly prevents accidental overwrites)
readonly CONTAINER_LIST=("public" "login" "logout" "nutrition" "refresh-token-renewer" "hosxp-api" "authorized-server" "webhook")
readonly COMBINE_CERT="combine_ssl.pem"

# 2. INPUT VALIDATION: Ensure target directory is provided
if [ -z "${1:-}" ]; then
    echo "Error: Target directory must be provided as the first argument."
    echo "Usage: $0 <target_directory_path>"
    exit 1
fi
# ./reset-ssl.sh project/ssl

TARGET_DIR="$1"

# 3. DEPENDENCY CHECK: Ensure openssl is installed
if ! command -v openssl >/dev/null 2>&1; then
    echo "Error: 'openssl' command not found. Please install it first."
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

# Initialize the combined cert file safely
COMBINED_FILE="$TARGET_DIR/$COMBINE_CERT"
> "$COMBINED_FILE"

echo "Generating certificates..."

for cert in "${CONTAINER_LIST[@]}"; do
    
    DIR="$TARGET_DIR/$cert"
    FILENAME="${DIR}/${cert}"
    
    # Create sub directory
    mkdir -p "$DIR"
    
    echo " -> Generating SSL for: $cert"
    
    # Generate .key and .crt
    openssl req -x509 -nodes -days 370 -newkey rsa:2048 \
        -keyout "${FILENAME}.key" \
        -out "${FILENAME}.crt" \
        -subj "/C=TH/ST=Trang/L=Thap Thiang/O=Trang Hospital Company/OU=Department of Digital Health/CN=${cert}/emailAddress=nakorn.devops@gmail.com"
    
    # 4. SECURITY: Restrict permissions on the private key
    chmod 600 "${FILENAME}.key"
    
    # Append to combine_cert.pem
    cat "${FILENAME}.crt" >> "$COMBINED_FILE"
    
    echo "    Success: ${FILENAME}.key and ${FILENAME}.crt created."
    
done

echo "----------------------------------------"
echo "Done! All certificates combined into: $COMBINED_FILE"

cp -r tranghos-ssl "$TARGET_DIR"
echo "tranghos SSL was inserted"