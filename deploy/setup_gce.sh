#!/bin/bash

# ==============================================================================
# Scene Detection Playground | GCE Provisioning Script
# ==============================================================================
# Automates setup for Ubuntu 22.04 / 24.04 on Google Compute Engine.
# Installs: NVIDIA Drivers, CUDA 12.6, Python 3.10+, FFmpeg, and System Deps.
# ==============================================================================

# Exit immediately if a command exits with a non-zero status
set -e

log() {
    echo -e "\n\033[1;32m[SETUP] $(date +'%Y-%m-%dT%H:%M:%S%z') - $1\033[0m\n"
}

error() {
    echo -e "\n\033[1;31m[ERROR] $(date +'%Y-%m-%dT%H:%M:%S%z') - $1\033[0m\n"
    exit 1
}

log "Initializing Environment Setup for Scene Detection Playground..."

# 1. OS Detection
if [ -f /etc/os-release ]; then
    . /etc/os-release
    DISTRO=$ID
    VERSION_CLEAN=$(echo $VERSION_ID | tr -d '.')
    ARCH=$(uname -m)
else
    error "Cannot detect OS information."
fi

log "Detected Environment: OS=$DISTRO, Version=$VERSION_ID, Arch=$ARCH"

# 2. System Updates & Base Dependencies
log "Updating system package lists..."
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -yq

log "Installing Python, Build Dependencies, and FFmpeg..."
# 'python3-full' is critical for venv on Ubuntu 24.04+
# 'ffmpeg' is required for the CVEngine frame extraction pipeline
sudo apt-get install -y wget git python3-pip python3-full build-essential ffmpeg

# 3. NVIDIA CUDA & Driver Installation
log "Configuring NVIDIA CUDA Repositories..."
# Dynamic URL works for ubuntu2204 and ubuntu2404
KEYRING_URL="https://developer.download.nvidia.com/compute/cuda/repos/${DISTRO}${VERSION_CLEAN}/${ARCH}/cuda-keyring_1.1-1_all.deb"

wget "$KEYRING_URL" -O cuda-keyring.deb || error "Failed to download NVIDIA keyring"
sudo dpkg -i cuda-keyring.deb
sudo apt-get update

log "Installing CUDA Toolkit 12.6 and Drivers..."
# Using 12-6 for broad compatibility with modern VLM inference libraries
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y cuda-toolkit-12-6 cuda-drivers

# 4. Environment Configuration
log "Configuring Path Variables..."

# Add CUDA paths to .bashrc if not present
if ! grep -q "cuda-12.6" ~/.bashrc; then
    echo 'export PATH=/usr/local/cuda-12.6/bin:$PATH' >> ~/.bashrc
    echo 'export LD_LIBRARY_PATH=/usr/local/cuda-12.6/lib64:/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH' >> ~/.bashrc
fi

# Export for current session so subsequent scripts might use it immediately if needed
export PATH=/usr/local/cuda-12.6/bin:$PATH
export LD_LIBRARY_PATH=/usr/local/cuda-12.6/lib64:/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH

# 5. Verification
log "Verifying Installation..."

if command -v nvidia-smi &> /dev/null; then
    log "NVIDIA Driver detected."
else
    log "⚠️  nvidia-smi not found yet. This is normal before reboot."
fi

if command -v ffmpeg &> /dev/null; then
    log "FFmpeg detected."
else
    error "FFmpeg installation failed."
fi

log "✅ Setup Complete! You MUST reboot now: 'sudo reboot'"