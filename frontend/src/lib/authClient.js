import axios from "axios";

export const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

axios.defaults.withCredentials = true;

let csrfReady;
let csrfToken = null;
export function ensureCsrf() {
  if (!csrfReady) {
    csrfReady = axios.get(`${API}/auth/csrf`).then((response) => {
      csrfToken = response.data.csrfToken;
      return response;
    }).catch((error) => {
      csrfReady = null;
      csrfToken = null;
      throw error;
    });
  }
  return csrfReady;
}

export async function getSessionUser() {
  return (await axios.get(`${API}/auth/me`)).data;
}

axios.interceptors.request.use((config) => {
  if (["post", "put", "patch", "delete"].includes((config.method || "get").toLowerCase()) && csrfToken) {
    if (config.headers?.set) config.headers.set("X-CSRF-Token", csrfToken);
    else config.headers["X-CSRF-Token"] = csrfToken;
  }
  return config;
});

axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const requestUrl = error.config?.url || "";
    if (error.response?.status === 403 && error.response?.data?.detail === "CSRF validation failed" && error.config && !error.config._csrfRetried) {
      csrfReady = null;
      csrfToken = null;
      await ensureCsrf();
      error.config._csrfRetried = true;
      return axios(error.config);
    }
    if (error.response?.status === 401 && !requestUrl.includes("/auth/login") && !requestUrl.includes("/auth/register")) {
      window.dispatchEvent(new CustomEvent("hospot:session-expired"));
    }
    return Promise.reject(error);
  }
);
