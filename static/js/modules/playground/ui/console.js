/**
 * Console UI Module
 * Handles the terminal simulation, logging, and progress bars.
 */

let lastRenderedLogCount = 0;

export function clearConsole() {
    lastRenderedLogCount = 0;
    const consoleEl = document.getElementById('consoleLog');
    if (consoleEl) consoleEl.innerHTML = '';
}

export function updateProgressBar(pct) {
    const progressBar = document.getElementById('progressBar');
    if (progressBar) progressBar.style.width = `${pct}%`;
}

/**
 * Hierarchical Terminal Renderer.
 */
export function logConsole(content, isSuccess = false, isError = false) {
    const consoleEl = document.getElementById('consoleLog');
    if (!consoleEl) return;

    if (Array.isArray(content)) {
        const newLines = content.slice(lastRenderedLogCount);
        if (newLines.length === 0) return;

        newLines.forEach(line => renderStyledLine(consoleEl, line));
        lastRenderedLogCount = content.length;
    }
    else {
        const hasLevelTag = /\[(CLIENT|PIPELINE|SHOT_DETECT|VLM|TOKEN|PROMPT|ERROR)\]/.test(content);
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        const finalLine = hasLevelTag
            ? `[${timestamp}] ${content}`
            : `[${timestamp}] [CLIENT] ${content}`;

        renderStyledLine(consoleEl, finalLine, isSuccess, isError);
    }

    consoleEl.scrollTop = consoleEl.scrollHeight;
}

function renderStyledLine(container, rawLine, forceSuccess = false, forceError = false) {
    // 1. Prepare Styles
    let styled = rawLine.replace(/\[(\d{2}:\d{2}:\d{2})\]/g, '<span class="ts">[$1]</span>');

    const levelColors = {
        'CLIENT': 'var(--accent)',
        'PIPELINE': '#818cf8',
        'SHOT_DETECT': '#10b981',
        'PROMPT': '#fbbf24',
        'VLM': '#a78bfa',
        'TOKEN': '#22d3ee',
        'ERROR': 'var(--break-border)'
    };

    Object.entries(levelColors).forEach(([level, color]) => {
        const regex = new RegExp(`\\[${level}\\]`, 'g');
        styled = styled.replace(regex, `<span style="color:${color}; font-weight:900;">[${level}]</span>`);
    });

    styled = styled.replace(/→/g, '<span style="color:var(--accent); font-weight:bold;">→</span>');
    styled = styled.replace(/✓/g, '<span style="color:var(--success); font-weight:bold;">✓</span>');
    styled = styled.replace(/🎬/g, '<span style="filter: drop-shadow(0 0 2px var(--accent))">🎬</span>');

    // 2. Intelligence: Update In-Place Logic

    // A. Token Streaming
    const isTokenUpdate = rawLine.includes('[TOKEN]') && rawLine.includes('Thinking...');

    // B. Shot Detection Scanning
    const isShotUpdate = rawLine.includes('[SHOT_DETECT]') && rawLine.includes('Boundary detection at frame');

    if (isTokenUpdate || isShotUpdate) {
        const lastLine = container.lastElementChild;
        if (lastLine) {
            const lastText = lastLine.textContent;

            // Check signature match for Token update
            if (isTokenUpdate && lastText.includes('[TOKEN]') && lastText.includes('Thinking...')) {
                lastLine.innerHTML = styled;
                return;
            }

            // Check signature match for Shot update
            if (isShotUpdate && lastText.includes('[SHOT_DETECT]') && lastText.includes('Boundary detection at frame')) {
                lastLine.innerHTML = styled;
                return;
            }
        }
    }

    // 3. Standard Append
    const div = document.createElement('div');
    div.className = 'log-line';

    if (forceSuccess || styled.includes('COMPLETE') || styled.includes('Inference Complete') || styled.includes('✓')) {
        div.style.color = 'var(--success)';
    }
    if (forceError || styled.includes('[ERROR]') || styled.includes('FAILURE')) {
        div.style.color = 'var(--break-border)';
    }

    div.innerHTML = styled;
    container.appendChild(div);
}