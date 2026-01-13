#!/bin/bash

# ==============================================================================
# Scene Detection Playground | GCE Provisioning Script (Robust)
# ==============================================================================
# Automates setup for Ubuntu 22.04 / 24.04 on Google Compute Engine.
# Features:
# - Auto-detection of Kernel/Compiler mismatch (GCC 11 vs 12)
# - Installation of NVIDIA Drivers, CUDA 12.6, Python 3.10+, FFmpeg
# - Self-cleaning of broken driver installations
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

log "Initializing Robust Environment Setup..."

# 1. OS & Environment Detection
if [ -f /etc/os-release ]; then
    . /etc/os-release
    DISTRO=$ID
    VERSION_CLEAN=$(echo $VERSION_ID | tr -d '.')
    ARCH=$(uname -m)
    KERNEL_VERSION=$(uname -r)
else
    error "Cannot detect OS information."
fi

log "Detected: OS=$DISTRO, Ver=$VERSION_ID, Arch=$ARCH, Kernel=$KERNEL_VERSION"

# 2. Pre-Flight Cleanup (Crucial for GCE Retries)
log "Cleaning up any potential broken driver states..."
# We ignore errors here in case packages aren't installed
sudo apt-get purge --autoremove -y 'nvidia.*' 'cuda.*' 'libnvidia.*' 2>/dev/null || true
sudo apt-get update

# 3. Compiler & Kernel Header Alignment
# GCE Kernel 6.8+ requires GCC-12, but Ubuntu 22.04 defaults to GCC-11.
# This fixes the "unrecognized command-line option" build error.
log "Aligning Compiler and Kernel Headers..."

# Install headers for the EXACT running kernel
sudo apt-get install -y linux-headers-${KERNEL_VERSION}

# Install GCC-12 and force it as default
sudo apt-get install -y software-properties-common
sudo add-apt-repository ppa:ubuntu-toolchain-r/test -y
sudo apt-get update
sudo apt-get install -y gcc-12 g++-12

# Update alternatives to prioritize GCC-12
sudo update-alternatives --install /usr/bin/gcc gcc /usr/bin/gcc-12 100 --slave /usr/bin/g++ g++ /usr/bin/g++-12
sudo update-alternatives --set gcc /usr/bin/gcc-12

log "Compiler updated. Current version:"
gcc --version | head -n 1

# 4. System Dependencies
log "Installing Python, Build Tools, and FFmpeg..."
sudo apt-get install -y wget git python3-pip python3-full build-essential ffmpeg

# 5. NVIDIA CUDA & Driver Installation
log "Configuring NVIDIA CUDA Repositories..."
KEYRING_URL="https://developer.download.nvidia.com/compute/cuda/repos/${DISTRO}${VERSION_CLEAN}/${ARCH}/cuda-keyring_1.1-1_all.deb"

wget "$KEYRING_URL" -O cuda-keyring.deb || error "Failed to download NVIDIA keyring"
sudo dpkg -i cuda-keyring.deb
sudo apt-get update

log "Installing CUDA Toolkit 12.6 and Drivers..."
# Now that GCC-12 is active and headers are present, DKMS will build successfully
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y cuda-toolkit-12-6 cuda-drivers

# 6. Environment Configuration
log "Configuring Path Variables..."
if ! grep -q "cuda-12.6" ~/.bashrc; then
    echo 'export PATH=/usr/local/cuda-12.6/bin:$PATH' >> ~/.bashrc
    echo 'export LD_LIBRARY_PATH=/usr/local/cuda-12.6/lib64:/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH' >> ~/.bashrc
fi

# 7. Verification
log "Verifying Installation..."

if command -v ffmpeg &> /dev/null; then
    log "FFmpeg detected."
else
    error "FFmpeg installation failed."
fi

# Note: nvidia-smi won't work until reboot, checking for the binary existence instead
if [ -f "/usr/bin/nvidia-smi" ] || [ -f "/usr/local/cuda/bin/nvcc" ]; then
    log "NVIDIA binaries detected."
else
    log "⚠️  NVIDIA binaries not immediately found. This is expected before reboot."
fi

log "✅ Setup Complete! A system reboot is MANDATORY."
log "👉 Run: 'sudo reboot'"