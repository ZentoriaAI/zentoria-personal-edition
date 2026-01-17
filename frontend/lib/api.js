/**
 * Zentoria API Client
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://192.168.220.242/api';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || '';

/**
 * Make authenticated API request
 */
export async function apiRequest(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;

  const headers = {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.error?.message || error.message || 'API request failed');
  }

  return response.json();
}

/**
 * Send chat command
 */
export async function sendChatCommand(command, options = {}) {
  return apiRequest('/v1/mcp/command', {
    method: 'POST',
    body: JSON.stringify({
      command,
      ...options,
    }),
  });
}

/**
 * Get API health status
 */
export async function getHealthStatus() {
  return apiRequest('/v1/health');
}

/**
 * List files
 */
export async function listFiles() {
  return apiRequest('/v1/mcp/files');
}

/**
 * Upload file
 */
export async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);

  const url = `${API_URL}/v1/mcp/upload`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-API-Key': API_KEY,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Upload failed' }));
    throw new Error(error.error?.message || 'File upload failed');
  }

  return response.json();
}
