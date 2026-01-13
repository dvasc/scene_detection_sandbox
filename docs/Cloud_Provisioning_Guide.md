# Cloud Provisioning Guide: Google Compute Engine (GCE)

This guide details the process for deploying the **Scene Detection Sandbox** on Google Cloud Platform. The system relies on specific hardware acceleration (NVIDIA GPUs) for local VLM inference and video processing (FFmpeg), so correct environment configuration is critical.

## 1. Prerequisites

* **Google Cloud Project**: An active GCP project with billing enabled.
* **GPU Quota**: Sufficient quota for **NVIDIA L4** (recommended) or **NVIDIA T4** GPUs in your target region.
* **SSH Access**: Ability to SSH into your VM instance via Cloud Console or local terminal.
* **Ngrok Account**: A free account at [ngrok.com](https://ngrok.com) to obtain an authtoken for remote access.

## 2. Recommended Instance Configuration

When creating a VM instance in GCE, use the following specifications:

* **Machine Family**: GPU
* **Series**: G2 (NVIDIA L4) or N1 (NVIDIA T4)
* **Machine Type**: `g2-standard-4` (4 vCPUs, 16GB RAM) or `n1-standard-4`
* **GPU**: 1x NVIDIA L4 (24GB VRAM) or 1x NVIDIA T4 (16GB VRAM)
  * *Note: L4 is highly recommended for faster VLM inference speeds.*
* **Boot Disk**:
  * **OS**: Ubuntu
  * **Version**: **Ubuntu 22.04 LTS** OR **Ubuntu 24.04 LTS** (x86/64)
  * **Size**: 100 GB+ (Standard Persistent Disk or SSD)
* **Firewall**: Allow HTTP/HTTPS traffic.

## 3. Automated Installation

Our automated scripts handle system updates, NVIDIA driver installation, CUDA toolkit configuration, and FFmpeg setup.

1. **SSH into your instance**:

   ```bash
   gcloud compute ssh <your-instance-name> --zone <your-zone>
   ```

2. **Install Prerequisites**:
   Install `git` and `python3-full`. The `python3-full` package is essential for Ubuntu 24.04 to ensure virtual environment creation succeeds.

   ```bash
   sudo apt-get update && sudo apt-get install -y git python3-full
   ```

3. **Clone the Repository**:

   ```bash
   git clone https://github.com/dvasc/scene_detection_sandbox.git
   cd scene_detection_sandbox
   ```

4. **Execute the Provisioning Script**:
   The script will automatically detect your Ubuntu version and install the compatible drivers, **CUDA 12.6**, and **FFmpeg**.

   ```bash
   chmod +x deploy/setup_gce.sh
   ./deploy/setup_gce.sh
   ```

5. **Reboot (MANDATORY)**:
   After the script completes successfully, you **must** reboot the instance for the NVIDIA kernel modules to load.

   ```bash
   sudo reboot
   ```

## 4. Launching the Application

After the instance restarts, reconnect via SSH and launch the sandbox.

1. **Navigate to the directory**:
   ```bash
   cd scene_detection_sandbox
   ```

2. **Run the Launch Script**:
   This script will handle virtual environment creation and dependency installation. On the first run, it will ask for your `NGROK_AUTHTOKEN`.

   ```bash
   chmod +x deploy/launch.sh
   ./deploy/launch.sh
   ```

3. **Access the Interface**:
   Look for the output in the terminal:
   ```text
   🚀 PUBLIC CLOUD ACCESS ENABLED
   🔗 ACCESS UI HERE: https://<random-id>.ngrok-free.app
   ```
   Click the link to open the Sandbox in your local browser.

## 5. Troubleshooting Common Issues

### Issue: UI Hardware Telemetry says "HARDWARE NOT DETECTED"
* **Cause**: The NVIDIA drivers are not loaded, or the instance was not rebooted after running the setup script.
* **Solution**:
  1. Run `nvidia-smi`. If this fails, the drivers are not active.
  2. Ensure you have run `deploy/setup_gce.sh`.
  3. **Reboot the instance** using `sudo reboot`.

### Issue: "FFmpeg not found" or Frame Extraction Fails
* **Cause**: The provisioning script failed to install FFmpeg, or the path is not set.
* **Solution**:
  1. Verify installation: `ffmpeg -version`.
  2. If missing, install manually: `sudo apt-get install -y ffmpeg`.

### Issue: Ngrok tunnel fails to start
* **Cause**: Invalid or missing authtoken in `.env`.
* **Solution**:
  1. Check your `.env` file: `cat .env`
  2. Ensure `NGROK_AUTHTOKEN` is set correctly.
  3. You can manually edit it with `nano .env`.
