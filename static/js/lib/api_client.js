/**
 * ApiClient.js
 * Centralized wrapper for HTTP requests.
 * Handles headers, error parsing, and common configuration.
 */

class ApiClient {
    constructor(baseUrl = '') {
        this.baseUrl = baseUrl;
    }

    /**
     * Generic fetch wrapper.
     * @param {string} endpoint - The API endpoint.
     * @param {object} options - Fetch options.
     * @returns {Promise<any>} - The JSON response.
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;

        const defaultHeaders = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        const config = {
            ...options,
            headers: {
                ...defaultHeaders,
                ...options.headers
            }
        };

        // Don't set Content-Type for FormData (let browser handle boundary automatically)
        if (options.body instanceof FormData) {
            delete config.headers['Content-Type'];
        }

        try {
            const response = await fetch(url, config);

            if (!response.ok) {
                // Attempt to parse error message from JSON body, fallback to status text
                const errorBody = await response.json().catch(() => ({}));
                const errorMessage = errorBody.error || errorBody.message || response.statusText;
                throw new Error(errorMessage);
            }

            // Return empty object for 204 No Content, otherwise parse JSON
            if (response.status === 204) return {};
            return await response.json();

        } catch (error) {
            console.error(`[API Client] Request failed for ${endpoint}:`, error);
            throw error;
        }
    }

    get(endpoint, headers = {}) {
        return this.request(endpoint, { method: 'GET', headers });
    }

    post(endpoint, body, headers = {}) {
        const isFormData = body instanceof FormData;
        return this.request(endpoint, {
            method: 'POST',
            headers,
            body: isFormData ? body : JSON.stringify(body)
        });
    }

    put(endpoint, body, headers = {}) {
        return this.request(endpoint, {
            method: 'PUT',
            headers,
            body: JSON.stringify(body)
        });
    }

    delete(endpoint, headers = {}) {
        return this.request(endpoint, { method: 'DELETE', headers });
    }
}

export const api = new ApiClient();