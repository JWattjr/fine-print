import type {NextConfig} from 'next';
const config:NextConfig={reactStrictMode:true,devIndicators:false,distDir:process.env.FP_NEXT_DIST_DIR||'.next',experimental:{cpus:1}};
export default config;
