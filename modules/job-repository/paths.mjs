import path from 'node:path';

export function jobRepositoryDirectory(env = process.env) {
  const base = env.LOCALAPPDATA ?? env.TEMP ?? process.cwd();
  return path.join(base, 'QiuzhaoRecruitmentAgent', 'job-data');
}

export function jobRepositoryPath(env = process.env) {
  return path.join(jobRepositoryDirectory(env), 'jobs-v1.json');
}
