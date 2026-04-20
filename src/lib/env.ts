const REQUIRED_VARS = [
  'DISCOURSE_URL',
  'DISCOURSE_API_KEY',
  'DISCOURSE_CONNECT_SECRET',
  'SESSION_SECRET',
] as const;

export function validateEnv() {
  const missing = REQUIRED_VARS.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(
      `缺少必需的环境变量: ${missing.join(', ')}\n复制 .env.example 为 .env.local 并填写所有值。`,
    );
  }
}
