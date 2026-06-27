/** @type {import('next').NextConfig} */

// CSP: allow self + the data providers we call from the browser/server and
// Google Fonts. connect-src includes RPC + API hosts. No inline scripts except
// what Next needs; 'unsafe-inline' for styles is required by Tailwind/Next.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https: blob:",
  "connect-src 'self' https://*.g.alchemy.com https://api.opensea.io https://api.etherscan.io https://*.llamarpc.com https://*.publicnode.com https://rpc.ankr.com https://*.base.org https://*.arbitrum.io https://*.optimism.io https://polygon-rpc.com https://cloudflare-eth.com https://fonts.googleapis.com https://fonts.gstatic.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  poweredByHeader: false,
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      ],
    }];
  },
};
export default nextConfig;
