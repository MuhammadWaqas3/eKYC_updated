import { supabase } from './supabase';

export async function fetchWithAuth(url: string, options: RequestInit = {}) {
    const { data: sessionData } = await supabase.auth.getSession();
    let token = sessionData.session?.access_token;

    // Proactively refresh if token expires in less than 60 seconds
    if (token && sessionData.session?.expires_at) {
        const expiresAtMs = sessionData.session.expires_at * 1000;
        if (expiresAtMs < Date.now() + 60000) {
            const { data, error } = await supabase.auth.refreshSession();
            if (!error && data.session) {
                token = data.session.access_token;
            }
        }
    }

    const headers = new Headers(options.headers || {});

    // Always set Content-Type if not explicitly bypassed
    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
        headers.set('Content-Type', 'application/json');
    }

    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    // Initial fetch
    let response = await fetch(url, { ...options, headers });

    // Retry logic on 401 Unauthorized
    if (response.status === 401 && token) {
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();

        if (!refreshError && refreshData.session) {
            const newHeaders = new Headers(headers);
            newHeaders.set('Authorization', `Bearer ${refreshData.session.access_token}`);

            // Retry the request once with the new token
            response = await fetch(url, { ...options, headers: newHeaders });
        }
    }

    return response;
}
