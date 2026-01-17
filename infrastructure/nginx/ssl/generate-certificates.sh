#!/bin/bash

############################################################################
# SSL/TLS Certificate Generation for Zentoria Personal Edition
# Generates self-signed certificates for .local domain development
# Also includes Let's Encrypt automation setup for production
# Updated: 2026-01-16
############################################################################

set -e

CERT_DIR="/etc/nginx/ssl"
DOMAINS=(
    "zentoria.local"
    "*.zentoria.local"
    "ui.zentoria.local"
    "api.zentoria.local"
    "ws.zentoria.local"
    "n8n.zentoria.local"
    "vault.zentoria.local"
    "ai.zentoria.local"
    "ollama.zentoria.local"
    "logs.zentoria.local"
    "prometheus.zentoria.local"
    "files.zentoria.local"
    "s3.zentoria.local"
    "auth.zentoria.local"
    "redis.zentoria.local"
    "ocr.zentoria.local"
    "voice.zentoria.local"
    "docs.zentoria.local"
    "swagger.zentoria.local"
    "rag.zentoria.local"
    "qdrant.zentoria.local"
)

echo "Zentoria SSL/TLS Certificate Generation"
echo "=========================================="
echo ""

# Function: Generate Self-Signed Certificate
generate_selfsigned() {
    echo "[*] Generating self-signed certificate for development..."

    # Create certificate directory
    mkdir -p "$CERT_DIR"

    # Generate private key
    openssl genrsa -out "$CERT_DIR/zentoria.key" 2048 2>/dev/null
    echo "[+] Generated private key: $CERT_DIR/zentoria.key"

    # Generate certificate signing request
    openssl req -new -key "$CERT_DIR/zentoria.key" \
        -out "$CERT_DIR/zentoria.csr" \
        -subj "/C=NL/ST=North Holland/L=Amsterdam/O=Zentoria/CN=zentoria.local" \
        2>/dev/null
    echo "[+] Generated CSR: $CERT_DIR/zentoria.csr"

    # Create SAN configuration
    cat > "$CERT_DIR/san.conf" << EOF
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
x509_extensions = v3_req

[req_distinguished_name]

[v3_req]
subjectAltName = $(printf '%s,' "${DOMAINS[@]}" | sed 's/,$//')
keyUsage = keyEncipherment, dataEncipherment
extendedKeyUsage = serverAuth
EOF

    # Generate self-signed certificate with SAN
    openssl x509 -req -days 3650 \
        -in "$CERT_DIR/zentoria.csr" \
        -signkey "$CERT_DIR/zentoria.key" \
        -out "$CERT_DIR/zentoria.crt" \
        -extensions v3_req \
        -extfile "$CERT_DIR/san.conf" \
        2>/dev/null
    echo "[+] Generated certificate: $CERT_DIR/zentoria.crt"

    # Set proper permissions
    chmod 600 "$CERT_DIR/zentoria.key"
    chmod 644 "$CERT_DIR/zentoria.crt"
    echo "[+] Set certificate permissions"

    echo ""
    echo "[+] Self-signed certificate generated successfully!"
    echo "    Certificate: $CERT_DIR/zentoria.crt"
    echo "    Private Key: $CERT_DIR/zentoria.key"
    echo "    Valid for: 10 years (3650 days)"
    echo ""
}

# Function: Generate DH Parameters
generate_dh_params() {
    echo "[*] Generating DH parameters (this may take a minute)..."

    if [[ ! -f "$CERT_DIR/dhparam.pem" ]]; then
        openssl dhparam -out "$CERT_DIR/dhparam.pem" 2048
        chmod 600 "$CERT_DIR/dhparam.pem"
        echo "[+] Generated DH parameters: $CERT_DIR/dhparam.pem"
    else
        echo "[*] DH parameters already exist, skipping..."
    fi
}

# Function: Setup Let's Encrypt with Certbot (Optional)
setup_letsencrypt() {
    echo ""
    echo "Let's Encrypt Setup (Optional for Production)"
    echo "=============================================="
    echo ""

    # Check if certbot is installed
    if ! command -v certbot &> /dev/null; then
        echo "[*] Certbot not found. Installing certbot..."
        apt-get update
        apt-get install -y certbot python3-certbot-nginx
    fi

    # Create renewal script
    cat > /etc/nginx/ssl/renew-certs.sh << 'EOF'
#!/bin/bash
# Auto-renewal script for Let's Encrypt certificates

CERT_DIR="/etc/nginx/ssl"
LOG_FILE="/var/log/nginx/cert-renewal.log"

echo "[$(date)] Starting certificate renewal check..." >> "$LOG_FILE"

for domain in zentoria.local *.zentoria.local; do
    if certbot renew --agree-tos -q >> "$LOG_FILE" 2>&1; then
        echo "[$(date)] Successfully renewed certificates" >> "$LOG_FILE"
        nginx -s reload
    else
        echo "[$(date)] Certificate renewal failed or not needed" >> "$LOG_FILE"
    fi
done

echo "[$(date)] Certificate renewal check completed" >> "$LOG_FILE"
EOF

    chmod +x /etc/nginx/ssl/renew-certs.sh
    echo "[+] Created renewal script: /etc/nginx/ssl/renew-certs.sh"

    # Add crontab entry for automatic renewal
    if ! grep -q "renew-certs.sh" /etc/crontab 2>/dev/null; then
        echo "0 3 * * * root /etc/nginx/ssl/renew-certs.sh" >> /etc/crontab
        echo "[+] Added crontab entry for daily renewal at 03:00"
    fi

    echo ""
    echo "[!] To use Let's Encrypt in production:"
    echo "    1. Replace DNS to point to your server"
    echo "    2. Run: certbot certonly --webroot -w /var/www/html -d zentoria.local"
    echo "    3. Update nginx configuration with paths to Let's Encrypt certs"
    echo ""
}

# Function: Verify Certificate
verify_certificate() {
    echo "[*] Verifying certificate..."
    echo ""

    if [[ -f "$CERT_DIR/zentoria.crt" ]]; then
        openssl x509 -in "$CERT_DIR/zentoria.crt" -text -noout | grep -E "(Subject:|Issuer:|Not Before|Not After|CN =|DNS:)" || true
        echo ""
    fi
}

# Function: Display Certificate Info
display_info() {
    echo "Certificate Information:"
    echo "========================"
    echo ""

    if [[ -f "$CERT_DIR/zentoria.crt" ]]; then
        echo "Certificate file: $CERT_DIR/zentoria.crt"
        echo "Private key file: $CERT_DIR/zentoria.key"
        echo ""

        # Extract expiration date
        EXPIRATION=$(openssl x509 -enddate -noout -in "$CERT_DIR/zentoria.crt" | cut -d= -f2)
        echo "Certificate expires: $EXPIRATION"
        echo ""

        # List SANs
        echo "Subject Alternative Names (SANs):"
        openssl x509 -in "$CERT_DIR/zentoria.crt" -text -noout | grep -A1 "Subject Alternative Name" | tail -1 || echo "  No SANs found"
        echo ""
    fi
}

# Main Execution
main() {
    case "${1:-generate}" in
        generate)
            generate_selfsigned
            generate_dh_params
            verify_certificate
            display_info
            ;;
        letsencrypt)
            setup_letsencrypt
            ;;
        renew)
            if [[ -f /etc/nginx/ssl/renew-certs.sh ]]; then
                /etc/nginx/ssl/renew-certs.sh
            else
                echo "[!] Renewal script not found. Run 'setup letsencrypt' first."
            fi
            ;;
        verify)
            verify_certificate
            ;;
        info)
            display_info
            ;;
        *)
            echo "Usage: $0 {generate|letsencrypt|renew|verify|info}"
            echo ""
            echo "Commands:"
            echo "  generate      - Generate self-signed certificate (default)"
            echo "  letsencrypt   - Setup Let's Encrypt automation"
            echo "  renew         - Manually renew Let's Encrypt certificates"
            echo "  verify        - Verify certificate validity"
            echo "  info          - Display certificate information"
            exit 1
            ;;
    esac
}

main "$@"
