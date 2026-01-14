/**
 * Service.js
 * Playground API Service.
 * Pure network layer for communicating with evaluation endpoints.
 * This module encapsulates all Playground-specific asynchronous logic.
 */

import { api } from '../../lib/api_client.js';

// --- SESSION MANAGEMENT ---

/**
 * Fetches the list of archived inference sessions from the server.
 * @returns {Promise<Array>} List of session metadata objects.
 */
export async function fetchSessions() {
    return await api.get('/api/playground/sessions');
}

/**
 * Permanently deletes a session and its associated frame data from the server.
 * @param {string} sessionId 
 */
export async function deleteSessionApi(sessionId) {
    return await api.delete(`/api/playground/session/${sessionId}`);
}

/**
 * Retrieves the full state.json (shots + metadata) for a specific session.
 * @param {string} sessionId 
 * @returns {Promise<Object>} The session state object.
 */
export async function fetchSessionData(sessionId) {
    return await api.get(`/api/playground/session/${sessionId}`);
}

/**
 * Retrieves procedural execution logs and raw VLM outputs for forensic analysis.
 * @param {string} sessionId 
 * @returns {Promise<Object>} Object containing 'pipeline' text and 'debug' JSONL entries.
 */
export async function fetchSessionLogs(sessionId) {
    return await api.get(`/api/playground/session/${sessionId}/logs`);
}


// --- INFERENCE PIPELINE ---

/**
 * Initiates the multimodal inference task for an uploaded video.
 * @param {FormData} formData - Contains the video file and configuration parameters.
 * @returns {Promise<Object>} Contains task_id and session_id.
 */
export async function triggerInferenceApi(formData) {
    return await api.post('/api/playground/inference', formData);
}

/**
 * Signals the server to gracefully stop a running task.
 * @param {string} taskId
 * @returns {Promise<Object>} Confirmation status.
 */
export async function abortTaskApi(taskId) {
    return await api.post(`/api/playground/abort/${taskId}`);
}

/**
 * Polls the global task registry for the current status of an inference job.
 * @param {string} taskId 
 * @returns {Promise<Object>} Current task state, step, and real-time logs.
 */
export async function pollTaskStatus(taskId) {
    return await api.get(`/status/${taskId}`);
}


// --- ASSET MANAGEMENT (MODELS & ADAPTERS) ---

/**
 * Fetches the dynamic list of available VLM models (cloud + local).
 * @returns {Promise<Object>} Object with 'cloud' and 'local' model lists.
 */
export async function fetchModels() {
    return await api.get('/api/playground/models/list');
}

/**
 * Fetches the dynamic list of locally installed LoRA adapters.
 * @returns {Promise<Array<Object>>} List of adapter metadata objects.
 */
export async function fetchAdapters() {
    return await api.get('/api/playground/adapters/list');
}

/**
 * Triggers a background task to download a Hugging Face model.
 * @param {string} modelId - The Hugging Face repo ID (e.g., 'org/model').
 * @returns {Promise<Object>} Contains task_id.
 */
export async function importModel(modelId) {
    return await api.post('/api/playground/models/import', { model_id: modelId });
}

/**
 * Uploads a zip file containing a LoRA adapter for extraction.
 * @param {FormData} formData - Contains the 'file' input.
 * @returns {Promise<Object>} Status and adapter ID.
 */
export async function uploadAdapter(formData) {
    return await api.post('/api/playground/adapters/upload', formData);
}

/**
 * Deletes a local model checkpoint from the server.
 * @param {string} modelId - The Hugging Face repo ID.
 */
export async function deleteModelApi(modelId) {
    return await api.post('/api/playground/models/delete', { id: modelId });
}

/**
 * Deletes a local adapter from the server.
 * @param {string} adapterId - The folder name of the adapter.
 */
export async function deleteAdapterApi(adapterId) {
    return await api.post('/api/playground/adapters/delete', { id: adapterId });
}