const API_BASE =
  window.location.hostname === "localhost"
    ? "http://localhost:4000"
    : "https://your-live-backend.com"; // change this when you go live

export default API_BASE;
