# Scene Detection Playground

Scene Detection Playground is a specialized, standalone model evaluation sandbox extracted from the SceneMark-AI ecosystem. It is designed for researchers and engineers to rapidly test multimodal Large Language Models (specifically Qwen3-VL and Gemini 2.0/3.0) on their ability to detect narrative scene boundaries in video sequences.

## 1. Overview

The application provides a high-fidelity environment to upload videos, execute sliding-window inference across varying context sizes, and inspect the model's internal "thinking" traces via a dedicated forensic terminal.

It is designed for both **Local Development** on consumer hardware and **Cloud Deployment** on high-performance GPU instances (Google Cloud Platform), offering a seamless path from prototyping to scale.

## 2. Prerequisites

* **Python 3.10+**
* **FFmpeg**: Required for frame extraction. Ensure `ffmpeg` is in your system's PATH.
* **Google AI Studio API Key**: Required if testing Gemini models.
* **NVIDIA GPU (12GB+ VRAM)**: Recommended for local Qwen3-VL (2B/7B) inference.
* **Ngrok Account** (Optional): Required for remote access if deploying to the cloud.

## 3. Cloud Deployment (Google Compute Engine)

This project includes a battle-tested automated deployment suite for Google Cloud Platform (GCE). This is the recommended way to run the playground if you do not have a powerful local GPU.

### Step 1: Provision Instance
Follow our detailed [**Cloud Provisioning Guide**](docs/Cloud_Provisioning_Guide.md) to create a VM instance with the correct GPU (NVIDIA L4/T4) and OS (Ubuntu 22.04/24.04).

### Step 2: Automated Setup
SSH into your fresh instance and run the one-click provisioning script. This handles NVIDIA drivers, CUDA 12.6, Python, and FFmpeg installation automatically.

```bash
# Clone the repo
git clone https://github.com/your-username/scene_detection_playground.git
cd scene_detection_playground

# Run Setup (Requires Reboot)
chmod +x deploy/setup_gce.sh
./deploy/setup_gce.sh
sudo reboot
```

### Step 3: Launch
After rebooting, reconnect via SSH and start the application using the resilient launcher.

```bash
cd scene_detection_playground
chmod +x deploy/launch.sh
./deploy/launch.sh
```

*   **First Run**: You will be prompted to paste your **Ngrok Authtoken** (get it from [ngrok.com](https://ngrok.com)).
*   **Access**: The script will output a public URL (e.g., `https://<random-id>.ngrok-free.app`). Click this to access the Playground from your local browser.

## 4. Local Setup (Manual)

If you prefer running locally on your own hardware:

1. **Clone and Initialize Environment:**
   ```powershell
   cd scene_detection_playground
   python -m venv .venv
   .venv\Scripts\Activate.ps1  # Windows
   # source .venv/bin/activate # Linux/Mac
   pip install -r requirements.txt
   ```

2. **Configure Environment:**
   Copy the example configuration:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` to add your `GEMINI_API_KEY` and `SECRET_KEY`.

3. **Run the Application:**
   ```powershell
   python run.py
   ```

4. **Access the Interface:**
   Open `http://127.0.0.1:5000` in your browser.

## 5. Usage Workflow

1. **Configure**: Select your target model (Cloud Gemini or Local Qwen) and set the context window size (number of shots processed in a single prompt).
2. **Upload**: Drag and drop a video file.
3. **Analyze**: The system will automatically detect technical shots via PySceneDetect, extract visual anchors, and dispatch requests to the selected VLM.
4. **Inspect**: Use the **Forensic Narrative Audit** sidebar to review the timeline. Click "Debug" to see the real-time pipeline logs and the raw JSON/Thinking outputs from the model.

## 6. Directory Structure

* `config/`: YAML-based inference prompts and model parameters.
* `deploy/`: **(NEW)** Infrastructure-as-Code scripts for cloud provisioning and launching.
* `docs/`: **(NEW)** detailed guides for cloud setup and git operations.
* `src/`: Backend logic focused strictly on evaluation tasks.
* `static/`: High-density UI assets for the player and timeline.
* `data/playground/`: Local persistence for inference sessions and extracted frames.
* `models/`: Cache directory for local Hugging Face model weights.

## 7. Development Notice

This is a decoupled application. Logic related to human-in-the-loop editing, dataset manufacturing, and stratified exports has been removed to prioritize speed and portability for model testing.
