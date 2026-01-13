# 📘 Git Operations Standard: Version Control & GitHub Integration
**Project:** Scene Detection Sandbox
**Level:** DevOps Core Competency

---

This document provides the standard operational procedure for versioning your code and synchronizing it with a remote GitHub repository.

## Phase 1: Identity Configuration
Identify yourself to Git. This information is attached to every commit you make.
```bash
git config --global user.name "Your Name"
git config --global user.email "your_email@example.com"
```

## Phase 2: Initializing the Local Repository
1.  Navigate to your project root: `cd path/to/scene_detection_sandbox`
2.  Initialize Git: 
    ```bash
    git init
    ```
3.  Create a `.gitignore` file to exclude secrets and large files from version control.

## Phase 3: Committing Changes (The Save Point)
1.  **Stage your files** (Tell Git which files to include in the save):
    ```bash
    git add .
    ```
2.  **Commit the changes** (Create the snapshot with a descriptive message):
    ```bash
    git commit -m "feat: implement cloud deployment layer"
    ```

## Phase 4: Authentication with Personal Access Tokens (PAT)
GitHub requires tokens for command-line access, not passwords.

1.  **Generate a Token:** Go to GitHub.com → Settings → Developer Settings → Personal access tokens → **Tokens (classic)**.
2.  Click **Generate new token (classic)**.
3.  Select the **`repo`** scope.
4.  **Copy the token immediately.** You will not see it again.

## Phase 5: Pushing to GitHub
1.  Create a new, empty repository on GitHub.com.
2.  Link your local repository to the remote one:
    ```bash
    git remote add origin https://github.com/dvasc/scene_detection_sandbox.git
    ```
    ```bash
    git remote -v
    ```
3.  Rename your primary branch to `main`:
    ```bash
    git branch -M main
    ```
4.  Push your code. The terminal will prompt for your username and password.
    *   **Username:** Your GitHub username
    *   **Password:** **Paste your Personal Access Token**
    ```bash
    git push -u origin main
    ```

## Phase 6: Daily Workflow
Your daily routine is:
1.  **Add:** `git add .`
2.  **Commit:** `git commit -m "description of your work"`
3.  **Push:** `git push`

## Phase 7: Troubleshooting Authentication

*   **Problem:** `remote: Permission to <user>/repo.git denied to <other_user>.`
    *   **Cause:** Your operating system has cached old, incorrect credentials for GitHub.
    *   **Solution (Windows):**
        1.  Open the **Credential Manager** from the Start Menu.
        2.  Go to **Windows Credentials**.
        3.  Find the entry named `git:https://github.com`.
        4.  Click **Remove**.
        5.  Re-run `git push`. You will be prompted for the correct username and PAT.
    *   **Solution (macOS):**
        1.  Open the **Keychain Access** application.
        2.  Search for a "Kind" of "internet password" with the name "github.com".
        3.  Delete the entry.
        4.  Re-run `git push`.
