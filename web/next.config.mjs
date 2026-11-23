/** @type {import('next').NextConfig} */

// Baseline security headers on every response. CSP is limited to frame-ancestors for now
// (full script/style CSP is a later task); X-Frame-Options covers older browsers.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
];

const nextConfig = {
  // This app renders every product photo with a plain <img> (never next/image), so the Image
  // Optimization endpoint (/_next/image) serves no purpose here. Disabling it closes that endpoint
  // entirely — the attack surface of the CVE-2025 _next/image SVG RCE — and SVG is refused regardless.
  images: {
    unoptimized: true,
    dangerouslyAllowSVG: false,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
